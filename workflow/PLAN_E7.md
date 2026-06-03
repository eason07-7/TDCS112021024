# PLAN_E7 — AWS infra setup（API GW + Lambda + S3 + Athena + Glue Data Catalog）

> **對應紀錄**：`workflow/實驗紀錄7.md`
> **關鍵成果**：_(此行於封存前由 Lead 填、archive.py 會抓進 INDEX.md)_

---

## 背景

PLAN_E6 v2 CLI 骨架完成（`logs/PLAN_E6_done.md`）：
- `tdcs-clean.ts` baseline 14,058 行 md5=0 對齊、TS 翻譯通過
- gantries_v4_1.json 339 個門架就位
- endpoint 三層 priority + `tdcs-dl config` 4 subcommand 機制可用、但 `DEFAULT_ENDPOINT` 是 placeholder

PLAN_E7 是 **AWS infra 第一次落地**：把 mcp_workspace 從「純本地 CLI」推進到「CLI + AWS backend」。本 PLAN 完才能把 `DEFAULT_ENDPOINT` 改成實際 API GW URL、PLAN_E8 起的 `pull / clean / query` 業務 subcommand 才有後端可打。

對齊 brief：
- `reports/brief_cleaning_arch_comparison_2026-06-02.md` §3 narrative — **Lambda > Glue ETL** 的工程選擇理由（mcp 場景：user 觸發 + 任意路段 + 9 GiB / 12 週）
- `reports/brief_cleaning_arch_comparison_2026-06-02.md` §4 — PLAN_E7 worker 必讀 Don't & Do 表
- `reports/brief_requirements_2026-06-02.md` §1/§2 — 期末規則 §5 Volume + §7 期中比較對映

---

## 目標

跑完 PLAN_E7 後達到：

1. `infra/terraform/` Terraform module 樹完整、`terraform validate` 過、`terraform plan` 可預期所有 AWS 資源
2. **S3 buckets** 在 Lab account 建好：
   - `s3://112021024/raw/` — CLI 上傳的 raw TDCS csv.gz（PLAN_E8 用）
   - `s3://112021024/cleaned_v2/` — Lambda 寫的 Parquet 結果（PLAN_E9 用）
   - `s3://112021024/jobs/` — `jobs/<id>.json` 進度檔（CLI 輪詢用）
3. **Lambda Container** 在 ECR：`tdcs-dl-cleaner:latest`（Node.js 20 + nodejs-polars + AWS SDK v3 + `tdcs-clean.ts` 複用、僅 hello world handler、PLAN_E9 才接清洗）
4. **API Gateway HTTP API** 兩個 route：
   - `POST /clean` → Lambda invoke（同步、回 `{job_id}`、PLAN_E9 才接真清洗、本 PLAN 只回 echo）
   - `GET /jobs/{id}` → Lambda lookup S3 `jobs/<id>.json` 回 progress
5. **Glue Data Catalog** database `tdcs_dl` + 一個指向 `s3://112021024/cleaned_v2/` 的 external table skeleton（columns 先放 PLAN_E6 baseline schema、PLAN_E9 寫 partition）
6. **Athena workgroup** `tdcs-dl-wg`、`MAX_SCAN_MB = 10` query result location 指向 `s3://112021024/athena-results/`
7. **CLI `DEFAULT_ENDPOINT`** 改成實際 API GW URL（hardcode 進 `cli/src/lib/config.ts`、commit；user 仍可 `tdcs-dl config set-endpoint` 自架時 override）
8. **端到端 smoke test PASS**：
   - `tdcs-dl config get-endpoint` → 印實際 API GW URL（source: default）
   - `curl -X POST <api>/clean -d '{"echo":"hello"}'` → 200 + `{job_id}`
   - `curl <api>/jobs/<id>` → 200 + JSON（即使是 mock progress 也行）

**注意**：本 PLAN 只搭 infra + hello world handler；**真正的清洗 / 下載業務邏輯都在 PLAN_E8（download chain）/ PLAN_E9（clean chain）**。

---

## 不做

