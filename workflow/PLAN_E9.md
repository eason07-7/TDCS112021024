# PLAN_E9 — CLI ↔ AWS clean chain（Lambda polars 清洗 + Parquet + 4 H gate 收尾）

> **對應紀錄**：`workflow/實驗紀錄9.md`
> **關鍵成果**：_(此行於封存前由 Lead 填、archive.py 會抓進 INDEX.md)_

---

## 背景

PLAN_E8 download chain ✅ close（`logs/PLAN_E8_done.md`）：
- `tdcs-dl pull` + `status` + wizard 整合
- 麻豆段 22 GB 真實跑通（744 檔 / 21.79 GiB / 43 min / 6-state JobRecord）
- cli/ 93 test 全綠

PLAN_E9 啟動前 4 H gate ✅ 全 close（`workflow/實驗紀錄9.md` 事件 #1-#3）：
- F-H1 Lambda timeout 900s / memory 2048 MB / wizard ≤ 3 月 preset
- F-H3 body 100 KB + 413 / Budget $5 + CloudWatch alarm
- F-H4 build_and_push.sh git SHA tag（unique per deploy）+ auto.tfvars 餵 var.lambda_image_tag
- F-M1 schema-mapping.ts 9 欄 Pascal→snake_case + 8 test
- infra/lambda/ 新增 13 test（5 index + 8 schema-mapping）/ 整專案 106 test 全綠 / tsc 0

PLAN_E9 是 **v2 業務邏輯的核心收尾** — Lambda 真接清洗、把 PLAN_E8 上傳的 22 GB raw 跑成 Parquet、寫進 cleaned_v2 + Glue partition discovery + CLI `clean` subcommand 觸發。對齊 PLAN_E6 M5 baseline 14,058 行 byte-level md5 = 0（**硬指標、不通過不 close**）。

對應期末規則：
- §5 Volume + §7 期中比較：Lambda 真清洗（不只 hello world echo）→ 報告 narrative 從「我們搭了 infra」升到「我們真的把 22 GB 處理成 query-ready Parquet」
- §6 Variety：Athena query 多維度（PLAN_E10 才用、本 PLAN 鋪 Parquet 基礎）

---

## 目標

跑完 PLAN_E9 後達到：

1. **Lambda handler 接 nodejs-polars 真清洗**：讀 S3 raw csv.gz → O/D 端點命中篩 → groupby（hour×gantry×vehicle）→ schema-mapping → write Parquet
2. **Lambda 寫 Parquet 到 S3 cleaned_v2/yyyymm=YYYYMM/cleaned.parquet**（用 schema-mapping.ts snake_case schema）
3. **Glue partition discovery**：Lambda 結束時或 CLI clean 完觸發 Athena `MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton`
4. **`tdcs-dl clean --job-id <id>` subcommand**：POST /clean 觸發 Lambda + 輪詢 GET /jobs/{id} 等 status=done + 進度條
5. **TUI wizard pull → clean 兩階段整合**：wizard 提交後 Running view 顯示 Download → Clean 兩段 progress、user 不必分兩次跑
6. **端到端 smoke + baseline md5 對齊（硬指標）**：
   - 跑 `tdcs-dl clean --job-id <PLAN_E8 留的 2fd05f19-...>`（或新跑 pull + clean）
   - Lambda 處理 744 raw 檔 → 寫 cleaned.parquet
   - MSCK REPAIR → Athena 可查
   - **下載 Parquet + 轉 CSV + md5 對齊 PLAN_E6 baseline 14,058 行的 `cleaned_202603/monthly/M06A_202603_hourly_counts_all.csv`**
   - md5 不對齊 = M6 FAIL = PLAN_E9 不 close

**注意**：PLAN_E9 不接 Athena query subcommand（PLAN_E10）、不上 npm（PLAN_E11）、不寫 demo 影片（PLAN_E12）。

---

## 不做

