import pandas as pd
import json

def process_disaster_data():
    # 1. 수집한 공공데이터 CSV 파일 불러오기 (예시 파일명)
    # kma_df: 기상청 기상 관측 데이터 (최대순간풍속, 강수량 등)
    # region_df: 권역별 인구 및 주요 시설 위치 데이터
    
    # [예시 데이터 생성 - 실제 구현 시 pd.read_csv('파일명.csv')로 대체]
    raw_data = [
        {"region": "부산 권역", "lat": 35.17955, "lng": 129.0756, "wind_speed": 38.5, "rain_1h": 45.0, "pop_thousand": 182, "facility_cnt": 31},
        {"region": "광주·전남 권역", "lat": 35.15954, "lng": 126.8526, "wind_speed": 34.2, "rain_1h": 52.0, "pop_thousand": 147, "facility_cnt": 27},
        {"region": "대구·경북 권역", "lat": 35.87143, "lng": 128.6014, "wind_speed": 29.0, "rain_1h": 20.0, "pop_thousand": 113, "facility_cnt": 22},
        {"region": "충청 권역", "lat": 36.35041, "lng": 127.3845, "wind_speed": 22.1, "rain_1h": 35.0, "pop_thousand": 86, "facility_cnt": 19},
        {"region": "수도권 남부", "lat": 37.26357, "lng": 127.0286, "wind_speed": 18.5, "rain_1h": 15.0, "pop_thousand": 79, "facility_cnt": 24},
        {"region": "강원 권역", "lat": 37.88536, "lng": 127.7298, "wind_speed": 25.0, "rain_1h": 10.0, "pop_thousand": 32, "facility_cnt": 12},
        {"region": "전북 권역", "lat": 35.82422, "lng": 127.1480, "wind_speed": 15.0, "rain_1h": 8.0, "pop_thousand": 28, "facility_cnt": 9}
    ]
    
    df = pd.DataFrame(raw_data)

    # 2. 데이터 가공 및 피처 스케일링 (Score 계산)
    # 기상 위험도 (풍속 40m/s = 100점 기준)
    df['weather_risk'] = (df['wind_speed'] / 40.0 * 50) + (df['rain_1h'] / 60.0 * 50)
    df['weather_risk'] = df['weather_risk'].clip(upper=100)

    # 인구 위험도 (20만 명 = 100점 기준)
    df['pop_risk'] = (df['pop_thousand'] / 200.0 * 100).clip(upper=100)

    # 시설 위험도 (35개소 = 100점 기준)
    df['fac_risk'] = (df['facility_cnt'] / 35.0 * 100).clip(upper=100)

    # 최종 가중합 Score 계산
    df['score'] = (df['weather_risk'] * 0.4 + df['pop_risk'] * 0.3 + df['fac_risk'] * 0.3).round().astype(int)

    # 3. 위험 등급(level) 및 예상 복구시간 부여
    outage_list = []
    for idx, row in df.iterrows():
        score = row['score']
        if score >= 90:
            level = "critical"
            cascade = "매우 높음"
            est_time = f"{round(score * 0.065, 1)}시간"
        elif score >= 75:
            level = "high"
            cascade = "높음"
            est_time = f"{round(score * 0.055, 1)}시간"
        elif score >= 60:
            level = "mid"
            cascade = "보통"
            est_time = f"{round(score * 0.048, 1)}시간"
        else:
            level = "low"
            cascade = "낮음"
            est_time = f"{round(score * 0.045, 1)}시간"

        outage_list.append({
            "id": idx + 1,
            "region": row['region'],
            "lat": row['lat'],
            "lng": row['lng'],
            "score": int(score),
            "level": level,
            "people": f"{row['pop_thousand']}만 명",
            "facilities": int(row['facility_cnt']),
            "time": est_time,
            "cascade": cascade,
            "reason": f"풍속 {row['wind_speed']}m/s · 강수량 {row['rain_1h']}mm 기록 + 주요 취약시설 {row['facility_cnt']}개소 밀집"
        })

    # 4. js/data.js 파일로 직접 쓰기 (JS 객체 형태로 출력)
    js_content = f"// Python 자동 생성 데이터 - {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
    js_content += f"let outageData = {json.dumps(outage_list, ensure_ascii=False, indent=2)};\n\n"
    
    # 시나리오 및 시설 기본 데이터 추가 작성
    js_content += """const scenarioData = {
  A:{name:"A. 사회적 피해 최소화", score:"82.4", time:"4.1시간", people:"51.2만 명", desc:"영향 인구와 중요시설을 동시에 고려하여 사회적 피해가 가장 작도록 복구 순서를 배치합니다."},
  B:{name:"B. 중요시설 우선", score:"74.8", time:"4.6시간", people:"58.7만 명", desc:"병원·소방·상수도·통신 등 중요시설을 우선 복구하는 시나리오입니다."},
  C:{name:"C. 네트워크 효율 우선", score:"69.2", time:"3.7시간", people:"64.3만 명", desc:"복구 작업량과 전력망 효율을 우선하여 전체 정전 복구시간을 단축하는 시나리오입니다."}
};

let facilityData = [
  {name: "부산대학교병원", type: "의료기관(상급)", region: "부산 권역", generator: "보유 (자체 가동중)", priority: "최우선"},
  {name: "광주광역시 덕남정수장", type: "상수도 시설", region: "광주·전남 권역", generator: "보유 (비상발전 가동)", priority: "최우선"},
  {name: "대구 수성구 통신기지국", type: "통신 인프라", region: "대구·경북 권역", generator: "미보유 (배터리 운용)", priority: "우선"},
  {name: "대전 복합버스터미널", type: "교통 시설", region: "충청 권역", generator: "보유", priority: "보통"},
  {name: "수원 중앙대피소", type: "재난 대피소", region: "수도권 남부", generator: "보유", priority: "보통"}
];
"""

    with open('js/data.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print("성공: js/data.js 파일이 최신 공공데이터로 업데이트되었습니다.")

if __name__ == "__main__":
    process_disaster_data()