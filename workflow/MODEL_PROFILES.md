# MODEL_PROFILES — 模型對照表 + 本專案 Worker 名冊

> 本檔由 `init_workflow.py` 從 workflow repo 複製過來、本專案 §0 已客製。
> 兩個區塊：(1) §0 本專案 Worker 名冊（**live、Lead 維護**）/ (2) §1+ 模型 profile 通用對照（生 prompt 時查）。

---

## 0. 本專案 Worker 名冊（live、Lead 維護）

> **目的**：讓任何進入本專案的新 session（Lead 或 worker）都能秒看「本專案實際用過誰、做過什麼」。

### 0.1 名冊

> **本專案規約覆蓋 `CLAUDE.md` §1.1 預設**：mcp_workspace **只用 4 個固定 worker、以模型為名**（不分 `{job}_worker` 任務領域命名）。
> Lead 派工時依任務性質從這 4 個挑一個；同 worker session 跨 PLAN 沿用、長期累積 codebase 熟悉度。

| Worker | 模型 | 首次派工 | 最後派工 | 任務領域（累積） | 狀態 |
|---|---|---|---|---|---|
| `opus_worker` | Claude Opus 4.8 | 2026-06-02 / PLAN_E6 / 階段審查 | **2026-06-04 / PLAN_E5-E7 gate audit + strategic review**（10 finding：4H+3M+3L、0 阻擋 E8；事件 #2 AWS reframe 提案、user 課程後參考） | **排錯 / audit 專責**（user 2026-06-04 拍板）：跨檔架構審查 / spec drift 排查 / PLAN 收尾 gate / strategic review；E6 audit（1C+3H+5M）+ E5-E7 gate audit | ⚪ 待命 |
| `opus_worker_2` | Claude Opus 4.8 | _(待派)_ | — | **Lead 主導 dev 任務執行**（user 2026-06-04 新增、與 opus_worker 分工）：code-heavy / 跨檔重構 / 複雜邏輯設計即實作 / 多面 trade-off 評估；**不做 audit**（audit 留 opus_worker） | ⏳ 待派 |
| `sonnet_worker` | Claude Sonnet 4.6 | 2026-06-02 / PLAN_E5 / M2-M3 | 2026-06-04 / PLAN_E7 M1-M5（terraform 骨架 + S3 marker + Lambda Container + API GW + Glue/Athena、5 milestone 全綠、4 次 spec drift 自抓） | E2/E3/E5-E7；CLI 骨架/TUI/Gantry/tdcs_clean/Baseline（E6 M1-M5）；E6 opus audit 6 finding 修補；E7 IaC + Lambda + Glue + Athena（M1-M5）| ⚪ 待命 |
| `deploy_worker` | Claude Opus 4.7 (1M ctx) | **2026-06-04 / PLAN_E7 M6**（遠端桌機 D:\p\mcp_workspace、Docker + Terraform + AWS CLI、15 resource apply + smoke 3 段全 PASS、3 個 PS workaround 自解） | 同首次 | **跨機器部署執行**（遠端桌機 deploy 場景、不寫 code 只跑部署）：terraform apply / docker push / smoke test；M6 為首次出場 | ⚪ 待命 |
| `gpt5_worker` | GPT-5 high | _(待派)_ | — | spec-clear 演算法實作 / 結構化邏輯 / 程式碼服從度高 | ⏳ 待派 |
| `haiku_worker` | Claude Haiku 4.5 | _(待派)_ | — | **最底層 worker**：規則性 / 重複性 / 批次 / 簡單任務（fixture 生成、typo 修、字串 replace、簡單 unit test、config 套、抽樣 verify、文字 formatting） | ⏳ 待派 |

**狀態圖示**：
- ⏳ **待派**：從未派過、第一次派需要**完整 onboard prompt**（含必讀檔清單 + 品質紀律 + 任務 spec + 紅線 + 完成動作）
- 🔧 **派工中**：當前正在跑任務
- ⚪ **待命**：曾派過、worker session 內已累積 context、**後續派工可用短指令續派**（只給「這次做 X、完成寫事件到 Y」即可）
- ❌ **退役**：本專案結束 / worker session 關閉、不再使用