- ❌ 不寫 download 業務邏輯（PLAN_E8）
- ❌ 不寫 clean 業務邏輯 — Lambda handler 只回 echo（PLAN_E9 才接 `tdcs-clean.ts`）
- ❌ 不寫 query 業務邏輯（PLAN_E10）
- ❌ 不做 CloudFront / WAF / Cognito（mcp 是 demo 用、不需邊緣 + 認證）
- ❌ 不做 Step Functions / SQS / ECS Fargate（M4 鎖板：純 Lambda 處理層、單月清洗 < 5 min）
- ❌ 不做 cross-account 部署（Learner Lab 654485222392 唯一 account）
- ❌ 不裝 awswrangler（package size 200+ MB、用 `boto3.client('athena').start_query_execution` + 輪詢即可；對應 brief §4 Don't）
- ❌ 不做 IAM Role 建立 — Learner Lab 不允許、Lambda 直接用既有 `LabRole`
- ❌ 不寫 PLAN_E11 UX 打磨 / npm publish

---

## Milestones

### M1 — Terraform 骨架 + provider / backend / variables

**執行者**：`sonnet_worker`（標準 Terraform 寫法、模板化、新派、要完整 onboard）
**預計時間**：1.5 hr

**內容**：
- 建 `mcp_workspace/infra/terraform/` 目錄樹：
  ```
  infra/terraform/
  ├── main.tf              # provider / data 區
  ├── variables.tf         # account_id / region / bucket_name / lambda_image_tag
  ├── outputs.tf           # api_gw_url / s3_buckets / glue_db_name
  ├── versions.tf          # terraform >= 1.6 / aws ~> 5.0
  ├── s3.tf                # M2 — buckets
  ├── lambda.tf            # M3 — function + ECR data
  ├── apigw.tf             # M4 — HTTP API + routes
  ├── glue.tf              # M5 — DB + table skeleton
  ├── athena.tf            # M5 — workgroup
  └── terraform.tfvars.example  # account/region/bucket 填法範例（**禁 commit 真值**）
  ```
- `variables.tf` 鎖板：
  - `aws_region = "us-east-1"`（hard-pinned、Learner Lab 強制；mcp_workspace/CLAUDE.md 寫 ap-northeast-1 是 v1 stale、本 PLAN 以 MASTER_PLAN 為準）
  - `aws_account_id = "654485222392"`（Lab account）
  - `bucket_name = "112021024"`（Lab bucket、已存在、Terraform 用 `data "aws_s3_bucket"` 引用、不建）
  - `lambda_execution_role = "arn:aws:iam::654485222392:role/LabRole"`（Lab 既有、不建 IAM）
- `versions.tf`：terraform ≥ 1.6、`hashicorp/aws ~> 5.0`
- **backend**：本 PLAN 用 **local backend**（`backend "local" {}`）— Lab 4hr session 不適合 S3 remote backend（state lock 會跨 session 失效）；trade-off 寫進 PLAN「未來如要多人協作、Lab → 正式 AWS 才升 S3 backend」

**產出**：
- `infra/terraform/` 全套 .tf 檔（內容 M2-M5 才填、本 milestone 只建骨架 + provider / variables / versions / outputs 殼）
- `infra/terraform/terraform.tfvars.example`（範本、ASCII only、無真值）
- `infra/terraform/README.md`：`terraform init` 怎麼跑、Lab session 過期怎麼換 token、為什麼 local backend

**驗收**：
- 結構：M1 要求的 10 個檔案（main / variables / versions / outputs / s3 / lambda / apigw / glue / athena / .tfvars.example + README）全建立、不缺
- spec 對齊：variables.tf 內 `aws_region` / `aws_account_id` / `bucket_name` / `lambda_execution_role` 4 個變數值對齊本檔（worker 自驗 + Lead 抽驗）
- **terraform CLI 驗收 deferred 到 M6 [USER_RUN]**：sonnet_worker 本機未裝 Terraform（見 `reports/brief_lab_status_2026-06-03.md`）；M6 [USER_RUN] 階段 User 裝完 Terraform ≥ 1.6 後跑 `terraform fmt -check` / `terraform validate` / `terraform plan`、若 fail 回 Lead 修

---

### M2 — S3 bucket 結構（raw / cleaned_v2 / jobs / athena-results）

**執行者**：`sonnet_worker`（續派、Terraform + AWS S3）
**預計時間**：1 hr

**內容**：
- `s3.tf`：用 `data "aws_s3_bucket" "main"` 引用既有 `112021024`（**不建 bucket** — Lab account 已有、不重複）
- 透過 `aws_s3_object` 建 4 個 prefix marker（空 .gitkeep 物件）：
  - `raw/.gitkeep`
  - `cleaned_v2/.gitkeep`
  - `jobs/.gitkeep`
  - `athena-results/.gitkeep`
