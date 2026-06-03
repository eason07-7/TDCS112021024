/**
 * PLAN_E7 M3 — Lambda hello world handler
 *
 * Routes (API Gateway HTTP API v2 routeKey format):
 *   POST /clean       → accept job, write jobs/<id>.json to S3, return 202 + {job_id}
 *   GET /jobs/{id}    → read jobs/<id>.json from S3, return 200 + content or 404
 *
 * PLAN_E9 will replace POST /clean with real tdcs-clean.ts logic.
 * nodejs-polars is installed but NOT used here (kept for PLAN_E9 readiness).
 *
 * brief_cleaning_arch §4 compliance:
 *   ✅ uses @aws-sdk/client-s3 v3 (no awswrangler)
 *   ✅ no SQL in this handler (SQL injection guard deferred to PLAN_E9 Athena queries)
 *   ✅ no Glue ETL
 */
import { S3Client, PutObjectCommand, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = process.env.BUCKET_NAME ?? '';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

const s3 = new S3Client({ region: REGION });

// ── helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function putJobRecord(jobId: string, payload: unknown): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `jobs/${jobId}.json`,
    Body: JSON.stringify(payload),
    ContentType: 'application/json',
  }));
}

async function getJobRecord(jobId: string): Promise<string | null> {
  try {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `jobs/${jobId}.json`,
    }));
    return await resp.Body?.transformToString() ?? null;
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const routeKey = event.routeKey ?? '';

  // POST /clean — accept job
  if (routeKey === 'POST /clean') {
    let body: unknown = {};
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return jsonResponse(400, { error: 'invalid JSON body' });
    }

    const jobId = uuidv4();
    const record = {
      job_id:    jobId,
      status:    'accepted',
      echo:      body,
      timestamp: new Date().toISOString(),
      // PLAN_E9: replace echo + status with real clean progress fields
    };

    await putJobRecord(jobId, record);
    return jsonResponse(202, { job_id: jobId });
  }

  // GET /jobs/{id} — read job progress
  if (routeKey === 'GET /jobs/{id}') {
    const jobId = event.pathParameters?.id ?? '';
    if (!jobId) {
      return jsonResponse(400, { error: 'missing job id' });
    }

    const content = await getJobRecord(jobId);
    if (content === null) {
      return jsonResponse(404, { error: 'job not found', id: jobId });
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: content,
    };
  }

  // unknown route
  return jsonResponse(404, { error: 'unknown route', routeKey });
}
