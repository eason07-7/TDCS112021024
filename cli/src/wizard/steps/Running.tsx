/**
 * Running.tsx — ink progress view for the two-stage run (PLAN_E9 M5)
 *
 * Drives run-pipeline.ts and shows two stages back-to-back:
 *   [1/2] running  → download raw → S3   (cli-progress-style ink bars)
 *   [2/2] cleaning → AWS clean in progress (spinner + status + elapsed)
 *
 * Design (consistent with PLAN_E8 + M4):
 *   - ink-native bars/spinner (not cli-progress) to avoid terminal control clashes.
 *   - cleaning shows status text + elapsed seconds, NOT a fake % (Lambda gives no
 *     progress %); matches the M4 `tdcs-dl clean` CLI decision.
 *   - orchestration lives in run-pipeline.ts (reuses runPull + runClean) so this
 *     component is a thin view; the phase machine is unit-tested there.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { runPipeline } from '../run-pipeline';
import type { RunPhase } from '../state';
import type { JobRecord } from '../../lib/job-metadata';

// ── Simple spinner (no ink-spinner dep) ───────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}

// ── Inline progress bar ────────────────────────────────────────────────────

function ProgressBar({ done, total, width = 28 }: { done: number; total: number; width?: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const filled = Math.round((pct / 100) * width);
  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(width - filled)}</Text>
      <Text> {pct}% ({done}/{total})</Text>
    </Text>
  );
}

// ── Running step component (two stages: download → clean) ──────────────────

interface Props {
  year: number;
  month: number;
  gantries: string[];
  /** Optional single-day filter (1-31) — used for demo runs. */
  day?: number;
  /** Reports phase up to App so its top-level state stays accurate. */
  onPhase: (phase: RunPhase) => void;
  onDone: (jobId: string, record: JobRecord) => void;
  onError: (err: string) => void;
}

export default function RunningStep({ year, month, gantries, day, onPhase, onDone, onError }: Props) {
  // 'running' = downloading (stage 1) · 'cleaning' = AWS clean (stage 2)
  const [stage, setStage] = useState<RunPhase>('running');
  const [pullPhase, setPullPhase] = useState<string>('init');
  const [dlDone, setDlDone] = useState(0);
  const [dlTotal, setDlTotal] = useState(1);
  const [ulDone, setUlDone] = useState(0);
  const [ulTotal, setUlTotal] = useState(1);
  const [currentLabel, setCurrentLabel] = useState('');
  const [cleanStatus, setCleanStatus] = useState('accepted');
  const [elapsed, setElapsed] = useState(0);
  // Guard against React StrictMode double-invocation in dev
  const started = useRef(false);

  // Tick elapsed seconds while cleaning (stage 2 gives no % → show elapsed).
  useEffect(() => {
    if (stage !== 'cleaning') return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    runPipeline(
      { year, month, gantries, day },
      {
        onPhase: (phase) => { setStage(phase); onPhase(phase); },
        onPullProgress: (evt) => {
          if (evt.kind === 'phase') {
            setPullPhase(evt.phase ?? 'init');
            if (evt.phase === 'download' && evt.total) { setDlTotal(evt.total); setDlDone(0); }
          }
          if (evt.kind === 'dl_day') {
            setDlDone(evt.done ?? 0);
            if (evt.total) setDlTotal(evt.total);
            setCurrentLabel(evt.label ?? '');
          }
          if (evt.kind === 'ul_file' || evt.kind === 'ul_skip') {
            setUlDone(evt.done ?? 0);
            if (evt.total) setUlTotal(evt.total);
            setCurrentLabel(evt.label ?? '');
          }
        },
        onCleanStatus: (status) => setCleanStatus(status),
      },
    )
      .then(({ jobId, record }) => onDone(jobId, record))
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage 2: cleaning ─────────────────────────────────────────────────────
  if (stage === 'cleaning') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="green">✔ [1/2] 下載完成</Text>
        </Box>
        <Box marginTop={1}>
          <Spinner />
          <Text bold color="cyan"> [2/2] 清洗中… status={cleanStatus} (elapsed {elapsed}s)</Text>
        </Box>
      </Box>
    );
  }

  // ── Stage 1: downloading ──────────────────────────────────────────────────
  const isDownloading = pullPhase === 'download';
  const isUploading = pullPhase === 'upload';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Spinner />
        <Text bold color="cyan"> [1/2] 下載中 — {pullPhase}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>下載：</Text>
        <ProgressBar done={dlDone} total={dlTotal} />
        {isDownloading && currentLabel && <Text dimColor> {currentLabel}</Text>}
      </Box>

      <Box>
        <Text dimColor>上傳：</Text>
        <ProgressBar done={ulDone} total={ulTotal} />
        {isUploading && currentLabel && <Text dimColor> {currentLabel}</Text>}
      </Box>
    </Box>
  );
}
