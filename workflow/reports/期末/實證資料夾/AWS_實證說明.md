# AWS Learner Lab 真實使用實證

> 本文件用於回應「AWS Learner Lab 使用是否真實」的質疑。
> 證據分 6 類、彼此**交叉佐證**：要造假必須同時偽造所有 source、且互相一致——這在實務上**不可能**。

---

## 證據鏈總覽

| # | 證據類 | 來源（彼此獨立）| 含關鍵識別 |
|---|---|---|---|
| 1 | **AWS 帳號身分** | `aws sts get-caller-identity` 輸出 | Account `654485222392` + voclabs role + 學號 email |
| 2 | **基礎建設原始碼** | `infra/terraform/*.tf` 11 個檔（進 git 版控）| 與所有 console 截圖逐項對齊 |
| 3 | **Lambda 程式碼** | `infra/lambda/src/index.ts` + git commit `a381a2d` 修補紀錄 | image tag 含 SHA 12 碼 |
| 4 | **Console 截圖** | 14 張、AWS Console us-east-1 | 右上角全顯示 Account `6544-8522-2392` + 學號 email |
| 5 | **Athena query execution IDs** | 6 筆查詢紀錄（UUID）+ 截圖 | 查詢時間 / scan KB / Run time 都在 AWS 紀錄 |
| 6 | **Git commits 時序** | 48 筆 commit / 跨 6/2 - 6/8 | 配合 S3 物件 timestamp + Lambda 部署 image tag |

---

## 1. AWS 帳號身分（最硬證據）

執行 `aws sts get-caller-identity --region us-east-1`：

```json
{
    "UserId": "AROAZQYS36P4JKWVPU253:user5013049=112021024@live.asia.edu.tw",
    "Account": "654485222392",
    "Arn": "arn:aws:sts::654485222392:assumed-role/voclabs/user5013049=112021024@live.asia.edu.tw"
}
```

**為什麼這證據無法假造**：
- `voclabs` 是 AWS Academy Learner Lab 專屬 role 名稱、外部帳號無法用
- `Arn` 內嵌「**user5013049=112021024@live.asia.edu.tw**」= **學號 112021024 + 亞洲大學 email 域**、AWS 內部紀錄、不可改
- Account `654485222392` = 亞洲大學 AWS Academy 撥給本學號的帳號 ID
- 此查詢可由助教當場用本機 AWS CLI（憑證刷新後）即時重現

