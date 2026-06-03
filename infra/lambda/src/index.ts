/**
 * PLAN_E9 M1 — Lambda handler with true TDCS cleaning
 *
 * Routes:
 *   POST /clean   → list S3 raw CSV.gz → stream gunzip → clean → polars Parquet → write S3
 *   GET /jobs/{id} → read jobs/<id>.json, return status
 *
 * Design (PLAN_E9 D1-D3):
 *   - tdcs-clean.ts copied from cli/src/lib/ (same logic, md5 baseline target)
 *   - Streaming: one file at a time via /tmp/current.csv (no 22 GB /tmp load)
 *   - Parquet written via nodejs-polars (pre-installed in container)
 *   - MSCK REPAIR: TODO M3 (Athena StartQueryExecution after PutObject)
 *
 * F-H3 body size guard: body > 100 KB → 413 before JSON.parse
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as pl from 'nodejs-polars';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

import {
  readOneCsv,
  cleanRawDf,
  buildHourlyAggregation,
  mergeHourlyAccumulator,
  addWeekIndex,
} from './lib/tdcs-clean';
import type { HourlyRow } from './lib/tdcs-clean.types';
import { toParquetRows, toPartitionKey, partitionPrefix } from './lib/schema-mapping';

const BUCKET = process.env.BUCKET_NAME ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

const s3 = new S3Client({ region: REGION });

// ── helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function putJobRecord(jobId: string, payload: unknown): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `jobs/${jobId}.json`,
    Body: JSON.stringify(payload),
    ContentType: 'application/json',
  }));
}

async function getJobRecord(jobId: string): Promise<string | null> {
  try {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `jobs/${jobId}.json`,
    }));
    return await resp.Body?.transformToString() ?? null;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

/** Gunzip a Buffer using node:zlib. */
function gunzipBuffer(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const routeKey = event.routeKey ?? '';

  // POST /clean — true TDCS cleaning (PLAN_E9 M1)
  if (routeKey === 'POST /clean') {
    // F-H3 gate: reject oversized bodies before JSON.parse
    const MAX_BODY_BYTES = 100 * 1024; // 100 KB
    const rawBody = event.body ?? '';
    if (rawBody.length > MAX_BODY_BYTES) {
      return jsonResponse(413, {
        error: 'body too large',
        max: MAX_BODY_BYTES,
        received: rawBody.length,
      });
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody || '{}') as Record<string, unknown>;
    } catch {
      return jsonResponse(400, { error: 'invalid JSON body' });
    }

    // ── Resolve clean params ─────────────────────────────────────────────────
    // Mode A: body = { job_id } → read year/month/gantries from existing job record
    // Mode B: body = { job_id?, year, month, gantries } → use provided params directly
    let jobId = (body.job_id as string | undefined) ?? uuidv4();
    let year: number;
    let month: number;
    let gantries: string[];

    if (body.year !== undefined && body.month !== undefined && body.gantries !== undefined) {
      // Mode B: all params in body
      year = Number(body.year);
      month = Number(body.month);
      gantries = (body.gantries as string[]);
    } else if (body.job_id) {
      // Mode A: read from existing PLAN_E8 pull job record
      const existingJson = await getJobRecord(jobId);
      if (!existingJson) {
        return jsonResponse(404, { error: 'job not found, cannot resolve clean params', job_id: jobId });
      }
      const existing = JSON.parse(existingJson) as Record<string, unknown>;
      year = Number(existing.year);
      month = Number(existing.month);
      gantries = (existing.gantries as string[]) ?? [];
    } else {
      return jsonResponse(400, {
        error: 'body must contain job_id (Mode A) or year + month + gantries (Mode B)',
      });
    }

    if (!year || !month || !Array.isArray(gantries)) {
      return jsonResponse(400, { error: 'invalid year/month/gantries', year, month, gantries });
    }

    // Update job status → processing
    const yyyymm = toPartitionKey({ Year: year, Month: month });
    await putJobRecord(jobId, {
      job_id: jobId,
      status: 'processing',
      timestamp: new Date().toISOString(),
      year,
      month,
      gantries,
      yyyymm,
    });

    try {
      // ── 1. List S3 raw CSV.gz for this month ──────────────────────────────
      const rawPrefix = `raw/yyyymm=${yyyymm}/`;
      const listResp = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: rawPrefix,
      }));

      const keys = (listResp.Contents ?? [])
        .map(o => o.Key ?? '')
        .filter(k => k.endsWith('.csv.gz'));

      if (keys.length === 0) {
        return jsonResponse(404, {
          error: 'no raw csv.gz found for this month',
          prefix: rawPrefix,
          job_id: jobId,
        });
      }

      // ── 2. Streaming: each file GetObject → gunzip → /tmp → clean ─────────
      // D3: one file at a time, max /tmp usage = one file (not 22 GB total)
      let hourlyAcc: HourlyRow[] = [];
      let scannedFiles = 0;

      for (const key of keys) {
        let csvContent: string;
        try {
          const objResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
          const compressed = Buffer.from(
            await objResp.Body?.transformToByteArray() ?? new Uint8Array(),
          );
          const decompressed = await gunzipBuffer(compressed);
          csvContent = decompressed.toString('utf8');
        } catch (e) {
          // Single-file failure: log and continue (mirrors Python exception pass)
          if (e instanceof NoSuchKey) continue;
          process.stderr.write(`[clean] skip ${key}: ${e}\n`);
          continue;
        }

        // Write to OS tmp dir, parse, then immediately delete (keeps tmp to one file)
        // os.tmpdir() = /tmp on Lambda Linux, %TEMP% on Windows test env (cross-platform)
        const tmpPath = path.join(os.tmpdir(), `tdcs-${jobId}-current.csv`);
        try {
          fs.writeFileSync(tmpPath, csvContent, 'utf8');
          const rawRows = readOneCsv(tmpPath);
          const cleaned = cleanRawDf(rawRows, gantries, year, month);
          if (cleaned.length > 0) {
            const hourlyPart = buildHourlyAggregation(cleaned);
            hourlyAcc = mergeHourlyAccumulator(hourlyAcc, hourlyPart);
          }
          scannedFiles++;
        } finally {
          // Always clean up, even on error
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
      }

      if (hourlyAcc.length === 0) {
        await putJobRecord(jobId, {
          job_id: jobId,
          status: 'done',
          timestamp: new Date().toISOString(),
          year, month, gantries, yyyymm,
          scannedFiles,
          rowCount: 0,
          note: 'no matching rows after gantry filter',
        });
        return jsonResponse(200, { job_id: jobId, status: 'done', rowCount: 0 });
      }

      // ── 3. addWeekIndex + schema mapping ─────────────────────────────────
      const withWeek = addWeekIndex(hourlyAcc);
      const parquetRows = toParquetRows(withWeek);

      // ── 4. polars: readRecords → writeParquet ─────────────────────────────
      // Note: nodejs-polars exports `readRecords` (not `fromRecords` like Python polars).
      // Lead spot check 2026-06-04 caught this — sonnet's tsc/jest self-verify was skipped
      // because infra/lambda/node_modules was missing; future M*: npm install + tsc + jest first.
      const tmpParquet = path.join(os.tmpdir(), `cleaned-${jobId}.parquet`);
      const df = pl.readRecords(parquetRows);
      df.writeParquet(tmpParquet);

      // ── 5. PutObject → S3 cleaned_v2/yyyymm=YYYYMM/cleaned.parquet ───────
      const parquetBuf = fs.readFileSync(tmpParquet);
      try { fs.unlinkSync(tmpParquet); } catch { /* ignore */ }

      const parquetKey = `${partitionPrefix(yyyymm)}cleaned.parquet`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: parquetKey,
        Body: parquetBuf,
        ContentType: 'application/octet-stream',
        ContentLength: parquetBuf.length,
      }));

      // ── 6. TODO M3: Athena MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton ──
      // Implemented in PLAN_E9 M3. After PutObject, run:
      // await athena.send(new StartQueryExecutionCommand({
      //   QueryString: 'MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton',
      //   WorkGroup: 'tdcs-dl-wg',
      //   QueryExecutionContext: { Database: 'tdcs_dl' },
      // }));

      // ── 7. writeJobRecord status=done ────────────────────────────────────
      const rowCount = withWeek.length;
      await putJobRecord(jobId, {
        job_id: jobId,
        status: 'done',
        timestamp: new Date().toISOString(),
        year, month, gantries, yyyymm,
        scannedFiles,
        rowCount,
        parquetKey,
        parquetBytes: parquetBuf.length,
      });

      return jsonResponse(200, {
        job_id: jobId,
        status: 'done',
        rowCount,
        parquetKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await putJobRecord(jobId, {
        job_id: jobId,
        status: 'error',
        timestamp: new Date().toISOString(),
        year, month, gantries, yyyymm,
        error: msg,
      });
      return jsonResponse(500, { job_id: jobId, status: 'error', error: msg });
    }
  }

  // GET /jobs/{id} — read job progress (unchanged from PLAN_E7)
  if (routeKey === 'GET /jobs/{id}') {
    const jobId = event.pathParameters?.id ?? '';
    if (!jobId) {
      return jsonResponse(400, { error: 'missing job id' });
    }
    const content = await getJobRecord(jobId);
    if (content === null) {
      return jsonResponse(404, { error: 'job not found', id: jobId });
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: content,
    };
  }

  return jsonResponse(404, { error: 'unknown route', routeKey });
}