- ❌ 不接 Athena query subcommand（PLAN_E10）
- ❌ 不寫 UX 打磨 / npm publish（PLAN_E11）
- ❌ 不寫 demo 影片 / 簡報（PLAN_E12 / E13）
- ❌ 不改 `D:\p\112021134\` Python 唯讀區
- ❌ 不重 audit 4 H gate（已 close、PLAN_E9 啟動前驗證）
- ❌ 不寫 retry orchestration / Step Functions（M4 鎖板「純 Lambda」、PLAN_E11 才評估）
- ❌ 不寫 Lambda 內 multipart upload（cleaned Parquet 單檔估 < 200 MB、PutObject 夠）
- ❌ 不動 cli/src/lib/tdcs-clean.ts（PLAN_E6 baseline 鎖板、本批 copy 一份到 lambda/src/lib/）

---

## 關鍵設計決策（PLAN 啟動前 Lead 鎖板、worker 不要改）

### D1：tdcs-clean.ts 共享策略

cli/ 已有 `cli/src/lib/tdcs-clean.ts`（PLAN_E6 M4 baseline 通過 md5=0）。Lambda 要用同一邏輯、但 cli/ 與 infra/lambda/ 是兩個獨立 npm package（不同 type / 不同 build）。

**方案**：M1 **複製** `cli/src/lib/tdcs-clean.ts` + `tdcs-clean.types.ts` 到 `infra/lambda/src/lib/` 一份、保持兩處同步（手動或 PLAN_E11 抽 shared monorepo package）。本 PLAN copy + 加註 `// Synced from cli/src/lib/tdcs-clean.ts — see PLAN_E9 D1`、PLAN_E6 baseline test 在 cli/ 已有、不在 lambda/ 重複跑（lambda 跑 polars output Parquet 才是新驗證點）。

### D2：Lambda 內 polars Parquet write 流程

```
讀 S3 raw csv.gz × N（用 GetObject + streaming gunzip）
  ↓
解 csv → RawRow[]（reuse tdcs-clean.ts readOneCsv 邏輯）
  ↓
cleanRawDf + buildHourlyAggregation + addWeekIndex（reuse tdcs-clean.ts）
  ↓
HourlyRowWithWeek[]（PascalCase）
  ↓
schemaMapping.toParquetRow（PascalCase → snake_case）
  ↓
nodejs-polars DataFrame.from_records(snake_case_rows)
  ↓
df.write_parquet(/tmp/cleaned.parquet)
  ↓
PutObject s3://112021024/cleaned_v2/yyyymm=YYYYMM/cleaned.parquet
  ↓
Athena MSCK REPAIR TABLE
```

### D3：Lambda /tmp 容量限制

Lambda /tmp 預設 512 MB、可調到 10 GB（aws_lambda_function `ephemeral_storage`）。22 GB raw 不能整月 load /tmp、要 streaming（一個檔讀完 process 完再讀下個）。**cleaned Parquet 單檔估 ≤ 200 MB**（compression + aggregation）。設 `ephemeral_storage = 1024`（1 GB、demo 用）、確認後可降。

### D4：MSCK REPAIR 觸發點

兩條路：

| 方案 | Pro | Con |
|---|---|---|
| **(A) Lambda 內結束時自動跑** | user 不必管、partition 自動可見 | Lambda 多吃 ~5 秒 Athena query 時間 + 額外 IAM 權限 |
| (B) CLI clean subcommand 完跑 | Lambda 邏輯純粹 | user 多等 5 秒、CLI 端要 athena permission |

**Lead 選 (A)**：lambda 完成 PutObject 後立即 StartQueryExecution `MSCK REPAIR`、wait until done、寫進 jobs/<id>.json status=done。CLI 只輪詢 status 不必管 partition。

### D5：CLI clean subcommand input

兩條路：

| 方案 | Pro | Con |
|---|---|---|
| (A) `tdcs-dl clean --year --month --gantries`（單跑、無依賴）| 獨立可跑 | 重抓 raw 浪費 |
| **(B) `tdcs-dl clean --job-id <id>`（依賴 PLAN_E8 pull 的 job_id）** | reuse 已有 raw、不重抓 | 必先跑過 pull |

**Lead 選 (B)** 為主、加 (A) fallback：
```
tdcs-dl clean --job-id <id>             # 主流程：reuse PLAN_E8 raw
tdcs-dl clean --year ... --month ...    # fallback：CLI 端先確認 S3 raw 存在、不重抓
```

