# PLAN_E5 — 前置作業總清算 + 架構鎖板（v2、2026-06-02 pivot 重寫）

> **關鍵成果**：6/2 完成 mcp_workspace v2 全鎖板 — 從「MCP server + RAG」pivot 到「CLI + AWS backend」；7 跳板實驗對照 4 指標、Winner = E6 純 client-side（PoC 已通過、零跳板費）、Backup = E5 nginx + CF tunnel；M4 鎖板 3 決策（E6+E5 / 純 Lambda / endpoint hardcode default + config 留彈性）；MASTER_PLAN §1-§11 全重寫 499 行、grep 7 舊關鍵字違規 = 0；PLAN_E6~E13 共 8 個 PLAN roadmap 鎖定。產出 3 份 brief（資料盤點 + 跳板實驗 + roadmap 內嵌 MASTER_PLAN §4）、8 個事件、紀錄完整。
> **對應紀錄**：`workflow/實驗紀錄5.md`
> **編號說明**：沿用舊序（mcp_workspace 已有 `實驗記錄.md` / `實驗紀錄2/3/4.md` 在 logs/、v0.6 從 5 起接續）
> **v2 修訂**：2026-06-02 User pivot 砍 MCP / RAG、改做 CLI + AWS backend。M1 已完成、M2~M6 全部重新對焦新方向。

---

## 背景

### v1（2026-06-02 上午）

5/28 session 鎖了 §0 級決策（scope / RAG / region / 路由 / client / worker / 時程 / AWS 實體）但 `MASTER_PLAN.md §1-§10` 仍是 2026-05-06 舊版（EC2 東京、個人帳號、Claude Desktop、PLAN_M 命名…等），§0 vs §1-§10 至少 10 條衝突，照舊版直接跑下一個 PLAN_E6 通用化會踩雷。同時還有三件事沒清：