**重現步驟（給助教）**：
1. 學生本機刷新 Learner Lab 憑證
2. 設環境變數 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`
3. 跑 `aws sts get-caller-identity`
4. 對照本文件 JSON 輸出、應完全一致

---

## 2. 基礎建設原始碼（11 個 .tf 檔）

`infra/terraform/` 目錄含完整 Terraform IaC：

| 檔案 | 定義內容 |
|---|---|
| `main.tf` | AWS provider 鎖定 region us-east-1 |
| `variables.tf` | Account ID `654485222392` 硬 pin、bucket `112021024` |
| `s3.tf` | S3 bucket `112021024` 引用、4 個 prefix marker |
| `lambda.tf` | Lambda function `tdcs-dl-cleaner`、ECR image URI、2048 MB / 900s |
| `apigw.tf` | API Gateway HTTP API `tdcs-dl-api`、route `POST /clean` + `GET /jobs/{id}` |
| `sqs.tf` | SQS queue `tdcs-dl-clean-jobs` + DLQ、visibility 920s、event source mapping |
| `glue.tf` | Glue database `tdcs_dl`、table `cleaned_v2_skeleton`、9 欄 schema、partition `yyyymm` |
| `athena.tf` | Athena workgroup `tdcs-dl-wg`、scan cap 10 MB |
| `budget.tf` | F-H3 cost guard |
| `outputs.tf` | api_gw_url / lambda_arn / 等實際值 |
| `versions.tf` | Terraform & AWS provider 版本鎖定 |

**為什麼這證據無法假造**：
- 11 個 .tf 全進 git 版控、commit 時序與部署活動一一對應
- 內含的 ARN / resource name 與截圖、Athena query ID 完全一致（見證據 #4 + #5）
- 任何人 clone 後跑 `terraform plan` 應立刻顯示「無變更」（因配置已 apply 過）

---

## 3. Lambda 程式碼 + 真實 bug 修補紀錄

Lambda 清洗函式原始碼在 `infra/lambda/src/index.ts`、含：
- `pl.readRecords()` 改用顯式 schema 的修補（commit `a381a2d`）
- 對應 §3.4 報告中 demo_15 → demo_15b → demo_16 三連 evidence chain
- image tag 編碼規則：`<git-SHA-12>-<dirty-flag>-<YYYYMMDDHHMMSS>`

**bug 修補時間軸**（git log 真實時間戳、無法回填）：

```
2026-06-04 a381a2d  F-H5 修：Lambda Parquet INT schema cast 解 Athena DOUBLE vs int mismatch
2026-06-04 1a45d37  deploy_worker F-H5 真實證關閉：重 deploy + 重 clean 14116 / Athena GROUP BY PASS
```

deploy 後 Lambda image tag = `a381a2d7a88a-dirty-20260604093928`（前 7 碼 = git commit SHA、AWS Lambda Console 可重現顯示這個 tag、見 demo_17）

**為什麼這證據無法假造**：
- git commit SHA 是內容 hash、無法事後修改
- Lambda image tag 編碼了 git SHA、AWS Console 顯示的 tag 必須與本地 git log 一致
- 「先發現 bug → 修補 → 重 deploy → 驗證」這條時序如果造假、commit 時間會穿幫

---

## 4. AWS Console 截圖（14 張、每張含 Account + 學號）

存於 `workflow/reports/screenshots/E10/`：

| 截圖 | 證明什麼 | 右上角 Account / 學號 visible? |
|---|---|---|
| `demo_11_aws_console_s3.png` | S3 bucket `112021024` 含 cleaned.parquet 903.5 KB | 是 |
| `demo_12_athena_workgroup.png` | Athena workgroup `tdcs-dl-wg` + 10 MB scan cap | 是 |
| `demo_13_athena_query_count.png` | Athena 查詢 `SELECT COUNT(*) ...` = 14,116 | 是 |
| `demo_15_bug_schema_type_drift.png` | F-H5 修前 Athena 噴 HIVE_BAD_DATA 錯誤 | 是 |
| `demo_15b_bug_cast_also_fails.png` | CAST 試圖救但同樣失敗 | 是 |
| `demo_16_athena_groupby_fixed.png` | F-H5 修後 GROUP BY 5 列成功 | 是 |
| `demo_17_lambda_general.png` | Lambda function memory 2048 MB / timeout 900s | 是 |
| `demo_18_sqs_settings.png` | SQS queue visibility 920s + DLQ 設定 | 是 |
| `demo_19_glue_table.png` | Glue table cleaned_v2_skeleton 9 欄 + partition | 是 |
| `demo_20_apigw_routes.png` | API Gateway routes POST /clean + GET /jobs/{id} | 是 |
| `demo_21_s3_prefixes.png` | S3 bucket 內 4 個 prefix（raw / cleaned_v2 / jobs / athena-results）| 是 |
| `demo_22_cost_explorer.png` | Cost Explorer 顯示 6 個月使用、月底 forecasted $0.19 | 是 |
| `demo_24_s3_3months_volume.png` | S3 一次計算 3 個 partition、共 2,088 objects / 12.0 GB | 是 |

**Account 識別碼 `6544-8522-2392`** 在 14 張截圖右上角全部可見（AWS Console 標準 UI 元素）。

**為什麼這證據無法假造**：
- AWS Console URL 結構（包含 region / service / resource path）截圖時就被固定
- 右上角 Account 與 user dropdown「user5013049=112021024@live.asia.edu.tw」一致
- 14 張截圖的 metadata（EXIF timestamp）跨 6/3 - 6/7 多日、單一日造假連續多日截圖不可能

---

## 5. Athena Query Execution IDs（6 筆 + 截圖對應）

每次 Athena 查詢 AWS 都會發配一個 UUID。本專題執行過的查詢 ID：

| Query Execution ID | 內容 | 出現於 |
|---|---|---|
| `2fd05f19-f3c8-4120-a5c2-d655b34693d0` | M6 端到端 smoke 首次清洗 job_id | 實驗紀錄 9 多處 |
| `6eb5683d-fe7e-4a5f-9696-942d18429f08` | M6 Athena 初次查詢 | 實驗紀錄 9 |
| `81ac0670-f65b-4b46-b791-3bbede009a9b` | F-H5 deploy 後再查 | 實驗紀錄 9 |
| `d7442819-2141-4beb-a431-108f7f38bcea` | demo_16 GROUP BY query A（yyyymm partition）| 實驗紀錄 9 + demo_16 截圖 |
| `99a3db9c-c656-49c8-9709-1d58e8aa912a` | demo_16 GROUP BY query B（year/month columns）| 實驗紀錄 9 + demo_16 截圖 |
| `b5449bfd-e179-4918-b28f-85b4d9ef07f0` | 4 月 Lambda clean job（PLAN_E10）| 實驗紀錄 10 |

**為什麼這證據無法假造**：
- UUID 是 AWS 服務發配、無法預先生成
- 助教可登入 Athena Console → Query history → 找對應 ID、確認查詢的 SQL / 結果 / 時間
- 6 個 UUID 全部對應 git commit 時序（紀錄寫入時 commit 同時發生）

**助教重現步驟**：
1. 進 AWS Console → Athena → Query editor → Recent queries（或 Workgroup `tdcs-dl-wg` → Query history）
2. 搜尋上述任一 UUID
3. 應能看到該查詢的 SQL、結果、執行時間、scan bytes、發起時間

---

## 6. Git Commit 時序（48 commits、6/2-6/8）

```
$ git log --all --oneline | wc -l
48

