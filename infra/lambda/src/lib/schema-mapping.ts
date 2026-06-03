/**
 * schema-mapping.ts — PLAN_E9 gate (F-M1)
 *
 * 把 TS 端 PascalCase 的 `HourlyRowWithWeek` 物件、轉成 Glue/Athena 端 snake_case 的
 * Parquet row（欄名對齊 `infra/terraform/glue.tf` 的 9 個 columns）。
 *
 * 為什麼需要這層 mapping（見 workflow/logs/實驗紀錄7_1.md F-M1）：
 *   - `cli/src/lib/tdcs-clean.ts` 清洗輸出 / 型別 `HourlyRowWithWeek` 全是 PascalCase
 *     （Year / Month / GantryID_O / WeekIndex ...）。
 *   - 但 `glue.tf` 的 external table columns 刻意用 snake_case（year / month /
 *     gantry_id_o / week_index ...、Parquet/Athena convention）。
 *   - PLAN_E9 的 Lambda 若直接拿 HourlyRowWithWeek 的 key 當 Parquet 欄名 serialize、
 *     Athena `SELECT` 那些欄會全回 null（schema 看似都在、只是大小寫/命名不符）。
 *   → 所以寫 Parquet 前必須過這層 mapping。
 *
 * 邊界：本檔只做「純資料轉換」、不接 polars、不寫 Parquet、不碰 S3（那些是 PLAN_E9）。
 *
 * Source of truth：欄位對應以 `infra/terraform/glue.tf` 為準（Parquet 落地端），
 * 輸入型別以 `cli/src/lib/tdcs-clean.types.ts` 的 `HourlyRowWithWeek` 為準。
 * ⚠️ 本檔的 `HourlyRowWithWeek` 是 in-package 鏡像（lambda tsconfig rootDir=./src、
 *    不能跨 package import cli/）；PLAN_E9 若把 tdcs-clean.ts bundle 進 Lambda、
 *    可改成直接 import 同名型別、mapping 邏輯不變。改 cli/ 型別時記得同步此鏡像。
 */

/**
 * 鏡像 `cli/src/lib/tdcs-clean.types.ts` 的 `HourlyRowWithWeek`
 * （= HourlyRow + WeekIndex）。清洗管線最終輸出的每一列。
 */
export interface HourlyRowWithWeek {
  Year: number;
  Month: number;
  Day: number;
  Weekday: number; // 1=Mon ... 7=Sun（對齊 Python weekday()+1）
  Hour_0: number;
  GantryID_O: string; // HourlyRow 內由 TargetGantry 改名而來
  VehicleType: number;
  counts: number; // 注意：source 端本來就是小寫、非 PascalCase
  WeekIndex: number;
}

/**
 * Parquet/Athena 端的一列（欄名 = glue.tf snake_case columns、順序對齊）。
 * 不含 partition key `yyyymm`（見下方 toPartitionKey 說明）。
 */
export interface ParquetRow {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour_0: number;
  gantry_id_o: string;
  vehicle_type: number;
  counts: number;
  week_index: number;
}

/**
 * Parquet body 的欄位順序（對齊 glue.tf columns 宣告順序）。
 * Parquet writer（PLAN_E9）應依此順序輸出、確保與 Glue table schema 對齊。
 */
export const PARQUET_COLUMN_ORDER: readonly (keyof ParquetRow)[] = [
  'year',
  'month',
  'day',
  'weekday',
  'hour_0',
  'gantry_id_o',
  'vehicle_type',
  'counts',
  'week_index',
] as const;

/**
 * PascalCase（TS source）→ snake_case（Glue/Parquet）的單一對照表。
 * 任何下游若要反查（如 debug Athena 回 null 的欄），看這張表即可。
 */
export const FIELD_MAP: Readonly<Record<keyof HourlyRowWithWeek, keyof ParquetRow>> = {
  Year: 'year',
  Month: 'month',
  Day: 'day',
  Weekday: 'weekday',
  Hour_0: 'hour_0',
  GantryID_O: 'gantry_id_o',
  VehicleType: 'vehicle_type',
  counts: 'counts',
  WeekIndex: 'week_index',
} as const;

/**
 * 把一列 `HourlyRowWithWeek`（PascalCase）轉成 `ParquetRow`（snake_case）。
 * 9 個欄位 1:1 對應 glue.tf、無遺漏、無多餘。
 */
export function toParquetRow(row: HourlyRowWithWeek): ParquetRow {
  return {
    year: row.Year,
    month: row.Month,
    day: row.Day,
    weekday: row.Weekday,
    hour_0: row.Hour_0,
    gantry_id_o: row.GantryID_O,
    vehicle_type: row.VehicleType,
    counts: row.counts,
    week_index: row.WeekIndex,
  };
}

/** 批次版本：把整批清洗結果轉成 Parquet rows。 */
export function toParquetRows(rows: readonly HourlyRowWithWeek[]): ParquetRow[] {
  return rows.map(toParquetRow);
}

/**
 * 由 Year + Month 算出 partition key `yyyymm`（如 2026 + 3 → "202603"）。
 *
 * partition key 處理規則（重要、別當成第 10 個 body 欄位）：
 *   - glue.tf 的 `yyyymm` 是 **partition_keys**、不是 storage_descriptor.columns。
 *   - Hive 風格分區把分區值編進 S3 路徑、不寫進 Parquet 檔本身：
 *       s3://<bucket>/cleaned_v2/yyyymm=202603/part-*.parquet
 *   - 所以 `ParquetRow`（body）**不含** yyyymm；本函式回傳的字串只拿來組 S3 key。
 *   - 若硬把 yyyymm 也寫進 Parquet body、會與 Glue 的同名 partition column 衝突
 *     （Athena 會抱怨 duplicate column 或讀到不一致值）。
 *   - 落地後 PLAN_E9 跑 `MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton` 讓 Glue 認分區。
 */
export function toPartitionKey(row: Pick<HourlyRowWithWeek, 'Year' | 'Month'>): string {
  return `${row.Year}${String(row.Month).padStart(2, '0')}`;
}

/**
 * 組出某個 yyyymm 分區的 S3 prefix（PLAN_E9 寫 Parquet 用）。
 * 例：partitionPrefix("202603") → "cleaned_v2/yyyymm=202603/"
 */
export function partitionPrefix(yyyymm: string): string {
  return `cleaned_v2/yyyymm=${yyyymm}/`;
}
