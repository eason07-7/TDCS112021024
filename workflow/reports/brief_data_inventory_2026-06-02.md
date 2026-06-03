# M1 三方資料盤點 — mcp_workspace 期末前置調查

> **PLAN_E5 / M1**：盤點所有可用素材、避免後續 PLAN 從錯誤地基往上堆。
> **產出於**：2026-06-02
> **資料來源**：ai_workspace 既有 codebase（唯讀參考）+ D:\p\112021134\ 下載工具 + mcp_workspace 既有 + 帳號 654485222392 實測 + finance_workspace MCP 經驗。
> **未完項**：§2.3 帳號 112021134 S3 內容用 ai_workspace docs 推斷、實測待 User 提供該帳號 token 後補正（不卡 M2/M3）。

---

## §0 結論（給趕時間的 Lead）

1. **TDCS 我們會碰兩個產品**：M03A（5 分鐘車流、訓練源、ai_workspace 已實作）+ M06A（完整旅次、OD 分析、雙工作區共用）。M04A/M05A/M07A 在 ai_workspace MASTER_PLAN 列「未來擴展」、實作 0、暫不納入 mcp_workspace v1 scope。
2. **三方 S3 狀態**：
   - **`s3://112021024/`**（new、main）：672 obj / 3.9 GiB、`202603/` + `202604/` partition、結構就緒。
   - **`s3://112021024trafficdatacollectionsyste/`**（new account 舊桶）：preserved、不動、價值 = 28 天 M06A 已搬入 new bucket。
   - **`s3://112021134trafficdatacollectionsyste/`**（ai_workspace 帳號 401322580935）：**16 個月（2025/01~2026/04）完整 M03A + M06A raw + 全套 v3 Parquet + 5 個 Athena 表**。我們**不要 sync 過來**（耗配額）、改用 Athena cross-account 直查 / 或 Lambda 抓我方 bucket 即可。
3. **可重用核心 12 條**（§3 詳述）：
   - `tdcs_clean/` 共用 lib（194 行、O OR D 邏輯、已通過 14,058 行對帳）
   - `D:\p\112021134\download_*` + `upload_month_gz.py` 下載 / 壓縮上傳鏈
   - 5 個 Athena CTAS SQL（M03A 5min→hourly、M06A **嚴格穿越 OD = ai_workspace 雪山隧道專用、mcp 不導入**、預聚合 1500x scan reduction）
   - Lambda Container template (`ai_workspace/src/lambda_predict_v3/`)：PyTorch CPU、~1.2 GB image、boto3 athena 取代 awswrangler 省 200MB
   - `feature_engineering_v3.py` holiday + cyclic feature 完整 22 維
   - `config/gantry_to_county.json` **345 個 gantry** 全台對照（mcp_workspace 直接拿來做 RAG gantries.json 雛形）
   - `config/taiwan_holidays_2025_2026.json` 27 個節日 + 補班、PLAN_E04 成果、直接複用
4. **finance_workspace MCP 經驗**：官方 `mcp` SDK + Streamable HTTP + ASGI middleware 三明治 + ContextVar 拿身分（**不要塞 context 物件進 tool 簽名**）、Cloudflare tunnel 暴露給 LLM client。下面 §5 摘要關鍵踩雷。
5. **對 PLAN_E5 後續 milestone 的 input**（§6 詳述）：
   - M2 上網查的重點服務排序：Lambda + API GW + Athena = MUST 通；EFS / ECS / Step Functions = 看 Chroma 落位才決定要不要驗。
   - M3 實測序：先驗 Lambda outbound 到 TDCS（如果通 = Tailscale 路線可降為備案）；再驗 API GW + Lambda chain；其他選用測。
   - M4 三洞 hint：Chroma 偏 EC2 t2.micro stub（最低成本、最簡單）；MCP server 偏「Cloudflare tunnel + 本機 server」（沿用 finance pattern）vs 「API GW + Lambda」二選；長任務偏 Step Functions（如 Learner Lab 支援）or 本機觸發（fallback）。

---

## §1 TDCS 公開資料 Schema 盤點

### §1.0 來源網域 + 命名

- **公開 URL 根**：`https://tisvcloud.freeway.gov.tw/history/TDCS/`
- **產品子路徑**：`{M03A,M06A,...}/<YYYYMMDD>/<HH>/TDCS_<產品>_<YYYYMMDD>_<HH>0000.csv`
- **打包**：每天可選 `M06A_<YYYYMMDD>.tar.gz`（24 小時整包）或單小時 csv
- **存取限制**：**只限台灣 IP**（這是我們 PLAN_E5 §0 鎖板路由 D 的核心約束）
- **下載權威來源**：[`D:\p\112021134\DOWNLOAD_WORKFLOW.md`](D:\p\112021134\DOWNLOAD_WORKFLOW.md)（M06A）+ [`D:\p\112021134\download_m03a.py`](D:\p\112021134\download_m03a.py)（M03A）

### §1.1 M06A — 完整旅次資料（**mcp_workspace 主用**）

**用途**：trip-level OD 分析、車種比例、隧道穿越判斷、跨匝道路徑

**檔案結構**：每日 24 個整點 csv、每 csv = 該小時內**完成**的所有旅次（trip_end 落在此小時）