### 0.2 派工原則（本專案）

1. **6 個 worker 固定、不開新名字**——依模型強項（§1+）選 worker、不依任務領域命名（2026-06-04 後新增 `deploy_worker` 處理跨機器部署場景、再新增 `opus_worker_2` 作 Lead dev 任務執行專責；`_2` 純 instance 區分、不違反「不依任務領域命名」原則、實質定位靠 onboarding prompt 告知）
2. **第一次派 = 完整 onboard**：含 `workflow/CLAUDE.md` + `MASTER_PLAN.md` + 當前 `PLAN_E<n>.md` + 當前實驗紀錄 + 品質紀律 §0.3 + 任務 spec + 紅線 + 完成動作
   - **例外**：`haiku_worker` 第一次 onboard 用**精簡版**（推理深度淺、長 context 易掉細節）、只讀 `CLAUDE.md §0.3 + §1 + §4` + `MODEL_PROFILES §0.1 + §1 Haiku profile` + `INDEX.md`
3. **第二次起 = 續派短指令**：worker session 已有 context、Lead 只給「本次任務 + 額外注意點 + 寫事件位置」即可、不需重灌必讀檔
4. **跨 PLAN 換 worker**：同任務領域可在不同 PLAN 換 worker（例如 M-1 sonnet、M-2 改 opus）、但「換新 worker 第一次派」=「⏳ 待派」要走完整 onboard
5. **狀態更新**：每次派工後 Lead 回 §0.1 改「最後派工」+「狀態」欄
6. **下派 haiku**（haiku 是 4 worker 中的特殊例外）：**Lead / sonnet_worker / gpt5_worker / opus_worker 三方都能直接派 haiku**、不必先回 Lead 同意。理由：
   - haiku 任務性質 = 純規則 / 批次 / 簡單套規則（不涉及架構決策）、不需 Lead 把關
   - 主 worker（sonnet / gpt5）跑到中段發現「這段 fixture / typo / format 我自己做太浪費 context」時、可立即出 haiku prompt 派工、省自己 context + 加速主任務
   - **§5.0 例外說明**：CLAUDE.md §5.0 規定「Lead 不得自派 worker、必須由 User 在另一介面新 session 啟動」、本條原則同樣套用 haiku 下派 — sonnet / gpt5 出 haiku prompt 後**仍交給 User 在另一介面新 session 啟動 haiku**、不是 sonnet 用 Agent / Task 工具同 session 內啟 sub-agent
   - haiku 完成後寫事件、執行者標籤 `[haiku_worker]`、註明「由 sonnet_worker / gpt5_worker 下派」(audit trail)
   - 派 haiku 的主 worker 必須在自己事件紀錄中**明示「我下派 haiku 做 X、結果 Y、納入主任務 Z」**

### 0.3 已用過的派工介面（User 端，隨用隨記）

> 規約只規定「Lead 不能自己派、要 User 在另一介面新 session 啟動」（見 `CLAUDE.md` §5.0）。
> User 實際用了哪些介面、記在這以利日後重現：

沿用 ai_workspace 已驗證的派工介面：
- Claude Code CLI（終端、最常用、`opus_worker` + `sonnet_worker` 走這條）
- Claude Code VS Code 插件（替代介面、context 較少時用）
- Codex（GPT-5 high、`gpt5_worker` 走這條）

---

## 1. 模型 profile 對照（通用、生 prompt 時查）

> **用途**：Lead 派工時、依「該 worker 用的模型」查強項/弱項/prompt tips、動態組合 onboarding 提示詞。
> **更新原則**：踩到新模型特性就回頭補。是 living doc。

---

## 用法（給 Lead）

