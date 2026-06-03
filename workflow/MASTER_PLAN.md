# MCP 工作區 ‧ 大計畫檔（MASTER_PLAN）

> **本檔是 mcp_workspace 階段 3 的總綱**。所有 `workflow/PLAN_E<n>.md` 執行藍圖都從這裡拆分。
> 工作流規則見 `workflow/CLAUDE.md`；目錄索引見 `workflow/INDEX.md`。
> 歷史紀錄封存於 `workflow/logs/實驗紀錄2/3/4.md` + `實驗記錄.md`（舊命名、不在 INDEX）。

---

## 0. 鎖板決策（v2、2026-06-02 重訂、Lead+User 定）

> **🚨 重大方向轉變**：6/2 User pivot — 砍 MCP server / RAG、改做「**TDCS 自動下載 + 清洗 CLI 工具**」，掛 AWS backend、發 npm 開源。MCP 太多餘、大家在捲視覺化 + AI、沒人解決前置麻煩、這就是切入點。
> 舊版 v1 鎖板（5/28 MCP 方向）保留於本檔 §11 Changelog 作 reference、實作以下方為準。

| 維度 | 鎖定 |
|---|---|
| **產品定位** | **TDCS 自動下載 + 清洗工具（CLI client + AWS backend）**。砍 MCP server / RAG / 自然語言、user 直接打 CLI 結構化指令 |
| **核心痛點** | 全台沒人做、大家都在捲視覺化 + AI 應用、前置「抓 TDCS + 篩選清洗 + 上 S3」是純苦工。差異化 = 把這層自動化 |
| **scope** | M06A 為主（未來擴展 M03A/04A/05A/07A）、任意時間區間、任意路段 / Gantry list |
| **demo 主角**（期末報告 §2 GoogleMap）| **國道 1 號麻豆段**（4 匝道：01F2930N/S 下營系統↔新營、01F3019N/S 麻豆↔下營系統）。沿用 mcp_workspace Stage 1 baseline（14,058 行對帳）、與 ai_workspace 雪山隧道**無關**、不污染 |
| **期中專題比較**（期末報告 §7、15% 配分）| 對比 mcp_workspace Stage 1 麻豆段 manual 流程（影片摘要 + step0-4 既有）vs Stage 2 CLI + AWS 自動化。**不對比 ai_workspace（不同學期專題）** |
| **AI client 主** | **無**（CLI 結構化指令、不接 LLM）。砍 MCP / Chroma / bge-m3 / ChatGPT 整鏈 |
| **AWS region** | us-east-1（Learner Lab 鎖死、不能改） |
| **AWS 角色** | **儲存 + 處理重活的主場**。CLI 本機輕、發任務 → AWS（API GW + Lambda + S3 + Athena）→ 結果 URL 回 CLI |
| **TDCS 跳板**（M4.1 鎖板）| 7 個對照實驗 E1~E7 完成（PLAN_E5/M2-M3 + 事件 #5、#6）。**Winner = E6 純 client-side**（CLI 本機抓 TDCS → 上 S3、PoC 已通過 = `scripts/backfill_s3_2026.py`、零跳板費用、最可靠）；**Backup = E5 nginx + Cloudflare tunnel**（免費、SPOF on user 機）。E1/E2 證實 us-east-1 region 封鎖、E3/E4/E7 棄選（理由見 [brief §C](reports/brief_relay_experiments_2026-06-02.md)）|
| **AWS 處理層**（M4.2 鎖板）| **純 Lambda**（短任務 < 15 min）。清洗一個月 TDCS 預估 < 5 min、Lambda 配額完全 cover、Step Functions / SQS / ECS Fargate 留 PLAN_E7+ 擴展時再評估。**Glue ETL 經科學評估不採用**（資料量 9 GiB、單次 < 5 min、簡單 transform、完全在 Lambda sweet spot、Glue Spark 引擎 over-engineering）；期末報告寫「為什麼選 Lambda 不選 Glue」工程選擇 narrative |
| **CLI 生態**（M4.x 配套）| **npm / Node.js 純重寫 + TUI wizard**（ink + cli-progress + ora）。ai_workspace Python `tdcs_clean` 邏輯翻譯成 TS、對齊舊 baseline 14,058 行 byte-level diff 驗證 |
| **CLI UX** | TUI wizard 4-5 步（資料類型 → 時間區間 → 路段多選 → 輸出位置 → 確認）、上下選擇 + 上一步 + 多選/全選；進度條 = `cli-progress` MultiBar（下載 bytes + 處理 rows）；CLI 品牌 = `ink-big-text` ASCII logo + 顏色 |
| **CLI endpoint 抽象**（M4.3 鎖板）| **Hardcode default + `tdcs-dl config set-endpoint` 留彈性**。Demo 期 user 不用設定、`npm install -g tdcs-dl && tdcs-dl` 直接跑；老師收回 Learner Lab 後、user 自架 AWS → `tdcs-dl config set-endpoint <new-url>` 即可、**CLI 商業邏輯 / UX 對 end-user 不變**（核心 abstraction）|
| **成品交付** | 期末三件套（書面報告 PDF + PPT 簡報 + Youtube demo 影片講稿、含 CLI demo + 跳板實驗 narrative）|
| **GitHub release** | 期末完成後上 GitHub（含 README + IaC template + CLI 包）|
| **時程** | 品質優先、不趕、里程碑式開發 |
| **Worker 名冊** | `opus_worker` / `sonnet_worker` / `gpt5_worker` / `haiku_worker` **四個固定**（不依任務領域命名、見 `MODEL_PROFILES.md`）|

