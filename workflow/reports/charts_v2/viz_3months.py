# -*- coding: utf-8 -*-
"""期末視覺化（v2 / 3 個月 / 4 匝道）— 仿期中 step2_visualization 結構

讀 cleaned_v2 三月份 Parquet（202603 + 202604 + 202605）、產出：
  1. 每匝道 24H 多日疊加（chart1、仿期中）
  2. 每匝道 車種 × 星期 grouped bar（chart2、仿期中）
  3. 跨匝道 每日總車流（_overview_daily_total、仿期中）
  4. 跨月 每日總車流（_overview_monthly_trend、v2 新增、配 §4.3 narrative）
  5. 跨月 車種分佈（_overview_vehicletype_by_month、v2 新增）

5月 cleaned 只 2 匝道（南下、demo run）、北上匝道 charts 用 3+4月、南下匝道用 3 月份。

輸出 charts_v2/<GANTRY>/*.png 與 charts_v2/_overview_*.png。
"""
from __future__ import annotations
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "_data"
OUT_DIR = SCRIPT_DIR

GANTRIES = [
    ("01F2930N", "下營系統→新營（北上）"),
    ("01F2930S", "新營→下營系統（南下）"),
    ("01F3019N", "麻豆→下營系統（北上）"),
    ("01F3019S", "下營系統→麻豆（南下）"),
]
VT_MAPPING = {31: "Sedan", 32: "Pickup", 41: "Bus", 42: "Truck", 5: "Trailer"}
VT_ORDER = [31, 32, 41, 42, 5]
WEEKDAY_NAMES = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}
MONTH_NAMES = {3: "Mar", 4: "Apr", 5: "May"}

