# Workflow Index — mcp_workspace

> 自動產生於 2026-06-02 20:18
> 當前活躍 0 個 / 已封存 5 個
> 重新產生：在專案根目錄跑 `python D:\p\workflow\scripts\index.py`
> **勿手改本檔**——要新內容請跑上面那行 script

---

## 🟢 當前活躍

（暫無活躍 PLAN。等 Lead 與 User 討論大方向後建立第一個 `PLAN_E1.md` + `實驗紀錄1.md`）

---

## 📚 已封存（時序）

| # | 紀錄 | PLAN | Phase | PLAN 內容 | 關鍵成果（封存前 Lead 手寫）| 事件數 | 期間 |
|---|---|---|---|---|---|---|---|
| 2 | [紀錄2](logs/實驗紀錄2.md) | — | — | — | _(待 Lead 在 PLAN 開頭加 `> **關鍵成果**：xxx`)_ | 0 | — |
| 3 | [紀錄3](logs/實驗紀錄3.md) | — | — | — | _(未填、最近事件)_ 事件 #1 跨工作區同步 — ai_workspace 發現的 M06A 邏輯陷阱（重要警示） | 1 | 2026-05-08 |
| 4 | [紀錄4](logs/實驗紀錄4.md) | — | — | — | _(待 Lead 在 PLAN 開頭加 `> **關鍵成果**：xxx`)_ | 0 | — |
| 5 | [紀錄5](logs/實驗紀錄5.md) | [E5](logs/PLAN_E5_done.md) | — | — | 6/2 完成 mcp_workspace v2 全鎖板 — 從「MCP server + RAG」pivot 到「CLI + AWS backend」；7 跳板實驗對照 4 指標、Winner = E6 純 client… | 8 | 2026-05-28 ~ 2026-06-02 |
| 6 | [紀錄6](logs/實驗紀錄6.md) | [E6](logs/PLAN_E6_done.md) | — | — | CLI v2 骨架交付：tdcs_clean TS 翻譯通過 baseline 14,058 行 md5=0 對齊、gantries_v4_1.json 339 個門架 ingest、endpoint 三層 priori… | 9 | 2026-06-02 |

---

## 💡 使用提示

- **「紀錄」/「PLAN」欄是超連結**——直接點開跳檔
- **「Phase」** = 從 PLAN/紀錄標題抽 B-X 或 PLAN_HOTFIX 之類標籤（自動）
- **「PLAN 內容」** = 從 PLAN 抽 `> **目標**：` + 前 2 個 Task header（自動）
- **「關鍵成果」**（封存表用） = **Lead 在封存前手寫到 PLAN 開頭**的 `> **關鍵成果**：xxx`（30-80 字、含關鍵數字 + 做了什麼）
  - 沒手寫時、fallback 顯示末事件（標 _(未填)_、表示需 Lead 補）
- **「事件數」** = 該紀錄裡 `## [日期] 事件 #N` 的總數
- **「期間」** = 紀錄第一個事件 ~ 最後一個事件日期
- 本 INDEX 是**唯一目錄**——新紀錄不需再寫 Compact 表（v0.6 設計、省手刻時間複雜度）
- **本檔自動產生、勿手改**；要更新跑 `index.py`（或跑 `archive.py` 會自動觸發）

### 📝 新封存流程（v0.6）

1. PLAN 全部 Task 完成、Lead 在 `PLAN_Ex.md` 開頭加一行 `> **關鍵成果**：xxx`（30-80 字精煉、含關鍵數字）
2. 跑 `python D:\p\workflow\scripts\archive.py --plan workflow/PLAN_Ex.md`
3. archive 自動 mv 到 logs/ + 自動 trigger index regen
4. 開 INDEX 確認「關鍵成果」欄已填
- 找東西配合 grep：
  ```bash
  grep -rn "關鍵字" workflow/logs/
  ```
