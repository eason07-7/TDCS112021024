/**
 * tdcs-dl clean — trigger AWS-side cleaning of raw TDCS, then poll to done.
 *
 * Two entry points share the same `runClean()` core (mirrors pull.ts):
 *   1. Commander CLI       — wraps runClean with a cli-progress line + stdout
 *   2. Wizard (M5, future) — will wrap runClean with an ink progress display
 *
 * Flow (PLAN_E9 M4 spec):
 *   1. Build POST body (Mode A: { job_id } reuses a PLAN_E8 pull job;
 *                       Mode B: { year, month, gantries } cleans directly)
 *   2. resolveEndpoint() → POST <endpoint>/clean → job_id from response
 *   3. pollUntilDone(endpoint, jobId) until status=done | error | timeout
 *   4. print `Cleaned. rows=X parquet=...`
 *
 * The POST accepts any 2xx (handler may answer 200 sync or 202 async — the CLI
 * only needs the returned job_id, then polls). HTTP via Node 20 global fetch.
 */
import { Command } from 'commander';
import cliProgress from 'cli-progress';

import { resolveEndpoint } from '../lib/config';
import { pollUntilDone } from '../lib/job-metadata';
import type { JobRecord } from '../lib/job-metadata';

// -----------------------------------------------------------------------
// runClean — reusable core (used by commander handler + wizard M5)
// -----------------------------------------------------------------------

export interface RunCleanOptions {
  /** Mode A: reuse an existing pull job's year/month/gantries. */
  jobId?: string;
  /** Mode B: clean these params directly (no prior pull needed). */
  year?: number;
  month?: number;
  gantries?: string[];
  /** Endpoint override; defaults to resolveEndpoint(). */
  endpoint?: string;
  /** Poll tuning (defaults: 15 min timeout / 5 s interval). */
  timeoutMs?: number;
  intervalMs?: number;
}

export type RunCleanProgressKind = 'submit' | 'submitted' | 'poll' | 'done';

export interface RunCleanProgress {
  kind: RunCleanProgressKind;
  jobId?: string;
  status?: JobRecord['status'];
  elapsedMs?: number;
}

/** Build the POST /clean body, validating that Mode A or Mode B is satisfied. */
function buildCleanBody(opts: RunCleanOptions): Record<string, unknown> {
  const hasModeB =
    opts.year !== undefined && opts.month !== undefined && opts.gantries !== undefined;
  if (hasModeB) {
    const body: Record<string, unknown> = {
      year: opts.year,
      month: opts.month,
      gantries: opts.gantries,
    };
    if (opts.jobId) body.job_id = opts.jobId; // reuse id if caller supplied one
    return body;
  }
  if (opts.jobId) {
    return { job_id: opts.jobId };
  }
  throw new Error(
    'clean requires either --job-id (Mode A) or --year + --month + --gantries (Mode B)',
  );
}

/**
 * Run the full clean flow: POST /clean → poll until done. Returns the final
 * (done) JobRecord; throws on error / timeout. UI-agnostic — progress is emitted
 * via `onProgress` (no direct stdout here, same contract as runPull).
 */
