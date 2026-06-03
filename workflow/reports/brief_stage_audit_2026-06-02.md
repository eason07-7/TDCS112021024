# PLAN_E5+E6 階段審查 — opus_worker findings report

> 審查日期：2026-06-02
> 審查者：opus_worker（Claude Opus 4.8、第一次派工）
> 派工者：Lead
> 範圍：PLAN_E5 全部 + PLAN_E6 M1-M5 + cli/ codebase + 3 briefs + 期末規則 + 手冊 v4.1 PDF
> 方法：22 份檔逐筆讀、8 條維度 cross-check；gantry 資料對 PDF §3 逐筆 set 比對（pdfminer 重抽）；tdcs-clean.ts 邏輯對 brief/PLAN spec 對照

---

## §0 Executive summary

- **Critical**：1（F-C1）
- **High**：3（F-H1 / F-H2 / F-H3）
- **Medium**：5（F-M1 ~ F-M5）
- **Low**：2（F-L1 / F-L2）
- **Note**：4（F-N1 ~ F-N4）

**最關鍵 3 條 finding**：

1. **F-C1（Critical）**：`tdcs-clean.ts` 的 `cleanRawDf()` 只做 **O OR D 篩**，**完全沒有實作 PLAN_E6/M4 spec 白紙黑字要求的「嚴格穿越（trip_information regex）」**。`TripInformation` 被 parse 出來卻從未用於篩選。MASTER_PLAN §1.2/§2/§4 + brief_cleaning_arch §2 都把這個 core 描述成「嚴格穿越篩」——與實作矛盾。M5 baseline（Python 版同樣只做 O OR D）byte-level PASS，**結構上不可能抓到這個漏**——這正是 FR113/143 同一類「抽樣 + 自驗都漏」的問題。

2. **F-H1（High）**：`ingest_gantries_v4_1.py` 的 regex `\d{2}[A-Za-z]\d{4}[NS]` **物理上無法匹配 FR ramp（`05FR113S` 是兩字母+3 數字）**。User 修出來的 339（+2 FR、清 4 note）只存在於 `gantries_v4_1.json` 資料檔，**生成腳本沒修**。任何人重跑「可重跑」的 ingest 腳本 → 回到 337、覆寫 339、復活 4 個錯誤 note + diff report 退回 337。修補成了 throwaway（違反 §0.3 長期維護視角）。

3. **F-H3（High）**：事件 #2、#4 兩次 §0.3「4 步妥協補救」**第 3 步（寫進 MASTER_PLAN §7 風險與待議）都沒做**——§7 沒有「跨工作區污染」也沒有「抽樣覆蓋率不足 / FR 漏」條目；事件 #2 承諾的 `brief_requirements_2026-06-02.md`（釘住規則 11 章節）也沒產出。CLAUDE.md §0.3 明定「沒走完 4 步的妥協 = 永久債 = 禁止」。

**整體就緒度（進 PLAN_E7 前）：6.5 / 10**——CLI 骨架 + TS 翻譯工程品質高、gantry 資料經獨立重驗確認 339 = PDF（無殘漏）、M5 baseline 真實 PASS；但 F-C1 是必須在 PLAN_E7 動工前由 Lead 拍板的 spec 矛盾（決定產品到底做不做嚴格穿越篩），F-H1/F-H3 是會反咬後續 PLAN 的維護 / 流程債。**不建議在 F-C1 釐清前開 PLAN_E7。**

> **紅線判定**：F-C1 不影響 PLAN_E5 跳板實驗結論（E6 winner 是下載路由問題、與清洗邏輯無關），也非制度性 systematic 問題（是單一 spec↔impl 矛盾），故未觸發紅線 #1/#2、繼續完成審查並報告。22 份檔皆可讀、無 corrupt（紅線 #3 未觸發）。

---

## §1 Critical findings

### F-C1：清洗 core 只做 O OR D、未實作 spec 要求的「嚴格穿越篩」，且文件全篇宣稱有做

