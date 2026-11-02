# backend/data_generator.py
"""가상 재난 → 시·군·구별 정전 현황 생성기.

- 기초 데이터: backend/data/regions.csv (시·군·구 230곳, build_regions.py 가 생성)
- 난수를 쓰지 않는다(지역 id 기반 고정 노이즈) → 같은 입력이면 항상 같은 결과.
- 여기서는 '정전이 얼마나 일어났는지'만 만든다. 복구 우선순위는 priority_engine.py 의 몫.
"""
import csv       # CSV 파일 읽기용 파이썬 기본 도구
import math      # 삼각함수, 지수함수(exp), 제곱근 등 물리 계산용 수학 도구
import os        # 파일 및 폴더 경로 탐색용 도구
from datetime import datetime # 재난 발생 시각 기록용 도구

# 현재 파일(data_generator.py)이 위치한 폴더 경로 구하기
HERE = os.path.dirname(os.path.abspath(__file__))
# 기준 지역 DB 파일(regions.csv)의 absolute 경로 설정
REGIONS_CSV = os.path.join(HERE, "data", "regions.csv")
# 1. 지원하는 4가지 재난 종류 사전
DISASTERS = {
    "TYPHOON":    {"name": "태풍", "desc": "제주 → 남해안 → 동해안으로 북상하는 강한 태풍"},
    "EARTHQUAKE": {"name": "지진", "desc": "경북 포항 인근 진앙의 강진"},
    "HEAVY_RAIN": {"name": "집중호우", "desc": "수도권 중심의 시간당 100mm급 집중호우"},
    "HEATWAVE":   {"name": "폭염", "desc": "전국 폭염으로 인한 전력 피크 과부하 정전"},
}
# 2. 재난 이동 경로 및 중심점 좌표 (위도, 경도)
# 태풍 이동 경로선 (제주 서쪽 해상부터 동해안까지 6개 지점을 잇는 꺾은선)
TYPHOON_PATH = [(32.9, 125.9), (33.9, 127.0), (34.8, 128.2), (35.7, 129.3), (37.0, 129.5), (38.3, 128.9)]
# 지진 진앙지 (경북 포항 인근 위도 36.08, 경도 129.37)
QUAKE_EPICENTER = (36.08, 129.37)
# 집중호우 중심지 (수도권 인근 위도 37.55, 경도 126.95)
RAIN_CENTER = (37.55, 126.95)

# 3. 주요 임계값 및 기준 소요시간
MIN_OUTAGE_RATIO = 0.04         
# 정전 비율이 4%(0.04) 미만이면 정전 구역에서 제외
BASE_HOURS = {"TYPHOON": 6.0, "EARTHQUAKE": 14.0, "HEAVY_RAIN": 9.0, "HEATWAVE": 4.0} 
# 재난별 기본 복구시간
_REGIONS = None
# 읽어온 지역 데이터를 메모리에 저장해두는 캐싱용 전역 변수

def load_regions():
    """backend/data/regions.csv 파일을 읽어서 메모리에 보관하는 함수"""
    global _REGIONS
    if _REGIONS is None: # 아직 파일 데이터를 읽은 적이 없다면
        if not os.path.exists(REGIONS_CSV):
            raise FileNotFoundError(f"{REGIONS_CSV} 가 없습니다. backend/data/regions.csv 를 넣어 주세오.")
        rows = []
        with open(REGIONS_CSV, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                rows.append({
                    "id": int(r["id"]), "sido": r["sido"], "sigungu": r["sigungu"], "name": r["full_name"],
                    "type": r["type"], "lat": float(r["lat"]), "lng": float(r["lng"]),
                    "pop": int(r["pop"]), "pop65": int(r["pop65"]), "hosp": int(r["hosp"]),
                })
        _REGIONS = rows # 메모리에 저장
    return _REGIONS

# ---------- 지리 계산 ----------
def _km(lat, lng, lat0, lng0):
    """위도/경도 차이를 실제 지구 표면 상의 거리(km)로 변환하는 공식"""
    # 위도 1도는 약 110.57km, 경도 1도는 위도에 따라 약 111.32 * cos(위도) km
    return (lng - lng0) * math.cos(math.radians(lat0)) * 111.32, (lat - lat0) * 110.57

def dist_point(lat, lng, p):
    """특정 한 점(지진 진앙, 호우 중심)과 우리 지역 사이의 직교 거리(km) 계산"""
    x, y = _km(lat, lng, p[0], p[1])
    return math.hypot(x, y) # 피타고라스 정리(√(x² + y²))로 거리 산출

def dist_path(lat, lng, path):
    """태풍 이동 선분(꺾은선 경로)과 우리 지역 사이의 최단 거리(km) 계산"""
    best = 1e9
    for a, b in zip(path, path[1:]): # 태풍 경로의 지점들을 2개씩 짝지어 선분을 만듦
        ax, ay = _km(a[0], a[1], lat, lng); bx, by = _km(b[0], b[1], lat, lng)
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0 if L2 == 0 else max(0, min(1, -(ax * dx + ay * dy) / L2))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy)) # 가장 가까운 거리를 갱신
    return best

