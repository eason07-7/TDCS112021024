# -----------------------------------------------------------------------
# outputs — 值由 M2-M5 各 .tf 填入後才有意義
# -----------------------------------------------------------------------

output "api_gw_url" {
  description = "API Gateway HTTP API invoke URL"
  value       = aws_apigatewayv2_api.tdcs_dl.api_endpoint
}

output "s3_bucket_name" {
  description = "主要 S3 bucket 名稱"
  value       = data.aws_s3_bucket.main.bucket
}

output "glue_db_name" {
  description = "Glue Data Catalog database 名稱"
  value       = aws_glue_catalog_database.tdcs_dl.name
}

output "glue_table_name" {
  description = "Glue Data Catalog table 名稱（Athena 查詢用）"
  value       = aws_glue_catalog_table.cleaned_v2_skeleton.name
}

output "lambda_function_name" {
  description = "Lambda 函式名稱"
  value       = aws_lambda_function.cleaner.function_name
}

output "lambda_function_arn" {
  description = "Lambda 函式 ARN（API GW integration 用）"
  value       = aws_lambda_function.cleaner.arn
}

output "athena_workgroup" {
  description = "Athena workgroup 名稱"
  value       = aws_athena_workgroup.tdcs_dl_wg.name
}

# M4.5 — async clean broker
output "sqs_clean_jobs_url" {
  description = "SQS 工作佇列 URL（API GW handler SendMessage 目標）"
  value       = aws_sqs_queue.clean_jobs.url
}

output "sqs_clean_jobs_dlq_url" {
  description = "SQS 死信佇列 URL（失敗 maxReceiveCount 後的訊息）"
  value       = aws_sqs_queue.clean_jobs_dlq.url
}
