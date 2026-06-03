# PLAN_E8 — CLI ↔ AWS download chain（pull subcommand + S3 raw upload + job status）

> **對應紀錄**：`workflow/實驗紀錄8.md`（PLAN_E8 啟動時建、舊 `實驗紀錄7.md` 已封存到 `logs/`）
> **關鍵成果**：PLAN_E8 download chain 端到端交付：tdcs-dl pull + status + wizard 整合、麻豆段 22 GB 真實跑通（744 檔 / 21.79 GiB / 43 min / 6-state JobRecord）、cli/ 93 test 全綠（46→93）

---

## 背景

PLAN_E7 AWS infra 完整交付（`logs/PLAN_E7_done.md`）：
- 15 個 resource：S3 + Lambda Container + API GW + Glue DC + Athena WG 全跑通
- Production API `https://2lrnfw6699.execute-api.us-east-1.amazonaws.com` 端到端 PASS
- CLI 接 endpoint、46/46 test 仍綠

PLAN_E7 後 opus_worker gate audit（`workflow/實驗紀錄7_1.md`）：**0 條 Critical、4 條 High 不擋 PLAN_E8、進 PLAN_E8 YES**。

PLAN_E8 是 v2 首個業務 subcommand 落地 — 把 CLI 從「config + wizard 框架」推進到「真實能跑 TDCS 抓檔上 S3」。E6 跳板實驗鎖板「**E6 純 client-side**」就是為這 PLAN 鋪路：CLI 在本機（台灣 IP）抓 TDCS → gzip → 上傳 S3 → 寫 jobs/<id>.json status、後續 PLAN_E9 Lambda 才接清洗。

對齊：
- MASTER_PLAN line 249-257 PLAN_E8 spec（M1-M3 原 spec、本檔細化為 M1-M6）
- PLAN_E7 已部署的 endpoint（M3 `tdcs-dl status <job-id>` 直接打 GET /jobs/{id}、無需重部署）
- E6 winner 純 client-side PoC (`scripts/backfill_s3_2026.py` + `D:\p\112021134\download_only_2025.py / upload_month_gz.py`) — 本 PLAN 把 Python PoC 翻譯成 TS CLI lib

---

## 目標

跑完 PLAN_E8 後達到：

1. **`cli/src/lib/tdcs-download.ts`** — 從 tisvcloud.freeway.gov.tw 抓 TDCS M06A raw、純 TS、無 Python 依賴
2. **`cli/src/lib/s3-upload.ts`** — gzip + 多執行緒 S3 PutObject、head_object 去重（idempotent）、進度 callback hook
3. **`cli/src/lib/job-metadata.ts`** — 寫 `s3://112021024/jobs/<job_id>.json` status（downloading / downloaded / error）
4. **`tdcs-dl pull --year <YYYY> --month <MM> --gantries <ID1,ID2,...>`** subcommand：
   - 進度條（cli-progress 月份 + ora 旋轉檔案）
   - 寫 jobs/<id>.json 初始狀態
   - 完成後印 `job_id` 給 user
5. **`tdcs-dl status <job-id>`** subcommand：
   - 打 GET /jobs/{id}（PLAN_E7 已部署 endpoint）
   - 印 status + timestamp + 下載統計
6. **TUI wizard 整合**：Confirm step 「提交」按下後自動跑 pull、進度條接 ink 顯示
7. **端到端 smoke test PASS（[USER_RUN]）**：
   - 跑 `tdcs-dl pull --year 2026 --month 03 --gantries 01F2930N,01F2930S,01F3019N,01F3019S`（麻豆段 4 gantry、~22 GB 預估 5-10 min）
   - S3 上有 `raw/yyyymm=202603/*.csv.gz` ~700+ 檔
   - `tdcs-dl status <job-id>` 回 `downloaded`

**注意**：本 PLAN 只跑 download → S3、**不接清洗**（清洗是 PLAN_E9）。jobs/<id>.json status 停在 `downloaded`、PLAN_E9 Lambda 接手後才會推進到 `processing → done`。

---

## 不做