- **位置**：
  - 實作：`cli/src/lib/tdcs-clean.ts` `cleanRawDf()` line 174-183
  - spec（要求）：`workflow/PLAN_E6.md` line 123-125
  - 假性文件：`workflow/reports/brief_cleaning_arch_comparison_2026-06-02.md` §2 line 66、§0 line 9-19
  - 產品定位：`workflow/MASTER_PLAN.md` line 17 / 83 / 129 / 153 / 230 / 263 / 297
- **證據**：

  PLAN_E6/M4 spec 明確要求**兩段**邏輯：
  > （PLAN_E6 line 125）`clean_raw_df()` → 應用 `gantry_id_o OR gantry_id_d` 篩 **+ 嚴格穿越（trip_information regex）** + TargetGantry 標註

  實作只做了**第一段**（O OR D）、第二段（trip_information regex 嚴格穿越）完全缺席：
  > （tdcs-clean.ts line 174-179）
  > ```ts
  > // 匝道篩選（O OR D）
  > if (filterSet.size > 0) {
  >   const inO = filterSet.has(gidO);
  >   const inD = filterSet.has(gidD);
  >   if (!inO && !inD) continue;
  > }
  > ```
  > `TripInformation` 在 line 123 被 parse 進 `RawRow`、但整支檔案再無任何地方引用它。

  而 brief_cleaning_arch §2 line 66 **謊稱**這支 core 有做嚴格穿越：
  > `│ - clean_raw_df（嚴格穿越篩 + 任意 gantry 動態 filter）`

  且 brief_data_inventory §1.1 line 65（**團隊自己寫的**）明文點名 O OR D 是錯的：
  > 「**不能用 `gantry_id_o OR gantry_id_d IN (...)` 篩特定路段**……漏掉穿越者……（v1 87% noise）。**正解**：用 `regexp_like(trip_information, '<gantry>')`」

  brief_cleaning_arch §0 line 19 更宣稱「兩套結果不一致 = 至少一邊有 bug」——但 ai_workspace（雪山隧道、嚴格穿越）與 mcp（麻豆段、O OR D）**用的本來就是不同篩法、結果本該不同**，此框架會誤導未來 worker 把「正常差異」當 bug 去「修」。

- **嚴重度理由（為什麼 Critical）**：
  1. **PLAN_E6 完成定義被假性滿足**：M4 spec 要求嚴格穿越、實作沒做；M5 唯一的 gate（baseline 對齊）用的 Python `clean_202603.py` 同樣只做 O OR D，所以 37/37 md5 PASS **在結構上不可能偵測缺少嚴格穿越**。M4 被標 ✅，但按其自身 spec 並未完成。
  2. **會直接打爆 PLAN_E12**：MASTER_PLAN §4 PLAN_E12/M1 line 297 列了 demo case「2026/03 雪山隧道（嚴格穿越篩）」。現有 core 無嚴格穿越能力、跑雪山案例會回到 87% 雜訊（brief 自己警告過的歷史教訓）。
  3. **產品定位矛盾**：MASTER_PLAN §0 核心痛點（line 17）把「嚴格穿越篩」當差異化賣點、§1.2 把 M06A scope 定義為「嚴格穿越篩」、但出貨的 core 做不到。這是會被寫進期末報告的對外宣稱。
- **修補建議（給 Lead 拍板，非我動手）**：
  Lead 需先**定義產品到底要哪一種語意**——這是設計決策、不是 worker 能決定的：
  - **選項 A（麻豆段 = O OR D 是對的）**：麻豆 demo 量「上下交流道車流」（規則 R12「上下交流道」），O OR D 本來就是正解。則需把 MASTER_PLAN §1.2/§2/§4 + 2 briefs + PLAN_E6 M4 全部**停止稱「嚴格穿越篩」**、改成精確措辭（如「O/D 端點命中篩 + hourly aggregation」），並把「嚴格穿越」標為 PLAN_E9+ 的擴充能力；同時撤掉 PLAN_E12 的雪山嚴格穿越 case 或標為「需先補嚴格穿越模式」。
  - **選項 B（產品要做任意路段嚴格穿越）**：則 `tdcs-clean.ts` 需補一個 `crossingFilter`（trip_information regex、同時命中進+出 gantry）模式、與 O OR D 模式並存（麻豆 demo 走 O OR D、雪山 / 任意穿越走 crossing），並新增一個雪山 baseline 對齊（不能只靠麻豆 O OR D baseline 驗收）。
  - 兩條路都要：在 M4 翻譯邏輯文件裡明示「目前 core 只支援 O/D 端點篩、trip_information 解析為未使用的預留欄」，避免下一個 worker 誤判。
  - 派工建議：spec 釐清 = Lead；補 crossing 模式（若選 B）= `sonnet_worker` 續派 + 新增雪山 baseline gate（不可只看 md5 麻豆）。

