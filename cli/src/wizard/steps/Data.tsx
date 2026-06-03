import React from 'react';
import { Box, Text, useInput, Key } from 'ink';
import { WizardState, WizardAnswers } from '../state';

interface Props {
  state: WizardState;
  onNext: (patch?: Partial<WizardAnswers>) => void;
  onPrev: () => void;
  onQuit: () => void;
}

const OPTIONS = [
  { id: 'M06A', label: 'M06A  旅次資料', desc: 'O/D 端點命中篩、OD 分析、適合短距離路段流量研究', available: true },
  { id: 'M03A', label: 'M03A  5 分鐘車流', desc: '站點即時通過量（未來支援）', available: false },
  { id: 'M04A', label: 'M04A  OD 對統計', desc: '起終點對彙總（未來支援）', available: false },
];

export default function DataStep({ onNext, onPrev, onQuit }: Props) {
  useInput((input: string, key: Key) => {
    if (input === 'q') { onQuit(); return; }
    if (key.escape)   { onPrev(); return; }
    if (key.return)   { onNext({ dataType: 'M06A' }); return; }
  });

  return (
    <Box flexDirection="column">
      <Text bold>選擇資料類型（目前支援 M06A）：</Text>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {OPTIONS.map(opt => (
          <Box key={opt.id} flexDirection="column" marginBottom={1}>
            {opt.available
              ? <Text color="green">● {opt.label}</Text>
              : <Text dimColor>○ {opt.label}</Text>
            }
            {opt.available
              ? <Text dimColor>  {opt.desc}</Text>
              : <Text dimColor>  {opt.desc}</Text>
            }
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>M06A 已自動選取 → 按 </Text>
        <Text bold color="yellow">Enter</Text>
        <Text dimColor> 繼續</Text>
      </Box>
    </Box>
  );
}
