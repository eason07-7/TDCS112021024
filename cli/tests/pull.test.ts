/**
 * Unit tests for cli/src/commands/pull.ts
 *
 * All lib dependencies are mocked at the module level:
 *   - job-metadata: writeJobRecord
 *   - tdcs-download: downloadMonth
 *   - s3-upload: uploadMonth
 *   - @aws-sdk/client-s3: S3Client (no real AWS calls)
 *   - node:crypto: randomUUID → fixed 'test-uuid-1234'
 *   - cli-progress: SingleBar → no-op stubs
 *
 * Temp dir path is deterministic: os.tmpdir()/tdcs-dl-test-uuid-1234
 */
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { Command } from 'commander';

// ── Module mocks (hoisted before imports) ──────────────────────────────────

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
}));

jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomUUID: jest.fn().mockReturnValue('test-uuid-1234'),
}));

jest.mock('cli-progress', () => ({
  __esModule: true,
  default: {
    SingleBar: jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      update: jest.fn(),
      setTotal: jest.fn(),
    })),
    Presets: { shades_classic: {} },
  },
}));

jest.mock('../src/lib/job-metadata');
jest.mock('../src/lib/tdcs-download');
jest.mock('../src/lib/s3-upload');

// ── Import mocked modules ──────────────────────────────────────────────────

import { writeJobRecord } from '../src/lib/job-metadata';
import { downloadMonth } from '../src/lib/tdcs-download';
import { uploadMonth } from '../src/lib/s3-upload';
import { registerPullCommand, runPull } from '../src/commands/pull';

const mockWriteJobRecord = writeJobRecord as jest.MockedFunction<typeof writeJobRecord>;
const mockDownloadMonth = downloadMonth as jest.MockedFunction<typeof downloadMonth>;
const mockUploadMonth = uploadMonth as jest.MockedFunction<typeof uploadMonth>;

// ── Constants ──────────────────────────────────────────────────────────────

const MOCK_JOB_ID = 'test-uuid-1234';
const MOCK_TEMP_DIR = path.join(os.tmpdir(), `tdcs-dl-${MOCK_JOB_ID}`);

const DEFAULT_DOWNLOAD_RESULT = {
  totalFiles: 24,
  totalBytes: 1000,
  errors: [],
  ready: true,
};

const DEFAULT_UPLOAD_RESULT = {
  totalFiles: 24,
  totalRawBytes: 1000,
  totalGzBytes: 400,
  uploaded: 24,
  skipped: 0,
  errors: [],
};

// ── Test helpers ───────────────────────────────────────────────────────────

function makeProgram() {
  const prog = new Command().exitOverride(); // throw instead of process.exit
  registerPullCommand(prog);
  return prog;
}

