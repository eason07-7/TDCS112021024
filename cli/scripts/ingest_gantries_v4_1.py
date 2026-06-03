#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M3 — TDCS 手冊 v4.1 §3 門架代碼路段彙整表 Ingest 腳本

輸入：TDCS使用手冊v41b.pdf（§3 門架代碼路段彙整表）
輸出：cli/data/gantries_v4_1.json

使用 pdfminer.six 提取文字（比 pdf-parse JS 版更穩健）。
TypeScript 版（ingest_gantries_v4_1.ts）透過 child_process 呼叫本腳本。

驗證：與 ai_workspace gantry_to_county.json (v3.4) 做 diff，輸出差異報告。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # TDCSprecentater/
PDF_PATH = ROOT / "mcp_workspace/workflow/reports/ref/TDCS使用手冊v41b.pdf"
LEGACY_JSON = ROOT / "config/gantry_to_county.json"  # v3.4, 345 gantries
OUT_JSON = ROOT / "mcp_workspace/cli/data/gantries_v4_1.json"
DIFF_REPORT = ROOT / "mcp_workspace/cli/data/gantries_diff_v3_4_to_v4_1.md"

ROUTE_TABLE_MAP = {
    "表 8": "國1",
    "表 9": "國1H",
    "表 10": "國3",
    "表 11": "國3甲",
    "表 12": "國5",
}
# Route prefix patterns for gantry IDs
ROUTE_PREFIX = {
    "國1": "01F",
    "國1H": "01H",
    "國3": "03F",
    "國3甲": "03A",
    "國5": "05F",
}

# 放寬 regex 涵蓋 FR ramp（如 05FR113S = 兩字母 + 3 數字）
# 原：\d{2}[A-Za-z]\d{4}[NS]（只匹配單字母 + 4 數字）
# 新：\d{2}[A-Za-z]{1,2}\d{3,4}[NS]（涵蓋 FR 兩字母 + 3 數字）
GANTRY_PATTERN = re.compile(r"(\d{2}[A-Za-z]{1,2}\d{3,4}[NS])\s+([^\n]{2,40})")

# F-H1 patch (1)：清除 v3.4 中 4 個錯誤的 note 字串
# 來源：ai_workspace gantry_to_county.json v3.4 把這些標為「手冊未列的細部偵測點」，
# 但 v4.1 PDF 表 8 已明列（實際存在）→ note 清空避免誤導
NOTE_CORRECTIONS: dict[str, str] = {
    '01F0153S': '',
    '01F0153N': '',
    '01F3535S': '',
    '01F3535N': '',
}

# F-H1 patch (2)：FR ramp gantry 的 county/city 推定
# 05FR113S / 05FR143N 在 v3.4 gantry_to_county.json 中不存在（新增）
# 地理位置依 v4.1 §3 表 12「宜蘭端」推定為宜蘭縣，待官方資料確認
FR_GANTRY_DEFAULTS: dict[str, dict] = {
    '05FR113S': {
        'county': '宜蘭縣', 'city': '宜蘭市',
        'note': '手冊表12列有此門架；county/city為地理推定，請確認',
    },
    '05FR143N': {
        'county': '宜蘭縣', 'city': '宜蘭市',
        'note': '手冊表12列有此門架；county/city為地理推定，請確認',
    },
}


def load_legacy(path: Path) -> dict[str, dict]:
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    return {k: v for k, v in d.items() if not k.startswith("_")}


def extract_gantries_from_pdf(pdf_path: Path) -> list[dict]:
    from pdfminer.high_level import extract_text

    text = extract_text(str(pdf_path))

    # §3 section starts here
    sec_idx = text.find("3. 門架代碼路段彙整表")
    if sec_idx < 0:
        raise RuntimeError("找不到 §3 門架代碼路段彙整表 — PDF 格式可能不同")
    section = text[sec_idx:]

    # Find table boundaries
    table_positions = {}
    for table_key in ROUTE_TABLE_MAP:
        idx = section.find(table_key + " ")
        if idx >= 0:
            table_positions[table_key] = idx

    # Sort by position
    sorted_tables = sorted(table_positions.items(), key=lambda x: x[1])
    # Add end sentinel
    sorted_tables.append(("END", len(section)))

    gantries = []
    seen = set()

    for i, (table_key, start_pos) in enumerate(sorted_tables[:-1]):
        route = ROUTE_TABLE_MAP[table_key]
        end_pos = sorted_tables[i + 1][1]
        chunk = section[start_pos:end_pos]

        matches = GANTRY_PATTERN.findall(chunk)
        for gantry_id, section_name in matches:
            gantry_id = gantry_id.strip()
            section_name = section_name.strip()
            # Clean section name (remove trailing garbage)
            section_name = re.sub(r"\s+", " ", section_name).strip()
            # Remove trailing spaces / page numbers
            section_name = re.sub(r"\s*\d+\s*$", "", section_name).strip()

            if gantry_id in seen:
                continue
            seen.add(gantry_id)

            gantries.append({
                "gantry_id": gantry_id,
                "route": route,
                "section": section_name,
            })

    return gantries


