/**
 * PLAN_E9 Lambda handler — async clean via SQS broker (M4.5)
 *
 * One Lambda, two entry shapes (dispatched by event type):
 *
 *   1. API Gateway (producer, fast < 1s):
 *      POST /clean   → validate + resolve params + enqueue SQS message → 202 {job_id}
 *      GET /jobs/{id} → read jobs/<id>.json
 *
 *   2. SQS event (consumer, the real 5-8 min work):
 *      → runCleanFlow: list raw → stream gunzip+clean → polars Parquet → S3
 *        → Athena MSCK REPAIR → write jobs/<id>.json status=done
 *
 * Why the split (opus_worker_2 finding, Lead+User ratified — see 實驗紀錄9 M4.5):
 *   API GW HTTP API integration timeout caps at 30s; a real month clean is minutes.
 *   So the POST must return immediately (202) and the work runs off the SQS queue.
 *   SQS gives managed retry + DLQ; chosen over self-invoke (no retry/DLQ) and
 *   CLI-direct-invoke (would leak AWS creds to clients, untenable for npm release).
 *
 * Job status machine: accepted (API GW) → processing (SQS start) → done | error.
 *
 * F-H3 body size guard: body > 100 KB → 413 before JSON.parse.
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
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as pl from 'nodejs-polars';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, SQSEvent } from 'aws-lambda';
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
const CLEAN_QUEUE_URL = process.env.CLEAN_QUEUE_URL ?? '';

const s3 = new S3Client({ region: REGION });
const athena = new AthenaClient({ region: REGION });
const sqs = new SQSClient({ region: REGION });

// ── Athena MSCK REPAIR config (PLAN_E9 M3) ────────────────────────────────────
// Glue/Athena resources fixed by infra/terraform (glue.tf + athena.tf):
const REPAIR_DATABASE = 'tdcs_dl';
const REPAIR_TABLE = 'cleaned_v2_skeleton';
const REPAIR_WORKGROUP = 'tdcs-dl-wg';

const MAX_BODY_BYTES = 100 * 1024; // F-H3: 100 KB POST body cap

// ── Parquet column dtypes (F-H5) ──────────────────────────────────────────────
// MUST mirror infra/terraform/glue.tf column types exactly. Without an explicit
// schema, pl.readRecords infers JS numbers as Float64 → Parquet writes DOUBLE →
// Athena rejects at read time (HIVE_BAD_DATA: DOUBLE incompatible with int defined
// in table schema; a SQL CAST cannot fix it — the error is in the Parquet reader).
// glue.tf: year/month/day/weekday/hour_0/vehicle_type/counts/week_index = int;
//          gantry_id_o = string. So 8 Int32 + 1 Utf8.
const PARQUET_SCHEMA: Record<string, pl.DataType> = {
  year: pl.Int32,
  month: pl.Int32,
  day: pl.Int32,
  weekday: pl.Int32,
  hour_0: pl.Int32,
  gantry_id_o: pl.Utf8,
  vehicle_type: pl.Int32,
  counts: pl.Int32,
  week_index: pl.Int32,
};

/** Fully-resolved clean params carried on the SQS message. */
interface CleanMessage {
  job_id: string;
  year: number;
  month: number;
  gantries: string[];
}

