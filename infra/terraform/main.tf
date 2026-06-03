provider "aws" {
  region = var.aws_region

  # Learner Lab 用 session token（env var 注入）：
  #   export AWS_ACCESS_KEY_ID=...
  #   export AWS_SECRET_ACCESS_KEY=...
  #   export AWS_SESSION_TOKEN=...
  # 不要把 credentials 硬寫進 .tf 檔（禁 commit secret）
}

# -----------------------------------------------------------------------
# data：引用既有 AWS 資源（Terraform 不建、只讀）
# -----------------------------------------------------------------------

# 既有 S3 bucket（2026-05-28 已建、Terraform 管理 prefix markers）
data "aws_s3_bucket" "main" {
  bucket = var.bucket_name
}

# 既有 LabRole（Learner Lab 預設、Terraform 不建 IAM role）
data "aws_iam_role" "lab_role" {
  name = "LabRole"
}

# ECR repo（M6 [USER_RUN] 手動建後 Terraform 引用）
data "aws_ecr_repository" "cleaner" {
  name = "tdcs-dl-cleaner"
}
