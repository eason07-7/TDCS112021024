/**
 * tdcs-dl pull — orchestrate M1+M2+M3 libs to download TDCS + upload to S3
 *
 * Two entry points share the same `runPull()` core:
 *   1. Commander CLI  — wraps runPull with cli-progress bars + stdout output
 *   2. Wizard Running.tsx (M5) — wraps runPull with ink progress display
 *
 * Flow (PLAN_E8 M4 spec):
 *   1. writeJobRecord('downloading')
 *   2. downloadMonth → temp dir (E6 client-side: Taiwan IP required)
 *   3. uploadMonth → S3 raw/yyyymm=<YYYYMM>/
 *   4. writeJobRecord('downloaded')
 *   5. Cleanup temp dir (unless keepTemp)
 */
import { Command } from 'commander';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import cliProgress from 'cli-progress';
import { S3Client } from '@aws-sdk/client-s3';

import { resolveEndpoint } from '../lib/config';
import { writeJobRecord } from '../lib/job-metadata';
import { downloadMonth } from '../lib/tdcs-download';
import { uploadMonth } from '../lib/s3-upload';
import type { DownloadProgressEvent } from '../lib/tdcs-download.types';
import type { UploadProgressEvent } from '../lib/s3-upload.types';

/** Default S3 bucket (PLAN_E8 demo; user override via --bucket). */
export const DEFAULT_BUCKET = '112021024';
/** Region aligned with PLAN_E7 / MASTER_PLAN §0. */
const AWS_REGION = 'us-east-1';

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// -----------------------------------------------------------------------
// runPull — reusable core logic (used by commander handler + wizard Running.tsx)
// -----------------------------------------------------------------------

export interface RunPullOptions {
  year: number;
  month: number;
  gantries: string[];
  day?: number;        // optional single-day filter (1-31). when set, only that day's
                       // 24 hourly files are downloaded — used for demo runs.
  bucket?: string;
  keepTemp?: boolean;
}

export type RunPullProgressKind = 'phase' | 'dl_day' | 'ul_file' | 'ul_skip';

export interface RunPullProgress {
  kind: RunPullProgressKind;
  phase?: 'init' | 'download' | 'upload' | 'done';
  done?: number;
  total?: number;
  label?: string;  // yyyymmdd for dl_day, fileName for ul_*
}

/**
 * Run the full pull flow: download TDCS → upload S3.
 *
 * Returns the jobId on success; throws on error (caller handles recovery).
 * Progress events are emitted via `onProgress` so UI (CLI bars / ink) can display.
 *
 * `onProgress` is UI-agnostic — no direct stdout/stderr writes here.
 */
export async function runPull(
  opts: RunPullOptions,
  onProgress?: (evt: RunPullProgress) => void,
): Promise<string> {
  const { year, month, gantries, day, bucket = DEFAULT_BUCKET, keepTemp = false } = opts;
  const jobId = crypto.randomUUID();
  const client = new S3Client({ region: AWS_REGION });
  const tempDir = path.join(os.tmpdir(), `tdcs-dl-${jobId}`);

  onProgress?.({ kind: 'phase', phase: 'init', label: jobId });

  try {
    // ── 1. Mark as downloading ─────────────────────────────────────────
    await writeJobRecord(client, bucket, jobId, 'downloading', { gantries, year, month });

    fs.mkdirSync(tempDir, { recursive: true });

    // ── 2. Download phase ──────────────────────────────────────────────
    // single-day mode: only that one day's 24 hourly files; otherwise full month.
    const totalDays = day !== undefined ? 1 : daysInMonth(year, month);
    onProgress?.({ kind: 'phase', phase: 'download', total: totalDays, done: 0 });

    let dlDone = 0;
    const downloadResult = await downloadMonth(
      year, month, gantries, tempDir,
      (evt: DownloadProgressEvent) => {
        if (evt.kind === 'day_done') {
          dlDone++;
          onProgress?.({ kind: 'dl_day', done: dlDone, total: totalDays, label: evt.yyyymmdd });
        }
      },
      {},
      day,
    );

    // ── 3. Upload phase ────────────────────────────────────────────────
    let ulDone = 0;
    let ulTotal = 0;
    onProgress?.({ kind: 'phase', phase: 'upload', done: 0, total: 0 });

    const uploadResult = await uploadMonth(
      client, tempDir, bucket, year, month, { concurrency: 5 },
      (evt: UploadProgressEvent) => {
        if (evt.total !== undefined) ulTotal = evt.total;
        if (evt.kind === 'file_done' || evt.kind === 'file_skip') {
          ulDone = evt.done ?? ulDone + 1;
          onProgress?.({
            kind: evt.kind === 'file_skip' ? 'ul_skip' : 'ul_file',
            done: ulDone,
            total: ulTotal,
            label: evt.fileName,
          });
        }
      },
    );

    // ── 4. Mark as downloaded ──────────────────────────────────────────
    await writeJobRecord(client, bucket, jobId, 'downloaded', {
      totalFiles: uploadResult.totalFiles,
      totalBytes: uploadResult.totalRawBytes,
      gantries,
      year,
      month,
    });

    // ── 5. Cleanup ─────────────────────────────────────────────────────
    if (!keepTemp) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    onProgress?.({ kind: 'phase', phase: 'done' });
    return jobId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await writeJobRecord(new S3Client({ region: AWS_REGION }), bucket, jobId, 'error', {
        error: msg,
      });
    } catch {
      // ignore secondary error — don't hide the original error
    }
    throw e; // re-throw for caller (commander / Running.tsx) to handle
  }
}