---

## Milestones

### M1 — Lambda handler 整合 tdcs-clean.ts + polars

**執行者**：`sonnet_worker`（續派 / PLAN_E8 同 session 沿用、polars TS 標準活）
**預計時間**：4-5 hr（PLAN_E9 最大 milestone）

**內容**：

1. **複製 + 同步註解**：
   - `cli/src/lib/tdcs-clean.ts` → `infra/lambda/src/lib/tdcs-clean.ts`
   - `cli/src/lib/tdcs-clean.types.ts` → `infra/lambda/src/lib/tdcs-clean.types.ts`
   - 兩 lambda 內檔頂部加 `// Synced from cli/src/lib/ at PLAN_E9 M1（2026-06-04）— modify cli/ first then sync`

2. **改 Lambda handler `infra/lambda/src/index.ts`** POST /clean route：
   - 解 body：expect `{ job_id, year, month, gantries }`（PLAN_E8 wizard 寫 jobs/<id>.json 已含這些欄位）
   - 從 S3 list `raw/yyyymm=YYYYMM/` 拿所有 csv.gz path
   - streaming 處理：每個檔 GetObject → gunzip → readOneCsv → cleanRawDf（含 gantries 篩） → 累積 HourlyRow[]
   - 全部處理完 → `mergeHourlyAccumulator` + `addWeekIndex`（reuse tdcs-clean.ts）
   - schemaMapping.toParquetRow 轉 snake_case
   - polars DataFrame.from_records + write_parquet → /tmp/cleaned.parquet
   - PutObject s3://112021024/cleaned_v2/yyyymm=YYYYMM/cleaned.parquet
   - Athena MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton（用 @aws-sdk/client-athena）
   - writeJobRecord status=done + parquetKey + rowCount + bytes

3. **錯誤處理**：
   - 任一階段失敗 → writeJobRecord status=error + error message
   - GetObject 404 / NoSuchKey → continue（單檔失敗不擋全月）
   - Athena query failed → status=error 含 query_execution_id

4. **依賴**：
   - `nodejs-polars`：已在 package.json dependencies（PLAN_E7 M3 install）
   - `@aws-sdk/client-athena`：新加（PLAN_E7 沒裝、本批裝）
   - `@aws-sdk/client-s3`：已有

**產出**：
- `infra/lambda/src/lib/tdcs-clean.ts` + `tdcs-clean.types.ts`（同步副本）
- `infra/lambda/src/index.ts` POST /clean 接真清洗（GET /jobs/{id} 不動）
- `infra/lambda/package.json` 加 @aws-sdk/client-athena
- `infra/lambda/src/index.test.ts` 加 2-3 test 覆蓋真清洗 happy path（mock S3 + polars + athena）

**驗收**：
- typecheck 0 errors
- `cd infra/lambda && npm test` ≥ 15/15 PASS（5 baseline + 8 schema-mapping + ≥ 2 新清洗）
- handler 結構自驗 grep：list S3 + GetObject + polars.DataFrame + write_parquet + PutObject + StartQueryExecution 6 個關鍵 call 都在

---

### M2 — Lambda Parquet write + S3 path 對齊 Glue partition

**執行者**：`sonnet_worker`（續派）
**預計時間**：1.5 hr

**內容**：

1. 確認 `df.write_parquet()` 的 compression / row_group_size 設定（用 polars 預設 snappy + 100k rows / group、對齊 Glue 預期）
2. S3 key 規則：`cleaned_v2/yyyymm={YYYYMM}/cleaned.parquet`（單檔 / month、對齊 glue.tf cleaned_v2_skeleton partition_keys.yyyymm）
3. `infra/terraform/lambda.tf` ephemeral_storage 加 `ephemeral_storage { size = 1024 }`（Lambda /tmp 1 GB、寫 Parquet 用）
4. Lambda IAM 確認可 PutObject 到 cleaned_v2/ prefix（LabRole 標配、不必加 policy）
5. unit test：mock polars write_parquet + 驗 PutObject Key 對齊 `cleaned_v2/yyyymm=202603/cleaned.parquet`

