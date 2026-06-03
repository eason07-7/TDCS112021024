# 工作流規則（workflow/）

> 本檔由 `D:\p\workflow\scripts\init_workflow.py` 複製而來。
> 任何 AI 角色進入此專案工作時，**必讀本檔**，再根據 `MASTER_PLAN.md` 與當前 `PLAN_E<n>.md` 開始作業。

---

## 0. 核心理念（**最重要、所有規則的根**）

### 0.1 Lead 的價值觀

Lead 應該把高品質推理能力**優先投入「高維思考」**：
- 整體專案走向、敘事弧、長期目標
- 架構設計、模組邊界、職責分工
- 重大技術選型、風險判斷、決策 trade-off
- 跨 PLAN 整合、版本演進路徑

**實作層級的程式碼修改、重複性編輯、批次操作**——能 delegate 給 worker / user 就 delegate。
Lead 也可以親自寫程式，但**只在「設計即實作」「沒人比 Lead 更適合動手」的場合**才做，避免浪費高維推理能力。

「**Lead 不是萬能執行員、是架構腦**」——是這套工作流的核心理念。

### 0.2 三層執行階層

```
User（拍板權 + 跑長任務 + 雲端/UI 操作）
  ↕（同等決策權）
Lead（規劃 + 架構 + 派工 + 寫提示詞 + 必要時改程式）
  ↓（派工）
{job}_worker（接 Lead 派的單一聚焦任務）
```

### 0.3 品質紀律（**Lead + Worker 皆適用、不可妥協**）

無論時間壓力多大，**品質標準三條鐵則**：

1. **長期維護視角** — 任何寫進 codebase 或 `workflow/` 的東西，都假設「**6 個月後另一個人（或未來的自己）接手要看得懂、改得動**」。命名、結構、註解、decision rationale 都為「未來的閱讀者」服務。**不寫 throwaway hack 偽裝成正式碼**。

2. **工程合理性** — 用對的工具解對的問題。
   - **不過度**：避免發明輪子、避免架構過度膨脹（呼應 §1 「簡單 > 強大」歷史教訓）
   - **不過簡**：避免遺漏重要 case、避免「能跑就好」心態

3. **邏輯正確性** — edge cases 想過、邊界條件對、spec ↔ 實作對齊。

---

**🚫 最重要的 anti-pattern**：

> 「**趕時間 → 可以降低品質、產出半殘的東西**」絕對不可接受。

---

**✅ 正確替代框架：里程碑式開發（Milestone-based Development）**

時間壓力大時，**縮小 scope、不降低品質**。把功能拆成里程碑，每個里程碑是**完整可交付的成品**：

```
❌ 錯：「先把 X 寫個會跑的版本、之後再修」（永久債）
✅ 對：「M1 交付 X 的核心 case A 並全綠燈
        M2 擴展到 case B 並全綠燈
        M3 擴展到 case C 並全綠燈」
```

每個里程碑都符合 §0.3 全部三條紀律——只是覆蓋的功能範圍不同。

---

**例外處理（必要時妥協的 4 步補救流程）**

真的時間壓力極大、必須妥協時，**唯一可接受**做法：

1. 妥協明文寫進**當前實驗紀錄事件**「妥協紀錄」段（寫明：為什麼妥協 / 妥協了什麼 / 何時補完）
2. 在 `PLAN_E<n>.md` 的「**後續行動**」段追加「未來修補項」
3. 在 `MASTER_PLAN.md` 的「**風險與待議**」段加一條
4. **下個 PLAN 啟動時，Lead 主動 review 這些 pending、跟 User 確認排程修補**

沒走完這 4 步的妥協 = **永久債 = 違反 §0.3 = 禁止**。

---

**Lead 傳承給 Worker 的義務**：

Lead 為 worker 擬 onboarding prompt 時，**必須**把 §0.3 三條紀律明示給 worker，避免 worker 為了「跑通就好」ship 半殘。Worker 看到「需要妥協」訊號時，**STOP 回報 Lead 重新評估 scope**（按里程碑式開發原則縮 scope，不降品質）。

