# PLAN_E6 — CLI skeleton + tdcs_clean TS 翻譯（v2 開工首戰）

> **對應紀錄**：`workflow/實驗紀錄6.md`（PLAN_E6 啟動時建、舊 `實驗紀錄5.md` 封存到 logs/）
> **關鍵成果**：CLI v2 骨架交付：tdcs_clean TS 翻譯通過 baseline 14,058 行 md5=0 對齊、gantries_v4_1.json 339 個門架 ingest、endpoint 三層 priority (env>file>default) + config 4 subcommand 機制就位、46/46 test 全綠

---

## 背景

PLAN_E5 v2 鎖板完成（事件 #1~#8、`logs/PLAN_E5_done.md`）：
- 產品 = TDCS 自動下載 + 清洗 CLI 工具（npm/Node.js + AWS backend）
- M4 鎖板：E6 純 client-side winner / 純 Lambda 處理層 / hardcode + config 留彈性
- MASTER_PLAN §1-§11 全重寫對齊 v2、PLAN_E6~E13 共 8 個 PLAN roadmap 鎖定

PLAN_E6 是 **v2 開工首戰**：從 0 開始建 Node.js / TS CLI 骨架、翻譯 ai_workspace Python `tdcs_clean` 邏輯成 TS、對齊舊 baseline 14,058 行 byte-level diff = 0（**邏輯正確性硬指標**、不通過不出 PLAN_E6）。

## 目標

跑完 PLAN_E6 後達到：
1. `cli/` 子資料夾完整 Node.js / TS 專案、`npm install && npm run build` 跑得起來
2. `tdcs-dl --version` 跑得出來、`tdcs-dl` 啟動 ink TUI wizard 4-5 步骨架（無業務邏輯、純 navigation）
3. `data/gantries_v4_1.json`（**339 gantry**、從 TDCS 手冊 v4.1 PDF §3 ingest、v3.4→v4.1 移除 8 + 新增 2 FR ramp、附 v3.4 diff 報告）
4. `cli/src/lib/tdcs-clean.ts`（M06A O/D 端點命中篩 + hourly aggregation、純 TS、無 Python 依賴）
5. **Baseline 對齊**：用 `mcp_workspace/step1_cleaning/raw_202603/` raw → TS 版清洗 → diff `cleaned_202603/monthly|weekly|daily/*.csv` byte-level = 0
6. `~/.tdcs-dl/config.json` + env var `TDCS_DL_ENDPOINT` override（endpoint 抽象 D6 鎖板）
7. `tdcs-dl config` subcommand 跑通（set-endpoint / get-endpoint / show）

**注意**：PLAN_E6 只跑「本機 mock S3 path」、不打真實 AWS endpoint（那是 PLAN_E7 工作）。M6 / M7 config 機制就位、但實際 `pull / clean / status` 等業務 subcommand 留 PLAN_E8~E10。

## 不做

- ❌ 不寫真 AWS 整合（API GW / Lambda / S3 / Athena 都是 PLAN_E7+）
- ❌ 不寫 `pull / clean / status / get / query` 業務 subcommand（PLAN_E8~E10）
- ❌ 不寫 `npm publish` / 品牌 logo（PLAN_E11）
- ❌ 不寫期末三件套素材（PLAN_E13）
- ❌ 不動 ai_workspace / D:\p\112021134\ / finance_workspace / 微處理器 任何檔（只讀）
- ❌ **不要 hack 翻譯**：M4 對齊 baseline 不通過 = STOP 回報 Lead 重新評估、不容忍 throwaway 「差不多就好」

---

## Milestones

### M1 — Node.js / TS 專案骨架

**執行者**：`sonnet_worker`（續派、短指令）
**預計時間**：1 hr

**內容**：
- 建 `mcp_workspace/cli/` 子資料夾
- `package.json`：`name=tdcs-dl`、`bin: { "tdcs-dl": "./dist/index.js" }`、scripts (build / test / dev)、deps（commander / ink / cli-progress / ora / chalk / @aws-sdk/client-s3 / @aws-sdk/client-lambda / @aws-sdk/client-athena / nodejs-polars 或 danfojs / parquetjs-lite）
- `tsconfig.json`：target ES2022、module ESNext、strict mode、JSX react（給 ink）
- `cli/src/index.ts`：commander 主入口、註冊 `config` subcommand + 預設啟動 wizard
- `.gitignore`：node_modules / dist / *.log / .env

