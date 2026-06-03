# 期末作業規則對映 — mcp_workspace 11 章節 + Deadline + 6/10 Fallback 切片

> **目的**：把 `期末作業規則.xlsx`（22 行 8 欄、源檔在 `workflow/reports/ref/`）每一條對映到 mcp_workspace 的 PLAN / 產出 / 章節；定義 6/10 deadline 真到不了完整計畫時的「最少可交付切片」。
> **產出於**：2026-06-02（Lead 自做、PLAN_E5/M5 spec 承諾、PLAN_E6 階段審查 F-H2/F-H3 修補）
> **作者**：mcp_workspace Lead
> **規則來源**：`workflow/reports/ref/_dump_期末作業規則.txt`（utf-8 dump）+ `期末作業規則.xlsx`（原檔）

---

## §0 規則總覽

**總配分**：100%（書面報告 71% + 互評 25% + Youtube + 上台 + 5/11 提交組員）

**Deadline 序**：
| 日期 | 動作 | 配分 |
|---|---|---|
| ~~2026/5/11~~ | 小組成員 + 交流道資料（上 Tronclass）| 1% |
| **2026/6/8** | **上台分享 + YouTube URL** | 1-3% |
| **2026/6/9** | **YouTube 影片連結 + 上 Tronclass** | 1% |
| **2026/6/10** | **書面報告 PDF + 小組互評**（每組員簽名）| 25% 互評 + 71% 報告 |

**今天**：2026-06-02、距 6/10 8 天。

---

## §1 報告 11 章節對映表

每章節對映：(a) **要寫什麼**、(b) **資料 / 素材來源**、(c) **產出責任**、(d) **狀態 / Risk**。

| § | 章節 | 配分 | 要寫什麼 | 素材來源 | 責任 | 狀態 |
|---|---|---|---|---|---|---|
| **1** | 封面 | 1% | 標題（TDCS大數據於AWS雲端平台之整合應用）+ 交流道名稱（**麻豆段**）+ 組員（4 人）+ 小組分工 + 貢獻度 + YouTube URL + 日期 | 組員提供 + 6/9 拿到 URL | User + Lead | ⏳ 待 PLAN_E13 |
| **2** | GoogleMap 截圖 + URL | 1% | 標麻豆段 4 匝道代碼（01F2930N/S、01F3019N/S）的 GoogleMap 截圖 + 公開 URL | User 自截 + Lead 標代碼 | User | ⏳ User 任務 |
| **3** | 動機與目的 | 1% | 如何利用 AWS 雲端計算平台處理大數據資料 — narrative：「沒人解決前置苦工、我們做 CLI 工具填補」 | brief_data_inventory §0 + MASTER_PLAN §0 核心痛點 | Lead / opus_worker | ⏳ PLAN_E13 |
| **4** | POC（概念驗證、AWS Platform）| 5% | demo 跑通麻豆段 + 通用化 2 個短距離路段、3 cases POC 結果 | PLAN_E12 demo 3 cases 跑後產出 | Lead + sonnet | ⏳ PLAN_E12+E13 |
| **5** | **Volume 資料前處理**（Cloud9 + Preprocessing + Glue ETL）| **10%（12 週滿分）** | 12 週資料量統計（2026/3/1~5/23）+ 處理流程說明 | `backfill_s3_2026.py` 跑出來 + `brief_data_inventory` 已盤點 | User 跑 backfill + Lead 寫 | ⚠️ **見 §3 風險：Glue 不採用、用 Lambda + narrative** |
| **6** | **數據分析**（車種 / 每週 / 每月 / 上下交流道）| **15%** | 麻豆段 4 匝道、12 週、5 車種、上下交流道 cross 分析；折線 / bar / 熱力圖 | mcp Stage 1 `step2_visualization/charts/` 9 張 + 12 週擴展補圖 | Lead / sonnet 寫文 + 圖 | ⏳ PLAN_E13 |
| **7** | **期中專題比較**（AWS services 增加之效能）| **15%** | 對比 mcp Stage 1（manual + 本機）vs Stage 2（CLI + AWS）：時間 / 步驟 / 通用性 / 成本；列舉用到的 AWS services | brief_cleaning_arch §3 narrative 已備 + 跳板實驗 brief_relay | Lead / opus_worker（長文）| ⏳ PLAN_E13 |
| **8** | 創造價值 Value（配合實驗數據）| 10% | 量化「我們省了多少工」：手動清洗 N 小時 vs CLI 一行 + cloud 自動化；社群影響推估 | PLAN_E12 demo timing + brief_relay 跳板對照表 | Lead / opus_worker | ⏳ PLAN_E13 |
| **9** | 分析費用（AWS Bill / Cost Explorer）| 5% | AWS Cost Explorer 截圖 + 各服務費用使用說明 + 節省策略 | AWS Console 截圖 + Lambda / S3 / Athena 配額 | User 截圖 + Lead 寫 | ⏳ PLAN_E12 後跑、PLAN_E13 寫 |
| **10** | 小組會議紀錄（≥ 2 次）| 3% | 兩次以上會議的討論內容 + 照片 | 組員實體會議拍照 + 紀錄 | User + 組員 | ⏳ User 任務、現階段可預備一次 |
| **11** | 學習心得（每組員都要）| 5% | 4 人各自寫：技能 + 可改進之處 + 團隊合作 | 4 位組員各自寫 | User + 組員 | ⏳ User 任務 |

