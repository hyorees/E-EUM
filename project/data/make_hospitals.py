# project/data/make_hospitals.py
"""
hospitals.csv(응급의료기관 목록)와 backend/data/regions.csv(지역 DB)를 비교하여
각 병원이 어느 시·군·구(지역 ID)에 속하는지 매칭한 후,
웹 화면(프론트엔드)에서 데이터베이스 없이 바로 쓸 수 있는 project/js/hospitals.js 자바스크립트 파일로 변환해 주는 스크립트입니다.
"""

import csv  # CSV 파일을 읽기 위한 도구
import json  # 데이터를 자바스크립트용 문자열 형태로 변환하기 위한 도구
import os  # 경로 계산용 도구

# 현재 파일이 존재하는 폴더 위치 구하기
HERE = os.path.dirname(os.path.abspath(__file__))

# 참조할 기준 지역 DB 파일 경로 (backend/data/regions.csv)
REGIONS = os.path.join(HERE, "..", "..", "backend", "data", "regions.csv")

# 최종 생성될 자바스크립트 데이터 파일 경로 (project/js/hospitals.js)
OUT = os.path.join(HERE, "..", "js", "hospitals.js")


def read(path):
    """CSV 파일을 읽어서 딕셔너리 리스트로 변환해 주는 안전한 파일 읽기 함수"""
    for enc in ("utf-8-sig", "cp949"):  # 한글 깨짐 방지를 위해 인코딩 방식 2가지를 시도
        try:
            with open(path, encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            pass
    raise ValueError(path)


# 1. 백엔드 기준 지역 DB(regions.csv) 데이터를 읽어옵니다.
regions = read(REGIONS)

# (시·도, 시·군·구) 짝을 key로 삼아서 빠르게 지역 정보를 찾을 수 있는 사전을 만듭니다.
idx = {(r["sido"], r["sigungu"]): r for r in regions}

# 세종 특별자치시는 시·군·구가 별도로 없으므로 세종 지역 정보 하나를 따로 미리 찾아둡니다.
sejong = next((r for r in regions if r["sido"].startswith("세종")), None)

out, miss = [], 0  # 변환된 데이터를 저장할 리스트와 매칭 실패 개수 카운터

# 2. hospitals.csv 파일의 병원 목록을 하나씩 훑으며 주소를 바탕으로 지역 ID를 매칭합니다.
for h in read(os.path.join(HERE, "hospitals.csv")):
    t = h["주소"].split()  # 주소를 띄어쓰기 기준으로 쪼갭니다 (예: ["서울특별시", "강남구", "테헤란로..."])

    # 주소의 첫 번째 단어(시·도)와 두 번째 단어(시·군·구)를 기준으로 매칭 시도
    # 세종시 주소일 경우 미리 찾아둔 sejong 정보 적용
    r = idx.get((t[0], t[1])) or (sejong if t[0].startswith("세종") else None)

    # 지역 매칭에 실패하면 실패 카운트를 올리고 통과
    if not r:
        miss += 1
        continue

    # 매칭 성공 시 프론트엔드용 경량화 키 이름(n: 병원명, a: 주소, rid: 지역ID, reg: 전체지역명)으로 축약하여 수집
    out.append({
        "n": h["병원명"].strip(),
        "a": h["주소"].strip(),
        "rid": int(r["id"]),
        "reg": r["full_name"],
    })

# 3. 변환된 병원 리스트를 자바스크립트 전역 변수(window.hospitalList) 형태의 js 파일로 새로 만듭니다.
with open(OUT, "w", encoding="utf-8") as f:
    f.write(
        "// make_hospitals.py 가 생성 (직접 수정 X)\nwindow.hospitalList = "
        + json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )

print(
    f"병원 {len(out)}곳 저장, 매칭 실패 {miss}곳 → {os.path.normpath(OUT)}"
)