**產出**：
- `cli/package.json` / `tsconfig.json` / `src/index.ts` 跑得起來
- `npm install && npm run build && npx tdcs-dl --version` 回 `0.1.0`

**驗收**：`npm test` 過（即使空測試也要先設 Jest config）；`tdcs-dl --help` 顯示 commander 自動產生的 help

---

### M2 — TUI wizard skeleton（ink）

**執行者**：`sonnet_worker`（續派）
**預計時間**：3 hr

**內容**：
- `cli/src/wizard/App.tsx`：ink 主 React component、狀態機（multi-step、含上一步）
- `cli/src/wizard/state.ts`：state machine（current step / collected answers / history stack）
- `cli/src/wizard/steps/`：5 個 step component
  - `Data.tsx`（資料類型、M06A 鎖定、其他灰色提示）
  - `Time.tsx`（時間區間、自訂 / 最近 N 個月 / 整年 三種模式）
  - `Gantry.tsx`（路段多選、tab 切換國 1/1H/3/3甲/5、全選 / 反選、cursor + space）
  - `Output.tsx`（輸出位置、本機 / S3 only / 兩者）
  - `Confirm.tsx`（任務摘要 + 提交按鈕）
- 品牌 logo（ink-big-text）+ progress indicator（step 1/5、step 2/5...）
- Keyboard：↑↓ 移動 / space 多選 / Enter 確認 / Esc 上一步 / q 離開

**產出**：
- `npx tdcs-dl` 啟動 wizard、5 步全跑通（後端不真實提交、最後 step 顯示「Would submit: {payload}」即可）
- 上一步 / 多選 / 全選 都正常

**驗收**：手動測試 happy path + 上一步路徑都 OK；Windows cmd / PowerShell / macOS Terminal / Linux 都跑得起來（最少 1 平台、其他 PLAN_E11 補）

**參考**：ink 官方 example + GitHub Copilot CLI / Cloudflare Wrangler 用法

---

### M3 — TDCS 手冊 v4.1 PDF §3 ingest → `gantries_v4_1.json`

**執行者**：`sonnet_worker`（續派、可能借助 Lead 寫 PDF 解析腳本）
**預計時間**：2 hr

**內容**：
- 讀 `workflow/reports/ref/TDCS使用手冊v41b.pdf` §3「門架代碼路段彙整表」
- 5 個 sub-table（國 1 / 國 1H / 國 3 / 國 3甲 / 國 5）共 **339 gantry**（v4.1；v3.4 = 345）
- 寫 ingest 腳本：`cli/scripts/ingest_gantries_v4_1.ts`（PDF 解析、可選用 `pdf-parse` 或 `pdfjs-dist`）
- 對齊 schema：`{ gantry_id, route, county, city, section, milestone_km?, ... }`
- 與 ai_workspace `config/gantry_to_county.json`（v3.4 重建）做 diff、寫 `cli/data/gantries_diff_v3_4_to_v4_1.md`（新增 / 改名 / 移除 gantry 列出）
- 輸出 `cli/data/gantries_v4_1.json`、CLI 用此檔做 wizard step 3 路段選擇來源

**產出**：
- `cli/data/gantries_v4_1.json`（schema 對齊 + 完整覆蓋國 1/1H/3/3甲/5）
- `cli/data/gantries_diff_v3_4_to_v4_1.md`（diff 報告、寫進期末報告 narrative）
- `cli/scripts/ingest_gantries_v4_1.ts`（可重跑、官方手冊更新時 re-ingest）

**驗收**：
- `node cli/data/gantries_v4_1.json | jq 'length'` 應 = **339**（v3.4 345 → v4.1 339；移除 8 舊門架 + 新增 2 FR ramp）
- 抽 5 個 gantry 對 PDF 表格手動 verify 名稱 / 區段對齊
- diff 報告至少列出 v3.4 → v4.1 的 add / remove / rename count

---

### M4 — tdcs_clean Python → TS 翻譯（**核心、最高風險**）

**執行者**：`sonnet_worker`（續派、Lead 嚴審）。若 M5 對齊 fail、退 `gpt5_worker` spike 翻譯
**預計時間**：6 hr