// -----------------------------------------------------------------------
// Commander handler — wraps runPull with cli-progress + stdout
// -----------------------------------------------------------------------

export function registerPullCommand(program: Command): void {
  program
    .command('pull')
    .description('抓 TDCS raw CSV → gzip → 上傳 S3（E6 client-side 模式）')
    .requiredOption('--year <YYYY>', '資料年份（e.g. 2026）')
    .requiredOption('--month <MM>', '資料月份（01-12）')
    .requiredOption('--gantries <IDs>', '門架 ID，逗號分隔（e.g. 01F2930N,01F2930S）')
    .option('--bucket <name>', 'S3 bucket 名稱', DEFAULT_BUCKET)
    .option('--keep-temp', '保留暫存 dir（debug 用）', false)
    .action(async (opts: {
      year: string;
      month: string;
      gantries: string;
      bucket: string;
      keepTemp: boolean;
    }) => {
      // ── Validate flag values ───────────────────────────────────────────
      const year = parseInt(opts.year, 10);
      if (isNaN(year) || year < 2020 || year > 2099) {
        console.error(`✗ --year 必須是 2020-2099，收到 "${opts.year}"`);
        process.exitCode = 1;
        return;
      }
      const month = parseInt(opts.month, 10);
      if (isNaN(month) || month < 1 || month > 12) {
        console.error(`✗ --month 必須是 01-12，收到 "${opts.month}"`);
        process.exitCode = 1;
        return;
      }
      const gantries = opts.gantries.split(',').map((s) => s.trim()).filter(Boolean);
      if (gantries.length === 0) {
        console.error('✗ --gantries 不能為空');
        process.exitCode = 1;
        return;
      }

      const { bucket, keepTemp } = opts;
      const { value: endpoint } = resolveEndpoint();

      console.log(`year    : ${year}`);
      console.log(`month   : ${String(month).padStart(2, '0')}`);
      console.log(`gantries: ${gantries.join(', ')}`);
      console.log(`bucket  : ${bucket}`);
      console.log(`endpoint: ${endpoint}`);
      console.log('');

      // ── cli-progress bars (commander-only; wizard uses ink) ────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bars: { dl: any; ul: any } = { dl: null, ul: null };

      try {
        const jobId = await runPull(
          { year, month, gantries, bucket, keepTemp },
          (evt: RunPullProgress) => {
            if (evt.kind === 'phase') {
              if (evt.phase === 'download') {
                const bar = new cliProgress.SingleBar(
                  { format: 'Download |{bar}| {value}/{total} days | {day}', hideCursor: Boolean(process.stdout.isTTY) },
                  cliProgress.Presets.shades_classic,
                );
                bars.dl = bar;
                bars.dl.start(evt.total ?? 1, 0, { day: '' });
              }
              if (evt.phase === 'upload') {
                bars.dl?.stop();
                const bar = new cliProgress.SingleBar(
                  { format: 'Upload   |{bar}| {value}/{total} files | {file}', hideCursor: Boolean(process.stdout.isTTY) },
                  cliProgress.Presets.shades_classic,
                );
                bars.ul = bar;
                bars.ul.start(1, 0, { file: '' });
              }
              if (evt.phase === 'done') {
                bars.ul?.stop();
              }
            }
            if (evt.kind === 'dl_day' && bars.dl) {
              bars.dl.update(evt.done ?? 0, { day: evt.label ?? '' });
            }
            if ((evt.kind === 'ul_file' || evt.kind === 'ul_skip') && bars.ul) {
              if (evt.total) bars.ul.setTotal(evt.total);
              bars.ul.update(evt.done ?? 0, { file: evt.label ?? '' });
            }
          },
        );

        console.log('');
        console.log(`✓ Done.  job_id=${jobId}`);
        console.log(`  run: tdcs-dl status ${jobId}`);
      } catch (e) {
        bars.dl?.stop();
        bars.ul?.stop();
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`\n✗ pull 失敗：${msg}`);
        process.exitCode = 1;
      }
    });
}
