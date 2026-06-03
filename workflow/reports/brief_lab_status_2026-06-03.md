# Lab 狀態 sanity check — 2026-06-03（PLAN_E7 啟動前）

> 執行：sonnet_worker / 主 Lead：Opus
> 目的：驗證 Learner Lab 654485222392 / us-east-1 / bucket 112021024 是否可進 PLAN_E7 M1
> 結論：✅ AWS 9 項全綠 / ⚠️ 本機工具 Terraform + Docker 未安裝，**M6 [USER_RUN] 前需先安裝**

---

## §1 驗證結果

| # | 項目 | 結果 | 證據（stdout） | 阻擋 M1-M5? |
|---|---|---|---|---|
| 1 | AWS credentials | ✅ | `Account: 654485222392, Arn: arn:aws:sts::654485222392:assumed-role/voclabs/user5013049=112021024@live.asia.edu.tw` | 否 |
| 2 | Region us-east-1 可達 | ✅ | `us-east-1` | 否 |
| 3 | S3 bucket `112021024` 可讀 | ✅ | `PRE 202603/ PRE 202604/`（2 prefix 可見）| 否 |
| 4 | S3 bucket 可寫（測寫即刪）| ✅ | `upload: - to s3://112021024/_sanity_check_ping.txt` + `delete: s3://112021024/_sanity_check_ping.txt` | 否 |
| 5 | IAM LabRole 存在 | ✅ | `arn:aws:iam::654485222392:role/LabRole` | 否 |
| 6 | Lambda service 可達 | ✅ | `["ModLabRole"]`（現有 1 個函式，無 AccessDenied）| 否 |
| 7 | API GW v2 可達 | ✅ | `[]`（無現有 API，符合預期）| 否 |
| 8 | Glue Data Catalog 可達 | ✅ | `["default"]`（有 default database）| 否 |
| 9 | Athena 可達 | ✅ | `["primary"]`（primary workgroup 存在）| 否 |
| 10 | Terraform ≥ 1.6 | ❌ | `command not found`（Bash + PowerShell 皆無）| **M6 [USER_RUN] 需安裝** |
| 11 | Docker daemon 在跑 | ❌ | `command not found`（Bash + PowerShell 皆無）| **M6 [USER_RUN] 需安裝** |
| 12 | aws CLI v2 | ✅ | `aws-cli/2.34.37 Python/3.14.4 Windows/11 exe/AMD64` | 否 |

**AWS 服務 9/9 PASS。本機工具 1/3 PASS（aws CLI OK；Terraform + Docker 未裝）。**

---

## §2 ECR repo `tdcs-dl-cleaner`

- **存在**：❌（RepositoryNotFoundException in account 654485222392 us-east-1）
- **repositoryUri**：尚無
- **動作**：M6 [USER_RUN] `aws ecr create-repository --repository-name tdcs-dl-cleaner` 建立後，`build_and_push.sh` 取用 URI

---

## §3 FAIL / 警告項詳述

### ⚠️ 帳號切換（本次跑前一次 token 給錯）

上一次 `sts get-caller-identity` 曾回：
```
Account: 731714568222 (user 112021161)
```
導致 S3 AccessDenied（不同帳號的 bucket）。User 已換回正確 token，確認 Account = 654485222392 ✅。**請確保每次刷 Lab token 都用同一個學號（112021024）的 Learner Lab session**，避免跨帳號存取失敗。

### ❌ #10 Terraform 未安裝

```
terraform: command not found  (Bash + PowerShell)
```
- **影響**：M6 [USER_RUN] 的 `terraform init/fmt/validate/plan/apply` 完全跑不了
- **不影響** M1-M5（只是寫 .tf 檔案文字，不需 terraform 執行）
- **緩解**：安裝方式見 §4

### ❌ #11 Docker 未安裝（或 daemon 未跑）

```
docker: command not found  (Bash + PowerShell)
```
- **影響**：M3 Lambda Container 的 `docker build` + `docker push` 到 ECR 無法跑（[USER_RUN]）
- **不影響** M1-M2 / M4-M5（純 Terraform 寫法，不涉及 Docker）
- **緩解**：安裝 Docker Desktop（Windows），或啟動已安裝的 Docker 服務

---

## §4 結論

- **可否進 PLAN_E7 M1-M5（Terraform 文件寫作）？ ✅ 可以**
  - AWS 9 項全綠，sonnet_worker 可直接開始寫 `infra/terraform/*.tf` 文件
  - M1-M5 是純文件寫作任務，不需本地 Terraform/Docker 執行

- **M6 [USER_RUN] 前 User 需補裝**：
  1. **Terraform ≥ 1.6**：
     - Windows 推薦用 [tfenv](https://github.com/tfutils/tfenv) 或直接下載 binary 放進 PATH
     - 或用 `winget install Hashicorp.Terraform`
  2. **Docker Desktop**：
     - 下載 [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)
     - 安裝後啟動 daemon，確認 `docker version` 有 Server Version
  3. **ECR repo 建立**（M6 前手動一次）：
     ```bash
     aws ecr create-repository --repository-name tdcs-dl-cleaner --region us-east-1
     ```

- **Lab token 換號注意**：請確保每次都用學號 112021024 的 Learner Lab session，避免帳號混用。

---

## §5 對 PLAN_E7 風險登記的補充

PLAN_E7 §8 風險表已有 11 條，但以下未列：

| 補充風險 | 緩解建議 |
|---|---|
| **本機 Terraform + Docker 未裝，M6 被擋**（新發現）| User 在 M1-M5 期間（~4-5 hr）並行安裝 Terraform + Docker Desktop，不卡 critical path |
| **Lab session 帳號混用（431-731 帳號切換）**（本次實證）| 每次刷 token 確認 `sts get-caller-identity` 回 Account=654485222392；加進 M6 [USER_RUN] checklist |
| **ECR repo 需先手動建（非 Terraform 管）** | PLAN_E7 M3 已有 build_and_push.sh，但 ECR repo 本身需 aws cli 手動建（LabRole 有 ECR 權限）；加進 M6 [USER_RUN] 步驟第 0 項 |
