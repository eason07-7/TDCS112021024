# -----------------------------------------------------------------------
# M3 — Lambda Container（Node.js 20 + hello world handler）
# ECR image: tdcs-dl-cleaner:latest（M6 [USER_RUN] docker build + push 後才存在）
# Lambda 使用既有 LabRole（不建 IAM role）
# -----------------------------------------------------------------------

# CloudWatch Log Group（先建、確保 Lambda 有地方寫 log）
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/tdcs-dl-cleaner"
  retention_in_days = 7
}

resource "aws_lambda_function" "cleaner" {
  function_name = "tdcs-dl-cleaner"
  role          = var.lambda_execution_role
  package_type  = "Image"
  image_uri     = "${data.aws_ecr_repository.cleaner.repository_url}:${var.lambda_image_tag}"
  memory_size   = 1024
  timeout       = 60 # hello world 用；PLAN_E9 真清洗時升至 900（15 min Lambda max）

  environment {
    variables = {
      BUCKET_NAME = var.bucket_name
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_logs]
}
