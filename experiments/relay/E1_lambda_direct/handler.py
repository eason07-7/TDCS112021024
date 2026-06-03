# -*- coding: utf-8 -*-
"""E1 — us-east-1 Lambda 直連 TDCS

Test 假設：us-east-1 Lambda 對外 IP 在美東、被 TDCS 阻擋。
此實驗紀錄具體失敗模式（403 / timeout / connection refused / SSL）。

紀錄欄位：
- ip_check：對外 IP（看 Lambda 從哪個 IP 出去）
- 3 個 URL：根頁面 → TDCS dir → 實際 csv，看擋在哪一層
"""
from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.request


def _http_get(url: str, timeout: int = 30) -> dict:
    start = time.time()
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "tdcs-dl-e1-test/0.1"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(500)
            return {
                "url": url,
                "ok": True,
                "status": r.status,
                "elapsed_ms": int((time.time() - start) * 1000),
                "content_type": r.headers.get("Content-Type"),
                "content_length": r.headers.get("Content-Length"),
                "body_preview": body.decode("utf-8", errors="replace")[:200],
            }
    except urllib.error.HTTPError as e:
        body = b""
        try:
            body = e.read(500)
        except Exception:
            pass
        return {
            "url": url,
            "ok": False,
            "kind": "HTTPError",
            "status": e.code,
            "reason": str(e.reason),
            "elapsed_ms": int((time.time() - start) * 1000),
            "body_preview": body.decode("utf-8", errors="replace")[:200] if body else "",
        }
    except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
        return {
            "url": url,
            "ok": False,
            "kind": type(e).__name__,
            "error": str(e),
            "elapsed_ms": int((time.time() - start) * 1000),
        }
    except Exception as e:
        return {
            "url": url,
            "ok": False,
            "kind": type(e).__name__,
            "error": str(e),
            "elapsed_ms": int((time.time() - start) * 1000),
        }


def lambda_handler(event, context):
    ip_check = _http_get("https://api.ipify.org?format=json", timeout=5)

    test_urls = [
        ("root", "https://tisvcloud.freeway.gov.tw/"),
        ("tdcs_dir", "https://tisvcloud.freeway.gov.tw/history/TDCS/"),
        (
            "m06a_csv",
            "https://tisvcloud.freeway.gov.tw/history/TDCS/M06A/20260301/00/TDCS_M06A_20260301_000000.csv",
        ),
    ]

    targets = [{"name": name, **_http_get(url)} for name, url in test_urls]

    return {
        "exp": "E1_lambda_direct",
        "ip_check": ip_check,
        "targets": targets,
    }
