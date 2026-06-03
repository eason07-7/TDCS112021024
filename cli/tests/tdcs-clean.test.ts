/**
 * Unit tests for cli/src/lib/tdcs-clean.ts
 * M4 品質保證：happy path + edge cases
 */
import {
  readOneCsv,
  cleanRawDf,
  buildHourlyAggregation,
  mergeHourlyAccumulator,
  addWeekIndex,
  toCsvString,
} from '../src/lib/tdcs-clean';

// ─── readOneCsv ───────────────────────────────────────────────────────────

describe('readOneCsv', () => {
  const tmpFile = require('node:os').tmpdir() + '/test_raw.csv';
  const fs = require('node:fs');

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  test('skips numeric header row (0,1,2,...)', () => {
    fs.writeFileSync(tmpFile,
      '0,1,2,3,4,5,6,7\n' +
      '31,2026-03-01 00:00:00,01F2930N,2026-03-01 00:05:00,01F2930N,10.5,Y,X\n'
    );
    const rows = readOneCsv(tmpFile);
    expect(rows).toHaveLength(1);
    expect(rows[0].VehicleType).toBe('31');
    expect(rows[0].GantryID_O).toBe('01F2930N');
  });

  test('reads file without header row', () => {
    fs.writeFileSync(tmpFile,
      '31,2026-03-01 01:00:00,01F2930N,2026-03-01 01:05:00,01F2930N,5.0,Y,X\n'
    );
    const rows = readOneCsv(tmpFile);
    expect(rows).toHaveLength(1);
  });

  test('returns empty array for empty file', () => {
    fs.writeFileSync(tmpFile, '');
    expect(readOneCsv(tmpFile)).toEqual([]);
  });

  test('handles file with only header row', () => {
    fs.writeFileSync(tmpFile, '0,1,2,3,4,5,6,7\n');
    expect(readOneCsv(tmpFile)).toEqual([]);
  });

  test('handles malformed rows gracefully', () => {
    fs.writeFileSync(tmpFile,
      '0,1,2,3,4,5,6,7\n' +
      '31,2026-03-01 00:00:00,01F2930N\n' +  // short row
      '31,2026-03-01 00:05:00,01F2930N,2026-03-01 00:10:00,01F2930N,10.0,Y,X\n'
    );
    const rows = readOneCsv(tmpFile);
    expect(rows).toHaveLength(2);  // both rows parsed (short row gets empty fields)
  });
});

// ─── cleanRawDf ──────────────────────────────────────────────────────────

describe('cleanRawDf', () => {
  const baseRow = {
    VehicleType: '31',
    DetectionTime_O: '2026-03-01 08:00:00',
    GantryID_O: '01F2930N',
    DetectionTime_D: '2026-03-01 08:30:00',
    GantryID_D: '01F3019N',
    TripLength: '10.5',
    TripEnd: 'Y',
    TripInformation: 'X',
  };

  test('happy path: matching gantry O', () => {
    const rows = cleanRawDf([baseRow], ['01F2930N'], 2026, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].Year).toBe(2026);
    expect(rows[0].Month).toBe(3);
    expect(rows[0].Day).toBe(1);
    expect(rows[0].Hour_0).toBe(8);
    expect(rows[0].VehicleType).toBe(31);
    expect(rows[0].TargetGantry).toBe('01F2930N');  // O is in filter
  });

  test('matching via gantry D', () => {
    const rows = cleanRawDf([{ ...baseRow, GantryID_O: '01F9999N' }], ['01F3019N'], 2026, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].TargetGantry).toBe('01F3019N');  // D is in filter
  });

  test('drops row when neither O nor D in filter', () => {
    const rows = cleanRawDf([baseRow], ['99F0000N'], 2026, 3);
    expect(rows).toHaveLength(0);
  });

  test('drops row with wrong year', () => {
    expect(cleanRawDf([baseRow], ['01F2930N'], 2025, 3)).toHaveLength(0);
  });

  test('drops row with wrong month', () => {
    expect(cleanRawDf([baseRow], ['01F2930N'], 2026, 4)).toHaveLength(0);
  });

  test('drops row with non-numeric VehicleType', () => {
    expect(cleanRawDf([{ ...baseRow, VehicleType: 'abc' }], ['01F2930N'], 2026, 3)).toHaveLength(0);
  });

  test('drops row with invalid DetectionTime_O', () => {
    expect(cleanRawDf([{ ...baseRow, DetectionTime_O: 'invalid' }], ['01F2930N'], 2026, 3)).toHaveLength(0);
  });

  test('drops row with empty GantryID_O', () => {
    expect(cleanRawDf([{ ...baseRow, GantryID_O: '' }], ['01F2930N'], 2026, 3)).toHaveLength(0);
  });

  test('weekday: 2026-03-01 is Sunday → weekday=7', () => {
    const rows = cleanRawDf([baseRow], ['01F2930N'], 2026, 3);
    expect(rows[0].Weekday).toBe(7);  // Sunday in Python convention (1=Mon, 7=Sun)
  });

  test('weekday: 2026-03-02 is Monday → weekday=1', () => {
    const row = { ...baseRow, DetectionTime_O: '2026-03-02 08:00:00' };
    const rows = cleanRawDf([row], ['01F2930N'], 2026, 3);
    expect(rows[0].Weekday).toBe(1);
  });

  test('date range filtering: dateStart/dateEnd', () => {
    const row1 = { ...baseRow, DetectionTime_O: '2026-03-01 08:00:00' };
    const row2 = { ...baseRow, DetectionTime_O: '2026-03-15 08:00:00' };
    const row3 = { ...baseRow, DetectionTime_O: '2026-03-31 08:00:00' };
    const rows = cleanRawDf([row1, row2, row3], ['01F2930N'], 2026, 3, 5, 20);
    expect(rows).toHaveLength(1);
    expect(rows[0].Day).toBe(15);
  });
});

