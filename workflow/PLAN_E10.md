# PLAN_E10 — 期末三件套（書面 PDF + PPT + YouTube demo 影片）

> **對應紀錄**：`workflow/實驗紀錄10.md`
> **Pivot 緣由**：見 `MASTER_PLAN.md` §7「PLAN_E10 線性走 pivot」段、`實驗紀錄10.md` 開頭校正紀錄
> **Demo 課程展示**：2026-06-10（剩 6 天）
> **YouTube 上傳**：2026-06-09（剩 5 天）

---

## 背景

PLAN_E5 ~ PLAN_E9 完成全套 v2 業務邏輯（CLI ↔ AWS clean chain + 4 H gate + structural 三證 baseline + F-H5 真實證關閉）。**程式碼層收尾**、剩**對外溝通層**：書面、簡報、影片三件套。

關鍵限制：
1. **時間**：6 天交三件套、quality > time（per §0.3 里程碑式開發、絕不 throwaway hack）
2. **scope**：原 MASTER_PLAN §7 E10-E13 線性走（Athena subcommand + UX + npm publish + integration test + 三件套）在 6 天內**不可能跑完不降品質**。User 拍板 demo 後砍 AWS 走 v3.0 純本地 npm → 原 E10/E11/E12 全部會被推翻 → 現走 = 浪費功 + 拖累 demo。故 PLAN_E10 pivot 為三件套交付（原 E13 內容）。
3. **narrative 核心**：「**已驗證核心邏輯**的方式去講」（User 明示 PLAN_E9 期間）、**不講 AWS infra 多炫**、講「**抓 bug → root cause → 修好**」的工程方法論

---

## 目標

跑完 PLAN_E10 後達到：

1. **書面報告 PDF**（10-15 頁）：含系統架構 + 8 大 concept design highlights + 與 mcp Stage 1 manual 流程對比 + post-demo v3.0 純本地版規劃預告
2. **PPT 簡報**：HTML 動畫簡報、AI Studio 生成、用於 YouTube 影片錄製、視覺呈現 8 大 highlights
3. **YouTube demo 影片**（5-8 分鐘）：CLI 操作 demo（wizard + status + S3 + Athena）+ 8 大 highlights narrative + Q&A 預演、雙語段（口語版 + 知識點）

---

## 不做

- **不做**新 feature（PLAN_E9 結束、code freeze、只保留必要 bug fix）
- **不做** Athena query subcommand（原 E10、demo 後 v3.0 改 DuckDB）
- **不做** npm publish（原 E11、demo 後 v3.0 重做）
- **不做** 3 cases integration test（原 E12、麻豆段已驗、影片內只展示 1 case 即可）
- **不做** GitHub release（demo 後新開 public repo、現 repo 是 teaching repo）

---

## Milestones

### M0 — Spec typo 對齊（Lead 自做、5 min）

deploy_worker 觀察報告 #1+#2 兩處 spec ↔ 實際不對齊：
- `cleaned_v2` → 實際 Glue table = `cleaned_v2_skeleton`
- `tdcs_dl_wg` → 實際 Athena workgroup = `tdcs-dl-wg`

**處理**：grep `workflow/` + `README.md` 全域、替換上述兩處到正確名、不動 terraform / lambda 程式碼（infra 是對的、是文件口誤）。

**驗收**：grep `cleaned_v2[^_]` `tdcs_dl_wg` 0 hit（in workflow/ + README）。

---

### M1 — Demo 素材補缺（User 自跑、opus_worker_2 嚮導、預估 15-20 min）

> **scope 擴張**（2026-06-04 opus_worker_2 期中回報 C1 拍板）：原 3 張擴 8 張、加 5 張 AWS Console 配置截圖、配 §2 配置一覽表使用。