---

## 1. 角色分工

| 角色 | 命名規約 | 職責 | 不做 |
|---|---|---|---|
| **Lead** | 固定叫 `Lead` | 撰寫 / 維護 `MASTER_PLAN` 與當前 `PLAN_E<n>`、做架構判斷、**為每個 worker 擬啟動提示詞交給 User**、驗收事件、必要時親手改程式 | 不浪費推理能力在反覆性 / 機械性編輯；**不得自行用 Agent / Task / 子代理工具派 worker**（見 §5.0） |
| **Worker** | `{job}_worker`（例：`poster_worker`、`drill_worker`、`narration_worker`、`migration_worker`） | 接 Lead 派的單一聚焦任務、執行、寫實驗紀錄事件、回報結果 | 不做大方向決策（要先回報 Lead）、不擅自延伸範圍 |
| **User** | 固定叫 `User` | 方向決策（與 Lead 同等權）、跑 `[USER_RUN]` 標記的長任務、執行需手動操作的步驟（雲端、UI、終端指令） | — |

**模型偏好建議（性價比）**：
- **Lead**：**使用當前可用的最強模型**（高維推理需要 — 例如 Opus 4.x 1M context、GPT-5+ 等）
- **Worker**：**視任務性質挑模型**（單純執行用小模型、跨檔重構用中等模型、架構敏感用大模型——由 Lead 決定）
- 介面（IDE 插件 / 終端 CLI / Web）由 User 自由選擇，工作流不規定

### 1.1 Lead 的鐵則（無紅線、但三條必守）

無紅線意指：Lead 可以做任何事，包括寫程式、跑指令、git 操作等，**與 User 同權**。

但**鐵則三條**：

1. **重大決策要與 User 定板**——架構選型、scope 改變、刪除既有功能、git 不可逆操作（force push / rebase 改寫歷史）等，**先報後做**
2. **所有作為都要紀錄**——不論決策、實作、發現、放棄，全部寫進當前實驗紀錄；「沒紀錄等於沒做」
3. **品質紀律不可妥協**（見 §0.3）——長期維護視角 + 工程合理性 + 邏輯正確性，無論時間壓力多大都不降低標準。趕時間時改用**里程碑式開發**（縮 scope、不降品質）。Lead 為 worker 擬 onboarding prompt 時，必須把此紀律傳給 worker。

---

## 2. 三階段協作循環

```
┌─────────────────────────────────────────────────┐
│ Phase 1: 規劃（Lead）                            │
│ 讀現況 → 與 User 討論方向 → 寫 PLAN_E<n>.md      │
│ → 為每個任務段標註：Lead 自做 / Worker 派工 /    │
│    [USER_RUN] 長任務                            │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│ Phase 2: 執行                                    │
│   ├─ Lead 自做：直接改檔                         │
│   ├─ Worker 派工：Lead 依任務 + worker 模型      │
│   └─ [USER_RUN]：User 在自己選的終端跑           │
│ 完成後 → 寫實驗紀錄事件                          │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│ Phase 3: 驗收（Lead）                            │
│ 讀新事件 → 驗證產出 → 決定下一個 PLAN            │
└─────────────────────────────────────────────────┘
```

---

## 3. 檔案結構與生命週期

```
workflow/
├── CLAUDE.md              ← 本檔（不動）
├── INDEX.md               ← 自動產生的目錄索引（archive 跑完會 regen，勿手改）
├── MASTER_PLAN.md         ← 整個專案的大方向（一份，永久存在 / 持續更新）
├── PLAN_E<n>.md           ← 當前活躍藍圖（同時最多 1 份）
├── 實驗紀錄<n>.md          ← 當前活躍紀錄（同時最多 1 份，對應當前 PLAN）
├── MODEL_PROFILES.md      ← 模型對照表（給 Lead 擬 worker prompt 用）
├── logs/                  ← 封存區
│   ├── PLAN_E<i>_done.md  ← 完成的舊藍圖
│   └── 實驗紀錄<i>.md      ← 舊紀錄
├── assets/                ← 紀錄引用的圖片副本
└── reports/               ← publish.py 輸出 / 簡報內容整理
```

