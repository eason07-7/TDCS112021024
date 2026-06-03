export type DataType = 'M06A';

export type OutputDest = 'local' | 's3' | 'both';

export interface TimeRange {
  start: string; // YYYYMM
  end: string;   // YYYYMM
}

export interface WizardAnswers {
  dataType: DataType;
  timeRange: TimeRange;
  gantries: string[];    // gantry_id list
  outputDest: OutputDest;
}

export type StepId = 'data' | 'time' | 'gantry' | 'output' | 'confirm';

/**
 * Post-confirm execution state (orthogonal to wizard step navigation).
 *   running  = stage 1, downloading raw → S3 (runPull)
 *   cleaning = stage 2, AWS-side clean in progress (runClean, SQS consumer)  [PLAN_E9 M5]
 */
export type RunPhase = 'idle' | 'running' | 'cleaning' | 'done' | 'error';

export const STEPS: StepId[] = ['data', 'time', 'gantry', 'output', 'confirm'];

export const STEP_LABELS: Record<StepId, string> = {
  data:    '資料類型',
  time:    '時間區間',
  gantry:  '路段選擇',
  output:  '輸出位置',
  confirm: '確認提交',
};

export interface WizardState {
  currentStep: StepId;
  history: StepId[];
  answers: Partial<WizardAnswers>;
  runPhase: RunPhase;
  jobId?: string;
  runError?: string;
}

export function initialState(): WizardState {
  return {
    currentStep: 'data',
    history: [],
    answers: {
      dataType: 'M06A',
      gantries: [],
    },
    runPhase: 'idle',
  };
}

export function goNext(state: WizardState, patch: Partial<WizardAnswers> = {}): WizardState {
  const idx = STEPS.indexOf(state.currentStep);
  if (idx >= STEPS.length - 1) return state;
  return {
    ...state,
    currentStep: STEPS[idx + 1],
    history: [...state.history, state.currentStep],
    answers: { ...state.answers, ...patch },
  };
}

export function goPrev(state: WizardState): WizardState {
  if (state.history.length === 0) return state;
  const prev = state.history[state.history.length - 1];
  return {
    ...state,
    currentStep: prev,
    history: state.history.slice(0, -1),
  };
}
