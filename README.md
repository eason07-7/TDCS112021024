# mcp_workspace（原 `final_presentation/`）

> **階段 2：MCP 伺服器化** — 把階段 1 的四大管線包裝成 MCP 工具，讓 Claude Desktop / Claude Code 能用自然語言調用。

## 本資料夾現狀

| 項目 | 狀態 |
|---|---|
| 階段 1：2026/03 麻豆交流道 4 匝道完整分析 + 16 頁 PPT | ✅ 已完成（封存於 `實驗記錄.md`） |
| 階段 2：MCP 伺服器化（本階段） | 🚧 規劃中 — 見 `實驗紀錄2.md` |
| 資料夾改名 `final_presentation/` → `mcp_workspace/` | ⏳ 階段 2 Phase 0 |

## 快速導覽

```
final_presentation/   （未來的 mcp_workspace/）
├── 實驗記錄.md          階段 1 工作紀錄（已封存）
├── 實驗紀錄2.md         階段 2 工作紀錄（進行中）
├── README.md            本檔（階段 2 入口說明）
├── CLAUDE.md            Claude 工作守則（對 Claude Code / Claude Desktop）
├── step0_s3_download/   階段 1 — boto3 拉 S3 原始 CSV
├── step1_cleaning/      階段 1 — pandas 清洗 4 匝道
├── step2_visualization/ 階段 1 — matplotlib 產 9 張 PNG
├── step3_ai_analysis/   階段 1 — Gemini 跨檔分析
├── step4_ppt/           階段 1 — ppt-master 產 16 頁 PPT
│
├── manifest.json        ⭐ 階段 2 — AI 每次呼叫先讀這份（可用時間區間 / Gantry / 產出清單）
├── pipeline_spec.json   階段 2 — 四大管線的機器可讀規格
└── mcp_server/          階段 2 — MCP 伺服器程式碼
```

## 階段 2 目標

把下列四個既有管線透過 **MCP Protocol** 暴露成 AI 可呼叫的工具：

1. `step0_download` — S3 原始 CSV 下載
2. `step1_cleaning` — 月/週/日三層彙總
3. `step2_visualization` — 9 張 PNG 圖表
4. `step3_ai_analysis` — Gemini 跨檔異常稽核

### 對話範例

- 👤「幫我看 2026/03 的麻豆車流。」
  🤖 讀 `manifest.json` → 確認資料齊全 → 回傳圖 + 摘要
- 👤「3/26 那天怎麼看起來怪怪的？」
  🤖 讀 `manifest.json` → 確認缺 3 小時資料 → 呼叫 `analyze_anomaly` → 回傳圖 + z-score 解釋
- 👤「給我 2025/07 的圖。」
  🤖 讀 `manifest.json` → 發現沒有 2025/07 → 主動問：「要觸發下載嗎？預計 10 分鐘完成」

### 行為鐵則

**AI 每次呼叫 MCP 工具前，第一步一定是 `get_status()`**，讀 `manifest.json` 確認可用的時間區間 + Gantry 清單，避免：
- 在缺資料時亂編答案
- 重複觸發已完成的下載
- 以為有資料但其實沒有

## 階段 2 執行規劃

詳見 `實驗紀錄2.md`。Phase 0 → 5 依序：

- Phase 0：資料夾改名 + 檔案歸位
- Phase 1：`pipeline_spec.json` 機器可讀規格
- Phase 2：`manifest.json` 自檢檔
- Phase 3：MCP Tools 規格設計（8 個粗粒度工具）
- Phase 4：MCP Server 實作（Python + 官方 SDK）
- Phase 5：Claude Desktop / Claude Code 串接 + 場景測試

## 階段 1 產物（保留中）

- `step3_ai_analysis/analysis_report.md` — Gemini 產出的 4 項發現 + 資料稽核
- `step4_ppt/output_v2.pptx` — 16 頁 PPT（332 KB）
- `影片摘要.md` — 4 種長度版本的影片摘要
- `step2_visualization/charts/*.png` — 9 張圖表

## 階段 1 執行順序（仍可用，於 `CLAUDE.md` 範圍內）

```bash
# 0) 從 S3 下載 3 月原始資料
python step0_s3_download/download_from_s3.py          # -> raw_202603/*.csv
# 1) 清洗
python step1_cleaning/clean_202603.py                 # -> cleaned_202603/{monthly,weekly,daily}/*.csv
# 2) 視覺化
python step2_visualization/viz_4gantries.py           # -> charts/*.png × 9
# 3) AI 分析（需 GEMINI_API_KEY）
python step3_ai_analysis/analyze_all.py               # -> step3_ai_analysis/analysis_report.md
# 4) 產 PPT（ppt-maker 工具讀 step4_ppt/content.md）
```

## 目標匝道（階段 1/2 共用）

| GantryID | 方向 | 區段 |
|---|---|---|
| 01F2930N | 北上 | 下營系統 → 新營 |
| 01F2930S | 南下 | 新營 → 下營系統 |
| 01F3019N | 北上 | 麻豆 → 下營系統 |
| 01F3019S | 南下 | 下營系統 → 麻豆 |

## 授權

本資料夾為國立高雄科技大學交通資料分析課程期末作業，第 17 組「關於我在無意間被隔壁車道的卡車學長撞成廢人這件事」作業成果。