1. 查 §0.1 名冊狀態：⏳ → 完整 onboard / ⚪ → 短指令續派
2. 決定派哪個 worker（依任務性質對 §1+ 強項）
3. 查本節對應 profile：強項利用、弱項規避、Prompt tips 直接套用
4. 組合最終 prompt（依狀態決定完整或短版）
5. 派工後回 §0.1 更新「最後派工」+「狀態」欄

---

## Claude 系列

### Opus 4.x（含 1M context 版本）

| 維度 | 內容 |
|---|---|
| **定位** | 旗艦推理模型 |
| **強項** | 跨檔長 context 理解（1M）/ 架構判斷 / 多面向 trade-off / 高品質寫作 / 程式碼設計判斷 |
| **弱項** | 成本高 / 簡單任務也認真想（性價比差） |
| **適合任務** | 架構重構、跨層 debug、長文件編輯（>300 行）、多檔關聯設計、Lead 角色本身 |
| **Prompt tips** | 給「為什麼」+「邊界」即可、不用過度 prompt engineering、自己會做 trade-off；可放心給整個檔讀；給設計目標、它會自己推導實作 |

### Sonnet 4.x

| 維度 | 內容 |
|---|---|
| **定位** | 平衡型 / 標準開發 |
| **強項** | 寫程式快、跨檔關聯不錯、性價比佳 / 文件撰寫流暢 / 終端密集型任務（git / pip / docker） |
| **弱項** | 從零設計新架構不如 Opus 穩 / 高 stakes 跨層判斷會略表面 |
| **適合任務** | 標準 CRUD 開發、單檔到中等檔數重構、文件 update、Bash heavy 任務、探索陌生 codebase |
| **Prompt tips** | 給 spec 清楚 + 目標檔列出 + 預期產出格式，會跑得快又準；不要餵超大 codebase（會迷失），分階段引導 |
| **Context window** | **預設 standard 200K**（Max plan 包含）。**1M context 是 Anthropic 另計費的 add-on、不在 Max subscription 內**、需 usage credits / API key pay-as-you-go 才能用。本專案 sonnet milestone scope 都 < 200K（PLAN_E7 M5 涉及 2 .tf 檔 + 4 必讀檔 << 200K），**預設用 standard 200K**、不主動切 1M。2026-06-04 PLAN_E7 M5 起 sonnet session 過大累積過 1M cap 報錯時，Lead 改派「精簡 onboard」短指令給新 200K session 接手 |

### Haiku 4.x

| 維度 | 內容 |
|---|---|
| **定位** | 輕量 / 高吞吐 / 低成本 |
| **強項** | 簡單分類 / 規則性判斷 / 短 prompt 短回答 / 大量平行任務 |
| **弱項** | 推理深度淺 / 不適合架構決策 / 長 context 容易掉細節 |
| **適合任務** | Intent classification、簡單摘要、規則套用、批次資料 tagging |
| **Prompt tips** | Prompt 要明確、結構化、給範例（few-shot）；不要要它做「判斷」或「設計」，要它「套規則」 |
| **本專案** | **本專案 worker 名冊含 `haiku_worker`（2026-06-02 後新增）**、作最底層 worker、接 Lead 下派的規則性 / 重複性子任務、節省主 worker context |

---

## GPT 系列（Codex / GPT-5+）

| 維度 | 內容 |
|---|---|
| **定位** | Spec 實作型 |
| **強項** | spec clear 時寫程式服從度高、不會自己亂改方向 / 演算法實作 / 結構化邏輯 |
| **弱項** | 不主動探索 codebase / 跨檔關聯弱於 Claude / 不擅長「邊做邊發現」 |
| **適合任務** | 已 well-defined 的單檔到多檔模組實作、演算法函式、結構化配置產生 |
| **Prompt tips** | spec 要寫到極致（input / output / 邊界 case / 不准做什麼），否則它會照字面執行；不要期望它推論 missing context |

---

## Gemini 系列

（依專案需要補；目前 default 不列，避免不準確的指引；本專案 worker 名冊不含）

---

## 本地模型（Ollama 系列：Llama / Qwen / DeepSeek 等）