export async function runClean(
  opts: RunCleanOptions,
  onProgress?: (evt: RunCleanProgress) => void,
): Promise<JobRecord> {
  const endpoint = (opts.endpoint ?? resolveEndpoint().value).replace(/\/$/, '');
  const reqBody = buildCleanBody(opts);

  // ── 1. POST /clean → job_id ──────────────────────────────────────────────
  onProgress?.({ kind: 'submit' });
  const resp = await fetch(`${endpoint}/clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });
  if (!resp.ok) {
    throw new Error(`POST ${endpoint}/clean returned HTTP ${resp.status}`);
  }
  const submitted = (await resp.json()) as { job_id?: string };
  const jobId = submitted.job_id;
  if (!jobId) {
    throw new Error('POST /clean response missing job_id');
  }
  onProgress?.({ kind: 'submitted', jobId });

  // ── 2. Poll until done ───────────────────────────────────────────────────
  const start = Date.now();
  const final = await pollUntilDone(endpoint, jobId, {
    timeoutMs: opts.timeoutMs,
    intervalMs: opts.intervalMs,
    onPoll: (rec) =>
      onProgress?.({ kind: 'poll', jobId, status: rec.status, elapsedMs: Date.now() - start }),
  });

  onProgress?.({ kind: 'done', jobId, status: final.status });
  return final;
}

// -----------------------------------------------------------------------
// Commander handler — wraps runClean with a cli-progress line + stdout
// -----------------------------------------------------------------------

export function registerCleanCommand(program: Command): void {
  program
    .command('clean')
    .description('觸發 AWS 端清洗 raw TDCS → Parquet（POST /clean + 輪詢到 done）')
    .option('--job-id <id>', 'Mode A：沿用既有 pull job 的 year/month/gantries')
    .option('--year <YYYY>', 'Mode B：資料年份（e.g. 2026）')
    .option('--month <MM>', 'Mode B：資料月份（01-12）')
    .option('--gantries <IDs>', 'Mode B：門架 ID，逗號分隔（e.g. 01F2930N,01F2930S）')
    .action(async (opts: {
      jobId?: string;
      year?: string;
      month?: string;
      gantries?: string;
    }) => {
      // ── Validate: need Mode A (job-id) or full Mode B (year+month+gantries) ──
      const modeB = Boolean(opts.year || opts.month || opts.gantries);
      let year: number | undefined;
      let month: number | undefined;
      let gantries: string[] | undefined;

      if (modeB) {
        // partial Mode B is an error — all three required together
        year = parseInt(opts.year ?? '', 10);
        month = parseInt(opts.month ?? '', 10);
        gantries = (opts.gantries ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (isNaN(year) || year < 2020 || year > 2099) {
          console.error(`✗ --year 必須是 2020-2099，收到 "${opts.year ?? ''}"`);
          process.exitCode = 1;
          return;
        }
        if (isNaN(month) || month < 1 || month > 12) {
          console.error(`✗ --month 必須是 01-12，收到 "${opts.month ?? ''}"`);
          process.exitCode = 1;
          return;
        }
        if (gantries.length === 0) {
          console.error('✗ Mode B 需要 --gantries（逗號分隔門架 ID）');
          process.exitCode = 1;
          return;
        }
      } else if (!opts.jobId) {
        console.error('✗ 需要 --job-id（Mode A）或 --year + --month + --gantries（Mode B）');
        process.exitCode = 1;
        return;
      }

      const { value: endpoint, source } = resolveEndpoint();
      console.log(`endpoint: ${endpoint} [${source}]`);
      if (opts.jobId && !modeB) console.log(`mode    : A (reuse job ${opts.jobId})`);
      if (modeB) {
        console.log(`mode    : B`);
        console.log(`year    : ${year}`);
        console.log(`month   : ${String(month).padStart(2, '0')}`);
        console.log(`gantries: ${gantries!.join(', ')}`);
      }
      console.log('');

      // cli-progress: single in-place line; Lambda gives no % → show status + elapsed
      const bar = new cliProgress.SingleBar(
        { format: 'Cleaning | {status} | elapsed {elapsed}s', hideCursor: Boolean(process.stdout.isTTY) },
        cliProgress.Presets.shades_classic,
      );
      let barStarted = false;

      try {
        const record = await runClean(
          { jobId: opts.jobId, year, month, gantries, endpoint },
          (evt) => {
            if (evt.kind === 'submitted') {
              bar.start(1, 0, { status: 'accepted', elapsed: 0 });
              barStarted = true;
            }
            if (evt.kind === 'poll' && barStarted) {
              bar.update(0, {
                status: evt.status ?? 'processing',
                elapsed: Math.round((evt.elapsedMs ?? 0) / 1000),
              });
            }
          },
        );
        if (barStarted) bar.stop();

        console.log('');
        console.log(`✓ Cleaned.  job_id=${record.job_id}`);
        if (record.note) {
          console.log(`  note    : ${record.note}`);
        }
        console.log(`  rows    : ${record.rowCount ?? 0}`);
        if (record.parquetKey) console.log(`  parquet : ${record.parquetKey}`);
        if (record.query_execution_id) console.log(`  athena  : ${record.query_execution_id}`);
      } catch (e) {
        if (barStarted) bar.stop();
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`\n✗ clean 失敗：${msg}`);
        process.exitCode = 1;
      }
    });
}
