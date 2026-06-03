import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { WizardState, RunPhase, initialState, goNext, goPrev, STEPS, STEP_LABELS, WizardAnswers } from './state';
import DataStep from './steps/Data';
import TimeStep from './steps/Time';
import GantryStep from './steps/Gantry';
import OutputStep from './steps/Output';
import ConfirmStep from './steps/Confirm';
import RunningStep from './steps/Running';
import type { JobRecord } from '../lib/job-metadata';

// ASCII logo pre-generated at dev time (figlet Banner3 font) — avoids runtime font file I/O
const LOGO =
`######## ########   ######   ######          ########  ########
   ##    ##     ## ##    ## ##    ##         ##     ## ##
   ##    ##     ## ##       ##               ##     ## ##
   ##    ##     ## ##        ######  ####### ##     ## ######
   ##    ##     ## ##             ##         ##     ## ##
   ##    ##     ## ##    ## ##    ##         ##     ## ##
   ##    ########   ######   ######          ########  ########`;

export default function App() {
  const { exit } = useApp();
  const [state, setState] = useState<WizardState>(initialState());
  const [runPhase, setRunPhase] = useState<RunPhase>('idle');
  const [jobId, setJobId] = useState('');
  const [cleanResult, setCleanResult] = useState<JobRecord | null>(null);
  const [runError, setRunError] = useState('');

  const stepIdx = STEPS.indexOf(state.currentStep);

  const handleNext = (patch?: Partial<WizardAnswers>) => {
    setState(prev => goNext(prev, patch ?? {}));
  };

  const handlePrev = () => {
    setState(prev => goPrev(prev));
  };

  const handleSubmit = () => {
    setRunPhase('running');
  };

  const handleRunDone = (id: string, record: JobRecord) => {
    setJobId(id);
    setCleanResult(record);
    setRunPhase('done');
  };

  const handleRunError = (err: string) => {
    setRunError(err);
    setRunPhase('error');
  };

  // ── Post-confirm: running / cleaning / done / error views ──────────────
  // RunningStep drives both stages (download → clean) and reports phase up via
  // onPhase, so it stays mounted for 'running' AND 'cleaning'.
  if (runPhase === 'running' || runPhase === 'cleaning') {
    const { answers } = state;
    // Parse START month of selected time range (single month; multi-month is
    // the逐月 invoke concern, F-H1 — not this scope).
    const timeStart = answers.timeRange?.start ?? '202603';
    const year  = parseInt(timeStart.slice(0, 4), 10);
    const month = parseInt(timeStart.slice(4, 6), 10);
    const gantries = answers.gantries ?? [];

    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{LOGO}</Text>
        <RunningStep
          year={year}
          month={month}
          gantries={gantries}
          onPhase={setRunPhase}
          onDone={handleRunDone}
          onError={handleRunError}
        />
      </Box>
    );
  }

  if (runPhase === 'done') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="green" bold>✓ 完成！下載 + 清洗兩段都成功</Text>
        <Box marginTop={1}>
          <Text dimColor>job_id : </Text>
          <Text bold>{jobId}</Text>
        </Box>
        <Box>
          <Text dimColor>rows   : </Text>
          <Text bold>{cleanResult?.rowCount ?? 0}</Text>
        </Box>
        {cleanResult?.parquetKey && (
          <Box>
            <Text dimColor>parquet: </Text>
            <Text color="cyan">{cleanResult.parquetKey}</Text>
          </Box>
        )}
        {cleanResult?.note && (
          <Box>
            <Text dimColor>note   : </Text>
            <Text>{cleanResult.note}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>查詢：  </Text>
          <Text color="cyan">tdcs-dl status {jobId}</Text>
        </Box>
      </Box>
    );
  }

  if (runPhase === 'error') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="red" bold>✗ 發生錯誤</Text>
        <Box marginTop={1}>
          <Text>{runError}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>可用 tdcs-dl pull --year ... 重試（支援 resume）</Text>
        </Box>
      </Box>
    );
  }

  // ── Wizard step navigation ─────────────────────────────────────────────

  const renderStep = () => {
    const props = { state, onNext: handleNext, onPrev: handlePrev, onQuit: exit };
    switch (state.currentStep) {
      case 'data':    return <DataStep    {...props} />;
      case 'time':    return <TimeStep    {...props} />;
      case 'gantry':  return <GantryStep  {...props} />;
      case 'output':  return <OutputStep  {...props} />;
      case 'confirm': return (
        <ConfirmStep
          {...props}
          onSubmit={handleSubmit}
        />
      );
    }
  };

  return (
    <Box flexDirection="column">
      {/* ASCII logo */}
      <Text color="cyan">{LOGO}</Text>

      {/* Step indicator */}
      <Box marginBottom={1}>
        <Text dimColor>Step {stepIdx + 1}/{STEPS.length} — </Text>
        <Text bold color="cyan">{STEP_LABELS[state.currentStep]}</Text>
        <Text dimColor>{'  '}[Esc 上一步 · q 離開]</Text>
      </Box>

      {/* Step pills */}
      <Box marginBottom={1}>
        {STEPS.map((s, i) => (
          <Box key={s} marginRight={1}>
            {i < stepIdx
              ? <Text color="green">✔ {STEP_LABELS[s]}</Text>
              : i === stepIdx
                ? <Text bold color="cyan">[{STEP_LABELS[s]}]</Text>
                : <Text dimColor>· {STEP_LABELS[s]}</Text>
            }
          </Box>
        ))}
      </Box>

      {/* Active step */}
      {renderStep()}
    </Box>
  );
}