**產出**：
- `infra/terraform/lambda.tf` 加 ephemeral_storage
- handler 確認 Parquet write 流程 / S3 key
- 1-2 個 unit test

**驗收**：
- terraform 改動 grep `ephemeral_storage`
- handler Parquet path 對 `cleaned_v2/yyyymm=` Hive partition format
- test ≥ 17/17 PASS

---

### M3 — Glue partition discovery via Athena MSCK REPAIR

**執行者**：`sonnet_worker`（續派）
**預計時間**：1 hr

**內容**：

1. Lambda handler 寫 Parquet 完後立即跑：
   ```ts
   const athena = new AthenaClient({ region });
   await athena.send(new StartQueryExecutionCommand({
     QueryString: 'MSCK REPAIR TABLE tdcs_dl.cleaned_v2_skeleton',
     WorkGroup: 'tdcs-dl-wg',
     QueryExecutionContext: { Database: 'tdcs_dl' },
   }));
   // 輪詢 GetQueryExecution → status=SUCCEEDED 才回
   ```
2. timeout：MSCK REPAIR < 30 秒（單月 partition 增加 1 個）
3. 寫 query_execution_id 進 jobs/<id>.json（debug 用）
4. unit test：mock athena.send + 驗 QueryString + WorkGroup

**產出**：
- handler 加 MSCK REPAIR 段
- 1-2 個 unit test

**驗收**：
- handler grep `MSCK REPAIR`
- jobs/<id>.json schema 加 `query_execution_id` 欄
- test 全綠

---

### M4 — CLI `tdcs-dl clean` subcommand

**執行者**：`sonnet_worker`（續派）
**預計時間**：2 hr

**內容**：

1. `cli/src/commands/clean.ts`：
   - Mode A：`tdcs-dl clean --job-id <id>` → POST /clean body `{ job_id }` → Lambda 從 jobs/<id>.json 拿 year/month/gantries
   - Mode B（fallback）：`tdcs-dl clean --year --month --gantries` → POST /clean body 完整參數、Lambda 不必查 jobs/
   - 輪詢 GET /jobs/{id} 直到 status=done 或 error 或 timeout（15 min）
   - 進度條：cli-progress（用 "checking..." 旋轉 + 每次輪詢更新 status 字串）
   - 完成印：`Cleaned. rows=X parquet=s3://...`

2. `cli/src/lib/job-metadata.ts` 擴：
   - `pollUntilDone(endpoint, jobId, timeoutMs, intervalMs)` helper、回 final JobRecord

3. `cli/src/index.ts` 加 `registerCleanCommand(program)`

4. `cli/tests/clean.test.ts` ≥ 6 test：
   - mode A happy / mode B happy
   - polling 中收到 status=done → 回
   - polling 收到 status=error → throw
   - polling timeout → throw
   - flag validation

**產出**：
- `cli/src/commands/clean.ts`
- `cli/src/lib/job-metadata.ts` 擴 pollUntilDone
- `cli/src/index.ts` register
- `cli/tests/clean.test.ts` ≥ 6 test

**驗收**：
- typecheck PASS
- cli/ test 93 + ≥ 6 ≈ 99+ PASS
- CLI `--help` 印 clean spec 清楚
- node dist/index.js clean --help OK

---

### M5 — TUI wizard pull → clean 兩階段整合

**執行者**：`sonnet_worker`（續派）
**預計時間**：1.5 hr

**內容**：

1. **`cli/src/wizard/state.ts`** 改：
   - RunPhase 加 `'cleaning'` state（4-state → 5-state：idle / running / cleaning / done / error）
2. **`cli/src/wizard/steps/Running.tsx`** 改：
   - download 完不直接 done、繼續 clean 階段
   - 顯示兩段 progress：「[1/2] Downloading 744/744」+「[2/2] Cleaning... status=processing」
3. **`cli/src/commands/pull.ts`** 抽 runClean helper（同 runPull 抽法）
4. **Confirm.tsx** 提交後執行 runPull + runClean（reuse 既有 code）