1. **資料盤點不齊**：TDCS 全產品（M03A/M04A/M05A/M06A/M07A）schema 與下載腳本散在 ai_workspace + `D:\p\112021134\`、112021134 帳號 S3 既有資料量 / 內容、112021024 (654485222392) 帳號 S3 既有 28 天月份未確認進度版本
2. **Learner Lab 能力未證**：Lambda / API Gateway / Step Functions / EFS / ECS / EC2 / Bedrock / OpenSearch 哪些能用、$100 quota 細項、4hr session token 對長任務影響、出站網路是否被限——通通沒查
3. **架構設計留洞**：Chroma 哪部署、MCP server 跑哪、長任務怎排——三個關鍵 design hole 沒填

### v2（2026-06-02 下午、User pivot）

M1 brief 出版後、User 提案重大方向轉變：

> 「MCP 有點多餘、大部分人都在捲視覺化跟怎麼應用 AI。但卻沒人解決前置最麻煩的部分、如果我們做的好的話可以直接幫很多人省去這種麻煩事。」

**新方向**：CLI 工具（npm 包、Node.js）+ AWS backend（儲存 + 處理）、解決「下載 TDCS + 清洗 + 上 S3」這個前置苦工。**砍掉 MCP server / RAG / Chroma / 自然語言整鏈**。

**v2 鎖板**（已寫進 MASTER_PLAN §0、見該檔）：

- CLI client（Node.js / TypeScript）+ AWS backend（Lambda / Step Functions / S3 / Athena）
- 跳板問題：**設計 7 個對照實驗 E1~E7**、實驗 narrative 寫進期末報告作為賣點
- AWS region 不變（us-east-1 Learner Lab）
- Demo 期 hardcode endpoint 到 Learner Lab 654485222392；GitHub release 後改 IaC template 讓 user 自 deploy
- CLI UX：下載進度條 + 處理進度條（`cli-progress` MultiBar）
- 砍 MCP / RAG / 自然語言 / Chroma 整鏈

**v2 M1 仍有效**：M1 brief 的 TDCS schema + S3 盤點 + ai_workspace 重用清單對新方向 100% 適用。

## 目標

跑完 PLAN_E5 v2 後達到：
1. **跳板架構決定**：7 個對照實驗跑過、明文紀錄 cost / latency / reliability / 部署複雜度、推一個最佳方案
2. **AWS backend 架構鎖板**：API GW / Lambda / Step Functions / S3 / Athena 各服務角色定案
3. **CLI 介面 spec 鎖板**：command tree、進度條設計、auth flow、AWS endpoint 設定
4. **MASTER_PLAN §1-§10 全面重寫**為新方向、grep MCP / Chroma / RAG / Claude Desktop 等舊概念 = 0
5. **PLAN_E6+ roadmap 重排**（已砍 RAG / MCP 兩個 PLAN、scope 收斂 30~40%）

## 不做

- 不寫任何 CLI / Lambda / AWS infra code（PLAN_E6+ 才做）
- 不跑資料 backfill（`scripts/backfill_s3_2026.py` 等 User 刷 token 跑）
- 不動 ai_workspace 任何檔（只讀、且新方向 Python 邏輯不直接複用、是翻譯成 TS 的 reference）
- 不申請任何新 AWS 帳號 / 服務升級（保持 Learner Lab 654485222392）

---

## Milestones（v2）

### M1 — 三方資料盤點 ✅ 完成（2026-06-02、見事件 #3）

**產出**：[`workflow/reports/brief_data_inventory_2026-06-02.md`](reports/brief_data_inventory_2026-06-02.md)（~530 行 / 8 主節）

**對 v2 新方向 implication**：
- TDCS M06A schema + 三大陷阱（O OR D 篩錯 / 字串時間 / trip_information regex）= CLI 清洗模組必須處理
- `gantry_to_county.json` **345 個全台 gantry** = CLI `--route` / `--section` 參數的 lookup 基底
- `tdcs_clean/` Python 邏輯 = TS 翻譯的 reference（**不直接複用**、要用 polars-node / danfojs 翻 pandas、對齊 14,058 行 baseline）
- Lambda Container template + Athena CTAS SQL = AWS backend Lambda packaging 的範本

---

### M2 — 跳板對照實驗 E1~E4（前半、AWS-native + Tailscale）

**執行者**：Lead 自做 + 部分 `[USER_RUN]`
**預計時間**：90~120 min
**核心 narrative**：「**我們不想假設用戶有台灣 IP、做 7 種架構實驗、推出最佳方案**」— 期末報告賣點

每個實驗紀錄欄位：**latency**（一次下載 10 MB 耗時）、**cost**（單次 + 月度）、**reliability**（失敗模式 / 重試成本）、**deploy 複雜度**（步驟數 + 依賴）、**結論**（推薦 / 備案 / 棄）。

| # | 實驗 | 怎麼測 | 預期 |
|---|---|---|---|
| **E1** | us-east-1 Lambda 直接抓 TDCS | Lambda 內 `urllib.request.urlopen('https://tisvcloud.freeway.gov.tw/history/TDCS/M06A/...')`、看 status code | 預期 fail（403 / connection refused / timeout）— **要實證、不能猜** |
| **E2** | Lambda + NAT Gateway / VPC endpoint | 建 VPC + NAT、Lambda 走 NAT 出去 | NAT IP 在 us-east-1、預期一樣 fail；但要驗證 SCP 允許 NAT 建立 |
| **E3** | Lambda + 第三方 forward proxy | 設定 https_proxy 環境變數指向 BrightData / Smartproxy 台灣 exit、Lambda 走 proxy | 預期 OK 但 pay-per-GB（試免費 trial 額度即可）、長期不划算 |
| **E4** | Lambda + 自架 Tailscale exit-node | 你本機（台灣 IP）裝 Tailscale 標 exit-node、Lambda 加 Tailscale subnet router 或 Tailscale-on-Lambda | 預期 OK、setup ~30 min、SPOF on 你本機、免費 — **可能的優勝者** |

**產出**：`workflow/reports/brief_relay_experiments_2026-06-02.md`（§A E1~E4 結果 + 4 個指標表）

**驗收**：
- 4 個實驗各有「✅ 成功 / ❌ 失敗 + 錯誤碼 / ⚠️ 條件式」紀錄
- 至少 1 個 ✅ 通過 = 有可行路徑、可繼續 M3
- 全部 ❌ = 需重新評估架構（可能要把下載完全 client-side）

**風險**：
- E4 需要你本機開機 + 裝 Tailscale；如果沒空、可延到 M3 後再補做
- E3 第三方 proxy 要信用卡開試用（免費額度 1 GB 內可測完）
- 每個實驗完跑完 cleanup（delete Lambda / NAT / VPC / Tailscale ACL），不留垃圾

---

### M3 — 跳板對照實驗 E5~E7（後半、tunnel / hybrid / client-side）

**執行者**：Lead 自做 + `[USER_RUN]` 部分
**預計時間**：60~90 min

| # | 實驗 | 怎麼測 | 預期 |
|---|---|---|---|
| **E5** | 自架 nginx forward proxy + Cloudflare tunnel | 本機 nginx 轉發 TDCS、cloudflared 暴露為 HTTPS endpoint、Lambda 走 proxy | 預期 OK 但 tunnel URL 不穩、需要 named tunnel 才穩定 |
| **E6** | 完全 client-side 下載 | CLI 本機抓 TDCS → 上傳 user 自己的 S3、AWS 只跑清洗（不下載）| 預期 OK 但解構了「處理推 AWS」精神、可能變 demo backup |
| **E7** | Hybrid：AWS 先檢查 S3 cache、缺資料才喚醒本機跳板 | API GW → Lambda → 查 S3 → 若無 → 觸發本機 webhook（你電腦上 listener）→ 本機抓 → 上傳 S3 → Lambda 取 | 預期 OK、最 elegant、但本機 listener 也要 24/7 開機 + 公網可達 |

**產出**：補進 `brief_relay_experiments_2026-06-02.md §B`、加 §C 推薦表（4 指標 × 7 實驗）+ 結論段

**驗收**：7 個實驗有對照表 + 推 1 個 winner + 1 個 backup

**[USER_RUN] 部分**：
- E4 Tailscale exit-node 本機 setup（你跑、Lead 給 step-by-step）
- E5 Cloudflare tunnel 本機 setup（同上）
- E7 webhook listener 跑你電腦上

---

### M4 — 新架構鎖板（Lead + User 對齊）

**執行者**：Lead 草擬選項 → AskUserQuestion → User 拍板 → Lead 寫進實驗紀錄
**預計時間**：30 min

**v2 三個架構決策**（取代 v1 三個洞）：

| # | 決策 | 候選 |
|---|---|---|
| M4.1 跳板架構 | M2/M3 7 個實驗結果中選 1 winner + 1 backup |
| M4.2 處理層 | (a) 純 Lambda（短任務、< 15 min）/ (b) Step Functions + Lambda chain（長任務）/ (c) ECS Fargate（純 batch） |
| M4.3 CLI auth 方式 | (a) Hardcode Learner Lab API URL（demo 期）/ (b) `tdcs-dl config set-endpoint <url>` 留擴展彈性 |

**產出**：實驗紀錄事件「事件 #N [Lead+User] M4 — 新架構鎖板」、寫進 MASTER_PLAN §0

**驗收**：3 個決策各鎖定 + 對應 implications 寫成段

---

### M5 — MASTER_PLAN §1-§10 全面重寫（v2 新方向）

**執行者**：Lead 自做
**預計時間**：60 min

**對齊清單**（依新方向重寫）：

| § | 改成什麼 |
|---|---|
| §1.1 一句話定義 | **TDCS 自動下載 + 清洗 CLI 工具**、CLI client（npm）+ AWS backend（處理 / 儲存）。砍 MCP server / 自然語言 |
| §1.2 範圍 | M06A 主、Gantry list / 時間區間 user 自定。M03A/04A/05A/07A 列「未來擴展」 |
| §1.3 最終理想 | GitHub 開源、解決 TDCS 研究者 / 開發者「前置苦工」痛點 |
| §1.4 階段性版本 | 砍「比賽版 ngrok」、改「demo 版（hardcode Learner Lab）」+「release 版（IaC template、user 自 deploy 自 AWS）」 |
| §2 整體架構 | 完全 rewrite：CLI ↔ API GW ↔ Lambda / Step Functions ↔ S3 / Athena + M4 跳板 |
| §3 技術選型 | 對齊新架構（Node.js 18+ / TypeScript / cli-progress / @aws-sdk/client-s3 等）+ AWS 服務表 |
| §4 Phase 結構 | 重排 M-1~M-7：M-1 CLI skeleton + tdcs_clean 翻 TS / M-2 AWS infra + 跳板 / M-3 download 整鏈 / M-4 清洗整鏈 / M-5 Athena 整合 + query subcommand / M-6 進度條 + UX 打磨 / M-7 端到端 demo |
| §5 預期檔案結構 | `cli/` (TS 主程式) + `infra/` (IaC) + `tests/` (Jest + baseline 對齊) + `workflow/` (本套) |
| §6 D1~Dn 決策 | 全重寫：D1 npm 而非 pip、D2 Node.js 而非 Python、D3 CLI 結構化指令而非 LLM、D4 backend 服務、D5 跳板選型、D6 進度條 UX、D7 demo 期 hardcoded endpoint、D8 release 用 IaC template、D9 對齊 baseline 14,058 行、D10 不整合視覺化 / 預測 |
| §7 風險 | Lambda cold start / Tailscale SPOF / Learner Lab session token / Node.js polars 對 pandas 對齊風險 / GitHub release 後 user 無 AWS 帳號用不了 |
| §8 工作流 | 改名 PLAN_E、對齊 v0.6 worker 派工流程 + 3 worker 名冊 |
| §9 驗收標準 | 新 Phase M 標準（每 M 一個 demo case）|
| §10 下一步 | 「PLAN_E6 啟動 CLI skeleton + tdcs_clean TS 翻譯」 |
| §11 Changelog | 新增段：紀錄 v1（MCP 方向）→ v2（CLI 方向）pivot 經緯 |

**產出**：新版 `workflow/MASTER_PLAN.md`

**驗收**：grep MASTER_PLAN「MCP server / Chroma / bge-m3 / Claude Desktop / RAG / 自然語言」6 個關鍵字 = 0 結果（除非在 §11 Changelog）

---

### M6 — 後續 PLAN 與 USER_RUN 清單（v2 重排）

**執行者**：Lead 自做
**預計時間**：15 min

**內容**：

1. **PLAN_E6+ roadmap（v2 重排、砍 2 個加 1 個）**：
   - PLAN_E6: **CLI skeleton + tdcs_clean TS 翻譯**（Node.js 專案結構、`commander` CLI、核心清洗邏輯 TS 版、對齊 14,058 行 baseline）
   - PLAN_E7: **AWS infra setup**（API GW + Lambda + Step Functions + S3 + Athena、依 M4 跳板結論搭跳板）
   - PLAN_E8: **CLI ↔ AWS download chain**（CLI pull subcommand → API → 排程下載 → S3 → 進度回傳）
   - PLAN_E9: **CLI ↔ AWS clean chain**（CLI clean subcommand → Lambda 跑 tdcs_clean TS → 寫 cleaned/ Parquet → 進度回傳）
   - PLAN_E10: **Athena 整合 + query subcommand**（CLI 直查 cleaned 資料）
   - PLAN_E11: **UX 打磨 + npm publish**（進度條 + spinner + error 訊息 + auth flow + npm publish 流程）
   - PLAN_E12: **端到端 demo + integration test**（demo cases 跑通：麻豆段 2026/03 + 雪山隧道 2026/03 + 任意新路段、收斂 bug、確認 npm install 後立刻可用）
   - **PLAN_E13: 期末三件套**（書面報告 PDF 含 7 跳板實驗 narrative + 系統架構 + 與 ai_workspace 期中差異對比；PPT 簡報用於影片錄製；Youtube demo 影片 + 講稿 — 細節 PLAN 開時依當下成果定）
2. **[USER_RUN] queue**：
   - 刷 Learner Lab token → 同步 mcp_workspace/.env
   - 跑 `scripts/backfill_s3_2026.py` 補 114 天到 `s3://112021024/`
   - PLAN_E5 / M3 跳板實驗 E4/E5/E7 部分本機 setup（Tailscale / Cloudflare tunnel / webhook listener）
   - GitHub 帳號 + npm 帳號（PLAN_E11 才用）