const VALID_ARGS = ['pull', '--year', '2026', '--month', '03', '--gantries', '01F2930N,01F2930S'];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('pull subcommand', () => {
  const origExitCode = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined as unknown as number;
    jest.clearAllMocks();
    mockWriteJobRecord.mockResolvedValue(undefined);
    mockDownloadMonth.mockResolvedValue(DEFAULT_DOWNLOAD_RESULT);
    mockUploadMonth.mockResolvedValue(DEFAULT_UPLOAD_RESULT);
    // Ensure temp dir doesn't pre-exist
    if (fs.existsSync(MOCK_TEMP_DIR)) {
      fs.rmSync(MOCK_TEMP_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    process.exitCode = origExitCode as number | undefined;
    if (fs.existsSync(MOCK_TEMP_DIR)) {
      fs.rmSync(MOCK_TEMP_DIR, { recursive: true, force: true });
    }
  });

  test('happy path: calls libs in correct order and writes downloading→downloaded', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await makeProgram().parseAsync(VALID_ARGS, { from: 'user' });

    // writeJobRecord called exactly twice: first 'downloading', then 'downloaded'
    expect(mockWriteJobRecord).toHaveBeenCalledTimes(2);
    expect(mockWriteJobRecord.mock.calls[0][3]).toBe('downloading');
    expect(mockWriteJobRecord.mock.calls[1][3]).toBe('downloaded');

    // Order: writeJob('downloading') → downloadMonth → uploadMonth → writeJob('downloaded')
    const writeOrder = mockWriteJobRecord.mock.invocationCallOrder;
    const dlOrder = mockDownloadMonth.mock.invocationCallOrder[0];
    const ulOrder = mockUploadMonth.mock.invocationCallOrder[0];
    expect(writeOrder[0]).toBeLessThan(dlOrder);
    expect(dlOrder).toBeLessThan(ulOrder);
    expect(ulOrder).toBeLessThan(writeOrder[1]);

    expect(process.exitCode).toBeFalsy();

    logSpy.mockRestore();
  });

  test('happy path: cleans up temp dir after successful upload', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await makeProgram().parseAsync(VALID_ARGS, { from: 'user' });

    // Temp dir should be deleted
    expect(fs.existsSync(MOCK_TEMP_DIR)).toBe(false);
  });

  test('--keep-temp: does NOT clean up temp dir', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await makeProgram().parseAsync(
      [...VALID_ARGS, '--keep-temp'],
      { from: 'user' },
    );

    // Temp dir should still exist
    expect(fs.existsSync(MOCK_TEMP_DIR)).toBe(true);
  });

  test('downloadMonth error: writes error status and sets exitCode=1', async () => {
    mockDownloadMonth.mockRejectedValue(new Error('ENOENT: network timeout'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await makeProgram().parseAsync(VALID_ARGS, { from: 'user' });

    expect(process.exitCode).toBe(1);
    // error record written
    const errorCall = mockWriteJobRecord.mock.calls.find((c) => c[3] === 'error');
    expect(errorCall).toBeDefined();
    expect(errorCall?.[4]?.error).toContain('network timeout');

    errSpy.mockRestore();
  });

  test('uploadMonth error: writes error status and sets exitCode=1', async () => {
    mockUploadMonth.mockRejectedValue(new Error('ExpiredToken'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await makeProgram().parseAsync(VALID_ARGS, { from: 'user' });

    expect(process.exitCode).toBe(1);
    const errorCall = mockWriteJobRecord.mock.calls.find((c) => c[3] === 'error');
    expect(errorCall?.[4]?.error).toContain('ExpiredToken');

    errSpy.mockRestore();
  });

  test('invalid --year: sets exitCode=1 without calling download', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await makeProgram().parseAsync(
      ['pull', '--year', '1999', '--month', '03', '--gantries', '01F2930N'],
      { from: 'user' },
    );

    expect(process.exitCode).toBe(1);
    expect(mockDownloadMonth).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  test('invalid --month: sets exitCode=1 without calling download', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await makeProgram().parseAsync(
      ['pull', '--year', '2026', '--month', '13', '--gantries', '01F2930N'],
      { from: 'user' },
    );

    expect(process.exitCode).toBe(1);
    expect(mockDownloadMonth).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  test('downloadMonth receives correct year/month/gantries', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await makeProgram().parseAsync(
      ['pull', '--year', '2026', '--month', '3', '--gantries', '01F2930N,01F2930S,01F3019N'],
      { from: 'user' },
    );

    const [callYear, callMonth, callGantries] = mockDownloadMonth.mock.calls[0];
    expect(callYear).toBe(2026);
    expect(callMonth).toBe(3);
    expect(callGantries).toEqual(['01F2930N', '01F2930S', '01F3019N']);
  });
});

// ── runPull direct unit tests (M5: verifies callback invoke order) ─────────

describe('runPull (direct)', () => {
  const origExitCode = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined as unknown as number;
    jest.clearAllMocks();
    mockWriteJobRecord.mockResolvedValue(undefined);
    mockDownloadMonth.mockResolvedValue({
      totalFiles: 24, totalBytes: 1000, errors: [], ready: true,
    });
    mockUploadMonth.mockResolvedValue({
      totalFiles: 24, totalRawBytes: 1000, totalGzBytes: 400, uploaded: 24, skipped: 0, errors: [],
    });
  });

  afterEach(() => {
    process.exitCode = origExitCode as number | undefined;
    // Cleanup deterministic temp dir
    const tmpDir = path.join(os.tmpdir(), 'tdcs-dl-test-uuid-1234');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('runPull emits phase events in correct order: init → download → upload → done', async () => {
    const phases: string[] = [];
    await runPull(
      { year: 2026, month: 3, gantries: ['01F2930N'] },
      (evt) => {
        if (evt.kind === 'phase' && evt.phase) phases.push(evt.phase);
      },
    );

    expect(phases[0]).toBe('init');
    expect(phases).toContain('download');
    expect(phases).toContain('upload');
    expect(phases[phases.length - 1]).toBe('done');
  });

  test('runPull returns jobId (UUID string)', async () => {
    const jobId = await runPull({ year: 2026, month: 3, gantries: ['01F2930N'] });
    expect(typeof jobId).toBe('string');
    expect(jobId.length).toBeGreaterThan(0);
  });
});
