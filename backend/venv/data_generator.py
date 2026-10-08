import os
import random
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "project", "data")

# 시도별 기본 위경도 및 백업 매핑 정보
GEO_MAP = {
    "서울특별시": {"lat": 37.5665, "lng": 126.9780, "hospitals": 15, "shelters": 20},
    "전남광주통합특별시": {"lat": 35.1595, "lng": 126.8526, "hospitals": 10, "shelters": 15},
    "부산광역시": {"lat": 35.1796, "lng": 129.0756, "hospitals": 12, "shelters": 18},
    "대구광역시": {"lat": 35.8714, "lng": 128.6014, "hospitals": 9, "shelters": 12},
    "인천광역시": {"lat": 37.4563, "lng": 126.7052, "hospitals": 10, "shelters": 14},
    "대전광역시": {"lat": 36.3504, "lng": 127.3845, "hospitals": 8, "shelters": 10},
    "울산광역시": {"lat": 35.5384, "lng": 129.3114, "hospitals": 6, "shelters": 8},
    "세종특별자치시": {"lat": 36.4800, "lng": 127.2890, "hospitals": 3, "shelters": 5},
    "경기도": {"lat": 37.4138, "lng": 127.5183, "hospitals": 25, "shelters": 35},
    "강원특별자치도": {"lat": 37.8228, "lng": 128.1555, "hospitals": 7, "shelters": 15},
    "충청북도": {"lat": 36.6357, "lng": 127.4912, "hospitals": 6, "shelters": 10},
    "충청남도": {"lat": 36.5184, "lng": 126.8000, "hospitals": 8, "shelters": 12},
    "전북특별자치도": {"lat": 35.7175, "lng": 127.1530, "hospitals": 7, "shelters": 11},
    "경상북도": {"lat": 36.5760, "lng": 128.5056, "hospitals": 10, "shelters": 16},
    "경상남도": {"lat": 35.4606, "lng": 128.2132, "hospitals": 11, "shelters": 17},
    "제주특별자치도": {"lat": 33.4996, "lng": 126.5312, "hospitals": 4, "shelters": 8},
}

def generate_disaster_scenario(disaster_type: str = "TYPHOON"):
    """
    엑셀 파일(가상_기상_정전_데이터.xlsx 또는 통합_시뮬레이션_데이터.xlsx)에서
    목데이터를 읽어와 scenario_data 목록으로 변환합니다.
    """
    # 엑셀 파일 경로 탐색
    excel_candidates = [
        os.path.join(BASE_DIR, "가상_기상_정전_데이터.xlsx"),
        os.path.join(BASE_DIR, "통합_시뮬레이션_데이터.xlsx"),
        os.path.join(DATA_DIR, "가상_기상_정전_데이터.xlsx"),
        os.path.join(DATA_DIR, "통합_시뮬레이션_데이터.xlsx")
    ]
    
    excel_path = None
    for path in excel_candidates:
        if os.path.exists(path):
            excel_path = path
            break

    # 1. 엑셀 파일이 존재하는 경우: 엑셀 데이터 로드
    if excel_path:
        try:
            df = pd.read_excel(excel_path)
            scenario_data = []
            
            for idx, row in df.iterrows():
                region_name = str(row.get("지역명", row.get("행정구역", f"지역_{idx}"))).strip()
                geo = GEO_MAP.get(region_name, {"lat": 36.0 + (idx * 0.1), "lng": 127.0 + (idx * 0.1), "hospitals": 5, "shelters": 8})
                
                # 정전 여부 파악
                outage_val = row.get("정전여부", row.get("is_outage", True))
                is_outage = bool(outage_val) if not isinstance(outage_val, str) else outage_val.lower() in ["true", "y", "예", "1"]

                scenario_data.append({
                    "region_id": f"REG_{idx+1:02d}",
                    "region_name": region_name,
                    "lat": float(row.get("위도", geo["lat"])),
                    "lng": float(row.get("경도", geo["lng"])),
                    "population": int(row.get("인구수", row.get("population", 500000))),
                    "hospitals": int(row.get("병원수", geo["hospitals"])),
                    "shelters": int(row.get("대피소수", geo["shelters"])),
                    "is_outage": is_outage,
                    "outage_ratio": float(row.get("정전비율", row.get("outage_ratio", 0.5 if is_outage else 0.0))),
                    "wind_speed": float(row.get("풍속", row.get("wind_speed", 20.0))),
                    "rainfall": float(row.get("강수량", row.get("rainfall", 80.0))),
                    "risk_score": float(row.get("위험도점수", row.get("risk_score", 60.0)))
                })
            return scenario_data
        except Exception as e:
            print(f"엑셀 데이터 로드 중 오류 발생: {e}")

    # 2. 엑셀 파일이 없거나 오류 발생 시 기본 랜덤 생성기 동작
    return _generate_fallback_data(disaster_type)


def _generate_fallback_data(disaster_type):
    # 기존 난수 생성 로직 백업용
    scenario_data = []
    for idx, (region_name, geo) in enumerate(GEO_MAP.items(), 1):
        wind_speed = round(random.uniform(15.0, 40.0), 1)
        rainfall = round(random.uniform(40.0, 180.0), 1)
        risk_score = round((wind_speed * 0.4) + (rainfall * 0.3), 1)
        is_outage = random.random() < (risk_score / 100.0)
        outage_ratio = round(random.uniform(0.20, 0.95), 2) if is_outage else 0.0

        scenario_data.append({
            "region_id": f"REG_{idx:02d}",
            "region_name": region_name,
            "lat": geo["lat"],
            "lng": geo["lng"],
            "population": 500000,
            "hospitals": geo["hospitals"],
            "shelters": geo["shelters"],
            "is_outage": is_outage,
            "outage_ratio": outage_ratio,
            "wind_speed": wind_speed,
            "rainfall": rainfall,
            "risk_score": risk_score
        })
    return scenario_data