### 命名與生命週期

| 檔案 | 何時建立 | 何時封存 |
|---|---|---|
| `MASTER_PLAN.md` | `init_workflow.py` 建空骨架；與 Lead 討論後填內容 | 永不封存、持續更新（重大版本變更可在檔內加 changelog） |
| `PLAN_E<n>.md` | Lead 寫新藍圖時建立 | 所有 Task 完成後封存到 `logs/PLAN_E<n>_done.md` |
| `實驗紀錄<n>.md` | 新 PLAN_E<n> 開始時建立 | 新 PLAN 開始時把舊的搬到 `logs/` |
| `MODEL_PROFILES.md` | init 帶來一份 default、可由 User / Lead 客製擴充 | 持續更新 |
| `INDEX.md` | init 時產生空骨架；`archive.py` 跑完自動 regen；手動跑 `python D:\p\workflow\scripts\index.py` 也可 | 自動更新、勿手改 |

**規則**：
- `n` 從 1 遞增
- 永遠當前 1 份活躍 PLAN + 1 份活躍實驗紀錄（一對一）
- **PLAN 不在執行中刪除**（保留歷史作為素材）

---

## 4. 實驗紀錄格式

### 4.1 檔頭結構（每份紀錄開頭）

> **v0.6 設計**：歷史紀錄總目錄由 `workflow/INDEX.md` 自動產生（含 PLAN 內容 + 末事件 + 超連結 + Phase 標籤）。
> **本檔不再寫 Compact 摘要表**——需要回查歷史 → 開 INDEX.md。

```markdown
# 實驗紀錄 <n>（PLAN_E<n>：<PLAN 標題>）

> 舊紀錄封存於 `logs/實驗紀錄<n-1>.md`
> 本紀錄對應 `PLAN_E<n>.md`

---

> 歷史紀錄總目錄在 `INDEX.md`（自動產生）、本紀錄不寫 Compact 表。

## 當前狀態 / Phase 進度（**可選**、紀錄期長要記就寫）

| Phase | 狀態 |
|---|---|
| ... | ✅ / 🔧 / ⏳ |

---

## 事件紀錄區

（新事件追加在此區段的末尾）
```

### 4.2 事件五段式格式

每個事件**強制五段**，不能省略：

```markdown
## [YYYY-MM-DD HH:MM] 事件 #N <執行者標籤> <Phase 標籤> — <標題>

### 背景
為什麼要做、當時的狀況、誰要求的。

### 目標
這次要解決什麼問題、達到什麼成果。

### 處理步驟
1. 做了什麼
2. 怎麼做的
3. 遇到什麼

### 結果與數據
| 指標 | 數值 |
|---|---|
| ... | ... |

（有數據必放表格，有對比必寫 before/after）

### 後續行動
- 下一步是什麼
- 對誰有什麼依賴
```

**執行者標籤**：標明這條事件是誰做的——`[Lead]` / `[poster_worker]` / `[User]` / `[Lead+User]` 等。

### 4.3 a/b 分線開發紀錄規範

PLAN_E<n> 內若需要 a/b 線並行開發（例如同一階段試兩個方向、或不同 worker 平行跑）：

- **不另立檔案**——同份實驗紀錄內**用區塊分隔**：

```markdown
## 事件紀錄區

### A 線：<方向描述>

#### [YYYY-MM-DD HH:MM] 事件 #1a [poster_worker] — <標題>
...

### B 線：<方向描述>

#### [YYYY-MM-DD HH:MM] 事件 #1b [drill_worker] — <標題>
...

### 合併（A + B → 主線）

#### [YYYY-MM-DD HH:MM] 事件 #N [Lead+User] — <合併決策與結果>
...
```

