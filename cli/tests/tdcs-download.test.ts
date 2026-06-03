/**
 * Unit tests for cli/src/lib/tdcs-download.ts
 *
 * Coverage:
 *   - buildTdcsUrl: URL construction (padding, year/month/day/hour combos)
 *   - downloadOneFile: happy path, retry on 5xx, exhausted retries
 *   - monthIsComplete: full month, partial month
 *   - downloadMonth: _READY written, _READY not written when incomplete
 *
 * HTTP mock strategy: node:http local server on 127.0.0.1:<random port>.
 * No network calls are made to TDCS servers.
 */
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  buildTdcsUrl,
  buildTdcsTarGzUrl,
  downloadOneFile,
  monthIsComplete,
  dayFileCount,
  downloadMonth,
  TDCS_BASE,
  READY_MARKER,
  EXPECTED_DAILY_FILES,
} from '../src/lib/tdcs-download';

// -----------------------------------------------------------------------
// Mock HTTP server helpers
// -----------------------------------------------------------------------

type RequestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function createMockServer(handler: RequestHandler): http.Server {
  return http.createServer(handler);
}

async function startServer(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve(addr.port);
    });
  });
}

async function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

// -----------------------------------------------------------------------
// 1-3: buildTdcsUrl URL construction
// -----------------------------------------------------------------------

describe('buildTdcsUrl', () => {
  test('constructs canonical hourly URL for 2026-03-01 00:00', () => {
    const url = buildTdcsUrl(2026, 3, 1, 0);
    expect(url).toBe(
      'https://tisvcloud.freeway.gov.tw/history/TDCS/M06A/20260301/00/TDCS_M06A_20260301_000000.csv',
    );
  });

  test('pads single-digit month, day, hour with leading zeros', () => {
    const url = buildTdcsUrl(2025, 1, 5, 9);
    expect(url).toBe(
      'https://tisvcloud.freeway.gov.tw/history/TDCS/M06A/20250105/09/TDCS_M06A_20250105_090000.csv',
    );
  });

  test('handles end-of-year boundary: 2026-12-31 23:00', () => {
    const url = buildTdcsUrl(2026, 12, 31, 23);
    expect(url).toBe(
      'https://tisvcloud.freeway.gov.tw/history/TDCS/M06A/20261231/23/TDCS_M06A_20261231_230000.csv',
    );
  });

  test('optional _gantry param does not appear in URL', () => {
    const withGantry = buildTdcsUrl(2026, 3, 1, 0, '01F2930N');
    const withoutGantry = buildTdcsUrl(2026, 3, 1, 0);
    expect(withGantry).toBe(withoutGantry);
    expect(withGantry).not.toContain('01F2930N');
  });

  test('buildTdcsTarGzUrl constructs correct tar.gz URL', () => {
    const url = buildTdcsTarGzUrl(2026, 3, 1);
    expect(url).toBe(
      'https://tisvcloud.freeway.gov.tw/history/TDCS/M06A/M06A_20260301.tar.gz',
    );
  });
});

// -----------------------------------------------------------------------
// 4-6: downloadOneFile with mock HTTP server
// -----------------------------------------------------------------------

describe('downloadOneFile', () => {
  let server: http.Server;
  let port: number;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdcs-dl-test-'));
  });

  afterEach(async () => {
    if (server) await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('happy path: returns ok=true and writes file when server returns 200', async () => {
    server = createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello,world\n');
    });
    port = await startServer(server);

    const outPath = path.join(tmpDir, 'test.csv');
    const result = await downloadOneFile(`http://127.0.0.1:${port}/file.csv`, outPath);

    expect(result.ok).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, 'utf8')).toBe('hello,world\n');
  });

  test('retries once on 5xx: first attempt 500, second attempt 200 → ok=true', async () => {
    let callCount = 0;
    server = createMockServer((_req, res) => {
      callCount++;
      if (callCount === 1) {
        res.writeHead(500);
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('recovered-content');
      }
    });
    port = await startServer(server);

    const outPath = path.join(tmpDir, 'retry.csv');
    const result = await downloadOneFile(
      `http://127.0.0.1:${port}/file.csv`,
      outPath,
      { retries: 1 },
    );

    expect(result.ok).toBe(true);
    expect(callCount).toBe(2);
    expect(fs.readFileSync(outPath, 'utf8')).toBe('recovered-content');
  });

  test('returns ok=false when all retry attempts fail (always 500)', async () => {
    server = createMockServer((_req, res) => {
      res.writeHead(500);
      res.end('error');
    });
    port = await startServer(server);

    const outPath = path.join(tmpDir, 'fail.csv');
    const result = await downloadOneFile(
      `http://127.0.0.1:${port}/file.csv`,
      outPath,
      { retries: 1 },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
    expect(fs.existsSync(outPath)).toBe(false);
  });
});

// -----------------------------------------------------------------------
// 7-8: monthIsComplete / dayFileCount
// -----------------------------------------------------------------------

