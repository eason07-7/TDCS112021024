# -----------------------------------------------------------------------
# M5 — Athena workgroup
# workgroup: tdcs-dl-wg
# bytes_scanned_cutoff_per_query = 10485760 (10 MB)
# enforce_workgroup_configuration = true（防 client bypass scan limit）
# -----------------------------------------------------------------------

resource "aws_athena_workgroup" "tdcs_dl_wg" {
  name        = "tdcs-dl-wg"
  description = "TDCS CLI 查詢 workgroup（10 MB scan cap、Lambda /query 用）"

  configuration {
    result_configuration {
      output_location = "s3://${var.bucket_name}/athena-results/"
    }

    # 10 MB = 10 * 1024 * 1024 (HCL literal only, no arithmetic)
    bytes_scanned_cutoff_per_query     = 10485760
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true
  }
}
