# backend/build_regions.py
"""regions.csv 의 인구(pop)와 고령 인구(pop65)를 실제 데이터로 갱신한다.

- pop   : 주민등록 인구(월간) CSV 의 '총인구수'
- pop65 : ingu.csv 의 '65~69세 + 70~74세' 합계 (※ 75세 이상은 원본에 없음 → 실제 65세 이상보다 작다)
          ingu.csv 는 같은 이름의 구(중구·동구·서구 …)가 여러 시·도에 있으므로
          '시·도 행' 아래에 이어지는 행을 그 시·도 소속으로 보고 (시·도, 시군구) 쌍으로 매칭한다.
매칭에 실패하면 추정값으로 몰래 채우지 않고 오류로 멈춘다.
"""
import csv
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
POP_CSV = os.path.join(HERE, "data", "202609_202609_주민등록인구및세대현황_월간.csv")
TARGET_CSV = os.path.join(HERE, "data", "regions.csv")
INGU_CSV = os.path.join(HERE, "..", "project", "data", "ingu.csv")
POP_SOURCE = "resident_population_2026-09"
POP65_SOURCE = "ingu_age_65_74_sum"          # 65~69 + 70~74 (75세 이상 제외)

SIDO_RE = re.compile(r"(특별시|광역시|특별자치시|특별자치도|통합특별시|도)$")


def _is_sido(name):
    # '…도'로 끝나는 시·도(경기도, 충청북도 …) 와 '…시'로 끝나는 일반 시(수원시)를 구분
    return bool(SIDO_RE.search(name)) and (not name.endswith("시") or name.endswith(("특별시", "광역시", "특별자치시")))


def _read_cp949(path):
    for enc in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with open(path, encoding=enc, newline="") as f:
                return list(csv.reader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"CSV 인코딩을 확인할 수 없습니다: {path}")


def load_pop65_map():
    """{(시·도, 시군구): 65~74세 인구}. 시·도 행 자체는 (시·도, '') 로 저장."""
    rows = _read_cp949(INGU_CSV)[2:]            # 앞 2줄은 머리글
    mapping, sido = {}, None
    for row in rows:
        if len(row) < 5:
            continue
        name = row[0].strip()
        if name == "전국":
            continue
        try:
            value = int(row[3].replace(",", "")) + int(row[4].replace(",", ""))
        except ValueError:
            continue
        if _is_sido(name):
            sido = name
            mapping[(name, "")] = value
        else:
            mapping[(sido, name)] = value
    return mapping


def load_population_map():
    with open(POP_CSV, encoding="cp949", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "행정구역" not in reader.fieldnames:
            raise ValueError("인구 원본에 '행정구역' 열이 없습니다.")
        cols = [c for c in reader.fieldnames if "총인구수" in c]
        if len(cols) != 1:
            raise ValueError("인구 원본에서 총인구수 열을 하나로 확인할 수 없습니다.")
        pop = {}
        for row in reader:
            name = row["행정구역"].split("(", 1)[0].strip()
            raw = row[cols[0]].replace(",", "").strip()
            if not raw.isdigit():
                continue
            if name in pop and pop[name] != int(raw):
                raise ValueError(f"인구 원본에 중복·불일치 지역이 있습니다: {name}")
            pop[name] = int(raw)
    return pop


def apply_real_population():
    pop_map = load_population_map()
    pop65_map = load_pop65_map()

    with open(TARGET_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        need = {"sido", "sigungu", "pop", "pop65", "pop65_ratio", "pop_source"}
        if not need.issubset(fieldnames):
            raise ValueError("regions.csv에 필요한 인구 열이 없습니다.")
        if "pop65_source" not in fieldnames:
            fieldnames.append("pop65_source")
        regions = list(reader)

    missing_pop, missing_65 = [], []
    for row in regions:
        full = f"{row['sido']} {row['sigungu']}"
        pop = pop_map.get(full)
        if pop is None and row["sigungu"] == "세종시":          # 세종은 시·군·구가 없다
            pop = pop_map.get(row["sido"])
        v65 = pop65_map.get((row["sido"], row["sigungu"]))
        if v65 is None and row["sigungu"] == "세종시":
            v65 = pop65_map.get((row["sido"], ""))
        if pop is None:
            missing_pop.append(full)
        if v65 is None:
            missing_65.append(full)
            continue
        row["pop"], row["pop65"] = str(pop), str(v65)
        row["pop65_ratio"] = str(round(v65 / pop, 6)) if pop else "0"
        row["pop_source"], row["pop65_source"] = POP_SOURCE, POP65_SOURCE

    if missing_pop or missing_65:
        raise ValueError(f"매칭 실패 — 인구: {missing_pop} / 고령: {missing_65}")

    with open(TARGET_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(regions)
    print(f"성공: {len(regions)}개 지역의 인구와 65~74세 인구를 (시·도, 시군구) 기준으로 갱신했습니다.")


if __name__ == "__main__":
    apply_real_population()