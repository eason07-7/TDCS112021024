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
 *   - MSCK REPAIR: M3 — Athena StartQueryExecution after PutObject, polled to SUCCEEDED
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
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
} from '@aws-sdk/client-athena';
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
const athena = new AthenaClient({ region: REGION });

// ── Athena MSCK REPAIR config (PLAN_E9 M3) ────────────────────────────────────
// Glue/Athena resources fixed by infra/terraform (glue.tf + athena.tf):
const REPAIR_DATABASE = 'tdcs_dl';
const REPAIR_TABLE = 'cleaned_v2_skeleton';
const REPAIR_WORKGROUP = 'tdcs-dl-wg';

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

/**
 * Thrown by repairPartitions when REPAIR fails after a query was started, so the
 * handler can still record the QueryExecutionId (debug: find it in Athena console).
 */
class MsckRepairError extends Error {
  constructor(message: string, readonly queryExecutionId: string | undefined) {
    super(message);
    this.name = 'MsckRepairError';
  }
}

/**
 * Run `MSCK REPAIR TABLE` on the cleaned_v2 table via Athena so Glue discovers
 * the freshly-written `yyyymm=` partition, then poll until the query finishes.
 *
 * Why we poll (not fire-and-forget): the query layer (PLAN_E10 `tdcs-dl query`)
 * must be able to SELECT the just-written partition the moment /clean reports
 * `done`. Returning before REPAIR SUCCEEDED would let a query miss the new month.
 *
 * Fail paths (all surfaced as throws → handler marks the job status=error):
 *   - Athena returns no QueryExecutionId
 *   - state FAILED / CANCELLED (includes Athena's StateChangeReason + queryId)
 *   - timeout after REPAIR_MAX_POLLS × REPAIR_POLL_INTERVAL_MS
 *
 * @returns the QueryExecutionId (also stored in the job record for debugging).
 */
async function repairPartitions(client: AthenaClient): Promise<string> {
  // A single-month REPAIR adds 1 partition and typically finishes in < 10 s.
  // Budget 60 s (30 polls × 2 s) ≈ 6x buffer for Athena cold queue. Read at
  // call-time + env-overridable so unit tests can drain the poll loop instantly.
  const intervalMs = Number(process.env.ATHENA_POLL_INTERVAL_MS ?? 2000);
  const maxPolls = Number(process.env.ATHENA_MAX_POLLS ?? 30);

  const start = await client.send(new StartQueryExecutionCommand({
    QueryString: `MSCK REPAIR TABLE ${REPAIR_DATABASE}.${REPAIR_TABLE}`,
    WorkGroup: REPAIR_WORKGROUP,
    QueryExecutionContext: { Database: REPAIR_DATABASE },
  }));

  const queryId = start.QueryExecutionId;
  if (!queryId) {
    throw new Error('MSCK REPAIR: Athena did not return a QueryExecutionId');
  }

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const status = await client.send(new GetQueryExecutionCommand({
      QueryExecutionId: queryId,
    }));
    const state = status.QueryExecution?.Status?.State;
    if (state === 'SUCCEEDED') return queryId;
    if (state === 'FAILED' || state === 'CANCELLED') {
      const reason = status.QueryExecution?.Status?.StateChangeReason ?? 'no reason given';
      throw new MsckRepairError(`MSCK REPAIR ${state}: ${reason} (queryId=${queryId})`, queryId);
    }
    // QUEUED / RUNNING → keep polling
  }

  const budgetSec = (maxPolls * intervalMs) / 1000;
  throw new MsckRepairError(`MSCK REPAIR timeout after ${budgetSec}s (queryId=${queryId})`, queryId);
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

    // Set once REPAIR runs (M3); included in both the done and error job records.
    let queryExecutionId: string | undefined;

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

      // ── 6. Athena MSCK REPAIR → Glue discovers the new yyyymm partition ──
      // Must finish before we report `done` so PLAN_E10 queries see this month.
      queryExecutionId = await repairPartitions(athena);

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
        query_execution_id: queryExecutionId,
      });

      return jsonResponse(200, {
        job_id: jobId,
        status: 'done',
        rowCount,
        parquetKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // If REPAIR failed, recover its queryId for the record (it threw before
      // the `queryExecutionId = await ...` assignment could complete).
      if (e instanceof MsckRepairError) queryExecutionId = e.queryExecutionId;
      await putJobRecord(jobId, {
        job_id: jobId,
        status: 'error',
        timestamp: new Date().toISOString(),
        year, month, gantries, yyyymm,
        error: msg,
        // set if MSCK REPAIR was the failing step; undefined for earlier failures
        query_execution_id: queryExecutionId,
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