- ❌ 不接 Lambda 清洗（PLAN_E9）
- ❌ 不接 Athena query（PLAN_E10）
- ❌ 不上 npm（PLAN_E11）
- ❌ 不動 Lambda handler（M3 status 直接打 PLAN_E7 已部署 GET /jobs/{id}、不改 handler）
- ❌ 不動 Terraform / .tf（無新 AWS resource）
- ❌ 不修 4 條 High audit finding（F-H1/H3/H4/M1）— 留 **PLAN_E9 啟動前 gate**（見本 PLAN 最後段）
- ❌ 不動 `D:\p\112021134\` Python 腳本（唯讀、翻譯成 TS 即可、不改原檔）
- ❌ 不寫真實 retry / exponential backoff 邏輯（簡單 retry 1 次即可、PLAN_E11 才補完整）
- ❌ 不寫並行上傳 worker pool 限制動態調整（用固定 5 個 worker、PLAN_E11 才調）

---

## Milestones

### M1 — TDCS download core lib（TS 翻譯 download_only_2025.py）

**執行者**：`sonnet_worker`（續派 / 或新 session 完整 onboard、看 Lead 派工時 sonnet session 狀態）
**預計時間**：3-4 hr

**內容**：
1. 讀 `D:\p\112021134\download_only_2025.py`（核心邏輯：URL 構造 + HTTP GET + 寫本地）+ 相關 helper（如有）
2. 翻譯成 `cli/src/lib/tdcs-download.ts`：
   - `buildTdcsUrl(year, month, day, hour, gantry)` → URL 字串
   - `downloadOneFile(url, outPath, retries=1)` → 寫到本地暫存 dir
   - `downloadMonth(year, month, gantries, tempDir, progressCb)` → 整月抓檔、progressCb 回報每檔進度
   - 用 `node:https` 或 `undici` 或 `axios`（選簡單可靠的、避免額外重依賴）
3. 處理 TDCS 網站特性：
   - 大寫 / 小寫 path 差異（如果原 Python 有處理就照搬）
   - 月份完整才寫 `_READY` marker（原 Python 行為、TS 對齊）
4. 不接認證（TDCS 公開）、不接 proxy
5. 中文檔名 / UTF-8 編碼處理（Windows 環境）

**產出**：
- `cli/src/lib/tdcs-download.ts`（純 TS、無 Python 依賴）
- `cli/src/lib/tdcs-download.types.ts`（type 定義：DownloadProgressEvent / DownloadOptions / DownloadResult）
- `cli/tests/tdcs-download.test.ts`（unit test：URL 構造 + happy path 用 mock HTTP server + retry 行為）

**驗收**：
- typecheck PASS
- unit test ≥ 8 個全綠（含 URL 構造 / mock download / retry / 失敗 retry 用盡）
- 抽 1 個檔實際下載驗證（[USER_RUN] 1 min、跑一個 2026/03/01 01F2930N 的 5 分鐘檔、確認下下來內容對）

---

### M2 — S3 upload + gzip lib（TS 翻譯 upload_month_gz.py）

**執行者**：`sonnet_worker`（續派）
**預計時間**：2-3 hr

**內容**：
1. 讀 `D:\p\112021134\upload_month_gz.py` 核心邏輯
2. 翻譯成 `cli/src/lib/s3-upload.ts`：
   - `gzipFile(localPath)` → 回 Buffer（streaming gzip）
   - `headObjectExists(bucket, key)` → 走 `@aws-sdk/client-s3` HeadObject、去重判斷
   - `uploadOneFile(bucket, key, content, contentType?)` → PutObject、retry 1 次
   - `uploadMonth(localDir, bucket, year, month, gantries, concurrency=5, progressCb)` → 多執行緒上傳（用 `p-limit`）、回報每檔進度
3. S3 path 規則：`s3://112021024/raw/yyyymm=<YYYYMM>/<gantry>_<date>_<hour>.csv.gz`
   - 對齊 PLAN_E7 M2 marker `raw/` prefix + Glue Data Catalog partition 預期（yyyymm= 形式）
4. 認證走 AWS SDK v3 default chain（`.env` 內 AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN 自動讀）

**產出**：
- `cli/src/lib/s3-upload.ts`
- `cli/src/lib/s3-upload.types.ts`（UploadProgressEvent / UploadOptions / UploadResult）
- `cli/tests/s3-upload.test.ts`（unit test：用 `@aws-sdk/client-s3` mock + happy / skip-exists / retry）

**驗收**：
- typecheck PASS
- unit test ≥ 6 個全綠
- 抽 1 個檔實際 upload 驗證（[USER_RUN] 1 min）

---

### M3 — Job metadata writer + `tdcs-dl status` subcommand

**執行者**：`sonnet_worker`（續派）
**預計時間**：1.5 hr

