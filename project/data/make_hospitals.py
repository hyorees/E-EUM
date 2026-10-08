"""hospitals.csv + backend/data/regions.csv → project/js/hospitals.js
병원 주소의 (시·도, 시·군·구)로 regions.csv 의 지역 id 를 찾아 붙인다.
실행: project/data 폴더에서  python make_hospitals.py
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
REGIONS = os.path.join(HERE, "..", "..", "backend", "data", "regions.csv")
OUT = os.path.join(HERE, "..", "js", "hospitals.js")

def read(path):
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(path, encoding=enc, newline="") as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            pass
    raise ValueError(path)

regions = read(REGIONS)
idx = {(r["sido"], r["sigungu"]): r for r in regions}
sejong = next((r for r in regions if r["sido"].startswith("세종")), None)   # 세종은 도로명으로 시작하는 주소가 있음

out, miss = [], 0
for h in read(os.path.join(HERE, "hospitals.csv")):
    t = h["주소"].split()
    r = idx.get((t[0], t[1])) or (sejong if t[0].startswith("세종") else None)
    if not r:
        miss += 1
        continue
    out.append({"n": h["병원명"].strip(), "a": h["주소"].strip(), "rid": int(r["id"]), "reg": r["full_name"]})

with open(OUT, "w", encoding="utf-8") as f:
    f.write("// make_hospitals.py 가 생성 (직접 수정 X)\nwindow.hospitalList = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(f"병원 {len(out)}곳 저장, 매칭 실패 {miss}곳 → {os.path.normpath(OUT)}")