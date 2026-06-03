/**
 * Unit tests for infra/lambda/src/index.ts
 *
 * Tests:
 *   - F-H3 body size limit (> 100 KB → 413)
 *   - POST /clean routing: valid/invalid params
 *   - POST /clean happy path with mocked S3 + polars (PLAN_E9 M1)
 *   - GET /jobs/{id}
 *
 * Run: cd infra/lambda && npm install && npm test
 */
import * as zlib from 'node:zlib';

// ── Module mocks (must be before imports) ────────────────────────────────────

// nodejs-polars: mock to avoid native addon dependency in test env
jest.mock('nodejs-polars', () => ({
  readRecords: jest.fn().mockReturnValue({
    writeParquet: jest.fn(),  // no-op: we'll fake the file read after
    height: 14058,
  }),
}));

// uuid: deterministic job_id
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-plan-e9' }));

// @aws-sdk/client-s3: flexible mock
const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ _type: 'Put', input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ _type: 'Get', input })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ _type: 'List', input })),
  NoSuchKey: class NoSuchKey extends Error {
    constructor() { super('NoSuchKey'); this.name = 'NoSuchKey'; }
  },
}));

// @aws-sdk/client-athena: MSCK REPAIR mock (PLAN_E9 M3)
const mockAthenaSend = jest.fn();
jest.mock('@aws-sdk/client-athena', () => ({
  AthenaClient: jest.fn().mockImplementation(() => ({ send: mockAthenaSend })),
  StartQueryExecutionCommand: jest.fn().mockImplementation((input) => ({ _type: 'StartQuery', input })),
  GetQueryExecutionCommand: jest.fn().mockImplementation((input) => ({ _type: 'GetQuery', input })),
}));

// Drive the REPAIR poll loop with zero delay so tests don't wait real seconds
// (repairPartitions reads this at call-time — see index.ts).
process.env.ATHENA_POLL_INTERVAL_MS = '0';

/** Default Athena mock: StartQuery → id, GetQuery → SUCCEEDED (happy path). */
function athenaSucceeds(queryId = 'q-mock-e9-m3'): void {
  mockAthenaSend.mockImplementation((cmd: any) => {
    if (cmd._type === 'StartQuery') return Promise.resolve({ QueryExecutionId: queryId });
    if (cmd._type === 'GetQuery') {
      return Promise.resolve({ QueryExecution: { Status: { State: 'SUCCEEDED' } } });
    }
    return Promise.resolve({});
  });
}

import { handler } from './index';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import * as fs from 'node:fs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /clean',
    rawPath: '/clean',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '654485222392',
      apiId: 'test',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: { method: 'POST', path: '/clean', protocol: 'HTTP/1.1', sourceIp: '1.2.3.4', userAgent: 'test' },
      requestId: 'test-req-id',
      routeKey: 'POST /clean',
      stage: '$default',
      time: '04/Jun/2026:09:00:00 +0000',
      timeEpoch: 1751000000000,
    },
    body: '{"year":2026,"month":3,"gantries":["01F2930N"]}',
    isBase64Encoded: false,
    ...overrides,
  };
}

/** Create a gzip buffer from CSV string (for S3 GetObject mock). */
function gzipSync(content: string): Buffer {
  return zlib.gzipSync(Buffer.from(content, 'utf8'));
}

// ── F-H3: body size guard ─────────────────────────────────────────────────────