describe('monthIsComplete', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdcs-month-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns true when every day of Feb 2026 has 24 non-empty CSVs', () => {
    // Feb 2026 = 28 days
    for (let d = 1; d <= 28; d++) {
      const yyyymmdd = `202602${String(d).padStart(2, '0')}`;
      for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0');
        const fname = `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`;
        fs.writeFileSync(path.join(tmpDir, fname), 'V,TO,GO,TD,GD,L,TE,TI\n');
      }
    }
    expect(monthIsComplete(2026, 2, tmpDir)).toBe(true);
  });

  test('returns false when day 15 of Feb 2026 has < 24 files', () => {
    for (let d = 1; d <= 28; d++) {
      const yyyymmdd = `202602${String(d).padStart(2, '0')}`;
      // Day 15 gets only 23 files (missing hour 23)
      const hoursForDay = d === 15 ? 23 : 24;
      for (let h = 0; h < hoursForDay; h++) {
        const hh = String(h).padStart(2, '0');
        const fname = `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`;
        fs.writeFileSync(path.join(tmpDir, fname), 'content');
      }
    }
    expect(monthIsComplete(2026, 2, tmpDir)).toBe(false);
  });

  test('dayFileCount ignores zero-byte files', () => {
    const yyyymmdd = '20260301';
    // Write 10 non-empty + 5 zero-byte files
    for (let h = 0; h < 10; h++) {
      const hh = String(h).padStart(2, '0');
      fs.writeFileSync(path.join(tmpDir, `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`), 'data');
    }
    for (let h = 10; h < 15; h++) {
      const hh = String(h).padStart(2, '0');
      fs.writeFileSync(path.join(tmpDir, `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`), '');
    }
    expect(dayFileCount(tmpDir, yyyymmdd)).toBe(10);
  });
});

// -----------------------------------------------------------------------
// 9-10: downloadMonth _READY marker behavior
// -----------------------------------------------------------------------

describe('downloadMonth', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdcs-dlmonth-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes _READY marker when all files pre-exist (resume-safe, no HTTP needed)', async () => {
    // Pre-create all CSV files for Feb 2026 (28 × 24 = 672 files)
    const monthDir = path.join(tmpDir, '202602');
    fs.mkdirSync(monthDir, { recursive: true });
    for (let d = 1; d <= 28; d++) {
      const yyyymmdd = `202602${String(d).padStart(2, '0')}`;
      for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0');
        fs.writeFileSync(
          path.join(monthDir, `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`),
          'V,TO,GO,TD,GD,L,TE,TI\n',
        );
      }
    }

    const result = await downloadMonth(2026, 2, ['01F2930N'], tmpDir, undefined, {
      retries: 0,
    });

    expect(result.ready).toBe(true);
    expect(fs.existsSync(path.join(monthDir, READY_MARKER))).toBe(true);
    const markerContent = fs.readFileSync(path.join(monthDir, READY_MARKER), 'utf8');
    expect(markerContent).toContain('READY month=202602');
    expect(markerContent).toContain('01F2930N');
  });

  test('does NOT write _READY when month is incomplete (day 1 missing, mock HTTP 404)', async () => {
    // Use _testBaseUrl to avoid real TDCS network calls
    let srv: http.Server | undefined;
    let srvPort = 0;
    try {
      srv = createMockServer((_req, res) => {
        res.writeHead(404);
        res.end('not found');
      });
      srvPort = await startServer(srv);

      // Pre-create files for days 2-28 (all complete), day 1 has 0 files
      const monthDir = path.join(tmpDir, '202602');
      fs.mkdirSync(monthDir, { recursive: true });
      for (let d = 2; d <= 28; d++) {
        const yyyymmdd = `202602${String(d).padStart(2, '0')}`;
        for (let h = 0; h < 24; h++) {
          const hh = String(h).padStart(2, '0');
          fs.writeFileSync(
            path.join(monthDir, `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`),
            'content',
          );
        }
      }

      const result = await downloadMonth(2026, 2, [], tmpDir, undefined, {
        retries: 0,
        timeoutMs: 1000,
        _testBaseUrl: `http://127.0.0.1:${srvPort}/`,
      });

      expect(result.ready).toBe(false);
      expect(fs.existsSync(path.join(monthDir, READY_MARKER))).toBe(false);
    } finally {
      if (srv) await stopServer(srv);
    }
  });

  test('progressCb receives day_done × 28 + month_ready when all files pre-exist', async () => {
    const monthDir = path.join(tmpDir, '202602');
    fs.mkdirSync(monthDir, { recursive: true });
    for (let d = 1; d <= 28; d++) {
      const yyyymmdd = `202602${String(d).padStart(2, '0')}`;
      for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0');
        fs.writeFileSync(
          path.join(monthDir, `TDCS_M06A_${yyyymmdd}_${hh}0000.csv`),
          'V,TO,GO\n',
        );
      }
    }

    const events: Array<{ kind: string; yyyymmdd?: string }> = [];
    await downloadMonth(2026, 2, [], tmpDir, (evt) => {
      events.push({ kind: evt.kind, yyyymmdd: evt.yyyymmdd });
    });

    // All 28 days are pre-existing → 28 day_done events + 1 month_ready
    expect(events.filter((e) => e.kind === 'day_done').length).toBe(28);
    expect(events.find((e) => e.kind === 'month_ready')).toBeTruthy();
    // Events ordered: day_done comes before month_ready
    const lastDayDone = events.map((e) => e.kind).lastIndexOf('day_done');
    const monthReadyIdx = events.map((e) => e.kind).indexOf('month_ready');
    expect(lastDayDone).toBeLessThan(monthReadyIdx);
  });
});
