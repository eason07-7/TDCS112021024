#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Step 1 - TDCS M06A 202603 批次清洗（下營/麻豆段 4 匝道版）

複製自 TDCS_M06A_Batch_Cleaning_202603.py，僅變更：
- INPUT_DIR -> 指向 step0_s3_download/raw_202603
- OUTPUT_DIR -> 本資料夾 cleaned_202603
- GANTRY_FILTER_LIST -> 01F2930N/S, 01F3019N/S
- 同時以 GantryID_O 或 GantryID_D 命中即保留（兼顧北上/南下雙向統計）
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import glob
import pandas as pd


# ============================================
# 配置
# ============================================
SCRIPT_DIR = Path(__file__).resolve().parent
INPUT_DIR = str(SCRIPT_DIR.parent / "step0_s3_download" / "raw_202603")
OUTPUT_DIR = str(SCRIPT_DIR / "cleaned_202603")
YEAR = 2026
MONTH = 3
DATE_START = 1
DATE_END = 31

# 4 個目標匝道
GANTRY_FILTER_LIST = [
    '01F2930N',  # 下營系統 -> 新營
    '01F2930S',  # 新營 -> 下營系統
    '01F3019N',  # 麻豆 -> 下營系統
    '01F3019S',  # 下營系統 -> 麻豆
]

RAW_COLUMNS = [
    "VehicleType", "DetectionTime_O", "GantryID_O",
    "DetectionTime_D", "GantryID_D",
    "TripLength", "TripEnd", "TripInformation",
]


@dataclass
class CleanResult:
    scanned_rows: int
    cleaned_rows: int
    hourly_rows: int
    file_count: int


def list_csv_files(input_dir: str) -> list[str]:
    return sorted(glob.glob(f"{input_dir}/**/*.csv", recursive=True))


def read_one_csv(file_path: str) -> pd.DataFrame:
    df = pd.read_csv(file_path, header=None, dtype=str, low_memory=False)
    if not df.empty:
        first_row = df.iloc[0].tolist()
        if first_row == [str(i) for i in range(len(first_row))]:
            df = df.iloc[1:].reset_index(drop=True)
    df = df.iloc[:, :8].copy()
    df.columns = RAW_COLUMNS
    return df


def clean_raw_df(raw_df: pd.DataFrame) -> pd.DataFrame:
    df = raw_df.copy()
    df["VehicleType"] = pd.to_numeric(df["VehicleType"], errors="coerce")
    df["TripLength"] = pd.to_numeric(df["TripLength"], errors="coerce")
    df["DetectionTime_O"] = pd.to_datetime(df["DetectionTime_O"], errors="coerce")
    df = df.dropna(subset=["DetectionTime_O", "GantryID_O", "VehicleType"])

    df["Year"] = df["DetectionTime_O"].dt.year
    df["Month"] = df["DetectionTime_O"].dt.month
    df["Day"] = df["DetectionTime_O"].dt.day
    df["Hour_0"] = df["DetectionTime_O"].dt.hour
    df["Weekday"] = df["DetectionTime_O"].dt.weekday + 1

    df = df[
        (df["Year"] == YEAR)
        & (df["Month"] == MONTH)
        & (df["Day"] >= DATE_START)
        & (df["Day"] <= DATE_END)
    ].copy()

    df["GantryID_O"] = df["GantryID_O"].astype(str).str.strip()
    df["GantryID_D"] = df["GantryID_D"].astype(str).str.strip()

    # 命中 O 或 D 皆保留
    if GANTRY_FILTER_LIST:
        mask = df["GantryID_O"].isin(GANTRY_FILTER_LIST) | df["GantryID_D"].isin(GANTRY_FILTER_LIST)
        df = df[mask].copy()

    # 為了後續按「目標匝道」統計，新增 TargetGantry 欄位（優先取 O，若 O 非目標則取 D）
    in_o = df["GantryID_O"].isin(GANTRY_FILTER_LIST)
    df["TargetGantry"] = df["GantryID_O"].where(in_o, df["GantryID_D"])

    return df


def build_hourly_aggregation(cleaned_df: pd.DataFrame) -> pd.DataFrame:
    grouped = (
        cleaned_df.groupby(
            ["Year", "Month", "Day", "Weekday", "Hour_0", "TargetGantry", "VehicleType"],
            as_index=False,
        )
        .size()
        .rename(columns={"size": "counts", "TargetGantry": "GantryID_O"})
        .sort_values(["Day", "Hour_0", "GantryID_O", "VehicleType"])
        .reset_index(drop=True)
    )
    return grouped


def merge_hourly_accumulator(acc: pd.DataFrame, part: pd.DataFrame) -> pd.DataFrame:
    if acc.empty:
        return part
    merged = pd.concat([acc, part], ignore_index=True)
    merged = (
        merged.groupby(
            ["Year", "Month", "Day", "Weekday", "Hour_0", "GantryID_O", "VehicleType"],
            as_index=False,
        )["counts"]
        .sum()
        .sort_values(["Day", "Hour_0", "GantryID_O", "VehicleType"])
        .reset_index(drop=True)
    )
    return merged


