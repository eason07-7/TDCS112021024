# mcp_workspace Lambda 清洗 vs ai_workspace Athena CTAS 清洗 — 架構對照

> **目的**：釐清「mcp 清洗 ≠ ai_workspace 清洗」的取捨；給 PLAN_E7/E9 worker 不誤用、給 PLAN_E13 報告 §7 期中比較 narrative 用素材。
> **產出於**：2026-06-02
> **作者**：mcp_workspace Lead

---

## §0 業務 spec 對比：兩套用不同 spec 對應不同場景

**關鍵釐清**（2026-06-02 audit 後 reframe）：mcp 與 ai_workspace 清洗**不是同一套 spec、不應對齊**。兩個專案路段特性不同、合理 spec 也不同：

| 維度 | ai_workspace（雪山隧道）| mcp_workspace（麻豆段 + 短距離通用化）|
|---|---|---|
| 路段特性 | 長距離 28 km、跨 8+ gantry | 短距離 4-6 站、跨 2-4 km |
| 篩法 | **嚴格穿越篩**（`regexp_like(trip_information, gantry)` 同時 match 進+出 gantry）| **O/D 端點命中篩**（`gantry_id_o OR gantry_id_d IN (target_list)`）|
| 雜訊 | 不用嚴格穿越 = 87% 雜訊（[`BUG_OD_FILTER.md`](../../../ai_workspace/BUG_OD_FILTER.md) v1 歷史教訓）| O/D 命中即真實 trip、雜訊小（mcp Stage 1 14,058 行 baseline 已驗）|
| 對映規則 | ai_workspace 期末規則：v3 LSTM 訓練特徵需求 | mcp 期末規則 R12：「**車流數據交叉分析: 車種 每周 每月 上下交流道**」= O/D 命中對映完美 |

**規則 / 場景共通的真陷阱**（兩套都要 handle）：
- `detection_time_o` / `_d` 是 VARCHAR、要 CAST TIMESTAMP 才能算間隔
- `gantry_id_o` / `_d` 是 trip 首尾兩站、不代表全路徑（mcp 不看中間站、ai_workspace 雪山要看）

**結論**：兩套清洗結果在同樣 raw 上**本就不同**（不同 spec）、不能比、不應追求對齊。mcp baseline = mcp Stage 1 麻豆 14,058 行（O/D 命中）；ai_workspace baseline = 16 月 60M rows（嚴格穿越）— **各自驗各自的、不混淆**。

---

## §1 ai_workspace 清洗（Athena CTAS、SQL-native）

```
S3 raw csv.gz
   │ Glue Data Catalog 表面化（partition by yyyymm）
   ▼
tdcs.m06a_raw（Athena 可查的 external table）
   │ CTAS（CREATE TABLE AS SELECT）
   │ WHERE regexp_like(trip_information, '05F0287[NS]')
   │   AND regexp_like(trip_information, '05F0055[NS]')
   ▼
tdcs.m06a_od_2025_2026（Parquet、partition by yyyymm）
   │ 再 CTAS 預聚合
   ▼
tdcs.m06a_hourly_gantry_vt（< 2 MB、58k rows、scan 降 1500x）
```

**檔案實作**：
- [`cloud/athena_ctas_m06a_od.sql`](../../../ai_workspace/cloud/athena_ctas_m06a_od.sql)（嚴格穿越篩 SQL）
- [`cloud/athena_ctas_m06a_aggregate.sql`](../../../ai_workspace/cloud/athena_ctas_m06a_aggregate.sql)（預聚合）
- [`cloud/glue_ddl_m06a.sql`](../../../ai_workspace/cloud/glue_ddl_m06a.sql)（表面化 raw）

**特性**：
- ✅ Scale：16 月 / 60M rows 一次 CTAS（Athena Spark 引擎）
- ✅ Cost：one-shot batch、跑完不再吃 Athena cost；後續 query 命中預聚合 < 1 MB scan
- ✅ Storage：Parquet snappy compression、~500 MB（vs raw csv.gz ~70 GiB）
- ❌ 互動性：跑 CTAS 是 SQL job、user 不能中間 cancel / 看進度
- ❌ 靈活性：路段固定（嚴格穿越篩 gantry list 硬寫 SQL）；換路段要改 SQL + 重 CTAS