**待補資源（USER 端）**：
- AWS Learner Lab 帳號 token 維持新鮮（主 account = 654485222392 / student 112021024）
- ~~跳板實驗 E4 需要本機 Tailscale exit-node 設備~~（已棄選、不需要）
- GitHub 帳號（期末完成上 release 用）
- npm 帳號（PLAN_E11 publish 時用）

**M4 鎖板實作影響**（給 PLAN_E6+ 用）：
- **E6 winner** = PLAN_E6 CLI 整合 `backfill_s3_2026.py` 邏輯翻譯 TS 即是 PoC、不重新設計下載鏈
- **純 Lambda 處理層** = PLAN_E7 AWS infra 砍 Step Functions、只搭 API GW + Lambda + S3 + Athena
- **endpoint 抽象** = PLAN_E6 CLI skeleton 加 `config` subcommand、讀 `~/.tdcs-dl/config.json` + env var override（兩層）

**已落地的 AWS 實體（2026-05-28 setup）**：

| 資源 | ID / 名稱 | 用途 | 狀態 |
|---|---|---|---|
| Account | `654485222392`（student 112021024） | 新主帳號、demo / 截圖 / 額度追蹤 | active |
| Bucket（舊、唯讀） | `112021024trafficdatacollectionsyste` | 既有 28 天 M06A（2026/03/29~04/25）、不動 | preserved |
| Bucket（新、主用） | `112021024` | mcp_workspace 主要資料區、結構見下 | active |

**新 bucket `s3://112021024/` 結構約定**（v2 新方向、cleaned/ knowledge/ 結構略調整）：

```
s3://112021024/
├── 202603/*.csv.gz       ✅ 72 obj（既有 3 天搬入）
├── 202604/*.csv.gz       ✅ 600 obj（既有 25 天搬入）
├── 202601/*.csv.gz       ⏳ 待 backfill（31 天）
├── 202602/*.csv.gz       ⏳ 待 backfill（28 天 + 補 03 前期 28 天 + 04 後期 5 天）
├── 202605/*.csv.gz       ⏳ 待 backfill（~22 天到 5/22）
├── cleaned_v2/           ⏳ CLI 清洗後 Parquet（按 job_id / route / date 分層）
│   └── job_<id>/
│       └── <YYYYMM>/*.parquet
├── jobs/<job_id>.json    ⏳ 任務 metadata（CLI 提交 / 狀態 / progress）
└── athena-results/       自動產生（Athena 預設、供 query 暫存）
```

**Backfill 腳本**：`mcp_workspace/scripts/backfill_s3_2026.py`（idempotent、讀 `mcp_workspace/.env` 為認證 source of truth、待 User token 刷新後跑 `python scripts/backfill_s3_2026.py` 補滿 114 天）

**砍掉的舊結構**（v1 方向）：`knowledge/`（不做知識庫）、`charts/`（不做後端視覺化、user 自己拿資料畫）。

---

## 1. 系統定位

### 1.1 一句話定義

> **TDCS 自動下載 + 清洗 CLI 工具** — `npx tdcs-dl` 啟動 TUI wizard、user 選資料類型 / 時間區間 / 路段、按 Enter 後 AWS 自動下載 + 清洗、結果 Parquet / CSV 拉回本機或留 S3 / 用 Athena query。**幫所有 TDCS 研究者跳過前置苦工**。

### 1.2 範圍

- **資料源**：先 M06A（旅次資料、O/D 端點命中篩、對齊規則 R12「上下交流道」分析）；未來擴展 M03A/M04A/M05A/M07A/M08A
- **時間**：任意年月日 / 任意區段、user 自選
- **路段**：依 TDCS 手冊 v4.1 §3 門架代碼路段彙整表（**339 個 gantry**，v3.4 舊版 345、v4.1 移除 8 + 新增 2 FR ramp = 339；含國 1 + 國 1H + 國 3 + 國 3 甲 + 國 5）、user 多選 + 全選；顯示**代號**不顯示名字（簡潔）、選代號自動 expand N+S 兩方向
- **AI 介面**：**無**（CLI 結構化指令、不接 LLM）

### 1.3 最終理想（願景）

讓 TDCS 研究 / 應用社群有一個 `npm install -g` 就能用的標準前置工具。GitHub 開源 + IaC template、user 自架 AWS 後馬上有自己的私有 TDCS pipeline。**期望成為「TDCS 工具圈的事實標準前置層」**——下游研究者 / 工程師都認這個工具、不用各自重發明輪子。

### 1.4 階段性版本