---

## §2 High findings

### F-H1：gantry ingest 腳本 regex 抓不到 FR ramp、重跑會復活 337 並覆寫 User 的 339 修補

- **位置**：`cli/scripts/ingest_gantries_v4_1.py` line 43；產物 `cli/data/gantries_v4_1.json` / `gantries_diff_v3_4_to_v4_1.md`
- **證據**：
  > （line 43）`GANTRY_PATTERN = re.compile(r"(\d{2}[A-Za-z]\d{4}[NS])\s+([^\n]{2,40})")`

  此 pattern = 2 數字 + **單一字母** + **4 數字** + N/S。FR ramp `05FR113S` = 2 數字 + **FR 兩字母** + **3 數字** + S，**永遠 match 不到**。我用 pdfminer 重抽 §3 全文驗證：全表 339 個 gantry-like token 中，此 regex 漏掉的**恰好就是** `05FR113S` + `05FR143N`（其他國 1/1H/3/3甲 無 ramp 形式漏網——確認 User 的修補對「此 token pattern」是完整的）。
  - JSON 現況 ✅ 正確：339 IDs 與 PDF §3 token set **完全相等**（無多、無漏，麻豆 4 匝道在內）。
  - 但 339 是 **Lead 在事件 #4 手動寫回 JSON** 的結果，**腳本本身沒改**。diff report header 也只寫「自動產生 + Lead 手動修補」。
  - 後果：腳本被 PLAN_E6/M3 列為交付物且明示「**可重跑、官方手冊更新時 re-ingest**」（PLAN_E6 line 106）。任何人重跑 → `build_json` 產 337、`build_diff_report` 重算 route_counts（國5=12）、覆寫 JSON（丟 2 FR）、復活 4 個被清掉的錯誤 note（因為 `build_json` 從 v3.4 legacy 帶 `note`，line 116）、diff report 退回 337。
- **嚴重度理由**：修補成果只活在資料檔、不在 generator = throwaway hack 偽裝成正式碼（違反 §0.3 長期維護視角）。6 個月後手冊更新重跑、FR 漏 + 錯誤 note 全部無聲回歸、且沒人會發現（因為當初是 User 手動全表比對才抓到）。這是 F-C1 之外第二個「驗收機制抓不到的回歸地雷」。
- **修補建議**：把 FR 修補邏輯內建進 `ingest_gantries_v4_1.py`：(a) regex 放寬成涵蓋 `\d{2}[A-Za-z]{1,2}\d{3,4}[NS]`（已驗證放寬後 = 339）；(b) 把「4 個錯誤 note 清空」與「FR113/143 county/city 推定」做成腳本內的 post-process patch dict（明寫理由註解）；(c) `build_diff_report` 的「各路段門架數」「新增」會自動正確。派 `sonnet_worker` 或 `haiku_worker`（規則性修補、spec 清楚）。

### F-H2：§0.3「4 步妥協補救」第 3 步未完成 + 承諾的 brief_requirements 未產出