def _noise(rid, salt=1):
    """난수(random)를 쓰지 않고 지역 ID로 0~1 사이 고정 편차를 만드는 함수 (결정론적 고정 노이즈)"""
    return ((rid * 2654435761 * salt) % 4294967296) / 4294967296

def _clip(v, lo=0.0, hi=1.0):
    """수치가 0.0보다 작아지거나 1.0보다 커지지 않도록 한계를 자르는 안전 함수"""
    return max(lo, min(hi, v))


# ---------- 재난별 위험요소 → 정전 비율 (+ 왜 그렇게 됐는지 설명 문장) ----------
def _typhoon(reg, sev):
    """태풍 발생 시 정전 비율 계산"""
    d = dist_path(reg["lat"], reg["lng"], TYPHOON_PATH) # 태풍 경로와의 거리(km)
    wind = 42 * sev * math.exp(-((d / 140) ** 1.5))       # 거리가 멀어질수록 풍속 감쇠
    rain = 300 * sev * math.exp(-d / 160)                 # 거리가 멀어질수록 강수량 감쇠
    wp = 0.85 * _clip((wind - 15) / 25) ** 1.4            # 15m/s 이상의 바람부터 정전 피해 발생
    rp = 0.3 * _clip((rain - 150) / 200)                  # 150mm 이상의 강수부터 추가 정전 피해
    
    # 지역 형태에 따른 지중화 비율 보정
    # 군: 가공선로(공중 전선)가 많아 피해 1.15배 / 구: 땅속 전선(지중화)이 많아 피해 0.85배
    f = {"군": 1.15, "시": 1.0, "구": 0.85}[reg["type"]]
    why = {"군": "농어촌·산간은 가공선로가 많아 ×1.15", "시": "시 지역 보정 ×1.0", "구": "도심은 지중화가 많아 ×0.85"}[reg["type"]]
    detail = (f"태풍 경로에서 {d:.0f}km 거리 → 풍속 {wind:.0f}m/s(정전 {wp*100:.0f}%) + 강수 {rain:.0f}mm(+{rp*100:.0f}%) · {why}")
    return (wp + rp) * f, {"wind_speed": wind, "rainfall": rain}, detail

def _earthquake(reg, sev):
    """지진 발생 시 정전 비율 계산"""
    d = dist_point(reg["lat"], reg["lng"], QUAKE_EPICENTER) # 진앙지와의 거리
    mag = 6.6 + (sev - 1.0)                                # 진도/규모 산출
    mmi = 1.6 * mag - 2.8 * math.log10(d + 12)             # 거리에 따른 추정 진도(MMI) 감쇠
    ratio = 0.95 * _clip((mmi - 4.4) / 3.0) ** 1.3        # 진도 4.4 이상부터 정전 발생
    detail = f"진앙에서 {d:.0f}km 거리 → 추정 진도 {mmi:.1f} (진도 4.4부터 정전 시작, 7.4 이상에서 최대)"
    return ratio, {"seismic_intensity": mmi}, detail

def _heavy_rain(reg, sev):
    """집중호우 발생 시 정전 비율 계산"""
    d = dist_point(reg["lat"], reg["lng"], RAIN_CENTER)   # 호우 중심과의 거리
    rain = 380 * sev * math.exp(-((d / 80) ** 2))          # 강수량 감쇠
    # 도심(구)일수록 지하 변전소 침수 위험이 높아 x1.1 배 보정
    f = {"군": 0.85, "시": 1.0, "구": 1.1}[reg["type"]]
    why = {"군": "인구·설비 밀집도가 낮아 ×0.85", "시": "시 지역 보정 ×1.0", "구": "도심 지하변전·침수 취약 ×1.1"}[reg["type"]]
    detail = f"호우 중심에서 {d:.0f}km 거리 → 강수 {rain:.0f}mm (90mm부터 정전 시작, 380mm 부근 최대) · {why}"
    return 0.9 * _clip((rain - 90) / 290) ** 1.2 * f, {"rainfall": rain, "wind_speed": 12 * sev * math.exp(-((d / 120) ** 2))}, detail

