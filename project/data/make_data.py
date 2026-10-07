import os
import json
import pandas as pd

# 1. 파일 및 저장 경로 설정
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))    # project/data 폴더
PROJECT_DIR = os.path.dirname(CURRENT_DIR)                  # project 폴더
OUTPUT_JS_PATH = os.path.join(PROJECT_DIR, 'js', 'data.js')  # project/js/data.js

pop_csv_path = os.path.join(CURRENT_DIR, 'population.csv')
hosp_csv_path = os.path.join(CURRENT_DIR, 'hospitals.csv')

# 2. 7개 권역 및 좌표 설정
regions = [
    "부산 권역", "광주·전남 권역", "대구·경북 권역", 
    "충청 권역", "수도권 남부", "강원 권역", "전북 권역"
]

coordinates = {
    "부산 권역": {"lat": 35.17955, "lng": 129.0756},
    "광주·전남 권역": {"lat": 35.15954, "lng": 126.8526},
    "대구·경북 권역": {"lat": 35.87143, "lng": 128.6014},
    "충청 권역": {"lat": 36.35041, "lng": 127.3845},
    "수도권 남부": {"lat": 37.26357, "lng": 127.0286},
    "강원 권역": {"lat": 37.88536, "lng": 127.7298},
    "전북 권역": {"lat": 35.82422, "lng": 127.1480}
}

# 시·도 → 권역 매핑 (기상 데이터의 지점 배정과 동일한 기준)
#  - 경남·울산은 별도 권역이 없어 부산 권역에, 제주는 해당 권역이 없어 제외
province_to_region = {
    "부산광역시": "부산 권역", "울산광역시": "부산 권역", "경상남도": "부산 권역",
    "전남광주통합특별시": "광주·전남 권역", "광주광역시": "광주·전남 권역", "전라남도": "광주·전남 권역",
    "대구광역시": "대구·경북 권역", "경상북도": "대구·경북 권역",
    "대전광역시": "충청 권역", "세종특별자치시": "충청 권역",
    "충청북도": "충청 권역", "충청남도": "충청 권역",
    "서울특별시": "수도권 남부", "경기도": "수도권 남부", "인천광역시": "수도권 남부",
    "강원특별자치도": "강원 권역", "강원도": "강원 권역",
    "전북특별자치도": "전북 권역", "전라북도": "전북 권역",
}

def read_csv_any(path):
    """UTF-8(BOM 포함) → CP949 순서로 인코딩을 자동 판별해서 읽는다."""
    for enc in ("utf-8-sig", "cp949"):
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("인코딩을 확인하세요: " + path)

def province_of(text):
    """'경기도 수원시 ...' 처럼 문자열의 첫 단어(시·도)로 권역을 판별한다.
    (전체 문자열 검색을 하면 '경기도 광주시'가 광주로 잡히는 오류가 생김)"""
    first = str(text).strip().split(" ")[0]
    return province_to_region.get(first)

region_stats = {reg: {"people": 0, "hospitals": 0, "shelters": 0} for reg in regions}

# 3. population.csv : 시·도별 총인구를 권역으로 합산
if os.path.exists(pop_csv_path):
    try:
        df_pop = read_csv_any(pop_csv_path)
        name_col, val_col = df_pop.columns[0], df_pop.columns[1]
        for _, row in df_pop.iterrows():
            reg = province_of(row[name_col])
            if not reg:
                continue
            try:
                region_stats[reg]["people"] += int(float(str(row[val_col]).replace(",", "")))
            except ValueError:
                continue   # '총인구수 (명)' 같은 헤더 행은 건너뜀
    except Exception as e:
        print(f"⚠ 인구 CSV 읽기 실패: {e}")
else:
    print("⚠ population.csv 가 없습니다.")

# 4. hospitals.csv : 주소 첫 단어(시·도) 기준으로 권역별 응급의료기관 수 집계
if os.path.exists(hosp_csv_path):
    try:
        df_hosp = read_csv_any(hosp_csv_path)
        skipped = 0
        for addr in df_hosp["주소"]:
            reg = province_of(addr)
            if reg:
                region_stats[reg]["hospitals"] += 1
            else:
                skipped += 1
        print(f"병원 {len(df_hosp) - skipped}개 집계 (권역 외 {skipped}개 제외: 제주 등)")
    except Exception as e:
        print(f"⚠ 병원 CSV 읽기 실패: {e}")
else:
    print("⚠ hospitals.csv 가 없습니다.")

for reg, st in region_stats.items():
    if st["people"] == 0 or st["hospitals"] == 0:
        print(f"⚠ {reg}: 집계값이 0 입니다 → {st}")

# 5. outage_data 목록 생성 및 점수 계산
# 영향도 = 영향 인구(60%) + 응급의료기관 수(40%)를 '최대 권역 대비 비율'로 환산해 55~96점으로 배분
max_pop = max(st["people"] for st in region_stats.values()) or 1
max_hosp = max(st["hospitals"] for st in region_stats.values()) or 1