| 截圖 | 拍什麼 | 哪裡拍 | 放到 |
|---|---|---|---|
| `demo_08_stage2_cleaning.png` | wizard Running view、Stage 2 (Cleaning) 進度條 40-80% | 本機 PowerShell、跑 wizard 觸發 clean、或重 clean 既有 jobId | `workflow/reports/screenshots/E10/` |
| `demo_09_done_view.png` | wizard Done view、顯示「成功」+ 14116 rows + 耗時 + jobId | 同上、跑完後最終畫面 | 同上 |
| `demo_12_athena_workgroup.png` | AWS Console / Athena / Workgroups / `tdcs-dl-wg`、能看到 10 MB scan cap | AWS Console us-east-1 | 同上 |
| `demo_17_lambda_general.png` | Lambda function cleaner General config 頁、能看到 memory 2048 MB / timeout 900 s / ephemeral 1024 MB | AWS Console / Lambda / Functions / cleaner / Configuration / General | 同上 |
| `demo_18_sqs_settings.png` | SQS Queue clean-jobs settings 頁、能看到 visibility 920 s + DLQ link | AWS Console / SQS / Queues / clean-jobs / Details | 同上 |
| `demo_19_glue_table.png` | Glue table `cleaned_v2_skeleton` schema 頁、能看到 9 欄 snake_case + partition `yyyymm` | AWS Console / Glue / Tables / cleaned_v2_skeleton | 同上 |
| `demo_20_apigw_routes.png` | API Gateway HTTP API Routes 頁、能看到 `POST /clean` + `GET /jobs/{id}` | AWS Console / API Gateway / APIs / tdcs-dl / Routes | 同上 |
| `demo_21_s3_prefixes.png` | S3 bucket `112021024` 根目錄、能看到 4 prefix（raw / cleaned_v2 / jobs / athena-results） | AWS Console / S3 / Buckets / 112021024 | 同上 |

**驗收**：8 張 PNG 存在、檔名與上表完全一致、解析度 ≥ 1280×720。

---

### M2 — 書面報告 .md 撰寫（Lead 主寫、worker 補長文）

#### M2.1 — 大綱與 8 highlights 骨架（Lead 自寫，當前 session）

寫 `workflow/reports/期末書面報告.md` 骨架：
- 封面 / 目錄
- §1 系統定位（一句話：把 ai_workspace 麻豆段 manual 流程 → CLI + AWS 自動化、可重現、未來通用）
- §2 系統架構（CLI + Lambda + S3 + Glue + Athena 五件套、SQS broker 切割）
- §3 8 大 Concept Design Highlights（每點 200-400 字、含「問題 / 觀察 / 對策 / 驗證」四段）
- §4 已驗證核心邏輯（22 GB raw → 14116 rows / structural 三證 / Athena GROUP BY 5 列）
- §5 與 Stage 1 manual 流程對比（時間 / 重現性 / 通用性 / 工程價值）
- §6 Post-demo v3.0 規劃預告（砍 AWS 純本地 npm、demo 是學習成果展示、v3.0 才是長期維護）
- §7 結語 + 致謝

#### M2.2 — 8 highlights 內文撰寫（可派 opus_worker 寫長文）

每點 200-400 字、引實驗紀錄事件 # + commit hash 為證。Lead 草寫 1-2 點當範本、剩下 6-7 點派 opus_worker 跟進。

#### M2.3 — 段落整合 + Lead 審稿

Lead 讀 worker 寫的草稿、補架構連接、刪冗詞、確認與實驗紀錄事實對齊（紅線：不能編造數據）。

**驗收**：`期末書面報告.md` 10-15 頁（estimate by 字數 5000-8000）、§3 8 點全寫完、§5 對比表有量化數據。

---

### M3 — 書面 → PDF（[USER_RUN]、Pandoc xelatex）

Pandoc xelatex 轉換、字型 Microsoft JhengHei（中）+ Times New Roman（英）。

```bash
cd D:\p\TDCSprecentater\mcp_workspace\workflow\reports
pandoc 期末書面報告.md -o 期末/期末書面報告.pdf \
  --pdf-engine=xelatex \
  -V CJKmainfont="Microsoft JhengHei" \
  -V mainfont="Times New Roman" \
  -V geometry:margin=2.5cm \
  --toc --toc-depth=2 \
  --highlight-style=tango
```

**驗收**：PDF 開得起來、中文不亂碼、TOC 可點、code block 有 syntax highlight。

---

### M4 — Presentation brief 整理（Lead 自寫、per workflow §11）

按 `D:\p\workflow\templates\presentation_brief.md` 結構整理「給 AI Studio 用的內容素材」：
- 敘事弧（建議：開場 demo CLI → 5 件套 infra → 抓 bug → 修 bug → 8 highlights → post-demo 預告）
- 每頁建議內容（標題 / 重點 3-5 行 / 配圖建議 / 出處）
- 缺漏素材清單（如果有）

