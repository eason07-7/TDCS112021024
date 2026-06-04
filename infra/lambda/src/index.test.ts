/**
 * Unit tests for infra/lambda/src/index.ts — async SQS broker (PLAN_E9 M4.5)
 *
 * Two entry shapes:
 *   - API Gateway producer: POST /clean validates + enqueues (SendMessage) → 202;
 *     GET /jobs/{id} reads. (F-H3 body guard kept.)
 *   - SQS consumer: runs the real clean → done | error, re-throws to DLQ on failure.
 *
 * All AWS clients + polars are mocked. Athena poll interval forced to 0.
 */
import * as zlib from 'node:zlib';

// ── Module mocks (hoisted above imports by ts-jest) ───────────────────────────

jest.mock('nodejs-polars', () => ({
  readRecords: jest.fn().mockReturnValue({ writeParquet: jest.fn(), height: 1 }),
  // F-H5: DataType markers used to build PARQUET_SCHEMA (asserted in the schema test)
  Int32: 'Int32',
  Utf8: 'Utf8',
}));
jest.mock('uuid', () => ({ v4: () => 'mock-uuid-plan-e9' }));

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

const mockAthenaSend = jest.fn();
jest.mock('@aws-sdk/client-athena', () => ({
  AthenaClient: jest.fn().mockImplementation(() => ({ send: mockAthenaSend })),
  StartQueryExecutionCommand: jest.fn().mockImplementation((input) => ({ _type: 'StartQuery', input })),
  GetQueryExecutionCommand: jest.fn().mockImplementation((input) => ({ _type: 'GetQuery', input })),
}));

const mockSqsSend = jest.fn();
jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: mockSqsSend })),
  SendMessageCommand: jest.fn().mockImplementation((input) => ({ _type: 'SendMessage', input })),
}));

// Drain the REPAIR poll loop with zero delay (repairPartitions reads at call-time).
process.env.ATHENA_POLL_INTERVAL_MS = '0';

import { handler } from './index';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  SQSEvent,
} from 'aws-lambda';
import * as fs from 'node:fs';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeApiEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /clean',
    rawPath: '/clean',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: '654485222392', apiId: 'test',
      domainName: 'test.execute-api.us-east-1.amazonaws.com', domainPrefix: 'test',
      http: { method: 'POST', path: '/clean', protocol: 'HTTP/1.1', sourceIp: '1.2.3.4', userAgent: 'test' },
      requestId: 'test-req-id', routeKey: 'POST /clean', stage: '$default',
      time: '04/Jun/2026:09:00:00 +0000', timeEpoch: 1751000000000,
    },
    body: '{"year":2026,"month":3,"gantries":["01F2930N"]}',
    isBase64Encoded: false,
    ...overrides,
  };
}

function makeSqsEvent(msg: object): SQSEvent {
  return {
    Records: [{
      messageId: 'm-1', receiptHandle: 'rh-1', body: JSON.stringify(msg),
      attributes: {}, messageAttributes: {}, md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:654485222392:tdcs-dl-clean-jobs',
      awsRegion: 'us-east-1',
    }],
  } as unknown as SQSEvent;
}

function gzipSync(content: string): Buffer {
  return zlib.gzipSync(Buffer.from(content, 'utf8'));
}

const FAKE_CSV = [
  '0,1,2,3,4,5,6,7',
  '3,2026-03-01 01:00:00,01F2930N,2026-03-01 01:30:00,01F3019N,15.5,1,OK',
  '3,2026-03-01 02:00:00,01F2930N,2026-03-01 02:30:00,01F3019N,20.0,1,OK',
].join('\n');

function athenaSucceeds(queryId = 'q-mock-e9'): void {
  mockAthenaSend.mockImplementation((cmd: { _type: string }) => {
    if (cmd._type === 'StartQuery') return Promise.resolve({ QueryExecutionId: queryId });
    if (cmd._type === 'GetQuery') return Promise.resolve({ QueryExecution: { Status: { State: 'SUCCEEDED' } } });
    return Promise.resolve({});
  });
}

/** S3 mock for a full clean: List → 1 file, Get → gzip CSV, Put → ok. */
function setupCleanS3(csv = FAKE_CSV): void {
  const gz = gzipSync(csv);
  mockS3Send.mockImplementation((cmd: { _type: string }) => {
    if (cmd._type === 'List') {
      return Promise.resolve({ Contents: [{ Key: 'raw/yyyymm=202603/TDCS_M06A_20260301_010000.csv.gz' }] });
    }
    if (cmd._type === 'Get') {
      return Promise.resolve({ Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(gz)) } });
    }
    return Promise.resolve({}); // Put → ok
  });
}

