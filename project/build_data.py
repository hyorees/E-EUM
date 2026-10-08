import json
import os
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / "data"
JS_DIR = BASE / "js"

REGIONS = [
    "부산 권역",
    "광주·전남 권역",
    "대구·경북 권역",
    "충청 권역",
    "수도권 남부",
    "강원 권역",
    "전북 권역",
]

COORDS = {
    "부산 권역": (35.17955, 129.0756),
    "광주·전남 권역": (35.15954, 126.8526),
    "대구·경북 권역": (35.87143, 128.6014),
    "충청 권역": (36.35041, 127.3845),
    "수도권 남부": (37.26357, 127.0286),
    "강원 권역": (37.88536, 127.7298),
    "전북 권역": (35.82422, 127.148),
}


import re


def normalize_col_name(value):
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = text.replace("°", "")
    text = re.sub(r"[^0-9a-z가-힣]", "", text)
    return text


def load_excel_or_csv_candidates():
    candidates = []
    for name in ["simulation_data.xlsx", "simulation_data.csv", "weather.xlsx", "weather.csv", "outage.xlsx", "outage.csv"]:
        path = DATA_DIR / name
        if path.exists():
            candidates.append(path)
    return candidates


def detect_weather_sheet(df):
    text = " ".join(str(c) for c in df.columns)
    return any(token in text for token in ["일시", "기온", "풍속", "강수량", "temperature", "wind", "rain"])


def detect_outage_sheet(df):
    text = " ".join(str(c) for c in df.columns)
    return any(token in text for token in ["영향인구", "응급의료기관", "병원", "복구시간", "population", "hospital", "repair"])


def read_sheet_data():
    candidates = load_excel_or_csv_candidates()
    if not candidates:
        raise FileNotFoundError("데이터 파일이 없습니다. data/simulation_data.xlsx 또는 CSV를 넣어주세요.")

    csv_candidates = [p for p in candidates if p.suffix.lower() == ".csv"]
    xlsx_candidates = [p for p in candidates if p.suffix.lower() in {".xlsx", ".xls"}]

    for path in xlsx_candidates + csv_candidates:
        try:
            if path.suffix.lower() == ".csv":
                df = pd.read_csv(path, encoding="utf-8-sig")
                return df
            xls = pd.ExcelFile(path)
            for sheet_name in xls.sheet_names:
                df = pd.read_excel(path, sheet_name=sheet_name)
                if detect_weather_sheet(df):
                    return df, sheet_name, "weather"
                if detect_outage_sheet(df):
                    return df, sheet_name, "outage"
            for sheet_name in xls.sheet_names:
                df = pd.read_excel(path, sheet_name=sheet_name)
                if len(df.columns) >= 3:
                    return df, sheet_name, "auto"
        except Exception:
            continue

    raise RuntimeError(f"Excel/CSV 시트를 읽을 수 없습니다: {[str(p) for p in candidates]}")


def normalize_weather_df(df):
    cols = {normalize_col_name(c): c for c in df.columns}
    date_col = None
    for key in ["일시", "시간", "datetime", "date"]:
        if normalize_col_name(key) in cols:
            date_col = cols[normalize_col_name(key)]
            break

    region_col = None
    for key in ["지역", "region"]:
        if normalize_col_name(key) in cols:
            region_col = cols[normalize_col_name(key)]
            break

    temp_col = None
    for key in ["기온c", "기온", "temp", "temperature"]:
        if normalize_col_name(key) in cols:
            temp_col = cols[normalize_col_name(key)]
            break

    wind_col = None
    for key in ["풍속ms", "풍속", "wind", "windspeed"]:
        if normalize_col_name(key) in cols:
            wind_col = cols[normalize_col_name(key)]
            break

    rain_col = None
    for key in ["강수량mm", "강수량", "rain", "precipitation"]:
        if normalize_col_name(key) in cols:
            rain_col = cols[normalize_col_name(key)]
            break

    if not (date_col and region_col and temp_col and wind_col and rain_col):
        raise ValueError(f"기상 시트 컬럼이 올바르지 않습니다: {list(df.columns)}")

    out = df[[date_col, region_col, temp_col, wind_col, rain_col]].copy()
    out = out.rename(columns={date_col: "일시", region_col: "지역", temp_col: "기온(°C)", wind_col: "풍속(m/s)", rain_col: "강수량(mm)"})
    out["일시"] = pd.to_datetime(out["일시"], errors="coerce")
    out["지역"] = out["지역"].map(lambda x: str(x).strip())
    out = out.dropna(subset=["일시", "지역"]).copy()
    return out