輸出 `workflow/reports/brief_期末_2026-06-04.md`。

**驗收**：brief 含 15-20 頁建議、每頁素材出處明確（指向實驗紀錄事件 # 或截圖檔名）。

---

### M5 — PPT 製作（[USER_RUN]、AI Studio HTML 動畫簡報）

User 在 Google AI Studio 跑 brief、產出 HTML 動畫簡報（per `feedback_presentation_method`）。

**輸出位置**：匯出後存 `workflow/reports/期末/期末簡報.html`（或 `.pptx`）——與書面 PDF 同放 `期末/`、繳交時打包該資料夾即可。

**Lead 不介入風格 / 動畫 / 互動設計**（per workflow §11）、只在 User 反饋「缺哪段內容」時補 brief。

**驗收**：HTML 開得起來、15-20 頁、動畫順、含 8 highlights 視覺呈現。

---

### M6 — 影片 narration script（Lead 自寫）

寫 `workflow/reports/期末影片講稿.md`、結構：

每段 narration **兩段式**（per `feedback_qa_style`）：
- **【口語版】** 中文、無英文術語、講給沒寫過 AWS 的同學聽
- **【知識點】** 補英文術語、技術細節、給老師 / 助教看

例：
```markdown
## §3.4 F-H5 schema drift bug

【口語版】
我們的 Lambda 把資料整理完寫成檔案、結果一查就爆。
JavaScript 把數字都當小數處理、檔案裡的車種欄存成了 12.0、3.0、
但表設定是整數欄、Athena 一讀就拒絕、噴 "型別不對" 錯誤。
我們試著用 SQL 轉型救、但讀檔階段就已經失敗、SQL 救不到。
最後改在 Lambda 寫檔前明示告訴它「這 8 欄是整數」、問題就解了。

【知識點】
- 根因：`pl.readRecords(parquetRows)` 無 schema 推斷、JS Number → Float64 → Parquet DOUBLE
- Glue table 對應欄是 INT → Athena reader type mismatch → HIVE_BAD_DATA
- `CAST AS INTEGER` 救不了（錯在 Parquet read 階段、Athena SQL CAST 到不了）
- 修法：`pl.readRecords(parquetRows, { schema: PARQUET_SCHEMA })`、8 numeric Int32 + 1 Utf8 顯式宣告
- 證據鏈：demo_15（bug）→ demo_15b（CAST 也失敗）→ demo_16（顯式 schema 修好）
- commit a381a2d + 1a45d37
```

5-8 分鐘影片、估 800-1200 字 narration。

**驗收**：講稿全段配 demo 截圖 / CLI 操作步驟、含 Q&A 預演 3-5 題（per `feedback_qa_style` 同樣兩段式）。

---

### M7 — 影片錄製 + 上傳 YouTube（[USER_RUN]）

User 自跑、Lead 不介入。建議流程：
1. OBS / Loom / Zoom 錄螢幕、走 PPT + CLI 雙視窗
2. 講稿在另一螢幕、邊看邊念
3. 5-8 分鐘、剪不需要的段（若有）
4. 上傳 YouTube、unlisted 或 public（user 自決）
5. 影片連結放入書面報告 §1 開頭

**驗收**：影片連結 live、可觀看、字幕（可選）。

---

## 派工總覽

| Milestone | 執行者 | 預估時間 |
|---|---|---|
| M0 spec typo | Lead 自做 | 5 min |
| M1 demo_08/09/12 截圖 | [USER_RUN] | 10 min |
| M2.1 書面骨架 | Lead 自寫 | 30 min |
| M2.2 8 highlights 長文 | opus_worker（派 1 個） | 60-90 min |
| M2.3 Lead 審稿 | Lead 自做 | 30 min |
| M3 PDF 轉換 | [USER_RUN] | 10 min（含安裝 Pandoc 字型） |
| M4 brief 整理 | Lead 自寫 | 30 min |
| M5 PPT AI Studio | [USER_RUN] | 60-90 min |
| M6 影片講稿 | Lead 自寫 | 45 min |
| M7 錄影 + 上傳 | [USER_RUN] | 60-90 min |

