# -*- coding: utf-8 -*-
"""把 2026/01~05 M06A 下載 + gzip 上傳到 s3://112021024/

依序對 2026/01~05 跑：
  1. D:\\p\\112021134\\download_only_2025.py     (本機台灣 IP 抓 TDCS、月份完整才寫 _READY)
  2. D:\\p\\112021134\\upload_month_gz.py        (gzip 多執行緒上傳、head_object 去重、上傳後刪本機)

AWS 認證來源：`mcp_workspace/.env` (唯一 source of truth、跑前刷新即可、不用手動同步到 D:\\p\\112021134\\.env)

執行：
    cd D:\\p\\TDCSprecentater\\mcp_workspace
    python scripts/backfill_s3_2026.py                # 跑全部 5 個月
    python scripts/backfill_s3_2026.py --months 02 03  # 只跑指定月份
    python scripts/backfill_s3_2026.py --dry-run       # 只驗證認證、不下載

Idempotent：每月可重跑、download / upload 各自會 skip 已存在檔。

Token 過期處理：
    1. 看到 ExpiredToken 錯誤 → 從 Learner Lab Console 取新 token
    2. 改 mcp_workspace/.env 的 AWS_ACCESS_KEY_ID / SECRET / SESSION_TOKEN 三行
    3. 重跑此腳本、會從上次失敗的月份接續（idempotent）
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

# ── config ───────────────────────────────────────────────────────────────────

WORKSPACE = Path(__file__).resolve().parents[1]   # mcp_workspace/
ENV_FILE = WORKSPACE / ".env"
DOWNLOAD_DIR = Path(r"D:\p\112021134")

YEAR = "2026"
ALL_MONTHS = ["01", "02", "03", "04", "05"]
BUCKET = "112021024"

# Keys that may appear lowercase in .env (AWS CLI expects uppercase)
AWS_KEY_ALIASES = {
    "aws_access_key_id", "aws_secret_access_key", "aws_session_token",
    "aws_region", "aws_default_region", "aws_account_id",
}


# ── helpers ──────────────────────────────────────────────────────────────────

def load_env(path: Path) -> dict[str, str]:
    """Read .env, normalize AWS keys to uppercase, strip inline `#` comments."""
    if not path.is_file():
        sys.exit(f"[error] {path} not found")

    env: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        # Strip inline comment; quoted values not currently used in our .env so safe
        v = v.split("#", 1)[0].strip()
        if not k or not v:
            continue
        if k.lower() in AWS_KEY_ALIASES:
            k = k.upper()
        env[k] = v
    return env


def verify_aws(env: dict[str, str]) -> None:
    """Pre-flight: ensure session token is alive before launching long jobs."""
    p = subprocess.run(
        ["aws", "sts", "get-caller-identity"],
        env={**os.environ, **env},
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        sys.exit(
            "[error] AWS auth failed:\n"
            f"{p.stderr.strip()}\n"
            "→ Learner Lab token 過期、回 mcp_workspace/.env 刷新後重跑"
        )
    print(f"[ok] AWS auth: {p.stdout.strip()}")


def run_month(year: str, month: str, env: dict[str, str]) -> bool:
    """Download + gzip-upload one month. Idempotent."""
    sub_env = {
        **os.environ,
        **env,
        "YEAR": year,
        "MONTH": month,
        "S3_BUCKET": BUCKET,
        "LOCAL_ROOT_NAME": "112021134",
        "WORKERS": "8",
        "DELETE_LOCAL": "1",
        "RUN_ONCE": "1",
    }

    print(f"\n{'='*60}\n {year}/{month} ─ download (download_only_2025.py)\n{'='*60}")
    p = subprocess.run(
        [sys.executable, "download_only_2025.py"],
        env=sub_env, cwd=DOWNLOAD_DIR,
    )
    if p.returncode != 0:
        print(f"[fail] download {year}/{month} (exit={p.returncode})")
        return False

    print(f"\n{'='*60}\n {year}/{month} ─ upload gzip (upload_month_gz.py)\n{'='*60}")
    p = subprocess.run(
        [sys.executable, "upload_month_gz.py"],
        env=sub_env, cwd=DOWNLOAD_DIR,
    )
    if p.returncode != 0:
        print(f"[fail] upload {year}/{month} (exit={p.returncode})")
        return False

    return True


def verify_bucket(env: dict[str, str]) -> None:
    """Print final bucket summary."""
    p = subprocess.run(
        ["aws", "s3", "ls", f"s3://{BUCKET}/",
         "--recursive", "--summarize", "--human-readable"],
        env={**os.environ, **env},
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        print(f"[warn] bucket ls failed: {p.stderr.strip()}")
        return

    # Show last 5 lines (summary block) + per-month counts
    lines = p.stdout.splitlines()
    print(f"\n{'='*60}\n Bucket: s3://{BUCKET}/ ─ summary\n{'='*60}")
    for line in lines[-3:]:
        print(line)

    print(f"\n[detail] file count per month prefix:")
    for month in ALL_MONTHS:
        prefix = f"{YEAR}{month}/"
        count = sum(1 for ln in lines if f" {prefix}" in ln)
        expected = {"01": 31, "02": 28, "03": 31, "04": 30, "05": 27}.get(month, 0) * 24
        flag = "✅" if count == expected else f"⚠️  expected ~{expected}"
        print(f"  {prefix}: {count} files  {flag}")


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--months", nargs="+", default=ALL_MONTHS,
                        help=f"哪幾個月跑 (預設 {ALL_MONTHS})")
    parser.add_argument("--dry-run", action="store_true",
                        help="只驗證 AWS 認證、不跑下載 / 上傳")
    args = parser.parse_args()

    env = load_env(ENV_FILE)
    verify_aws(env)

    if args.dry_run:
        print("[dry-run] AWS 認證 OK、跳過下載 / 上傳")
        verify_bucket(env)
        return 0

    failed: list[str] = []
    for month in args.months:
        if month not in ALL_MONTHS:
            print(f"[skip] unknown month {month!r}")
            continue
        ok = run_month(YEAR, month, env)
        if not ok:
            failed.append(f"{YEAR}/{month}")
            ans = input(f"[?] {YEAR}/{month} 失敗。繼續下個月? (y/N): ").strip().lower()
            if ans != "y":
                break

    verify_bucket(env)

    if failed:
        print(f"\n[warn] {len(failed)} month(s) failed: {failed}")
        return 1
    print(f"\n[ok] all months processed: {args.months}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