/** Fields runCleanFlow produces; handleSqsBatch merges these into the done record. */
interface CleanFlowResult {
  scannedFiles: number;
  rowCount: number;
  parquetKey?: string;
  parquetBytes?: number;
  query_execution_id?: string;
  note?: string;
}

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
 * must be able to SELECT the just-written partition the moment the job reports
 * `done`. Returning before REPAIR SUCCEEDED would let a query miss the new month.
 *
 * Fail paths (all surfaced as throws → job marked status=error):
 *   - Athena returns no QueryExecutionId
 *   - state FAILED / CANCELLED (includes Athena's StateChangeReason + queryId)
 *   - timeout after maxPolls × intervalMs
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

// ── core clean flow (SQS consumer work; no job-record writes here) ────────────

/**
 * The real cleaning work for one month. Pure compute + S3/Athena IO; does NOT
 * write job records (handleSqsBatch owns the accepted→processing→done lifecycle).
 *
 * Throws on no-raw-data / polars / MSCK failures so the caller records status=error.
 * Returns rowCount=0 + note (not an error) when raw exists but nothing matches the
 * gantry filter — that is a legitimate empty result, not a failure.
 */
async function runCleanFlow(
  jobId: string,
  year: number,
  month: number,
  gantries: string[],
): Promise<CleanFlowResult> {
  const yyyymm = toPartitionKey({ Year: year, Month: month });

  // ── 1. List S3 raw CSV.gz for this month ──────────────────────────────────
  const rawPrefix = `raw/yyyymm=${yyyymm}/`;
  const listResp = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: rawPrefix }));
  const keys = (listResp.Contents ?? []).map(o => o.Key ?? '').filter(k => k.endsWith('.csv.gz'));
  if (keys.length === 0) {
    throw new Error(`no raw csv.gz found for ${rawPrefix} (did you run 'tdcs-dl pull' first?)`);
  }

  // ── 2. Streaming: each file GetObject → gunzip → /tmp → clean ──────────────
  // D3: one file at a time, max /tmp usage = one file (not 22 GB total)
  let hourlyAcc: HourlyRow[] = [];
  let scannedFiles = 0;

  for (const key of keys) {
    let csvContent: string;
    try {
      const objResp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const compressed = Buffer.from(await objResp.Body?.transformToByteArray() ?? new Uint8Array());
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
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  if (hourlyAcc.length === 0) {
    return { scannedFiles, rowCount: 0, note: 'no matching rows after gantry filter' };
  }

  // ── 3. addWeekIndex + schema mapping ──────────────────────────────────────
  const withWeek = addWeekIndex(hourlyAcc);
  const parquetRows = toParquetRows(withWeek);

  // ── 4. polars: readRecords (with explicit INT schema, F-H5) → writeParquet ──
  // Note: nodejs-polars exports `readRecords` (not `fromRecords` like Python polars).
  // PARQUET_SCHEMA forces Int32 (not inferred Float64) so Athena's int columns match.
  const tmpParquet = path.join(os.tmpdir(), `cleaned-${jobId}.parquet`);
  const df = pl.readRecords(parquetRows, { schema: PARQUET_SCHEMA });
  df.writeParquet(tmpParquet);

  // ── 5. PutObject → S3 cleaned_v2/yyyymm=YYYYMM/cleaned.parquet ─────────────
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

  // ── 6. Athena MSCK REPAIR → Glue discovers the new yyyymm partition ───────
  const queryExecutionId = await repairPartitions(athena);

  return {
    scannedFiles,
    rowCount: withWeek.length,
    parquetKey,
    parquetBytes: parquetBuf.length,
    query_execution_id: queryExecutionId,
  };
}

// ── SQS consumer entry ────────────────────────────────────────────────────────

/**
 * Consume clean-job messages (batch_size=1 → one record). Writes processing →
 * done, or error on failure. Re-throws so SQS redelivers (maxReceiveCount=2)
 * and ultimately routes to the DLQ.
 */
async function handleSqsBatch(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const msg = JSON.parse(record.body) as Partial<CleanMessage>;
    const jobId = msg.job_id;
    if (!jobId) {
      // Unprocessable message — don't retry forever; log and drop.
      process.stderr.write(`[sqs] message missing job_id, dropping: ${record.body}\n`);
      continue;
    }
    const year = Number(msg.year);
    const month = Number(msg.month);
    const gantries = Array.isArray(msg.gantries) ? msg.gantries : [];
    const yyyymm = toPartitionKey({ Year: year, Month: month });

    await putJobRecord(jobId, {
      job_id: jobId, status: 'processing', timestamp: new Date().toISOString(),
      year, month, gantries, yyyymm,
    });

    try {
      const result = await runCleanFlow(jobId, year, month, gantries);
      await putJobRecord(jobId, {
        job_id: jobId, status: 'done', timestamp: new Date().toISOString(),
        year, month, gantries, yyyymm, ...result,
      });
    } catch (e) {
      const msgText = e instanceof Error ? e.message : String(e);
      // Recover the failed REPAIR's queryId for the record (it threw mid-flow).
      const queryExecutionId = e instanceof MsckRepairError ? e.queryExecutionId : undefined;
      await putJobRecord(jobId, {
        job_id: jobId, status: 'error', timestamp: new Date().toISOString(),
        year, month, gantries, yyyymm, error: msgText, query_execution_id: queryExecutionId,
      });
      // Re-throw → SQS redelivers (retry) then routes to DLQ after maxReceiveCount.
      throw e;
    }
  }
}

