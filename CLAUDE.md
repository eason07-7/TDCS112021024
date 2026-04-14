# final_presentation/ 工作區守則

> 每次在此資料夾工作時 Claude 都會讀這份檔。**最高優先**。

## 工作範圍（硬規則）

- **可修改範圍**：`d:\p\TDCSprecentater\final_presentation\` 之內。
- **禁止修改**：此資料夾之外的任何檔案——包含但不限於：
  - `d:\p\TDCSprecentater\` 根目錄腳本（`TDCS_M06A_Batch_Cleaning_202603.py`、`TDCS_M06A_Batch_Processing_05F0287N.py` 等）
  - `d:\p\TDCSprecentater\ai_workspace\`（另一個專題）
  - `D:\p\112021134\`（下載原始資料的專題）
  - `D:\p\ppt工具\`（PPT 工具集）
- **外部檔案是唯讀參考**：要用任何邏輯就 **copy 一份到 final_presentation/ 再改**，絕不編輯原檔。

## 專題主軸

期末報告：國道1號 下營系統-麻豆段 2026/03 車流分析，目標匝道 `01F2930N/S`、`01F3019N/S`。
**最終產出**：依 `實驗記錄.md` 最上面的「PPT 製作規範」產出一份 PPT。

## 管線順序

```
step0 S3下載 → step1 清洗 → step2 視覺化 → step3 AI分析 → step4 PPT
```

每一步的腳本在對應資料夾中；執行方式見 `README.md`。

## 記錄要求（很重要）

**所有事件、決策、特殊處理、錯誤與修正**都要寫進 `實驗記錄.md`，格式：
- 加時間戳 `[YYYY-MM-DD HH:MM]`
- 簡述發生什麼、為何發生、怎麼處理、結果
- 包含但不限於：環境問題（session token 格式、bucket 名稱誤填）、腳本錯誤、資料異常、手動修補、跑的命令、進度採樣

不要只記「做了 X」——要記「為什麼這樣做、踩到什麼坑」。

## 外部參考（唯讀）

- `D:\p\112021134\DOWNLOAD_WORKFLOW.md` — 下載自動化參考
- `d:\p\TDCSprecentater\ai_workspace\src\tkinter_main.py` — Gemini API 呼叫邏輯原型
- `D:\p\ppt工具\ppt-maker\skills\ppt-master\scripts\` — PPT 產生工具
