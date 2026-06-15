import React, { useState } from 'react';
import { Box, Text, useInput, Key } from 'ink';
import { WizardState, WizardAnswers, TimeRange } from '../state';

interface Props {
  state: WizardState;
  onNext: (patch?: Partial<WizardAnswers>) => void;
  onPrev: () => void;
  onQuit: () => void;
}

interface PresetOption {
  label: string;
  range: TimeRange;
  months: number;  // how many months this covers (for clarity)
}

/**
 * Time presets are capped at 3 months (F-H1 gate).
 *
 * Why: PLAN_E6 M5 baseline measured 482s/month on local machine.
 * Lambda 2 GB ≈ 1.1 vCPU → estimated ≤ 10 min/month (well within 15 min max).
 * Multi-month presets (6 mo / whole year) would chain per-month invocations
 * in the CLI (PLAN_E9 scope), not single-invoke; capping to 3 months here
 * prevents accidental single-invoke overload until that chaining is built.
 *
 * Multi-month batch (PLAN_E11+): Step Functions orchestration if needed.
 */
// Relative to 2026-06 (current demo period)
const PRESETS: PresetOption[] = [
  { label: '單日下載 ‧ 2026-06-01 (測試)',   range: { start: '202606', end: '202606', day: 1 }, months: 1 },
  { label: '單日下載 ‧ 2026-06-02 (演示)',   range: { start: '202606', end: '202606', day: 2 }, months: 1 },
  { label: '本月          (202605)',          range: { start: '202605', end: '202605' }, months: 1 },
  { label: '最近 2 個月   (202604 – 202605)', range: { start: '202604', end: '202605' }, months: 2 },
  { label: '最近 3 個月   (202603 – 202605)', range: { start: '202603', end: '202605' }, months: 3 },
];

export default function TimeStep({ onNext, onPrev, onQuit }: Props) {
  const [cursor, setCursor] = useState(0);

  useInput((input: string, key: Key) => {
    if (input === 'q') { onQuit(); return; }
    if (key.escape)    { onPrev(); return; }
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(PRESETS.length - 1, c + 1)); return; }
    if (key.return)    { onNext({ timeRange: PRESETS[cursor].range }); return; }
  });

  return (
    <Box flexDirection="column">
      <Text bold>選擇時間區間：</Text>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {PRESETS.map((p, i) => (
          <Box key={i} marginBottom={0}>
            {i === cursor
              ? <Text color="cyan">▶ {p.label}</Text>
              : <Text dimColor>  {p.label}</Text>
            }
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ 選擇 → 按 </Text>
        <Text bold color="yellow">Enter</Text>
        <Text dimColor> 確認（最多 3 個月 / invoke）</Text>
      </Box>
    </Box>
  );
}
