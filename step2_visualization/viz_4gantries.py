# -*- coding: utf-8 -*-
"""Step 2 - 視覺化（4 匝道迴圈版）

讀入 step1_cleaning/cleaned_202603/monthly/M06A_202603_hourly_counts_all.csv
對 4 個目標匝道各產兩類圖：
  ① 4匝道總車流 (24H line chart, 多日疊加 per gantry + 一張全匝道 daily-sum 總比較)
  ② 車種 × 星期 (VT=31,32,41,42,5 × Weekday 1..7, grouped bar)

輸出:
  step2_visualization/charts/<GANTRY>/*.png
  step2_visualization/charts/_overview_daily_total.png  (跨4匝道日總量比較)
"""
from __future__ import annotations

from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
CLEANED_CSV = SCRIPT_DIR.parent / "step1_cleaning" / "cleaned_202603" / "monthly" / "M06A_202603_hourly_counts_all.csv"
CHARTS_DIR = SCRIPT_DIR / "charts"

GANTRIES = [
    ("01F2930N", "下營系統→新營"),
    ("01F2930S", "新營→下營系統"),
    ("01F3019N", "麻豆→下營系統"),
    ("01F3019S", "下營系統→麻豆"),
]

VT_MAPPING = {31: "Sedan", 32: "Pickup", 41: "Bus", 42: "Truck", 5: "Trailer"}
WEEKDAY_NAMES = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}


def load_data() -> pd.DataFrame:
    if not CLEANED_CSV.is_file():
        raise FileNotFoundError(f"找不到清洗輸出：{CLEANED_CSV}\n請先跑 Step 1 清洗。")
    df = pd.read_csv(CLEANED_CSV)
    for col in ("Year", "Month", "Day", "Weekday", "Hour_0", "VehicleType", "counts"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["Day", "Hour_0", "VehicleType", "counts"])
    return df


def plot_chart1_total_24h(df: pd.DataFrame, gantry: str, label: str, out_dir: Path) -> None:
    """圖①：該匝道 24H 多日疊加（總車流，所有車種加總）"""
    sub = df[df["GantryID_O"] == gantry]
    if sub.empty:
        print(f"  [skip] {gantry}: 無資料")
        return

    by_day_hour = sub.groupby(["Day", "Hour_0"], as_index=False)["counts"].sum()
    pivot = by_day_hour.pivot(index="Hour_0", columns="Day", values="counts").fillna(0).reindex(range(24), fill_value=0)

    fig, ax = plt.subplots(figsize=(14, 7), dpi=100)
    days = sorted(pivot.columns.tolist())
    colors = plt.cm.viridis(np.linspace(0, 1, len(days)))
    for day, color in zip(days, colors):
        ax.plot(range(24), pivot[day].values, marker="o", linewidth=1.5, alpha=0.75,
                label=f"Day {int(day):02d}", color=color)

    ax.set_title(f"{gantry} ({label}) - 24H Total Traffic (March 2026)", fontsize=13, fontweight="bold")
    ax.set_xlabel("Hour of Day")
    ax.set_ylabel("Vehicle Count")
    ax.set_xticks(range(24))
    ax.grid(True, alpha=0.3)
    ax.legend(loc="upper right", ncol=4, fontsize=7)
    fig.tight_layout()
    fig.savefig(out_dir / f"chart1_total_24H_{gantry}.png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    print(f"  [ok] chart1_total_24H_{gantry}.png")


def plot_chart2_vt_vs_weekday(df: pd.DataFrame, gantry: str, label: str, out_dir: Path) -> None:
    """圖②：車種 × 星期 grouped bar"""
    sub = df[df["GantryID_O"] == gantry]
    if sub.empty:
        return

    # 每個 (VT, Weekday) 的日平均 (因為不同星期幾天數不一)
    by_vt_wd = sub.groupby(["VehicleType", "Weekday", "Day"], as_index=False)["counts"].sum()
    avg = by_vt_wd.groupby(["VehicleType", "Weekday"], as_index=False)["counts"].mean()

    vts = sorted([v for v in avg["VehicleType"].unique() if int(v) in VT_MAPPING])
    weekdays = list(range(1, 8))

    x = np.arange(len(weekdays))
    n_vt = len(vts)
    bar_w = 0.8 / max(n_vt, 1)

    fig, ax = plt.subplots(figsize=(12, 6.5), dpi=100)
    colors = plt.cm.tab10(np.linspace(0, 1, 10))
    for i, vt in enumerate(vts):
        vt_int = int(vt)
        values = []
        for wd in weekdays:
            row = avg[(avg["VehicleType"] == vt) & (avg["Weekday"] == wd)]
            values.append(float(row["counts"].iloc[0]) if not row.empty else 0.0)
        ax.bar(x + i * bar_w - 0.4 + bar_w / 2, values, width=bar_w,
               label=f"VT={vt_int} ({VT_MAPPING.get(vt_int, '?')})", color=colors[i])

    ax.set_title(f"{gantry} ({label}) - VehicleType x Weekday (Daily Avg, March 2026)",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Weekday")
    ax.set_ylabel("Avg Daily Count")
    ax.set_xticks(x)
    ax.set_xticklabels([WEEKDAY_NAMES[w] for w in weekdays])
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(True, axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(out_dir / f"chart2_VT_vs_weekday_{gantry}.png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    print(f"  [ok] chart2_VT_vs_weekday_{gantry}.png")


def plot_overview_all_gantries(df: pd.DataFrame) -> None:
    """跨4匝道每日總量比較"""
    fig, ax = plt.subplots(figsize=(14, 6.5), dpi=100)
    colors = plt.cm.Set1(np.linspace(0, 1, 9))
    for i, (g, label) in enumerate(GANTRIES):
        sub = df[df["GantryID_O"] == g]
        if sub.empty:
            continue
        daily = sub.groupby("Day", as_index=False)["counts"].sum().sort_values("Day")
        ax.plot(daily["Day"].astype(int), daily["counts"], marker="o", linewidth=2,
                label=f"{g} {label}", color=colors[i])

    ax.set_title("4 Gantries Daily Total Traffic (March 2026)", fontsize=13, fontweight="bold")
    ax.set_xlabel("Day of March")
    ax.set_ylabel("Daily Total Vehicle Count")
    ax.grid(True, alpha=0.3)
    ax.legend(loc="best", fontsize=10)
    fig.tight_layout()
    CHARTS_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(CHARTS_DIR / "_overview_daily_total.png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    print("[ok] _overview_daily_total.png")


def main() -> None:
    print("Step 2 - 視覺化 4 匝道")
    print(f"  資料: {CLEANED_CSV}")
    df = load_data()
    print(f"  載入 {len(df):,} 列")

    plot_overview_all_gantries(df)

    for g, label in GANTRIES:
        out_dir = CHARTS_DIR / g
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"[{g}] {label}")
        plot_chart1_total_24h(df, g, label, out_dir)
        plot_chart2_vt_vs_weekday(df, g, label, out_dir)

    print(f"\n✅ 全部圖表輸出至 {CHARTS_DIR}")


if __name__ == "__main__":
    main()