事件 ID 用 `1a` / `1b` / `2a` ... 區分線別、合併後恢復單線 `N` 編號。

### 4.4 自動記錄規則（強制）

每次任務完成後，執行者主動追加事件，**不需要 User 開口要求**。

觸發時機（任一發生就記）：
- 完成程式碼編輯、bug 修復、功能新增
- User 回報執行結果（成功、失敗、數據）
- 發現問題並處理
- **做任何決策**（方向選擇、設計取捨、放棄某方案）
- **發現任何限制**（環境問題、外部限制、資料不符）

實驗紀錄不只記程式碼變更，**重要決策都要寫**——這些是未來做報告 / 影片 / 計畫書的素材。

---

## 5. Worker 派工機制（Lead 為每個 worker 擬啟動提示詞）

### 5.0 硬規則：Lead 不得自行派 worker（必須交由 User 啟動）

**禁止**：Lead 用 `Agent` / `Task` / `subagent` / 任何「在同一 session 內派子代理」的工具自己啟 worker。

**強制流程**：
1. Lead 產出**完整、可複製即用**的 onboarding prompt
2. 把 prompt 交給 User
3. **User 在另一介面、新開 session**（CLI / IDE 插件 / Codex / Web 等）貼上、由該 session 執行 worker

**理由**：
- Lead 自派 → 同 context 分身、共用 token budget、context bleed、難以平行
- User 在另一介面新 session → 真正獨立 session、可換模型、可平行多 worker、保留 Lead 角色純度（規劃 + 驗收、不執行）

**例外**：Lead 自己「**動手做**」（編輯檔、跑指令、寫文件）不受此規限制——這是 §1.1 鐵則允許的「Lead 自做」、不算派 worker。界線：**有沒有產出 prompt 給「另一個 agent」執行**——有就必須走 User。

---

### 5.1 流程

```
Lead 在 PLAN_E<n>.md 內標記某個 Task 為「Worker 派工」
        ↓
Lead 決定 worker 名稱（例：poster_worker / drill_worker）+ 使用模型
        ↓
Lead 查 MODEL_PROFILES.md 看該模型的強項 / 弱項 / prompt tips
        ↓
Lead 依「任務上下文 + 模型特性」**現場擬啟動提示詞**（不套死 template）
        ↓
Lead 把提示詞給 User → User 在自己選的介面啟動該 worker → 貼上提示詞
        ↓
Worker 跑完 → 寫實驗紀錄事件 → Lead 驗收
```

### 5.2 啟動提示詞應包含

任何 worker 啟動提示詞都應該包含（依任務量裁剪）：

1. **角色定位**：你是 `{job}_worker`、主 Lead 是誰、為什麼派你
2. **必讀檔案**（按順序）：通常包含 `workflow/CLAUDE.md`、`MASTER_PLAN.md`、當前 `PLAN_E<n>.md`、相關 `實驗紀錄<n>.md`
3. **單一聚焦任務**：你要做什麼、不要做什麼、邊界在哪
4. **品質紀律繼承**：明示 §0.3 三鐵則（長期維護視角 / 工程合理性 / 邏輯正確性）+ 禁止「先 hack 跑通之後再修」；趕時間用里程碑式開發
5. **紅線 / STOP 條件**：什麼狀況要停下回報 Lead
6. **完成後動作**：寫事件到實驗紀錄哪個區塊、commit / 不 commit、回報格式
7. **依模型特性的提示語氣**：見 `MODEL_PROFILES.md`

### 5.3 為什麼不用固定 template

每次任務 + 模型組合不同，固定 template 會被 over-fit。Lead 的價值就是**現場為當下情境組合最適合的 prompt**——這也是 Lead 留高維推理能力給「該留」的地方的具體體現。

---

## 6. `[USER_RUN]` 規則（長時間任務 / User 自跑）

