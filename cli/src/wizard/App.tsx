import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { WizardState, initialState, goNext, goPrev, STEPS, STEP_LABELS, WizardAnswers } from './state';
import DataStep from './steps/Data';
import TimeStep from './steps/Time';
import GantryStep from './steps/Gantry';
import OutputStep from './steps/Output';
import ConfirmStep from './steps/Confirm';

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

  const stepIdx = STEPS.indexOf(state.currentStep);

  const handleNext = (patch?: Partial<WizardAnswers>) => {
    if (state.currentStep === 'confirm') {
      exit();
      return;
    }
    setState(prev => goNext(prev, patch ?? {}));
  };

  const handlePrev = () => {
    setState(prev => goPrev(prev));
  };

  const renderStep = () => {
    const props = { state, onNext: handleNext, onPrev: handlePrev, onQuit: exit };
    switch (state.currentStep) {
      case 'data':    return <DataStep    {...props} />;
      case 'time':    return <TimeStep    {...props} />;
      case 'gantry':  return <GantryStep  {...props} />;
      case 'output':  return <OutputStep  {...props} />;
      case 'confirm': return <ConfirmStep {...props} />;
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
