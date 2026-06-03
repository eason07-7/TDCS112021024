# -----------------------------------------------------------------------
# F-H3 gate — Cost / abuse guard
#
# Two layers:
#   1. aws_budgets_budget   — $5 monthly alert (global service, us-east-1)
#   2. aws_cloudwatch_metric_alarm — Lambda invocation spike guard
#
# NOTE for Learner Lab deployment:
#   `aws_budgets_budget` requires Budgets permissions (may be restricted).
#   If `terraform apply` fails with "not authorized to perform: budgets:*",
#   comment out the aws_budgets_budget block and rely on the CloudWatch alarm.
#
# Email config（PLAN_E9 M6 Lead 變數化、避免 email 進 git history）：
#   email 來源 = var.budget_alert_email、預設空字串。
#   deploy 前在 infra/terraform/terraform.tfvars（已 .gitignore）寫一行：
#     budget_alert_email = "你的真實 email"
#   空字串 → notification 仍會建、但 subscriber 為空（不會寄通知、不噴錯）。
# -----------------------------------------------------------------------

# ── 1. AWS Budgets: $5 monthly cost alert ────────────────────────────────
#
# Budgets is a global service always in us-east-1.
# The `aws` provider here already points to us-east-1 (MASTER_PLAN §0 lock).

resource "aws_budgets_budget" "lab_cost_guard" {
  name         = "tdcs-dl-lab-guard"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_email != "" ? [var.budget_alert_email] : []
  }
}

# ── 2. CloudWatch alarm: Lambda invocations spike (complements Budget) ───
#
# Fires if Lambda is called > 500 times in any 1-hour window.
# No SNS topic configured (visible in Console + can add later).
# Works in Learner Lab regardless of Budget API availability.

resource "aws_cloudwatch_metric_alarm" "lambda_invocations_guard" {
  alarm_name          = "tdcs-dl-lambda-invocations-guard"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Invocations"
  namespace           = "AWS/Lambda"
  period              = 3600   # 1 hour window
  statistic           = "Sum"
  threshold           = 500    # > 500 calls/hour = suspicious activity
  alarm_description   = "F-H3 gate: alert on excessive Lambda invocations (possible abuse). Action: inspect CloudWatch logs."

  dimensions = {
    FunctionName = aws_lambda_function.cleaner.function_name
  }

  treat_missing_data = "notBreaching"
}
