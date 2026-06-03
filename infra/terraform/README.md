# tdcs-dl infra — Terraform

> PLAN_E7：API GW + Lambda + S3 + Athena + Glue Data Catalog
> Region: us-east-1（Learner Lab 強制）

---

## 快速啟動

### 1. 設定 AWS credentials（Learner Lab session token）

從 `mcp_workspace/.env` 取 token 後 export：

```bash
# PowerShell
$env:AWS_ACCESS_KEY_ID     = (Get-Content mcp_workspace/.env | Select-String '^aws_access_key_id=').Line.Split('=',2)[1]
$env:AWS_SECRET_ACCESS_KEY = (Get-Content mcp_workspace/.env | Select-String '^aws_secret_access_key=').Line.Split('=',2)[1]
$env:AWS_SESSION_TOKEN     = (Get-Content mcp_workspace/.env | Select-String '^aws_session_token=').Line.Split('=',2)[1]
$env:AWS_DEFAULT_REGION    = 'us-east-1'

# 確認
aws sts get-caller-identity
# 應印 Account: 654485222392
```

### 2. 準備 tfvars

```bash
cd mcp_workspace/infra/terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 預設值與 example 相同，Lab demo 不需修改
```

### 3. 初始化

```bash
terraform init
```

### 4. 預覽變更

```bash
terraform plan
```

### 5. 部署（M6 [USER_RUN]）

```bash
terraform apply
```

---

## Lab token 過期怎麼辦（每 4 小時）

1. 到 Learner Lab 網頁刷新 session token
2. 更新 `mcp_workspace/.env`（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN）
3. 重新 export（見步驟 1）
4. 確認 `aws sts get-caller-identity` 回 Account=654485222392
5. 重跑 `terraform plan`（local backend 不受 lock 影響）

---

## 為什麼用 local backend？

Learner Lab 的 session token 每 4 小時過期。

| backend | Lab 場景問題 |
|---|---|
| **S3 remote backend** | state lock key 用 DynamoDB 管理，token 過期後 lock 殘留，下次 `terraform plan` 被擋（需手動刪 lock item）|
| **local backend** | state 存在本機 `terraform.tfstate`，不涉及外部 lock，token 過期 → 換 → 直接繼續 |

**trade-off**：local state 不支援多人協作、搬機器要手動 copy state。
正式 AWS（非 Learner Lab）應升 S3 backend + DynamoDB lock table。

---

## M6 [USER_RUN] 前置步驟

```bash
# 步驟 0：建 ECR repo（Terraform 引用它、不建它）
aws ecr create-repository \
  --repository-name tdcs-dl-cleaner \
  --region us-east-1

# 步驟 1：build + push Lambda container image
bash mcp_workspace/infra/lambda/build_and_push.sh

# 步驟 2：terraform apply
cd mcp_workspace/infra/terraform
terraform apply
```

---

## 目錄結構說明

| 檔案 | 內容 | milestone |
|---|---|---|
| `versions.tf` | Terraform / provider 版本鎖定 + local backend | M1 |
| `variables.tf` | 4 個鎖板變數（region / account / bucket / role）| M1 |
| `main.tf` | provider + data 引用現有資源 | M1 |
| `outputs.tf` | 輸出值殼（api_gw_url 等，M4-M5 填）| M1 |
| `s3.tf` | S3 prefix marker 物件 | M2 |
| `lambda.tf` | Lambda Container 函式 | M3 |
| `apigw.tf` | API GW HTTP API + 2 routes | M4 |
| `glue.tf` | Glue DB + table skeleton | M5 |
| `athena.tf` | Athena workgroup（10 MB scan cap）| M5 |