def build_json(gantries: list[dict], legacy: dict[str, dict]) -> list[dict]:
    result = []
    for g in gantries:
        gid = g["gantry_id"]
        old = legacy.get(gid, {})

        # 基本欄位：優先從 v3.4 legacy 取 county/city
        county = old.get("county", "")
        city = old.get("city", "")
        note = old.get("note", "")

        # F-H1 patch (2)：FR ramp 在 v3.4 不存在，套推定值
        if gid in FR_GANTRY_DEFAULTS:
            fr_defaults = FR_GANTRY_DEFAULTS[gid]
            county = county or fr_defaults["county"]
            city = city or fr_defaults["city"]
            note = note or fr_defaults["note"]

        # F-H1 patch (1)：清除 v3.4 中已知錯誤的 note
        if gid in NOTE_CORRECTIONS:
            note = NOTE_CORRECTIONS[gid]

        result.append({
            "gantry_id": gid,
            "route": g["route"],
            "section": g["section"],  # from v4.1 PDF
            "county": county,
            "city": city,
            "note": note,
        })
    return result


def build_diff_report(v4_list: list[dict], legacy: dict[str, dict]) -> str:
    v4_ids = {g["gantry_id"] for g in v4_list}
    v3_ids = set(legacy.keys())

    added = sorted(v4_ids - v3_ids)
    removed = sorted(v3_ids - v4_ids)
    # Section name changes
    changed = []
    for g in v4_list:
        gid = g["gantry_id"]
        if gid in legacy:
            old_sec = legacy[gid].get("section", "")
            new_sec = g["section"]
            if old_sec != new_sec:
                changed.append((gid, old_sec, new_sec))

    route_counts = {}
    for g in v4_list:
        route_counts[g["route"]] = route_counts.get(g["route"], 0) + 1

    lines = [
        "# Gantry 資料 diff — v3.4 → v4.1",
        "",
        f"> 產出時間：自動產生（ingest_gantries_v4_1.py）",
        f"> 來源：TDCS使用手冊v41b.pdf §3",
        "",
        "## 總覽",
        "",
        "| 維度 | v3.4 | v4.1 |",
        "|---|---|---|",
        f"| 總數 | {len(v3_ids)} | {len(v4_ids)} |",
        f"| 新增 | — | {len(added)} |",
        f"| 移除 | — | {len(removed)} |",
        f"| section 名稱變更 | — | {len(changed)} |",
        "",
        "## 各路段門架數",
        "",
        "| 路段 | 數量 |",
        "|---|---|",
    ]
    for route, cnt in sorted(route_counts.items()):
        lines.append(f"| {route} | {cnt} |")

    if added:
        lines += ["", "## 新增門架（v4.1 有、v3.4 無）", ""]
        for gid in added:
            g = next((x for x in v4_list if x["gantry_id"] == gid), {})
            lines.append(f"- `{gid}` — {g.get('route', '')} {g.get('section', '')}")

    if removed:
        lines += ["", "## 移除門架（v3.4 有、v4.1 無）", ""]
        for gid in removed:
            v = legacy[gid]
            lines.append(f"- `{gid}` — {v.get('route', '')} {v.get('section', '')}")

    if changed:
        lines += ["", "## Section 名稱變更", "", "| GantryID | v3.4 section | v4.1 section |", "|---|---|---|"]
        for gid, old, new in changed[:30]:
            lines.append(f"| `{gid}` | {old} | {new} |")
        if len(changed) > 30:
            lines.append(f"| ... | （共 {len(changed)} 條，略顯後 {len(changed)-30} 條）| |")

    return "\n".join(lines)


def main():
    print("=== M3 Gantry v4.1 Ingest ===")
    print(f"PDF:    {PDF_PATH}")
    print(f"Legacy: {LEGACY_JSON}")
    print(f"Output: {OUT_JSON}")

    # Load legacy
    legacy = load_legacy(LEGACY_JSON)
    print(f"Legacy gantries: {len(legacy)}")

    # Parse PDF
    print("Parsing PDF...")
    raw_gantries = extract_gantries_from_pdf(PDF_PATH)
    print(f"Extracted: {len(raw_gantries)} gantries from v4.1 PDF")

    # Build output JSON
    output = build_json(raw_gantries, legacy)

    # Write JSON
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Written: {OUT_JSON} ({len(output)} gantries)")

    # Write diff report
    diff_md = build_diff_report(output, legacy)
    with open(DIFF_REPORT, "w", encoding="utf-8") as f:
        f.write(diff_md)
    print(f"Diff:    {DIFF_REPORT}")

    # Print summary
    route_counts = {}
    for g in output:
        route_counts[g["route"]] = route_counts.get(g["route"], 0) + 1
    for route, cnt in sorted(route_counts.items()):
        print(f"  {route}: {cnt}")

    # Verify 5 known gantries
    known_gantries = ["01F2930N", "01F2930S", "01F3019N", "01F3019S", "05F0287N"]
    gantry_map = {g["gantry_id"]: g for g in output}
    print("\n=== Verification (5 known gantries) ===")
    for gid in known_gantries:
        if gid in gantry_map:
            g = gantry_map[gid]
            print(f"  ✅ {gid}: {g['route']} | {g['section']}")
        else:
            print(f"  ❌ MISSING: {gid}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
