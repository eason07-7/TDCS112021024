import React, { useState } from 'react';
import { Box, Text, useInput, Key } from 'ink';
import { WizardState, WizardAnswers } from '../state';

interface Props {
  state: WizardState;
  onNext: (patch?: Partial<WizardAnswers>) => void;
  onPrev: () => void;
  onQuit: () => void;
  onSubmit: () => void;  // triggers Running phase (PLAN_E8 M5)
}

export default function ConfirmStep({ state, onPrev, onQuit, onSubmit }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const { answers } = state;

  const payload = {
    dataType:   answers.dataType ?? 'M06A',
    timeStart:  answers.timeRange?.start ?? '?',
    timeEnd:    answers.timeRange?.end ?? '?',
    gantries:   answers.gantries ?? [],
    outputDest: answers.outputDest ?? 'local',
  };

  useInput((input: string, key: Key) => {
    if (submitting) return;
    if (input === 'q') { onQuit(); return; }
    if (key.escape)    { onPrev(); return; }
    if (key.return) {
      setSubmitting(true);
      onSubmit();
    }
  });

  if (submitting) {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>✔ 送出中...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>確認任務設定：</Text>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Box>
          <Text dimColor>資料類型：</Text>
          <Text bold color="cyan">{payload.dataType}</Text>
        </Box>
        <Box>
          <Text dimColor>時間區間：</Text>
          <Text bold color="cyan">{payload.timeStart} – {payload.timeEnd}</Text>
        </Box>
        <Box>
          <Text dimColor>路段數量：</Text>
          <Text bold color="cyan">
            {payload.gantries.length === 0
              ? '全部門架'
              : `${payload.gantries.length} 個門架`}
          </Text>
        </Box>
        {payload.gantries.length > 0 && (
          <Box marginLeft={4}>
            <Text dimColor>{payload.gantries.slice(0, 6).join(', ')}
              {payload.gantries.length > 6 ? ` … 等 ${payload.gantries.length} 個` : ''}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>輸出位置：</Text>
          <Text bold color="cyan">{payload.outputDest}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>確認後按 </Text>
        <Text bold color="green">Enter</Text>
        <Text dimColor> 提交 · Esc 返回修改 · q 離開</Text>
      </Box>
    </Box>
  );
}