- **位置**：`workflow/實驗紀錄6.md` 事件 #2 line 179 / 事件 #4 line 325；`workflow/MASTER_PLAN.md` §7（line 396-411）；`workflow/reports/`（缺檔）
- **證據**：
  - 事件 #2（line 179）：「MASTER_PLAN §7 風險條目加『Lead 跨工作區污染風險』（**待 M5 後補 §7 時加**）」
  - 事件 #4（line 325）：「風險條目補進 MASTER_PLAN §7（**後續加**）」
  - 實際 MASTER_PLAN §7 11 條風險中**沒有**「跨工作區污染」、也**沒有**「gantry 抽樣覆蓋率不足 / FR 漏」。
  - 事件 #2 後續行動（line 188）：「寫 `workflow/reports/brief_requirements_2026-06-02.md` 把規則 11 章節結構釘住」——`reports/` 目錄下**不存在**此檔。
  - 事件 #2 承諾「PLAN_E6 後續行動加『Lead 每次提案前先讀本工作區 CLAUDE.md』自檢條」——PLAN_E6 無此條（PLAN_E6 只有「風險」段、無「後續行動」段）。
- **嚴重度理由**：CLAUDE.md §0.3 明定「**沒走完這 4 步的妥協 = 永久債 = 違反 §0.3 = 禁止**」。兩個自我檢討事件寫得很完整（步驟 1 ✅、修補項 2 ✅），但流程上**第 3 步（MASTER_PLAN 風險登記）系統性漏掉**。這恰好是「制度設計來防再犯、但防呆本身沒落地」——直接影響 PLAN_E7~E13 不再犯同類錯的保證。
- **修補建議**：Lead 補 MASTER_PLAN §7 兩條風險（跨工作區污染 + ingest/驗收覆蓋率）、產出 brief_requirements（可派 opus/sonnet、不擋 critical path 但 PLAN_E13 報告前必須有）、在下個 PLAN frontmatter 顯式 review 這兩條 pending。

### F-H3：roadmap / PLAN_E13 對「期末規則 11 章節 + 硬 deadline」覆蓋不全

- **位置**：`workflow/MASTER_PLAN.md` §4（PLAN_E13、line 304-312）+ §9（line 438-448）vs `workflow/reports/ref/_dump_期末作業規則.txt`
- **證據**：規則明列、且各有配分 / deadline，但 roadmap / 驗收標準**未對映**：
  - R15 **AWS Bill / Cost Explorer 費用分析（5%）**、R16 **小組會議紀錄 ≥2 次（3%）**、R17 **學習心得 每位組員（5%）**、R8 **GoogleMap 截圖 + URL**、R3 **小組互評**——這些 graded 項在 MASTER_PLAN §4/§9 完全沒出現。
  - PLAN_E13/M1 只寫「7 跳板實驗 narrative + 系統架構 + 與 ai_workspace 期中差異對比 + 對社群影響」，**沒列**規則要求的：動機目的、POC、Volume 統計（4/8/12 週）、數據分析（車種 / 每週 / 每月 / 上下交流道）、期中比較、Value、成本分析。
  - **硬 deadline**：上台分享 **6/8**、Youtube 連結 **6/9**、書面報告 PDF + 互評 **6/10**（今天 6/2）。roadmap 是 PLAN_E6（進行中）→ E7→E8→E9→E10→E11→E12→E13 共 8 個 PLAN 串接、**第一個可交付的 graded 產物（三件套）在最尾端 E13**。
  - 事件 #2（line 144）記 User 明示「不用管時間、只管質量」——時間 deprioritize 是**知情決策**、不是疏漏。但 §0.3 里程碑原則要求「每個里程碑是完整可交付成品」、目前 roadmap 對「graded 交付物」並無 6/10 的 minimum-viable fallback。
- **嚴重度理由**：影響後續所有 PLAN 的取捨；若 6/10 到時仍在 E8，無 graded 產物可交（Stage 1 麻豆段 manual 雖在、但規則要的是 AWS 整合 POC / Volume / 成本）。這不是要求「趕」，而是要求**定義出「到 6/10 一定交得出來的最小完整切片」**。
- **修補建議**：Lead 與 User 確認 6/10 的 fallback 交付切片（建議：Stage 1 麻豆 + 已完成的 CLI 清洗 core + backfill 12 週 Volume + 跳板 narrative + 成本截圖 + 會議紀錄 / 心得），把規則 11 章節逐項 map 到 PLAN（即 brief_requirements 的作用、見 F-H2）。