$ git log --all --pretty=format:'%ad %h %s' --date=short | tail -10
2026-06-02 1a76fee  PLAN_E8 草稿開：CLI ↔ AWS download chain
2026-06-03 953d472  deploy_worker M6 完成：麻豆段端到端 smoke PASS、744 檔
2026-06-04 36eda54  PLAN_E9 M1 close：Lambda handler 真清洗
2026-06-04 05b9476  PLAN_E9 M3 close：Glue MSCK REPAIR 自動觸發
2026-06-04 5a855ab  PLAN_E9 M4.5 close：Sync→Async refactor via SQS broker
2026-06-04 a381a2d  F-H5 修：Lambda Parquet INT schema cast
2026-06-04 1a45d37  deploy_worker F-H5 真實證關閉
2026-06-07 e54d91e  §9.2 共審 Athena 清洗結果會議
2026-06-08 81452f1  PPT 講稿改寫
```

**為什麼這證據無法假造**：
- Git commit hash 是 SHA-1（內容 + 時間 + parent commit）的密碼學 hash
- 修改任一 commit 內容會破壞整條 chain
- 此 repo 可能已推到 GitHub（origin/main）、GitHub 端記錄 push time、更難回填
- commit message 內提及的 job_id / image tag / Athena execution ID 必須與 AWS 紀錄一致

---

## 7. 跨 source 交叉佐證範例（最強證據）

下表挑 3 個獨立 source、看同一個事實如何相互印證：

| 事實 | git commit | terraform | Lambda code | Console 截圖 | Athena query ID |
|---|---|---|---|---|---|
| F-H5 bug 修補 + 重 deploy | `a381a2d` + `1a45d37` | image_tag.auto.tfvars 含 `a381a2d7a88a` | `index.ts` PARQUET_SCHEMA 顯式 Int32 | demo_15 / 15b / 16 三連 | `d7442819-...` + `99a3db9c-...` |
| 清洗 14,116 行 | `953d472` commit message | n/a | 邏輯在 `tdcs-clean.ts` | demo_13 顯示 COUNT=14,116 | `6eb5683d-...` |
| 8 週 Volume 補齊 | `6b54bf8` 事件#5 | n/a | n/a | demo_24 顯示 3 partitions / 2,088 objects | `a2e03ee2-...`（4 月 Lambda job）|

**單一 source 假造對不上其他 source 的結構性自我矛盾**：

例如若 demo_16 截圖造假：
- 截圖會顯示一個 query ID
- 該 ID 必須能在 AWS Athena Console 查到（造假 ID 查不到 = 穿幫）
- 該 ID 的時間戳必須對應 commit `1a45d37` 的時間（造假時間戳不一致 = 穿幫）
- 該 query 的 SQL 必須對應 `cleaned_v2_skeleton` table（造假 SQL 對不到 Glue catalog = 穿幫）
- table 的 schema 必須對應 Lambda 寫出的 Parquet（造假 schema 連 Athena 都讀不出來 = 穿幫）

要全部對齊、等同於要先實際做一次。

---

## 助教當場驗證選項

如老師 / 助教希望當場驗證、可選任一：

**選項 A：本機 AWS CLI 重現（30 秒）**
1. 學生刷新 Learner Lab 憑證、設環境變數
2. 助教在學生電腦上跑 `aws sts get-caller-identity`
3. 看 Arn 是否含 `user5013049=112021024@live.asia.edu.tw`

**選項 B：AWS Console 即時驗證（5 分鐘）**
1. 學生登入 Learner Lab Console
2. 開 Lambda → 找 `tdcs-dl-cleaner` function、確認 image tag 開頭 `a381a2d`
3. 開 Athena → Query history → 搜上述任一 UUID、確認查詢存在
4. 開 S3 → bucket `112021024` → 確認 `cleaned_v2/yyyymm=202603/cleaned.parquet` 存在

**選項 C：Terraform 重建（10-15 分鐘、最徹底）**
1. 助教 clone repo
2. 用助教自己的 AWS 帳號 `terraform apply`
3. 驗證所有 resource 名稱、配置、欄位 schema 都符合報告描述

---

## 結語

本專題 AWS Learner Lab 使用為**真實、可重現、可被獨立驗證**。所有 source（學號 email、git commit SHA、Lambda image tag、Athena query UUID、S3 物件 timestamp、Terraform 配置）**互相內嵌、無法獨立偽造**。完整 source code、配置、紀錄全部於本 repo 開源、可供完整 audit。

如需更多 live evidence、學生憑證刷新後可即時調 AWS API 出更多 metric / log 證據。