| 版本 | 環境 | 目的 | 時程 |
|---|---|---|---|
| **demo 版** | Learner Lab 654485222392（hardcoded endpoint） | 期末交件 + 直播 demo + 三件套錄影 | 本階段 |
| **release 版** | GitHub IaC template（user clone repo 後自架 AWS） | 開源、學期結束後仍可用、社群採用 | PLAN_E11 後 |

關鍵 abstraction：兩版本**CLI 對 end-user 完全相同**、只是 endpoint 不同（demo 版 hardcoded default、release 版用 `tdcs-dl config set-endpoint`）。

---

## 2. 整體架構

### 2.1 demo 版（Learner Lab + E6 winner）

```
┌───────────────────────────────────────────────────────────────┐
│ User 本機（任何 OS、台灣 IP 必要、CLI 跑這）                     │
│                                                                │
│ ┌──────────────────────────────────────────────┐               │
│ │ tdcs-dl CLI（Node.js / TypeScript）          │               │
│ │ ├── ink TUI wizard（4-5 步、上下選擇 + 多選）  │               │
│ │ ├── cli-progress MultiBar（下載 + 處理）      │               │
│ │ ├── 本機 download TDCS → S3（E6 winner）      │               │
│ │ └── @aws-sdk/client-s3 / @aws-sdk/client-lambda│              │
│ └──────────┬───────────────┬───────────────────┘               │
│            │ TCP/HTTPS      │ HTTPS                            │
│            │ 1) 抓 TDCS     │ 3) 觸發清洗 + 查進度              │
└────────────┼───────────────┼────────────────────────────────────┘
             │               │
             ▼               ▼
   tisvcloud.freeway.gov.tw   API Gateway HTTP（hardcoded endpoint）
   （TDCS 公開資料）          │
                              ▼
                  ┌──────────────────────────────────┐
                  │ Lambda（us-east-1、Container）   │
                  │  ├── tdcs_clean TS 邏輯翻譯       │
                  │  ├── O/D 端點命中篩 + Parquet 輸出│
                  │  └── jobs/<job_id>.json 寫狀態    │
                  └──────────┬───────────────────────┘
                             │
                             ▼
                  ┌──────────────────────────────────┐
                  │ S3 us-east-1（Learner Lab 帳號）  │
                  │  ├── <YYYYMM>/*.csv.gz （raw）   │
                  │  ├── cleaned_v2/job_<id>/*.parquet│
                  │  └── jobs/<job_id>.json          │
                  └──────────┬───────────────────────┘
                             │ Athena 查詢（可選、user query 用）
                             ▼
                  ┌──────────────────────────────────┐
                  │ Athena us-east-1                 │
                  │  └── tdcs.cleaned_v2_<job_id>    │
                  └──────────────────────────────────┘

回流（結果）：
  CLI 拉 Parquet 到 ./tdcs-output/job-<id>/  或  留 S3 + Athena 查
```

**資料流向 3 步**：
1. CLI 本機抓 TDCS（台灣 IP 直連）→ gzip → 上傳 user S3 bucket（raw 區）
2. CLI 觸發 AWS Lambda 清洗、Lambda 讀 raw → O/D 端點命中篩 → 寫 Parquet 到 cleaned 區
3. CLI 拉 Parquet 結果回本機（或留 S3 + 用 Athena query）

### 2.2 release 版（GitHub IaC template）

```
[user 自己] git clone https://github.com/.../tdcs-dl
            cd tdcs-dl/infra
            terraform apply  （或 ./deploy.sh）
                                ↓
            AWS 自己帳號創 S3 / Lambda / API GW
            拿到新 endpoint URL: https://xxx.execute-api...

[user 自己] npm install -g tdcs-dl
            tdcs-dl config set-endpoint <new-url>
            tdcs-dl                     ← TUI wizard 與 demo 版完全相同
```

**Key**：CLI binary 跟 demo 版**位元一致**、user 看到的 TUI 完全相同；唯一變的是 `~/.tdcs-dl/config.json` 裡的 endpoint。

### 2.3 E5 backup（如 user 偏好 cloud-native 觸發）

如果 user 不想要「CLI 本機抓」（例如本機開不了 Squid + cloudflared、或要把整個 pipeline 跑 CI 排程）：

```
CLI ──submit──▶ API GW ──▶ Lambda（HTTPS_PROXY=cf-tunnel-url）
                            ↓ 走 user 本機 Squid + Cloudflare tunnel
                          User 台灣本機（Squid forward proxy）
                            ↓ 出公網（台灣 IP）
                          TDCS
```

PLAN_E11 UX 階段加 `tdcs-dl mode --cloud-pull` flag 切換、demo 期不做。

---

## 3. 技術選型