// ── API Gateway producer entry ─────────────────────────────────────────────────

/**
 * POST /clean (fast accept + enqueue) and GET /jobs/{id} (read progress).
 * POST resolves params (Mode A reads the prior pull job; Mode B uses the body),
 * writes status=accepted, enqueues an SQS message, returns 202. No clean work here.
 */
async function handleApiGwRequest(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const routeKey = event.routeKey ?? '';

  if (routeKey === 'POST /clean') {
    // F-H3 gate: reject oversized bodies before JSON.parse
    const rawBody = event.body ?? '';
    if (rawBody.length > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: 'body too large', max: MAX_BODY_BYTES, received: rawBody.length });
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody || '{}') as Record<string, unknown>;
    } catch {
      return jsonResponse(400, { error: 'invalid JSON body' });
    }

    // ── Resolve clean params (Mode A: from prior job record / Mode B: from body) ──
    const jobId = (body.job_id as string | undefined) ?? uuidv4();
    let year: number;
    let month: number;
    let gantries: string[];

    if (body.year !== undefined && body.month !== undefined && body.gantries !== undefined) {
      year = Number(body.year);
      month = Number(body.month);
      gantries = body.gantries as string[];
    } else if (body.job_id) {
      const existingJson = await getJobRecord(jobId);
      if (!existingJson) {
        return jsonResponse(404, { error: 'job not found, cannot resolve clean params', job_id: jobId });
      }
      const existing = JSON.parse(existingJson) as Record<string, unknown>;
      year = Number(existing.year);
      month = Number(existing.month);
      gantries = (existing.gantries as string[]) ?? [];
    } else {
      return jsonResponse(400, { error: 'body must contain job_id (Mode A) or year + month + gantries (Mode B)' });
    }

    if (!year || !month || !Array.isArray(gantries) || gantries.length === 0) {
      return jsonResponse(400, { error: 'invalid year/month/gantries', year, month, gantries });
    }

    const yyyymm = toPartitionKey({ Year: year, Month: month });

    // ── Accept + enqueue (the actual clean runs on the SQS consumer) ──────────
    try {
      await putJobRecord(jobId, {
        job_id: jobId, status: 'accepted', timestamp: new Date().toISOString(),
        year, month, gantries, yyyymm,
      });
      const message: CleanMessage = { job_id: jobId, year, month, gantries };
      await sqs.send(new SendMessageCommand({
        QueueUrl: CLEAN_QUEUE_URL,
        MessageBody: JSON.stringify(message),
      }));
      return jsonResponse(202, { job_id: jobId, status: 'accepted' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await putJobRecord(jobId, {
        job_id: jobId, status: 'error', timestamp: new Date().toISOString(),
        year, month, gantries, yyyymm, error: `enqueue failed: ${msg}`,
      });
      return jsonResponse(500, { job_id: jobId, status: 'error', error: msg });
    }
  }

  if (routeKey === 'GET /jobs/{id}') {
    const jobId = event.pathParameters?.id ?? '';
    if (!jobId) {
      return jsonResponse(400, { error: 'missing job id' });
    }
    const content = await getJobRecord(jobId);
    if (content === null) {
      return jsonResponse(404, { error: 'job not found', id: jobId });
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: content };
  }

  return jsonResponse(404, { error: 'unknown route', routeKey });
}

// ── dispatch ────────────────────────────────────────────────────────────────

/** True when invoked by the SQS event source mapping (vs API Gateway). */
function isSqsEvent(event: APIGatewayProxyEventV2 | SQSEvent): event is SQSEvent {
  const records = (event as SQSEvent).Records;
  return Array.isArray(records) && records[0]?.eventSource === 'aws:sqs';
}

export async function handler(
  event: APIGatewayProxyEventV2 | SQSEvent,
): Promise<APIGatewayProxyResultV2 | void> {
  if (isSqsEvent(event)) {
    await handleSqsBatch(event);
    return;
  }
  return handleApiGwRequest(event);
}
