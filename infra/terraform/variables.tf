# -----------------------------------------------------------------------
# 所有值均由 MASTER_PLAN §0 鎖板決定；Learner Lab 強制 us-east-1。
# mcp_workspace/CLAUDE.md 寫的 ap-northeast-1 是 v1 stale，以本檔為準。
# -----------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region (Learner Lab 強制 us-east-1、不可改)"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "Learner Lab account ID"
  type        = string
  default     = "654485222392"
}

variable "bucket_name" {
  description = "既有 S3 bucket 名稱（已存在、Terraform 以 data 引用、不重建）"
  type        = string
  default     = "112021024"
}

variable "lambda_execution_role" {
  description = "Lambda execution role ARN（Learner Lab 既有 LabRole、不建 IAM）"
  type        = string
  default     = "arn:aws:iam::654485222392:role/LabRole"
}

variable "lambda_image_tag" {
  description = "ECR image tag for Lambda container (e.g. 'latest' or commit SHA)"
  type        = string
  default     = "latest"
}

variable "budget_alert_email" {
  description = "AWS Budgets / CloudWatch alarm 通知 email（不進 git、user 自己寫 terraform.tfvars）"
  type        = string
  default     = ""
}