| 層 | 選型 | 理由 |
|---|---|---|
| **CLI runtime** | Node.js 18+ / TypeScript 5+ | npm publish、跨平台、AWS SDK v3 原生支援、TUI 生態好 |
| **TUI** | `ink` (React for CLI) | 多步 wizard + 上一步 state machine 自然、Cloudflare Wrangler / GitHub Copilot CLI 都用 |
| **CLI parser** | `commander` | 標準 + 跟 ink 配合好 |
| **進度條** | `cli-progress` MultiBar | 同時顯示下載 / 處理兩條 bar |
| **Spinner** | `ora` | 等待 / loading 狀態通用 |
| **品牌 logo** | `ink-big-text` + `gradient-string` + `chalk` | ASCII 大字 + 漸層 + 顏色 |
| **HTTP / S3 SDK** | `@aws-sdk/client-s3` / `@aws-sdk/client-lambda` / `@aws-sdk/client-athena` | 官方 v3、tree-shakable、cold start 小 |
| **資料處理（TS 翻譯）** | `nodejs-polars`（推薦）/ `danfojs`（備案） | 對應 Python pandas、CSV/Parquet 讀寫快 |
| **gzip 壓縮** | Node.js `zlib` 內建 + `pako`（如 streaming 需要） | 對齊 Python `upload_month_gz.py` |
| **Parquet 輸出** | `parquetjs-lite` / `@dsnp/parquetjs` | 與 Athena 對齊 |
| **AWS backend runtime** | Lambda Container（Node.js 20）| 對齊 ai_workspace Lambda pattern（PyTorch 換成 nodejs-polars）|
| **IaC（release 版）** | Terraform（首選）或 AWS CDK | user 友善、HashiCorp 跨雲、若 CDK 需 Node、與 CLI 同生態 |
| **本機 config 儲存** | `~/.tdcs-dl/config.json` + env var `TDCS_DL_ENDPOINT` override | 標準位置、env 優先 |
| **節日資料** | 沿用 `config/taiwan_holidays_2025_2026.json`（ai_workspace 共用） | 直接複用 |
| **Gantry 對照** | 從 TDCS 手冊 v4.1 PDF §3 表 ingest（PLAN_E6 任務） | 權威來源；對 v3.4 diff 寫進報告 |

---

## 4. Phase 結構（PLAN_E5 完成後）

> PLAN_E5 = 本檔 + 跳板實驗 + 鎖板。下面是 v2 PLAN_E6~E13 預演（細節 PLAN 開時定）。

### PLAN_E5 ✅ 進行中（本檔 + 跳板實驗 + 鎖板）
- M1 三方資料盤點 brief ✅
- M2 跳板實驗 E1~E4 ✅
- M3 跳板實驗 E5~E7 ✅
- M4 新架構鎖板 3 決策 ✅
- M5 §1-§11 重寫 🔧（**本任務**）
- M6 PLAN_E6+ roadmap ⏳

### PLAN_E6 ‧ CLI skeleton + tdcs_clean TS 翻譯
> 派 `sonnet_worker` 主、Lead 設計 + 驗收。預估 5000-7000 行 TS。

**任務**：
- M1: Node.js / TS / commander / ink 專案結構 + `tdcs-dl` CLI 入口
- M2: TUI wizard skeleton（4-5 步、上一步、多選 / 全選）
- M3: TDCS 手冊 v4.1 PDF §3 ingest → `data/gantries_v4_1.json`（**339 gantry**、v3.4→v4.1 移除 8 + 新增 2 FR + v3.4 diff 報告）
- M4: `tdcs_clean` Python 邏輯翻譯成 TS（M06A O/D 端點命中篩 + hourly aggregation）
- M5: 對齊 baseline：跑 mcp 既有 2026/03 麻豆段資料、TS 版 vs `step1_cleaning/cleaned_202603/` 14,058 行 byte-level diff = 0
- M6: `~/.tdcs-dl/config.json` + env var override（endpoint abstraction）
- M7: `tdcs-dl config` subcommand（set-endpoint / get-endpoint / show）

**驗收**：`npm install` 本機跑 `tdcs-dl`、TUI wizard 走完 + 拿到 cleaned Parquet（本機 fake S3 path、不打 AWS）

### PLAN_E7 ‧ AWS infra setup（IaC + 部署）
> 派 `sonnet_worker` 為主、Lead 審 IaC、User 跑部署。

**任務**：
- M1: Terraform module：API Gateway HTTP + Lambda（Container）+ S3 bucket + IAM（LabRole）+ CloudWatch Logs
- M2: Lambda Container Dockerfile（Node.js 20 + nodejs-polars + AWS SDK v3）
- M3: Glue Data Catalog 表 + Athena workgroup（指向 `s3://112021024/cleaned_v2/`）
- M4: 部署到 Learner Lab 654485222392、拿 API Gateway endpoint URL、hardcode 進 CLI default
- M5: 端到端 smoke test：CLI 提交 hello world 任務 → Lambda 回 200

**驗收**：`tdcs-dl --version` 連得到 demo endpoint、ping 通

### PLAN_E8 ‧ CLI ↔ AWS download chain
> 派 `sonnet_worker`、Lead 審。

**任務**：
- M1: CLI `pull` subcommand：本機抓 TDCS（沿用 `shared_m06a.py` 邏輯、翻譯成 TS）+ gzip + 上傳 S3 + 進度條
- M2: Job metadata：CLI 寫 `s3://112021024/jobs/<job_id>.json`（status: downloading）
- M3: 整合 TUI wizard：選完路段 → 自動跑 pull → 進度條 → 完成更新 job status

