# -----------------------------------------------------------------------
# M2 — S3 prefix markers
# bucket 本身已存在（data.aws_s3_bucket.main 在 main.tf 引用）
# Terraform 只建 4 個空物件作為 prefix 標記
# 不設 bucket policy / lifecycle（PLAN_E11 才補）
# -----------------------------------------------------------------------

resource "aws_s3_object" "raw_marker" {
  bucket       = data.aws_s3_bucket.main.id
  key          = "raw/.gitkeep"
  content      = ""
  content_type = "text/plain"
}

resource "aws_s3_object" "cleaned_v2_marker" {
  bucket       = data.aws_s3_bucket.main.id
  key          = "cleaned_v2/.gitkeep"
  content      = ""
  content_type = "text/plain"
}

resource "aws_s3_object" "jobs_marker" {
  bucket       = data.aws_s3_bucket.main.id
  key          = "jobs/.gitkeep"
  content      = ""
  content_type = "text/plain"
}

resource "aws_s3_object" "athena_results_marker" {
  bucket       = data.aws_s3_bucket.main.id
  key          = "athena-results/.gitkeep"
  content      = ""
  content_type = "text/plain"
}