| 維度 | 內容 |
|---|---|
| **定位** | 離線 / 隱私敏感 / 零成本 |
| **強項** | 不離本機 / 不限 quota / 可長時間 batch |
| **弱項** | 推理深度受參數量限制 / 中文能力參差不齊 / 跨檔 context 弱 |
| **適合任務** | 隱私敏感資料處理、大量本地批次摘要、實驗性 prompt 測試 |
| **Prompt tips** | 一次只交付一個明確任務；不要期待跨檔關聯；給 few-shot 範例最有效 |
| **本專案** | 本專案 worker 名冊不含、不派 |

---

## Worker 啟動提示詞 — 通用骨架（Lead 依此動態組合）

> 這不是 fixed template、是 Lead 寫 prompt 時的「**必要欄位清單**」。
> ⏳ 第一次派必全列；⚪ 續派可省略必讀檔 + 品質紀律段（worker session 已記得）。

```
你是 {opus|sonnet|gpt5}_worker（使用模型：{model_name}）。
主 Lead 派你來做：{單一聚焦任務一句話}。

## 必讀（按順序）        ← ⏳ 第一次派必貼；⚪ 續派可省略
1. workflow/CLAUDE.md
2. workflow/MASTER_PLAN.md
3. workflow/PLAN_E<n>.md（當前 PLAN）
4. workflow/INDEX.md（總目錄）+ workflow/實驗紀錄<n>.md 末尾最新 3 事件
5. {任務相關的特定檔案路徑}

## 任務範圍              ← 永遠要貼
- 要做：{1-3 個具體子任務}
- 不要做：{邊界，例如「不要動 X 檔」、「不要加新功能」}
- 期待產出：{檔案、commit、實驗紀錄事件、回報內容}

## 品質紀律（不可妥協）  ← ⏳ 第一次派必貼；⚪ 續派可省略
- **長期維護視角**：你寫的東西要假設 6 個月後有人接手；不寫 throwaway hack
- **工程合理性**：用對的工具、不過度也不過簡
- **邏輯正確性**：edge cases / 邊界條件 / spec 對齊
- **絕不允許**「先 hack 跑通、之後再修」——時間壓力下改用**里程碑式開發**（縮 scope、不降品質）

## 紅線（看到就 STOP 回報 Lead）   ← 永遠要貼
- {依任務性質列 2-4 條}
- 通用四條：
  (1) 環境問題
  (2) spec 不清楚或矛盾
  (3) 修法需動「主 Lead 在管的關鍵檔」
  (4) **時間壓力下想「先 hack 過去、之後再修」** → STOP 回報 Lead 重新評估 scope

## 完成後動作            ← 永遠要貼
- 寫一筆事件到 workflow/實驗紀錄<n>.md（依五段式格式、執行者標籤 [{worker_name}]）
- {commit / 不 commit / push / 不 push 的明確指示}
- 回報 Lead：{回報格式或關鍵欄位}

## 模型特性提醒（依 §1+）  ← ⏳ 第一次派必貼；⚪ 續派可省略
{Lead 從本檔抓對應模型的「Prompt tips」貼進來}

開始吧。第一件事：{第一次派 = 讀那 N 份檔；續派 = 直接執行}
```

---

## 維護紀錄

| 日期 | 變更 | 由誰 |
|---|---|---|
| 2026-05-28 | 初版（從 workflow template copy）+ 8 個預期 worker 名冊 | Lead |
| 2026-06-02 | User 校準：本專案只用 3 worker、以模型為名（`opus_worker` / `sonnet_worker` / `gpt5_worker`）；新增「⏳ 待派 vs ⚪ 待命」狀態語意（影響派工 prompt 完整度） | Lead+User |
| 2026-06-02 | User 新增 `haiku_worker`（Claude Haiku 4.5）作最底層 worker（接規則性 / 重複性子任務）；§0.2 加「下派 haiku」原則 + 第 6 條；Opus 4.7 → 4.8 | Lead+User |