**適用**：批次、固定 spec、scale 大、無互動需求 — 完美對應 ai_workspace v3 LSTM 訓練資料 prep。

---

## §2 mcp_workspace 清洗（Lambda Container、TS-native）

```
CLI submit（user 選任意路段 + 時間）
   │ HTTPS POST API GW
   ▼
Lambda Container（Node.js 20 + nodejs-polars + tdcs-clean.ts）
   │ 讀 S3 raw csv.gz
   │ tdcs-clean.ts（Python tdcs_clean lib TS 翻譯）
   │ - read_one_csv
   │ - clean_raw_df（O/D 端點命中篩 + 任意 gantry 動態 filter）
   │ - build_hourly_aggregation
   ▼
S3 cleaned_v2/job_<id>/<YYYYMM>/*.parquet
   │ Glue Data Catalog 自動新增 partition
   ▼
Athena queryable（user `tdcs-dl query` 用）
```

**檔案實作（PLAN_E6+ 規劃）**：
- `cli/src/lib/tdcs-clean.ts`（PLAN_E6 / M4 翻譯、待 sonnet worker 完成）
- `infra/lambda/handler.ts`（PLAN_E7 / E9 寫）
- `infra/glue.tf`（PLAN_E7、自動 partition catalog 更新）

**特性**：
- ✅ 互動性：CLI 提交 job、Lambda 寫 `jobs/<id>.json` progress、CLI 輪詢顯示進度條
- ✅ 靈活性：路段參數化（任意 gantry list）、清洗 spec 動態
- ✅ 部署透明：user clone IaC 後自架 AWS、CLI 不用改（M4.3 endpoint 抽象）
- ❌ Scale：Lambda 15 min timeout、一個月清洗 < 5 min OK、跑全 16 月 batch 會 chunk
- ❌ Cost：Lambda 每次 invocation 算 Mem-sec、雖然便宜但 batch 100 月會比 Athena 貴

**適用**：互動式、任意路段、user-triggered、輕中量資料 — 完美對應 mcp_workspace v2 CLI 工具。

---

## §3 為什麼 mcp 選 Lambda 不選 Athena CTAS

### §3.1 工程合理性對比

| 維度 | Athena CTAS 適用 | Lambda 適用 | mcp 真實需求 |
|---|---|---|---|
| 觸發 | 排程 / SQL submit | event-driven / user 觸發 | **user CLI 觸發 → Lambda 勝** |
| 互動 | one-shot batch | 可寫 progress、CLI 輪詢 | **CLI 進度條 UX → Lambda 勝** |
| 靈活性 | SQL 改路段 = 改檔案 + 重 CTAS | 參數化 input、即時生效 | **任意路段 → Lambda 勝** |
| Scale | TB-PB 級 Spark | GB 級、< 15 min | **9 GiB / < 5 min → 兩套都行、Lambda 簡單** |
| Cost（單次小量） | 低（Athena scan-based） | 低（Lambda mem-sec） | **半斤八兩** |
| Cost（重複 batch） | **更低**（CTAS one-shot） | 較高（每次 invoke） | **mcp 是 user-triggered、不會重跑同件 → Lambda OK** |
| 部署複雜度 | 中（Athena workgroup + Glue catalog）| 低（Lambda + IAM）| **Lambda 勝** |
| 開源 IaC 友善 | 中 | **高**（Terraform Lambda module 標準）| **Lambda 勝** |

### §3.2 結論

**Lambda 在 mcp 的 user-triggered + 互動式 + 靈活路段 場景下、是 architecturally correct choice、不是為了避開 Athena CTAS。**

Athena CTAS 在 mcp 仍是 **query 介面**（user `tdcs-dl query` 走 Athena）、不是 **清洗主體**。Glue Data Catalog 表自動由 Lambda 寫 Parquet 後 partition discovery 補進去。

### §3.3 對齊期末規則 §5（10% 配分）+ §7（15% 配分）

