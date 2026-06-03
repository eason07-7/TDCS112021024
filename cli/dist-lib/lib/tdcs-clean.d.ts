import type { RawRow, CleanedRow, HourlyRow, HourlyRowWithWeek, CleanResult } from './tdcs-clean.types';
/**
 * 列出目錄下所有 CSV 檔（遞迴、依路徑升冪排序，match Python glob sorted()）
 */
export declare function listCsvFiles(inputDir: string): string[];
/**
 * 讀取單一 CSV 檔，返回 RawRow[]
 * 對應 Python: tdcs_clean.core.read_one_csv
 */
export declare function readOneCsv(filePath: string): RawRow[];
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
export declare function cleanRawDf(rawRows: RawRow[], gantryFilterList: string[], year: number, month: number, dateStart?: number, dateEnd?: number): CleanedRow[];
/**
 * 小時彙總（groupby + size，等同 pandas .size()）
 * 對應 Python: tdcs_clean.core.build_hourly_aggregation
 *
 * groupby keys: Year, Month, Day, Weekday, Hour_0, TargetGantry, VehicleType
 * aggregate: count（size）
 * rename: TargetGantry → GantryID_O, size → counts
 * sort: Day, Hour_0, GantryID_O, VehicleType（全升冪）
 */
export declare function buildHourlyAggregation(cleanedRows: CleanedRow[]): HourlyRow[];
/**
 * 合併彙總（concat + groupby sum）
 * 對應 Python: tdcs_clean.core.merge_hourly_accumulator
 */
export declare function mergeHourlyAccumulator(acc: HourlyRow[], part: HourlyRow[]): HourlyRow[];
/**
 * 加 WeekIndex 欄位
 * 對應 Python: tdcs_clean.core.add_week_index
 * WeekIndex = Math.floor((Day - 1) / 7) + 1
 */
export declare function addWeekIndex(rows: HourlyRow[]): HourlyRowWithWeek[];
/** 輸出 CSV 字串（含 UTF-8 BOM + CRLF，match Python utf-8-sig + Windows pandas）*/
export declare function toCsvString(rows: HourlyRowWithWeek[]): string;
/**
 * 完整批次清洗 + 多層輸出
 * 對應 Python: clean_202603.py process_files_incrementally + save_outputs
 */
export declare function runCleaning(opts: {
    inputDir: string;
    outputDir: string;
    year: number;
    month: number;
    gantries: string[];
    dateStart?: number;
    dateEnd?: number;
    onProgress?: (i: number, total: number, hourlyCount: number) => void;
}): CleanResult;