**合計**：1+1+1+5+10+15+15+10+5+3+5 = **71%**（書面報告部分）。

剩餘 25% 互評 + 1% 5/11 提交 + 1% 6/9 YouTube + 1-3% 6/8 上台 = ~30%。

---

## §2 PLAN 對映（roadmap → 章節）

| PLAN | 完成後對應章節 | 沒做完的話影響哪章 |
|---|---|---|
| PLAN_E5 ✅ | §7 期中比較（跳板 narrative）| §7 部分扣分 |
| PLAN_E6（M1-M5 ✅、M6+M7 ⏳）| §4 POC、§7 工程選擇 | §4 / §7 部分扣分 |
| PLAN_E7（AWS infra）| §5 Volume、§9 費用 | §5 重扣（10%）|
| PLAN_E8（download chain）| §4 POC、§5 Volume | §4 / §5 重扣 |
| PLAN_E9（clean chain）| §4 POC、§6 數據分析 | §4 / §6 重扣（25%）|
| PLAN_E10（Athena query）| §6 數據分析、§9 費用 | §6 部分扣 |
| PLAN_E11（UX + npm publish）| Demo 演示 + §7 narrative | 影片素材弱、§7 narrative 弱 |
| PLAN_E12（端到端 demo）| §4 POC + §6 數據分析 + §8 Value | 三章重扣 |
| PLAN_E13（三件套）| §1-§11 全部 + YouTube + 上台 | 整份報告無法成形 |

---

## §3 風險登記（§7 已補對應條目、本節展開）

### R1：Glue ETL 不採用 vs §5/§7 字面提及

- **規則**：§5 Volume「AWS Cloud9 + Preprocessing + (AWS Glue ETL)」、§7 列 10 個 AWS services 含 Cloud9 / Glue / Step Function 等
- **我們做的**：Lambda（取代 Glue ETL Spark）+ Glue Data Catalog（用、不是 Glue ETL）；沒用 Cloud9（用本機 VS Code + CLI）
- **緩解**：
  - brief_cleaning_arch §3 narrative 寫「為什麼選 Lambda 不選 Glue ETL」
  - §7 報告段明示工程合理性選擇（小資料、互動式、user 觸發）
  - 列舉用到的 AWS services：S3 / Lambda / API Gateway / Glue Data Catalog / Athena = 5 個（不只字面 Glue ETL / Cloud9）
- **殘餘風險**：規則評分嚴格按字面 → §5 Volume 10% 有 partial loss 風險（-2~5%）

### R2：6/10 deadline 太緊、roadmap 8 個 PLAN 可能跑不完

- **規則硬指標**：6/10 書面報告 PDF + 互評（25% + 71% = 96% 配分卡在這天）
- **today**：6/02、8 天到 deadline
- **mitigation**：見 §4 fallback 切片

### R3：§10 會議紀錄 + §11 學習心得 = User + 組員任務、Lead 沒法做

- 需要 User 推 4 位組員配合
- Lead 可提供 template / 範例給 User 派下去

### R4：§2 GoogleMap 需 User 截圖（不是 Lead 做）

- User 自截、Lead 提供 4 匝道代碼 list
- 可順手做、低風險

---

## §4 6/10 Fallback 切片（如 roadmap 跑不完、minimum-viable 交付）

依品質紀律 §0.3「里程碑式開發、縮 scope 不降品質」原則、定義「**到 6/10 一定交得出來的最小完整切片**」：

### Tier 1 — 已完成、Lead 確保到 6/10 都在

