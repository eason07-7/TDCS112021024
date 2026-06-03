/**
 * Unit tests for:
 *   cli/src/lib/job-metadata.ts  (writeJobRecord / readJobRecord)
 *   cli/src/commands/status.ts   (registerStatusCommand action)
 *
 * S3 is mocked via a jest.fn() on client.send.
 * fetch is mocked via assignment to global.fetch.
 * No real AWS or network calls are made.
 */
import { Command } from 'commander';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

import {
  writeJobRecord,
  readJobRecord,
  type JobRecord,
} from '../src/lib/job-metadata';
import { registerStatusCommand } from '../src/commands/status';
import { ENV_ENDPOINT, ENV_CONFIG_DIR } from '../src/lib/config';

// -----------------------------------------------------------------------
// S3 client mock factory
// -----------------------------------------------------------------------

function createMockS3(sendFn: (cmd: unknown) => Promise<unknown>): S3Client {
  return { send: sendFn } as unknown as S3Client;
}

// -----------------------------------------------------------------------
// 1-2. writeJobRecord
// -----------------------------------------------------------------------

describe('writeJobRecord', () => {
  test('writes JSON to jobs/<jobId>.json with correct shape', async () => {
    let capturedKey = '';
    let capturedBody = '';
    let capturedContentType = '';

    const client = createMockS3(async (cmd) => {
      const input = (cmd as PutObjectCommand).input;
      capturedKey = input.Key ?? '';
      capturedBody = typeof input.Body === 'string' ? input.Body : '';
      capturedContentType = input.ContentType ?? '';
      return {};
    });

    await writeJobRecord(client, 'my-bucket', 'job-abc', 'downloading', {
      totalFiles: 42,
      gantries: ['01F2930N'],
    });

    expect(capturedKey).toBe('jobs/job-abc.json');
    expect(capturedContentType).toBe('application/json');

    const body = JSON.parse(capturedBody) as JobRecord;
    expect(body.job_id).toBe('job-abc');
    expect(body.status).toBe('downloading');
    expect(body.totalFiles).toBe(42);
    expect(body.gantries).toEqual(['01F2930N']);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO8601
  });

  test('writes error status with error field', async () => {
    let capturedBody = '';
    const client = createMockS3(async (cmd) => {
      capturedBody = typeof (cmd as PutObjectCommand).input.Body === 'string'
        ? ((cmd as PutObjectCommand).input.Body as string)
        : '';
      return {};
    });

    await writeJobRecord(client, 'bucket', 'job-err', 'error', {
      error: 'download failed',
    });

    const body = JSON.parse(capturedBody) as JobRecord;
    expect(body.status).toBe('error');
    expect(body.error).toBe('download failed');
  });
});

// -----------------------------------------------------------------------
// 3-5. readJobRecord
// -----------------------------------------------------------------------

describe('readJobRecord', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns JobRecord on 200', async () => {
    const mockRecord: JobRecord = {
      job_id: 'job-abc',
      status: 'accepted',
      timestamp: '2026-06-04T00:00:00Z',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRecord,
    });

    const result = await readJobRecord('https://api.example.com', 'job-abc');

    expect(result).toEqual(mockRecord);
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/jobs/job-abc');
  });

  test('returns null on 404', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    const result = await readJobRecord('https://api.example.com', 'not-exist');
    expect(result).toBeNull();
  });

  test('throws on 500', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(
      readJobRecord('https://api.example.com', 'job-id'),
    ).rejects.toThrow('HTTP 500');
  });

  test('strips trailing slash from endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: 'x', status: 'accepted', timestamp: '' }),
    });

    await readJobRecord('https://api.example.com/', 'x');
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/jobs/x');
  });
});

// -----------------------------------------------------------------------
// 6-7. status subcommand (via commander)
// -----------------------------------------------------------------------

describe('status command', () => {
  const originalFetch = global.fetch;
  const origExit = process.exitCode;

  beforeEach(() => {
    process.env[ENV_ENDPOINT] = 'https://test.example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.exitCode = origExit as number | undefined;
    delete process.env[ENV_ENDPOINT];
    delete process.env[ENV_CONFIG_DIR];
  });

  test('prints job fields and does not set exitCode on 200', async () => {
    const record: JobRecord = {
      job_id: 'job-xyz',
      status: 'downloaded',
      timestamp: '2026-06-04T05:00:00Z',
      totalFiles: 100,
      totalBytes: 50000,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => record,
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const program = new Command();
    registerStatusCommand(program);
    await program.parseAsync(['status', 'job-xyz'], { from: 'user' });

    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('job-xyz');
    expect(output).toContain('downloaded');
    expect(output).toContain('100');
    expect(process.exitCode).toBeFalsy();

    logSpy.mockRestore();
  });

  test('sets exitCode=1 and prints error when job not found (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const program = new Command();
    registerStatusCommand(program);
    await program.parseAsync(['status', 'missing-job'], { from: 'user' });

    expect(process.exitCode).toBe(1);
    const errOutput = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOutput).toContain('不存在');

    errSpy.mockRestore();
  });
});