---

## §3 Medium findings

### F-M1：diff report「各路段門架數」表內部矛盾（國5=12 / 合計 337，但總覽 339）

- **位置**：`cli/data/gantries_diff_v3_4_to_v4_1.md` line 9-14（總覽）vs line 24-31（各路段門架數）
- **證據**：總覽「總數 v4.1 = **339**」；但「各路段門架數」表：國1 150 / 國1H 15 / 國3 156 / 國3甲 4 / **國5 12** = **337**。JSON 實際國5 = **14**（含 2 FR）。根因 = Lead 手改總覽到 339（事件 #4 line 300），但這張表是 `build_diff_report` 用 337 的 route_counts 生成的（腳本沒重跑、見 F-H1），漏改。
- **嚴重度理由**：此 diff report 被 PLAN_E6 列為「寫進期末報告 narrative」的素材；一張自相矛盾的表進報告會被老師抓。
- **修補建議**：國5 改 14（或修腳本後重生，連同 F-H1 一起處理）。

### F-M2：gantries_v4_1.json 未接進 TUI、Gantry.tsx 仍 12 placeholder + 「345」字樣

- **位置**：`cli/src/wizard/steps/Gantry.tsx` line 18-32（placeholder）、line 97（UI 文字）
- **證據**：
  - line 18 註解：「Placeholder data — M3 will replace with gantries_v4_1.json (**345 gantries**)」
  - line 97 UI：「（⚠ 示範資料，完整 **345** 個門架於 M3 版本更新）」
  - M3 已 ✅（事件 #3/#4）、`gantries_v4_1.json`（339）已產出，但 Gantry.tsx **仍用 12 個寫死 placeholder**、未 import JSON。事件 #1 妥協紀錄（實驗紀錄6 line 98）寫「M3 才換成 gantries_v4_1.json 完整 345 個」——**這個妥協的償還沒做完**（M3 只造了資料、沒接進 wizard）。
- **嚴重度理由**：M2 的 documented compromise（§0.3 第 1 步有、但 repayment 未落地）+ 活在 production code 的 stale「345」（真實 339）。屬未結清的妥協債。
- **修補建議**：Lead 確認「接 JSON 進 wizard」屬 PLAN_E6 還是 PLAN_E11；若延到 E11，需在 PLAN_E6 收尾 / PLAN_E11 spec 明文登記此 deferred 項（走完 §0.3）。至少先把 placeholder 註解 / UI 的「345」改 339 或改成「339（v4.1）」。

### F-M3：全工作區「345」stale 字樣 + PLAN_E6/M3 驗收標準「jq length ≥ 345」已不可能達成

- **位置**：`MASTER_PLAN.md` line 85 / 229；`PLAN_E6.md` line 22 / 97 / **109**；`實驗紀錄6.md` line 98（見 F-M2）
- **證據**：v4.1 權威數 = 339（已對 PDF 驗證）。但：
  - MASTER_PLAN §1.2 line 85：「依 TDCS 手冊 v4.1 §3 …（**345** 個 gantry…）」——把 v4.1 直接寫成 345（v4.1 其實 339；345 是 v3.4 `gantry_to_county.json` 的數）。
  - MASTER_PLAN §4 PLAN_E6/M3 line 229：「`gantries_v4_1.json`（**345** gantry + v3.4 diff）」
  - **PLAN_E6 line 109 驗收標準**：「`… gantries_v4_1.json | jq 'length'` 應 **≥ 345**」——現況 339 < 345，**此驗收條件邏輯上永遠不可能 pass**（卻 M3 已被標 ✅）。
