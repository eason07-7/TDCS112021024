# TDCS M06A 下營系統-麻豆段 期末報告

> PPT 內容主檔（餵給 ppt-maker 用）
> 風格：簡潔、重點清楚。留空處由使用者自行填寫。

---

## Slide 1 — 封面

**標題**：國道1號 下營系統-麻豆段 流量分析
**時間區間**：2026/03/01 ~ 2026/03/31

**目標交流道（4 匝道）**：
| GantryID | 方向 | 區段 |
|---|---|---|
| 01F2930N | 北上 | 下營系統 → 新營 |
| 01F2930S | 南下 | 新營 → 下營系統 |
| 01F3019N | 北上 | 麻豆 → 下營系統 |
| 01F3019S | 南下 | 下營系統 → 麻豆 |

**小組成員**（*<span style="color:red">請自行填寫</span>*）：

| 學號 | 姓名 | 貢獻度 | 負責內容 | YouTube URL |
|---|---|---|---|---|
| ______ | ______ | __% | ______ | ______ |
| ______ | ______ | __% | ______ | ______ |
| ______ | ______ | __% | ______ | ______ |
| ______ | ______ | __% | ______ | ______ |

> 貢獻度總和須介於 5%~5% 之間，依課程規範填寫。

---

## Slide 2 — 動機與目的

- **為何選此路段**：下營系統為國道1/國道8號交會節點，銜接台南市區、麻豆工業帶與嘉義方向，車流結構複雜，具分析價值。
- **研究問題**：
  1. 4 個目標匝道 3 月份的車流規律為何？
  2. 不同車種（小客車/貨車/客運/聯結車）在不同星期幾如何分布？
  3. 能否用自動化流程取代人工下載/清洗，讓分析可重現？
- **預期成果**：產出可重複執行的資料管線，以及 AI 輔助的跨檔案洞察。

---

## Slide 3 — TDCS 資料上傳 AWS S3

**流程**：HiNet TDCS → 本地 `112021134/202603/` → AWS S3 `s3://<bucket>/202603/`
**自動化**：`download_only_2025.py` 下載 + `upload_only_2025.py` 上傳，以 `_READY` 標記控制交接。

> **<span style="color:red">請放入 3 張截圖：</span>**
> - 1 週(7) S3 截圖
> - 2 週(8) S3 截圖
> - 3 週(9) S3 截圖
> - 1 個月(10) S3 截圖

```
[ 圖片位置 1：第 1 週完成 ]     [ 圖片位置 2：第 2 週完成 ]
[ 圖片位置 3：第 3 週完成 ]     [ 圖片位置 4：整月完成 ]
```

---

## Slide 4 — 觀察 4 匝道總車流

**4 匝道日總量比較**
![overview](../step2_visualization/charts/_overview_daily_total.png)

**各匝道 24H 逐日疊加**（選擇性展示）
![01F2930N 24H](../step2_visualization/charts/01F2930N/chart1_total_24H_01F2930N.png)
![01F2930S 24H](../step2_visualization/charts/01F2930S/chart1_total_24H_01F2930S.png)
![01F3019N 24H](../step2_visualization/charts/01F3019N/chart1_total_24H_01F3019N.png)
![01F3019S 24H](../step2_visualization/charts/01F3019S/chart1_total_24H_01F3019S.png)

**說明**（自 AI 分析報告摘錄）：詳見 [step3_ai_analysis/analysis_report.md](../step3_ai_analysis/analysis_report.md)

---

## Slide 5 — 不同車種 vs. 不同星期

![01F2930N VT×Weekday](../step2_visualization/charts/01F2930N/chart2_VT_vs_weekday_01F2930N.png)
![01F2930S VT×Weekday](../step2_visualization/charts/01F2930S/chart2_VT_vs_weekday_01F2930S.png)
![01F3019N VT×Weekday](../step2_visualization/charts/01F3019N/chart2_VT_vs_weekday_01F3019N.png)
![01F3019S VT×Weekday](../step2_visualization/charts/01F3019S/chart2_VT_vs_weekday_01F3019S.png)

**車種代碼**：VT=31 Sedan / 32 Pickup / 41 Bus / 42 Truck / 5 Trailer

---

## Slide 6 — 方法改進

**資料下載自動化**（兩腳本工作流，參考 [DOWNLOAD_WORKFLOW.md](D:/p/112021134/DOWNLOAD_WORKFLOW.md)）
- `download_only_2025.py`：逐月抓 tar.gz，完整度達標才寫 `_READY`
- `upload_only_2025.py`：輪詢 `_READY`，逐檔上傳 S3 + 大小驗證 + 清理本地
- `.env` 控制所有參數，AWS Token 過期會自動暫停不失資料

**分析端自動化**
- Step 0：`download_from_s3.py` 從 S3 一鍵拉回本地（本專題新增）
- Step 1：清洗腳本硬編 4 個 Gantry 目標，O 或 D 雙向命中
- Step 2：一支腳本迴圈 4 匝道各產 2 類圖
- Step 3：AI 串接 Gemini 2.5 Flash，自動跨檔分析

---

## Slide 7 — 資料正確性稽核

**做法**：引入 Gemini API Key，讓 AI 基於統計摘要（日均、尖峰、車種占比、異常日 z-score）做跨檔案稽核，自動指出需人工複核的日期與匝道。

**AI 分析報告位置**：[step3_ai_analysis/analysis_report.md](../step3_ai_analysis/analysis_report.md)

**摘錄**（待 Step 3 執行後替換）：
> *（此處由 analysis_report.md 的「資料正確性稽核」段落填入）*

---

## Slide 8 — 小組會議紀錄

**會議一**（*<span style="color:red">請自行填寫</span>*）
- 時間：______
- 地點：______
- 討論事項：______
- 檢討：______
- 照片：`[ 照片位置 ]`

**會議二**（*<span style="color:red">請自行填寫</span>*）
- 時間：______
- 地點：______
- 討論事項：______
- 檢討：______
- 照片：`[ 照片位置 ]`

---

## Slide 9 — 學習心得

（*<span style="color:red">每位組員皆須填寫，以下為版型</span>*）

**組員 1（學號 ______ 姓名 ______）**
> ______

**組員 2（學號 ______ 姓名 ______）**
> ______

**組員 3（學號 ______ 姓名 ______）**
> ______

**組員 4（學號 ______ 姓名 ______）**
> ______