plt.rcParams["font.sans-serif"] = ["Microsoft JhengHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


def load_all() -> pd.DataFrame:
    dfs = []
    for m in ("202603", "202604", "202605"):
        df = pd.read_parquet(DATA_DIR / f"{m}.parquet")
        df["yyyymm"] = m
        dfs.append(df)
    return pd.concat(dfs, ignore_index=True)


def plot_chart1_24h(df: pd.DataFrame, gantry: str, label: str, out_dir: Path) -> None:
    """圖①：24H 多日疊加、所有車種加總、半透明線"""
    sub = df[df["gantry_id_o"] == gantry]
    if sub.empty:
        print(f"  [skip] {gantry} chart1: 無資料"); return
    daily_24h = sub.groupby(["yyyymm", "day", "hour_0"])["counts"].sum().reset_index()
    fig, ax = plt.subplots(figsize=(11, 5))
    for (ym, day), g in daily_24h.groupby(["yyyymm", "day"]):
        g = g.set_index("hour_0").reindex(range(24), fill_value=0)
        ax.plot(g.index, g["counts"].values, alpha=0.15, color="steelblue", linewidth=0.7)
    mean_24h = daily_24h.groupby("hour_0")["counts"].mean().reindex(range(24), fill_value=0)
    ax.plot(mean_24h.index, mean_24h.values, color="crimson", linewidth=2.2, label="日均")
    ax.set_xlabel("Hour of Day"); ax.set_ylabel("Traffic (counts)")
    ax.set_title(f"{gantry} {label}\n24H 多日疊加（3+4+5月）、紅線=日均")
    ax.set_xticks(range(0, 24, 2)); ax.legend(); ax.grid(True, alpha=0.3)
    plt.tight_layout(); plt.savefig(out_dir / f"chart1_24H_{gantry}.png", dpi=110); plt.close()
    print(f"  ✓ chart1_24H_{gantry}.png")


def plot_chart2_vt_weekday(df: pd.DataFrame, gantry: str, label: str, out_dir: Path) -> None:
    """圖②：車種 × 星期 grouped bar"""
    sub = df[df["gantry_id_o"] == gantry]
    if sub.empty:
        print(f"  [skip] {gantry} chart2: 無資料"); return
    pivot = sub.groupby(["vehicle_type", "weekday"])["counts"].sum().reset_index()
    pivot = pivot.pivot(index="weekday", columns="vehicle_type", values="counts").fillna(0)
    pivot = pivot.reindex(index=range(1, 8), columns=VT_ORDER, fill_value=0)
    x = np.arange(7); width = 0.15
    fig, ax = plt.subplots(figsize=(11, 5))
    for i, vt in enumerate(VT_ORDER):
        ax.bar(x + (i - 2) * width, pivot[vt].values, width, label=f"{vt} {VT_MAPPING[vt]}")
    ax.set_xlabel("Weekday"); ax.set_ylabel("Traffic (counts, 3 個月加總)")
    ax.set_title(f"{gantry} {label}\n車種 × 星期分佈（3+4+5月加總）")
    ax.set_xticks(x); ax.set_xticklabels([WEEKDAY_NAMES[d] for d in range(1, 8)])
    ax.legend(loc="upper right", ncol=2); ax.grid(True, alpha=0.3, axis="y")
    plt.tight_layout(); plt.savefig(out_dir / f"chart2_VT_weekday_{gantry}.png", dpi=110); plt.close()
    print(f"  ✓ chart2_VT_weekday_{gantry}.png")


def plot_overview_daily_total(df: pd.DataFrame) -> None:
    """跨匝道每日總車流（3 月份合併）"""
    daily = df.groupby(["yyyymm", "day", "gantry_id_o"])["counts"].sum().reset_index()
    daily["date"] = pd.to_datetime(
        daily["yyyymm"].str[:4] + "-" + daily["yyyymm"].str[4:] + "-" + daily["day"].astype(str).str.zfill(2),
        errors="coerce")
    fig, ax = plt.subplots(figsize=(13, 5))
    for g, label in GANTRIES:
        sub = daily[daily["gantry_id_o"] == g].sort_values("date")
        if sub.empty: continue
        ax.plot(sub["date"], sub["counts"], marker="o", markersize=3, linewidth=1.1, label=f"{g} {label[:6]}")
    ax.set_xlabel("Date"); ax.set_ylabel("Daily Traffic (counts)")
    ax.set_title("4 匝道每日總車流（2026/03 - 2026/05）")
    ax.legend(loc="upper right", ncol=2); ax.grid(True, alpha=0.3)
    fig.autofmt_xdate()
    plt.tight_layout(); plt.savefig(OUT_DIR / "_overview_daily_total.png", dpi=110); plt.close()
    print("✓ _overview_daily_total.png")


def plot_overview_monthly_trend(df: pd.DataFrame) -> None:
    """跨月每月總車流對比（v2 新增）"""
    monthly = df.groupby(["yyyymm", "gantry_id_o"])["counts"].sum().reset_index()
    pivot = monthly.pivot(index="yyyymm", columns="gantry_id_o", values="counts").fillna(0)
    pivot = pivot.reindex(columns=[g[0] for g in GANTRIES], fill_value=0)
    x = np.arange(len(pivot)); width = 0.2
    fig, ax = plt.subplots(figsize=(11, 5))
    for i, (g, _) in enumerate(GANTRIES):
        ax.bar(x + (i - 1.5) * width, pivot[g].values, width, label=g)
    ax.set_xlabel("Month"); ax.set_ylabel("Monthly Traffic (counts)")
    ax.set_title("4 匝道每月總車流對比（3+4+5月）")
    ax.set_xticks(x); ax.set_xticklabels([MONTH_NAMES[int(ym[4:])] + f"({ym})" for ym in pivot.index])
    ax.legend(loc="upper right", ncol=2); ax.grid(True, alpha=0.3, axis="y")
    plt.tight_layout(); plt.savefig(OUT_DIR / "_overview_monthly_trend.png", dpi=110); plt.close()
    print("✓ _overview_monthly_trend.png")


def plot_overview_vt_by_month(df: pd.DataFrame) -> None:
    """車種跨月分佈（v2 新增）"""
    vt = df.groupby(["yyyymm", "vehicle_type"])["counts"].sum().reset_index()
    pivot = vt.pivot(index="yyyymm", columns="vehicle_type", values="counts").fillna(0)
    pivot = pivot.reindex(columns=VT_ORDER, fill_value=0)
    x = np.arange(len(pivot)); width = 0.15
    fig, ax = plt.subplots(figsize=(11, 5))
    for i, v in enumerate(VT_ORDER):
        ax.bar(x + (i - 2) * width, pivot[v].values, width, label=f"{v} {VT_MAPPING[v]}")
    ax.set_xlabel("Month"); ax.set_ylabel("Traffic (counts)")
    ax.set_title("車種跨月分佈（3+4+5月、log scale）")
    ax.set_yscale("log")
    ax.set_xticks(x); ax.set_xticklabels([MONTH_NAMES[int(ym[4:])] + f"({ym})" for ym in pivot.index])
    ax.legend(loc="upper right", ncol=2); ax.grid(True, alpha=0.3, axis="y")
    plt.tight_layout(); plt.savefig(OUT_DIR / "_overview_vehicletype_by_month.png", dpi=110); plt.close()
    print("✓ _overview_vehicletype_by_month.png")


def main() -> None:
    df = load_all()
    print(f"loaded total rows = {len(df)}, months = {df['yyyymm'].nunique()}")
    for g, label in GANTRIES:
        out_dir = OUT_DIR / g; out_dir.mkdir(parents=True, exist_ok=True)
        print(f"== {g} {label} ==")
        plot_chart1_24h(df, g, label, out_dir)
        plot_chart2_vt_weekday(df, g, label, out_dir)
    print("== overview ==")
    plot_overview_daily_total(df)
    plot_overview_monthly_trend(df)
    plot_overview_vt_by_month(df)
    print("done")


if __name__ == "__main__":
    main()
