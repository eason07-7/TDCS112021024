/**
 * Type definitions for job-metadata.ts
 *
 * Schema aligned with PLAN_E7 Lambda handler (infra/lambda/src/index.ts):
 *   { job_id, status, echo?, timestamp }
 * CLI-written records add: totalFiles, totalBytes, error
 */

/**
 * Job lifecycle statuses.
 *
 * Lambda PLAN_E7 writes: 'accepted'
 * CLI M3 writes:         'downloading' | 'downloaded' | 'error'
 * Lambda PLAN_E9 will add: 'processing' | 'done'
 */
export type JobStatus =
  | 'accepted'
  | 'downloading'
  | 'downloaded'
  | 'processing'
  | 'done'
  | 'error';

/** Shape of a jobs/<jobId>.json record.
 *  Optional fields depend on who last wrote the record. */
export interface JobRecord {
  job_id: string;
  status: JobStatus;
  timestamp: string;      // ISO8601

  // PLAN_E7 Lambda hello world fields
  echo?: unknown;

  // CLI-written download progress (M3 / M4)
  totalFiles?: number;
  totalBytes?: number;
  gantries?: string[];

  // Job scope (CLI-written)
  year?: number;
  month?: number;

  // Clean result (Lambda PLAN_E9 M1-M3 written, status='done')
  yyyymm?: string;
  scannedFiles?: number;
  rowCount?: number;
  parquetKey?: string;
  parquetBytes?: number;
  query_execution_id?: string;  // Athena MSCK REPAIR (M3)
  note?: string;                // e.g. 'no matching rows after gantry filter'

  // Error detail (status='error')
  error?: string;
}