**內容**：
- 讀 ai_workspace `tdcs_clean/core.py`（100 行）+ `cli.py`（76 行）+ `config.py`（16 行）
- 翻譯成 TS：`cli/src/lib/tdcs-clean.ts`
- 核心邏輯（M06A O/D 端點命中篩、對齊 mcp Stage 1 麻豆 baseline）：
  - `read_one_csv()` → 用 `csv-parse` 或手刻、注意 BIG-5 / UTF-8 編碼
  - `clean_raw_df()` → 應用 `gantry_id_o OR gantry_id_d` 篩 + TargetGantry 標註（O/D 端點命中篩、對齊 mcp Stage 1 麻豆 baseline、短距離路段適用；長距離跨多站如雪山隧道才需 trip_information regex 嚴格穿越、是 ai_workspace 範疇、本專案 scope 不含）
  - `build_hourly_aggregation()` → groupby (date, hour, TargetGantry, VehicleType) → SUM(volume)
  - `merge_hourly_accumulator()` → 月 / 週 / 日 三層彙總
  - `add_week_index()` → 週序輔助欄
- 用 `nodejs-polars`（推薦、pandas-like）或 `danfojs` 處理 dataframe；如效能 / API 不對齊、手刻 array of objects 也可（baseline 對齊優先）
- Logger / 進度通報接口（給 PLAN_E8/E9 用）

**產出**：
- `cli/src/lib/tdcs-clean.ts`（核心 lib、純 function、無 side effect）
- `cli/src/lib/tdcs-clean.types.ts`（TypeScript type 定義）
- 單元測試 `cli/tests/tdcs-clean.test.ts` 覆蓋 happy path + edge case（空 csv / malformed row / 編碼異常）

**驗收**：M5 baseline 對齊通過

---

### M5 — Baseline 對齊（14,058 行 byte-level diff = 0）

**執行者**：`sonnet_worker`（續派）
**預計時間**：2 hr（含可能的 debug round-trip）

**內容**：
- 用 mcp_workspace 既有 `step0_s3_download/raw_202603/` 作 raw 輸入
- TS 版 `tdcs-clean.ts` 跑出來輸出到 `/tmp/ts_cleaned/`（monthly / weekly / daily 3 個資料夾、各 csv 結構對齊 Python 版）
- 對比目標：`step1_cleaning/cleaned_202603/{monthly,weekly,daily}/*.csv`（Python 版輸出、14,058 行 ground truth）
- **byte-level diff**：用 `diff -q` 或 `md5sum` 比對、預期 0 差異
- 寫 baseline 對齊報告 `cli/tests/baseline_compliance_2026-06-XX.md`（含 row count / md5 / diff 結果）

**產出**：
- `cli/tests/baseline_compliance_2026-06-XX.md`（PASS / FAIL 結論 + 數據）
- 如 PASS：M4 翻譯邏輯**驗證通過**、可進 M6
- 如 FAIL：STOP、回報 Lead、列差異 row 樣本、決策修 M4 或 fork 翻譯方案

**驗收**：
- monthly csv md5 一致（4 個檔）
- weekly csv md5 一致（4-5 個檔）
- daily csv md5 一致（120-130 個檔）
- 任 1 檔 md5 不一致 = FAIL

**紅線**：絕對不允許「差不多就好」、「row 數對但欄序不同沒關係」等 hack 解；diff 不過 = M4 重寫、不容忍 throwaway

---

### M6 — Endpoint 抽象（`~/.tdcs-dl/config.json` + env override）

**執行者**：`sonnet_worker`（續派）
**預計時間**：1 hr

**內容**：
- `cli/src/lib/config.ts`：
  - 讀順序：env var `TDCS_DL_ENDPOINT` > `~/.tdcs-dl/config.json` > hardcoded default
  - Hardcoded default：暫填 placeholder `https://placeholder.invalid/`（PLAN_E7 部署 AWS 後改正）
  - Schema：`{ endpoint: string, profile?: string, ... }`（留擴展彈性）
- 讀寫 `~/.tdcs-dl/config.json` 用 Node fs/promises、跨平台路徑用 `os.homedir()`
- Lock 機制（多進程同時改 config 的 corner case）：先不做、PLAN_E11 才補

**產出**：
- `cli/src/lib/config.ts`
- Unit test：env var > config file > default 三層 priority
- 文件：`cli/src/lib/README.md` 寫 endpoint 抽象設計

**驗收**：env override 優先、config file 讀寫正常、default fallback 工作

---

### M7 — `tdcs-dl config` subcommand

**執行者**：`sonnet_worker`（續派）
**預計時間**：1 hr