**欄位**（依 ai_workspace [`BUG_OD_FILTER.md`](../../../ai_workspace/BUG_OD_FILTER.md) + [`athena_ctas_m06a_od.sql`](../../../ai_workspace/cloud/athena_ctas_m06a_od.sql)）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `vehicle_type` | int | 31=小客車 / 32=小貨車 / 41=大客車 / 42=大貨車 / 5=聯結車 |
| `detection_time_o` | VARCHAR | 起點時間（**字串、非 timestamp、Athena 要 CAST**） |
| `gantry_id_o` | string | 第 1 個偵測站 = 上交流道（**不是路徑首站、只是 trip 起點**） |
| `detection_time_d` | VARCHAR | 終點時間 |
| `gantry_id_d` | string | 最後偵測站 = 下交流道 |
| `trip_length` | float | 旅次總公里（VARCHAR 需 CAST DOUBLE） |
| `trip_end` | string | 結束時間 |
| `trip_information` | string | **關鍵**：旅次經過所有 gantry 的 `<gantry>;<timestamp>\|...` 串、用 regexp_extract 抽中間 gantry timestamp 算分段時間 |
| `yyyymm` | partition | Athena partition key |

**🚨 場景分流（從 BUG_OD_FILTER + ai_workspace/CLAUDE.md 常見陷阱）**：

1. **`gantry_id_o OR gantry_id_d IN (...)` 篩特定路段** — 適用 **短距離 4-6 站路段**（如 mcp 麻豆段 4 站、k289-k303）、trip 起終點落在 target gantry 內就是真實 trip、雜訊小（mcp Stage 1 已驗、14,058 行 baseline 對齊）。**這就是 mcp 本專案的清洗 spec**。
   - **長距離跨多站場景**（如雪山隧道 28 km 跨 8+ 站）才需 `regexp_like(trip_information, '<gantry>')` 嚴格穿越（不然 v1 87% noise）— **ai_workspace 範疇、不是 mcp scope**。
2. **`detection_time_o` 是字串、不是時間戳** — Athena 算間隔用 `date_diff('second', CAST(... AS TIMESTAMP), ...)`。
3. **`gantry_id_o` / `_d` ≠ trip 的全路徑** — 只是首尾兩站、中間站全在 `trip_information` 字串裡（mcp 不用看中間站、O/D 命中即可；ai_workspace 雪山要看）。

**mcp CLI 設計實作影響**：
- 「篩麻豆段車流」這種 OD 查詢 → 用 **`gantry_id_o IN ('01F2930N','01F2930S','01F3019N','01F3019S') OR gantry_id_d IN (...)`**（對映規則 R12「上下交流道」分析）
- user 任意指定**短距離路段**、CLI 用同樣 O/D 命中篩、適用 mcp scope
- **未來如需支援長距離穿越場景**（PLAN_E9+ 擴展）、再補 trip_information regex 模式

### §1.2 M03A — 5 分鐘單站車流（**ai_workspace 訓練主源**）

**用途**：站點流量時序、車種分佈、ai_workspace v3 LSTM 訓練目標

**檔案結構**：每日 288 個 5 分鐘 csv（`time_interval` = `YYYY-MM-DD HH:MM:00`）

**欄位**（依 [`athena_ctas_m03a.sql`](../../../ai_workspace/cloud/athena_ctas_m03a.sql)）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `time_interval` | string | 5 分鐘區段起點、格式 `YYYY-MM-DD HH:MM:00` |
| `gantry_id` | string | 偵測站（已含方向 N/S）|
| `direction` | string | 北上 / 南下（其實 gantry_id 後綴已含、冗餘）|
| `vehicle_type` | int | 同 M06A |
| `flow` | int | **該 5 分鐘該車種通過數**（核心數字）|
| `yyyymm` | partition | |

**Hourly 聚合對齊**（Athena CTAS）：4 站 × 31 天 × 24 小時 × 5 車種 = **14,880 行/月**

**MCP server 設計實作影響**：
- 流量時序圖、車種分佈圖、預測模型 input → 都吃 M03A hourly
- M03A vs M06A 單位差：M03A = 通過數（站視角）、M06A = 旅次數（trip 視角）、**圖表 legend 要分清**（ai_workspace 期末 PDF 標註過此 limitation）

### §1.3 M04A / M05A / M07A — 未實作

ai_workspace MASTER_PLAN §1.2 寫「未來擴展 M03A/M04A/M05A/M07A」、目前**只實作 M03A + M06A**。M04A/M05A/M07A 推測：

- **M04A**：OD pair 5 分鐘統計（按起終點對 + 車種分桶）— 高層 OD aggregate、可能取代 M06A regex 操作
- **M05A**：link-based 平均速度（路段、非點）— 適合做 link-level congestion 視覺化
- **M07A**：月份總體統計報表

