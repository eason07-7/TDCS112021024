# -----------------------------------------------------------------------
# M4.5 — SQS broker for async clean jobs (Sync→Async refactor)
#
# Why (opus_worker_2 finding, Lead+User ratified — see 實驗紀錄9 M4.5):
#   API Gateway HTTP API integration timeout caps at 30s, but a real
#   month-scale clean takes 5-8 min. Producer–consumer split:
#     POST /clean (API GW) → fast SQS SendMessage → return 202  (< 1s)
#     SQS event → Lambda runs the real clean → writes done to jobs/<id>.json
#
# Why SQS (B) not self-invoke (A) / CLI-direct-invoke (C):
#   A (Lambda async self-invoke) — no built-in retry/DLQ, hand-rolled debt.
#   C (CLI calls lambda:InvokeFunction direct) — leaks AWS creds to clients,
#     must be torn out before PLAN_E11 public npm release.
#   B (SQS) — managed retry + visibility + DLQ, same Lambda, no client AWS creds.
#
# IAM note (Learner Lab): LabRole must allow sqs:SendMessage (producer) +
#   sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes (event source mapping).
#   These are in LabRole's standard policy; if apply fails on SQS perms, STOP.
# -----------------------------------------------------------------------

# Dead-letter queue: messages that fail maxReceiveCount land here for inspection.
resource "aws_sqs_queue" "clean_jobs_dlq" {
  name                      = "tdcs-dl-clean-jobs-dlq"
  message_retention_seconds = 1209600 # 14 days (max) — keep failures for debugging
}

# Main work queue.
resource "aws_sqs_queue" "clean_jobs" {
  name = "tdcs-dl-clean-jobs"
  # Must exceed the Lambda timeout (900s) so a message isn't redelivered while
  # the consumer is still legitimately working; +20s buffer.
  visibility_timeout_seconds = 920
  message_retention_seconds  = 86400 # 1 day

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.clean_jobs_dlq.arn
    maxReceiveCount     = 2 # 1 retry after the first failure, then → DLQ
  })
}

# Wire SQS → existing cleaner Lambda. batch_size=1: one clean job per invoke
# (a single month is already a 5-8 min unit of work; batching would risk timeout).
resource "aws_lambda_event_source_mapping" "sqs_to_cleaner" {
  event_source_arn                   = aws_sqs_queue.clean_jobs.arn
  function_name                      = aws_lambda_function.cleaner.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 0
}