| 已完成項 | 對應章節 |
|---|---|
| PLAN_E5 跳板 7 實驗 brief | §7（narrative）|
| PLAN_E6 CLI skeleton + TUI wizard + tdcs_clean TS（M5 baseline PASS）| §4 POC（本機 demo）|
| mcp Stage 1 麻豆 14,058 行 baseline | §6 數據分析 baseline |
| 339 gantry v4.1 + diff report | §3 動機（強調規模通用化）|

### Tier 2 — Must-do、PLAN_E13 必交付（即使 PLAN_E7~E12 沒全跑完）

| Tier 2 必交 | 內容 | 對應章節 | 來源 |
|---|---|---|---|
| 書面報告 PDF | 11 章節全寫、即使 §4 POC 只有本機 demo（沒上 AWS）也要交 | §1-§11 | Lead / opus 寫 |
| YouTube 影片 | 講解 + PPT、用截圖代替 live demo（鎖板早定：純 PPT + 截圖） | 影片 | Lead 寫講稿 + User 錄 |
| GoogleMap 截圖 | 麻豆 4 匝道 | §2 | User 自截 |
| AWS Cost Explorer 截圖 | 即使費用接近 $0、要截 | §9 | User 截 |
| 會議紀錄 + 照片 | 至少 2 次 | §10 | User + 組員 |
| 學習心得 | 4 人各寫 | §11 | User + 組員 |
| 小組互評 | 每人簽名 | 互評 25% | User + 組員 |

### Tier 3 — Nice-to-have、有時間就做

| Tier 3 | 內容 | 對應章節 | 沒做的影響 |
|---|---|---|---|
| PLAN_E7 AWS infra 真實部署 | API GW + Lambda + Athena 跑通 | §4 POC（升級成 cloud demo）、§5 Volume | -2~3% Volume + 影片少 wow factor |
| PLAN_E8 download chain | CLI 真實打 AWS 跑下載 | §4 POC | 同上 |
| PLAN_E9 clean chain | Lambda 真實跑 TS 清洗 | §4 POC + §6 | 同上 |
| PLAN_E10 Athena query | CLI query subcommand | §6 | 報告 §6 數據分析改用本機 query |
| PLAN_E11 UX + npm publish | npm 真實 publish | §8 Value（社群可採用）| -2~3% Value（沒法 prove 社群可採） |
| PLAN_E12 端到端 demo | 3 cases 跑通 | §4 POC | -2~5% POC |

### 6/10 最壞情境保底版

如果到 6/8 仍只到 PLAN_E6 結束（CLI 本機跑、沒上 AWS）：
- §4 POC 寫「本機 PoC + IaC template 已備（PLAN_E7+ 部署）」
- §5 Volume 用 backfill_s3_2026.py 跑出來的 raw 數據統計（不用打 Lambda）
- §6 數據分析用 mcp Stage 1 既有 14,058 行 + 12 週 backfill 後補圖
- §7 期中比較強化（narrative 完整、跳板實驗對照表是強賣點）
- §8 Value 用「設計 + 工程 + 跨領域整合」narrative
- §9 費用用「目前接近 $0、PLAN_E7+ 部署後再 update」

預估保底總分：**60-65%**（vs 全跑完預估 80-90%）。

---

## §5 對映特殊規則項

### Cloud9 - 規則 R11/R13 提及、我們不用

**處理**：報告 §7 期中比較段加一句：「Cloud9 在小組評估下不適用（mcp 本機 IDE = VS Code、cloud IDE 對本專案無附加 value、且 Cloud9 在 Learner Lab 配額計算下不划算）。我們**用本機 VS Code + 本機 CLI 取代 Cloud9 角色**、達成同樣『開發在雲端可訪問環境』目標、且不額外吃 Learner Lab compute 配額。」

### 「期中專題互評.xlsx」格式

User 任務、Lead 提醒 6/10 前完成 4 人簽名掃描。

### 「至少兩次小組會議」

User 安排、Lead 提供 template：
- 會議 1：mcp_workspace v2 pivot 決策（6/2、Lead + User 對話可作 narrative 基礎）
- 會議 2：6/10 deadline 前 final review（建議 6/7 ~ 6/9 之間）

---

## §6 後續行動

- 本 brief 為 PLAN_E13 三件套寫作必讀（opus_worker 接 PLAN_E13 時必看）
- §1 章節對映表是 PLAN_E13 outline 的 1:1 基礎
- §4 fallback 切片每週 PLAN 啟動前 Lead review、確保「最壞情境保底版」隨時可交
- User 任務（§2 GoogleMap / §9 Cost 截圖 / §10 會議 / §11 心得 / 互評）— Lead 6/7 前出 reminder list 給 User