def _heatwave(reg, sev):
    """폭염 발생 시 정전 비율 계산"""
    temp = 35 + 4 * sev * _noise(reg["id"], 7)
    # 인구가 많은 도시일수록 냉방 전력 수요 과부하로 정전 비율이 상승하는 물리 규칙
    ratio = _clip(0.55 * (reg["pop"] / 800_000) ** 0.9, 0, 0.6) * sev
    detail = (f"인구 {reg['pop']/1e4:.0f}만 명 도시라 냉방 수요가 집중 → 전력 피크 과부하 "
    f"(규칙: 인구가 클수록 정전 비율↑, 기온 {temp:.1f}℃는 참고 표시값)")
    return ratio, {"temperature": temp}, detail

_MODELS = {"TYPHOON": _typhoon, "EARTHQUAKE": _earthquake, "HEAVY_RAIN": _heavy_rain, "HEATWAVE": _heatwave}

COMMON_NOTES = [
    "이 화면의 기상·정전 수치는 실제 관측값이 아니라 공식으로 만든 '가상 시뮬레이션'입니다.",
    "실제 데이터: 응급의료기관 수·위치(공공데이터), 2026년 9월 주민등록 시·군·구 인구, 65~74세 고령 인구(ingu.csv, 75세 이상은 원본에 없어 제외). 가상 데이터: 기상 수치, 정전 비율, 복구시간.",
    "지역마다 ±15% 범위의 고정 편차를 곱해 현실처럼 들쭉날쭉하게 만들했고, 난수를 쓰지 않아 같은 재난·강도면 항상 같은 결과가 나옵니다.",
    "예상 복구시간 = 재난별 기본시간 × (0.6 + 1.4 × 정전 비율), 군 지역은 ×1.25 (현장 접근이 어려워 오래 걸린다고 가정).",
]
HOW = {
    "TYPHOON": ["가상 태풍 경로(제주 서쪽 해상 → 남해안 → 동해안)를 정하고, 각 시·군·구 중심이 경로에서 몇 km 떨어졌는지 계산합니다.",
                "경로에 가까울수록 풍속·강수가 커지도록 만든 수치입니다. 풍속 15m/s부터 정전이 시작되어 약 40m/s에서 최대, 강수는 150mm부터 추가 반영합니다.",
                "군 지역은 가공선로가 많아 ×1.15, 도심 구는 지중화가 많아 ×0.85로 보정합니다."],
    "EARTHQUAKE": ["가상 진앙(경북 포항 인근)에서 각 시·군·구까지의 거리를 계산하고, 거리가 멀수록 진도가 줄어드는 공식으로 추정 진도를 만듭니다.",
                   "진도 4.4부터 정전이 시작되어 7.4 이상에서 최대가 됩니다. 그래서 진앙 주변 약 100km 안쪽만 정전이 발생합니다."],
    "HEAVY_RAIN": ["가상 호우 중심(수도권)에서 각 시·군·구까지의 거리로 강수량을 만듭니다. 중심에서 멀어질수록 급격히 줄어듭니다.",
                   "강수 90mm부터 정전이 시작되어 380mm 부근에서 최대입니다. 도심 구는 지하변전·침수에 취약해 ×1.1, 군 지역은 ×0.85로 보정합니다."],
    "HEATWAVE": ["기상 수치가 아니라 '전력 수요' 규칙으로 만듭니다. 인구가 큰 도시일수록 냉방 수요가 몰려 정전 비율이 커집니다.",
                 "기온(35~39℃)은 시·군·구마다 고정 편차로 만든 참고 표시값이며 정전 비율 계산에는 쓰이지 않습니다."],
}