def normalize_outage_df(df):
    cols = {normalize_col_name(c): c for c in df.columns}
    region_col = None
    for key in ["지역", "region"]:
        if normalize_col_name(key) in cols:
            region_col = cols[normalize_col_name(key)]
            break
    pop_col = None
    for key in ["영향인구명", "영향인구", "population", "pop"]:
        if normalize_col_name(key) in cols:
            pop_col = cols[normalize_col_name(key)]
            break
    hosp_col = None
    for key in ["응급의료기관개소", "응급의료기관", "병원수", "hospitals", "hospital"]:
        if normalize_col_name(key) in cols:
            hosp_col = cols[normalize_col_name(key)]
            break
    est_col = None
    for key in ["예상복구시간h", "복구시간h", "예상복구시간", "복구시간", "durationh", "esthours"]:
        if normalize_col_name(key) in cols:
            est_col = cols[normalize_col_name(key)]
            break

    if not (region_col and pop_col and hosp_col and est_col):
        raise ValueError(f"정전 시트 컬럼이 올바르지 않습니다: {list(df.columns)}")

    out = df[[region_col, pop_col, hosp_col, est_col]].copy()
    out = out.rename(columns={region_col: "지역", pop_col: "영향인구(명)", hosp_col: "응급의료기관(개소)", est_col: "예상복구시간(h)"})
    out["지역"] = out["지역"].map(lambda x: str(x).strip())
    out = out.dropna(subset=["지역"]).copy()
    out["영향인구(명)"] = pd.to_numeric(out["영향인구(명)"], errors="coerce").fillna(0).astype(int)
    out["응급의료기관(개소)"] = pd.to_numeric(out["응급의료기관(개소)"], errors="coerce").fillna(0).astype(int)
    out["예상복구시간(h)"] = pd.to_numeric(out["예상복구시간(h)"], errors="coerce").fillna(0.0)
    return out


