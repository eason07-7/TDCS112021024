/**
 * S3 upload lib — TS translation of upload_month_gz.py
 *
 * Source reference (唯讀，不改):
 *   D:\p\112021134\upload_month_gz.py
 *
 * Key behaviors mirrored from Python:
 *   - In-memory gzip (streaming, 256KB chunks) before upload
 *   - head_object size check: skip if already uploaded with same gzip size
 *   - ContentType="text/csv", ContentEncoding="gzip"
 *   - Concurrent uploads (Python WORKERS=8; PLAN_E8 spec concurrency=5)
 *
 * S3 path design:
 *   Python: {month_key}/{fname}.gz  (flat, e.g. "202603/TDCS_M06A_...csv.gz")
 *   TS (PLAN_E8 spec): raw/yyyymm=<YYYYMM>/<fname>.csv.gz
 *   New format aligns with PLAN_E7 M2 raw/ prefix marker + Glue partition discovery.
 */
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import * as zlib from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  UploadFileResult,
  UploadMonthResult,
  UploadOptions,
  UploadProgressCallback,
} from './s3-upload.types';

// -----------------------------------------------------------------------
// S3 key builder
// -----------------------------------------------------------------------

/**
 * Build S3 key for a TDCS CSV file.
 *
 * Format: `{prefix}/yyyymm=<YYYYMM>/<fileName>.csv.gz`
 *
 * Examples:
 *   buildS3Key(2026, 3, 'TDCS_M06A_20260301_000000.csv')
 *   → 'raw/yyyymm=202603/TDCS_M06A_20260301_000000.csv.gz'
 *
 * Note: Python uses flat `202603/{fname}.gz`; this format adds the `raw/` prefix
 * from PLAN_E7 M2 marker + `yyyymm=` Hive partition for Glue compatibility.
 */
export function buildS3Key(
  year: number,
  month: number,
  fileName: string,
  prefix = 'raw',
): string {
  const yyyymm = `${year}${String(month).padStart(2, '0')}`;
  // Strip trailing .csv if present and always append .csv.gz
  const base = fileName.endsWith('.csv') ? fileName.slice(0, -4) : fileName;
  return `${prefix}/yyyymm=${yyyymm}/${base}.csv.gz`;
}

// -----------------------------------------------------------------------
// gzipFile
// -----------------------------------------------------------------------

/**
 * Gzip-compress a local file and return the compressed Buffer.
 *
 * Mirrors `_compress_to_bytes()` in upload_month_gz.py:
 *   - Reads file in 256KB chunks through a GzipFile stream.
 *   - Result stays in memory (single-file < 100 MB per PLAN_E11 note).
 */
export function gzipFile(localPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const src = fs.createReadStream(localPath, { highWaterMark: 256 * 1024 });
    const gz = zlib.createGzip();

    gz.on('data', (chunk: Buffer) => chunks.push(chunk));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    src.on('error', reject);

    src.pipe(gz);
  });
}

// -----------------------------------------------------------------------
// headObjectExists
// -----------------------------------------------------------------------

/**
 * Check whether an S3 object exists at `key`.
 *
 * Returns `false` on 404/NotFound; re-throws other errors (e.g., auth failure).
 * Mirrors the try/except ClientError with code {"404","NoSuchKey","NotFound"} in Python.
 */
export async function headObjectExists(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    // AWS SDK v3 throws a NotFound error (name='NotFound') or 404 for missing objects
    if (isNotFoundError(e)) return false;
    throw e;
  }
}

function isNotFoundError(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false;
  const err = e as Record<string, unknown>;
  const name = String(err['name'] ?? '');
  const code = String(err['Code'] ?? '');
  const httpStatus = (err['$metadata'] as Record<string, unknown> | undefined)?.[
    'httpStatusCode'
  ];
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    code === 'NoSuchKey' ||
    code === '404' ||
    httpStatus === 404
  );
}

// -----------------------------------------------------------------------
// uploadOneFile
// -----------------------------------------------------------------------

/**
 * Gzip-compress `localPath`, then PutObject to S3 at `key`.
 *
 * Skip logic (mirrors Python `_process_one` head_object size check):
 *   If `expectedGzSize` is provided and the existing object's ContentLength matches,
 *   the upload is skipped and `skipped=true` is returned.
 *
 * Retry: retries once on AWS SDK errors (network / 5xx) unless it's a 404 (no point
 * retrying missing resource).
 */