**驗收**：CLI 跑「2026/03 麻豆段」→ 看到 raw csv 上 S3、`tdcs-dl status <job-id>` 回 `downloaded`

### PLAN_E9 ‧ CLI ↔ AWS clean chain
> 派 `sonnet_worker`、Lead 審。

**任務**：
- M1: Lambda handler（清洗）：讀 S3 raw → O/D 端點命中篩（PLAN_E6 翻譯邏輯） → 寫 Parquet 到 `cleaned_v2/job_<id>/<YYYYMM>/*.parquet`
- M2: CLI `clean` subcommand：觸發 Lambda + 進度條（Lambda 寫 progress 到 jobs/<id>.json、CLI 輪詢）
- M3: 整合 TUI wizard：pull 完自動 trigger clean、進度條接續

**驗收**：「2026/03 麻豆段」清洗結果與 ai_workspace baseline 14,058 行對帳一致

### PLAN_E10 ‧ Athena 整合 + query subcommand
> 派 `sonnet_worker`、Lead 審。

**任務**：
- M1: Glue Data Catalog 表自動建立（Lambda 清洗完跑 `CREATE EXTERNAL TABLE`）
- M2: CLI `query` subcommand：`tdcs-dl query --job <id> "SELECT vehicle_type, COUNT(*) ..."` → 走 Athena → 回表格 / JSON

**驗收**：跑一個 query「2026/03 麻豆段 各車種數量」+ 結果合理

### PLAN_E11 ‧ UX 打磨 + npm publish
> 派 `sonnet_worker` 為主、Lead 設計品牌。

**任務**：
- M1: 品牌：ink-big-text ASCII logo + 配色（chalk + gradient-string）+ help 訊息打磨
- M2: 錯誤訊息打磨：token 過期 / 網路斷 / S3 滿 / TDCS 缺檔等場景對應提示
- M3: `tdcs-dl auth login`（為未來 enterprise 留位、demo 期 no-op）
- M4: README.md + CHANGELOG.md + LICENSE（MIT）
- M5: npm publish 流程（package.json + bin entry + scope `@username/tdcs-dl` 或無 scope）
- M6: GitHub repo + Actions（lint / test / build）+ release workflow

**驗收**：`npm install -g tdcs-dl` 全新環境跑通整個 wizard

### PLAN_E12 ‧ 端到端 demo + integration test
> Lead + User 跑、無 worker。

**任務**：
- M1: 3 個 demo cases 跑通（全為短距離路段、O/D 端點命中篩適用、不包含長距離跨多站場景如雪山隧道——那是 ai_workspace 範疇）：
  - 「2026/03 麻豆段」（重現 mcp Stage 1、對帳 14,058 行）
  - 「2026/05 任意路段 A」（演示通用性、選短距離 4-6 站、例：基隆段 / 台中港區段 / 高雄段擇一）
  - 「2026/04 任意路段 B」（再選一個不同 route 的短距離路段、演示跨 route 通用性）
- M2: 收斂 bug、寫 integration test
- M3: 確認 `npm install` 後立刻可用、UX 流暢

**驗收**：3 cases 全跑通、無人工介入、結果可用

### PLAN_E13 ‧ 期末三件套
> Lead + User 製作、可能派 `opus_worker` 寫長文。

**任務**：
- M1: **書面報告 PDF**：含 7 跳板實驗 narrative + 系統架構 + 與 ai_workspace 期中差異對比 + 對社群影響
- M2: **PPT 簡報**：用於 Youtube demo 影片錄製、可走 AI Studio HTML 動畫路線或一般 PPT
- M3: **Youtube demo 影片 + 講稿**：5-8 分鐘、CLI 操作 demo + 跳板實驗解說 + Q&A 預演

**驗收**：三件套交件 + 課程展示通過 + GitHub release v0.1.0

---

## 5. 預期檔案結構