outage_data = []
for idx, reg_name in enumerate(regions, start=1):
    stats = region_stats[reg_name]
    pop_man = round(stats["people"] / 10000, 1)
    hosp_cnt = stats["hospitals"]
    shelter_cnt = stats["shelters"]

    ratio = 0.6 * (stats["people"] / max_pop) + 0.4 * (hosp_cnt / max_hosp)
    score = int(round(55 + 41 * ratio))

    level = "critical" if score >= 85 else "high" if score >= 75 else "mid" if score >= 65 else "low"

    reason_parts = [f"응급의료기관 {hosp_cnt}개소"]
    if shelter_cnt > 0:
        reason_parts.append(f"대피소 {shelter_cnt}개소")
    reason_parts.append(f"영향 인구 {pop_man:,.1f}만 명 기반 AI 산출")

    outage_data.append({
        "id": idx,
        "region": reg_name,
        "lat": coordinates[reg_name]["lat"],
        "lng": coordinates[reg_name]["lng"],
        "score": score,
        "level": level,
        "people": f"{pop_man:,.1f}만 명",
        "facilities": hosp_cnt,
        "shelters": shelter_cnt,
        "time": f"{round(score / 15, 1)}시간",
        "cascade": "매우 높음" if score >= 85 else "높음" if score >= 75 else "보통",
        "reason": " · ".join(reason_parts)
    })

# 5-1. 기상청(KMA) 관측 데이터 집계 -------------------------------------------
# kma_weather.csv 는 약 50만 행(시간 단위, 100여 개 지점)이라 브라우저에서 직접 읽지 않고
# 여기서 권역별로 미리 집계해 data.js 의 weatherData 로 내보냅니다.
kma_csv_path = os.path.join(CURRENT_DIR, 'kma_weather.csv')

region_stations = {
    "부산 권역": ["부산", "북부산", "김해시", "양산시", "울산", "창원", "북창원", "통영", "진주", "거제",
                "밀양", "산청", "거창", "합천", "함양군", "의령군", "남해"],  # 경남·울산 포함(경남 권역 없음)
    "광주·전남 권역": ["광주", "목포", "여수", "완도", "순천", "해남", "진도군", "보성군",
                    "강진군", "장흥", "고흥", "광양시", "영광군", "흑산도"],
    "대구·경북 권역": ["대구", "포항", "안동", "상주", "구미", "영천", "경주시", "영주", "문경",
                    "의성", "봉화", "청송군", "영덕", "울진", "울릉도"],
    "충청 권역": ["대전", "청주", "서청주", "충주", "제천", "보은", "천안", "서산", "보령",
                "부여", "금산", "세종", "홍성", "추풍령"],
    "수도권 남부": ["서울", "인천", "수원", "이천", "양평", "강화", "동두천", "파주", "백령도"],
    "강원 권역": ["속초", "북춘천", "철원", "대관령", "춘천", "북강릉", "강릉", "동해",
                "영월", "인제", "홍천", "태백", "정선군", "원주"],
    "전북 권역": ["전주", "군산", "고창", "정읍", "남원", "부안", "임실", "장수", "순창군", "고창군"],
}
station_to_region = {st: reg for reg, sts in region_stations.items() for st in sts}

COMPASS = ["북","북북동","북동","동북동","동","동남동","남동","남남동",
           "남","남남서","남서","서남서","서","서북서","북서","북북서"]