3. **砍掉的舊 PLAN**：
   - ~~PLAN_E8 RAG~~（Chroma + bge-m3、不做了）
   - ~~PLAN_E11 通用圖表~~（CLI 不畫圖、user 自己拿資料畫）

4. **總計**：v2 後續 **8 個 PLAN_E6~E13**（v1 規劃 7 個、淨增 1 個是把端到端 demo + 三件套拆成兩 PLAN、避免單 PLAN scope 太大）

**產出**：寫進實驗紀錄5.md 末事件「PLAN_E5 結案 + v2 後續 roadmap」

---

## 完成定義（整 PLAN）

- [x] M1 三方資料盤點 brief 出版（事件 #3 已完成）
- [ ] M2 E1~E4 跳板實驗 brief 出版
- [ ] M3 E5~E7 跳板實驗補完、推薦表 + 結論段
- [ ] M4 新架構三決策鎖定、寫進 MASTER_PLAN §0
- [ ] M5 MASTER_PLAN §1-§11 全 rewrite、grep 6 個舊關鍵字 = 0
- [ ] M6 v2 PLAN_E6~E12 roadmap + USER_RUN queue 寫進實驗紀錄
- [ ] `> **關鍵成果**：` 寫進本檔 frontmatter
- [ ] 跑 `archive.py --plan workflow/PLAN_E5.md` 封存、INDEX regen

## 風險

| 風險 | 緩解 |
|---|---|
| M2/M3 實測吃 $100 配額 | 每實驗 cleanup 步驟、跑前 `aws ce get-cost-and-usage` 看餘額；E3 第三方 proxy 只用免費 trial |
| 4hr token 過期跑到一半 | Lead 切小段、看到 ExpiredToken 刷 mcp_workspace/.env 重跑 |
| 跳板實驗全 ❌ | M3 結束評估、轉「E6 純 client-side」backup、demo 也能演 |
| Tailscale / Cloudflare 本機 setup user 沒空 | 對應實驗延到 M3 後做、不卡 M4 鎖板 |
| MCP 方向已寫進 workflow 多處 | M5 重寫 MASTER_PLAN、舊 v1 鎖板搬 §11 Changelog 保留歷史 |
| Node.js 翻譯 tdcs_clean 對齊 baseline 失敗 | PLAN_E6 跑、不卡 PLAN_E5；TS 對齊 Python 14,058 行 byte-level diff 是硬指標 |
