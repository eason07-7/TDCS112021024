terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Local backend: Lab 4hr session token 跨 session 不持久。
  # S3 remote backend 的 state lock 在 session 過期後會殘留 lock key、下次 plan 被擋。
  # 正式 AWS (非 Learner Lab) 才升 S3 backend。
  # trade-off 詳見 README.md §「為什麼 local backend」
  backend "local" {}
}