def generate_weather_js(df_weather):
    df = df_weather.copy()
    df = df.sort_values(["지역", "일시"]).reset_index(drop=True)
    event_i = max(0, len(df["일시"].drop_duplicates()) // 2)

    weather_meta = {
        "start": df["일시"].min().strftime("%Y-%m-%d %H:00"),
        "n": int(df["일시"].sort_values().nunique()),
        "stations": REGIONS,
        "last": max(0, int(df["일시"].sort_values().nunique()) - 1),
    }
    weather_events = [{"i": event_i, "label": "📊 분석 시점 기준 기상 데이터"}]

    hourly_weather = {}
    for region in REGIONS:
        subset = df[df["지역"] == region].sort_values("일시").reset_index(drop=True)
        hourly_weather[region] = {
            "t": [round(float(x), 1) for x in subset["기온(°C)"].tolist()],
            "w": [round(float(x), 1) for x in subset["풍속(m/s)"].tolist()],
            "wm": [round(float(x), 1) for x in subset["풍속(m/s)"].tolist()],
            "wms": [0] * len(subset),
            "r": [round(float(x), 1) for x in subset["강수량(mm)"].tolist()],
            "rs": [0] * len(subset),
            "r24": [round(float(x), 1) for x in subset["강수량(mm)"].tolist()],
            "r24s": [0] * len(subset),
            "n": 1,
        }

    weather_js = (
        "const weatherMeta = " + json.dumps(weather_meta, ensure_ascii=False) + ";\n"
        "const weatherEvents = " + json.dumps(weather_events, ensure_ascii=False) + ";\n"
        "const weatherHourly = " + json.dumps(hourly_weather, ensure_ascii=False) + ";\n"
        "window.weatherMeta = weatherMeta;\n"
        "window.weatherEvents = weatherEvents;\n"
        "window.weatherHourly = weatherHourly;\n"
    )
    with open(JS_DIR / "weather.js", "w", encoding="utf-8") as f:
        f.write(weather_js)


def compute_priority_score(row):
    pop = float(row["영향인구(명)"]) if "영향인구(명)" in row else 0.0
    hosp = float(row["응급의료기관(개소)"]) if "응급의료기관(개소)" in row else 0.0
    est = float(row["예상복구시간(h)"]) if "예상복구시간(h)" in row else 0.0
    wind = float(row.get("풍속(m/s)", 0.0) or 0.0)
    rain = float(row.get("강수량(mm)", 0.0) or 0.0)

    max_pop = max(float(v["영향인구(명)"]) for v in row.to_dict().items() if False)
    # 실제 계산은 호출부에서 전역 범위를 기준으로 처리합니다.
    return 0.0


def generate_data_js(df_outage, df_weather=None):
    weather_by_region = {}
    if df_weather is not None:
        weather_df = df_weather.copy()
        weather_df["지역"] = weather_df["지역"].astype(str).str.strip()
        weather_df["기온(°C)"] = pd.to_numeric(weather_df["기온(°C)"], errors="coerce")
        weather_df["풍속(m/s)"] = pd.to_numeric(weather_df["풍속(m/s)"], errors="coerce").fillna(0)
        weather_df["강수량(mm)"] = pd.to_numeric(weather_df["강수량(mm)"], errors="coerce").fillna(0)
        for region, group in weather_df.groupby("지역"):
            weather_by_region[region] = {
                "temperature": float(group["기온(°C)"].mean()) if not group.empty else 0.0,
                "wind_speed": float(group["풍속(m/s)"].max()) if not group.empty else 0.0,
                "precipitation": float(group["강수량(mm)"].max()) if not group.empty else 0.0,
            }

    outage_rows = []
    if df_outage is not None and not df_outage.empty:
        max_pop = float(df_outage["영향인구(명)"].max()) if not df_outage.empty else 1.0
        max_hosp = float(df_outage["응급의료기관(개소)"].max()) if not df_outage.empty else 1.0
        max_wind = max(
            [float(v.get("wind_speed", 0.0) or 0.0) for v in weather_by_region.values()],
            default=25.0,
        )
        max_rain = max(
            [float(v.get("precipitation", 0.0) or 0.0) for v in weather_by_region.values()],
            default=60.0,
        )
        max_est = float(df_outage["예상복구시간(h)"].max()) if not df_outage.empty else 8.0

        for idx, row in df_outage.reset_index(drop=True).iterrows():
            region = str(row["지역"]).strip()
            weather = weather_by_region.get(region, {})
            pop = float(row["영향인구(명)"]) if "영향인구(명)" in row else 0.0
            hosp = float(row["응급의료기관(개소)"]) if "응급의료기관(개소)" in row else 0.0
            est = float(row["예상복구시간(h)"]) if "예상복구시간(h)" in row else 0.0
            wind = float(weather.get("wind_speed", 0.0) or 0.0)
            rain = float(weather.get("precipitation", 0.0) or 0.0)

            raw_score = (pop / max_pop) * 42 + (hosp / max_hosp) * 28 + (wind / max_wind) * 18 + (rain / max_rain) * 12 + max(0.0, (8.0 - est) / 8.0) * 10
            score = max(0.0, min(100.0, raw_score))
            level = "critical" if score >= 80 else "high" if score >= 60 else "mid" if score >= 40 else "low"

            outage_rows.append({
                "id": idx + 1,
                "region": region,
                "lat": COORDS.get(region, (0, 0))[0],
                "lng": COORDS.get(region, (0, 0))[1],
                "pop": int(pop),
                "hosp": int(hosp),
                "est_hours": est,
                "temperature": float(weather.get("temperature", 0.0) or 0.0),
                "wind_speed": wind,
                "precipitation": rain,
                "score": round(score, 1),
                "level": level,
            })

    js = "window.outageData = " + json.dumps(outage_rows, ensure_ascii=False, indent=2) + ";\n"
    js += "let outageData = window.outageData;\n\n"
    js += """const scenarioData = {
  A:{name:"A. 사회적 피해 최소화", short:"피해 최소화", rule:"우선순위 점수 ÷ 복구 소요시간이 큰 구역부터", desc:"영향 인구·중요시설·기상 위험을 종합한 우선순위 점수가 높고 빨리 끝나는 구역부터 복구해, 정전 상태로 머무는 인구·시간을 줄입니다."},
  B:{name:"B. 중요시설 우선", short:"중요시설 우선", rule:"응급의료기관이 많은 구역부터", desc:"병원 등 응급의료기관이 많은 구역을 먼저 복구해 생명·안전과 직결된 시설의 정전 시간을 줄입니다."},
  C:{name:"C. 네트워크 효율 우선", short:"효율 우선", rule:"복구 소요시간이 짧은 구역부터", desc:"작업량이 적은 구역부터 끝내 복구 완료 구역 수를 빠르게 늘립니다."}
};
"""
    js += "window.scenarioData = scenarioData;\n"
    with open(JS_DIR / "data.js", "w", encoding="utf-8") as f:
        f.write(js)


def generate_from_excel():
    DATA_DIR.mkdir(exist_ok=True)
    JS_DIR.mkdir(exist_ok=True)

    candidates = load_excel_or_csv_candidates()
    if not candidates:
        raise FileNotFoundError("엑셀/CSV 파일이 없습니다. data 폴더 안에 시트1(기상데이터), 시트2(정전데이터) 엑셀을 넣어주세요.")

    weather_df = None
    outage_df = None

    for path in candidates:
        try:
            if path.suffix.lower() == ".csv":
                raw = pd.read_csv(path, encoding="utf-8-sig")
                if detect_weather_sheet(raw):
                    weather_df = normalize_weather_df(raw)
                elif detect_outage_sheet(raw):
                    outage_df = normalize_outage_df(raw)
                continue

            xls = pd.ExcelFile(path)
            for sheet_name in xls.sheet_names:
                df = pd.read_excel(path, sheet_name=sheet_name)
                if weather_df is None and detect_weather_sheet(df):
                    weather_df = normalize_weather_df(df)
                if outage_df is None and detect_outage_sheet(df):
                    outage_df = normalize_outage_df(df)

                if weather_df is not None and outage_df is not None:
                    break
            if weather_df is not None and outage_df is not None:
                break
        except Exception:
            continue

    if weather_df is None:
        raise ValueError("기상 데이터 시트를 찾지 못했습니다. 시트 컬럼명에 일시/지역/기온/풍속/강수량이 포함되어야 합니다.")
    if outage_df is None:
        raise ValueError("정전 데이터 시트를 찾지 못했습니다. 시트 컬럼명에 지역/영향인구/응급의료기관/예상복구시간이 포함되어야 합니다.")

    weather_df = weather_df[weather_df["지역"].isin(REGIONS)].copy()
    outage_df = outage_df[outage_df["지역"].isin(REGIONS)].copy()

    generate_weather_js(weather_df)
    generate_data_js(outage_df, weather_df)

    print("엑셀 기반 데이터 연결 완료")
    print(f"- 기상 시트: {len(weather_df)}행")
    print(f"- 정전 시트: {len(outage_df)}행")
    print(f"- 생성 파일: {JS_DIR / 'data.js'}, {JS_DIR / 'weather.js'}")


if __name__ == "__main__":
    generate_from_excel()


# duplicate block intentionally removed: keep a single generate_from_excel() definition below