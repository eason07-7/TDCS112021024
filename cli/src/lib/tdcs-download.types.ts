/**
 * Type definitions for tdcs-download.ts
 *
 * Source of truth: D:\p\112021134\download_only_2025.py
 *   + shared_m06a.py (download_m06a_one_day fallback)
 */

/** Result of a single file download attempt. */
export interface DownloadFileResult {
  ok: boolean;
  bytes: number;
  error?: string;
}

/** Progress event kinds emitted during downloadMonth. */
export type DownloadProgressEventKind =
  | 'file_start'   // about to download one hourly CSV
  | 'file_done'    // downloaded (bytes > 0) or failed (error set)
  | 'file_skip'    // file already exists locally (resume-safe skip)
  | 'day_done'     // all hours of one day finished
  | 'month_ready'; // _READY marker written

export interface DownloadProgressEvent {
  kind: DownloadProgressEventKind;
  yyyymmdd?: string;  // YYYYMMDD of the event (file_start/done/skip/day_done)
  hour?: number;      // 0-23 (file_start/done/skip only)
  bytes?: number;     // bytes written (file_done success only)
  error?: string;     // error message (file_done failure)
  yyyymm?: string;    // YYYYMM (month_ready only)
  filesTotal?: number; // total files in month so far (day_done / month_ready)
}

export type DownloadProgressCallback = (evt: DownloadProgressEvent) => void;

export interface DownloadOptions {
  /** Retry count on 5xx / timeout.  Default 1 (1 retry = 2 total attempts). */
  retries?: number;
  /** HTTP request timeout in ms.  Default 60_000. */
  timeoutMs?: number;
  /**
   * @internal Override TDCS_BASE URL for unit testing.
   * Production code should never set this.
   */
  _testBaseUrl?: string;
}

export interface DownloadMonthResult {
  totalFiles: number;   // count of successfully downloaded / pre-existing files
  totalBytes: number;   // bytes from this run (skipped files = 0 bytes)
  errors: string[];     // per-file error strings
  ready: boolean;       // true if _READY marker was written
}