describe('POST /clean — body size guard (F-H3)', () => {
  beforeEach(() => {
    mockS3Send.mockResolvedValue({});
  });

  test('rejects body > 100 KB → 413 + error details', async () => {
    const bigPayload = 'x'.repeat(101 * 1024);
    const event = makeEvent({ body: bigPayload });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(413);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.error).toBe('body too large');
    expect(body.max).toBe(102400);
    expect(body.received).toBeGreaterThan(102400);
  });

  test('rejects body 100 KB + 1 byte → 413', async () => {
    const boundaryBody = 'a'.repeat(100 * 1024 + 1);
    const event = makeEvent({ body: boundaryBody });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(413);
  });

  test('small body passes size check (returns non-413)', async () => {
    // Valid params so handler proceeds past size check
    // S3 list returns empty → handler returns 404 (not 413)
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'Put') return Promise.resolve({});
      if (cmd._type === 'List') return Promise.resolve({ Contents: [] });
      return Promise.resolve({});
    });

    const event = makeEvent({
      body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] }),
    });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).not.toBe(413);
  });

  test('invalid JSON body → 400', async () => {
    const event = makeEvent({ body: 'not json' });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.error).toBe('invalid JSON body');
  });
});

// ── POST /clean param routing ─────────────────────────────────────────────────

describe('POST /clean — param routing (PLAN_E9 M1)', () => {
  beforeEach(() => {
    mockS3Send.mockResolvedValue({});
  });

  test('missing job_id AND year/month/gantries → 400', async () => {
    const event = makeEvent({ body: '{}' });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.error).toContain('job_id');
  });

  test('Mode B: year/month/gantries in body, no S3 files → 404', async () => {
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'Put') return Promise.resolve({});
      if (cmd._type === 'List') return Promise.resolve({ Contents: [] });
      return Promise.resolve({});
    });

    const event = makeEvent({
      body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] }),
    });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.error).toContain('no raw csv.gz');
  });
});

// ── POST /clean happy path (mocked S3 + polars) ───────────────────────────────

describe('POST /clean — true cleaning happy path (PLAN_E9 M1)', () => {
  // Minimal TDCS CSV: header row + 2 data rows (different gantries)
  const FAKE_CSV = [
    '0,1,2,3,4,5,6,7',  // index header
    '3,2026-03-01 01:00:00,01F2930N,2026-03-01 01:30:00,01F3019N,15.5,1,OK',
    '3,2026-03-01 02:00:00,01F2930N,2026-03-01 02:30:00,01F3019N,20.0,1,OK',
    '1,2026-03-01 01:00:00,01F3019S,2026-03-01 01:30:00,01F3019N,10.0,1,OK',
  ].join('\n');

  const FAKE_GZ = gzipSync(FAKE_CSV);

  // polars mock: writeParquet writes a dummy parquet file so PutObject can read it
  const { readRecords } = require('nodejs-polars') as { readRecords: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    athenaSucceeds(); // M3: handler now runs MSCK REPAIR before reporting done

    // polars readRecords → writeParquet creates a stub file
    readRecords.mockReturnValue({
      writeParquet: jest.fn().mockImplementation((path: string) => {
        // Write a stub parquet file so fs.readFileSync won't throw
        fs.writeFileSync(path, Buffer.from('FAKE_PARQUET'));
      }),
      height: 42,
    });

    // S3 mock: Put → ok, List → 1 file, Get → gzip csv, Put (parquet) → ok
    let putCount = 0;
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'List') {
        return Promise.resolve({
          Contents: [{ Key: 'raw/yyyymm=202603/TDCS_M06A_20260301_010000.csv.gz' }],
        });
      }
      if (cmd._type === 'Get') {
        return Promise.resolve({
          Body: {
            transformToByteArray: () => Promise.resolve(new Uint8Array(FAKE_GZ)),
          },
        });
      }
      if (cmd._type === 'Put') {
        putCount++;
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });
  });

  test('Mode B: happy path → 200 + rowCount + parquetKey', async () => {
    const event = makeEvent({
      body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N', '01F3019S'] }),
    });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.status).toBe('done');
    expect(body).toHaveProperty('rowCount');
    expect(body).toHaveProperty('parquetKey');
    expect(body.parquetKey).toContain('cleaned_v2/yyyymm=202603/cleaned.parquet');
  });

  test('PutObject is called with Parquet key in cleaned_v2 prefix', async () => {
    const event = makeEvent({
      body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] }),
    });
    await handler(event);

    // Find the PutObject call that uploaded parquet (not the job record)
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const parquetPut = (PutObjectCommand as jest.Mock).mock.calls.find(
      ([input]: [any]) => String(input?.Key ?? '').includes('cleaned_v2'),
    );
    expect(parquetPut).toBeTruthy();
    expect(parquetPut[0].Key).toBe('cleaned_v2/yyyymm=202603/cleaned.parquet');
  });

  test('jobs/<id>.json updated to status=done after clean', async () => {
    const event = makeEvent({
      body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] }),
    });
    await handler(event);

    // Find PutObject calls for job record
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const jobPuts = (PutObjectCommand as jest.Mock).mock.calls.filter(
      ([input]: [any]) => String(input?.Key ?? '').startsWith('jobs/'),
    );

    // Should have at least 2: processing + done
    expect(jobPuts.length).toBeGreaterThanOrEqual(2);

    // Last job record should be 'done'
    const lastJobPut = jobPuts[jobPuts.length - 1][0];
    const lastRecord = JSON.parse(lastJobPut.Body as string);
    expect(lastRecord.status).toBe('done');
  });
});

