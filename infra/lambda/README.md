# tdcs-dl Lambda handler

> PLAN_E7 M3：hello world handler（POST /clean + GET /jobs/{id}）
> PLAN_E9 才接入真實清洗邏輯（tdcs-clean.ts + nodejs-polars）

---

## 何時 build / push（M6 [USER_RUN]）

```bash
# 先確保 ECR repo 存在
aws ecr create-repository --repository-name tdcs-dl-cleaner --region us-east-1

# 然後 build + push
bash infra/lambda/build_and_push.sh
```

`build_and_push.sh` 做 5 件事：
1. 算出本次部署的**唯一 image tag**（git short SHA；working tree dirty 時補時間戳）
2. `esbuild` 打包 `src/index.ts` → `dist/index.js`（CJS bundle、external polars + aws-sdk）
3. `docker build` 成 Lambda Container image
4. ECR login + push（唯一 tag + 同步更新 `latest` 供人工瀏覽）
5. 寫 `../terraform/image_tag.auto.tfvars`（餵 `var.lambda_image_tag`）

跑完直接 `cd ../terraform && terraform apply`、不必手加 `-var` / `-replace`。

---

## image tag 版控（F-H4 fix）— 為什麼不再固定推 `:latest`

> 背景見 `workflow/logs/實驗紀錄7_1.md` finding F-H4。

**問題**：Lambda 的 `image_uri` 若綁 `:latest`，push 新 image 後字串沒變 → `terraform apply`
偵測 diff = 0 → **Lambda 繼續跑舊 image**（改了 handler 卻像沒生效的鬼打牆）。Lambda 是按
push 當下的 digest 綁定、不會自動追 `latest`。

**解法（不動 `lambda.tf`）**：每次部署用「唯一、不可變」的 tag（git SHA），由
`build_and_push.sh` 寫進 `infra/terraform/image_tag.auto.tfvars`：

```hcl
lambda_image_tag = "a1b2c3d4e5f6"
```

Terraform 會**自動載入** `*.auto.tfvars`（已 gitignore、屬部署機本地檔），餵給 `variables.tf`
既有的 `var.lambda_image_tag`（其 description 早已寫「e.g. 'latest' or commit SHA」）。於是
`image_uri` 字串隨每次部署改變 → `terraform plan` 偵測到變更 → **in-place 更新** Lambda code。

**為什麼選這個方案**（trade-off）：
- ❌ `terraform apply -replace=...`：要部署者每次記得帶 flag；忘了跑純 `apply` 又靜默回舊 image；destroy+create 也比 in-place 重。
- ❌ `@sha256:` digest pin：最嚴謹但要改 `lambda.tf` image_uri 那行（與並行改 `lambda.tf` 的 worker 衝突風險）、digest 不可讀。
- ✅ **本方案**：達成 digest pin 的目標（terraform 偵測得到變更、純 `apply` 即生效），但只動 `build_and_push.sh` + 本 README，tag 還是人看得懂的 git SHA。

`TAG=v1.2.3 bash build_and_push.sh` 可覆寫 tag（指定版本 / 回滾）。

---

## Handler API 規格

### POST /clean

| 項目 | 值 |
|---|---|
| Route | `POST /clean` |
| Request body | 任意 JSON（PLAN_E9 接清洗參數：gantries/yyyymm/outputDest）**≤ 100 KB** |
| Response 202 | `{ "job_id": "<uuid>" }` （Accepted；202 是語意正確的 async accepted） |
| **Response 413** | **body > 100 KB → `{ error: "body too large", max: 102400, received: N }` （F-H3 gate）** |
| Response 400 | 無效 JSON → `{ error: "invalid JSON body" }` |
| S3 寫入 | `s3://<BUCKET>/jobs/<job_id>.json` = `{ job_id, status: "accepted", echo: <body>, timestamp: ISO8601 }` |

**Body size limit（F-H3）**：handler 在 `JSON.parse` 前先檢查 `rawBody.length > 100 * 1024`、防止 bot/濫用觸發高昂的 PLAN_E9+ compute。

**PLAN_E9 擴充**：status 欄位改為 `queued → processing → done/error`、echo 替換為實際清洗任務參數與進度

### GET /jobs/{id}

| 項目 | 值 |
|---|---|
| Route | `GET /jobs/{id}` |
| Path param | `id` = job_id（UUID）|
| Response 200 | S3 jobs/<id>.json 全文（JSON）|
| Response 404 | `{ "error": "job not found", "id": "<id>" }` |
| Response 400 | `{ "error": "missing job id" }`（id 為空）|

---

## 為何 CJS（CommonJS）vs cli/ 的 ESM

`cli/` 用 `"type": "module"`（ESM），因為 ink + yoga-wasm-web 需要 ESM。

Lambda 用 CJS 原因：
- Lambda Node.js 20 runtime **預設 CJS**（不需 `"type": "module"`）
- esbuild `--format=cjs` 打包成單檔、runtime 直接 `require('./dist/index.js')`
- 避免 ESM top-level await + Lambda cold start 的計時問題
- 未來需要 ESM：改 `--format=esm` 並在 package.json 加 `"type": "module"` 即可

---

## 為何 esbuild --external:nodejs-polars + @aws-sdk/*

- `nodejs-polars`：native .node addon，esbuild 不能 bundle → 放 node_modules；Lambda image 已 `npm ci` 裝好
- `@aws-sdk/*`：Lambda Node 20 runtime **內建 AWS SDK v3**（不需打包）、bundle 進去反而增加 image size
- esbuild bundle 主要是把 `src/index.ts` + uuid 打成一個小檔（< 100 KB），其餘依賴走 node_modules

---

## env vars（Terraform 設定，見 lambda.tf）

