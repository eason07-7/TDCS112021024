# mcp_workspace — 專案專屬規則

> **工作流規則見 `workflow/AGENTS.md`**（Lead/Worker/User 三角、五段式事件、USER_RUN 等）
> **當前進度見 `workflow/INDEX.md`**（活躍 PLAN + 封存清單）
> 本檔只放 **mcp_workspace 專屬硬規則**：可修改範圍、資料路徑、環境變數、常見陷阱

---

## 啟動順序（接手前讀這 4 份）

1. `workflow/AGENTS.md` — 工作流通則
2. `workflow/INDEX.md` — 全貌目錄（hyperlink 直接跳）
3. `workflow/MASTER_PLAN.md` — 專案大方向（MCP 伺服器化階段）
4. `workflow/實驗紀錄<n>.md` 開頭 Compact + 最新 3 事件

---

## 專案定位（一句話）

把 ai_workspace 的「下載 → 清洗 → 視覺化 → AI 分析」四大管線**包裝成 MCP 工具**，讓 Codex Desktop / GPT 用自然語言調用，跑「任意路段、任意時段」的 TDCS 分析。

詳見 `workflow/MASTER_PLAN.md`。

---

## 可修改範圍（硬規則）

### ✅ 可改

- `d:\p\TDCSprecentater\mcp_workspace\` 內所有檔
  - `step0_s3_download/` ~ `step4_ppt/` — 階段 1 既有四大管線
  - `workflow/` — 工作流檔案
  - 未來：`mcp_server/`、`pipeline_spec.json`、`manifest.json` 等 MCP 階段產物

### ❌ 禁改（唯讀參考）

- `d:\p\TDCSprecentater\` **根目錄所有 `.py`**（要改邏輯 → copy 到 mcp_workspace/ 再改）
- `d:\p\TDCSprecentater\ai_workspace\`（另一工作區）
- `D:\p\112021134\` — 下載工具
- `D:\p\ppt工具\` — PPT 工具
- `mcp_workspace/workflow/logs/` 封存檔（歷史不動）

---

## 歷史檔位置注意

`workflow/logs/` 內 4 份**舊格式**檔案（v0.4 INDEX regex 抓不到、不會出現在 `workflow/INDEX.md`，但保留作歷史證跡）：

- `實驗記錄.md` — Stage 1：2026/03 麻豆 4 匝道完整管線
- `實驗紀錄2.md` — Stage 2 起步：資料夾改名 + MASTER_PLAN 建立
- `實驗紀錄3.md` — Phase 0：`tdcs_clean/` 共用 lib（與 ai_workspace 共用）
- `實驗紀錄4.md` — Phase M-1 起步（空骨架、Phase M-1 ~ M-5 未啟動）

需要回查時 `ls workflow/logs/` 或直接讀檔。**新 PLAN_E<n> 沿用舊序、從 5 起算**（v0.6 工作流接續、避免與 logs/ 既有 `實驗紀錄2/3/4.md` 撞號）。

---

## 階段 1 既有產物（保留中、不要刪）

| 路徑 | 內容 |
|---|---|
| `step0_s3_download/raw_202603/` | 741 檔 / 22 GB 原始 CSV（2026/03 麻豆 4 匝道） |
| `step1_cleaning/cleaned_202603/` | 14,058 行月/週/日彙總 |
| `step2_visualization/charts/*.png` | 9 張 matplotlib 圖 |
| `step3_ai_analysis/analysis_report.md` | Gemini 跨檔分析 |
| `step4_ppt/output_v2.pptx` | 16 頁 PPT（332 KB） |
| `影片摘要.md` / `影片摘要_講稿.md` | 4 種長度影片摘要 |

---

## 目標匝道（階段 1）

| GantryID | 方向 | 區段 |
|---|---|---|
| 01F2930N | 北上 | 下營系統 → 新營 |
| 01F2930S | 南下 | 新營 → 下營系統 |
| 01F3019N | 北上 | 麻豆 → 下營系統 |
| 01F3019S | 南下 | 下營系統 → 麻豆 |

階段 2（MCP 化）目標：擴展到任意路段。

---

## 環境變數（.env，**禁 commit**）

```
AWS_ACCESS_KEY_ID=          # Learner Lab 4hr session token
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
AWS_REGION=ap-northeast-1   # 🔒 東京區（與 ai_workspace 的 us-east-1 不同）
GEMINI_API_KEY=             # step3 / MCP analyze 用
```

**注意 region 差異**：MASTER_PLAN.md 規劃「作業版」EC2 + S3 在 **ap-northeast-1（東京）**，與 ai_workspace 用的 us-east-1（Learner Lab 強制）**不同**。MCP 階段要決定是否搬遷 / 共用 bucket。

---

## 共用資產（與 ai_workspace 共享）

| 項目 | 說明 |
|---|---|
| `tdcs_clean/`（在 repo 根） | 共用清洗 lib（PLAN_E03 Phase 0 完成、O OR D 邏輯、14,058 行驗收 PASS） |
| S3 bucket `112021134trafficdatacollectionsyste` | ai_workspace 負責上傳、mcp_workspace 可讀 |
| `config/gantry_to_county.json` | 縣市對應、跨工作區共用 |

---

## 常見陷阱

| 陷阱 | 解法 |
|---|---|
| 硬編碼 `202603` | 參數化 `YEAR` / `MONTH`（MCP 階段要通用化）|
| 沿用 ai_workspace M06A `O OR D` 舊邏輯 | ai_workspace 已改 v3（M03A 訓練 + M06A regex OD），mcp_workspace 若做相同分析、要同步升級邏輯（見 ai_workspace BUG_OD_FILTER.md）|
| 中文路徑亂碼 | UTF-8 + `chcp 65001` + `$env:PYTHONIOENCODING="utf-8"` |
| 跨 region 操作 | ai_workspace us-east-1 vs mcp_workspace ap-northeast-1 — bucket 選一個 |

---

## 進階參考（按需查閱）

| 檔案 | 內容 |
|---|---|
| `workflow/MASTER_PLAN.md` | MCP 階段完整規劃（系統定位 / 架構 / Phase 0-5） |
| `workflow/MODEL_PROFILES.md` | Lead 擬 worker prompt 用的模型對照 + 本專案 worker 名冊 |
| `D:\p\TDCSprecentater\ai_workspace\workflow\INDEX.md` | 姐妹工作區所有 PLAN / 紀錄、可參考 v3 架構演進 |
| `D:\p\112021134\DOWNLOAD_WORKFLOW.md` | S3 下載自動化參考 |