export async function uploadOneFile(
  client: S3Client,
  bucket: string,
  key: string,
  localPath: string,
  opts: UploadOptions = {},
): Promise<UploadFileResult> {
  const retries = opts.retries ?? 1;
  const contentType = opts.contentType ?? 'text/csv';

  let gzBuf: Buffer;
  try {
    gzBuf = await gzipFile(localPath);
  } catch (e) {
    return { ok: false, gzBytes: 0, skipped: false, error: `gzip failed: ${String(e)}` };
  }

  // Skip if already uploaded with same gzip size (Python: ContentLength == gz_size)
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (head.ContentLength === gzBuf.length) {
      return { ok: true, gzBytes: gzBuf.length, skipped: true };
    }
  } catch (e) {
    if (!isNotFoundError(e)) throw e; // unexpected error — re-throw
    // 404 → object doesn't exist → proceed with upload
  }

  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: gzBuf,
          ContentType: contentType,
          ContentEncoding: 'gzip',
          ContentLength: gzBuf.length,
        }),
      );
      return { ok: true, gzBytes: gzBuf.length, skipped: false };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, gzBytes: 0, skipped: false, error: lastError };
}

// -----------------------------------------------------------------------
// Concurrency helper (p-limit equivalent, no extra dependency)
// -----------------------------------------------------------------------

/**
 * Run `tasks` with at most `concurrency` active at once.
 * Returns results in the same order as `tasks`.
 */
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  const queue = tasks.map((fn, i) => ({ fn, i }));
  let qi = 0;

  async function worker(): Promise<void> {
    while (qi < queue.length) {
      const { fn, i } = queue[qi++];
      results[i] = await fn();
    }
  }

  const pool = Math.min(concurrency, tasks.length);
  if (pool <= 0) return results;
  await Promise.all(Array.from({ length: pool }, worker));
  return results;
}

// -----------------------------------------------------------------------
// uploadMonth
// -----------------------------------------------------------------------

/**
 * Upload all CSV files from `{localDir}/{yyyymm}/` to S3 with concurrent PutObject.
 *
 * Each CSV is gzip-compressed in memory then uploaded to:
 *   `raw/yyyymm=<YYYYMM>/<fileName>.csv.gz`
 *
 * @param localDir  Parent temp directory (the same `outDir` used by downloadMonth).
 */
export async function uploadMonth(
  client: S3Client,
  localDir: string,
  bucket: string,
  year: number,
  month: number,
  opts: UploadOptions = {},
  progressCb?: UploadProgressCallback,
): Promise<UploadMonthResult> {
  const yyyymm = `${year}${String(month).padStart(2, '0')}`;
  const monthDir = path.join(localDir, yyyymm);
  const concurrency = opts.concurrency ?? 5;

  // Collect CSV files sorted (mirrors Python `sorted(f for f in os.listdir ...)`)
  const csvFiles: string[] = fs.existsSync(monthDir)
    ? fs
        .readdirSync(monthDir)
        .filter((f) => f.toLowerCase().endsWith('.csv'))
        .sort()
    : [];

  const total = csvFiles.length;
  let done = 0;
  const errors: string[] = [];
  let totalRawBytes = 0;
  let totalGzBytes = 0;
  let uploaded = 0;
  let skipped = 0;

  const tasks = csvFiles.map((fileName) => async () => {
    const localPath = path.join(monthDir, fileName);
    const s3Key = buildS3Key(year, month, fileName);
    const rawBytes = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0;

    progressCb?.({ kind: 'file_start', fileName, rawBytes, total });

    const result = await uploadOneFile(client, bucket, s3Key, localPath, opts);

    done++;
    totalRawBytes += rawBytes;
    totalGzBytes += result.gzBytes;

    if (result.ok && result.skipped) {
      skipped++;
      progressCb?.({ kind: 'file_skip', fileName, rawBytes, gzBytes: result.gzBytes, done, total });
    } else if (result.ok) {
      uploaded++;
      progressCb?.({ kind: 'file_done', fileName, rawBytes, gzBytes: result.gzBytes, done, total });
    } else {
      errors.push(`${fileName}: ${result.error ?? 'unknown error'}`);
      progressCb?.({ kind: 'file_done', fileName, rawBytes, error: result.error, done, total });
    }
  });

  await runConcurrent(tasks, concurrency);

  progressCb?.({
    kind: 'month_done',
    done,
    total,
    gzBytes: totalGzBytes,
    rawBytes: totalRawBytes,
  });

  return { totalFiles: total, totalRawBytes, totalGzBytes, uploaded, skipped, errors };
}