- **不設 bucket policy / lifecycle**（Lab 預設權限 + 4hr session 內不必清理；trade-off：若 PLAN_E11 上 npm 後 user 自架、要加 lifecycle 自動刪 jobs/ 30 天前；本 PLAN 不做、寫進「後續行動」）

**產出**：
- `s3.tf` 完整、`terraform plan` 顯示 4 個 `aws_s3_object` 將建立
- 4 個 prefix marker 物件成功上傳（M4 [USER_RUN] terraform apply 才會真建）

**驗收**：
- s3.tf 含 `data "aws_s3_bucket"` 引用既有 bucket + 4 個 `aws_s3_object` resource
- 無 IAM resource（純 data + object）
- terraform plan deferred 到 M6 [USER_RUN]

---

### M3 — Lambda Container：Dockerfile + ECR + 函式骨架（hello world）

**執行者**：`sonnet_worker`（續派、Docker + Terraform Lambda）
**預計時間**：2 hr

**內容**：
1. **Dockerfile** — `infra/lambda/Dockerfile`：
   ```
   FROM public.ecr.aws/lambda/nodejs:20
   COPY package.json package-lock.json ./
   RUN npm ci --omit=dev
   COPY dist/ ./
   CMD ["index.handler"]
   ```
2. **Lambda handler** — `infra/lambda/src/index.ts`：
   - export `handler(event, context)`
   - 解析 API GW HTTP API v2 event（routeKey: `POST /clean` 或 `GET /jobs/{id}`）
   - `POST /clean`：echo body + 生成 `job_id`（uuid v4）+ 寫 `s3://112021024/jobs/<id>.json`（status: `accepted`、`echo`、timestamp）+ 回 `{ job_id }`
   - `GET /jobs/{id}`：讀 `s3://112021024/jobs/<id>.json` + 回 JSON；不存在 404
   - 用 `@aws-sdk/client-s3` v3、不用 awswrangler
3. **package.json** — `infra/lambda/package.json`：
   - dependencies: `@aws-sdk/client-s3`、`nodejs-polars`（PLAN_E9 才用、現在 install 進 image 是為下個 PLAN）
   - build: `esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --format=cjs`
4. **lambda.tf**：
   - `data "aws_ecr_repository" "cleaner"`（M4 [USER_RUN] 建 repo + push image 後再 terraform apply）
   - `aws_lambda_function "cleaner"`：image_uri 從 ECR、role = LabRole、memory 1024 MB、timeout 60 s（hello world 用、PLAN_E9 升 900 s）
   - CloudWatch log group：`/aws/lambda/tdcs-dl-cleaner`、retention 7 天
5. **build/push helper script** — `infra/lambda/build_and_push.sh`：
   - `docker build`、`aws ecr get-login-password`、`docker push`
   - 本機 / Lab 都能跑、不依 CI（PLAN_E11 才補 GitHub Actions）

**產出**：
- `infra/lambda/Dockerfile` / `src/index.ts` / `package.json` / `tsconfig.json`
- `infra/lambda/build_and_push.sh`（chmod +x）
- `infra/terraform/lambda.tf`（Lambda function + log group 定義）
- `infra/lambda/README.md`：build 流程 + handler API 規格

**驗收**：
- `cd infra/lambda && npm install && npx esbuild ...` → `dist/index.js` 產出（< 2 MB）
- handler 結構自驗：routeKey switch 兩條 case 都覆蓋、S3 PUT/GET 用 `@aws-sdk/client-s3` v3、無 awswrangler
- `docker build` 與 `terraform validate` deferred 到 M6 [USER_RUN]（sonnet 本機未裝）

---

### M4 — API Gateway HTTP API + routes

**執行者**：`sonnet_worker`（續派、Terraform API GW）
**預計時間**：1 hr

**內容**：
- `apigw.tf`：
  - `aws_apigatewayv2_api "tdcs_dl"` — protocol HTTP、CORS 開（allow_origins = `["*"]`、demo 用）
  - `aws_apigatewayv2_integration "lambda"` — AWS_PROXY 整合到 M3 Lambda function
  - 2 個 route：
    - `aws_apigatewayv2_route "post_clean"` — `POST /clean`
    - `aws_apigatewayv2_route "get_job"` — `GET /jobs/{id}`
  - `aws_apigatewayv2_stage "default"` — auto-deploy = true、access log 寫 CloudWatch
  - `aws_lambda_permission "apigw"` — 允許 API GW invoke Lambda
- `outputs.tf` 加 `api_gw_url = aws_apigatewayv2_api.tdcs_dl.api_endpoint`