⚠️ **mcp_workspace v1 不納入**。RAG 階段（PLAN_E7 / M-2）若 User 要擴展、再到 [tisvcloud.freeway.gov.tw/history/TDCS/](https://tisvcloud.freeway.gov.tw/history/TDCS/) 目錄看實際格式 + 補 schema。

### §1.4 公開資料的可信度邊界（重要）

- **缺日 / 缺小時**：偶有官方資料缺洞（如 ai_workspace v3 已知 2026/04/04 缺 3 小時、`slot_count < 12`）
- **車種辨識誤差**：TDCS 用 etag + 影像、業界準確率 ~95%（5% 誤分）— mcp_workspace `qa_finding_violation_vehicles.md` 已明文討論
- **路段限制**：TDCS 只有 gantry 點測、隧道內沒設站 — 「雪山隧道內速度」拿不到（只能用穿越時間反推平均）

---

## §2 三方 S3 內容盤點

### §2.1 主帳號 `654485222392` (student `112021024`) — 新 bucket `s3://112021024/`

**狀態**：5/28 創建、結構就緒、待 backfill

| Prefix | 內容 | obj 數 | size | 來源 |
|---|---|---|---|---|
| `202603/` | M06A `.csv.gz`（2026/03/29~03/31 三天）| 72 | ~430 MB | 跨桶 cp from 舊桶 |
| `202604/` | M06A `.csv.gz`（2026/04/01~04/25 25 天）| 600 | ~3.5 GiB | 跨桶 cp from 舊桶 |
| `202601/` | ⏳ 待補 31 天 | 0 | — | 待 backfill 腳本 |
| `202602/` | ⏳ 待補 28 天 | 0 | — | 待 backfill 腳本 |
| `202603/` extras | ⏳ 待補 2026/03/01~03/28 | 0 | — | 待 backfill |
| `202604/` extras | ⏳ 待補 2026/04/26~04/30 | 0 | — | 待 backfill |
| `202605/` | ⏳ 待補 ~27 天（看 TDCS 公開到哪）| 0 | — | 待 backfill |
| `cleaned/` | 預留：通用化清洗產出 | 0 | — | PLAN_E6 M-1 產出 |
| `knowledge/` | 預留：gantries.json、holidays.json | 0 | — | PLAN_E7 M-2 產出 |
| `jobs/` | 預留：MCP 長任務狀態 | 0 | — | PLAN_E10 M-5 |
| `charts/` | 預留：視覺化產出 | 0 | — | PLAN_E11 M-6 |
| `athena-results/` | Athena 預設輸出 | 0 | — | 跑 query 才產生 |

**Backfill 腳本**：`scripts/backfill_s3_2026.py`（idempotent、5 個月 ~17 GiB / 2,736 obj）

### §2.2 主帳號 `654485222392` 舊 bucket `s3://112021024trafficdatacollectionsyste/`（preserved、唯讀）

**狀態**：5/28 探勘已知、不動

| Prefix | 內容 | obj 數 | size |
|---|---|---|---|
| `112021024/` | M06A 28 天平鋪（2026/03/29~04/25）| 672 | 3.9 GiB |
| `Unsaved/` | Athena 查詢殘檔（2026/04/28）| ~10 | 數 KB |
| `athena-results/` | 系統檔 | 2 | 118 B |

**為什麼 preserved 不動**：User 5/28 拍板 — 既有 28 天已搬入新桶、舊桶不再 maintain、留作歷史。

### §2.3 ai_workspace 帳號 `401322580935` (student `112021134`) — bucket `s3://112021134trafficdatacollectionsyste/`

⚠️ **本節用 ai_workspace docs/code 推斷、實測待 User 提供該帳號 token 後校正**

**推斷依據**：
- [`ai_workspace/CLAUDE.md`](../../../ai_workspace/CLAUDE.md) 寫 bucket + Athena 表名
- [`athena_ctas_m03a.sql`](../../../ai_workspace/cloud/athena_ctas_m03a.sql) + [`athena_ctas_m06a_od.sql`](../../../ai_workspace/cloud/athena_ctas_m06a_od.sql) 寫 `external_location`
- [`athena_ctas_m06a_aggregate.sql`](../../../ai_workspace/cloud/athena_ctas_m06a_aggregate.sql) 寫 aggregate 表路徑

| Prefix | 推斷內容 | 體積估計 |
|---|---|---|
| `202501/` ~ `202604/` | M06A raw `.csv.gz`（16 月、~480 天、24h/天 = 11,520 obj）| ~70 GiB |
| `m03a/202501/` ~ `m03a/202604/` | M03A raw `.csv.gz`（16 月、~480 天、288 obj/天）| ~30 GiB（推估） |
| `cleaned_v3_m03a/yyyymm=.../` | M03A hourly aggregate Parquet（4 站 × 16 月 × ~20k 行）| ~50 MB |
| `cleaned_v3_m06a_od/yyyymm=.../` | M06A 嚴格穿越 OD Parquet（**ai_workspace 雪山專用、mcp 不引用**） | ~500 MB |
| `aggregate_v3_m06a_hourly_gantry_vt/` | 預聚合表（< 2 MB / 58k rows）| ~2 MB |
| `cleaned_v3_m03a_validate/` | 單月 validate（202501）| ~5 MB |
| `cleaned_v3_m06a_od_validate/` | 單月 validate（202603）| ~30 MB |
| `athena-results/lambda-predict/` | Lambda /predict 查詢結果 stage | < 100 MB |

**Athena 表（在 `tdcs` database）**：

| 表名 | 行數估計 | 描述 |
|---|---|---|
| `tdcs.m03a_raw` | 巨大 | 原始 5 分鐘 csv 透過 Glue 表面化 |
| `tdcs.m06a_raw` | 巨大 | 原始旅次 csv 表面化 |
| `tdcs.m03a_hourly_2025_2026` | ~230k rows（4 站 × 24h × 480 天 × 5 vt）| LSTM 訓練源 |
| `tdcs.m06a_od_2025_2026` | ~60M rows | 嚴格穿越雪隧旅次（**ai_workspace 範疇**）|
| `tdcs.m06a_hourly_gantry_vt` | ~58k rows / 2 MB | 預聚合 1500x scan reduction |

**MCP server 策略影響**：
- ai_workspace bucket **不要 sync 過來**（70+ GiB 跨 region 不必要）、選一：
  - **A. 跨帳號讀**：mcp Lambda 用 ai_workspace Athena 表（需 bucket policy + Athena workgroup 跨帳號設定）
  - **B. 各自獨立**：mcp 從零跑 CTAS、自己的 bucket、自己的 Athena 表
- **建議 B**：Learner Lab 跨帳號 IAM 複雜、容易踩 SCP（Service Control Policy）；mcp 用自己 17 GiB 的 5 個月、加 backfill 邏輯支援按需擴展即可。

### §2.4 三方總覽比較

| 維度 | 主帳號 新桶 | 主帳號 舊桶 | ai_workspace 桶 |
|---|---|---|---|
| 帳號 | 654485222392 | 同左 | 401322580935 |
| Region | us-east-1 | us-east-1 | us-east-1 |
| 用途 | mcp 主資料區 | 既有 28 天備份 | ai_workspace 16 月完整 |
| 寫入權 | ✅ Lead+User | ❌ 唯讀 | ❌ 跨帳號、無權 |
| 推薦 | **主用** | 留作對照 | 不動、需要時跨帳號讀 |

---

## §3 ai_workspace 可重用清單

按「**可直接 import / 可 copy 改 / 概念 reference**」三類分。

### §3.1 直接 import — 共用 lib

| 路徑 | 行數 | 說明 |
|---|---|---|
| [`tdcs_clean/core.py`](../../../tdcs_clean/core.py) | 100 | 清洗主邏輯：read_one_csv / clean_raw_df / build_hourly_aggregation / merge_hourly_accumulator / add_week_index |
| [`tdcs_clean/cli.py`](../../../tdcs_clean/cli.py) | 76 | CLI 入口、`python -m tdcs_clean.cli --year-month-list 2026-03 --gantries ...` |
| [`tdcs_clean/config.py`](../../../tdcs_clean/config.py) | 16 | RAW_COLUMNS、CleanResult dataclass |
| [`config/gantry_to_county.json`](../../../config/gantry_to_county.json) | 345 gantry | **全台國 1 + 國 1H + 國 3 + 國 3甲 + 國 5 共 345 站**、含 route / county / city / section、覆蓋率 ≥ 99% OD trips |
| [`config/taiwan_holidays_2025_2026.json`](../../../config/taiwan_holidays_2025_2026.json) | 27 holidays | 2025-01-01 ~ 2026-04-30、is_holiday + is_workday_swap + long_weekend_id、政府辦公日曆表 dataset/14718 |

**對 mcp_workspace 影響**：
- M-2 全台 Gantry KB 的 **80% 工作已做完** — 直接拿 `gantry_to_county.json` 當基底、補經緯度即可
- 節日 JSON 直接複用、不需重做
- 共用 lib 直接 import、PLAN_E6 通用化只是改 CLI 參數而已

### §3.2 可 copy 改 — 下載 / 上傳鏈

| 路徑 | 說明 | 改點 |
|---|---|---|
| [`D:\p\112021134\download_only_2025.py`](D:\p\112021134\download_only_2025.py) | M06A 月份批次下載、`_READY` 標記 | 加 `S3_PREFIX` env var 支援前綴；確認 2026 起的日曆 |
| [`D:\p\112021134\upload_month_gz.py`](D:\p\112021134\upload_month_gz.py) | gzip + 多執行緒上傳、`head_object` skip 大小一致檔 | 同上 |
| [`D:\p\112021134\download_m03a.py`](D:\p\112021134\download_m03a.py) | M03A 5 分鐘批次下載（288 檔/天）| 同 download_only_2025 結構 |
| [`D:\p\112021134\tdcs_m06a_month_202603\shared_m06a.py`](D:\p\112021134\tdcs_m06a_month_202603\shared_m06a.py) | TDCS URL + 檔名建構共用、含 tag prefix 邏輯 | 直接 import |
| [`mcp_workspace/scripts/backfill_s3_2026.py`](../../../mcp_workspace/scripts/backfill_s3_2026.py) | **新寫的** wrapper、讀 mcp .env、subprocess 跑上面兩支 | 已完成 |

### §3.3 可 copy 改 — Athena CTAS SQL（**⭐ PLAN_E7 / E9 必讀**）

> ai_workspace 在 AWS 上跑過完整 Athena CTAS 清洗鏈、production-validated 16 個月 / 60M rows、Lambda /history 端點實測 < 1 MB scan / 2.6 s。**mcp PLAN_E7（AWS infra）+ PLAN_E9（clean chain Lambda 設計）必須引用這套 reference**。

| 路徑 | 說明 | mcp 改點 |
|---|---|---|
| [`athena_ctas_m03a.sql`](../../../ai_workspace/cloud/athena_ctas_m03a.sql) | 5min → hourly 聚合、4 站 × 5 車種 | M03A 未來擴展、改 `gantry_id IN (...)` 為任意 list；外部 location 改 mcp bucket |
| [`athena_ctas_m06a_od.sql`](../../../ai_workspace/cloud/athena_ctas_m06a_od.sql) | **M06A 嚴格穿越篩 SQL 版**（regex `trip_information`、`05F0287` AND `05F0055`、雪山專用）| **mcp 不直接套用**（雪山才需嚴格穿越）；mcp 取此檔的「Parquet 輸出 + partition by yyyymm」結構作 reference、清洗邏輯改用 mcp Stage 1 `clean_202603.py` 的 O/D 端點命中篩 |
| [`athena_ctas_m06a_aggregate.sql`](../../../ai_workspace/cloud/athena_ctas_m06a_aggregate.sql) | hourly × gantry × vt 預聚合表（**scan 降 1500x、< 2 MB / ~58k rows**）| **cost 殺手 pattern**；為 mcp 任意路段建類似 aggregate（user query 用）|
| [`glue_ddl.sql`](../../../ai_workspace/cloud/glue_ddl.sql) / [`glue_ddl_m03a.sql`](../../../ai_workspace/cloud/glue_ddl_m03a.sql) / [`glue_ddl_m06a.sql`](../../../ai_workspace/cloud/glue_ddl_m06a.sql) | Glue Data Catalog 表 DDL（raw csv → Athena queryable、partition 設定）| 改 location |
| [`athena_setup_v3.py`](../../../ai_workspace/cloud/athena_setup_v3.py) | Athena workgroup 自動 setup（boto3）| PLAN_E7 / M3 部署用、不必重發明 |
| [`athena_b3_full.py`](../../../ai_workspace/cloud/athena_b3_full.py) / [`athena_b4_od.py`](../../../ai_workspace/cloud/athena_b4_od.py) / [`run_ctas_aggregate.py`](../../../ai_workspace/cloud/run_ctas_aggregate.py) | Athena query 自動化 Python（boto3 `start_query_execution` + 輪詢 + `s3.get_object` 抓 csv result、**避開 awswrangler ~200 MB 包**）| Lambda handler TS 翻譯參考 |
| [`fix_m06a_partitions.py`](../../../ai_workspace/cloud/fix_m06a_partitions.py) / [`fix_m06a_v2.py`](../../../ai_workspace/cloud/fix_m06a_v2.py) | **partition 修補腳本**（踩過的雷 + 解決方案）| **PLAN_E7 必看避雷** |
| [`run_athena.py`](../../../ai_workspace/cloud/run_athena.py) | Athena 通用查詢 wrapper | PLAN_E10 query subcommand 參考 |
| [`_run_ctas_with_0404.py`](../../../ai_workspace/cloud/_run_ctas_with_0404.py) | CTAS 含 partition 對齊 specific date 邏輯 | reference |

**關鍵 pattern**：
- **預聚合 + Athena partition = 省 cost 的命脈**（1500x scan reduction、$5/TB 算下來幾乎免費）
- **不用 awswrangler**、改 `boto3 athena.start_query_execution` + 輪詢 + `s3.get_object` 抓 result csv（Lambda Container package size 省 200 MB）
- **mcp 與 ai_workspace 用不同清洗 spec 對映不同場景**：
  - ai_workspace = 雪山隧道（長距離 28 km 跨多站）→ Athena CTAS SQL `regexp_like(trip_information)` 嚴格穿越
  - mcp = 麻豆段（短距離 4 站、其他用戶短距離通用化）→ Lambda Container TS `gantry_id_o OR gantry_id_d IN (...)` O/D 端點命中篩
  - **兩套不是同 spec、不應對齊**；mcp 取 ai_workspace 的 Athena workgroup / Glue Catalog / partition by yyyymm 等**架構 pattern**作 reference、但**清洗篩邏輯各自獨立**、結果本就會不同

> ⚠️ **mcp 清洗 ≠ ai_workspace 清洗**（架構選擇不同）：見 [`brief_cleaning_arch_comparison_2026-06-02.md`](brief_cleaning_arch_comparison_2026-06-02.md)（待補、PLAN_E13 報告 §7 期中比較 narrative 素材）。

### §3.4 可 copy 改 — Lambda Container 範本（**⭐ PLAN_E7 / E9 必讀**）

> ai_workspace 用 Lambda Container 跑 PyTorch 推論、production-validated（cold start 165 ms、warm 4.9 s、image ~1.2-1.5 GB）。mcp PLAN_E7 Lambda Container 設計（換 PyTorch → nodejs-polars + tdcs_clean TS）直接 copy 這套 Dockerfile + 部署 workflow 結構。

| 路徑 | 說明 | mcp 用途 |
|---|---|---|
| [`src/lambda_predict_v3/Dockerfile`](../../../ai_workspace/src/lambda_predict_v3/Dockerfile) | PyTorch CPU 2.5.0 + numpy + pandas + boto3、image ~1.2-1.5 GB | **改 Node.js 20 base** + nodejs-polars + AWS SDK v3 + tdcs-clean.ts |
| [`src/lambda_predict_v3/handler.py`](../../../ai_workspace/src/lambda_predict_v3/handler.py) | Router 模式（/predict + /history 分流）、cold init 全域載入、`_lazy_init_*` pattern、`gantry_id` regex 防 SQL injection、`MAX_SCAN_MB` guard | 翻成 handler.ts、保留 router + lazy init + regex guard pattern |
| [`src/lambda_predict_v3/feature_eng.py`](../../../ai_workspace/src/lambda_predict_v3/feature_eng.py) | 22 維特徵 hourly（cyclic + holiday + ...）| 不直接用（mcp 不做預測）；但 holiday lookup 邏輯可 reuse |
| [`src/lambda_predict_v3/_build_push_deploy.py`](../../../ai_workspace/src/lambda_predict_v3/_build_push_deploy.py) | 自動 build → ECR push → Lambda update workflow | **PLAN_E7 部署 script 範本** |
| [`src/lambda_predict_v3/_setup_apigw.py`](../../../ai_workspace/src/lambda_predict_v3/_setup_apigw.py) | API Gateway v2 setup | **PLAN_E7 API GW 部署** |
| [`cloud/deploy_lambda.py`](../../../ai_workspace/cloud/deploy_lambda.py) | Lambda 部署整鏈（ECR push + create-function + update-function-code）| **PLAN_E7 部署 wrapper 參考** |
| [`cloud/lab_selfcheck.py`](../../../ai_workspace/cloud/lab_selfcheck.py) | Learner Lab health check（boto3 ping S3 / Lambda / Athena 各端） | **PLAN_E7 部署前必跑** |
| [`cloud/local_uploader.py`](../../../ai_workspace/cloud/local_uploader.py) | 本機 → S3 上傳（與 D:\p\112021134\ 系列同類但 ai_workspace 版本）| reference、PLAN_E8 download chain 參考 |
| [`cloud/lambda_backfill.py`](../../../ai_workspace/cloud/lambda_backfill.py) | Lambda 大量回填 invocation 自動化 | PLAN_E9 batch clean 參考 |
| [`cloud/deploy.md`](../../../ai_workspace/cloud/deploy.md) | ai_workspace 完整 deploy 流程文檔 | **必讀**、避雷紀錄完整 |

**關鍵 pattern**（從 handler.py 學到）：
- **不用 awswrangler**（包太大 ~200 MB）、改 `boto3 athena.start_query_execution` + 輪詢 + `s3.get_object` 抓結果 csv
- **gantry_id regex 防注入**：`re.compile(r"^[0-9A-F]{4,8}[NS]$")`
- **回應前 scan_mb guard**：避免昂貴查詢吃配額（`_MAX_SCAN_MB = 10.0`）
- **環境變數** override 表名 + bucket（容易跨環境）
- **Cold init 全域載入**（module-level 載 model / scaler / clients）、warm invocation 直接重用
- **Container 1.2-1.5 GB 遠低於 Lambda 10 GB 上限** — mcp 換 Node.js + polars 估計 ~500-800 MB、更輕

### §3.5 可 copy 改 — RAG / 知識資產

| 路徑 | 說明 |
|---|---|
| [`mcp_workspace/step3_ai_analysis/rag_knowledge.json`](../../../mcp_workspace/step3_ai_analysis/rag_knowledge.json) | 麻豆段 5 chunks 範本（route_name + target_gantries + rag_chunks）— mcp v1 RAG 可仿此結構擴到全台 |
| [`ai_workspace/holiday/114年中華民國政府行政機關辦公日曆表.csv`](../../../ai_workspace/holiday/) | 原始政府辦公日曆 csv（2025+2026）|
| [`ai_workspace/src/holidays/process_holidays.py`](../../../ai_workspace/src/holidays/process_holidays.py) | 上面 csv → JSON 處理腳本 |
| [`ai_workspace/rag/`](../../../ai_workspace/rag/) | ai_workspace 自己的 RAG 嘗試（內容待查、可能是 PLAN 試水溫）|

### §3.6 概念 reference（不直接 copy）

| 路徑 | 用途 |
|---|---|
| [`ai_workspace/src/feature_engineering_v3.py`](../../../ai_workspace/src/feature_engineering_v3.py) | 22 維特徵工程（cyclic + holiday + window stats）— 預測類 MCP 工具要用 |
| [`ai_workspace/src/train_lstm_v3.py`](../../../ai_workspace/src/train_lstm_v3.py) | BiLSTM 訓練（5-fold CV）— mcp_workspace **不整合預測**（已鎖板）、僅 reference 結構 |
| [`ai_workspace/src/od_analysis.py`](../../../ai_workspace/src/od_analysis.py) | OD 分析 + percentile + congestion |
| [`ai_workspace/src/viz_od_congestion_deep.py`](../../../ai_workspace/src/viz_od_congestion_deep.py) | Fan chart + buckets + 熱力圖、percentile-based |
| [`ai_workspace/cloud/run_athena.py`](../../../ai_workspace/cloud/run_athena.py) / `run_ctas_aggregate.py` / `athena_setup_v3.py` | Athena 自動化腳本範本 |

---

## §4 mcp_workspace 既有素材

### §4.1 Stage 1（麻豆段固定報告）四大管線

| 路徑 | 內容 | 狀態 |
|---|---|---|
| `step0_s3_download/download_from_s3.py` | **⚠️ 不是 TDCS 下載！是「S3 → 本機」拉（Stage 1 重跑清洗用）**。從舊 bucket 拉 raw csv（**目前硬綁 `S3_PREFIX=202603`**）| 待 PLAN_E6 通用化；**PLAN_E8 TDCS download chain 翻譯時不要引用此檔、要引用 `D:\p\112021134\download_only_2025.py + shared_m06a.py`（含 tar.gz + hourly csv 雙路徑 intelligent fallback）** |
| `step0_s3_download/raw_202603/` | 741 個 csv / 22 GB | 留作 baseline |
| `step1_cleaning/clean_202603.py` | M06A O OR D 篩 4 站、聚合月/週/日 csv（**O OR D 邏輯比 ai_workspace v1 正確**）| 待改 thin wrapper |
| `step1_cleaning/cleaned_202603/{monthly,weekly,daily}` | 14,058 行已 cleaned | 留作對帳 ground truth |
| `step2_visualization/viz_4gantries.py` | matplotlib 9 張 PNG | 待重寫為通用 charts/ |
| `step2_visualization/charts/*.png` | 9 張既有圖 | 留作期中報告 |
| `step3_ai_analysis/analyze_all.py` | Gemini 2.5 Flash 跨檔分析 | 概念 reference |
| `step3_ai_analysis/analysis_report.md` | Gemini 自動產 4 項發現 | 留作期中報告 |
| `step3_ai_analysis/rag_knowledge.json` | 麻豆段 RAG 知識（5 chunks）| **PLAN_E7 / M-2 RAG 雛形** |
| `step4_ppt/output_v2.pptx` | 16 頁 PPT | 期中交件 |

### §4.2 Stage 2 至今產物

| 路徑 | 說明 |
|---|---|
| `影片摘要.md` / `影片摘要_講稿.md` | 4 種長度影片摘要（YouTube 標題 / 150 / 300 / 500 字）— 期末影片 reference |
| `workflow/` | v0.6 升級完成（5/28）、現有 PLAN_E5 + 實驗紀錄5 + INDEX |
| `scripts/backfill_s3_2026.py` | 5/28 寫好的 backfill 腳本 |
| `.env` / `.env.example` | AWS Learner Lab creds template（5/28 建）|

### §4.3 logs/ 內舊紀錄

封存於 `workflow/logs/`、INDEX regex 抓不到、需 ls + grep（已記在 `CLAUDE.md`）：
- `實驗記錄.md`（Stage 1）
- `實驗紀錄2.md`（Stage 2 起步）
- `實驗紀錄3.md`（Phase 0 共用 lib）
- `實驗紀錄4.md`（Phase M-1 起步、骨架）

---

## §5 finance_workspace MCP 經驗摘要（從 `MCP_SERVER_KNOWHOW.md`）

> 完整版見 [`D:\p\TDCSprecentater\finance_workspace\workflow\reports\20260602\MCP_SERVER_KNOWHOW.md`](../../../finance_workspace/workflow/reports/20260602/MCP_SERVER_KNOWHOW.md)

### §5.1 SDK 選型

- ✅ **用官方 `mcp` Python SDK**（`pip install mcp` 1.27.x、`from mcp.server.fastmcp import FastMCP`）
- ❌ **不要裝 `fastmcp` 第三方** package（早期 community fork、API 略不同）
- ✅ Transport 默認 **Streamable HTTP**、SSE 留 fallback（透過 `MCP_TRANSPORT` env 切）

### §5.2 五大踩雷（按重要性）

1. **Tool 簽名不能含 context 物件** — MCP SDK 用 `inspect.signature()` introspect、會把 `ResolvedContact` 一起變成 client 必填 schema、LLM 端會炸
   - 正解：**ContextVar pattern**、tool decorator set/reset context、tool 函式內部從 ContextVar 拿、簽名保持 lean
2. **DNS rebinding 預設開** — Cloudflare quick tunnel `*.trycloudflare.com` 會被擋 421、demo 期要 `TransportSecuritySettings(enable_dns_rebinding_protection=False)`、production 用 named tunnel + allowed_hosts
3. **自訂 logger 不會被 uvicorn attach** — 必須在 `__main__` block 加 `logging.basicConfig`、module-level 加會搞壞 pytest fixture
4. **Cloudflare tunnel URL 每次重啟換** — MCP client UI（MaiAgent / Claude Desktop）每個 tool 都要重貼
5. **Webhook 預設 OFF**、測試才 ON（公開 endpoint 會被爬蟲掃）

### §5.3 中間件 pattern（ASGI 三明治）

```
Cloudflare tunnel → uvicorn → ContactIdMiddleware (外) → AuditMiddleware (內) → mcp.streamable_http_app()
```

- **外層 set ContextVar**（從 request headers 把身分塞進 ContextVar）
- **內層讀 ContextVar** 寫 audit log（含 status code + latency + 截前 8 碼 contact id）
- **層次順序錯了 audit 永遠拿 None**

### §5.4 對 mcp_workspace 的 implication

- **如果走「本機 MCP server + Cloudflare tunnel」路線**：finance pattern 直接抄、80% 共通
- **如果走「API GW + Lambda」路線**：MCP 是長連接 SSE-style、Lambda timeout 15min 限制 + cold start 都會打架、需要不同 transport（HTTP-only adapter）— **不推薦**
- **MCP tool docstring 寫成像 API spec**、LLM 直接讀、寫得馬虎 = agent 用錯參數（包含「do not hallucinate」這種防呆描述）

→ §6 M4.2 MCP server 位置決策、強烈傾向「本機 + Cloudflare tunnel」、與 finance 同 pattern。

---

## §6 對 PLAN_E5 後續 milestone 的 implication

### §6.1 M2（上網查 Learner Lab）— 重點服務排序

| 優先 | 服務 | 為什麼必查 |
|---|---|---|
| 🔴 P0 | Lambda（create / invoke / Container image / 出站網路）| 推論層基底、ai_workspace 已用 ✅、mcp 必走 |
| 🔴 P0 | API Gateway v2 | 對外 endpoint、ai_workspace 已用 ✅ |
| 🔴 P0 | S3 (cross-bucket / Glue / Athena workgroup) | 資料層、已用 ✅ |
| 🔴 P0 | Athena (CTAS / partition / cost) | 查詢層、ai_workspace 已用 ✅ |
| 🟡 P1 | EC2 t2.micro（free tier）| Chroma 落位候選之一、M4.1 三個選項都涉及 |
| 🟡 P1 | EFS（Lambda mount）| Chroma 落位候選之二、需要查 SCP 是否擋 |
| 🟡 P1 | Step Functions | 長任務候選、M4.3 涉及 |
| 🟢 P2 | ECS Fargate / SQS / Bedrock / OpenSearch | 備案 / 比賽用、可不查 |

### §6.2 M3（實測）— spin-up 序

| # | 測項 | 通過標準 | cleanup |
|---|---|---|---|
| M3.1 | Lambda create + invoke（hello world Python）| 拿到 function ARN + invoke 回 200 | delete function |
| M3.2 | **Lambda 出站到 TDCS** `urllib.request.urlopen("https://tisvcloud.freeway.gov.tw/")` | 200 / 403 / timeout 哪種 — 若 200 = **Tailscale 路線可降為備案**（重大發現）| 同上 |
| M3.3 | API GW v2 + Lambda + curl 公網 URL | 拿到 Lambda response | delete API + Lambda |
| M3.4 | 跑 [`ai_workspace/cloud/lab_selfcheck.py`](../../../ai_workspace/cloud/lab_selfcheck.py) | 走完整 health check pipeline、看 Learner Lab 邊界 | — |
| M3.5 | Step Functions hello world | 看 SCP 是否允許 | delete |
| M3.6 | EC2 t2.micro spin up + curl tisvcloud + shutdown | 確認可當 Chroma backend | terminate |
| M3.7 | EFS create + Lambda mount（如時間允許） | 看 SCP | delete |

**M3 cost 控**：每測項 < $0.01、總計 << $1、不會吃 Learner Lab $100 配額。

### §6.3 M4（三洞鎖板）— 預判答案 + 候選排序

| 洞 | 候選排序（依 M2/M3 後可能調整）| 預判 |
|---|---|---|
| M4.1 Chroma 落位 | (c) **EC2 t2.micro + Lambda HTTPS 打**（**預判選**） > (a) Lambda layer + db 檔（讀寫不便）> (b) EFS（複雜）> (d) 本機（demo 不專業）> (e) OpenSearch Serverless（Lab 大概率擋）| EC2 free tier 免費、setup 簡單、24/7 可常駐 |
| M4.2 MCP server 落位 | **(c) 本機 + Cloudflare tunnel**（**預判選**、沿用 finance pattern）> (a) API GW + Lambda（MCP 長連接打架）> (b) EC2 常駐（更貴）> (d) Cloudflare Workers（限制多）| finance pattern 已成熟、5 大踩雷已知 |
| M4.3 長任務（download_period）| **(d) EC2 上跑 + MCP 通知**（**預判選**、剛好和 M4.1 同台 EC2）> (a) Step Functions（Lab 可能限制）> (e) 本機觸發 | EC2 上已有 Chroma、可同台跑 backfill cron / 觸發式下載 |

**整合架構預判**（**正式 M4 拍板後寫進 MASTER_PLAN**）：

```
ChatGPT (MaiAgent / Claude Desktop) ← Streamable HTTP
              │
              ▼  Cloudflare named tunnel
本機 mcp_server (Python + mcp SDK + middleware 三明治)
   ├─ tool: status / understand / download / clean / charts
   ├─ Chroma client (HTTPS) ──→ EC2 t2.micro (24/7、us-east-1)
   │                              └─ chromadb server + bge-m3
   ├─ Athena client (boto3) ─→ Athena (us-east-1、tdcs DB)
   │                              ↓
   │                          s3://112021024/cleaned/...
   └─ download trigger ────→ EC2 (同台、taiwan-IP via Tailscale exit)
                              └─ 跑 download_*.py + upload_*.py
```

**關鍵 trade-off**：
- 本機 MCP server = User 桌機 24/7 開機（或筆電 demo 期間開）、Cloudflare tunnel URL 每次重啟換
- 替代：MCP server 也搬 EC2、固定 IP — 但 demo 時 User 看不到本地 log、debug 麻煩

### §6.4 M5（MASTER_PLAN §1-§10 重寫）— input 摘要

新版要寫的關鍵：
- §1.2 範圍：M06A + M03A（v1）、M04A/M05A/M07A 列「未來擴展、本期不做」
- §2 架構：上面 §6.3 預判圖
- §3 技術選型：去掉 EC2 t3.small 東京、改 EC2 t2.micro us-east-1 + 本機 MCP server + Cloudflare tunnel
- §4 Phase：M-1~M-7 對齊新架構（M-4 改成「EC2 setup + Chroma + Tailscale exit-node」）
- §6 D2 Chroma 位置 = EC2 t2.micro stub
- §6 D4 LLM key = ChatGPT API key（自製 UI 走 Gemini API）
- §7 風險：加「EC2 free tier 750 hr/月限制」、「Cloudflare tunnel URL 不穩」、「Tailscale 設備 SPOF」

### §6.5 M6（後續 PLAN roadmap）— 校正

依新架構修正：

| 原預演 | 校正後 |
|---|---|
| PLAN_E6: Phase M-1 通用化 | ✅ 不變 |
| PLAN_E7: Phase M-2 全台 Gantry KB | ✅ 不變（直接從 `gantry_to_county.json` 擴 + 補經緯度）|
| PLAN_E8: Phase M-3 RAG | ✅ 不變（Chroma + bge-m3）|
| PLAN_E9: Phase M-4 AWS 基建 | **改名 Phase M-4 EC2 + Chroma + Tailscale + Lambda packaging**（含 EC2 setup） |
| PLAN_E10: Phase M-5 MCP server v1 | **加 Cloudflare tunnel + middleware 三明治**（沿 finance pattern）|
| PLAN_E11: Phase M-6 通用圖表 | ✅ 不變 |
| PLAN_E12: Phase M-7 整合 demo | ✅ 不變 |
| PLAN_E13~: 期末三件套 | ✅ 不變 |

---

## §7 缺口 + 待補（[USER_RUN] queue）

| # | 項目 | 負責 | 阻塞何時做 |
|---|---|---|---|
| 1 | 刷 Lab token、跑 `scripts/backfill_s3_2026.py` 補 114 天 | User | PLAN_E6 啟動前要做完 |
| 2 | 提供 ai_workspace 帳號 401322580935 token（M1.2 校正用、非必需）| User | nice-to-have、可不做 |
| 3 | 準備 Tailscale 24/7 設備 | User | PLAN_E9 才用、不急 |
| 4 | M04A/M05A/M07A schema 補正（從 tisvcloud 目錄查）| Lead | PLAN_E7 / M-2 RAG 才需要、可推遲 |
| 5 | Cloudflare 帳號（如果走 finance pattern） | User | PLAN_E10 才用 |
| 6 | 本機 MCP server 部署機（User 桌機 / NUC / 筆電）| User | PLAN_E10 |

---

## §8 給 PLAN_E5 後續 milestone 的 GO 指令

M1 結束、可以接著做：
- **M2**：直接接、上網查 Learner Lab capability、依 §6.1 P0 優先序、產出 `brief_learner_lab_capability_*.md`
- **M3**：M2 完跑、用 654485222392 token 實測、依 §6.2 序、補進同 brief §B
- **M4**：M3 完跑、AskUserQuestion 三洞、依 §6.3 預判答案給 User 選
- **M5**：M4 完跑、依 §6.4 重寫 MASTER_PLAN
- **M6**：M5 完、依 §6.5 列 PLAN_E6+ roadmap、寫實驗紀錄末事件 + 跑 `archive.py` 封存 PLAN_E5

預估剩餘時間：M2 30 min + M3 60 min + M4 30 min + M5 60 min + M6 15 min = **~3.5 hr**（同 PLAN_E5 原估）。
