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
}

// Relative to 2026-06 (current demo period)
const PRESETS: PresetOption[] = [
  { label: '最近 3 個月  (202603 – 202605)', range: { start: '202603', end: '202605' } },
  { label: '最近 6 個月  (202512 – 202605)', range: { start: '202512', end: '202605' } },
  { label: '整年 2025     (202501 – 202512)', range: { start: '202501', end: '202512' } },
  { label: '整年 2026（截至今）(202601 – 202605)', range: { start: '202601', end: '202605' } },
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
        <Text dimColor> 確認</Text>
      </Box>
    </Box>
  );
}
