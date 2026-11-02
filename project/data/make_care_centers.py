# project/data/make_care_centers.py
"""
보건복지부 노인돌봄서비스 기관 현황 CSV 데이터의 주소를 분석하여 
백엔드 지역 ID(rid)와 연결한 뒤, 프론트엔드 웹 화면용 자바스크립트 파일(project/js/care_centers.js)로 생성해 주는 전처리 스크립트입니다.
"""

import csv  # CSV 읽기 라이브러리
import json  # JSON 문자열 변환 라이브러리
import os  # 경로 탐색 라이브러리

# 경로 설정
HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(
    HERE, "보건복지부_노인돌봄서비스_기관_현황.csv"
)  # 노인돌봄서비스 원본 CSV
REGIONS = os.path.join(
    HERE, "..", "..", "backend", "data", "regions.csv"
)  # 백엔드 기준 지역 DB
OUT = os.path.join(
    HERE, "..", "js", "care_centers.js"
)  # 최종 생성될 JS 데이터 파일

# 행정구역 통합/변경 보정용 별칭 사전
# (예: 광주광역시, 전라남도가 시스템상 '전남광주통합특별시'로 묶여 있는 경우 처리)
SIDO_ALIASES = {
    "광주광역시": "전남광주통합특별시",
    "전라남도": "전남광주통합특별시",
}


def read_csv(path):
    """한글 깨짐 없이 CSV 파일을 안전하게 읽어오는 함수"""
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with open(path, encoding=encoding, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"CSV 인코딩을 확인할 수 없습니다: {path}")


# 백엔드 지역 DB(regions.csv) 정보를 읽어 조회를 위한 빠른 탐색 사전(dictionary) 구축
regions = read_csv(REGIONS)
region_by_key = {
    (r["sido"], r["sigungu"]): r for r in regions
}  # (시도, 시군구) 기준 탐색 표
region_by_name = {
    r["sigungu"]: r for r in regions
}  # 시군구 단독 이름 기준 탐색 표


def find_region(row):
    """
    기관 데이터의 주소 및 시도/시군구 문자를 바탕으로 
    regions.csv에서 일치하는 지역 객체를 찾아 리턴하는 예외처리 보정 함수
    """
    sido = row["시도"].strip()
    sigungu = row["시군구"].strip()
    address = row["주소"].strip()

    # 1. 세종특별자치시 예외 처리
    if sigungu == "세종특별자치시" or "세종특별자치시" in address:
        return region_by_key.get(("세종특별자치시", "세종시"))

    # 광주/전남 등 행정구역 별칭 보정 적용
    canonical_sido = SIDO_ALIASES.get(sido, sido)
    region = region_by_key.get((canonical_sido, sigungu))
    if region:
        return region

    # 2. 인천광역시 행정구역 개편 예외 처리 (제물포구, 영종구, 검단구, 서해구 등 명칭 매칭)
    if sido == "인천광역시":
        if sigungu == "동구":
            sigungu = "제물포구"
        elif sigungu == "중구":
            island_terms = ("영종", "운남", "운서", "중산", "을왕", "용유")
            # 섬 지역 주소 단어가 있으면 영종구, 없으면 제물포구로 매칭
            sigungu = (
                "영종구"
                if any(term in address for term in island_terms)
                else "제물포구"
            )
        elif sigungu == "서구":
            sigungu = "검단구" if "검단" in address else "서해구"
        return region_by_name.get(sigungu)

    return None  # 매칭 실패 시 None 반환


# 1. 원본 노인돌봄서비스 CSV 데이터 읽기 및 필수 필드 검사
source_rows = read_csv(SOURCE)
required = {"시도", "시군구", "기관명", "주소", "시설유형구분"}
if not source_rows or not required.issubset(source_rows[0]):
    raise ValueError("노인돌봄서비스 CSV에 필요한 열이 없습니다.")

out = []  # 매칭에 성공한 데이터를 담을 리스트
unmatched = []  # 매칭 실패한 데이터 기관 이름을 기록할 리스트

# 2. 기관 현황 행을 돌면서 백엔드 지역 ID 매칭 수행
for row in source_rows:
    region = find_region(row)
    if not region:
        unmatched.append(f"{row['시도']} {row['시군구']} ({row['기관명']})")
        continue

    # 웹 화면용 경량화 데이터 묶음 생성 (n: 기관명, a: 주소, rid: 지역ID, reg: 지역전체이름, type: 시설유형)
    out.append({
        "n": row["기관명"].strip(),
        "a": row["주소"].strip(),
        "rid": int(region["id"]),
        "reg": region["full_name"],
        "type": row["시설유형구분"].strip(),
    })

# 매칭 실패 건이 하나라도 있으면 원인을 보여주며 프로그램 중지
if unmatched:
    raise ValueError(
        "지역을 연결하지 못한 기관이 있습니다: " + ", ".join(unmatched)
    )

# 3. 변환된 데이터를 care_centers.js 자바스크립트 데이터 파일로 생성
with open(OUT, "w", encoding="utf-8") as f:
    f.write("// make_care_centers.py 가 생성 (직접 수정 X)\n")
    f.write("window.careCenterList = ")
    f.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    f.write(";\n")

print(
    f"노인돌봄서비스 기관 {len(out)}곳 저장 → {os.path.normpath(OUT)}"
)