**內容**：
1. **`cli/src/lib/job-metadata.ts`**：
   - `writeJobRecord(bucket, jobId, status, extra?)` → PutObject 到 `jobs/<jobId>.json`、含 timestamp ISO8601
   - `readJobRecord(bucket, jobId)` → GetObject、JSON.parse、回 record（不存在 → null）
   - Schema 對齊 PLAN_E7 Lambda handler（job_id / status / timestamp + 可選欄位 echo / progress / error）
2. **`cli/src/commands/status.ts`**：
   - commander register `tdcs-dl status <job-id>`
   - 走 `lib/config.ts::resolveEndpoint()` 拿 endpoint
   - 打 `GET <endpoint>/jobs/<job-id>` (用 `undici` 或 `node:https`、不用裝 axios)
   - 404 → 印「job 不存在」+ exit 1
   - 200 → 印 status + timestamp + 含 progress 欄位時印進度
3. **`cli/src/index.ts`** 註冊：`program.command('status <jobId>')...`

**產出**：
- `cli/src/lib/job-metadata.ts`
- `cli/src/commands/status.ts`
- `cli/src/index.ts` 加 register
- `cli/tests/status.test.ts`（mock fetch、驗 404 / 200 / endpoint resolve）

**驗收**：
- typecheck PASS
- unit test ≥ 5 個全綠
- `node dist/index.js status <實際 job_id from PLAN_E7 smoke>` → 印 status=accepted + timestamp（[USER_RUN] 30 秒）

---

### M4 — `tdcs-dl pull` subcommand + 進度條

**執行者**：`sonnet_worker`（續派）
**預計時間**：2.5 hr

**內容**：
1. **`cli/src/commands/pull.ts`**：
   - commander register `tdcs-dl pull --year <YYYY> --month <MM> --gantries <CSV>`
   - flow：
     1. 生 `jobId = uuidv4()`
     2. `writeJobRecord(bucket, jobId, 'downloading')`
     3. 本地暫存 dir：`os.tmpdir()/tdcs-dl-<jobId>/`
     4. 跑 `tdcsDownload.downloadMonth(...)` 進度條 1（檔案）
     5. 跑 `s3Upload.uploadMonth(...)` 進度條 2（上傳）
     6. `writeJobRecord(bucket, jobId, 'downloaded', { totalFiles, totalBytes })`
     7. 清暫存 dir
     8. 印 `Done. job_id=<...>`、user 可用 `tdcs-dl status` 查
2. 進度條 UI：用 `cli-progress`（已 install）多 bar；`ora` 旋轉作 idle 等待時用
3. 錯誤處理：任一階段失敗 → `writeJobRecord(bucket, jobId, 'error', { error: msg })` + exit 1

**產出**：
- `cli/src/commands/pull.ts`
- `cli/src/index.ts` 加 register
- `cli/tests/pull.test.ts`（mock download + upload、驗 flow + jobId 寫入順序）

**驗收**：
- typecheck PASS
- unit test ≥ 6 個全綠
- M6 端到端 smoke 麻豆段 PASS

---

### M5 — TUI wizard 整合 pull

**執行者**：`sonnet_worker`（續派）
**預計時間**：1.5 hr

**內容**：
1. **`cli/src/wizard/steps/Confirm.tsx`** 改：
   - 「提交」按下後不只印「Would submit」、改成 async call pull lib
   - 用 ink-spinner 顯示進度（cli-progress 不能直接接 ink、需用 ink 自己的 Box + Text 顯示百分比）
   - 或：分兩 view — 確認 view + 跑進度 view、跑進度 view 用 ink 動態 re-render
2. 完成後 view：印 `Done. job_id=<...>` + 提示 user 用 `tdcs-dl status <job-id>` 查狀態
3. 錯誤 view：印錯誤 + exit code 1

**產出**：
- `cli/src/wizard/steps/Confirm.tsx`（重寫提交段）
- 可能新增 `cli/src/wizard/steps/Running.tsx`（進度 view）

**驗收**：
- typecheck PASS
- 手動測試 wizard happy path（[USER_RUN] 跑一次小規模、如 1 個 gantry 1 天、驗證 wizard 完整跑通）

---

### M6 — 端到端 smoke test（[USER_RUN]、麻豆段全月）

**執行者**：`[USER_RUN]`（[USER_RUN]、需 5-10 min 真實抓檔 + S3 配額確認）
**預計時間**：15 min（含等待）

**內容**：