**內容**：
- `cli/src/commands/config.ts`、commander 註冊：
  - `tdcs-dl config set-endpoint <url>`：寫 `~/.tdcs-dl/config.json`、verify URL 形狀
  - `tdcs-dl config get-endpoint`：印當前 endpoint（含來源：env / file / default）
  - `tdcs-dl config show`：印所有 config（masked sensitive）
  - `tdcs-dl config reset`：刪 `~/.tdcs-dl/config.json`（回 hardcoded default）

**產出**：
- `cli/src/commands/config.ts`
- Integration test：set-endpoint 後 get-endpoint 回新值；reset 後回 default

**驗收**：4 個 subcommand 全跑通、help 訊息清楚

---

## 完成定義（整 PLAN）

- [ ] M1 Node.js / TS 專案骨架、`tdcs-dl --version` 跑得起來
- [ ] M2 TUI wizard 5 步骨架跑通、上一步 / 多選 / 全選 OK
- [ ] M3 `gantries_v4_1.json` 出版 + v3.4 diff 報告
- [ ] M4 `tdcs-clean.ts` 翻譯完成 + unit test 過
- [ ] M5 **Baseline 對齊 PASS**（14,058 行 byte-level diff = 0）— **硬指標**
- [ ] M6 endpoint 抽象機制就位 + 三層 priority 測試過
- [ ] M7 `tdcs-dl config` 4 subcommand 跑通
- [ ] PLAN_E5「關鍵成果」frontmatter 在本檔開頭填好
- [ ] 跑 `archive.py --plan workflow/PLAN_E6.md` 封存、INDEX regen

## Worker 配置

| Milestone | 派 worker | 模式 | 理由 |
|---|---|---|---|
| M1 / M2 / M3 / M6 / M7 | `sonnet_worker` | 續派短指令 | Sonnet 標準 Node.js / TS 開發強項、已熟悉本專案 v0.6 workflow + brief context |
| **M4 TS 翻譯** | `sonnet_worker` 先試（續派）| 續派 + 加強 spec | spec 寫清楚 + Python 原始碼附給它讀、邏輯 1:1 翻譯 |
| **M4 fallback** | `gpt5_worker`（如 M5 fail） | **第一次派、要完整 onboard** | GPT-5 spec-clear 演算法服從度高、適合精確翻譯；若 sonnet baseline 對齊失敗、Lead 出 gpt5 完整 onboard prompt 接手 M4 |
| M5 baseline 對齊 | `sonnet_worker`（續派） | — | 跑 diff + 寫報告、與 M4 同 worker 連貫 |

**派工順序**（給 User 派 sonnet 用）：
1. 先派 M1 + M2 一輪（CLI skeleton + TUI wizard、~4 hr）
2. M2 完報告後、Lead 驗收 + 派 M3 + M4 + M5（核心翻譯 + 對齊、~10 hr）
3. M5 PASS 後、派 M6 + M7（config 機制、~2 hr）
4. 整 PLAN 完整 ~16 hr worker time、Lead 驗收 + 寫實驗紀錄

**降階觸發**：M5 baseline FAIL → Lead 評估是否退到 `gpt5_worker` 重翻 M4。

## 風險

| 風險 | 緩解 |
|---|---|
| **M4 TS vs Python pandas 對齊失敗** | M5 是硬指標、不通過 STOP 回 Lead；gpt5_worker fallback 機制就位 |
| nodejs-polars API 跟 pandas 差異 | 先試 polars、不對齊改 danfojs、再不對齊手刻 array map（保 baseline 優先）|
| TDCS 手冊 v4.1 PDF 解析（OCR / table）| 用 `pdf-parse` 文字提取 + 手動 verify 抽樣；不通用 worker 寫 fallback 手動 input |
| ink TUI 跨平台兼容（Windows cmd）| M2 至少在 1 平台跑通、其他延 PLAN_E11 |
| 翻譯吃 sonnet context（5000+ 行 TS）| 分階段派、每 milestone 完整收尾再進下個 |
| `cli/data/gantries_v4_1.json` 與 ai_workspace 差異被忽略 | M3 diff 報告強制寫出、PLAN_E13 期末報告 narrative 可引用 |
| Baseline 對齊有「微小」差異（如 float 精度）| 不容忍 — `md5sum` 0 diff 為硬指標；若 float 真有不可避免差異、Lead + User 對話討論是否放寬（要在 PLAN_E6 內走完 §0.3 4 步妥協流程）|