def process_files_incrementally(input_dir: str) -> tuple[pd.DataFrame, int, int, int]:
    files = list_csv_files(input_dir)
    if not files:
        raise FileNotFoundError(f"找不到 CSV：{input_dir}")

    hourly_acc = pd.DataFrame(
        columns=["Year", "Month", "Day", "Weekday", "Hour_0", "GantryID_O", "VehicleType", "counts"]
    )

    scanned_rows = 0
    cleaned_rows = 0
    ok_files = 0

    for i, file_path in enumerate(files, start=1):
        try:
            raw_df = read_one_csv(file_path)
            scanned_rows += len(raw_df)
            cleaned_df = clean_raw_df(raw_df)
            cleaned_rows += len(cleaned_df)
            if not cleaned_df.empty:
                part_hourly = build_hourly_aggregation(cleaned_df)
                hourly_acc = merge_hourly_accumulator(hourly_acc, part_hourly)
            ok_files += 1
            if i % 20 == 0 or i == len(files):
                print(
                    f"  已處理 {i}/{len(files)} 檔 | "
                    f"掃描 {scanned_rows:,} 筆 | 清洗 {cleaned_rows:,} 筆 | 彙總列 {len(hourly_acc):,}"
                )
        except Exception as exc:
            print(f"  ⚠️ 略過檔案：{Path(file_path).name}，原因：{exc}")

    if hourly_acc.empty:
        raise RuntimeError("清洗後沒有可用資料，請檢查來源檔案與日期範圍")

    return hourly_acc, scanned_rows, cleaned_rows, ok_files


def add_week_index(hourly_df: pd.DataFrame) -> pd.DataFrame:
    df = hourly_df.copy()
    df["WeekIndex"] = ((df["Day"] - 1) // 7) + 1
    return df


def save_outputs(hourly_df: pd.DataFrame, output_dir: str) -> None:
    out = Path(output_dir)
    (out / "monthly").mkdir(parents=True, exist_ok=True)
    (out / "weekly").mkdir(parents=True, exist_ok=True)
    (out / "daily").mkdir(parents=True, exist_ok=True)

    hourly_with_week = add_week_index(hourly_df)
    hourly_with_week.to_csv(out / "monthly" / "M06A_202603_hourly_counts_all.csv",
                            index=False, encoding="utf-8-sig")

    for week_idx in sorted(hourly_with_week["WeekIndex"].unique()):
        wdf = hourly_with_week[hourly_with_week["WeekIndex"] == week_idx]
        wdf.to_csv(out / "weekly" / f"M06A_202603_week{int(week_idx)}_hourly_counts.csv",
                   index=False, encoding="utf-8-sig")

    for day in sorted(hourly_with_week["Day"].unique()):
        ddf = hourly_with_week[hourly_with_week["Day"] == day]
        ddf.to_csv(out / "daily" / f"M06A_202603_day{int(day):02d}_hourly_counts.csv",
                   index=False, encoding="utf-8-sig")


def save_summary_report(output_dir: str, result: CleanResult) -> None:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    retained_rate = (result.cleaned_rows / result.scanned_rows * 100) if result.scanned_rows else 0.0
    hourly_rate = (result.hourly_rows / result.cleaned_rows * 100) if result.cleaned_rows else 0.0
    report = (
        "TDCS M06A 202603 清洗摘要（下營/麻豆段）\n"
        + "=" * 40 + "\n"
        f"目標匝道: {', '.join(GANTRY_FILTER_LIST)}\n"
        f"來源檔案數: {result.file_count}\n"
        f"原始掃描筆數: {result.scanned_rows:,}\n"
        f"清洗後筆數: {result.cleaned_rows:,}\n"
        f"保留率: {retained_rate:.2f}%\n"
        f"小時彙總筆數: {result.hourly_rows:,}\n"
        f"彙總率: {hourly_rate:.2f}%\n"
    )
    (out / "summary_report.txt").write_text(report, encoding="utf-8")


def run_cleaning() -> CleanResult:
    print("=" * 72)
    print("Step 1 - TDCS M06A 202603 批次清洗（下營/麻豆段）")
    print("=" * 72)
    print(f"來源: {INPUT_DIR}")
    print(f"輸出: {OUTPUT_DIR}")
    print(f"日期: {YEAR}/{MONTH:02d}/{DATE_START:02d} ~ {YEAR}/{MONTH:02d}/{DATE_END:02d}")
    print(f"匝道: {', '.join(GANTRY_FILTER_LIST)}")

    hourly_df, scanned, cleaned, fcount = process_files_incrementally(INPUT_DIR)
    print(f"\n✅ 檔案: {fcount} | 掃描: {scanned:,} | 清洗: {cleaned:,} | 小時彙總: {len(hourly_df):,}")

    save_outputs(hourly_df, OUTPUT_DIR)
    save_summary_report(OUTPUT_DIR, CleanResult(scanned, cleaned, len(hourly_df), fcount))
    print(f"✅ 輸出完成 -> {OUTPUT_DIR}")
    return CleanResult(scanned, cleaned, len(hourly_df), fcount)


if __name__ == "__main__":
    run_cleaning()