```powershell
cd D:\p\mcp_workspace\cli

# 1. build
npm run build

# 2. CLI 模式跑 pull（不走 wizard）
node dist/index.js pull --year 2026 --month 03 --gantries 01F2930N,01F2930S,01F3019N,01F3019S
# 預期：兩個進度條跑完、印「Done. job_id=<UUID>」

# 3. 驗 S3 上有 raw csv.gz
aws s3 ls "s3://112021024/raw/yyyymm=202603/" --recursive | head -5
aws s3 ls "s3://112021024/raw/yyyymm=202603/" --recursive | wc -l
# 預期：700+ 檔（4 gantry × 28 天 × 6 個 10-min 區段 / day 或類似量級）

# 4. status subcommand
node dist/index.js status <job-id>
# 預期：status=downloaded + totalFiles + totalBytes

# 5. （可選）TUI wizard 也跑一次
node dist/index.js
# wizard happy path 跑通
```

**驗收**：
- step 2-4 全綠
- S3 上 raw csv.gz 檔數 ≥ 700（與 PLAN_E5 `step0_s3_download/raw_202603/` 741 檔對齊驗證）
- 無 ExpiredToken / 401 / 403 / 5xx

**紅線**：
- 抓檔過程任 1 檔 fail 不算過、要追蹤是 TDCS 端問題還是 CLI bug
- 上傳階段 S3 配額 ExpiredToken → STOP、刷 Lab token 重跑（M2 idempotent 會 skip 已上傳）

---

## 完成定義（整 PLAN）

- [ ] M1 tdcs-download.ts + 8 unit test
- [ ] M2 s3-upload.ts + 6 unit test
- [ ] M3 job-metadata.ts + status subcommand + 5 unit test
- [ ] M4 pull subcommand + 6 unit test
- [ ] M5 TUI wizard 整合
- [ ] M6 [USER_RUN] 麻豆段 smoke PASS
- [ ] cli/ 累積 test 數：46（PLAN_E7 收尾）+ 25 新增 ≈ **71+ 全綠**
- [ ] PLAN 開頭「關鍵成果」frontmatter 填好
- [ ] 跑 `close_plan.py` 封存
- [ ] **PLAN_E9 啟動前 gate check 4 條 H 全綠**（見本 PLAN 最後段）

---

## Worker 配置

| Milestone | 派 | 模式 | 理由 |
|---|---|---|---|
| M1 download lib | `sonnet_worker` | 續派（PLAN_E7 同 session 接續）或新 session 完整 onboard | TS 翻譯 + HTTP / fs 標準操作、sonnet 強項 |
| M2 s3-upload lib | `sonnet_worker` | 續派 | `@aws-sdk/client-s3` v3 + p-limit、標準 |
| M3 job-metadata + status | `sonnet_worker` | 續派 | commander subcommand + fetch、PLAN_E6 config 同 pattern |
| M4 pull subcommand | `sonnet_worker` | 續派 | commander + cli-progress、PLAN_E6 同 pattern |
| M5 TUI wizard 整合 | `sonnet_worker` | 續派 | ink + React、PLAN_E6 wizard 同 pattern |
| M6 smoke | `[USER_RUN]` | — | 真實抓檔 / S3 upload、Lab token + 網路時間 |

派工順序：
1. M1+M2（download + upload lib、~6 hr）
2. M3+M4+M5（command + wizard 整合、~5 hr）
3. M6 [USER_RUN]（15 min real run）
4. Lead 抽驗 + close_plan + 進 PLAN_E9 gate

---

## 風險

