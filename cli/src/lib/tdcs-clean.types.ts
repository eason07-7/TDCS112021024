/** Column names of raw TDCS M06A CSV (matches tdcs_clean/config.py RAW_COLUMNS) */
export const RAW_COLUMNS = [
  'VehicleType',
  'DetectionTime_O',
  'GantryID_O',
  'DetectionTime_D',
  'GantryID_D',
  'TripLength',
  'TripEnd',
  'TripInformation',
] as const;

export type RawColumnName = typeof RAW_COLUMNS[number];

/** One row from raw TDCS M06A CSV (all strings, dtype=str) */
export interface RawRow {
  VehicleType: string;
  DetectionTime_O: string;
  GantryID_O: string;
  DetectionTime_D: string;
  GantryID_D: string;
  TripLength: string;
  TripEnd: string;
  TripInformation: string;
}

/** Row after clean_raw_df — typed fields + computed time components */
export interface CleanedRow {
  VehicleType: number;
  TripLength: number | null;
  Year: number;
  Month: number;
  Day: number;
  Hour_0: number;
  Weekday: number;   // 1=Mon, 2=Tue, ..., 7=Sun (matches Python weekday()+1)
  GantryID_O: string;
  GantryID_D: string;
  TargetGantry: string;
}

/** One row in the hourly aggregation (output of build_hourly_aggregation) */
export interface HourlyRow {
  Year: number;
  Month: number;
  Day: number;
  Weekday: number;
  Hour_0: number;
  GantryID_O: string;   // renamed from TargetGantry
  VehicleType: number;
  counts: number;
}

/** HourlyRow + WeekIndex (output of add_week_index) */
export interface HourlyRowWithWeek extends HourlyRow {
  WeekIndex: number;
}

/** Result summary (matches Python CleanResult dataclass) */
export interface CleanResult {
  scanned_rows: number;
  cleaned_rows: number;
  hourly_rows: number;
  file_count: number;
}
