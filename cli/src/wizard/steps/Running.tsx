/**
 * Running.tsx — ink progress view for the pull phase (PLAN_E8 M5)
 *
 * Shown after user confirms in Confirm step.
 * Calls runPull() and displays live progress using ink Box/Text.
 *
 * Design decision: ink-native progress bars (not cli-progress) to avoid
 * terminal control sequence conflicts between cli-progress and ink renderer.
 * Spinner implemented manually (setInterval + useState) — no ink-spinner dep.
 *
 * PLAN_E8 M5 scope: processes only the START month of the selected time range.
 * Multi-month loop (F-H1 gate) is a PLAN_E9 concern.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { runPull } from '../../commands/pull';
import type { RunPullOptions, RunPullProgress } from '../../commands/pull';

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

// ── Running step component ─────────────────────────────────────────────────

interface Props {
  year: number;
  month: number;
  gantries: string[];
  onDone: (jobId: string) => void;
  onError: (err: string) => void;
}

export default function RunningStep({ year, month, gantries, onDone, onError }: Props) {
  const [phase, setPhase] = useState<string>('init');
  const [dlDone, setDlDone] = useState(0);
  const [dlTotal, setDlTotal] = useState(1);
  const [ulDone, setUlDone] = useState(0);
  const [ulTotal, setUlTotal] = useState(1);
  const [currentLabel, setCurrentLabel] = useState('');
  // Guard against React StrictMode double-invocation in dev
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const opts: RunPullOptions = { year, month, gantries };

    runPull(opts, (evt: RunPullProgress) => {
      if (evt.kind === 'phase') {
        setPhase(evt.phase ?? 'init');
        if (evt.phase === 'download' && evt.total) {
          setDlTotal(evt.total);
          setDlDone(0);
        }
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
    })
      .then((jobId) => onDone(jobId))
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDownloading = phase === 'download';
  const isUploading = phase === 'upload';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Spinner />
        <Text bold color="cyan"> 執行中 — {phase}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>下載：</Text>
        <ProgressBar done={dlDone} total={dlTotal} />
        {isDownloading && currentLabel && (
          <Text dimColor> {currentLabel}</Text>
        )}
      </Box>

      <Box>
        <Text dimColor>上傳：</Text>
        <ProgressBar done={ulDone} total={ulTotal} />
        {isUploading && currentLabel && (
          <Text dimColor> {currentLabel}</Text>
        )}
      </Box>
    </Box>
  );
}