**產出**：
- state.ts 加 cleaning phase
- Running.tsx 兩段 progress
- pull.ts 抽 runClean helper

**驗收**：
- typecheck PASS
- cli/ test 仍綠
- wizard 跑 happy path 到 Confirm（不真跑、user 手動測）

---

### M6 — 端到端 smoke + baseline md5 對齊（硬指標、[USER_RUN]）

**執行者**：`[USER_RUN]` / deploy_worker（遠端桌機跑 deploy + clean）
**預計時間**：30 min（含 Lambda cold start + 清洗 ≤ 10 min + MSCK 30 秒 + 下載 Parquet + md5 比對）

**內容**：

```powershell
# 0. 確認 Lab token、本機工具
cd D:\p\mcp_workspace
. .\.env  # 或 PowerShell load .env script
aws sts get-caller-identity   # Account=654485222392

# 1. Lambda 重 deploy（F-H4 git SHA tag、不會撞 :latest）
cd infra\lambda
npm install  # 加 @aws-sdk/client-athena
bash build_and_push.sh    # 印新 tag e.g. tdcs-dl-cleaner:abc1234567
cd ..\terraform
terraform apply  # in-place 更新 Lambda image_uri、yes

# 2. CLI 重 build（M4 clean subcommand）
cd D:\p\mcp_workspace\cli
npm run build

# 3. clean reuse PLAN_E8 留的 job_id
node dist\index.js clean --job-id 2fd05f19-f3c8-4120-a5c2-d655b34693d0
# 預期：等 Lambda 跑 → status=done → 印 rows=14058 parquet=s3://...

# 4. 驗 S3 cleaned_v2 有 Parquet
aws s3 ls s3://112021024/cleaned_v2/yyyymm=202603/ --recursive
# 預期：cleaned.parquet ~50-200 MB

# 5. 下載 Parquet + 對齊 PLAN_E6 baseline md5
aws s3 cp s3://112021024/cleaned_v2/yyyymm=202603/cleaned.parquet ./tmp/cleaned.parquet
# 用 cli 內 helper 把 Parquet 轉 csv（沿 schema order）
node -e "
  const polars = require('nodejs-polars');
  const df = polars.readParquet('./tmp/cleaned.parquet');
  // sort 對齊 baseline order
  const csv = df.writeCsv();
  require('fs').writeFileSync('./tmp/cleaned.csv', csv);
"
md5sum ./tmp/cleaned.csv mcp_workspace/step1_cleaning/cleaned_202603/monthly/M06A_202603_hourly_counts_all.csv

# 6. **md5 一致** = PASS / 不一致 = FAIL（PLAN_E9 不 close）
```

**驗收硬指標**：
- step 3 印 `rows=14058`（對齊 PLAN_E6 baseline）
- step 5 md5 兩個檔 = 一致
- step 4 Parquet size < 250 MB（合理範圍）

**紅線**：
- md5 不一致 = M1-M5 翻譯有 bug、不可進 PLAN_E10、回 Lead 評估退 M1 重做
- Lambda timeout 14 min（接近 900s 上限）= 進 PLAN_E10 前要看 chunking

---

## 完成定義

- [ ] M1 Lambda handler 真清洗整合 + tdcs-clean.ts 同步
- [ ] M2 Parquet write + ephemeral_storage 升 1 GB
- [ ] M3 MSCK REPAIR 自動觸發
- [ ] M4 CLI clean subcommand + pollUntilDone
- [ ] M5 wizard pull → clean 兩段整合
- [ ] **M6 baseline md5 對齊 PLAN_E6 14,058 行（硬指標）**
- [ ] cli/ test 累積 93 → 99+ 全綠
- [ ] infra/lambda/ test 累積 13 → 17+ 全綠
- [ ] PLAN 開頭「關鍵成果」frontmatter 填好
- [ ] 跑 `close_plan.py` 封存

---

## Worker 配置

