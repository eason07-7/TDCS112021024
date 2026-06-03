// ⚠️ Synced from cli/src/lib/tdcs-clean.ts at PLAN_E9 M1（2026-06-04）
// — modify cli/src/lib/ first, then copy here.
// — PLAN_E11: evaluate extracting shared monorepo package to avoid dual maintenance.
/**
 * tdcs-clean.ts — M06A 批次清洗核心庫
 *
 * TypeScript 1:1 翻譯自 ai_workspace/tdcs_clean/core.py
 * 以及 mcp_workspace/step1_cleaning/clean_202603.py（save_outputs 邏輯）
 *
 * 規格：
 *   - 輸出 CSV 必須與 Python 版本 byte-level 一致（M5 baseline 對齊硬指標）
 *   - 輸出格式：UTF-8 BOM + CRLF 行尾（Windows pandas 預設）
 *   - 排序：Day → Hour_0 → GantryID_O → VehicleType（全升冪）
 *   - WeekIndex = Math.floor((Day - 1) / 7) + 1
 *
 * 翻譯決策：
 *   - 不用 nodejs-polars / danfojs（避免數字格式化差異）
 *   - 用純 TypeScript Map / Array 做 groupby（最大控制力）
 *   - 日期時間解析：手動 regex（避免 JS Date 時區影響小時欄位）
 *   - CSV 輸出：手動拼接字串（UTF-8 BOM + CRLF）
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  RawRow,
  CleanedRow,
  HourlyRow,
  HourlyRowWithWeek,
  CleanResult,
} from './tdcs-clean.types';
import { RAW_COLUMNS } from './tdcs-clean.types';

// ─── 常數 ──────────────────────────────────────────────────────────────────

/** 輸出 CSV 的 UTF-8 BOM 前綴 (matches Python encoding='utf-8-sig') */
const BOM = '﻿';

/** Windows 行尾 (matches pandas on Windows) */
const CRLF = '\r\n';

// ─── 工具函式 ──────────────────────────────────────────────────────────────

/**
 * 列出目錄下所有 CSV 檔（遞迴、依路徑升冪排序，match Python glob sorted()）
 */
export function listCsvFiles(inputDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.name.toLowerCase().endsWith('.csv')) {
        results.push(full);
      }
    }
  }
  walk(inputDir);
  return results;
}

/**
 * 解析 CSV 行（處理 TDCS 原始格式：no quoted fields）
 * 返回 string[]，欄數可能大於 8（取前 8 即可）
 */
function parseCsvLine(line: string): string[] {
  // TripInformation 欄位使用分號分隔、不含逗號；直接 split 安全
  return line.split(',');
}

/**
 * 解析 DetectionTime_O 字串 "YYYY-MM-DD HH:MM:SS"
 * 手動 regex 解析、避免 JS Date 時區問題
 * 返回 null 表示解析失敗（等同 Python pd.to_datetime errors='coerce'）
 */
function parseDateTime(dtStr: string): {
  year: number; month: number; day: number; hour: number; weekday: number;
} | null {
  if (!dtStr || dtStr.trim() === '') return null;
  const m = dtStr.trim().match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):\d{2}:\d{2}/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);

  // 用 UTC 計算星期，避免時區影響 (matches Python datetime.weekday())
  // Python: weekday() → 0=Mon, ..., 6=Sun → +1 → 1=Mon, ..., 7=Sun
  // JS getUTCDay():  0=Sun, 1=Mon, ..., 6=Sat
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = jsDay === 0 ? 7 : jsDay;  // 0=Sun → 7; 1=Mon → 1; etc.

  return { year, month, day, hour, weekday };
}

// ─── 核心函式 ──────────────────────────────────────────────────────────────

/**
 * 讀取單一 CSV 檔，返回 RawRow[]
 * 對應 Python: tdcs_clean.core.read_one_csv
 */