function jobPuts(): Array<Record<string, unknown>> {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  return (PutObjectCommand as jest.Mock).mock.calls
    .filter(([input]: [{ Key?: string }]) => String(input?.Key ?? '').startsWith('jobs/'))
    .map(([input]: [{ Body: string }]) => JSON.parse(input.Body));
}

// =============================================================================
// API Gateway producer
// =============================================================================

describe('API GW POST /clean — body guard (F-H3)', () => {
  beforeEach(() => { jest.clearAllMocks(); mockS3Send.mockResolvedValue({}); mockSqsSend.mockResolvedValue({}); });

  test('body > 100 KB → 413', async () => {
    const result = (await handler(makeApiEvent({ body: 'x'.repeat(101 * 1024) }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(413);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.error).toBe('body too large');
  });

  test('body 100 KB + 1 byte → 413', async () => {
    const result = (await handler(makeApiEvent({ body: 'a'.repeat(100 * 1024 + 1) }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(413);
  });

  test('invalid JSON → 400', async () => {
    const result = (await handler(makeApiEvent({ body: 'not json' }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
  });
});

describe('API GW POST /clean — enqueue (producer)', () => {
  beforeEach(() => { jest.clearAllMocks(); mockS3Send.mockResolvedValue({}); mockSqsSend.mockResolvedValue({}); });

  test('missing job_id AND year/month/gantries → 400 (no enqueue)', async () => {
    const result = (await handler(makeApiEvent({ body: '{}' }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
    expect(mockSqsSend).not.toHaveBeenCalled();
  });

  test('Mode B → 202 + accepted record + SendMessage with resolved params', async () => {
    const event = makeApiEvent({ body: JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N', '01F3019S'] }) });
    const result = (await handler(event)) as APIGatewayProxyStructuredResultV2;

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body ?? '{}');
    expect(body.status).toBe('accepted');
    expect(body.job_id).toBe('mock-uuid-plan-e9');

    // SQS message carries fully-resolved params
    const { SendMessageCommand } = require('@aws-sdk/client-sqs');
    const sent = (SendMessageCommand as jest.Mock).mock.calls[0][0];
    expect(JSON.parse(sent.MessageBody)).toEqual({
      job_id: 'mock-uuid-plan-e9', year: 2026, month: 3, gantries: ['01F2930N', '01F3019S'],
    });
    // job record set to accepted (NOT processing/done — that's the consumer)
    expect(jobPuts().pop()!.status).toBe('accepted');
  });

  test('Mode A → reads prior pull job for params, enqueues', async () => {
    mockS3Send.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === 'Get') {
        return Promise.resolve({
          Body: { transformToString: () => Promise.resolve(JSON.stringify({ year: 2026, month: 3, gantries: ['01F2930N'] })) },
        });
      }
      return Promise.resolve({});
    });
    const result = (await handler(makeApiEvent({ body: JSON.stringify({ job_id: 'pull-7' }) }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(202);
    const { SendMessageCommand } = require('@aws-sdk/client-sqs');
    expect(JSON.parse((SendMessageCommand as jest.Mock).mock.calls[0][0].MessageBody)).toEqual({
      job_id: 'pull-7', year: 2026, month: 3, gantries: ['01F2930N'],
    });
  });

  test('Mode A job not found → 404', async () => {
    const { NoSuchKey } = require('@aws-sdk/client-s3');
    mockS3Send.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === 'Get') return Promise.reject(new NoSuchKey());
      return Promise.resolve({});
    });
    const result = (await handler(makeApiEvent({ body: JSON.stringify({ job_id: 'ghost' }) }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(404);
    expect(mockSqsSend).not.toHaveBeenCalled();
  });

  test('SendMessage fails → 500 + error record', async () => {
    mockSqsSend.mockRejectedValue(new Error('SQS unavailable'));
    const result = (await handler(makeApiEvent())) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(500);
    expect(jobPuts().pop()!.status).toBe('error');
  });

  test('Mode B with empty gantries → 400 (no enqueue)', async () => {
    const result = (await handler(makeApiEvent({ body: JSON.stringify({ year: 2026, month: 3, gantries: [] }) }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
    expect(mockSqsSend).not.toHaveBeenCalled();
  });
});

// =============================================================================
// SQS consumer — the real clean
// =============================================================================

describe('SQS consumer — runCleanFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    athenaSucceeds('q-clean-1');
    const { readRecords } = require('nodejs-polars') as { readRecords: jest.Mock };
    readRecords.mockReturnValue({
      writeParquet: jest.fn().mockImplementation((p: string) => fs.writeFileSync(p, Buffer.from('PARQUET_STUB'))),
      height: 1,
    });
    setupCleanS3();
  });

  const msg = { job_id: 'job-1', year: 2026, month: 3, gantries: ['01F2930N', '01F3019S'] };

  test('happy: clean → done record with parquetKey + query_execution_id', async () => {
    await handler(makeSqsEvent(msg));

    const records = jobPuts();
    expect(records.some((r) => r.status === 'processing')).toBe(true);
    const last = records.pop()!;
    expect(last.status).toBe('done');
    expect(last.parquetKey).toBe('cleaned_v2/yyyymm=202603/cleaned.parquet');
    expect(last.query_execution_id).toBe('q-clean-1');
    expect(mockSqsSend).not.toHaveBeenCalled(); // consumer does not enqueue
  });

  test('F-H5: readRecords gets explicit INT schema (8 Int32 + gantry_id_o Utf8)', async () => {
    await handler(makeSqsEvent(msg));
    const { readRecords } = require('nodejs-polars') as { readRecords: jest.Mock };
    const schema = readRecords.mock.calls[0][1]?.schema;
    expect(schema).toBeDefined();
    // numeric columns → Int32 (not inferred Float64 → Parquet DOUBLE)
    for (const c of ['year', 'month', 'day', 'weekday', 'hour_0', 'vehicle_type', 'counts', 'week_index']) {
      expect(schema[c]).toBe('Int32');
    }
    expect(schema.gantry_id_o).toBe('Utf8');
  });

  test('parquet PutObject uses Hive partition key', async () => {
    await handler(makeSqsEvent(msg));
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const parquetPut = (PutObjectCommand as jest.Mock).mock.calls.find(
      ([i]: [{ Key?: string }]) => String(i?.Key ?? '').includes('cleaned_v2'),
    );
    expect(parquetPut[0].Key).toMatch(/^cleaned_v2\/yyyymm=\d{6}\/cleaned\.parquet$/);
  });

  test('no raw csv.gz → error record + re-throw (→ SQS retry/DLQ)', async () => {
    mockS3Send.mockImplementation((cmd: { _type: string }) =>
      cmd._type === 'List' ? Promise.resolve({ Contents: [] }) : Promise.resolve({}));
    await expect(handler(makeSqsEvent(msg))).rejects.toThrow('no raw csv.gz');
    expect(jobPuts().pop()!.status).toBe('error');
  });

  test('MSCK REPAIR FAILED → error record carries query_execution_id + re-throw', async () => {
    mockAthenaSend.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === 'StartQuery') return Promise.resolve({ QueryExecutionId: 'q-fail' });
      if (cmd._type === 'GetQuery') return Promise.resolve({ QueryExecution: { Status: { State: 'FAILED', StateChangeReason: 'BOOM' } } });
      return Promise.resolve({});
    });
    await expect(handler(makeSqsEvent(msg))).rejects.toThrow('MSCK REPAIR FAILED');
    const last = jobPuts().pop()!;
    expect(last.status).toBe('error');
    expect(last.query_execution_id).toBe('q-fail');
  });

  test('raw exists but no gantry match → done rowCount=0 + note (not error)', async () => {
    await handler(makeSqsEvent({ job_id: 'job-2', year: 2026, month: 3, gantries: ['99X9999Z'] }));
    const last = jobPuts().pop()!;
    expect(last.status).toBe('done');
    expect(last.rowCount).toBe(0);
    expect(last.note).toContain('no matching rows');
  });

  test('message missing job_id → dropped (no throw, no job record)', async () => {
    await expect(handler(makeSqsEvent({ year: 2026, month: 3, gantries: ['01F2930N'] }))).resolves.toBeUndefined();
    expect(jobPuts()).toHaveLength(0);
  });
});

// =============================================================================
// GET /jobs/{id}
// =============================================================================

describe('API GW GET /jobs/{id}', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('404 when not found (NoSuchKey)', async () => {
    const { NoSuchKey } = require('@aws-sdk/client-s3');
    mockS3Send.mockRejectedValue(new NoSuchKey());
    const result = (await handler(makeApiEvent({ routeKey: 'GET /jobs/{id}', pathParameters: { id: 'nope' } }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(404);
  });

  test('400 when job id missing', async () => {
    const result = (await handler(makeApiEvent({ routeKey: 'GET /jobs/{id}', pathParameters: {} }))) as APIGatewayProxyStructuredResultV2;
    expect(result.statusCode).toBe(400);
  });
});
