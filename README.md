# Final Presentation Workspace

期末報告專用獨立工作區，對應國道1號下營系統-麻豆段 4 匝道（2026/03）。
**不會修改外部目錄**（TDCSprecentater 根、ai_workspace、112021134、ppt工具）。

## 目標匝道

| GantryID | 方向 | 區段 |
|---|---|---|
| 01F2930N | 北上 | 下營系統 → 新營 |
| 01F2930S | 南下 | 新營 → 下營系統 |
| 01F3019N | 北上 | 麻豆 → 下營系統 |
| 01F3019S | 南下 | 下營系統 → 麻豆 |

## 執行順序

```bash
# 0) 前置：從 S3 下載 3 月原始資料
cp step0_s3_download/.env.example step0_s3_download/.env
# 編輯 .env 填入 AWS 金鑰與 S3_BUCKET
python step0_s3_download/download_from_s3.py
# -> step0_s3_download/raw_202603/*.csv

# 1) 清洗
python step1_cleaning/clean_202603.py
# -> step1_cleaning/cleaned_202603/{monthly,weekly,daily}/*.csv

# 2) 視覺化（兩類圖 × 4 匝道 + 1 張總覽）
python step2_visualization/viz_4gantries.py
# -> step2_visualization/charts/<Gantry>/*.png
# -> step2_visualization/charts/_overview_daily_total.png

# 3) AI 分析（需 GEMINI_API_KEY）
# 在 step3_ai_analysis/.env 或 ai_workspace/.env 設定 GEMINI_API_KEY
python step3_ai_analysis/analyze_all.py
# -> step3_ai_analysis/analysis_report.md

# 4) 產 PPT
# 用 ppt-maker (D:/p/ppt工具/ppt-maker/skills/ppt-master) 讀 step4_ppt/content.md
# -> step4_ppt/output.pptx
```

## 資料夾說明

```
final_presentation/
├── step0_s3_download/
│   ├── download_from_s3.py        從 s3://<bucket>/202603/ 下載所有 CSV
│   ├── .env.example
│   └── raw_202603/                下載目的地
├── step1_cleaning/
│   ├── clean_202603.py            4 匝道版（O/D 雙向命中）
│   └── cleaned_202603/            monthly/weekly/daily 輸出
├── step2_visualization/
│   ├── viz_4gantries.py           2 類圖迴圈
│   └── charts/
│       ├── _overview_daily_total.png
│       ├── 01F2930N/
│       ├── 01F2930S/
│       ├── 01F3019N/
│       └── 01F3019S/
├── step3_ai_analysis/
│   ├── analyze_all.py             CLI 版 Gemini 分析
│   ├── rag_knowledge.json         路段背景（下營/麻豆）
│   └── analysis_report.md         AI 產出（跑完 Step 3 才會有）
├── step4_ppt/
│   ├── content.md                 PPT 主檔（留空處標紅）
│   └── output.pptx                最終輸出
└── README.md
```

## 修改來源追溯

| 新檔 | 來源 | 改動 |
|---|---|---|
| step0/download_from_s3.py | D:/p/112021134/upload_only_2025.py 反向操作 | 改為 list+download |
| step1/clean_202603.py | TDCSprecentater/TDCS_M06A_Batch_Cleaning_202603.py | GantryID 清單、O/D 雙向、TargetGantry 欄位 |
| step2/viz_4gantries.py | TDCSprecentater/TDCS_M06A_Batch_Processing_05F0287N.py | 4 匝道迴圈、車種×星期新圖型 |
| step3/analyze_all.py | ai_workspace/src/tkinter_main.py 的 `_call_gemini_report` | 去 GUI、改讀 CSV 全量 + 圖表清單 |
| step3/rag_knowledge.json | ai_workspace/rag/rag_route_knowledge_full.json | 雪山隧道 → 下營/麻豆 |
