/**
 * Type definitions for s3-upload.ts
 *
 * Source of truth: D:\p\112021134\upload_month_gz.py
 * S3 path format follows PLAN_E8 M2 spec (raw/yyyymm=<YYYYMM>/),
 * which differs from the Python's flat `{month_key}/{fname}.gz` —
 * new format enables Glue Data Catalog partition discovery.
 */

/** Result of a single S3 upload attempt. */
export interface UploadFileResult {
  ok: boolean;
  gzBytes: number;   // compressed bytes (0 if failed)
  skipped: boolean;  // true if object already existed with same gzip size (head_object match)
  error?: string;
}

/** Progress event kinds emitted during uploadMonth. */
export type UploadProgressEventKind =
  | 'file_start'  // about to gzip + upload
  | 'file_done'   // uploaded (gzBytes > 0) or failed (error set)
  | 'file_skip'   // object already exists on S3 with matching gzip size
  | 'month_done'; // all files processed

export interface UploadProgressEvent {
  kind: UploadProgressEventKind;
  fileName?: string;
  rawBytes?: number;  // uncompressed size
  gzBytes?: number;   // gzip-compressed size
  error?: string;
  done?: number;      // files completed so far (done/skip/fail all count)
  total?: number;     // total CSV files in the month directory
}

export type UploadProgressCallback = (evt: UploadProgressEvent) => void;

export interface UploadOptions {
  /** Max simultaneous PutObject calls.  Default 5. */
  concurrency?: number;
  /** S3 ContentType for each object.  Default 'text/csv'. */
  contentType?: string;
  /** Retry count on upload failure.  Default 1 (1 retry = 2 total attempts). */
  retries?: number;
}

export interface UploadMonthResult {
  totalFiles: number;      // CSV files found in local dir
  totalRawBytes: number;   // sum of uncompressed file sizes
  totalGzBytes: number;    // sum of gzip-compressed bytes uploaded / skipped
  uploaded: number;        // files actually PutObject'd
  skipped: number;         // files already on S3 (same gzip size)
  errors: string[];        // per-file error strings
}