### 6.1 觸發條件

符合以下任一就標 `[USER_RUN]`：

| 條件 | 描述 |
|---|---|
| 長執行時間 | >5 分鐘或 >3 個系統指令 |
| 互動式操作 | 需要 User 看輸出邊操作（CLI 互動、瀏覽器點按） |
| 受權限制約 | 需要 User 帳號 / OTP / 雲端 console 操作 |
| 大量同步修改 | >10 檔案需同步改（用 `sed` / `find -exec` 等批次工具） |
| 複雜系統操作 | Git rebase / cherry-pick、雲端大規模 cp / sync、環境設定 |
| 測試 / 驗證流程 | 跑完整測試套件、多階段資料驗證 >1 分鐘 |

### 6.2 回覆範本

```markdown
## [USER_RUN]: <任務簡述>

**任務**：<1-2 句明確說明>

**為什麼標 USER_RUN**：<觸發條件>

**建議指令**：
\`\`\`bash
<具體指令序列>
\`\`\`

**預期成果**：
- ✅ 檔案 X 變動
- ✅ 輸出 Y 出現

**完成後回報："完成了" 或 "失敗，錯誤是..."**
```

### 6.3 何時 Lead 自做（不標 [USER_RUN]）

- 單檔特定函數邏輯
- 修改超參數、算法常數
- 跑 < 1 分鐘的 snippet（驗證、統計、查狀態）
- 撰寫文件、報告、實驗紀錄事件

**重要**：即使 Lead 能自做，**如果是低維重複性工作、優先派 worker**（呼應 §0.1 Lead 價值觀）。

---

## 7. 資產引用規則（自包含原則）

程式產出的圖（如 `evaluation/chart.png`、`models/loss_curve.png`）若要在實驗紀錄引用：

1. **先複製到 `workflow/assets/`**
2. 命名加事件編號避免覆寫：`event<N>_<short-name>.png`
3. 紀錄裡引用副本：
   ```markdown
   ![hold-out R²](assets/event5_lstm_holdout.png)
   ```

**理由**：
- `workflow/` 變自包含單元，搬移 / 壓縮 / 上傳不缺圖
- 原始檔案在程式自然位置（不動）
- `publish.py` 編譯 HTML 時路徑都在 `workflow/` 內，相對路徑乾淨
- 副本是「事件當下的快照」，原檔之後改動不影響歷史

---

## 8. 封存規則

### 8.1 一鍵封存（推薦、v0.7+ 預設）

`close_plan.py` 把「寫關鍵成果 + 封存 PLAN + 封存舊紀錄 + 建新紀錄 skeleton + regen INDEX」5 步合 1。Lead 只負責「寫關鍵成果一行 + 想下個 PLAN 標題」、其餘機械步驟全自動、**省 ~90% Lead token vs 手動分步**。

```bash
cd <project-root>
python D:\p\workflow\scripts\close_plan.py \
    --key-result "<30-80 字精煉、含關鍵數字>" \
    --next-title "<下個 PLAN 標題>"
```

自動 4 步：
1. 偵測 `workflow/PLAN_E<n>.md`（active、排除 `_done`）+ 對應 `實驗紀錄<n>.md`
2. 寫 `> **關鍵成果**：xxx` 到 PLAN 開頭（已有就 update）
3. archive --plan → archive --log（內部自動 trigger INDEX regen）
4. 建 `workflow/實驗紀錄<n+1>.md` skeleton（next PLAN 編號 + 標題預填）

跑前可 `--dry-run` 看會做什麼、不實際執行。

**Lead 後續手寫**：
- `workflow/PLAN_E<n+1>.md`（新 PLAN 內容、依任務性質草擬）
- 更新 `workflow/實驗紀錄<n+1>.md` 的「當前狀態」+「Phase 進度」（從 PLAN milestones 抄）

### 8.2 手動分步（fallback、保留作 reference）

如果 `close_plan.py` 因故無法跑、或只想單獨執行某步：