// ─── buildHourlyAggregation ──────────────────────────────────────────────

describe('buildHourlyAggregation', () => {
  const makeRow = (overrides: Partial<any> = {}) => ({
    VehicleType: 31, TripLength: null,
    Year: 2026, Month: 3, Day: 1, Hour_0: 8, Weekday: 7,
    GantryID_O: '01F2930N', GantryID_D: '01F3019N', TargetGantry: '01F2930N',
    ...overrides,
  });

  test('counts per group', () => {
    const rows = [makeRow(), makeRow(), makeRow({ VehicleType: 42 })];
    const hourly = buildHourlyAggregation(rows);
    expect(hourly).toHaveLength(2);
    const r31 = hourly.find(r => r.VehicleType === 31)!;
    expect(r31.counts).toBe(2);
    const r42 = hourly.find(r => r.VehicleType === 42)!;
    expect(r42.counts).toBe(1);
  });

  test('renames TargetGantry → GantryID_O', () => {
    const hourly = buildHourlyAggregation([makeRow()]);
    expect(hourly[0].GantryID_O).toBe('01F2930N');
  });

  test('sort order: Day, Hour_0, GantryID_O, VehicleType', () => {
    const rows = [
      makeRow({ Day: 2, Hour_0: 0, VehicleType: 31 }),
      makeRow({ Day: 1, Hour_0: 5, VehicleType: 31 }),
      makeRow({ Day: 1, Hour_0: 0, VehicleType: 42 }),
      makeRow({ Day: 1, Hour_0: 0, VehicleType: 31 }),
    ];
    const hourly = buildHourlyAggregation(rows);
    expect(hourly[0]).toMatchObject({ Day: 1, Hour_0: 0, VehicleType: 31 });
    expect(hourly[1]).toMatchObject({ Day: 1, Hour_0: 0, VehicleType: 42 });
    expect(hourly[2]).toMatchObject({ Day: 1, Hour_0: 5, VehicleType: 31 });
    expect(hourly[3]).toMatchObject({ Day: 2, Hour_0: 0, VehicleType: 31 });
  });
});

// ─── mergeHourlyAccumulator ──────────────────────────────────────────────

describe('mergeHourlyAccumulator', () => {
  const makeHourly = (overrides: Partial<any> = {}) => ({
    Year: 2026, Month: 3, Day: 1, Hour_0: 0, Weekday: 7,
    GantryID_O: '01F2930N', VehicleType: 31, counts: 10,
    ...overrides,
  });

  test('returns part when acc is empty', () => {
    const part = [makeHourly()];
    expect(mergeHourlyAccumulator([], part)).toEqual(part);
  });

  test('sums counts for same key', () => {
    const acc = [makeHourly({ counts: 5 })];
    const part = [makeHourly({ counts: 3 })];
    const merged = mergeHourlyAccumulator(acc, part);
    expect(merged).toHaveLength(1);
    expect(merged[0].counts).toBe(8);
  });

  test('different keys remain separate', () => {
    const acc = [makeHourly({ VehicleType: 31, counts: 5 })];
    const part = [makeHourly({ VehicleType: 42, counts: 3 })];
    const merged = mergeHourlyAccumulator(acc, part);
    expect(merged).toHaveLength(2);
  });
});

// ─── addWeekIndex ─────────────────────────────────────────────────────────

describe('addWeekIndex', () => {
  const makeH = (day: number) => ({
    Year: 2026, Month: 3, Day: day, Hour_0: 0, Weekday: 1,
    GantryID_O: '01F2930N', VehicleType: 31, counts: 1,
  });

  test('WeekIndex = floor((Day-1)/7) + 1', () => {
    const rows = addWeekIndex([makeH(1), makeH(7), makeH(8), makeH(31)]);
    expect(rows[0].WeekIndex).toBe(1);  // day 1 → (0)/7+1 = 1
    expect(rows[1].WeekIndex).toBe(1);  // day 7 → (6)/7+1 = 1
    expect(rows[2].WeekIndex).toBe(2);  // day 8 → (7)/7+1 = 2
    expect(rows[3].WeekIndex).toBe(5);  // day 31 → (30)/7+1 = 5
  });
});

// ─── toCsvString ─────────────────────────────────────────────────────────

describe('toCsvString', () => {
  test('starts with UTF-8 BOM', () => {
    const csv = toCsvString([]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);  // BOM
  });

  test('uses CRLF line endings', () => {
    const csv = toCsvString([]);
    expect(csv).toContain('\r\n');
    expect(csv).not.toMatch(/(?<!\r)\n/);  // no bare LF
  });

  test('correct header', () => {
    const csv = toCsvString([]);
    const firstLine = csv.replace(/^﻿/, '').split('\r\n')[0];
    expect(firstLine).toBe('Year,Month,Day,Weekday,Hour_0,GantryID_O,VehicleType,counts,WeekIndex');
  });

  test('correct data row format', () => {
    const row = {
      Year: 2026, Month: 3, Day: 1, Weekday: 7, Hour_0: 0,
      GantryID_O: '01F2930N', VehicleType: 31, counts: 324, WeekIndex: 1,
    };
    const csv = toCsvString([row]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[1]).toBe('2026,3,1,7,0,01F2930N,31,324,1');
  });

  test('ends with CRLF', () => {
    const csv = toCsvString([]);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
