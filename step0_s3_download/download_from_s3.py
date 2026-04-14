# -*- coding: utf-8 -*-
"""Step 0 - 從 AWS S3 下載 TDCS M06A 2026/03 原始 CSV。

S3 layout (由 upload_only_2025.py 建立):
  s3://<S3_BUCKET>/202603/*.csv

輸出:
  step0_s3_download/raw_202603/*.csv

讀取同層 .env：
  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / (AWS_SESSION_TOKEN) / AWS_REGION
  S3_BUCKET
  S3_PREFIX (選，預設 202603)
  SKIP_IF_EXISTS (選，預設 1)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError, PartialCredentialsError


def load_dotenv_file(dotenv_path: str) -> None:
    if not os.path.isfile(dotenv_path):
        return
    with open(dotenv_path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if (val.startswith('"') and val.endswith('"')) or (
                val.startswith("'") and val.endswith("'")
            ):
                val = val[1:-1]
            os.environ.setdefault(key, val)


SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv_file(str(SCRIPT_DIR / ".env"))

# Learner Lab .env 常把 session token 寫成小寫 aws_session_token；boto3 只吃大寫
if os.environ.get("aws_session_token") and not os.environ.get("AWS_SESSION_TOKEN"):
    os.environ["AWS_SESSION_TOKEN"] = os.environ["aws_session_token"]

S3_BUCKET = os.environ.get("S3_BUCKET", "").strip()
S3_PREFIX = os.environ.get("S3_PREFIX", "202603").strip().strip("/")
SKIP_IF_EXISTS = os.environ.get("SKIP_IF_EXISTS", "1").strip() == "1"
OUT_DIR = SCRIPT_DIR / "raw_202603"


def main() -> int:
    if not S3_BUCKET:
        print("[error] .env 缺少 S3_BUCKET", file=sys.stderr)
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[s3] bucket={S3_BUCKET} prefix={S3_PREFIX}/")
    print(f"[s3] out_dir={OUT_DIR}")

    try:
        s3 = boto3.client("s3")
    except (NoCredentialsError, PartialCredentialsError) as e:
        print(f"[error] AWS credentials 無效: {e}", file=sys.stderr)
        return 3

    paginator = s3.get_paginator("list_objects_v2")
    total = 0
    downloaded = 0
    skipped = 0

    try:
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=f"{S3_PREFIX}/"):
            for obj in page.get("Contents", []) or []:
                key = obj["Key"]
                if not key.lower().endswith(".csv"):
                    continue
                total += 1
                fname = os.path.basename(key)
                if not fname:
                    continue
                local_path = OUT_DIR / fname
                remote_size = int(obj.get("Size", -1))

                if SKIP_IF_EXISTS and local_path.is_file():
                    try:
                        if local_path.stat().st_size == remote_size:
                            skipped += 1
                            continue
                    except OSError:
                        pass

                s3.download_file(S3_BUCKET, key, str(local_path))
                downloaded += 1
                if downloaded % 20 == 0:
                    print(f"  已下載 {downloaded} 個檔案 (skip={skipped}, total_seen={total})", flush=True)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        print(f"[error] S3 ClientError code={code} msg={e}", file=sys.stderr)
        return 4

    print(f"[done] total={total} downloaded={downloaded} skipped={skipped}")
    print(f"[done] raw CSV -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
