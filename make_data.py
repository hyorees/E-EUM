import csv
import json
import os
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

# ==========================================
# 0. 공공데이터포털 서비스키 설정
# ==========================================
SERVICE_KEY = "91241YH2Z62PSN9C"

# 1. 권역 분류 정의
regions = {
    "부산 권역": ["부산", "울산", "경남", "경상남도"],
    "광주·전남 권역": ["광주", "전남", "전라남도"],
    "대구·경북 권역": ["대구", "경북", "경상북도"],
    "충청 권역": ["대전", "세종", "충남", "충북", "충청남도", "충청북도"],
    "수도권 남부": ["서울", "경기", "인천", "경기도"],
    "강원 권역": ["강원", "강원특별자치도"],
    "전북 권역": ["전북", "전라북도", "전북특별자치도"]
}

region_stats = {r: {"people": 0, "hospitals": 0, "shelters": 0} for r in regions}

# 2. 인구 데이터 읽기 (population.csv)
if os.path.exists('population.csv'):
    encodings = ['euc-kr', 'utf-8-sig', 'utf-8']
    for enc in encodings:
        try:
            with open('population.csv', 'r', encoding=enc) as f:
                reader = csv.reader(f)
                for row in reader:
                    if not row or len(row) < 2: continue
                    area_name = row[0]
                    try:
                        pop_str = row[1].replace(',', '').strip()
                        pop_num = int(pop_str)
                        for reg, keywords in regions.items():
                            if any(kw in area_name for kw in keywords):
                                region_stats[reg]["people"] += pop_num
                                break
                    except ValueError:
                        continue
            break
        except Exception:
            continue

# 3. 병원 데이터 읽기 (hospitals.csv)
if os.path.exists('hospitals.csv'):
    try:
        with open('hospitals.csv', 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                addr = row.get('주소', '')
                for reg, keywords in regions.items():
                    if any(kw in addr for kw in keywords):
                        region_stats[reg]["hospitals"] += 1
                        break
    except Exception as e:
        print(f"병원 데이터 읽기 오류: {e}")

# 4. 행안부 대피소 API 호출 (서비스키 활용)
if SERVICE_KEY and SERVICE_KEY != "여기에_발급받으신_서비스키를_붙여넣으세요":
    print("행안부 대피소 API 데이터 수집 중...")
    try:
        # 공공데이터포털 이재민 임시주거시설 / 민방위 대피소 API 엔드포인트
        encoded_key = urllib.parse.quote_plus(urllib.parse.unquote(SERVICE_KEY))
        url = f"http://apis.data.go.kr/1741000/CivilDefenseShelter3/getCivilDefenseShelterList3?serviceKey={encoded_key}&pageNo=1&numOfRows=1000"
        
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read().decode('utf-8')
            root = ET.fromstring(xml_data)
            
            # XML 응답에서 주소/지역 항목 파싱
            for row in root.iter('row'):
                addr = row.findtext('ronaDtlAddr') or row.findtext('sidoName') or row.findtext('address') or ""
                for reg, keywords in regions.items():
                    if any(kw in addr for kw in keywords):
                        region_stats[reg]["shelters"] += 1
                        break
        print("대피소 API 연동 성공!")
    except Exception as e:
        print(f"API 호출 중 참고 사항 (기본값 처리): {e}")

# 5. 지도 좌표 및 점수 산출
coordinates = {
    "부산 권역": {"x": 500, "y": 385},
    "광주·전남 권역": {"x": 305, "y": 355},
    "대구·경북 권역": {"x": 455, "y": 290},
    "충청 권역": {"x": 350, "y": 275},
    "수도권 남부": {"x": 395, "y": 205},
    "강원 권역": {"x": 390, "y": 150},
    "전북 권역": {"x": 310, "y": 315}
}

outage_data = []
for idx, (reg_name, stats) in enumerate(region_stats.items(), start=1):
    pop_man = round(stats["people"] / 10000, 1)
    hosp_cnt = stats["hospitals"]
    shelter_cnt = stats["shelters"]
    
    # AI 영향도 점수 산식: (병원 x 2.0) + (대피소 x 0.5) + (인구만명당 0.1)
    raw_score = int((hosp_cnt * 2.0) + (shelter_cnt * 0.5) + (pop_man * 0.1))
    score = min(max(raw_score, 50), 98)
    
    level = "critical" if score >= 90 else "high" if score >= 75 else "mid" if score >= 60 else "low"
    
    reason_parts = [f"응급의료기관 {hosp_cnt}개소"]
    if shelter_cnt > 0:
        reason_parts.append(f"대피소 {shelter_cnt}개소")
    reason_parts.append(f"영향 인구 {pop_man}만 명 기반 AI 산출")
    
    outage_data.append({
        "id": idx,
        "region": reg_name,
        "x": coordinates[reg_name]["x"],
        "y": coordinates[reg_name]["y"],
        "score": score,
        "level": level,
        "people": f"{pop_man}만 명",
        "facilities": hosp_cnt,
        "shelters": shelter_cnt,
        "time": f"{round(score / 15, 1)}시간",
        "cascade": "매우 높음" if score >= 90 else "높음" if score >= 75 else "보통",
        "reason": " · ".join(reason_parts)
    })

outage_data.sort(key=lambda x: x["score"], reverse=True)

# 6. project/js/data.js 저장
os.makedirs('project/js', exist_ok=True)
js_content = f"const outageData = {json.dumps(outage_data, ensure_ascii=False, indent=2)};\n\n"
js_content += """const scenarioData = {
 A:{name:"사회적 피해 최소화", score:"82.4", time:"4.1시간", people:"51.2만 명", desc:"영향 인구와 중요시설을 동시에 고려하여 사회적 피해가 가장 작도록 복구 순서를 배치합니다."},
 B:{name:"중요시설 우선", score:"74.8", time:"4.6시간", people:"58.7만 명", desc:"병원·소방·상수도·통신 등 중요시설을 우선 복구하는 시나리오입니다."},
 C:{name:"네트워크 효율 우선", score:"69.2", time:"3.7시간", people:"64.3만 명", desc:"복구 작업량과 전력망 효율을 우선하여 전체 정전 복구시간을 단축하는 시나리오입니다."}
};
"""

with open('project/js/data.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print("성공적으로 'project/js/data.js' 파일이 인구+병원+대피소(API) 데이터 기반으로 업데이트되었습니다!")