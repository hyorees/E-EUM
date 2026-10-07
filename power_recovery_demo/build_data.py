import os
import json
import pandas as pd

# 1. 파일 경로 정의
CSV_FILE_PATH = 'data/kma_weather.csv'
OUTPUT_JS_PATH = 'js/data.js'

def load_kma_data(file_path):
    """기상청 CSV 파일의 인코딩을 자동으로 맞춰 읽어옵니다."""
    if not os.path.exists(file_path):
        print(f"오류: {file_path} 파일이 존재하지 않습니다. data 폴더를 확인해주세요.")
        return None

    # 기상청 CSV는 주로 cp949 또는 euc-kr 인코딩을 사용함
    encodings = ['cp949', 'euc-kr', 'utf-8-sig', 'utf-8']
    for enc in encodings:
        try:
            df = pd.read_csv(file_path, encoding=enc)
            print(f"CSV 읽기 성공 (인코딩: {enc})")
            return df
        except (UnicodeDecodeError, Exception):
            continue
            
    print("오류: CSV 파일 인코딩을 읽을 수 없습니다.")
    return None

def process_and_export():
    df = load_kma_data(CSV_FILE_PATH)
    if df is None:
        return

    # 2. 기상청 CSV 컬럼명 유연 처리 (공백 제거)
    df.columns = df.columns.str.strip()

    # 필수 컬럼 찾기 (기상청 표준 컬럼명 매핑)
    # 기상청 CSV는 보통 '지점명', '일시', '풍속(m/s)', '강수량(mm)', '일조(hr)', '일사(MJ/m2)' 형태입니다.
    col_station = next((c for c in df.columns if '지점명' in c or '지점' in c), None)
    col_wind = next((c for c in df.columns if '풍속' in c), None)
    col_rain = next((c for c in df.columns if '강수' in c), None)
    col_sunshine = next((c for c in df.columns if '일조' in c), None)
    col_radiation = next((c for c in df.columns if '일사' in c), None)

    # 수치 데이터 결측치(NaN) 0으로 채우기
    for col in [col_wind, col_rain, col_sunshine, col_radiation]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # 3. 지점(지역)별 요약 데이터 집계
    # 풍속은 최대값, 강수량·일조량·일사량은 합계/최대값 산출
    grouped = df.groupby(col_station).agg({
        col_wind: 'max',       # 최대 풍속
        col_rain: 'sum',       # 총 강수량
        col_sunshine: 'sum',   # 총 일조시간
        col_radiation: 'max'   # 최대 일사량
    }).reset_index()

    outage_list = []
    
    # 4. 각 지역별 위험도 및 데이터 구조화
    for idx, row in grouped.iterrows():
        region_name = row[col_station]
        max_wind = round(float(row[col_wind]), 1)
        sum_rain = round(float(row[col_rain]), 1)
        max_rad = round(float(row[col_radiation]), 2)
        sum_sun = round(float(row[col_sunshine]), 1)

        # 기상 위험도 점수 계산 (예시: 풍속 40m/s, 강수량 100mm 기준 정규화)
        weather_score = min(100, int((max_wind / 40.0 * 50) + (sum_rain / 100.0 * 50)))
        
        # 위험 등급 분류
        if weather_score >= 80:
            level = "critical"
        elif weather_score >= 60:
            level = "high"
        elif weather_score >= 40:
            level = "mid"
        else:
            level = "low"

        outage_list.append({
            "id": idx + 1,
            "region": region_name,
            "score": weather_score,
            "level": level,
            "wind_speed": max_wind,
            "precipitation": sum_rain,
            "solar_radiation": max_rad,
            "sunshine_hours": sum_sun,
            "reason": f"최대풍속 {max_wind}m/s · 누적강수 {sum_rain}mm · 최대일사 {max_rad}MJ/m²"
        })

    # 5. js/data.js 저장용 텍스트 생성
    os.makedirs('js', exist_ok=True)
    
    js_content = f"// Python 자동 생성 데이터 - {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
    js_content += f"let outageData = {json.dumps(outage_list, ensure_ascii=False, indent=2)};\n"

    with open(OUTPUT_JS_PATH, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print(f"성공: {len(outage_list)}개 지역 데이터가 '{OUTPUT_JS_PATH}' 파일로 변환되었습니다.")

if __name__ == '__main__':
    process_and_export()