```
mcp_workspace/
├── workflow/                   # v0.6 工作流（本套）
│   ├── CLAUDE.md / INDEX.md / MASTER_PLAN.md / MODEL_PROFILES.md
│   ├── PLAN_E<n>.md / 實驗紀錄<n>.md
│   ├── logs/ assets/ reports/
│
├── scripts/                    # USER_RUN / 維運腳本
│   └── backfill_s3_2026.py     # 5/22 補資料用、E6 winner PoC
│
├── experiments/                # PLAN_E5 跳板實驗工作區
│   └── relay/E1~E7/            # 7 個實驗各自結果
│
├── cli/                        # ⭐ PLAN_E6+ CLI 主程式（Node.js / TS）
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # CLI entry（commander）
│   │   ├── wizard/             # ink TUI wizard
│   │   │   ├── App.tsx
│   │   │   ├── steps/{Data,Time,Gantry,Output,Confirm}.tsx
│   │   │   └── state.ts        # wizard state machine（上一步用）
│   │   ├── lib/
│   │   │   ├── tdcs-clean.ts   # Python tdcs_clean 翻譯
│   │   │   ├── tdcs-download.ts # shared_m06a.py 翻譯
│   │   │   ├── s3-client.ts
│   │   │   └── lambda-client.ts
│   │   ├── commands/
│   │   │   ├── pull.ts / clean.ts / status.ts / get.ts / query.ts
│   │   │   └── config.ts       # endpoint abstraction
│   │   └── data/
│   │       ├── gantries_v4_1.json  # 從 TDCS 手冊 v4.1 ingest
│   │       └── holidays.json
│   └── tests/                  # Jest + baseline 對齊
│       ├── tdcs-clean.test.ts  # 14,058 行 byte-level diff
│       └── fixtures/
│
├── infra/                      # ⭐ PLAN_E7 IaC（Terraform）
│   ├── main.tf
│   ├── lambda/                 # Lambda Container Dockerfile + handler
│   │   ├── Dockerfile
│   │   ├── handler.ts
│   │   └── package.json
│   ├── glue.tf athena.tf
│   └── deploy.sh               # release 版 user 跑這個
│
├── docs/                       # GitHub README + Wiki
│   ├── README.md
│   ├── relay_experiments.md    # 7 跳板實驗整理（從 brief）
│   ├── architecture.md
│   └── CHANGELOG.md
│
├── step0_s3_download/ ~ step4_ppt/    # Stage 1 麻豆段（保留作 baseline）
└── 影片摘要.md / 影片摘要_講稿.md      # Stage 1 期中產物
```

---

## 6. 關鍵設計決策（v2、PLAN_E5 鎖板）

| 編號 | 決策 | 理由 |
|---|---|---|
| D1 | npm / Node.js 純重寫、不沿用 ai_workspace Python tdcs_clean | npm 生態廣、TUI 友善（ink）、AWS SDK v3 對齊；Python 邏輯翻譯 + baseline 對齊保品質 |
| D2 | 砍 MCP / RAG / 自然語言整鏈 | 別人都在捲下游、前置工具無人做、差異化 |
| D3 | TUI wizard（ink）取代純 flag CLI | UX 對 user 友善 10 倍、命令行門檻降到 0 |
| D4 | E6 純 client-side 為跳板 winner | PoC 已通過（backfill 腳本）、零費用、最可靠、E5 backup 留 |
| D5 | 純 Lambda 處理層（短任務）| 清洗一個月 < 5 min、Lambda 配額 cover、Step Functions 留未來擴展 |
| D6 | endpoint hardcode default + config 留彈性 | demo 期 0 setup、release 後 user 自架仍可用、CLI UX 對 end-user 不變（核心 abstraction）|
| D7 | TDCS 手冊 v4.1 PDF §3 為 gantry 權威來源（vs ai_workspace v3.4）| v4.1 是 113 年 6 月最新、v3.4 可能過時、新數據優先；diff 寫進報告 |
| D8 | Gantry 顯示去 N/S（user 選 base、CLI 自動 expand）| user 不用懂方向；篩邏輯內部仍用 full gantry id |
| D9 | 進度條 = cli-progress MultiBar（下載 + 處理兩條）| Commercial CLI 標配、user 一眼看到任務狀態 |
| D10 | 不整合視覺化 / AI / 預測 | 上游 user 拿資料自己畫；ai_workspace 期中已做、不重複 |
| D11 | Demo 期 hardcode Learner Lab endpoint = 知情接受短期方案 | 老師收回後 broken；用 IaC template + config set-endpoint 解、不卡現階段 |
| D12 | TS 翻譯 vs Python wrapper：選 TS 翻譯 | npm 包獨立、user 不用裝 Python；增加 ~3000 行 code 但 long-term 維護更好 |
| D13 | 砍預先設計的 8 個 worker（clean_lib_worker 等）→ **4 固定 worker**（opus/sonnet/gpt5/haiku）| User 6/2 校準 3 worker，同日晚 haiku_worker 新增為最底層 worker；詳 MODEL_PROFILES §0.1 |

---

## 7. 風險與待議