def _hazard_text(kind, h):
    if kind == "TYPHOON":    return f"풍속 {h['wind_speed']:.0f}m/s · 강수 {h['rainfall']:.0f}mm"
    if kind == "EARTHQUAKE": return f"추정 진도 {h['seismic_intensity']:.1f}"
    if kind == "HEAVY_RAIN": return f"강수 {h['rainfall']:.0f}mm"
    return f"기온 {h['temperature']:.1f}℃ · 전력 피크 과부하"


def _geo(kind):
    if kind == "TYPHOON":    return {"kind": "path", "points": [list(p) for p in TYPHOON_PATH]}
    if kind == "EARTHQUAKE": return {"kind": "point", "lat": QUAKE_EPICENTER[0], "lng": QUAKE_EPICENTER[1], "radius_km": 60}
    if kind == "HEAVY_RAIN": return {"kind": "point", "lat": RAIN_CENTER[0], "lng": RAIN_CENTER[1], "radius_km": 70}
    return None


def generate_disaster_scenario(disaster_type: str, severity: float = 1.0):
    """재난 종류와 강도를 받아 전국 230개 구역의 정전 현황 데이터를 최종 만드는 메인 함수"""
    kind = disaster_type.upper()
    if kind not in DISASTERS:
        raise ValueError(f"지원하지 않는 재난 유형: {disaster_type}")
    severity = _clip(float(severity), 0.5, 1.5) # 강도 범위를 0.5~1.5 사이로 자름

    # 재난 유형에 해당하는 정전 계산 모델 함수 선택 (오류 수정 지점)
    model = _MODELS[kind]

    outages, unaffected = [], 0
    for reg in load_regions(): # 230개 구역을 순회
        base, hz, detail = model(reg, severity)
        nz = 0.85 + 0.3 * _noise(reg["id"])                 # 구역별 고정 노이즈 편차
        ratio = _clip(base * nz, 0, 0.95)                   # 최종 정전 비율 (최대 95%)
        
        if ratio < MIN_OUTAGE_RATIO: # 4% 미만은 무피해 지역으로 분류
            unaffected += 1
            continue

        # [복구 소요시간 est_hours 계산 공식]
        # 기본시간 * (0.6 + 1.4 * 정전비율) * (군 지역은 진입이 어려워 1.25배 추가)
        hours = BASE_HOURS[kind] * (0.6 + 1.4 * ratio) * (1.25 if reg["type"] == "군" else 1.0)
        hours *= 0.9 + 0.2 * _noise(reg["id"], 3) # ±10% 고정 미세 편차

        # 정전 영향을 받은 병원 수 산출
        hosp_aff = int(reg["hosp"] * ratio + 0.5)
        if reg["hosp"] > 0 and hosp_aff == 0 and ratio >= 0.5:
            hosp_aff = 1

        # 1개 정전 구역 딕셔너리 생성
        outages.append({
            "region_id": str(reg["id"]), "region_name": reg["name"], "sido": reg["sido"], "sigungu": reg["sigungu"],
            "type": reg["type"], "lat": reg["lat"], "lng": reg["lng"],
            "population": reg["pop"], "pop65": reg["pop65"],
            "outage_ratio": round(ratio, 3),
            "affected_population": int(reg["pop"] * ratio),
            "vulnerable_affected": int(reg["pop65"] * ratio),
            "hospitals": reg["hosp"], "hospitals_affected": hosp_aff,
            "est_hours": round(hours, 1),
            "wind_speed": round(hz.get("wind_speed", 0.0), 1), 
            "rainfall": round(hz.get("rainfall", 0.0), 1),
            "temperature": round(hz.get("temperature", 0.0), 1), 
            "seismic_intensity": round(hz.get("seismic_intensity", 0.0), 1),
            "hazard_text": _hazard_text(kind, hz),
            "outage_cause": f"{detail} → 기본 {min(base,1)*100:.0f}% × 지역편차 {nz:.2f} = 최종 정전 {ratio*100:.0f}%",
        })

    now = datetime.now()
    # 전체 재난 요약 정보 묶음 생성
    event = {
        "event_id": now.strftime("%Y%m%d%H%M%S%f"),
        "type": kind, "type_name": DISASTERS[kind]["name"], "desc": DISASTERS[kind]["desc"],
        "severity": severity, "occurred_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "geo": _geo(kind),
        "summary": {
            "outage_zones": len(outages), "unaffected_zones": unaffected,
            "affected_population": sum(o["affected_population"] for o in outages),
            "hospitals_affected": sum(o["hospitals_affected"] for o in outages),
        },
    }
    return event, outages