export function readOneCsv(filePath: string): RawRow[] {
  const content = fs.readFileSync(filePath, { encoding: 'utf8' });
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  // 檢測第一行是否為欄位索引（"0,1,2,3,4,5,6,7"）
  const firstParts = parseCsvLine(lines[0]);
  const isHeaderRow = firstParts.every((v, i) => v.trim() === String(i));
  const dataLines = isHeaderRow ? lines.slice(1) : lines;

  const rows: RawRow[] = [];
  for (const line of dataLines) {
    if (!line.trim()) continue;
    const parts = parseCsvLine(line);
    // 只取前 8 欄（等同 Python df.iloc[:, :8]）
    const row: RawRow = {
      VehicleType:     parts[0]?.trim() ?? '',
      DetectionTime_O: parts[1]?.trim() ?? '',
      GantryID_O:      parts[2]?.trim() ?? '',
      DetectionTime_D: parts[3]?.trim() ?? '',
      GantryID_D:      parts[4]?.trim() ?? '',
      TripLength:      parts[5]?.trim() ?? '',
      TripEnd:         parts[6]?.trim() ?? '',
      TripInformation: parts.slice(7).join(',').trim(),
    };
    rows.push(row);
  }
  return rows;
}

/**
 * 過濾並計算衍生欄位
 * 對應 Python: tdcs_clean.core.clean_raw_df
 *
 * @param gantryFilterList  目標匝道列表（O OR D 命中即保留）
 * @param year              篩選年份
 * @param month             篩選月份
 * @param dateStart         篩選起始日（含、預設 1）
 * @param dateEnd           篩選終止日（含、預設 31）
 */
export function cleanRawDf(
  rawRows: RawRow[],
  gantryFilterList: string[],
  year: number,
  month: number,
  dateStart: number = 1,
  dateEnd: number = 31,
): CleanedRow[] {
  const filterSet = new Set(gantryFilterList);
  const result: CleanedRow[] = [];

  for (const row of rawRows) {
    // VehicleType → 數字（pd.to_numeric errors='coerce'）
    const vehicleType = parseFloat(row.VehicleType);
    if (isNaN(vehicleType)) continue;

    // TripLength → 數字（可為 null）
    const tripLength = row.TripLength !== '' ? parseFloat(row.TripLength) : null;

    // DetectionTime_O → 日期時間解析（errors='coerce' → null）
    const dt = parseDateTime(row.DetectionTime_O);
    if (dt === null) continue;

    // GantryID 清理（strip）
    const gidO = row.GantryID_O.trim();
    const gidD = row.GantryID_D.trim();

    // dropna on DetectionTime_O / GantryID_O / VehicleType
    if (!gidO) continue;

    // 年月日範圍篩選
    if (dt.year !== year || dt.month !== month) continue;
    if (dt.day < dateStart || dt.day > dateEnd) continue;

    // 匝道篩選（O OR D）
    if (filterSet.size > 0) {
      const inO = filterSet.has(gidO);
      const inD = filterSet.has(gidD);
      if (!inO && !inD) continue;
    }

    // TargetGantry：O 在 filter 中 → 取 O；否則取 D
    const inO = filterSet.has(gidO);
    const targetGantry = inO ? gidO : gidD;

    result.push({
      VehicleType: vehicleType,
      TripLength: tripLength,
      Year: dt.year,
      Month: dt.month,
      Day: dt.day,
      Hour_0: dt.hour,
      Weekday: dt.weekday,
      GantryID_O: gidO,
      GantryID_D: gidD,
      TargetGantry: targetGantry,
    });
  }

  return result;
}

/**
 * 小時彙總（groupby + size，等同 pandas .size()）
 * 對應 Python: tdcs_clean.core.build_hourly_aggregation
 *
 * groupby keys: Year, Month, Day, Weekday, Hour_0, TargetGantry, VehicleType
 * aggregate: count（size）
 * rename: TargetGantry → GantryID_O, size → counts
 * sort: Day, Hour_0, GantryID_O, VehicleType（全升冪）
 */
