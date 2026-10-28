"""보건복지부 노인돌봄서비스 기관 현황을 지역 ID와 연결해 JS 데이터로 생성합니다."""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "보건복지부_노인돌봄서비스_기관_현황.csv")   # 파일명은 밑줄 버전으로 통일
REGIONS = os.path.join(HERE, "..", "..", "backend", "data", "regions.csv")
OUT = os.path.join(HERE, "..", "js", "care_centers.js")

SIDO_ALIASES = {
    "광주광역시": "전남광주통합특별시",
    "전라남도": "전남광주통합특별시",
}


def read_csv(path):
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with open(path, encoding=encoding, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"CSV 인코딩을 확인할 수 없습니다: {path}")


regions = read_csv(REGIONS)
region_by_key = {(r["sido"], r["sigungu"]): r for r in regions}
region_by_name = {r["sigungu"]: r for r in regions}


def find_region(row):
    sido = row["시도"].strip()
    sigungu = row["시군구"].strip()
    address = row["주소"].strip()
    address_parts = address.split()

    if sigungu == "세종특별자치시" or "세종특별자치시" in address:
        return region_by_key.get(("세종특별자치시", "세종시"))

    canonical_sido = SIDO_ALIASES.get(sido, sido)
    region = region_by_key.get((canonical_sido, sigungu))
    if region:
        return region

    if sido == "인천광역시":
        if sigungu == "동구":
            sigungu = "제물포구"
        elif sigungu == "중구":
            island_terms = ("영종", "운남", "운서", "중산", "을왕", "용유")
            sigungu = "영종구" if any(term in address for term in island_terms) else "제물포구"
        elif sigungu == "서구":
            sigungu = "검단구" if "검단" in address else "서해구"
        return region_by_name.get(sigungu)

    return None


source_rows = read_csv(SOURCE)
required = {"시도", "시군구", "기관명", "주소", "시설유형구분"}
if not source_rows or not required.issubset(source_rows[0]):
    raise ValueError("노인돌봄서비스 CSV에 필요한 열이 없습니다.")

out = []
unmatched = []
for row in source_rows:
    region = find_region(row)
    if not region:
        unmatched.append(f"{row['시도']} {row['시군구']} ({row['기관명']})")
        continue
    out.append({
        "n": row["기관명"].strip(),
        "a": row["주소"].strip(),
        "rid": int(region["id"]),
        "reg": region["full_name"],
        "type": row["시설유형구분"].strip(),
    })

if unmatched:
    raise ValueError("지역을 연결하지 못한 기관이 있습니다: " + ", ".join(unmatched))

with open(OUT, "w", encoding="utf-8") as f:
    f.write("// make_care_centers.py 가 생성 (직접 수정 X)\n")
    f.write("window.careCenterList = ")
    f.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    f.write(";\n")

print(f"노인돌봄서비스 기관 {len(out)}곳 저장 → {os.path.normpath(OUT)}")