// ── M2: Parquet write + S3 path alignment ─────────────────────────────────────

describe('Parquet write — S3 path + ContentType (PLAN_E9 M2)', () => {
  const FAKE_CSV = [
    '0,1,2,3,4,5,6,7',
    '3,2026-03-01 01:00:00,01F2930N,2026-03-01 01:30:00,01F3019N,15.5,1,OK',
  ].join('\n');

  const FAKE_GZ = gzipSync(FAKE_CSV);
  const { readRecords } = require('nodejs-polars') as { readRecords: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    athenaSucceeds(); // M3: handler now runs MSCK REPAIR before reporting done
    readRecords.mockReturnValue({
      writeParquet: jest.fn().mockImplementation((p: string) => {
        fs.writeFileSync(p, Buffer.from('PARQUET_STUB'));
      }),
      height: 1,
    });
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'List') {
        return Promise.resolve({
          Contents: [{ Key: 'raw/yyyymm=202603/TDCS_M06A_20260301_010000.csv.gz' }],
        });
      }
      if (cmd._type === 'Get') {
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(FAKE_GZ)) },
        });
      }
      return Promise.resolve({});
    });
  });

  test('Parquet PutObject ContentType = application/octet-stream', async () => {
    const event = makeEvent({
      body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] }),
    });
    await handler(event);

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const parquetPut = (PutObjectCommand as jest.Mock).mock.calls.find(
      ([input]: [any]) => String(input?.Key ?? '').includes('cleaned_v2'),
    );
    expect(parquetPut).toBeTruthy();
    expect(parquetPut[0].ContentType).toBe('application/octet-stream');
  });

  test('Parquet S3 key follows Hive partition format yyyymm=YYYYMM/cleaned.parquet', async () => {
    const event = makeEvent({
      body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] }),
    });
    await handler(event);

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const parquetPut = (PutObjectCommand as jest.Mock).mock.calls.find(
      ([input]: [any]) => String(input?.Key ?? '').includes('cleaned_v2'),
    );
    // Must match: cleaned_v2/yyyymm=<YYYYMM>/cleaned.parquet (Glue partition format)
    expect(parquetPut[0].Key).toMatch(/^cleaned_v2\/yyyymm=\d{6}\/cleaned\.parquet$/);
    expect(parquetPut[0].Key).toBe('cleaned_v2/yyyymm=202603/cleaned.parquet');
  });
});

// ── M3: Athena MSCK REPAIR partition discovery ────────────────────────────────