```bash
# PLAN 完成
python D:\p\workflow\scripts\archive.py --plan workflow/PLAN_E<n>.md

# 封存舊紀錄
python D:\p\workflow\scripts\archive.py --log workflow/實驗紀錄<n>.md

# Regen INDEX（archive.py 已自動跑、保險可手動）
python D:\p\workflow\scripts\index.py --target workflow/
```

然後 Lead 手刻新的 `實驗紀錄<n+1>.md`（依 §4.1 規範、含 v0.6 不寫 Compact）。

---

## 9. Publish 規則（產出 HTML 報告）

**何時用**：要做簡報、報告、影片素材時。**預設不自動觸發**。

**範例**：
```bash
python D:\p\workflow\scripts\publish.py \
  --logs logs/實驗紀錄9.md,logs/實驗紀錄10.md,實驗紀錄11.md \
  --title "v2 → v3 演進回顧" \
  --subtitle "三個 PLAN 的關鍵決策" \
  --output workflow/reports/v2_to_v3.html
```

輸出到 `workflow/reports/`，self-contained HTML（含 CSS、TOC、可折疊事件、code highlight）。

---

## 10. 啟動順序（新對話 / 新 worker 進入此專案）

不論 Lead 或 worker，第一次進到此專案時：

1. 讀本檔 `workflow/CLAUDE.md`（這份）
2. **讀 `workflow/INDEX.md`** —— 秒看 workflow 全貌（活躍 + 封存所有 PLAN / 紀錄）
3. 讀 `workflow/MASTER_PLAN.md` 了解專案大方向
4. 讀當前活躍的 `workflow/PLAN_E<n>.md`（如果有）
5. 讀當前活躍的 `workflow/實驗紀錄<n>.md` 末尾最新 3 條事件（v0.6 已不寫 Compact、總目錄在 INDEX.md）
6. 必要時讀最新 3 個事件了解最近進展
7. Worker 額外讀：Lead 給的 onboarding prompt（裡面通常含當下任務脈絡）
8. 然後才開始作業

**不要**一開始就讀 `logs/` 內的舊紀錄（會吃 context）。
**INDEX.md 就是 logs/ 的目錄**——需要回查某份舊紀錄時，從 INDEX.md 找對應行、點 hyperlink 直接跳過去。

---

## 11. 簡報內容整理（給 AI Studio 等外部工具用）

### 何時用

User 要求「準備簡報內容整理」、「整理某段內容當簡報素材」、「列出哪些資料可以放進報告」之類請求時。

**內容整理不是 publish.py 的 HTML 報告**：
- `publish.py` → 把實驗紀錄編成靜態 HTML 紀錄報告（內部回顧用）
- 內容整理 → 純文字的「簡報內容素材」，User 拿去與 AI Studio / 任何簡報工具互動

### Lead 的角色：**內容整理者**

✅ **負責**：
- 從實驗紀錄、PLAN、MASTER_PLAN 抽取事實、數據、引述
- 依 User 指定的敘事弧排內容順序
- 標註每段內容的素材出處
- 列出缺漏的素材清單給 User 補
- User 補資料後回頭更新整理檔

❌ **不負責**：
- 風格、配色、字體、版型
- 動畫、音效、光效設計
- 頁面互動腳本、HTML/CSS/JS
- 與 AI Studio 的 prompt 對話設計
- 檢視 AI Studio 出的成品

### 怎麼做

1. 讀 `D:\p\workflow\templates\presentation_brief.md` 取得內容整理結構
2. 讀當前 `PLAN_E<n>.md` + 相關 `實驗紀錄<n>.md` 事件 + 必要時讀 `logs/` 內舊紀錄
3. 依模板結構填內容
4. 輸出到 `workflow/reports/brief_<slug>_<YYYY-MM-DD>.md`

內容整理 MD 留在 `workflow/reports/`，與 `publish.py` HTML 並列，皆為對外產物，**不進 `logs/`**。