**產出**：
- `infra/terraform/apigw.tf` 完整
- `terraform output api_gw_url` apply 後印 URL（M6 [USER_RUN] 跑出來）

**驗收**：
- apigw.tf 含 1 api + 1 integration + 2 routes + 1 stage + 1 lambda permission
- outputs.tf 含 `api_gw_url`
- terraform validate/plan deferred 到 M6 [USER_RUN]

---

### M5 — Glue Data Catalog DB + Athena workgroup

**執行者**：`sonnet_worker`（續派、Terraform Glue + Athena）
**預計時間**：1.5 hr

**內容**：
1. **glue.tf**：
   - `aws_glue_catalog_database "tdcs_dl"` — name = `tdcs_dl`
   - `aws_glue_catalog_table "cleaned_v2_skeleton"` —
     - storage_descriptor 指向 `s3://112021024/cleaned_v2/`
     - columns 對齊 `cli/src/lib/tdcs-clean.types.ts`（PLAN_E6 baseline schema：`date`、`hour`、`target_gantry`、`vehicle_type`、`volume`、`week_index`、`gantry_id_o`、`gantry_id_d`...）
     - partition_keys：`[{name="yyyymm", type="string"}]`
     - SerDe = Parquet
     - **空表 OK** — PLAN_E9 寫 Parquet 進 cleaned_v2/yyyymm=202603/ 後、Athena MSCK REPAIR 自動 discover partition
2. **athena.tf**：
   - `aws_athena_workgroup "tdcs_dl_wg"`：
     - result_configuration.output_location = `s3://112021024/athena-results/`
     - bytes_scanned_cutoff_per_query = `10485760`（10 MB、對應 brief §4 Do)
     - enforce_workgroup_configuration = true
     - publish_cloudwatch_metrics_enabled = true

**產出**：
- `infra/terraform/glue.tf` + `athena.tf` 完整
- column schema 對齊 PLAN_E6 `tdcs-clean.types.ts`（**source of truth 在 PLAN_E6、本 PLAN 引用、不重定**）

**驗收**：
- glue.tf + athena.tf 含 1 db + 1 table + 1 workgroup
- column schema 文字 diff = PLAN_E6 `tdcs-clean.types.ts` 對應欄位 100% 一致（worker 自驗）
- terraform validate/plan deferred 到 M6 [USER_RUN]

---

### M6 — 部署 + 端到端 smoke test（**最大 [USER_RUN] block**）

**執行者**：`[USER_RUN]`（terraform apply + Docker push + curl test，需 AWS Lab 互動 + 4hr session）
**預計時間**：30 min（含等待 ECR push / Lambda cold start）

**內容**（給 User 的指令序列）：

```bash
# === 0a. 本機工具就緒檢查（PLAN_E7 sanity check 已測出 Terraform + Docker 未裝、M1-M5 期間應已補裝）===
terraform version  # 應 ≥ 1.6
docker version --format "{{.Server.Version}}"  # 應印版號（不是 Cannot connect）

# === 0b. 確認 Lab session token 已更新 + 帳號正確 ===
cd mcp_workspace
cat .env  # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN 三個都有
aws sts get-caller-identity
# 必須回 Account=654485222392（學號 112021024）；2026-06-03 sanity check 曾誤刷成 731714568222、AccessDenied、所以這步硬驗

# === 1. 建 ECR repo（Terraform 不建、手動一次性、reuse 跨 4hr session）===
aws ecr create-repository --repository-name tdcs-dl-cleaner --region us-east-1 || true

# === 2. Build + push Lambda image ===
cd infra/lambda
npm install
npx esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --format=cjs
bash build_and_push.sh  # docker build + ECR login + push tdcs-dl-cleaner:latest

# === 3. terraform apply ===
cd ../terraform
terraform init  # 首次
terraform plan  # 看會建什麼、確認對齊 M1-M5 預期
terraform apply  # yes
# 等 ~2 min；apply 完印 api_gw_url

# === 4. Smoke test ===
export API=$(terraform output -raw api_gw_url)
echo "API: $API"

# 4a. POST /clean — echo
curl -X POST "$API/clean" -H "Content-Type: application/json" -d '{"echo":"hello"}'
# 預期：{ "job_id": "<uuid>" }

# 4b. GET /jobs/{id}
export JOB=<從 4a 拿 job_id>
curl "$API/jobs/$JOB"
# 預期：{ "job_id": "<JOB>", "status": "accepted", "echo": "hello", "timestamp": "..." }

# 4c. CLI 對齊驗證
cd ../../cli
# 把 API URL hardcode 進 lib/config.ts DEFAULT_ENDPOINT（M7 工作、本步驟 user 手動先 set-endpoint 驗）
node dist/index.js config set-endpoint "$API"
node dist/index.js config get-endpoint
# 預期：endpoint = <API> / source = file
```