- **嚴重度理由**：(a) v4.1=345 是事實錯誤（v4.1=339）；(b) M3 驗收標準與其交付物自相矛盾——M3 「通過」是因為大家心照不宣地忽略了這條，屬於「驗收標準形同虛設」。
- **修補建議**：全域把「v4.1 345」更正為 339（v3.4 的 345 維持不動、那是對的）；PLAN_E6 line 109 驗收改「= 339」並補一句「v3.4 345 → v4.1 339（移除 8 + 新增 2 FR）」。

### F-M4：lock-board「Glue ETL 不採用」vs 期末規則明列 Glue ETL 為計分項——緩解有 narrative，但風險未登記、且建立在未驗證的解讀上

- **位置**：`MASTER_PLAN.md` §0「AWS 處理層」（line 25）；`brief_cleaning_arch §3.3`（line 112-129）；規則 `_dump_期末作業規則.txt` R11 / R13
- **證據**：
  - 規則 R11（Volume 10%）：「Volume…: AWS Cloud9 + Preprocessing (資料前處理)+ **(AWS Glue ETL)** … 4 weeks(6%)/8 weeks(8%)/12 weeks(10%)」
  - 規則 R13（期中比較 15%）：「利用 AWS services 增加之效能(S3, **Cloud9, Glue**, Athena, RDS, RedShift, AMR, **Data Pipeline**, Cloudformation, **Step function**)…」
  - lock-board：「**Glue ETL 經科學評估不採用**」（只用 Glue Data Catalog、不用 Glue ETL/Spark）。
  - 緩解：brief_cleaning_arch §3.3 已寫好「為什麼選 Lambda 不選 Glue ETL」narrative（**這點做得好、減輕嚴重度**），並區分 Glue Data Catalog（用）≠ Glue ETL（不用）。
  - 但 §3.3 的關鍵假設是「R11 提供範例 Glue ETL、**不排他**、Lambda 也算資料前處理」——這是**對老師評分意圖的解讀、未驗證**。且 R11/R13 同時點名的 **Cloud9** 專案完全沒用。此風險**未進 MASTER_PLAN §7**。
- **嚴重度理由**：§0.3 工程合理性上「不為配分硬塞 Glue」是對的判斷（審查 prompt 自己也這麼定義），故非 Critical；但「Lambda 可頂 Glue ETL 計分」是賭老師接受、且未走風險登記。萬一評分嚴格按字面要 Glue ETL，Volume 那 10% 有風險。
- **修補建議**：(a) 把「Glue ETL 不採用 = 計分風險」寫進 MASTER_PLAN §7（明示緩解 = §3.3 narrative + Glue Data Catalog 仍在）；(b) Lead / User 評估是否在報告補一句 Cloud9 替代說明（本機 CLI 取代 Cloud9 IDE）；(c) 若可低成本，考慮跑一個 trivial Glue ETL job 當「我們評估過、附對照」的實證（非必要、僅 de-risk）。

### F-M5：MASTER_PLAN（3 worker）vs MODEL_PROFILES（4 worker、含 haiku）未對齊

- **位置**：`MASTER_PLAN.md` §0 line 32 + §6 D13 line 392 + §8.3 line 428-432（皆 3 worker）vs `MODEL_PROFILES.md` §0.1/§0.2（4 worker、含 `haiku_worker`）
- **證據**：MASTER_PLAN §0「`opus_worker` / `sonnet_worker` / `gpt5_worker` **三個固定**」、D13「→ **3 固定 worker**（opus/sonnet/gpt5）」、§8.3 表只列 3 個。MODEL_PROFILES §0.1 有 4 列（含 haiku_worker、2026-06-02 新增）、§0.2「**4 個 worker 固定**」、line 38「haiku 是 4 worker 中的特殊例外」。haiku 的新增只更新了 MODEL_PROFILES、沒同步回 MASTER_PLAN。
- **嚴重度理由**：兩份都是新 session 進場必讀的治理文件、數字直接打架。不影響 code、但影響派工依據一致性。
- **修補建議**：MASTER_PLAN §0 worker 欄 + §6 D13 + §8.3 表補 haiku_worker（與 MODEL_PROFILES 對齊）。

---

## §4 Low findings

### F-L1：package.json dead deps + type 套件放錯區

