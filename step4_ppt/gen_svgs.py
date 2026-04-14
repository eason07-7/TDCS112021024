# -*- coding: utf-8 -*-
"""Generate 16 SVG pages for TDCS final presentation (academic_defense style)."""
from pathlib import Path
from html import escape

PROJ = Path(__file__).parent / "tdcs_presentation_ppt169_20260414_095800"
OUT = PROJ / "svg_output"
OUT.mkdir(exist_ok=True)

# Template constants - 主題色 #a5743d (銅棕)
NAVY = "#a5743d"        # 主色
RED = "#6b4a23"         # 深色強調
BLUE = "#c89558"        # 次強調（偏亮）
LIGHT = "#f5ead8"       # 淺米色底
GRAY = "#666666"
DARK = "#333333"
MUTED = "#999999"
FONT = "Microsoft YaHei, Arial, sans-serif"
TEAM_NAME = "第 17 組 ‧ 關於我在無意間被隔壁車道的卡車學長撞成廢人這件事"
INTERCHANGE = "麻豆交流道"
MEMBERS = [
    ("112021004", "辛弈序"),
    ("113021091", "陳睿綸"),
    ("114021168", "謝晴如"),
    ("112021024", "謝秉宏"),
]

HEADER_TMPL = '''  <rect width="1280" height="720" fill="#FFFFFF"/>
  <rect x="0" y="0" width="1280" height="70" fill="{navy}"/>
  <rect x="0" y="0" width="6" height="70" fill="{red}"/>
  <text x="40" y="46" fill="#FFFFFF" font-family="{font}" font-size="28" font-weight="bold">{num} {title}</text>
  <text x="1220" y="46" text-anchor="end" fill="#FFFFFF" font-family="{font}" font-size="18" font-weight="bold">TDCS 2026/03</text>'''

FOOTER_TMPL = '''  <line x1="40" y1="665" x2="1240" y2="665" stroke="{light}" stroke-width="1"/>
  <text x="40" y="695" fill="{muted}" font-family="{font}" font-size="12">資料來源：高速公路局 TDCS M06A</text>
  <text x="640" y="695" text-anchor="middle" fill="{muted}" font-family="{font}" font-size="12">{section}</text>
  <text x="1220" y="695" text-anchor="end" fill="{gray}" font-family="{font}" font-size="14">{page}/16</text>'''

KEY_MSG_TMPL = '''  <rect x="0" y="70" width="1280" height="50" fill="{light}"/>
  <rect x="0" y="70" width="6" height="50" fill="{blue}"/>
  <text x="40" y="102" fill="{dark}" font-family="{font}" font-size="18">{msg}</text>'''