**預期成果**：
- ✅ Terraform 建立資源全部 PASS（4 個 S3 物件、1 Lambda、1 API GW、1 Glue DB、1 Glue table、1 Athena workgroup、1 log group、1 Lambda permission）
- ✅ 兩個 curl test 都 200 + JSON 正確
- ✅ `terraform output api_gw_url` 拿到實際 URL（給 M7 用）
- ✅ CloudWatch log group `/aws/lambda/tdcs-dl-cleaner` 出現 hello world invoke 紀錄

**完成後回報**：
- API GW URL 給 Lead
- terraform apply 任何 warning / error log 給 Lead
- 任 1 smoke 步驟 fail → STOP + 完整 stderr 給 Lead

---

### M7 — CLI `DEFAULT_ENDPOINT` 改成實際 URL + commit

**執行者**：`Lead` 自做（1 行 const 改、不浪費派工）
**預計時間**：5 min

**內容**：
- 改 `cli/src/lib/config.ts` line 13：
  - 舊：`export const DEFAULT_ENDPOINT = 'https://placeholder.invalid/';`
  - 新：`export const DEFAULT_ENDPOINT = '<M6 拿到的 api_gw_url>';`
- 跑 `cli/` 內 `npm run typecheck && npm test && npm run build` 確認沒壞
- `cli/tests/config.test.ts` 18 個 test 應全綠（DEFAULT_ENDPOINT 是 string、test 用 `expect(r.source).toBe('default')` 而非比對特定 URL、不會壞）

**產出**：
- `cli/src/lib/config.ts` DEFAULT_ENDPOINT 改成實際 URL
- 46/46 test 仍 PASS

**驗收**：
- `node dist/index.js config get-endpoint`（在沒設 env、沒寫 file 的乾淨環境）→ 印 M6 的 API GW URL + source=default

---

## 完成定義（整 PLAN）

- [ ] M1 Terraform 骨架 + variables 鎖板（region / account / bucket / LabRole）
- [ ] M2 S3 prefix markers（raw / cleaned_v2 / jobs / athena-results）
- [ ] M3 Lambda Container（hello world handler + Dockerfile + ECR build script）
- [ ] M4 API GW HTTP + 2 routes（POST /clean / GET /jobs/{id}）
- [ ] M5 Glue DB + table skeleton + Athena workgroup（10 MB scan cap）
- [ ] M6 [USER_RUN] terraform apply + ECR push + smoke test PASS
- [ ] M7 CLI DEFAULT_ENDPOINT 改實際 URL + 46/46 test 仍綠
- [ ] PLAN 開頭「關鍵成果」frontmatter 填好
- [ ] 跑 `close_plan.py` 封存

---

## Worker 配置

| Milestone | 派 worker / 角色 | 模式 | 理由 |
|---|---|---|---|
| M1 Terraform 骨架 | `sonnet_worker` | **首次派、要完整 onboard**（PLAN_E6 sonnet session 已封存、新對話） | Sonnet 對 Terraform standard module 結構熟、PLAN_E6 完成沒 context bleed 風險 |
| M2 S3 markers | `sonnet_worker` | 續派短指令 | 標準 Terraform aws_s3_object |
| M3 Lambda Container | `sonnet_worker` | 續派 + brief 加強 | Docker + esbuild + AWS SDK v3、brief §4 Don't 必讀 |
| M4 API GW | `sonnet_worker` | 續派短指令 | Terraform apigatewayv2 模組標準 |
| M5 Glue + Athena | `sonnet_worker` | 續派、列 PLAN_E6 schema 鏈接 | column schema 引用、不重定 |
| M6 部署 + smoke | `[USER_RUN]` | — | AWS Console + Docker push + 4hr session、Lead 不該跑 |
| M7 const 改 | `Lead` | — | 1 行 const、不派工 |

**派工順序**：
1. 先派 M1 + M2（Terraform 骨架 + S3、~2.5 hr）
2. M2 完 Lead 驗收 + 派 M3 + M4（Lambda + API GW、~3 hr）
3. M3+M4 完 + 派 M5（Glue + Athena、~1.5 hr）
4. M5 完 Lead 驗收 + [USER_RUN] M6（user 跑 terraform apply + smoke）
5. M6 PASS → Lead 自做 M7
6. 整 PLAN ~7-8 hr worker + ~30 min user