export function buildHourlyAggregation(cleanedRows: CleanedRow[]): HourlyRow[] {
  const map = new Map<string, HourlyRow>();

  for (const row of cleanedRows) {
    const key = `${row.Year}|${row.Month}|${row.Day}|${row.Weekday}|${row.Hour_0}|${row.TargetGantry}|${row.VehicleType}`;
    const existing = map.get(key);
    if (existing) {
      existing.counts += 1;
    } else {
      map.set(key, {
        Year:       row.Year,
        Month:      row.Month,
        Day:        row.Day,
        Weekday:    row.Weekday,
        Hour_0:     row.Hour_0,
        GantryID_O: row.TargetGantry,
        VehicleType: row.VehicleType,
        counts:     1,
      });
    }
  }

  return sortHourly(Array.from(map.values()));
}

/**
 * 合併彙總（concat + groupby sum）
 * 對應 Python: tdcs_clean.core.merge_hourly_accumulator
 */
export function mergeHourlyAccumulator(acc: HourlyRow[], part: HourlyRow[]): HourlyRow[] {
  if (acc.length === 0) return part;
  const combined = [...acc, ...part];

  // groupby sum
  const map = new Map<string, HourlyRow>();
  for (const row of combined) {
    const key = `${row.Year}|${row.Month}|${row.Day}|${row.Weekday}|${row.Hour_0}|${row.GantryID_O}|${row.VehicleType}`;
    const existing = map.get(key);
    if (existing) {
      existing.counts += row.counts;
    } else {
      map.set(key, { ...row });
    }
  }

  return sortHourly(Array.from(map.values()));
}

/**
 * 加 WeekIndex 欄位
 * 對應 Python: tdcs_clean.core.add_week_index
 * WeekIndex = Math.floor((Day - 1) / 7) + 1
 */
export function addWeekIndex(rows: HourlyRow[]): HourlyRowWithWeek[] {
  return rows.map(r => ({
    ...r,
    WeekIndex: Math.floor((r.Day - 1) / 7) + 1,
  }));
}

// ─── CSV 輸出 ───────────────────────────────────────────────────────────────

/** 排序函式（同 Python sort_values）*/
function sortHourly(rows: HourlyRow[]): HourlyRow[] {
  return rows.sort((a, b) => {
    if (a.Day !== b.Day) return a.Day - b.Day;
    if (a.Hour_0 !== b.Hour_0) return a.Hour_0 - b.Hour_0;
    // GantryID_O: string comparison（ASCII 排序，等同 Python）
    if (a.GantryID_O < b.GantryID_O) return -1;
    if (a.GantryID_O > b.GantryID_O) return 1;
    return a.VehicleType - b.VehicleType;
  });
}

/** 輸出 CSV 字串（含 UTF-8 BOM + CRLF，match Python utf-8-sig + Windows pandas）*/
export function toCsvString(rows: HourlyRowWithWeek[]): string {
  const header = 'Year,Month,Day,Weekday,Hour_0,GantryID_O,VehicleType,counts,WeekIndex';
  const dataLines = rows.map(r =>
    `${r.Year},${r.Month},${r.Day},${r.Weekday},${r.Hour_0},${r.GantryID_O},${r.VehicleType},${r.counts},${r.WeekIndex}`,
  );
  // pandas to_csv 的尾行有 \r\n
  return BOM + [header, ...dataLines].join(CRLF) + CRLF;
}

// ─── 完整管線（對應 clean_202603.py run_cleaning）──────────────────────────

/**
 * 完整批次清洗 + 多層輸出
 * 對應 Python: clean_202603.py process_files_incrementally + save_outputs
 */
