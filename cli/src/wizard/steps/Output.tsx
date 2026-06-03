import React, { useState } from 'react';
import { Box, Text, useInput, Key } from 'ink';
import { WizardState, WizardAnswers, OutputDest } from '../state';

interface Props {
  state: WizardState;
  onNext: (patch?: Partial<WizardAnswers>) => void;
  onPrev: () => void;
  onQuit: () => void;
}

const OPTIONS: { id: OutputDest; label: string; desc: string }[] = [
  { id: 'local', label: '本機儲存', desc: '清洗結果下載到當前目錄 ./tdcs-output/' },
  { id: 's3',    label: 'S3 only',  desc: '結果留在 s3://112021024/cleaned_v2/（需 AWS 認證）' },
  { id: 'both',  label: '本機 + S3', desc: '同時下載到本機並備份 S3' },
];

export default function OutputStep({ onNext, onPrev, onQuit }: Props) {
  const [cursor, setCursor] = useState(0);

  useInput((input: string, key: Key) => {
    if (input === 'q') { onQuit(); return; }
    if (key.escape)    { onPrev(); return; }
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(OPTIONS.length - 1, c + 1)); return; }
    if (key.return)    { onNext({ outputDest: OPTIONS[cursor].id }); return; }
  });

  return (
    <Box flexDirection="column">
      <Text bold>選擇輸出位置：</Text>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {OPTIONS.map((opt, i) => (
          <Box key={opt.id} flexDirection="column" marginBottom={1}>
            <Text color={i === cursor ? 'cyan' : undefined}>
              {i === cursor ? '▶ ' : '  '}
              <Text color={i === cursor ? 'cyan' : 'white'} bold={i === cursor}>
                {opt.label}
              </Text>
            </Text>
            <Text dimColor>     {opt.desc}</Text>
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
