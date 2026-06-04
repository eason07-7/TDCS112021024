# 期末三件套 — 最終產出資料夾

> PLAN_E10 期末交付的**最終成品**預設輸出到這裡。

| 產出 | 檔案 | 由哪個 Milestone 產生 | 來源 |
|---|---|---|---|
| 📄 書面報告（PDF）| `期末書面報告.pdf` | M3（[USER_RUN] Pandoc xelatex）| 源 `../期末書面報告.md` |
| 🖼️ 簡報（HTML/PPT）| `期末簡報.html`（或 `.pptx`）| M5（[USER_RUN] AI Studio 動畫簡報）| brief `../brief_期末_2026-06-04.md` |
| 🎬 YouTube 影片 | （線上連結、不放檔）| M7 | 講稿 `../期末影片講稿.md` |

## 約定

- **最終成品（PDF / 簡報）放本資料夾**；可編輯的**源檔**（`.md` / `brief`）留在上層 `reports/`。
- 書面 PDF 由 `reports/` 跑 Pandoc、`-o 期末/期末書面報告.pdf`（見 `PLAN_E10.md` M3）。
- 簡報從 AI Studio 匯出後存成 `期末簡報.html`（或 `.pptx`）放這裡（見 `PLAN_E10.md` M5）。
- 繳交時直接打包本資料夾即可。