| Milestone | 派 | 模式 | 理由 |
|---|---|---|---|
| M1-M5 | `sonnet_worker` | 續派、**strict serial**（M1 完抽驗 → M2 → ...） | 8 次正向自抓紀錄、polars TS 標準活、PLAN_E8 經驗延續；避免並行 working tree 卡點（按 feedback_parallel_worker_strategy 策略 B） |
| M6 | `[USER_RUN]` 或 `deploy_worker` | — | 真實 Lambda invoke + Athena query + md5 比對、需 Lab token + AWS 操作 |
| 整合 commit | `Lead` | — | M1-M5 serial 累積後 Lead 整合 commit + M6 後 close |

派工順序：
1. M1（最大、4-5 hr）→ Lead 抽驗
2. M2（1.5 hr）→ Lead 抽驗
3. M3（1 hr）→ Lead 抽驗
4. M4（2 hr）→ Lead 抽驗
5. M5（1.5 hr）→ Lead 抽驗
6. M6 [USER_RUN] / deploy_worker
7. **baseline md5 對齊 = 硬指標、不通過回 Lead**
8. close_plan

總 sonnet 時間 ~10 hr / [USER_RUN] 30 min / Lead 整合 ~30 min。

---

## 風險

| 風險 | 緩解 |
|---|---|
| **baseline md5 不對齊**（M6 FAIL 硬指標）| M1 sonnet 嚴格 copy tdcs-clean.ts 不改邏輯、只加 polars 串接層；如 FAIL Lead 評估退 M1 重做、不容忍 throwaway hack |
| Lambda /tmp 512 MB 不夠寫 Parquet | M2 升 ephemeral_storage = 1024 / 不夠再升 |
| Lambda 900s timeout 不夠清完 22 GB | F-H1 gate 已限 ≤ 3 月、單月 22 GB 估 polars 5-8 min；超過退 Step Functions（PLAN_E11） |
| nodejs-polars Lambda Container image > 10 GB | PLAN_E7 M3 已預裝 polars、實測 image ~200 MB、遠未到上限 |
| MSCK REPAIR 在 Athena WG 10 MB scan cap 是否受限 | MSCK 不算 query scan、不會撞 cap；如撞 sonnet STOP 回 Lead 評估 |
| Athena query 權限 LabRole 是否有 | LabRole 含 Athena 標配權限（PLAN_E7 sanity check 已驗 list-work-groups）；如 StartQueryExecution 缺權限 STOP 回 Lead |
| tdcs-clean.ts cli/ 與 lambda/ 兩處 drift | D1 註解明示「modify cli/ first then sync」；PLAN_E11 評估抽 shared monorepo package |
| Parquet 與 Glue table schema 不對齊（F-M1 殘留風險） | schema-mapping.ts test 8/8 PASS 已驗、M6 Athena query 抽 1 query 再驗（不對齊 query 回 0 row） |
| Lambda async invoke 超時 / CLI 輪詢 timeout 設定 | M4 pollUntilDone 預設 15 min timeout、超過顯示 「query Lambda log」提示給 user debug |
| nodejs-polars Lambda binary 與 Container Linux 不相容 | PLAN_E7 M3 已 `--platform=linux/amd64` build、polars 是 native .node addon、Lambda Container linux/amd64 應對 |

---

## 學期報告 narrative 加分點（PLAN_E13 reuse）

PLAN_E9 完跑通後、§7 期中比較可加：
- 「期中：人工 boto3 拉 raw + pandas 清 + matplotlib 出圖（manual、~30 min 單月）」
- 「期末：CLI 一行 `tdcs-dl pull && tdcs-dl clean` → Lambda 自動清 → Parquet + Glue partition discovery → query-ready」
- 量化對比：人工 30 min × 12 月 = 6 hr / CLI 自動 ≤ 10 min × 12 月 ≤ 2 hr（Lambda 並行 cap）+ 0 人工介入
- 14,058 行 baseline md5 對齊 = 證實「自動化沒丟資料 / 沒改演算法」

---

## PLAN_E10 預覽（PLAN_E9 close 後啟動）

`tdcs-dl query` subcommand 走 Athena workgroup `tdcs-dl-wg`、查 cleaned_v2 表、回表格 / JSON。一個 wizard step 加 query 選 preset（top vehicle / hourly trend / OD pair top 10）。