- **位置**：`cli/package.json` line 19 / 24 / 28 / 33
- **證據**：`pdf-parse`（事件 #3 已棄、改 pdfminer.six）、`csv-parse`（tdcs-clean.ts line 64 自己 `line.split(',')`、沒用）、`@types/figlet`（ASCII 已預生成嵌入、figlet 本體也不在 deps）皆未使用；`@types/csv-parse` / `@types/pdf-parse` 放在 `dependencies` 而非 `devDependencies`。
- **修補建議**：移除 dead deps、type 套件移 devDependencies。派 `haiku_worker` 即可。

### F-L2：Gantry.tsx 同時顯示代號 + section 名稱，與 lock-board D8「顯示代號不顯示名字」相左

- **位置**：`cli/src/wizard/steps/Gantry.tsx` line 111-114 vs `MASTER_PLAN.md` §6 D8 line 387 / §1.2 line 85
- **證據**：D8 / §1.2「顯示**代號**不顯示名字（簡潔）」；Gantry.tsx 每列印 `{g.id}` + dimColor `{g.route} {g.section}`（含名稱）。屬 placeholder UI、PLAN_E11 打磨範圍。
- **修補建議**：PLAN_E11 對齊 D8 時一併處理；現階段標記為 deferred 即可（不必現在改）。

---

## §5 Notes（觀察、無 action）

- **F-N1**：`tdcs-clean.ts readOneCsv` 用 `utf8` 讀（line 101），M4 spec 提過 BIG-5 / UTF-8。M06A raw 全 ASCII（無中文欄位）、故 md5 對齊不受影響；僅 spec 的編碼註記未顯式交代。若未來吃到含中文的產品（如站名）需重新評估。
- **F-N2**：`INDEX.md`（regen 於 16:49）顯示紀錄6 事件數 = 0、PLAN 內容 = 「—」，但實際已有 4 事件（18:00~23:30）。v0.6 設計上 active 列本就是封存前才填的 placeholder，屬已知行為；但「唯一目錄」對 active PLAN 顯示空白會讓新進 session 誤判進度。封存 PLAN_E6 時會自動 regen 修正。
- **F-N3**：diff report「移除 01F3525N/S」與「改名 01F3535N/S → 岡山-楠梓(北)/楠梓(北)-岡山」並存——被移除門架的 section 名稱被指派給另一個改名門架，看似 v4.1 的里程碑重編號而非單純刪除。JSON 已對 PDF 逐筆驗證為忠實（無資料錯），僅 diff narrative 未說明「重編號 vs 刪除」，期末報告引用時可補一句。
- **F-N4**：briefs / MASTER_PLAN 引用「期末報告 §5 Volume / §7 期中比較」的 §編號，與規則 xlsx 實際列序（R11 Volume / R13 期中比較）不是同一套編號系統。配分（10% / 15%）對得上、僅 §編號是團隊自訂；PLAN_E13 出報告時把「報告章節 ↔ 規則項」對映表做清楚即可。

---

## §6 跨檔對齊矩陣