期末規則：
- §5 Volume：「**(資料前處理)+ (AWS Glue ETL)**」— 我們解讀為「資料前處理階段使用 AWS service」、Lambda 也算（提供範例 Glue ETL、不排他）
- §7 期中比較：「**利用 AWS services 增加之效能**」— 我們用 S3 + Lambda + API GW + Glue Data Catalog + Athena 共 5 個服務、且加「為什麼 Lambda 不 Glue ETL」科學 narrative

**報告 §7 narrative**（直接 reuse）：

> 期中專題（mcp Stage 1）為 2026/03 麻豆段固定報告、處理流程**完全本機 manual**（從 boto3 拉 S3 raw → pandas 清洗 → matplotlib 出圖）。期末（mcp Stage 2）做 TDCS 自動下載+清洗 CLI 工具、把資料處理層完整搬上 AWS：
>
> - **下載層**：CLI 在本機（台灣 IP）抓 TDCS → 上傳 S3、解決 us-east-1 Lambda 抓不到台灣 IP 限制資料的物理約束（跳板 7 對照實驗證實、E6 純 client-side winner）
> - **儲存層**：S3 buckets + Glue Data Catalog 自動表面化、user 提交任意路段任意時段、Lambda 寫 Parquet 結果 + partition 自動 discovery
> - **處理層**：Lambda Container（Node.js + nodejs-polars + tdcs-clean.ts、tdcs_clean Python lib 翻譯版）、用戶 CLI 觸發、寫 jobs/<id>.json 進度、CLI 輪詢顯示進度條
> - **查詢層**：Athena workgroup、user `tdcs-dl query` SQL 直查清洗後 Parquet
>
> **為什麼選 Lambda 不選 Glue ETL**：mcp 場景是 user 觸發 + 任意路段 + 9 GiB / 12 週資料量。Glue ETL 適合 TB-PB Spark batch、跑一次定，mcp 互動式 + 動態路段需求 = Lambda（事件驅動 + 低部署複雜度 + Terraform 標準 module）更合適。Glue Data Catalog 仍保留（自動 partition discovery、Athena 查詢必要）。
>
> 對比期中 manual：時間從「~30 min 跑 一個交流道 + 4 匝道 + 一個月 raw + 9 張圖」（含 boto3 + pandas + matplotlib + 手寫 query）、降到「CLI 一行指令 + 等待」、且通用到任意國道交流道 / 任意時段。同時 16 月 60M rows scale 在 ai_workspace 期末（雪山隧道 LSTM）也驗證過 Athena 引擎能 cover。

---

## §4 對 PLAN_E7 / E9 worker 的明示

當 PLAN_E7 啟動 sonnet（或其他 worker）部署 AWS infra、必讀本 brief + M1 brief §3.3+§3.4。**核心 Don't & Do**：

| Don't | Do |
|---|---|
| ❌ 直接 copy `athena_ctas_m06a_od.sql` 當成 mcp 清洗主流程 | ✅ 把 SQL 邏輯翻譯成 TS Lambda handler、邏輯對齊 |
| ❌ 砍 Glue Data Catalog（以為純 Lambda 不用）| ✅ 保留 Glue Data Catalog、Lambda 寫 Parquet 後表自動 partition discovery、Athena 才能查 |
| ❌ 為配分硬塞 Glue ETL job | ✅ Glue Data Catalog ≠ Glue ETL；前者是 metadata service、後者是 Spark 處理引擎、我們只用前者 |
| ❌ 用 awswrangler | ✅ 用 boto3 athena.start_query_execution + 輪詢（package size 省 200 MB）|
| ❌ Lambda handler 信任 user input 的 gantry_id | ✅ regex 防 SQL injection（`r"^[0-9A-F]{4,8}[NS]$"`）|
| ❌ Athena query 無 scan limit | ✅ `_MAX_SCAN_MB = 10.0` guard 避免吃 user 配額 |

---

## §5 後續

- PLAN_E7 / E9 worker onboarding prompt 必讀本 brief + M1 brief §3.3+§3.4
- PLAN_E13 報告 §7 期中比較直接 reuse §3.3 narrative（可能要根據實測數據微調）
- 期中比較還要列**期中 manual**的具體痛點清單（時間 / 步驟 / 通用性）— 待 PLAN_E13 動工時從 `mcp_workspace/影片摘要.md` + `step3_ai_analysis/analysis_report.md` 補