| 變數 | 來源 | 說明 |
|---|---|---|
| `BUCKET_NAME` | `var.bucket_name` | S3 bucket（寫 jobs/）|
| `AWS_REGION` | Lambda runtime 自動注入 | S3Client region |

---

## Windows PowerShell 部署備忘（2026-06-04 PLAN_E7 M6 實證）

`build_and_push.sh` 設計給 bash 環境（WSL / Git Bash / Linux / macOS）。Windows PowerShell **不能直接 `bash` 跑**、需要手動翻成 PS 指令。以下三個 PS 環境特有卡點 + workaround、來自 deploy_worker 實戰：

### 1. PowerShell pipe encoding 把 ECR password mangle 成 400 Bad Request

**症狀**：
```
PS> aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR_URI>
Error response from daemon: login attempt to https://...amazonaws.com/v2/ failed with status: 400 Bad Request
```

**原因**：PowerShell pipe 把 stdout 重編碼（BOM / CRLF / UTF-16）、`docker login --password-stdin` 收到不對的 string。即使把 password 抓到變數再 pipe 也救不了。

**Workaround**：用 `cmd /c` 包整段、走 Windows cmd.exe pipe（不會 mangle）：

```powershell
cmd /c "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 654485222392.dkr.ecr.us-east-1.amazonaws.com"
```

應印 `Login Succeeded`。

### 2. Docker Desktop 4.x+ buildx OCI manifest 被 Lambda 拒收

**症狀**：
```
terraform apply 在 Lambda 步噴
InvalidParameterValueException: The image manifest, config or layer
media type for the source image ... is not supported
```

**原因**：Docker Desktop 4.x+ buildx 預設 export OCI manifest list + attestation manifest（看 push 輸出有 `exporting attestation manifest sha256:...` 行）、AWS Lambda runtime 只接受傳統 Docker v2 manifest、拒收 OCI。

**Workaround**：`docker build` 加兩個 flag、強制單一 manifest：

```powershell
docker build --provenance=false --platform=linux/amd64 -t tdcs-dl-cleaner:latest .
```

`build_and_push.sh` 已預設加上（PLAN_E7 M6 後修補）、所有環境一致。

### 3. PowerShell `curl.exe` JSON body 被 PS escape mangle

**症狀**：
```powershell
PS> curl.exe -X POST "$apiUrl/clean" -H "Content-Type: application/json" -d '{\"echo\":\"hello\"}'
# Lambda 回 {"error":"invalid JSON body"}
```

**原因**：PowerShell 處理 `'...'` / `\"` 規則與 bash 不一樣、`curl.exe` 收到的 body 字串可能多 / 少 backslash。

**Workaround**：body 寫進檔案、用 `--data-binary @file`：

```powershell
Set-Content body.json '{"echo":"hello"}'
curl.exe -X POST "$apiUrl/clean" -H "Content-Type: application/json" --data-binary "@body.json"
# 回 {"job_id":"<uuid>"}
```

### 完整 PowerShell 部署序列（M6 USER_RUN 版）

```powershell
# 0. 載入 .env
cd D:\p\mcp_workspace
Get-Content .env | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]*)=(.*)$") {
        Set-Item -Path "Env:$($Matches[1].Trim())" -Value $Matches[2].Trim()
    }
}
aws sts get-caller-identity  # 驗 Account=654485222392

# 1. ECR repo 建立（idempotent）
aws ecr create-repository --repository-name tdcs-dl-cleaner --region us-east-1

# 2. Lambda build
cd infra\lambda
npm install
npm run build

# 3. ECR login（workaround #1）
cmd /c "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 654485222392.dkr.ecr.us-east-1.amazonaws.com"

# 4. Docker build + push（workaround #2 已內建 build_and_push.sh、PS 手動跑要記得加 flag）
#    F-H4：用唯一 tag（git SHA）、不要固定 :latest，否則 terraform 偵測不到新 image。
$ecrUri = "654485222392.dkr.ecr.us-east-1.amazonaws.com"
$gitSha = (git rev-parse --short=12 HEAD)
$tag = if (git status --porcelain) { "$gitSha-dirty-$(Get-Date -Format yyyyMMddHHmmss)" } else { $gitSha }
docker build --provenance=false --platform=linux/amd64 -t "tdcs-dl-cleaner:$tag" .
docker tag "tdcs-dl-cleaner:$tag" "$ecrUri/tdcs-dl-cleaner:$tag"
docker push "$ecrUri/tdcs-dl-cleaner:$tag"
docker tag "tdcs-dl-cleaner:$tag" "$ecrUri/tdcs-dl-cleaner:latest"   # latest 供人工瀏覽
docker push "$ecrUri/tdcs-dl-cleaner:latest"

# 5. 寫 image_tag.auto.tfvars（餵 var.lambda_image_tag、terraform 自動載入）
cd ..\terraform
Set-Content image_tag.auto.tfvars "lambda_image_tag = `"$tag`""

# 6. Terraform（不必手加 -var / -replace、auto.tfvars 已帶 tag）
terraform init
terraform plan
terraform apply  # yes

# 7. Smoke test（workaround #3）
$apiUrl = terraform output -raw api_gw_url
Set-Content body.json '{"echo":"hello"}'
curl.exe -X POST "$apiUrl/clean" -H "Content-Type: application/json" --data-binary "@body.json"
# 拿到 job_id 後
curl.exe "$apiUrl/jobs/<JOB_ID>"

# 8. 備份 tfstate
Copy-Item terraform.tfstate $env:USERPROFILE\OneDrive\tdcs_tfstate_backup_$(Get-Date -Format yyyyMMdd_HHmmss).tfstate
```

WSL / Git Bash 環境可以直接跑 `bash build_and_push.sh`、不會遇到上面 3 個卡點。
