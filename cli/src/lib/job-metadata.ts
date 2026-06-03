/**
 * Job metadata lib — reads/writes jobs/<jobId>.json records.
 *
 * Write path:  CLI → S3 PutObject (CLI has AWS creds)
 * Read path:   CLI → GET <endpoint>/jobs/<jobId> (Lambda proxy, universal access)
 *
 * S3 key format (aligned with PLAN_E7 Lambda handler):
 *   jobs/<jobId>.json
 *
 * Schema aligned with PLAN_E7 Lambda handler (infra/lambda/src/index.ts):
 *   { job_id, status, echo?, timestamp, ... }
 *
 * HTTP reads use Node 20 global fetch (no axios/undici/node-fetch).
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import type { JobRecord, JobStatus } from './job-metadata.types';

export type { JobRecord, JobStatus } from './job-metadata.types';

// -----------------------------------------------------------------------
// writeJobRecord
// -----------------------------------------------------------------------

/**
 * Write (or overwrite) a job record to `s3://<bucket>/jobs/<jobId>.json`.
 *
 * The record body is `{ job_id, status, timestamp, ...extra }`.
 * ContentType: 'application/json' (aligned with Lambda handler).
 *
 * @param extra  Additional fields to merge (e.g. totalFiles, totalBytes, error).
 */
export async function writeJobRecord(
  client: S3Client,
  bucket: string,
  jobId: string,
  status: JobStatus,
  extra?: Partial<Omit<JobRecord, 'job_id' | 'status' | 'timestamp'>>,
): Promise<void> {
  const record: JobRecord = {
    job_id: jobId,
    status,
    timestamp: new Date().toISOString(),
    ...extra,
  };

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `jobs/${jobId}.json`,
      Body: JSON.stringify(record),
      ContentType: 'application/json',
    }),
  );
}

// -----------------------------------------------------------------------
// readJobRecord
// -----------------------------------------------------------------------

/**
 * Fetch job record via API Gateway endpoint: `GET <endpoint>/jobs/<jobId>`.
 *
 * - 200 → parse JSON, return JobRecord
 * - 404 → return null (job not found)
 * - Other → throw Error with status code
 *
 * Uses Node 20 global `fetch` (no external HTTP lib).
 * The endpoint trailing slash is stripped before appending `/jobs/<jobId>`.
 */
export async function readJobRecord(
  endpoint: string,
  jobId: string,
): Promise<JobRecord | null> {
  const base = endpoint.replace(/\/$/, '');
  const url = `${base}/jobs/${jobId}`;

  const resp = await fetch(url);

  if (resp.status === 404) return null;

  if (!resp.ok) {
    throw new Error(`GET ${url} returned HTTP ${resp.status}`);
  }

  return (await resp.json()) as JobRecord;
}
