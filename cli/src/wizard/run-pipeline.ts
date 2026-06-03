/**
 * run-pipeline.ts — wizard's two-stage orchestrator (PLAN_E9 M5)
 *
 * Stage 1 (running):  runPull  → download raw TDCS → upload S3   (PLAN_E8)
 * Stage 2 (cleaning): runClean → trigger AWS clean → poll to done (PLAN_E9 M4, Mode A)
 *
 * Pure async logic, no ink/UI — so the phase machine is unit-testable without an
 * ink render harness (none installed). Running.tsx consumes this for display.
 * Reuses runPull + runClean verbatim — no client logic is reimplemented here.
 *
 * Stage 2 uses Mode A: clean reuses the SAME job_id from pull, so the Lambda reads
 * year/month/gantries off the pull job record (one continuous job through the chain).
 */
import { runPull } from '../commands/pull';
import type { RunPullProgress } from '../commands/pull';
import { runClean } from '../commands/clean';
import type { JobRecord } from '../lib/job-metadata';
import type { RunPhase } from './state';

export interface PipelineOptions {
  year: number;
  month: number;
  gantries: string[];
  /** Override endpoint (tests); defaults to resolveEndpoint() inside runClean. */
  endpoint?: string;
}

export interface PipelineCallbacks {
  /** Phase transitions: 'running' → 'cleaning' → 'done'. */
  onPhase?: (phase: RunPhase) => void;
  /** Stage-1 download/upload progress (forwarded from runPull). */
  onPullProgress?: (evt: RunPullProgress) => void;
  /** Stage-2 poll status string (e.g. 'accepted' → 'processing' → 'done'). */
  onCleanStatus?: (status: string) => void;
}

export interface PipelineResult {
  jobId: string;
  record: JobRecord;
}

/**
 * Run pull → clean back-to-back. Resolves with the final (done) job record.
 * Throws if either stage fails — the caller maps that to phase='error'.
 * onPhase fires 'running' before pull, 'cleaning' before clean, 'done' on success.
 */
export async function runPipeline(
  opts: PipelineOptions,
  cb: PipelineCallbacks = {},
): Promise<PipelineResult> {
  const { year, month, gantries, endpoint } = opts;

  // ── Stage 1: download → S3 ────────────────────────────────────────────────
  cb.onPhase?.('running');
  const jobId = await runPull(
    { year, month, gantries },
    (evt) => cb.onPullProgress?.(evt),
  );

  // ── Stage 2: AWS clean (Mode A: reuse the pull job's params) ──────────────
  cb.onPhase?.('cleaning');
  const record = await runClean(
    { jobId, endpoint },
    (evt) => {
      if (evt.kind === 'poll' && evt.status) cb.onCleanStatus?.(evt.status);
    },
  );

  cb.onPhase?.('done');
  return { jobId, record };
}