**Lead 總工時估**：3-4 小時（M0/M2.1/M2.3/M4/M6 全做）
**User 總工時估**：3-4 小時（M1/M3/M5/M7 全跑、含 AI Studio + 錄影）
**Worker 總工時估**：90 min（opus_worker 寫 M2.2）

---

## 順序與並行

```
M0 (Lead 5 min)
  ↓
M1 (User 10 min) ────────┐
  ↓                       │
M2.1 (Lead 30 min)        │
  ↓                       │
M2.2 (opus_worker 90 min)─┤ M1 並行
  ↓                       │
M2.3 (Lead 30 min)        │
  ↓                       │
M3 (User 10 min) ─────────┤
  ↓                       │
M4 (Lead 30 min) ─────────┤
  ↓                       │
M5 (User 90 min) ─────────┤
  ↓                       │
M6 (Lead 45 min) ─────────┤
  ↓                       │
M7 (User 90 min)
  ↓
✅ 三件套交付
```

理想時程（含 buffer）：

| 日期 | 進度 |
|---|---|
| 6/4（今）晚 | M0 + M1 + M2.1 完 |
| 6/5 | M2.2 opus_worker 跑 + M2.3 Lead 審 + M3 PDF |
| 6/6 | M4 brief + M5 PPT 第一版 |
| 6/7 | M5 PPT 修、M6 講稿 |
| 6/8 | M7 錄影 + 剪輯 |
| 6/9 | M7 上傳 YouTube + 備用 buffer |
| 6/10 | 課程展示 + 三件套交件 |

---

## 紅線 / STOP 條件

1. **不編造數據**：所有書面 / PPT / 影片引述的數字必須能在 `workflow/實驗紀錄9.md` + `實驗紀錄10.md` + git commit 找到。對不上 = STOP 修。
2. **不過度行銷**：講「我們做到了什麼」、不講「我們很厲害」。User 明示「客觀科學一點不要為了加而加」。
3. **不講 AWS infra 為主**：narrative 核心是**已驗證核心邏輯 + 工程方法論**（抓 bug → root cause → 修好）、AWS 是手段不是主角。
4. **不破 §0.3 三鐵則**：時間壓力大時縮 scope（少寫一頁 highlight、少錄一段 demo）、絕不降品質。
5. **commit 紀律**：每完成一個 Milestone 一個 commit、訊息標 PLAN_E10 M<n>。

---

## 後續行動（demo 後）

PLAN_E11 將是「**砍 AWS 純本地 npm v3.0 規劃 + 公開 GitHub repo**」（per `project_post_demo_public_repo` memory）。
PLAN_E10 三件套交付後、Lead 主動 review 以下 pending：
- 原 PLAN_E10/E11/E12 是否要 reset / 砍 / 改 v3.0 版本
- F-H3 budget gate 是否要在 public repo 改 production 版（var.enable_budgets = true）
- README 是否要寫教學 repo vs 公開 repo 的差別
- PLAN_E11 byte-md5 baseline 實證 gate（PLAN_E9 §0.3 4 步妥協第 4 步、demo 後補實證）
- **E1 runPull 孤兒 temp 修補**（2026-06-04 opus_worker_2 期中發現）：`runPull` 清理只在成功時跑、Ctrl+C / 出錯留 temp（本 session opus_worker_2 已幫 User 刪一個 3.4 GB）。修法：`try/finally` + `SIGINT` handler、與 streaming pull 一起做、屬 v3.0 設計（書面 §6 寫進去、不寫進 §3）
- **本機輸出實作補 code**（2026-06-04 opus_worker_2 A1 拍板（a））：wizard step 4「本機儲存→./tdcs-output/」UI 完整、code 端尚無 GetObject cleaned.parquet → 寫本地的邏輯。書面 §3.7 走概念設計寫、實作補 demo 後 v3.0 純本地版（DuckDB 取代 Athena 後本機本來就是 first-class path）

---

## 對應 §0.3 三鐵則

| 鐵則 | 落實方式 |
|---|---|
| 長期維護視角 | 書面 / PPT / 影片皆引實驗紀錄事件 # + commit hash、6 個月後接手可循路找到證據 |
| 工程合理性 | Milestone 順序 + 並行設計避免浪費工時、不為了「多做」而塞無用內容 |
| 邏輯正確性 | 紅線 #1「不編造數據」+ Lead 審稿 step（M2.3）強制檢查 |
