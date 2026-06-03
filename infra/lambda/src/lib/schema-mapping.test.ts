/**
 * schema-mapping.test.ts — F-M1 mapping 正確性（PLAN_E9 gate）
 *
 * 放 src/lib/ 內與被測檔同層、對齊 infra/lambda/jest.config.cjs 的
 * testMatch `**​/src/**​/*.test.ts`（PLAN_E9 gate 批 B sonnet_worker 建的 config）。
 *
 * 驗 3 件事：
 *   1. 9 個欄位全部 PascalCase → snake_case 正確對應、無遺漏、無多餘（對齊 glue.tf）
 *   2. partition key yyyymm 由 Year+Month 正確補零（且不混進 body）
 *   3. FIELD_MAP / PARQUET_COLUMN_ORDER 與實際輸出一致（防未來改一處漏改另一處）
 */
import {
  toParquetRow,
  toParquetRows,
  toPartitionKey,
  partitionPrefix,
  PARQUET_COLUMN_ORDER,
  FIELD_MAP,
  type HourlyRowWithWeek,
  type ParquetRow,
} from './schema-mapping';

const sample: HourlyRowWithWeek = {
  Year: 2026,
  Month: 3,
  Day: 7,
  Weekday: 6, // Sat
  Hour_0: 14,
  GantryID_O: '01F2930N',
  VehicleType: 31,
  counts: 1234,
  WeekIndex: 1,
};

describe('toParquetRow — 9 欄位 PascalCase → snake_case', () => {
  it('每個欄位值都正確搬到對應 snake_case key', () => {
    const out = toParquetRow(sample);
    const expected: ParquetRow = {
      year: 2026,
      month: 3,
      day: 7,
      weekday: 6,
      hour_0: 14,
      gantry_id_o: '01F2930N',
      vehicle_type: 31,
      counts: 1234,
      week_index: 1,
    };
    expect(out).toEqual(expected);
  });

  it('輸出剛好 9 個 key（無遺漏、無多餘、不含 yyyymm）', () => {
    const keys = Object.keys(toParquetRow(sample)).sort();
    expect(keys).toEqual(
      [
        'counts',
        'day',
        'gantry_id_o',
        'hour_0',
        'month',
        'vehicle_type',
        'week_index',
        'weekday',
        'year',
      ].sort(),
    );
    expect(keys).not.toContain('yyyymm');
  });

  it('輸出 key 集合 = glue.tf 欄位順序常數', () => {
    const keys = Object.keys(toParquetRow(sample)).sort();
    expect(keys).toEqual([...PARQUET_COLUMN_ORDER].sort());
  });

  it('FIELD_MAP 的每個對應都與實際輸出一致', () => {
    const out = toParquetRow(sample) as unknown as Record<string, unknown>;
    const src = sample as unknown as Record<string, unknown>;
    for (const [pascal, snake] of Object.entries(FIELD_MAP)) {
      expect(out[snake]).toEqual(src[pascal]);
    }
    expect(Object.keys(FIELD_MAP)).toHaveLength(9);
  });
});

describe('toPartitionKey — yyyymm 補零', () => {
  it('個位數月份補零（3 → "03"）', () => {
    expect(toPartitionKey({ Year: 2026, Month: 3 })).toBe('202603');
  });
  it('兩位數月份不變（12 → "12"）', () => {
    expect(toPartitionKey({ Year: 2025, Month: 12 })).toBe('202512');
  });
  it('partitionPrefix 組出 Hive 風格 S3 路徑', () => {
    expect(partitionPrefix('202603')).toBe('cleaned_v2/yyyymm=202603/');
  });
});

describe('toParquetRows — 批次', () => {
  it('逐列轉換、長度一致', () => {
    const rows = toParquetRows([sample, { ...sample, Month: 12, counts: 7 }]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ month: 12, counts: 7 });
  });
});