def deg_to_compass(d):
    if d is None or pd.isna(d): return "-"
    return COMPASS[int(((float(d) % 360) + 11.25) // 22.5) % 16]

def weather_level(wind, rain1h):
    # 기상청 특보 기준(강풍주의보 14m/s, 호우 시간당 30mm 이상)을 참고한 간이 위험도
    if wind >= 14 or rain1h >= 30: return "danger", "위험"
    if wind >= 9 or rain1h >= 10:  return "warn", "주의"
    return "ok", "양호"

weather_data = {}
weather_meta = {}
if os.path.exists(kma_csv_path):
    try:
        kma = read_csv_any(kma_csv_path)
        kma = kma.rename(columns={"기온(°C)": "temp", "강수량(mm)": "rain", "풍속(m/s)": "wind",
                                  "풍향(16방위)": "wdir", "일시": "dt", "지점명": "stn"})
        # QC플래그 9 = 결측 → 값 제거. 강수량은 공란이 '무강수'이므로 0 처리
        for col, qc in (("temp", "기온 QC플래그"), ("wind", "풍속 QC플래그"), ("wdir", "풍향 QC플래그")):
            kma.loc[kma[qc] == 9, col] = float("nan")
        kma["rain"] = kma["rain"].fillna(0.0)
        kma["dt"] = pd.to_datetime(kma["dt"])
        kma["region"] = kma["stn"].map(station_to_region)
        kma = kma.dropna(subset=["region"])

        last_dt = kma["dt"].max()
        weather_meta = {
            "updated": last_dt.strftime("%Y-%m-%d %H:%M"),
            "periodStart": kma["dt"].min().strftime("%Y-%m-%d"),
            "periodEnd": last_dt.strftime("%Y-%m-%d"),
            "stations": int(kma["stn"].nunique()),
        }
        win_start = last_dt - pd.Timedelta(hours=23)

        for reg in regions:
            g = kma[kma["region"] == reg]
            if g.empty:
                continue
            now = g[g["dt"] == last_dt]
            win = g[g["dt"] >= win_start]

            # 현재(최신 관측 시각)
            w_now = now.loc[now["wind"].idxmax()] if now["wind"].notna().any() else None
            cur = {
                "temp": round(float(now["temp"].mean()), 1),
                "wind": round(float(now["wind"].mean()), 1),
                "windMax": round(float(w_now["wind"]), 1) if w_now is not None else 0,
                "windMaxStn": str(w_now["stn"]) if w_now is not None else "-",
                "wdir": deg_to_compass(now["wdir"].mean() if now["wdir"].notna().any() else None),
                "rain": round(float(now["rain"].mean()), 1),
            }

            # 최근 24시간 피크
            pk_w = win.loc[win["wind"].idxmax()] if win["wind"].notna().any() else None
            pk_r = win.loc[win["rain"].idxmax()]
            rain24 = win.groupby("stn")["rain"].sum()
            peak24 = {
                "wind": round(float(pk_w["wind"]), 1) if pk_w is not None else 0,
                "windStn": str(pk_w["stn"]) if pk_w is not None else "-",
                "windTime": pk_w["dt"].strftime("%m/%d %H시") if pk_w is not None else "-",
                "rain1h": round(float(pk_r["rain"]), 1),
                "rain1hStn": str(pk_r["stn"]),
                "rain24": round(float(rain24.max()), 1),
                "rain24Stn": str(rain24.idxmax()),
            }

            # 관측기간 전체 극값(태풍·호우 이력 참고용)
            ex_w = g.loc[g["wind"].idxmax()]
            ex_r = g.loc[g["rain"].idxmax()]
            extreme = {
                "wind": round(float(ex_w["wind"]), 1), "windStn": str(ex_w["stn"]),
                "windTime": ex_w["dt"].strftime("%m/%d %H시"),
                "rain1h": round(float(ex_r["rain"]), 1), "rain1hStn": str(ex_r["stn"]),
                "rainTime": ex_r["dt"].strftime("%m/%d %H시"),
            }

            # 최근 24시간 시계열(권역 평균 · 권역 내 최대)
            hourly = win.groupby("dt").agg(
                wind_avg=("wind", "mean"), wind_max=("wind", "max"),
                rain_avg=("rain", "mean"), rain_max=("rain", "max"),
                temp=("temp", "mean")).reset_index().sort_values("dt")
            series = [{
                "t": r["dt"].strftime("%H시"),
                "windAvg": round(float(r["wind_avg"]), 1) if pd.notna(r["wind_avg"]) else 0,
                "windMax": round(float(r["wind_max"]), 1) if pd.notna(r["wind_max"]) else 0,
                "rainAvg": round(float(r["rain_avg"]), 2),
                "rainMax": round(float(r["rain_max"]), 1),
            } for _, r in hourly.iterrows()]

            lvl, lvl_txt = weather_level(peak24["wind"], peak24["rain1h"])
            weather_data[reg] = {
                "current": cur, "peak24": peak24, "extreme": extreme, "series": series,
                "level": lvl, "levelText": lvl_txt,
                "stationCount": int(g["stn"].nunique()),
            }
        print(f"✅ 기상 데이터 집계 완료: {len(weather_data)}개 권역 / 기준 {weather_meta['updated']}")
    except Exception as e:
        print(f"기상 CSV 처리 참고: {e}")
else:
    print("kma_weather.csv 가 없어 기상 정보를 건너뜁니다.")

for o in outage_data:
    w = weather_data.get(o["region"])
    o["weatherLevel"] = w["level"] if w else None

# 6. project/js/data.js로 파일 저장
os.makedirs(os.path.dirname(OUTPUT_JS_PATH), exist_ok=True)

js_content = f"const outageData = {json.dumps(outage_data, ensure_ascii=False, indent=2)};\n\n"
js_content += f"const weatherData = {json.dumps(weather_data, ensure_ascii=False)};\n"
js_content += f"const weatherMeta = {json.dumps(weather_meta, ensure_ascii=False)};\n\n"
js_content += """const scenarioData = {
  A:{name:"A. 사회적 피해 최소화", score:"82.4", time:"4.1시간", people:"51.2만 명", desc:"영향 인구와 중요시설을 동시에 고려하여 사회적 피해가 가장 작도록 복구 순서를 배치합니다."},
  B:{name:"B. 중요시설 우선", score:"74.8", time:"4.6시간", people:"58.7만 명", desc:"병원·소방·상수도·통신 등 중요시설을 우선 복구하는 시나리오입니다."},
  C:{name:"C. 네트워크 효율 우선", score:"69.2", time:"3.7시간", people:"64.3만 명", desc:"복구 작업량과 전력망 효율을 우선하여 전체 정전 복구시간을 단축하는 시나리오입니다."}
};
"""

with open(OUTPUT_JS_PATH, 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"✅ 생성 성공: {OUTPUT_JS_PATH}")