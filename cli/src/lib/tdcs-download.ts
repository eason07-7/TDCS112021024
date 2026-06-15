/**
 * TDCS M06A download lib — TS translation of download_only_2025.py + shared_m06a.py
 *
 * Source reference (唯讀，不改):
 *   D:\p\112021134\download_only_2025.py  — main orchestrator (tar.gz primary + hourly fallback)
 *   D:\p\112021134\tdcs_m06a_month_202603\shared_m06a.py — download_m06a_one_day (hourly loop)
 *
 * Two-strategy download (mirrors Python):
 *   1. Try daily tar.gz: TDCS_BASE/M06A_{YYYYMMDD}.tar.gz  (extracts 24 CSVs in one request)
 *   2. If tar.gz 404 → probe hourly endpoint availability → hourly CSV fallback
 *
 * TDCS raw data contains ALL gantries per time period.
 * Gantry filtering is done at clean stage (PLAN_E9), not here.
 */
import * as https from 'node:https';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import type {
  DownloadFileResult,
  DownloadOptions,
  DownloadMonthResult,
  DownloadProgressCallback,
} from './tdcs-download.types';

// -----------------------------------------------------------------------
// Constants (match Python defaults)
// -----------------------------------------------------------------------

export const TDCS_BASE = 'https://tisvcloud.freeway.gov.tw/history/TDCS/M06A/';
export const READY_MARKER = '_READY';
export const EXPECTED_DAILY_FILES = 24;

// -----------------------------------------------------------------------
// URL builders
// -----------------------------------------------------------------------

/**
 * Build hourly CSV URL for TDCS M06A.
 *
 * Pattern (from shared_m06a.py):
 *   {BASE}{YYYYMMDD}/{HH}/TDCS_M06A_{YYYYMMDD}_{HH}0000.csv
 *
 * Note: TDCS raw data is all-gantry per time slot; `_gantry` is accepted for
 * API-spec compatibility but is NOT used in URL construction.
 */
export function buildTdcsUrl(
  year: number,
  month: number,
  day: number,
  hour: number,
  _gantry?: string,
): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const yyyymmdd = `${year}${mm}${dd}`;
  return `${TDCS_BASE}${yyyymmdd}/${hh}/TDCS_M06A_${yyyymmdd}_${hh}0000.csv`;
}

/**
 * Build daily tar.gz URL for TDCS M06A.
 *
 * Pattern (from download_only_2025.py):
 *   {BASE}M06A_{YYYYMMDD}.tar.gz
 */
export function buildTdcsTarGzUrl(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const yyyymmdd = `${year}${mm}${dd}`;
  return `${TDCS_BASE}M06A_${yyyymmdd}.tar.gz`;
}

// -----------------------------------------------------------------------
// HTTP helpers
// -----------------------------------------------------------------------

interface RawResponse {
  statusCode: number;
  body: Buffer;
}

/**
 * Fetch URL as Buffer using node:https / node:http (no external deps).
 * Accepts both http: and https:; sets rejectUnauthorized=false for https
 * because TDCS uses a non-standard certificate (mirrors urllib3.disable_warnings).
 *
 * Uses AbortController for true connection-level timeout (not just socket idle).
 * Node.js 14.17+ required; CLI targets Node.js 18+.
 */
