# backend/build_regions.py
import csv
import os
import re

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
POP_CSV = os.path.join(HERE, "data", "202609_202609_주민등록인구및세대현황_월간.csv")
TARGET_CSV = os.path.join(HERE, "data", "regions.csv")
INGU_CSV = os.path.join(HERE, "..", "project", "data", "ingu.csv")
POP65_RATIO = 0.192
POP_SOURCE = "resident_population_2026-09"
POP65_SOURCE = "real_age_65_plus_from_ingu_cva"


def _norm_name(value):
    if value is None:
        return ""
    return re.sub(r"\s+", "", str(value)).lower().replace(".", "")


def _load_real_older_map():
    if not os.path.exists(INGU_CSV):
        return {}
    try:
        df = pd.read_csv(INGU_CSV, encoding="cp949")
    except Exception:
        return {}
    mapping = {}
    for _, row in df.iloc[2:].iterrows():
        if len(row) < 5:
            continue
        try:
            aged_65 = int(str(row.iloc[3]).replace(",", "")) + int(str(row.iloc[4]).replace(",", ""))
        except (TypeError, ValueError):
            continue
        for key in [row.iloc[0], row.iloc[1], f"{row.iloc[0]} {row.iloc[1]}", f"{row.iloc[1]} {row.iloc[0]}"]:
            norm = _norm_name(key)
            if norm:
                mapping[norm] = int(aged_65)
    return mapping


def apply_real_population():
    if not os.path.exists(POP_CSV) or not os.path.exists(TARGET_CSV):
        raise FileNotFoundError("인구 원본 또는 regions.csv 파일 경로를 확인해 주세요.")

    with open(POP_CSV, encoding="euc-kr", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "행정구역" not in reader.fieldnames:
            raise ValueError("인구 원본에 '행정구역' 열이 없습니다.")
        pop_columns = [name for name in reader.fieldnames if "총인구수" in name]
        if len(pop_columns) != 1:
            raise ValueError("인구 원본에서 총인구수 열을 하나로 확인할 수 없습니다.")

        pop_map = {}
        for row in reader:
            name = row["행정구역"].split("(", 1)[0].strip()
            raw_value = row[pop_columns[0]].replace(",", "").strip()
            if not raw_value.isdigit():
                continue
            value = int(raw_value)
            if name in pop_map and pop_map[name] != value:
                raise ValueError(f"인구 원본에 중복·불일치 지역이 있습니다: {name}")
            pop_map[name] = value

    with open(TARGET_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if not fieldnames or not {"sido", "sigungu", "pop", "pop65", "pop65_ratio", "pop_source"}.issubset(fieldnames):
            raise ValueError("regions.csv에 필요한 인구 열이 없습니다.")
        if "pop65_source" not in fieldnames:
            fieldnames.append("pop65_source")
        regions = list(reader)

    updates = []
    missing = []
    older_map = _load_real_older_map()
    for row in regions:
        source_name = f"{row['sido']} {row['sigungu']}"
        population = pop_map.get(source_name)
        if population is None and row["sigungu"] == "세종시":
            population = pop_map.get(row["sido"])
        if population is None:
            missing.append(source_name)
            continue
        updates.append((row, population))

    if missing:
        raise ValueError("인구 원본에서 일치하는 지역을 찾지 못했습니다: " + ", ".join(missing))

    for row, population in updates:
        row["pop"] = str(population)
        pop65 = None
        for cand in [row["full_name"], row["sigungu"], row["sido"], f"{row['sido']} {row['sigungu']}", f"{row['sigungu']} {row['sido']}"]:
            val = older_map.get(_norm_name(cand))
            if val is not None:
                pop65 = int(val)
                break
        if pop65 is None:
            pop65 = int(population * POP65_RATIO)
        row["pop65"] = str(pop65)
        row["pop65_ratio"] = str(POP65_RATIO if pop65 is None else pop65 / population)
        row["pop_source"] = POP_SOURCE
        row["pop65_source"] = POP65_SOURCE

    with open(TARGET_CSV, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(regions)

    print(f"성공: {len(updates)}개 지역의 2026년 9월 인구를 정확한 행정구역명으로 적용했습니다.")
    print(f"65세 이상 인구는 project/data/ingu.csv 값을 우선 적용하고, 없으면 추정 비율 {POP65_RATIO:.1%}으로 채웠습니다.")


if __name__ == "__main__":
    apply_real_population()