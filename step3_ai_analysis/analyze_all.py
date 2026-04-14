# -*- coding: utf-8 -*-
"""Step 3 - AI 跨檔案分析（CLI 版，無 GUI）

讀取:
  ../step1_cleaning/cleaned_202603/monthly/M06A_202603_hourly_counts_all.csv
  ../step2_visualization/charts/**/*.png  (僅收集檔名作為引用)
  ./rag_knowledge.json  (路段背景)

做法:
  1. 用 pandas 預算一批統計特徵（日均、尖峰時段、車種占比、星期差異、異常日偵測）
  2. 把統計摘要 + RAG 背景 + 圖表清單 餵給 Gemini 2.5 Flash
  3. 要求模型找出 3-5 個「有意思的發現」並對每個發現引用對應圖表
  4. 寫到 analysis_report.md（含 Markdown 圖片引用，可直接塞進 PPT content）

.env 位置:
  優先讀 step3_ai_analysis/.env, 其次 ../../ai_workspace/.env
  需要 GEMINI_API_KEY (或 GEMINI_MODEL, 預設 gemini-2.5-flash)
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

import pandas as pd


SCRIPT_DIR = Path(__file__).resolve().parent
CLEANED_CSV = SCRIPT_DIR.parent / "step1_cleaning" / "cleaned_202603" / "monthly" / "M06A_202603_hourly_counts_all.csv"
CHARTS_DIR = SCRIPT_DIR.parent / "step2_visualization" / "charts"
RAG_PATH = SCRIPT_DIR / "rag_knowledge.json"
OUT_MD = SCRIPT_DIR / "analysis_report.md"

GANTRIES = [
    ("01F2930N", "下營系統→新營"),
    ("01F2930S", "新營→下營系統"),
    ("01F3019N", "麻豆→下營系統"),
    ("01F3019S", "下營系統→麻豆"),
]
VT_MAPPING = {31: "Sedan", 32: "Pickup", 41: "Bus", 42: "Truck", 5: "Trailer"}
WEEKDAY_NAMES = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}


def load_dotenv_try(paths: list[Path]) -> None:
    for p in paths:
        if not p.is_file():
            continue
        with open(p, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                os.environ.setdefault(k, v)


def compute_stats(df: pd.DataFrame) -> dict:
    out: dict = {"gantries": {}, "global": {}}
    df = df.copy()
    df["VehicleType"] = df["VehicleType"].astype(int)
    df["Day"] = df["Day"].astype(int)
    df["Hour_0"] = df["Hour_0"].astype(int)
    df["Weekday"] = df["Weekday"].astype(int)

    for g, label in GANTRIES:
        sub = df[df["GantryID_O"] == g]
        if sub.empty:
            out["gantries"][g] = {"label": label, "available": False}
            continue

        daily_total = sub.groupby("Day")["counts"].sum()
        hour_avg = sub.groupby("Hour_0")["counts"].sum() / daily_total.count()
        peak_hour = int(hour_avg.idxmax())
        off_hour = int(hour_avg.idxmin())
        vt_share = sub.groupby("VehicleType")["counts"].sum()
        vt_share = (vt_share / vt_share.sum() * 100).round(2).to_dict()
        wd_avg = sub.groupby(["Weekday", "Day"])["counts"].sum().groupby("Weekday").mean().round(1).to_dict()

        # 異常日：日總量偏離平均 > 2 std
        mean = daily_total.mean()
        std = daily_total.std(ddof=0) or 1.0
        anomalies = []
        for day, total in daily_total.items():
            z = (total - mean) / std
            if abs(z) >= 2.0:
                anomalies.append({"day": int(day), "total": int(total), "z": round(float(z), 2)})

        out["gantries"][g] = {
            "label": label,
            "available": True,
            "days_with_data": int(daily_total.count()),
            "daily_total_mean": int(mean),
            "daily_total_std": int(std),
            "peak_hour": peak_hour,
            "peak_hour_avg": round(float(hour_avg.max()), 1),
            "off_hour": off_hour,
            "off_hour_avg": round(float(hour_avg.min()), 1),
            "vehicle_share_pct": {f"VT={k}({VT_MAPPING.get(int(k), '?')})": v for k, v in vt_share.items()},
            "weekday_daily_avg": {WEEKDAY_NAMES.get(int(k), str(k)): v for k, v in wd_avg.items()},
            "anomaly_days": anomalies,
        }

    out["global"]["total_rows"] = int(len(df))
    out["global"]["days_covered"] = sorted(df["Day"].unique().astype(int).tolist())
    return out


def collect_chart_files() -> list[str]:
    if not CHARTS_DIR.is_dir():
        return []
    return sorted(str(p.relative_to(SCRIPT_DIR.parent)) for p in CHARTS_DIR.rglob("*.png"))


def build_prompt(stats: dict, rag: dict, charts: list[str]) -> tuple[str, str]:
    system = (
        "你是國道1號下營系統-麻豆段（TDCS M06A）的交通資料分析師。\n"
        "任務：從提供的統計數據與圖表清單中，找出 3-5 個「有意思的發現」。\n"
        "要求：\n"
        "1. 每個發現要引用具體數字（尖峰時段、車種占比、星期差異等）。\n"
        "2. 每個發現附帶一張最能佐證它的圖表（用 Markdown 圖片語法）。\n"
        "3. 使用繁體中文，以 Markdown 格式輸出。\n"
        "4. 最後附一段「資料正確性稽核」段落，說明是否觀察到缺日、極端值、或車種比例異常，"
        "   並建議人工複核哪些日期。\n"
        "5. 報告結構：\n"
        "   # 下營系統-麻豆段 3月流量 AI 分析報告\n"
        "   ## 數據概覽（1 段）\n"
        "   ## 有意思的發現（3~5 項，每項含標題、說明、圖表引用）\n"
        "   ## 資料正確性稽核\n"
        "6. 圖表引用格式：![說明](../step2_visualization/charts/...png)\n"
        "   可用圖表清單見 user prompt。\n"
        "7. 禁止寒暄語、禁止使用 emoji。"
    )

    rag_summary = "\n".join(f"- {c['title']}：{c['text']}" for c in rag.get("rag_chunks", []))

    user = (
        f"【路段背景】\n{rag_summary}\n\n"
        f"【統計摘要 JSON】\n```json\n{json.dumps(stats, ensure_ascii=False, indent=2)}\n```\n\n"
        f"【可用圖表清單（相對 final_presentation/）】\n"
        + "\n".join(f"- {c}" for c in charts)
        + "\n\n請根據以上資料撰寫分析報告。"
    )
    return system, user


def _sanitize(text: str) -> str:
    if not text:
        return ""
    t = text.strip()
    for bad in ["好的，以下是", "好的，", "以下是", "當然可以", "沒問題，"]:
        if t.startswith(bad):
            t = t[len(bad):].lstrip()
            break
    t = re.sub(r"```[\w]*\n?", "", t)  # 去程式區塊標記但保留內容
    return t


def call_gemini(system: str, user: str) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        raise RuntimeError("GEMINI_API_KEY 未設定")

    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    model = genai.GenerativeModel(model_name, system_instruction=system)

    gen_config = {"temperature": 0.2, "top_p": 0.8, "max_output_tokens": 16384}
    try:
        import google.generativeai as gt
        gen_config["thinking_config"] = gt.types.ThinkingConfig(thinking_budget=2048)
    except (AttributeError, ImportError):
        pass

    resp = model.generate_content(user, generation_config=gen_config)
    if not resp or not resp.text:
        raise RuntimeError("Gemini 回傳空白")
    return _sanitize(resp.text)


def fallback_report(stats: dict, charts: list[str]) -> str:
    lines = [
        "# 下營系統-麻豆段 3月流量 AI 分析報告（本地備用）",
        "",
        "> Gemini API 未成功呼叫，以下為本地統計摘要備用版本。",
        "",
        "## 數據概覽",
        f"- 總樣本列數: {stats['global']['total_rows']:,}",
        f"- 涵蓋天數: {len(stats['global']['days_covered'])}",
        "",
    ]
    for g, label in GANTRIES:
        info = stats["gantries"].get(g, {})
        if not info.get("available"):
            lines.append(f"### {g} ({label}) - 無資料")
            continue
        lines += [
            f"### {g} ({label})",
            f"- 日均車流: {info['daily_total_mean']:,} (std {info['daily_total_std']:,})",
            f"- 尖峰時段: {info['peak_hour']:02d}:00 (平均 {info['peak_hour_avg']:.0f} 輛)",
            f"- 離峰時段: {info['off_hour']:02d}:00 (平均 {info['off_hour_avg']:.0f} 輛)",
            f"- 車種占比: {info['vehicle_share_pct']}",
            f"- 星期平均: {info['weekday_daily_avg']}",
            f"- 異常日: {info['anomaly_days']}",
            "",
        ]
    lines.append("## 圖表清單")
    for c in charts:
        lines.append(f"![{Path(c).stem}](../{c})")
    return "\n".join(lines)


def main() -> int:
    load_dotenv_try([
        SCRIPT_DIR / ".env",
        SCRIPT_DIR.parent.parent / "ai_workspace" / ".env",
    ])

    if not CLEANED_CSV.is_file():
        print(f"[error] 找不到清洗輸出: {CLEANED_CSV}", file=sys.stderr)
        return 2

    df = pd.read_csv(CLEANED_CSV)
    stats = compute_stats(df)
    rag = json.loads(RAG_PATH.read_text(encoding="utf-8")) if RAG_PATH.is_file() else {}
    charts = collect_chart_files()

    print(f"[stats] 匝道: {len(stats['gantries'])} | 圖表: {len(charts)}")

    system, user = build_prompt(stats, rag, charts)

    header = (
        f"<!-- Generated {datetime.now().isoformat(timespec='seconds')} -->\n"
        f"<!-- Cleaned rows: {stats['global']['total_rows']:,}, "
        f"Days: {len(stats['global']['days_covered'])} -->\n\n"
    )

    try:
        body = call_gemini(system, user)
        report = header + body
        print("[ok] Gemini 分析完成")
    except Exception as e:
        print(f"[warn] Gemini 失敗，改用本地備用: {e}")
        report = header + fallback_report(stats, charts)

    OUT_MD.write_text(report, encoding="utf-8")
    print(f"[done] 已寫入 {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