function requestRaw(reqUrl: string, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    function settle<T>(fn: (v: T) => void, val: T) {
      if (!settled) { settled = true; fn(val); }
    }

    // AbortController gives connection-level timeout (unlike socket idle timeout)
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`HTTP request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const parsed = new URL(reqUrl);
    const isHttps = parsed.protocol === 'https:';
    const client: typeof https | typeof http = isHttps ? https : http;

    const reqOptions: https.RequestOptions = {
      signal: controller.signal,
      ...(isHttps && { rejectUnauthorized: false }),
    };

    const req = client.request(reqUrl, reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        settle(resolve, {
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks),
        });
      });
      res.on('error', (e: Error) => { clearTimeout(timer); settle(reject, e); });
    });

    req.on('error', (e: Error) => { clearTimeout(timer); settle(reject, e); });
    req.end();
  });
}

// -----------------------------------------------------------------------
// downloadOneFile
// -----------------------------------------------------------------------

/**
 * Download a single URL to `outPath` with optional retry.
 *
 * - Creates parent directories if needed.
 * - On 5xx or network error, retries up to `opts.retries` times (default 1).
 * - Returns `ok: false` when all attempts fail.
 */
export async function downloadOneFile(
  fileUrl: string,
  outPath: string,
  opts: DownloadOptions = {},
): Promise<DownloadFileResult> {
  const retries = opts.retries ?? 1;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let lastError = '';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { statusCode, body } = await requestRaw(fileUrl, timeoutMs);
      if (statusCode >= 200 && statusCode < 300 && body.length > 0) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, body);
        return { ok: true, bytes: body.length };
      }
      lastError = `HTTP ${statusCode} (body=${body.length} bytes)`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, bytes: 0, error: lastError };
}

// -----------------------------------------------------------------------
// tar.gz extraction helpers (pure Node.js, no tar-stream dependency)
// -----------------------------------------------------------------------

function gunzipBuffer(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (err, result) => {
      if (err) reject(err); else resolve(result);
    });
  });
}

interface TarEntry {
  name: string;
  data: Buffer;
}

/**
 * Parse POSIX ustar tar archive.
 *
 * Header layout (512-byte blocks):
 *   0:   filename (100 bytes, null-terminated)
 *   124: size (12 bytes, octal string)
 *   156: type flag (0x30='0' or 0x00=regular file)
 *   345: prefix (155 bytes, null-terminated; prepended to name for long paths)
 */
function extractUstar(tarBuf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    // Two consecutive zero-filled 512-byte blocks signal end-of-archive
    if (header.every((b) => b === 0)) break;

    const nameRaw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = prefix.length > 0 ? `${prefix}/${nameRaw}` : nameRaw;

    const sizeStr = header
      .subarray(124, 136)
      .toString('ascii')
      .replace(/[^0-7]/g, '');
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;

    // typeflag: '0' (0x30) or NUL (0x00) = regular file; '5' = directory (skip)
    const typeflag = header[156];
    offset += 512;

    if ((typeflag === 0x30 || typeflag === 0) && size > 0 && fullName.length > 0) {
      entries.push({ name: fullName, data: tarBuf.subarray(offset, offset + size) });
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return entries;
}

// -----------------------------------------------------------------------
// Month completeness helpers
// -----------------------------------------------------------------------

/** Count non-empty .csv files in `monthDir` whose name contains `yyyymmdd`. */
export function dayFileCount(monthDir: string, yyyymmdd: string): number {
  if (!fs.existsSync(monthDir)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(monthDir)) {
    if (!name.toLowerCase().endsWith('.csv')) continue;
    if (!name.includes(yyyymmdd)) continue;
    const fullPath = path.join(monthDir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.size > 0) count++;
    } catch {
      // ignore stale file entries
    }
  }
  return count;
}

/** Return the number of days in the given month (1-indexed month). */
function daysInMonth(year: number, month: number): number {
  // new Date(year, month, 0) = last day of `month` (month is 1-based here)
  return new Date(year, month, 0).getDate();
}

/** Format zero-padded yyyymmdd string. */
function toYyyymmdd(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/**
 * Return true when every day in the month has ≥ EXPECTED_DAILY_FILES
 * non-empty CSV files.  Mirrors `month_is_complete()` in download_only_2025.py.
 */
export function monthIsComplete(year: number, month: number, monthDir: string): boolean {
  const days = daysInMonth(year, month);
  for (let d = 1; d <= days; d++) {
    const yyyymmdd = toYyyymmdd(year, month, d);
    if (dayFileCount(monthDir, yyyymmdd) < EXPECTED_DAILY_FILES) return false;
  }
  return true;
}

// -----------------------------------------------------------------------
// Day-level download strategies
// -----------------------------------------------------------------------

/**
 * Try to download the daily tar.gz and extract all .csv files to `outDir`.
 * Returns the number of extracted files (0 if tar.gz unavailable or failed).
 */
async function downloadDayTarGz(
  year: number,
  month: number,
  day: number,
  outDir: string,
  opts: DownloadOptions,
): Promise<number> {
  const base = opts._testBaseUrl ?? TDCS_BASE;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const tarUrl = `${base}M06A_${year}${mm}${dd}.tar.gz`;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let body: Buffer;
  try {
    const res = await requestRaw(tarUrl, timeoutMs);
    if (res.statusCode === 404 || res.statusCode === 403) return 0;
    if (res.statusCode < 200 || res.statusCode >= 300 || res.body.length === 0) return 0;
    body = res.body;
  } catch {
    return 0;
  }

  let tarBuf: Buffer;
  try {
    tarBuf = await gunzipBuffer(body);
  } catch {
    return 0;
  }

  const entries = extractUstar(tarBuf);
  let extracted = 0;

  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith('.csv')) continue;
    if (entry.data.length === 0) continue;

    const baseName = path.basename(entry.name);
    const outPath = path.join(outDir, baseName);

    // Resume-safe: keep existing non-empty files (mirrors Python behavior)
    try {
      const stat = fs.statSync(outPath);
      if (stat.isFile() && stat.size > 0) { extracted++; continue; }
    } catch {
      // file does not exist — proceed to write
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, entry.data);
    extracted++;
  }

  return extracted;
}

/**
 * Quick probe: check whether the hourly endpoint for the given date is available.
 * Mirrors `hourly_source_available()` in download_only_2025.py.
 */
async function probeHourlyAvailable(
  year: number,
  month: number,
  day: number,
  opts: DownloadOptions,
): Promise<boolean> {
  const base = opts._testBaseUrl ?? TDCS_BASE;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = '00';
  const yyyymmdd = `${year}${mm}${dd}`;
  const probeUrl = `${base}${yyyymmdd}/${hh}/TDCS_M06A_${yyyymmdd}_${hh}0000.csv`;
  const timeoutMs = Math.min(opts.timeoutMs ?? 60_000, 30_000);
  try {
    const { statusCode } = await requestRaw(probeUrl, timeoutMs);
    if (statusCode === 404) return false;
    return statusCode >= 200 && statusCode < 300;
  } catch {
    return false;
  }
}

/**
 * Download 24 hourly CSV files for a single day.
 * Mirrors `download_m06a_one_day()` in shared_m06a.py.
 * Returns the count of successfully written files (new + pre-existing).
 */
async function downloadDayHourly(
  year: number,
  month: number,
  day: number,
  outDir: string,
  progressCb: DownloadProgressCallback | undefined,
  opts: DownloadOptions,
): Promise<number> {
  const yyyymmdd = toYyyymmdd(year, month, day);
  let count = 0;

  fs.mkdirSync(outDir, { recursive: true });

  for (let hour = 0; hour < 24; hour++) {
    const hh = String(hour).padStart(2, '0');
    const fileName = `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`;
    const outPath = path.join(outDir, fileName);

    // Resume-safe: skip existing non-empty file
    try {
      const stat = fs.statSync(outPath);
      if (stat.isFile() && stat.size > 0) {
        progressCb?.({ kind: 'file_skip', yyyymmdd, hour });
        count++;
        continue;
      }
    } catch {
      // file does not exist
    }

    const base = opts._testBaseUrl ?? TDCS_BASE;
    const fileUrl = `${base}${yyyymmdd}/${hh}/TDCS_M06A_${yyyymmdd}_${hh}0000.csv`;
    progressCb?.({ kind: 'file_start', yyyymmdd, hour });

    const result = await downloadOneFile(fileUrl, outPath, opts);
    progressCb?.({
      kind: 'file_done',
      yyyymmdd,
      hour,
      bytes: result.ok ? result.bytes : undefined,
      error: result.error,
    });
    if (result.ok) count++;
  }

  return count;
}

// -----------------------------------------------------------------------
// downloadMonth — main entry point
// -----------------------------------------------------------------------

/**
 * Download all TDCS M06A files for the given year/month.
 *
 * Strategy per day (mirrors download_only_2025.py):
 *   1. Try daily tar.gz endpoint (one request → 24 CSVs extracted)
 *   2. If unavailable (404) → probe hourly endpoint → download 24 hourly CSVs
 *
 * Writes `_READY` marker when the entire month is verified complete.
 *
 * @param gantries  Requested gantry IDs (metadata only; TDCS raw data is all-gantry
 *                  per time slot — filtering happens at clean stage in PLAN_E9).
 * @param outDir    Parent directory; month folder `{yyyymm}/` created inside.
 */
export async function downloadMonth(
  year: number,
  month: number,
  gantries: string[],
  outDir: string,
  progressCb?: DownloadProgressCallback,
  opts: DownloadOptions = {},
  singleDay?: number,
): Promise<DownloadMonthResult> {
  const yyyymm = `${year}${String(month).padStart(2, '0')}`;
  const monthDir = path.join(outDir, yyyymm);
  fs.mkdirSync(monthDir, { recursive: true });

  // Skip if already marked READY (single-day mode bypasses the month-wide marker)
  if (singleDay === undefined && fs.existsSync(path.join(monthDir, READY_MARKER))) {
    return { totalFiles: 0, totalBytes: 0, errors: [], ready: true };
  }

  void gantries; // metadata — see JSDoc above

  const errors: string[] = [];
  let totalFiles = 0;
  let totalBytes = 0;
  const lastDay = daysInMonth(year, month);
  const startDay = singleDay ?? 1;
  const endDay = singleDay ?? lastDay;

  for (let d = startDay; d <= endDay; d++) {
    const yyyymmdd = toYyyymmdd(year, month, d);

    // Day already complete — emit day_done and skip download
    if (dayFileCount(monthDir, yyyymmdd) >= EXPECTED_DAILY_FILES) {
      totalFiles += EXPECTED_DAILY_FILES;
      progressCb?.({ kind: 'day_done', yyyymmdd, filesTotal: totalFiles });
      continue;
    }

    // Strategy 1: try tar.gz
    let count = await downloadDayTarGz(year, month, d, monthDir, opts);

    // Strategy 2: hourly fallback
    if (count < EXPECTED_DAILY_FILES) {
      const available = await probeHourlyAvailable(year, month, d, opts);
      if (available) {
        count = await downloadDayHourly(year, month, d, monthDir, progressCb, opts);
      } else {
        errors.push(`${yyyymmdd}: tar.gz unavailable and hourly source not found`);
      }
    }

    // Count newly acquired bytes for this day (files written since this run started)
    for (const name of fs.readdirSync(monthDir)) {
      if (!name.toLowerCase().endsWith('.csv')) continue;
      if (!name.includes(yyyymmdd)) continue;
      try {
        const stat = fs.statSync(path.join(monthDir, name));
        totalBytes += stat.size;
      } catch { /* ignore */ }
    }

    totalFiles += count;
    progressCb?.({ kind: 'day_done', yyyymmdd, filesTotal: totalFiles });
  }

  // Check overall month completeness and write _READY (skip in single-day mode)
  const ready = singleDay === undefined && monthIsComplete(year, month, monthDir);
  if (ready) {
    const stamp = new Date().toISOString();
    fs.writeFileSync(
      path.join(monthDir, READY_MARKER),
      `READY month=${yyyymm} at=${stamp}\ngantries=${gantries.join(',')}\n`,
    );
    progressCb?.({ kind: 'month_ready', yyyymm, filesTotal: totalFiles });
  }

  return { totalFiles, totalBytes, errors, ready };
}