---

## 風險

| 風險 | 緩解 |
|---|---|
| **Lab session token 4hr 過期、terraform apply 跑到一半失效** | M6 [USER_RUN] 提示 user 確認 token 新鮮、apply 預估 < 2 min；如 mid-apply 失敗、terraform state 已記、重設 token 再 apply 會 resume |
| **`mcp_workspace/CLAUDE.md` 寫 `ap-northeast-1`、與 MASTER_PLAN us-east-1 衝突** | 本 PLAN 以 MASTER_PLAN 為準（us-east-1）；M6 完後 Lead 自做修 mcp_workspace/CLAUDE.md region 標註 + 寫進 mcp/CLAUDE.md 「region 過時、以 MASTER_PLAN 為準」 |
| **LabRole 權限不足、Lambda 某些 service 跑不起來** | M3 hello world handler 只用 S3 GetObject/PutObject（LabRole 標配）；如 PLAN_E9 真清洗時遇 Glue / Athena 權限缺、再評估 |
| **ECR repo Terraform 不建（避免反覆建立）、user 忘記 aws ecr create-repository** | M6 [USER_RUN] script 第 1 行就跑 `aws ecr create-repository ... || true`（idempotent） |
| **Lambda Container image > 10 GB ECR 限制** | hello world image 預估 < 200 MB、nodejs-polars 全裝也 < 500 MB；PLAN_E9 真接清洗時若飆 image size、再評估 |
| **API GW CORS `*` 開太大** | demo / 學期專案可接受；PLAN_E11 上 npm 前如果有公網安全需求、改成 `https://<user-domain>` allowlist |
| **terraform local backend、state 檔遺失 → 資源孤兒** | state 檔在 `infra/terraform/terraform.tfstate`、加 `.gitignore` 但**手動每次 apply 後 backup 到 user 自己 OneDrive**；trade-off 寫進 README |
| **Glue table schema 與 PLAN_E9 Parquet 實寫不對齊** | M5 column schema 直接 import / 引用 PLAN_E6 `tdcs-clean.types.ts`（單一 source of truth）；worker 自驗 100% 一致 |
| **Athena scan cap 10 MB 對 cleaned_v2 全月查詢可能不夠** | 對應 brief §4 Do（query 安全護網）；如 PLAN_E10 業務 query 撞天花板、改 50 MB（仍合理）；本 PLAN 不動 |
| **mcp/CLAUDE.md `S3 bucket 112021134trafficdatacollectionsyste` 是舊 v1 bucket、新 v2 用 112021024** | 本 PLAN 寫死 112021024、不動 mcp/CLAUDE.md（v1 鎖板、PLAN_E11 npm publish 前 Lead 自做整檔 v2 校準） |
| **本機 Terraform + Docker 未裝**（2026-06-03 sanity check 實證；M6 [USER_RUN] 會被擋）| User 在 M1-M5 期間（~4-5 hr critical path）並行裝 Terraform ≥ 1.6 + Docker Desktop、不卡 M6 |
| **Lab session 帳號混用**（2026-06-03 sanity check 曾誤刷成 731714568222 / 學號 112021161、AccessDenied）| M6 [USER_RUN] 0b 步驟強制 `sts get-caller-identity` 驗 Account=654485222392 才進下一步 |
| **ECR repo 非 Terraform 管、需手動建**（避免反覆建 / 刪、跨 4hr session reuse）| M6 [USER_RUN] 第 1 步硬寫 `aws ecr create-repository ... || true`（idempotent、已存在不爆）|

---

## 對應期末規則配分

依 `reports/brief_requirements_2026-06-02.md`：
- **§5 Volume（10%）**：「資料前處理 + AWS Glue ETL」— 我們 Glue Data Catalog（metadata service、非 Glue ETL Spark）+ S3 + Lambda 涵蓋；narrative 寫「為什麼選 Lambda 不選 Glue ETL」（brief_cleaning_arch §3.3）
- **§7 期中比較（15%）**：AWS services 增加之效能 — 本 PLAN 部署 S3 + Lambda + API GW + Glue DC + Athena 共 **5 個 AWS 服務**（達標）
- **§6 Variety（10%）**：本 PLAN 不直接貢獻、留 PLAN_E10 query 多維度展示
