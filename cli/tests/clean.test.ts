/**
 * Unit tests for:
 *   cli/src/lib/job-metadata.ts  (pollUntilDone)
 *   cli/src/commands/clean.ts    (runClean core + registerCleanCommand action)
 *
 * fetch is mocked via assignment to global.fetch (POST /clean + GET /jobs/<id>).
 * No real AWS or network calls. Poll intervals are set to ~0 so tests don't wait.
 */
import { Command } from 'commander';

import { pollUntilDone, type JobRecord } from '../src/lib/job-metadata';
import { runClean, registerCleanCommand } from '../src/commands/clean';
import { ENV_ENDPOINT, ENV_CONFIG_DIR } from '../src/lib/config';

const ENDPOINT = 'https://api.example.com';

function doneRecord(extra: Partial<JobRecord> = {}): JobRecord {
  return {
    job_id: 'job-clean-1',
    status: 'done',
    timestamp: '2026-06-04T00:00:00Z',
    rowCount: 14058,
    parquetKey: 'cleaned_v2/yyyymm=202603/cleaned.parquet',
    query_execution_id: 'q-abc',
    ...extra,
  };
}

/**
 * Mock fetch: POST /clean → { job_id }; GET /jobs/<id> → next record in `getSeq`
 * (last one repeats). Returns the jest.fn for call assertions.
 */
function mockFetch(jobId: string, getSeq: JobRecord[]): jest.Mock {
  let i = 0;
  const fn = jest.fn().mockImplementation((_url: string, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      return Promise.resolve({ ok: true, status: 202, json: async () => ({ job_id: jobId }) });
    }
    const rec = getSeq[Math.min(i, getSeq.length - 1)];
    i++;
    return Promise.resolve({ ok: true, status: 200, json: async () => rec });
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env[ENV_ENDPOINT];
  delete process.env[ENV_CONFIG_DIR];
  jest.restoreAllMocks();
});

// -----------------------------------------------------------------------
// pollUntilDone
// -----------------------------------------------------------------------

describe('pollUntilDone', () => {
  test('returns the done record on first poll (synchronous handler case)', async () => {
    mockFetch('job-clean-1', [doneRecord()]);
    const rec = await pollUntilDone(ENDPOINT, 'job-clean-1', { intervalMs: 1, timeoutMs: 1000 });
    expect(rec.status).toBe('done');
    expect(rec.rowCount).toBe(14058);
  });

  test('polls through processing → done', async () => {
    const proc: JobRecord = { job_id: 'job-clean-1', status: 'processing', timestamp: '' };
    const fn = mockFetch('job-clean-1', [proc, proc, doneRecord()]);
    const seen: string[] = [];
    const rec = await pollUntilDone(ENDPOINT, 'job-clean-1', {
      intervalMs: 1,
      onPoll: (r) => seen.push(r.status),
    });
    expect(rec.status).toBe('done');
    expect(seen).toEqual(['processing', 'processing', 'done']);
    // 3 GET calls (no POST in pollUntilDone)
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws on status=error (includes error message)', async () => {
    const err: JobRecord = { job_id: 'j', status: 'error', timestamp: '', error: 'MSCK REPAIR FAILED' };
    mockFetch('j', [err]);
    await expect(
      pollUntilDone(ENDPOINT, 'j', { intervalMs: 1 }),
    ).rejects.toThrow('MSCK REPAIR FAILED');
  });

  test('throws on timeout when status never reaches done', async () => {
    const proc: JobRecord = { job_id: 'j', status: 'processing', timestamp: '' };
    mockFetch('j', [proc]);
    await expect(
      pollUntilDone(ENDPOINT, 'j', { intervalMs: 5, timeoutMs: 20 }),
    ).rejects.toThrow('timeout');
  });

  test('throws when job record disappears (404 → null)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    await expect(
      pollUntilDone(ENDPOINT, 'gone', { intervalMs: 1 }),
    ).rejects.toThrow('not found');
  });
});

// -----------------------------------------------------------------------
// runClean — Mode A / Mode B
// -----------------------------------------------------------------------

describe('runClean', () => {
  test('Mode B: POSTs year/month/gantries, returns done record', async () => {
    const fn = mockFetch('job-clean-1', [doneRecord()]);
    const rec = await runClean({
      year: 2026, month: 3, gantries: ['01F2930N', '01F3019S'],
      endpoint: ENDPOINT, intervalMs: 1,
    });
    expect(rec.status).toBe('done');

    // POST body carried Mode B params
    const postCall = fn.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as { body: string }).body);
    expect(body).toEqual({ year: 2026, month: 3, gantries: ['01F2930N', '01F3019S'] });
    // POST hit /clean, GET hit /jobs/<id>
    expect(fn).toHaveBeenCalledWith(`${ENDPOINT}/clean`, expect.objectContaining({ method: 'POST' }));
  });

  test('Mode A: POSTs { job_id } only', async () => {
    const fn = mockFetch('pull-job-9', [doneRecord({ job_id: 'pull-job-9' })]);
    const rec = await runClean({ jobId: 'pull-job-9', endpoint: ENDPOINT, intervalMs: 1 });
    expect(rec.job_id).toBe('pull-job-9');

    const postCall = fn.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse((postCall![1] as { body: string }).body);
    expect(body).toEqual({ job_id: 'pull-job-9' });
  });

  test('throws if neither Mode A nor full Mode B supplied', async () => {
    // no fetch should happen — validation throws first
    const fn = jest.fn();
    global.fetch = fn as unknown as typeof fetch;
    await expect(runClean({ endpoint: ENDPOINT })).rejects.toThrow(/job-id|Mode B/);
    expect(fn).not.toHaveBeenCalled();
  });

  test('throws when POST /clean is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(
      runClean({ jobId: 'x', endpoint: ENDPOINT }),
    ).rejects.toThrow('HTTP 500');
  });
});

// -----------------------------------------------------------------------
// clean command (via commander)
// -----------------------------------------------------------------------

describe('clean command', () => {
  beforeEach(() => {
    process.env[ENV_ENDPOINT] = ENDPOINT;
  });

  test('Mode B happy path prints rows + parquet, no error exit', async () => {
    mockFetch('job-clean-1', [doneRecord()]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerCleanCommand(program);
    await program.parseAsync(
      ['clean', '--year', '2026', '--month', '3', '--gantries', '01F2930N'],
      { from: 'user' },
    );

    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('14058');
    expect(out).toContain('cleaned_v2/yyyymm=202603/cleaned.parquet');
    expect(process.exitCode).toBeFalsy();
  });

  test('missing both --job-id and Mode B params → exitCode 1', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fn = jest.fn();
    global.fetch = fn as unknown as typeof fetch;

    const program = new Command();
    registerCleanCommand(program);
    await program.parseAsync(['clean'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    expect(fn).not.toHaveBeenCalled();
    const err = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(err).toContain('--job-id');

    process.exitCode = 0; // reset for other tests
  });
});