def svg_wrap(body: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">\n{body}\n</svg>\n'


def header(num: str, title: str) -> str:
    return HEADER_TMPL.format(navy=NAVY, red=RED, font=FONT, num=escape(num), title=escape(title))


def footer(section: str, page: int) -> str:
    return FOOTER_TMPL.format(light=LIGHT, muted=MUTED, font=FONT, section=escape(section), page=page, gray=GRAY)


def key_msg(msg: str) -> str:
    return KEY_MSG_TMPL.format(light=LIGHT, blue=BLUE, dark=DARK, font=FONT, msg=escape(msg))


def text(x, y, content, size=16, fill=DARK, weight="normal", anchor="start"):
    return (f'  <text x="{x}" y="{y}" text-anchor="{anchor}" fill="{fill}" '
            f'font-family="{FONT}" font-size="{size}" font-weight="{weight}">{escape(content)}</text>')


def rect(x, y, w, h, fill="#FFFFFF", stroke=None, rx=0, opacity=1):
    stroke_attr = f' stroke="{stroke}" stroke-width="1"' if stroke else ""
    rx_attr = f' rx="{rx}"' if rx else ""
    return f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"{stroke_attr}{rx_attr} opacity="{opacity}"/>'


def line(x1, y1, x2, y2, stroke=BLUE, w=2):
    return f'  <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{w}"/>'


def image(href, x, y, w, h):
    return f'  <image href="{href}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>'


# =============== Slides ===============

# 01 Cover
def slide_01():
    body = [
        '  <rect width="1280" height="720" fill="#FFFFFF"/>',
        f'  <rect x="0" y="0" width="1280" height="110" fill="{NAVY}"/>',
        f'  <rect x="0" y="0" width="8" height="110" fill="{RED}"/>',
        text(640, 68, "TDCS M06A 期末報告 ‧ 2026/03", 30, "#FFFFFF", "bold", "middle"),
        text(640, 215, INTERCHANGE, 78, NAVY, "bold", "middle"),
        text(640, 280, "下營系統-麻豆段 2026 年 3 月車流分析", 26, GRAY, "normal", "middle"),
        line(400, 320, 880, 320, BLUE, 2),
        f'  <circle cx="640" cy="320" r="6" fill="{BLUE}"/>',
        text(640, 370, TEAM_NAME, 20, DARK, "bold", "middle"),
        # member grid 2x2
    ]
    for i, (sid, name) in enumerate(MEMBERS):
        col = i % 2
        row = i // 2
        x = 340 + col * 320
        y = 420 + row * 70
        body.append(rect(x, y, 300, 54, fill=LIGHT, rx=8))
        body.append(rect(x, y, 6, 54, fill=NAVY, rx=3))
        body.append(text(x + 25, y + 35, sid, 20, NAVY, "bold"))
        body.append(text(x + 145, y + 35, name, 22, DARK, "bold"))
    body += [
        f'  <rect x="0" y="665" width="1280" height="55" fill="#F5F7FA"/>',
        text(640, 698, "2026 春季 期末報告 ‧ 資料期間 2026/03/01 ~ 2026/03/31", 14, MUTED, "normal", "middle"),
    ]
    return svg_wrap("\n".join(body))


# 02 TOC
def slide_02():
    items = [
        ("01", "交流道資訊", "目標 4 匝道與路段背景"),
        ("02", "組員分工", "貢獻與分工表"),
        ("03", "動機與目的", "為何選此路段"),
        ("04", "TDCS 資料", "S3 上傳流程"),
        ("05", "4 匝道總車流", "逐日 + 逐時觀察"),
        ("06", "車種 vs 星期", "VT 分布規律"),
        ("07", "方法改進", "自動化管線"),
        ("08", "資料正確性稽核", "AI 跨檔分析"),
        ("09", "會議記錄", "2 次會議紀要"),
        ("10", "學習心得", "組員 × 4"),
    ]
    body = [header("", "目  錄")]
    # 5 columns x 2 rows grid
    col_w, col_h = 228, 200
    gap_x, gap_y = 8, 16
    start_x, start_y = 40, 130
    for i, (num, title, desc) in enumerate(items):
        col = i % 5
        row = i // 5
        x = start_x + col * (col_w + gap_x)
        y = start_y + row * (col_h + gap_y)
        body.append(rect(x, y, col_w, col_h, fill=LIGHT, rx=8))
        body.append(rect(x, y, 6, col_h, fill=NAVY, rx=3))
        body.append(text(x + 20, y + 58, num, 40, NAVY, "bold"))
        body.append(text(x + 20, y + 105, title, 20, NAVY, "bold"))
        # wrap desc
        body.append(text(x + 20, y + 145, desc, 14, GRAY))
    body.append(footer("目錄", 2))
    return svg_wrap("\n".join(body))


# 03 交流道資訊
def slide_03():
    body = [header("01", "交流道資訊")]
    body.append(key_msg("國道1號 下營系統（K289） ~ 麻豆（K303），長約 14 km"))
    # Table
    body.append(rect(60, 150, 1160, 60, fill=NAVY, rx=6))
    headers = ["GantryID", "方向", "區段", "位置特性"]
    xs = [110, 340, 560, 900]
    for x, h in zip(xs, headers):
        body.append(text(x, 188, h, 20, "#FFFFFF", "bold"))
    rows = [
        ("01F2930N", "北上", "下營系統 → 新營", "銜接國道8號，南科通勤要道"),
        ("01F2930S", "南下", "新營 → 下營系統", "嘉南平原返鄉車流"),
        ("01F3019N", "北上", "麻豆 → 下營系統", "工業帶、港區物流"),
        ("01F3019S", "南下", "下營系統 → 麻豆", "觀光與物流混合"),
    ]
    for i, row in enumerate(rows):
        y = 220 + i * 60
        body.append(rect(60, y, 1160, 60, fill=LIGHT if i % 2 == 0 else "#FFFFFF", stroke="#D0D7E0"))
        for x, val in zip(xs, row):
            body.append(text(x, y + 38, val, 17, DARK))
    body.append(rect(60, 480, 1160, 140, fill="#F5F7FA", rx=6))
    body.append(text(80, 515, "路段特性", 20, NAVY, "bold"))
    body.append(text(80, 550, "• 下營系統為 國道1 × 國道8 交會節點，銜接台南市區與南科方向", 16, DARK))
    body.append(text(80, 580, "• 麻豆一帶為工業帶與港區物流要道，重型貨運占比明顯偏高", 16, DARK))
    body.append(text(80, 608, "• 本段 3 月資料量：14,058 筆小時彙總，約 152 萬筆原始車流紀錄", 16, DARK))
    body.append(footer("交流道資訊", 3))
    return svg_wrap("\n".join(body))


# 04 組員分工
def slide_04():
    body = [header("02", "組員分工")]
    body.append(key_msg(f"{TEAM_NAME}"))
    cols = ["學號", "姓名", "貢獻度", "負責內容", "YouTube URL"]
    xs = [110, 260, 410, 570, 900]
    body.append(rect(60, 150, 1160, 50, fill=NAVY, rx=6))
    for x, c in zip(xs, cols):
        body.append(text(x, 183, c, 18, "#FFFFFF", "bold"))
    for i, (sid, name) in enumerate(MEMBERS):
        y = 210 + i * 70
        body.append(rect(60, y, 1160, 70, fill=LIGHT if i % 2 == 0 else "#FFFFFF", stroke="#D0D7E0"))
        body.append(text(110, y + 45, sid, 16, DARK, "bold"))
        body.append(text(260, y + 45, name, 16, DARK, "bold"))
        body.append(text(410, y + 45, "____%", 16, MUTED))
        body.append(text(570, y + 45, "__________________", 15, MUTED))
        body.append(text(900, y + 45, "____________", 15, MUTED))
    body.append(rect(60, 510, 1160, 110, fill="#FFF7E6", rx=6, stroke="#FFD591"))
    body.append(text(80, 545, "填寫說明", 18, "#D46B08", "bold"))
    body.append(text(80, 578, "• 貢獻度總和依課程規範填寫；YouTube URL 為個人影音分享連結", 15, DARK))
    body.append(text(80, 605, "• 負責內容簡述：下載 / 清洗 / 視覺化 / AI 分析 / PPT / 心得 等", 15, DARK))
    body.append(footer("組員分工", 4))
    return svg_wrap("\n".join(body))


# 05 動機與目的
def slide_05():
    body = [header("03", "動機與目的")]
    body.append(key_msg("為何選下營-麻豆段？複雜交會節點 + 工業物流 + 南科通勤"))
    # Two column
    body.append(rect(60, 150, 560, 470, fill=LIGHT, rx=8))
    body.append(rect(60, 150, 6, 470, fill=NAVY, rx=3))
    body.append(text(90, 195, "選題動機", 24, NAVY, "bold"))
    motivations = [
        "國道1 × 國道8 交會節點",
        "銜接台南市區、南科通勤、",
        "麻豆工業帶與嘉義方向",
        "車流結構多元具分析價值",
    ]
    for i, m in enumerate(motivations):
        body.append(text(90, 240 + i * 40, f"• {m}", 18, DARK))
    body.append(rect(660, 150, 560, 470, fill=LIGHT, rx=8))
    body.append(rect(660, 150, 6, 470, fill=BLUE, rx=3))
    body.append(text(690, 195, "研究問題與目標", 24, NAVY, "bold"))
    goals = [
        "Q1  4 匝道 3 月車流規律為何？",
        "Q2  車種 × 星期分佈如何？",
        "Q3  能否以自動化取代人工？",
        "",
        "產出：可重複執行的資料管線",
        "      + AI 輔助跨檔洞察報告",
    ]
    for i, g in enumerate(goals):
        body.append(text(690, 240 + i * 40, g, 17, DARK))
    body.append(footer("動機與目的", 5))
    return svg_wrap("\n".join(body))


# 06 TDCS 資料上傳 S3
def slide_06():
    body = [header("04", "TDCS 資料（上傳 AWS S3）")]
    body.append(key_msg("HiNet TDCS → 本地 112021134/202603/ → AWS S3 s3://<bucket>/202603/"))
    # Flow boxes
    steps = [
        (80, "1. HiNet TDCS", "公開 CSV 來源"),
        (400, "2. 本地暫存", "download_only_2025.py"),
        (720, "3. AWS S3", "upload_only_2025.py"),
        (1040, "4. 本專題抓回", "download_from_s3.py"),
    ]
    for x, title, desc in steps:
        body.append(rect(x, 150, 180, 110, fill=LIGHT, stroke=NAVY, rx=8))
        body.append(text(x + 90, 195, title, 17, NAVY, "bold", "middle"))
        body.append(text(x + 90, 230, desc, 13, GRAY, "normal", "middle"))
        if x < 1000:
            body.append(f'  <text x="{x + 200}" y="215" text-anchor="middle" fill="{BLUE}" font-family="{FONT}" font-size="28" font-weight="bold">→</text>')
    # Screenshot placeholders
    body.append(text(640, 300, "S3 上傳進度截圖（請自行放入）", 20, NAVY, "bold", "middle"))
    labels = ["1 週 (7 天)", "2 週 (8~14)", "3 週 (15~21)", "整月 (22~31)"]
    for i, lbl in enumerate(labels):
        x = 80 + i * 300
        body.append(rect(x, 325, 260, 200, fill="#FAFAFA", stroke="#D9D9D9", rx=6))
        body.append(text(x + 130, 415, "[ 截圖位置 ]", 16, MUTED, "normal", "middle"))
        body.append(text(x + 130, 445, lbl, 14, DARK, "normal", "middle"))
    body.append(rect(60, 545, 1160, 75, fill="#FFF7E6", rx=6, stroke="#FFD591"))
    body.append(text(80, 575, "實際下載量", 17, "#D46B08", "bold"))
    body.append(text(80, 605, "741 / 744 CSV — 3/26 源頭缺 15、16、17 時 3 筆（詳見第 8 頁稽核）", 15, DARK))
    body.append(footer("TDCS 資料", 6))
    return svg_wrap("\n".join(body))


# 07 4 匝道總車流
def slide_07():
    body = [header("05", "觀察 4 匝道總車流")]
    body.append(key_msg("南科通勤造就顯著雙峰；週末 > 平日；3/26 全路段異常偏低"))
    # left: overview
    body.append(image("../images/_overview_daily_total.png", 40, 140, 720, 480))
    # right: 3 insights cards
    insights = [
        ("南科通勤雙峰", "新營→下營系統 上午 7 點尖峰 ~1,148 輛；下營→麻豆 下午 4 點尖峰 ~843 輛"),
        ("週末休閒車流", "下營→新營 週六日均 13,618 輛，高於平日 11,138~11,922 輛"),
        ("3/26 全路段異常", "四匝道 z 值 -2.71 ~ -3.57；建議人工複核當日事件"),
    ]
    for i, (t, d) in enumerate(insights):
        y = 150 + i * 155
        body.append(rect(780, y, 460, 140, fill=LIGHT, rx=8))
        body.append(rect(780, y, 6, 140, fill=BLUE, rx=3))
        body.append(text(800, y + 35, f"● {t}", 18, NAVY, "bold"))
        # wrap description - simple split
        words = d
        body.append(text(800, y + 72, words[:32], 14, DARK))
        if len(words) > 32:
            body.append(text(800, y + 98, words[32:64], 14, DARK))
        if len(words) > 64:
            body.append(text(800, y + 124, words[64:], 14, DARK))
    body.append(footer("4 匝道總車流", 7))
    return svg_wrap("\n".join(body))


# 08 車種 vs 星期
def slide_08():
    body = [header("06", "不同車種 VS. 不同星期")]
    body.append(key_msg("小客車為主力 60-68%；麻豆段重型貨運占比 ~17%，顯著高於新營段 ~10%"))
    # 4 images 2x2
    charts = [
        ("../images/chart2_VT_vs_weekday_01F2930N.png", 50, 140, "01F2930N 下營→新營"),
        ("../images/chart2_VT_vs_weekday_01F2930S.png", 660, 140, "01F2930S 新營→下營"),
        ("../images/chart2_VT_vs_weekday_01F3019N.png", 50, 395, "01F3019N 麻豆→下營"),
        ("../images/chart2_VT_vs_weekday_01F3019S.png", 660, 395, "01F3019S 下營→麻豆"),
    ]
    for href, x, y, lbl in charts:
        body.append(image(href, x, y, 570, 220))
        body.append(text(x + 285, y + 240, lbl, 14, NAVY, "bold", "middle"))
    body.append(rect(60, 640, 1160, 20, fill="#F5F7FA", rx=3))
    body.append(text(640, 656, "VT 代碼：31=小客車 Sedan  32=小貨車 Pickup  41=大客車 Bus  42=大貨車 Truck  5=聯結車 Trailer",
                     13, DARK, "normal", "middle"))
    body.append(footer("車種 vs 星期", 8))
    return svg_wrap("\n".join(body))


# 09 方法改進
def slide_09():
    body = [header("07", "方法改進")]
    body.append(key_msg("左：資料下載自動化流程圖　｜　右：AI API 自動分析流程圖"))

    # Helper: flow node (rounded rect with title + subtitle)
    def flow_node(x, y, w, h, title, subtitle, fill=LIGHT, bar=NAVY):
        parts = [
            rect(x, y, w, h, fill=fill, stroke="#D0D7E0", rx=8),
            rect(x, y, 6, h, fill=bar, rx=3),
            text(x + 20, y + 28, title, 15, NAVY, "bold"),
            text(x + 20, y + 50, subtitle, 11, GRAY),
        ]
        return parts

    # Helper: down arrow between nodes (x center, y1 bottom of prev, y2 top of next)
    def down_arrow(cx, y1, y2):
        return [
            f'  <line x1="{cx}" y1="{y1}" x2="{cx}" y2="{y2-8}" stroke="{NAVY}" stroke-width="2"/>',
            f'  <polygon points="{cx-6},{y2-8} {cx+6},{y2-8} {cx},{y2}" fill="{NAVY}"/>',
        ]

    # ===== Left: Data download flowchart =====
    body.append(text(320, 175, "資料下載自動化", 22, NAVY, "bold", "middle"))
    body.append(text(320, 198, "兩階段 Producer-Consumer 工作流", 13, GRAY, "normal", "middle"))

    left_nodes = [
        ("TDCS 公開 CSV 來源", "高速公路局 M06A 每日壓縮檔"),
        ("download_only_2025.py", "逐月下載 → 完整度達標寫 _READY"),
        ("本地暫存資料夾", "202603/ 按日期分目錄"),
        ("upload_only_2025.py", "輪詢 _READY → 逐檔上傳 S3"),
        ("AWS S3 Bucket", "s3://…trafficdatacollectionsyste/"),
    ]
    nx, nw, nh = 50, 540, 62
    gap = 14
    y0 = 215
    for i, (t, d) in enumerate(left_nodes):
        y = y0 + i * (nh + gap)
        body.extend(flow_node(nx, y, nw, nh, t, d))
        if i < len(left_nodes) - 1:
            body.extend(down_arrow(nx + nw / 2, y + nh, y + nh + gap))

    # ===== Right: AI analysis flowchart =====
    body.append(text(950, 175, "AI API 分析端", 22, NAVY, "bold", "middle"))
    body.append(text(950, 198, "Gemini 2.5 Flash 跨檔跑稽核", 13, GRAY, "normal", "middle"))

    right_nodes = [
        ("① 輸入資料", "cleaned 月彙總 CSV：14,058 列 × 31 天 × 4 匝道"),
        ("② compute_stats 前處理", "日均/std、尖峰/離峰、VT 占比、|z|≥2 異常日"),
        ("③ Prompt 組裝",
         "system（任務+格式約束）+ RAG 路段知識 5 chunks + stats JSON + 圖表清單 9 張"),
        ("④ Gemini 2.5 Flash",
         "temp=0.2 · top_p=0.8 · max_tokens=16384 · thinking_budget=2048"),
        ("⑤ analysis_report.md",
         "4 項發現（南科雙峰/週末/麻豆重貨/3-26 異常）+ 稽核段落"),
    ]
    nx2 = 680
    for i, (t, d) in enumerate(right_nodes):
        y = y0 + i * (nh + gap)
        body.extend(flow_node(nx2, y, nw, nh, t, d, bar=BLUE))
        if i < len(right_nodes) - 1:
            body.extend(down_arrow(nx2 + nw / 2, y + nh, y + nh + gap))

    body.append(footer("方法改進", 9))
    return svg_wrap("\n".join(body))


# 10 資料正確性稽核
def slide_10():
    body = [header("08", "資料正確性稽核")]
    body.append(key_msg("Gemini 2.5 Flash + z-score 跨檔稽核：3/7 偏高、3/26 偏低"))
    # Left: method
    body.append(rect(60, 150, 440, 470, fill=LIGHT, rx=8))
    body.append(rect(60, 150, 6, 470, fill=NAVY, rx=3))
    body.append(text(90, 195, "稽核方法", 22, NAVY, "bold"))
    methods = [
        "① 統計摘要",
        "   日均/尖峰/車種占比/異常",
        "② AI 跨檔分析",
        "   Gemini 2.5 Flash",
        "③ z-score ≥ 2 標記異常日",
        "④ 自動輸出 analysis_report.md",
    ]
    for i, m in enumerate(methods):
        body.append(text(90, 240 + i * 45, m, 16, DARK))
    # Right: findings
    body.append(rect(530, 150, 700, 470, fill="#FFFFFF", stroke="#D0D7E0", rx=8))
    body.append(text(550, 195, "關鍵發現", 22, NAVY, "bold"))
    # 3/7 warning
    body.append(rect(550, 215, 660, 95, fill="#FFF1F0", rx=6, stroke="#FFA39E"))
    body.append(text(570, 245, "▲ 3/7 偏高", 18, "#CF1322", "bold"))
    body.append(text(570, 272, "下營→新營 15,280 輛 (z=+3.10)", 14, DARK))
    body.append(text(570, 295, "新營→下營 16,674 輛 (z=+2.63)", 14, DARK))
    # 3/26 warning
    body.append(rect(550, 325, 660, 145, fill="#FFF7E6", rx=6, stroke="#FFD591"))
    body.append(text(570, 355, "▼ 3/26 全路段偏低", 18, "#D46B08", "bold"))
    body.append(text(570, 382, "下營→新營 z=-3.28；新營→下營 z=-3.57", 14, DARK))
    body.append(text(570, 405, "麻豆→下營 z=-3.08；下營→麻豆 z=-2.71", 14, DARK))
    body.append(text(570, 432, "原因：S3 源頭缺 15、16、17 時 3 筆", 14, "#D46B08"))
    body.append(text(570, 455, "（非本專題清洗瑕疵，已記錄事件 F）", 13, GRAY))
    # OK
    body.append(rect(550, 485, 660, 120, fill="#F6FFED", rx=6, stroke="#B7EB8F"))
    body.append(text(570, 515, "✓ 車種比例符合路段特性", 18, "#389E0D", "bold"))
    body.append(text(570, 542, "小客車 60~68%、Bus < 1%", 14, DARK))
    body.append(text(570, 565, "麻豆段重型貨運 ~17% vs 新營段 ~10%", 14, DARK))
    body.append(text(570, 590, "符合工業帶物流特徵", 13, GRAY))
    body.append(footer("資料正確性稽核", 10))
    return svg_wrap("\n".join(body))


# 11 會議記錄
def slide_11():
    body = [header("09", "會議記錄")]
    body.append(key_msg("至少 2 次會議紀錄，請自行填寫"))
    for i in range(2):
        x = 60 + i * 600
        body.append(rect(x, 150, 560, 470, fill="#FFFFFF", stroke="#D0D7E0", rx=8))
        body.append(rect(x, 150, 560, 50, fill=NAVY, rx=8))
        body.append(text(x + 280, 183, f"會議 {i+1}", 20, "#FFFFFF", "bold", "middle"))
        # fields
        fields = [("時間", "____________"), ("地點", "____________"),
                  ("討論事項", "________________________________"),
                  ("檢討", "________________________________")]
        for j, (k, v) in enumerate(fields):
            y = 220 + j * 45
            body.append(text(x + 30, y, k + "：", 16, NAVY, "bold"))
            body.append(text(x + 120, y, v, 15, MUTED))
        # photo box
        body.append(rect(x + 30, 415, 500, 180, fill="#FAFAFA", stroke="#D9D9D9", rx=6))
        body.append(text(x + 280, 505, "[ 照片位置 ]", 18, MUTED, "normal", "middle"))
        body.append(text(x + 280, 535, "請自行放入會議照片", 14, MUTED, "normal", "middle"))
    body.append(footer("會議記錄", 11))
    return svg_wrap("\n".join(body))


# 12-15 學習心得
def slide_reflection(page: int, idx: int):
    sid, name = MEMBERS[idx - 1]
    body = [header("10", f"學習心得 ‧ {name}")]
    body.append(key_msg(f"組員 {idx} / 4　{sid}　{name}　— 請自行填入貢獻與心得內文"))
    # Info box
    body.append(rect(60, 150, 1160, 110, fill=LIGHT, rx=8))
    body.append(rect(60, 150, 6, 110, fill=NAVY, rx=3))
    body.append(text(100, 195, "學號：", 22, NAVY, "bold"))
    body.append(text(200, 195, sid, 24, DARK, "bold"))
    body.append(text(460, 195, "姓名：", 22, NAVY, "bold"))
    body.append(text(560, 195, name, 24, DARK, "bold"))
    body.append(text(100, 240, "貢獻：", 18, NAVY, "bold"))
    body.append(text(200, 240, "____________________________________________________________", 18, MUTED))
    # content area
    body.append(rect(60, 285, 1160, 335, fill="#FFFFFF", stroke="#D0D7E0", rx=8))
    body.append(text(90, 325, "學習心得：", 20, NAVY, "bold"))
    for i in range(8):
        y = 375 + i * 30
        body.append(line(90, y, 1190, y, "#E0E0E0", 1))
    body.append(footer(f"學習心得 · {name}", page))
    return svg_wrap("\n".join(body))


# 16 Thank You
def slide_16():
    body = [
        '  <rect width="1280" height="720" fill="#FFFFFF"/>',
        f'  <rect x="0" y="0" width="1280" height="720" fill="{NAVY}"/>',
        f'  <rect x="0" y="0" width="1280" height="8" fill="{RED}"/>',
        text(640, 310, "Thank You", 100, "#FFFFFF", "bold", "middle"),
        text(640, 390, "感謝聆聽　歡迎提問", 32, "#e8d3b0", "normal", "middle"),
        line(500, 440, 780, 440, "#FFFFFF", 2),
        f'  <circle cx="640" cy="440" r="5" fill="#FFFFFF"/>',
        text(640, 510, f"{INTERCHANGE} ‧ TDCS M06A 2026/03 流量分析", 20, "#e8d3b0", "normal", "middle"),
        text(640, 555, "Q & A", 28, "#FFFFFF", "bold", "middle"),
    ]
    return svg_wrap("\n".join(body))


# Write all
slides = [
    ("01_cover.svg", slide_01()),
    ("02_toc.svg", slide_02()),
    ("03_interchange.svg", slide_03()),
    ("04_members.svg", slide_04()),
    ("05_motivation.svg", slide_05()),
    ("06_tdcs_s3.svg", slide_06()),
    ("07_traffic.svg", slide_07()),
    ("08_vehicle.svg", slide_08()),
    ("09_method.svg", slide_09()),
    ("10_audit.svg", slide_10()),
    ("11_meetings.svg", slide_11()),
    ("12_reflection_1.svg", slide_reflection(12, 1)),
    ("13_reflection_2.svg", slide_reflection(13, 2)),
    ("14_reflection_3.svg", slide_reflection(14, 3)),
    ("15_reflection_4.svg", slide_reflection(15, 4)),
    ("16_ending.svg", slide_16()),
]

for name, content in slides:
    (OUT / name).write_text(content, encoding="utf-8")
    print(f"[ok] {name}")

print(f"\n[done] {len(slides)} SVG 寫入 {OUT}")