| 鎖板項 | MASTER_PLAN §0 | PLAN_E6 spec | cli/ code reality | 對齊？ |
|---|---|---|---|---|
| **Glue ETL 不採用** | 明寫「科學評估不採用、報告寫 narrative」 | 不涉及（E7+）| E6 無 AWS code；brief_cleaning_arch §3.3 narrative 已備 | ⚠️ 與規則 R11/R13 計分項有張力、風險未登記 §7（F-M4）|
| **純 Lambda 處理層** | 明寫「< 15 min 短任務、Step Functions 留 E7+」 | 不涉及（E7+）| E6 不打 AWS、無違規 sneak-in（無 Step Functions/SQS）| ✅ |
| **Demo 主角 = 麻豆段、不污染雪山** | 明寫 4 匝道 ID + 不污染 | M2 placeholder 含麻豆 4 | Gantry.tsx placeholder **含雪山 05F0287/05F0055**（作通用 demo 示範、且 PLAN_E12 雪山 case 在 roadmap 內）| ⚠️ 非污染（E12 有雪山 case）但與事件 #4 高敏感度語境需 Lead 知情；另見 F-C1 雪山 case 與 core 能力衝突 |
| **endpoint hardcode default + config 留彈性** | 明寫兩層（env > file > default）| M6/M7 spec 完整 | M6/M7 ⏳ 未做；index.ts 只有 config **stub** | ✅（尚未到期、stub 標注清楚）|
| **E6 純 client-side winner** | 明寫 PoC = backfill_s3_2026.py | 不涉及 | backfill 腳本在 scripts/、E6 不重設計 | ✅ |
| **Gantry 顯示去 N/S（只顯代號）** | D8 明寫 | M2/M3 | Gantry.tsx 顯示代號**＋**名稱、且仍 placeholder（F-L2 / F-M2）| ❌（placeholder 階段、PLAN_E11 對齊）|
| **M06A「嚴格穿越篩」為清洗 spec** | §0/§1.2/§2/§4 全篇宣稱 | **M4 line 125 明列 trip_information regex** | **tdcs-clean.ts 只做 O OR D、無 trip_information 篩**（F-C1）| ❌ **Critical 矛盾** |
| **gantry 權威 = v4.1（339）** | §1.2 寫「v4.1 = 345」（錯）| 驗收「≥ 345」（不可能）| JSON = 339 = PDF ✅；ingest 腳本重跑 = 337（F-H1）| ❌ 數字全域 stale（F-M3）+ 腳本回歸（F-H1）|
| **3 vs 4 worker 名冊** | §0/§6/§8.3 = 3 | — | MODEL_PROFILES = 4（含 haiku）| ❌（F-M5）|
| **§0.3 4 步妥協流程** | §7 應登記 | 事件 #2/#4 承諾補 §7 | §7 無對應條目、brief_requirements 缺檔 | ❌（F-H3）|

---

## §7 你的整體評估

- **工程合理性**：⭐⭐⭐⭐☆ / 5 — 跳板 7 實驗的取捨（E6 winner / 棄 Glue ETL Spark / 純 Lambda）論證紮實、有實測有指標；TS 翻譯選「純 Array+Map 不用 polars」避免數字格式差異是對的判斷。扣分在 F-M4 的 Glue 計分風險未登記、F-L1 dead deps。
- **邏輯正確性**：⭐⭐⭐☆☆ / 5 — gantry 資料經獨立重驗確認 339 = PDF（零殘漏，這點很穩）、M5 baseline 37/37 md5 是真 PASS。但 **F-C1 是真實的 spec↔impl 矛盾**（core 缺嚴格穿越、文件卻宣稱有），且驗收 gate（M5 麻豆 O OR D baseline）結構上抓不到它——這正是 Lead 要我獵的 FR-class 漏。
- **長期維護視角**：⭐⭐⭐☆☆ / 5 — 事件五段式紀錄質量高、技術決策有留痕。但 F-H1（修補只在資料、generator 沒修 = 重跑回歸）+ F-H3（4 步妥協第 3 步系統性漏）是兩個典型的「未來接手會踩」維護債。
- **進入 PLAN_E7 前的就緒度**：**6.5 / 10**
- **建議**：**先別開 PLAN_E7**。優先序：(1) Lead 拍板 F-C1（產品要不要嚴格穿越篩、選 A 還 B）——這決定 tdcs-clean.ts 要不要補 crossing 模式、決定後續 Lambda handler 與 PLAN_E12 雪山 case 是否成立；(2) 修 F-H1 ingest 腳本（讓 339 可重生）+ F-M1/F-M3 數字校正（順手）；(3) 補 F-H3 的 §7 風險 + brief_requirements，把規則 11 章節釘住並定義 6/10 fallback 交付切片（F-H4）。F-M5 / F-L1 / F-L2 可併入下次 sonnet/haiku 續派順手清。資料與 baseline 的硬底子是好的，這些都是「對齊 + 防回歸 + 釐清 spec」的工作、不是重做。