| 風險 | 緩解 |
|---|---|
| **Lambda cold start**（清洗 Container ~1.5 GB）| 預期 ~3-5 sec cold + ~100 ms warm；可選 provisioned concurrency（但吃 cost） |
| **Node.js polars vs Python pandas 對齊**（D1 風險）| PLAN_E6 M5 = baseline 對齊驗證、byte-level diff = 0；不通過不出 PLAN_E6 |
| **Learner Lab session token 4hr**（部署期）| 跑 deploy.sh 前刷新；部署完 endpoint live、user 端 call 不影響（demo 期半年內 endpoint 都活）|
| **老師收回 Learner Lab 帳號**（demo 後）| 預料中、IaC template + endpoint 抽象解（D6 / D11）；GitHub release 寫 README 教 user 自架 |
| **TDCS 手冊 v4.1 vs v3.4 gantry 不一致**（D7 風險）| PLAN_E6 M3 = diff 寫進報告、可能新增 / 改名 gantry 列出來 |
| **E6 winner 把下載放 user 機 = 違反「AWS 做重活」字面**| 已 reframe（brief §C）：下載是台灣 IP 物理約束、清洗才是 AWS 真重活、E6 對現實誠實 |
| **E5 backup 啟用時 cloudflared URL 不穩**（quick tunnel）| PLAN_E11 加 named tunnel 設定文檔；demo 期不啟 E5 |
| **TUI wizard 在 Windows cmd / PowerShell 顏色不對**| `chalk` / `ink` 在 modern terminal 都 OK；舊 cmd.exe 退 fallback 純文字模式 |
| **npm publish 名稱衝突**（tdcs-dl 可能已被人佔）| PLAN_E11 跑前查 npmjs.com、退 fallback `@username/tdcs-dl` scope |
| **Athena query 吃 Learner Lab 配額**（scan 大時）| Lambda 寫 Parquet + partition、user query 控 partition；CLI `query` 加 `--scan-limit-mb` flag 警告 |
| **Lambda 15 min timeout**（巨型任務）| demo 期單月 < 5 min；如未來 user 跑全年 16 月、需切 chunk 或回 Step Functions（PLAN_E7+ 評估） |
| **Lead 跨工作區污染**（已實際發生 2 次：5/28 demo 提案、6/2 brief「嚴格穿越篩」措辭）| Lead 每次提案前必須先讀本工作區 CLAUDE.md + 影片摘要、確認範疇對齊；事件 #4 + #5 紀錄 root cause；本檔 §0 新「demo 主角」+「期中專題比較」欄釘住「不污染 ai_workspace」；下個 PLAN 啟動時 Lead 主動 review 此風險 |
| **Lead 驗收抽樣覆蓋率不足**（FR113/143 漏、F-C1 spec drift 都是 Lead 抽樣沒抓到）| 引入 `opus_worker` 作獨立階段審查（PLAN_E6 已執行、見事件 #5、findings 1 Critical + 3 High + 5 Medium）；未來每 PLAN 收尾前派 opus 審一輪、不依賴 Lead 抽樣 |
| **Glue ETL 不採用 vs 規則 R11/R13 計分項張力**（緩解未驗證）| brief_cleaning_arch §3 已寫「為什麼選 Lambda 不選 Glue ETL」工程選擇 narrative、Glue Data Catalog 仍用（metadata service）≠ Glue ETL（Spark batch、不用）；風險點 = 規則對「Cloud9 + Glue ETL」字面是否排他、緩解 = narrative + 報告 §7 期中比較段明示工程合理性選擇；如評分嚴格按字面、Volume 那 10% 有 partial loss 風險、約 -2~5% 影響 |
| **並行派工共用 working tree 的 git pull --rebase 假設不成立**（已實證 2026-06-04 PLAN_E9 gate 批 A+B）| user 兩 worker 在同筆電 mcp_workspace dir 並行跑、Lead 預設「commit 前 pull --rebase」hint 在 dirty tree 直接被拒 + selective commit 拆不開同檔（README 兩 worker 不同段）→ 兩 worker 都按紅線 STOP 等 Lead 整合。**未來並行派工 3 個策略選一**：(A) user 操作 `git worktree add` 給每 worker 獨立 working tree、各自 commit + push 走 PR；(B) strict serial（一 worker 完再下一個、慢但無衝突）；(C) Lead 整合 commit（小批 ≤ 2 worker 適用、Lead bottleneck 不會大、本批走的）。事件 #3 詳述完整 root cause + Lead 整合流程 |

---

## 8. 工作流程

### 8.1 v0.6 workflow 通則

見 `workflow/CLAUDE.md`：Lead/Worker/User 三角、五段式事件、`[USER_RUN]` 規則、§5.0 Lead 不得自派 worker（必須由 User 在另一介面啟動）。

### 8.2 派 PLAN

- 每個 Phase 對應一個 `PLAN_E<n>.md`、Lead 寫
- 跑完封存 `archive.py --plan workflow/PLAN_E<n>.md` → INDEX 自動 regen
- 每 PLAN 對應一份 `實驗紀錄<n>.md`、事件五段格式

### 8.3 worker 模型分配（沿用 MODEL_PROFILES §0.1）

| Worker | 模型 | 適合 PLAN |
|---|---|---|
| `opus_worker` | Claude Opus 4.8 | PLAN_E13 期末三件套（長文 PDF / 跳板實驗 narrative 寫作）、跨檔架構 review |
| `sonnet_worker` | Claude Sonnet 4.6 | PLAN_E6 (CLI skeleton) / E7 (IaC + Lambda) / E8 (download) / E9 (clean) / E10 (Athena) / E11 (UX)、終端密集 |
| `gpt5_worker` | GPT-5 high | 演算法實作（tdcs_clean TS 翻譯細節、Parquet 對齊邏輯）；spec-clear 的小範圍實作 |
| `haiku_worker` | Claude Haiku 4.5 | 規則性 / 重複性 / 批次 / 簡單套規則任務（fixture 生成、typo 修、字串 replace、簡單 unit test、config 套、抽樣 verify、文字 formatting）；由主 worker 下派 |

第一次派任何 worker = 完整 onboard prompt（必讀檔 + 品質紀律 + spec + 紅線 + 完成動作、見 MODEL_PROFILES §0.2）；後續續派可短指令。