export function runCleaning(opts: {
  inputDir: string;
  outputDir: string;
  year: number;
  month: number;
  gantries: string[];
  dateStart?: number;
  dateEnd?: number;
  onProgress?: (i: number, total: number, hourlyCount: number) => void;
}): CleanResult {
  const files = listCsvFiles(opts.inputDir);
  if (files.length === 0) {
    throw new Error(`找不到 CSV：${opts.inputDir}`);
  }

  let hourlyAcc: HourlyRow[] = [];
  let scanned = 0;
  let cleaned = 0;
  let okFiles = 0;

  for (let i = 0; i < files.length; i++) {
    try {
      const raw = readOneCsv(files[i]);
      scanned += raw.length;
      const cdf = cleanRawDf(raw, opts.gantries, opts.year, opts.month, opts.dateStart, opts.dateEnd);
      cleaned += cdf.length;
      if (cdf.length > 0) {
        hourlyAcc = mergeHourlyAccumulator(hourlyAcc, buildHourlyAggregation(cdf));
      }
      okFiles++;
      if (opts.onProgress && ((i + 1) % 20 === 0 || i + 1 === files.length)) {
        opts.onProgress(i + 1, files.length, hourlyAcc.length);
      }
    } catch (e) {
      // 等同 Python except Exception: print 略過
      const fname = path.basename(files[i]);
      process.stderr.write(`  略過 ${fname}：${e}\n`);
    }
  }

  if (hourlyAcc.length === 0) {
    throw new Error('清洗後無資料，請確認來源檔案與參數');
  }

  const hourlyWithWeek = addWeekIndex(hourlyAcc);
  saveOutputs(hourlyWithWeek, opts.outputDir, opts.year, opts.month);

  return {
    scanned_rows: scanned,
    cleaned_rows: cleaned,
    hourly_rows:  hourlyAcc.length,
    file_count:   okFiles,
  };
}

/**
 * 輸出三層 CSV（monthly / weekly / daily）
 * 對應 Python: clean_202603.py save_outputs
 */
function saveOutputs(rows: HourlyRowWithWeek[], outputDir: string, year: number, month: number): void {
  const yy = String(year);
  const mm = String(month).padStart(2, '0');
  const tag = `${yy}${mm}`;

  const monthlyDir = path.join(outputDir, 'monthly');
  const weeklyDir  = path.join(outputDir, 'weekly');
  const dailyDir   = path.join(outputDir, 'daily');
  fs.mkdirSync(monthlyDir, { recursive: true });
  fs.mkdirSync(weeklyDir,  { recursive: true });
  fs.mkdirSync(dailyDir,   { recursive: true });

  // Monthly — all rows in one file
  fs.writeFileSync(
    path.join(monthlyDir, `M06A_${tag}_hourly_counts_all.csv`),
    toCsvString(rows),
    { encoding: 'utf8' },
  );

  // Weekly — grouped by WeekIndex
  const weekMap = new Map<number, HourlyRowWithWeek[]>();
  for (const r of rows) {
    const w = r.WeekIndex;
    if (!weekMap.has(w)) weekMap.set(w, []);
    weekMap.get(w)!.push(r);
  }
  for (const [weekIdx, wRows] of [...weekMap.entries()].sort((a, b) => a[0] - b[0])) {
    fs.writeFileSync(
      path.join(weeklyDir, `M06A_${tag}_week${weekIdx}_hourly_counts.csv`),
      toCsvString(wRows),
      { encoding: 'utf8' },
    );
  }

  // Daily — grouped by Day
  const dayMap = new Map<number, HourlyRowWithWeek[]>();
  for (const r of rows) {
    const d = r.Day;
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(r);
  }
  for (const [day, dRows] of [...dayMap.entries()].sort((a, b) => a[0] - b[0])) {
    const dd = String(day).padStart(2, '0');
    fs.writeFileSync(
      path.join(dailyDir, `M06A_${tag}_day${dd}_hourly_counts.csv`),
      toCsvString(dRows),
      { encoding: 'utf8' },
    );
  }
}