| 風險 | 緩解 |
|---|---|
| **TDCS 網站行為改變**（URL pattern / 編碼 / 限速）| M1 對齊 `D:\p\112021134\download_only_2025.py` 已實證版本、worker 抓檔失敗回 Lead 評估 |
| Lab session 4hr 過期、M6 跑到一半失敗 | M2 idempotent（head_object 去重）、重跑接續 |
| 中文檔名 / UTF-8 編碼 Windows fs 寫入問題 | M1 統一用 utf-8、必要時 `iconv-lite` |
| `D:\p\112021134\` Python 腳本邏輯 worker 看不懂 | Lead 派 worker 時附 5 行 abstract 描述每個 helper 用途、worker 不必逐行 reverse-engineer |
| TS 翻譯沒對齊 Python 行為（如月份完整 marker） | M6 smoke 用麻豆段 baseline 對齊 PLAN_E5 `step0_s3_download/raw_202603/` 741 檔、差距 > 5% = M1/M2 重翻 |
| concurrency=5 上傳對 Learner Lab S3 配額過載 | 配額不知、第一次 smoke 觀察、有 throttle 警示就降到 3 |
| Lambda 不知 raw 已上傳、無法觸發清洗 | 本 PLAN 不接清洗（PLAN_E9 接）、M4 pull 寫 jobs/<id>.json status=downloaded、PLAN_E9 Lambda 輪詢或 EventBridge 接 |

---

## PLAN_E9 啟動前 gate check（4 條 H finding 必解）

opus_worker PLAN_E7 後 gate audit（`workflow/實驗紀錄7_1.md` 事件 #1）找到 4 條 High、本 PLAN_E8 不擋、但 **PLAN_E9 啟動前必須全綠**。本段列處理方向、由 Lead 在 PLAN_E8 收尾後 + PLAN_E9 啟動前單獨開 PR / commit 處理（不算入 PLAN_E8 milestone）：

### F-H1 — Lambda timeout（單月清洗 482s 已逼近 900s 天花板）

- **問題**：PLAN_E6 M5 baseline 實測單月 482 秒（本機）；Lambda 1024 MB 更慢、estimated 700-900s；wizard 開放「整年 12 月」preset = 單 invoke 12 月必爆
- **方向**：(a) 砍「整年」preset、限制單 invoke ≤ 1 月  /  (b) Lambda timeout 升 900s + 加月份 chunking（每月一個 Lambda invoke）  /  (c) 改 Step Functions orchestrate 多月（過頭、推 PLAN_E11+）
- **Lead 建議**：(a) + (b) 雙保險、(c) 不採（M4 鎖板「純 Lambda」）

### F-H3 — Production API 公開無認證 + CORS * + 無 body limit

- **問題**：`https://2lrnfw6699.execute-api.us-east-1.amazonaws.com` 任何人 POST /clean 都觸發 Lambda、Learner Lab 配額會被打、demo 期還算可接受但 PLAN_E9 真接 compute 後 attack surface 變大
- **方向**：(a) Lambda handler 內加 body size 上限（如 < 100 KB 拒）  /  (b) AWS Budget alarm $5 觸發通知  /  (c) PLAN_E11 上 API key authorizer（demo 期不必）
- **Lead 建議**：(a) + (b) 必做、(c) 延 PLAN_E11

### F-H4 — Lambda image `:latest` tag 無版控

- **問題**：`infra/terraform/lambda.tf:17` `image_uri = "...:${var.lambda_image_tag}"`（default `latest`）；改 handler push 同 tag → terraform plan diff = 0 → `aws_lambda_function` 不會更新 image_uri → 跑舊 image
- **方向**：(a) build_and_push.sh 改 tag = git short SHA（如 `tdcs-dl-cleaner:abc1234`）+ terraform.tfvars 自動更新  /  (b) 用 image digest sha256:xxx 而非 tag（更嚴格、需先 push 才能拿 digest）  /  (c) 強制 `terraform apply -replace=aws_lambda_function.cleaner`（最簡單、不需改 IaC）
- **Lead 建議**：先採 (c)（PLAN_E9 deploy 時 deploy_worker 加 `-replace` flag）、後續評估 (a) 進 PLAN_E11

### F-M1 — Glue snake_case vs TS PascalCase mapping drift

- **問題**：`infra/terraform/glue.tf` columns 全 snake_case（year/month/hour_0/gantry_id_o/...）vs `cli/src/lib/tdcs-clean.types.ts` `HourlyRowWithWeek` 全 PascalCase（Year/Month/Hour_0/GantryID_O/...）；PLAN_E9 Lambda 寫 Parquet 時若用 TS field 名直接 serialize、Athena 查 = 全 null
- **方向**：(a) Lambda 寫 Parquet 前顯式 mapping（TS PascalCase → Parquet snake_case）  /  (b) 改 TS `HourlyRowWithWeek` 也用 snake_case（破壞 PLAN_E6 翻譯規則「對齊 Python source」）  /  (c) 改 glue.tf columns 用 PascalCase（破壞 Parquet/Athena snake_case 慣例）
- **Lead 建議**：(a) PLAN_E9 Lambda handler 內加 mapping helper、不動 TS 也不動 Glue schema

---

**4 條 H gate 處理時機**：PLAN_E8 close 後、PLAN_E9 啟動前、Lead 自做 / 必要時派 sonnet_worker；總時間 ~3-4 hr。