---

## 9. 驗收標準（整體完成定義）

- [x] PLAN_E5 完成（鎖板 + 7 實驗 + MASTER_PLAN 重寫）
- [ ] PLAN_E6：CLI skeleton + TUI wizard 跑通 + tdcs_clean TS 翻譯對齊 14,058 行 baseline
- [ ] PLAN_E7：AWS infra 部署完成、`tdcs-dl --version` ping 通 endpoint
- [ ] PLAN_E8：CLI pull 跑通、raw csv 上 S3
- [ ] PLAN_E9：CLI clean 跑通、Parquet 寫對、baseline 對帳一致
- [ ] PLAN_E10：CLI query 跑通、Athena 回結果
- [ ] PLAN_E11：UX 打磨完成、`npm install -g tdcs-dl` 全新環境跑通
- [ ] PLAN_E12：3 demo cases 全跑通
- [ ] PLAN_E13：書面報告 PDF + PPT 簡報 + Youtube 講稿三件套 + GitHub v0.1.0 release

---

## 10. 下一步

PLAN_E5 / M5 跑完（本任務）→ M6 寫進實驗紀錄末事件 + 跑 `archive.py` 封存 PLAN_E5。然後：

1. **User**：刷 Learner Lab token、跑 `scripts/backfill_s3_2026.py` 補 114 天到 `s3://112021024/`（demo baseline）
2. **Lead**：草擬 PLAN_E6（CLI skeleton + tdcs_clean TS 翻譯）+ `sonnet_worker` 第一次派工 onboarding prompt
3. **User**：派 `sonnet_worker` 在 Claude Code CLI 新 session 啟動
4. 循環 PLAN_E6 → E7 → ... → E13

---

## 11. Changelog

### v2 (2026-06-02) — CLI + AWS backend pivot

**從**：MCP server + RAG（Chroma + bge-m3）+ ChatGPT 自然語言 client + Lambda /history + Tailscale exit-node。
**到**：CLI（npm/Node.js/ink TUI）+ AWS backend（API GW + Lambda + S3 + Athena）+ E6 純 client-side winner。

**Pivot 經緯**：
- 5/28：v1 鎖板（MCP 方向）
- 6/2 上午：PLAN_E5 / M1 三方資料盤點 brief 出版
- 6/2 下午：User pivot — 「MCP 多餘、大家都在捲視覺化 + AI、沒人解決前置最麻煩部分」、改做 npm CLI + AWS backend
- 6/2 下午：PLAN_E5 v2 + MASTER_PLAN §0 v2 落地（事件 #4）
- 6/2 下午：7 跳板實驗（事件 #5 sonnet + 事件 #6 Lead）+ M4 鎖板（事件 #7）
- 6/2 晚：本檔 §1-§10 全面重寫對齊 v2（事件 #8 預定）

**砍掉的 v1 概念**（在本檔已不存在、若需歷史對照看封存）：
- MCP server / Streamable HTTP / SSE / Cloudflare tunnel for MCP
- RAG（Chroma + bge-m3）/ gantries.json with embedding / 自然語言 understand_query
- ChatGPT 主 client / 自製 Claude Desktop UI / MaiAgent
- 預先設計的 8 個 worker（clean_lib_worker / rag_worker / mcp_server_worker 等）
- 「比賽版」+ ngrok / 「作業版」EC2 t3.small 東京
- Phase M-3 RAG / M-6 通用圖表 / M-9 比賽版（三個 Phase 砍掉）

**保留的概念**（v1 → v2 共用）：
- AWS region us-east-1（Learner Lab 硬性）
- TDCS schema 兩大陷阱（M06A `detection_time_o/d` 是字串需 CAST timestamp / `gantry_id_o`、`_d` 不代表全路徑）。**長距離跨多站需 trip_information regex 嚴格穿越**（雪山隧道、ai_workspace 範疇）— mcp 麻豆段及其他短距離路段 O/D 端點命中篩即可、本專案 scope 不含長距離穿越場景
- ai_workspace 既有資產（gantry 對照 / 節日 JSON / Lambda template）
- 共用 lib 邏輯（tdcs_clean，但翻譯成 TS）
- 期末三件套交付
- v0.6 workflow / 3 worker 名冊 / 品質紀律 §0.3

### v1 (2026-05-06 ~ 2026-05-28) — MCP server 方向（歷史 reference）

最初 MASTER_PLAN（2026-05-06）規劃 EC2 東京 + 個人帳號 + Claude Desktop + RAG MCP server、Phase M-1~M-9 完整鏈。5/28 升級 v0.6 workflow 時鎖了 §0 鎖板段、但 §1-§10 沒同步更新、累積 10 條衝突（region / 帳號 / 架構 / client / PLAN 命名）。

詳細 v1 內容已被本次 v2 重寫覆蓋。若需 v1 歷史素材：
- `workflow/logs/實驗紀錄2.md`：5/6 初版 MASTER_PLAN 起草背景
- `workflow/logs/實驗紀錄3.md`：5/8 Phase 0 tdcs_clean lib 完成
- `git log` 本檔歷史 commit