describe('MSCK REPAIR partition discovery (PLAN_E9 M3)', () => {
  const FAKE_CSV = [
    '0,1,2,3,4,5,6,7',
    '3,2026-03-01 01:00:00,01F2930N,2026-03-01 01:30:00,01F3019N,15.5,1,OK',
  ].join('\n');
  const FAKE_GZ = gzipSync(FAKE_CSV);
  const { readRecords } = require('nodejs-polars') as { readRecords: jest.Mock };

  // Full clean happy path (S3 + polars) so the handler reaches the REPAIR step.
  beforeEach(() => {
    jest.clearAllMocks();
    readRecords.mockReturnValue({
      writeParquet: jest.fn().mockImplementation((p: string) => {
        fs.writeFileSync(p, Buffer.from('PARQUET_STUB'));
      }),
      height: 1,
    });
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd._type === 'List') {
        return Promise.resolve({
          Contents: [{ Key: 'raw/yyyymm=202603/TDCS_M06A_20260301_010000.csv.gz' }],
        });
      }
      if (cmd._type === 'Get') {
        return Promise.resolve({
          Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(FAKE_GZ)) },
        });
      }
      return Promise.resolve({}); // Put → ok
    });
  });

  const cleanEvent = () => makeEvent({
    body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] }),
  });

  test('SUCCEEDED → REPAIR query issued (db/table/workgroup) + done record has query_execution_id', async () => {
    athenaSucceeds('q-success-123');
    const result = (await handler(cleanEvent())) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(200);

    // StartQueryExecution called with the right MSCK REPAIR query + workgroup + db
    const { StartQueryExecutionCommand } = require('@aws-sdk/client-athena');
    const startInput = (StartQueryExecutionCommand as jest.Mock).mock.calls[0][0];
    expect(startInput.QueryString).toBe('MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton');
    expect(startInput.WorkGroup).toBe('tdcs-dl-wg');
    expect(startInput.QueryExecutionContext).toEqual({ Database: 'tdcs_dl' });

    // done job record carries query_execution_id
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const jobPuts = (PutObjectCommand as jest.Mock).mock.calls.filter(
      ([input]: [any]) => String(input?.Key ?? '').startsWith('jobs/'),
    );
    const lastRecord = JSON.parse(jobPuts[jobPuts.length - 1][0].Body as string);
    expect(lastRecord.status).toBe('done');
    expect(lastRecord.query_execution_id).toBe('q-success-123');
  });

  test('FAILED → handler 500 + status=error with StateChangeReason + query_execution_id', async () => {
    mockAthenaSend.mockImplementation((cmd: any) => {
      if (cmd._type === 'StartQuery') return Promise.resolve({ QueryExecutionId: 'q-fail-9' });
      if (cmd._type === 'GetQuery') {
        return Promise.resolve({
          QueryExecution: { Status: { State: 'FAILED', StateChangeReason: 'SYNTAX_ERROR' } },
        });
      }
      return Promise.resolve({});
    });

    const result = (await handler(cleanEvent())) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.status).toBe('error');
    expect(body.error).toContain('MSCK REPAIR FAILED');
    expect(body.error).toContain('SYNTAX_ERROR');

    // error job record persisted with status=error + the failed query's id (debug)
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const jobPuts = (PutObjectCommand as jest.Mock).mock.calls.filter(
      ([input]: [any]) => String(input?.Key ?? '').startsWith('jobs/'),
    );
    const lastRecord = JSON.parse(jobPuts[jobPuts.length - 1][0].Body as string);
    expect(lastRecord.status).toBe('error');
    expect(lastRecord.query_execution_id).toBe('q-fail-9');
  });
});

// ── GET /jobs/{id} ────────────────────────────────────────────────────────────

describe('GET /jobs/{id}', () => {
  beforeEach(() => {
    mockS3Send.mockResolvedValue({});
  });

  test('returns 404 when job not found (NoSuchKey)', async () => {
    const { NoSuchKey } = require('@aws-sdk/client-s3');
    mockS3Send.mockRejectedValue(new NoSuchKey());

    const event = makeEvent({
      routeKey: 'GET /jobs/{id}',
      pathParameters: { id: 'nonexistent-uuid' },
    });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(404);
  });

  test('returns 400 when job_id is missing', async () => {
    const event = makeEvent({
      routeKey: 'GET /jobs/{id}',
      pathParameters: {},
    });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
  });
});
