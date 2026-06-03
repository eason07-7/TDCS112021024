/**
 * Unit tests for cli/src/wizard/run-pipeline.ts (PLAN_E9 M5)
 *
 * Verifies the two-stage phase machine (running → cleaning → done) and error
 * handling, with runPull + runClean mocked. No ink rendering (no harness needed):
 * the orchestration logic is extracted here precisely so it is unit-testable.
 */
import type { JobRecord } from '../src/lib/job-metadata';

const mockRunPull = jest.fn();
const mockRunClean = jest.fn();
jest.mock('../src/commands/pull', () => ({ runPull: mockRunPull }));
jest.mock('../src/commands/clean', () => ({ runClean: mockRunClean }));

import { runPipeline } from '../src/wizard/run-pipeline';
import type { RunPhase } from '../src/wizard/state';

const doneRecord: JobRecord = {
  job_id: 'job-1', status: 'done', timestamp: '2026-06-04T00:00:00Z',
  rowCount: 14058, parquetKey: 'cleaned_v2/yyyymm=202603/cleaned.parquet',
};

afterEach(() => jest.clearAllMocks());

describe('runPipeline', () => {
  test('happy path: phases running → cleaning → done, clean reuses pull job_id (Mode A)', async () => {
    mockRunPull.mockResolvedValue('job-1');
    mockRunClean.mockResolvedValue(doneRecord);

    const phases: RunPhase[] = [];
    const result = await runPipeline(
      { year: 2026, month: 3, gantries: ['01F2930N'] },
      { onPhase: (p) => phases.push(p) },
    );

    expect(phases).toEqual(['running', 'cleaning', 'done']);
    expect(result.jobId).toBe('job-1');
    expect(result.record.status).toBe('done');

    // Stage 1 got the wizard params
    expect(mockRunPull).toHaveBeenCalledWith(
      { year: 2026, month: 3, gantries: ['01F2930N'] },
      expect.any(Function),
    );
    // Stage 2 (Mode A) reuses the pull job_id — no params re-sent
    expect(mockRunClean).toHaveBeenCalledWith(
      { jobId: 'job-1', endpoint: undefined },
      expect.any(Function),
    );
  });

  test('pull fails → rejects, stops at running (clean never runs)', async () => {
    mockRunPull.mockRejectedValue(new Error('download 404'));
    mockRunClean.mockResolvedValue(doneRecord);

    const phases: RunPhase[] = [];
    await expect(
      runPipeline({ year: 2026, month: 3, gantries: ['01F2930N'] }, { onPhase: (p) => phases.push(p) }),
    ).rejects.toThrow('download 404');

    expect(phases).toEqual(['running']); // never reached cleaning/done
    expect(mockRunClean).not.toHaveBeenCalled();
  });

  test('clean fails → rejects after cleaning, no done phase', async () => {
    mockRunPull.mockResolvedValue('job-1');
    mockRunClean.mockRejectedValue(new Error('job job-1 failed: MSCK REPAIR FAILED'));

    const phases: RunPhase[] = [];
    await expect(
      runPipeline({ year: 2026, month: 3, gantries: ['01F2930N'] }, { onPhase: (p) => phases.push(p) }),
    ).rejects.toThrow('MSCK REPAIR FAILED');

    expect(phases).toEqual(['running', 'cleaning']); // no 'done'
  });

  test('forwards clean poll status via onCleanStatus', async () => {
    mockRunPull.mockResolvedValue('job-1');
    // runClean invokes its onProgress callback with poll events
    mockRunClean.mockImplementation(async (_opts: unknown, onProgress: (e: unknown) => void) => {
      onProgress({ kind: 'poll', status: 'processing' });
      onProgress({ kind: 'poll', status: 'done' });
      return doneRecord;
    });

    const statuses: string[] = [];
    await runPipeline(
      { year: 2026, month: 3, gantries: ['01F2930N'] },
      { onCleanStatus: (s) => statuses.push(s) },
    );
    expect(statuses).toEqual(['processing', 'done']);
  });
});
