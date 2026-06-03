# cli/src/lib — endpoint 抽象設計（PLAN_E6 M6+M7）

## 為什麼要 endpoint 抽象

`tdcs-dl` CLI 要打 AWS backend（API Gateway + Lambda），但：

1. **不能 hardcode 真實 URL**：開源 npm 套件如果寫死 `https://abc123.execute-api.us-east-1.amazonaws.com/`、其他 user clone IaC 自架的 AWS 帳號就用不了
2. **不能要求 user 永遠帶參數**：`tdcs-dl pull --endpoint https://...` 每次都打太煩
3. **dev / staging / prod 切換需要彈性**：env var override 是標準做法

對應 PLAN_E5 M4 D6 鎖板：「**hardcode default + config 留彈性**」。

## 三層 priority

```
process.env.TDCS_DL_ENDPOINT    （臨時 override、不寫盤）
        ↓ fallthrough
~/.tdcs-dl/config.json          （user 永久設定、tdcs-dl config set-endpoint 寫入）
        ↓ fallthrough
DEFAULT_ENDPOINT                （hardcoded、PLAN_E7 部署後改正）
```

實作見 `config.ts::resolveEndpoint()`。

## 為什麼選 `~/.tdcs-dl/config.json`（不是專案 local）

- CLI 是 npm global install (`npm i -g tdcs-dl`)、不該污染 user 任一專案目錄
- 跨專案、跨 shell session 持久
- 與 `~/.aws/config`、`~/.npmrc`、`~/.docker/config.json` 等慣例對齊

## 環境變數一覽

| Env var | 作用 | 何時用 |
|---|---|---|
| `TDCS_DL_ENDPOINT` | 臨時 override endpoint | dev/staging 一次性測試、CI |
| `TDCS_DL_CONFIG_DIR` | 重定向 config dir（預設 `~/.tdcs-dl/`）| CI / test 隔離、user 自訂位置 |

## subcommand 對映

| Command | 對應 lib 函式 |
|---|---|
| `tdcs-dl config set-endpoint <url>` | `setEndpoint(url)` — 含 URL 驗證、保留既有欄位 |
| `tdcs-dl config get-endpoint` | `resolveEndpoint()` — 印 value + source |
| `tdcs-dl config show` | `getShowView()` — 印全 config + 每欄來源 |
| `tdcs-dl config reset` | `resetConfig()` — 刪 config.json |

## 安全性 / 邊界

- **URL 驗證**：只接受 `http://` / `https://`，拒 `ftp:` / `javascript:` 等
- **原子寫**：`saveConfigFile` 走 temp + rename，避免 ctrl-c 中斷產生半寫檔
- **不存敏感資料**：endpoint 公開 URL、profile 名稱（無 token / secret）；AWS 認證走 `~/.aws/` 標準鏈、不放本檔
- **多進程同寫**：暫不做檔鎖（PLAN_E11 評估是否需要）

## 後續

- PLAN_E7 部署 AWS → 把 `DEFAULT_ENDPOINT` 改成實際 API GW URL
- PLAN_E8~E10 業務 subcommand 透過 `resolveEndpoint()` 取得 base URL、不直接讀 env / file
