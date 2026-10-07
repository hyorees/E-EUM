import os, json
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
JS_DIR = os.path.join(os.path.dirname(HERE), 'js')
os.makedirs(JS_DIR, exist_ok=True)

regions = ["부산 권역", "광주·전남 권역", "대구·경북 권역", "충청 권역", "수도권 남부", "강원 권역", "전북 권역"]
coords = {"부산 권역": (35.17955, 129.0756), "광주·전남 권역": (35.15954, 126.8526), "대구·경북 권역": (35.87143, 128.6014),
          "충청 권역": (36.35041, 127.3845), "수도권 남부": (37.26357, 127.0286), "강원 권역": (37.88536, 127.7298),
          "전북 권역": (35.82422, 127.148)}

# 시·도 → 권역 (경남·울산은 부산 권역, 제주는 권역 없음)
prov = {"부산광역시": 0, "울산광역시": 0, "경상남도": 0, "전남광주통합특별시": 1, "광주광역시": 1, "전라남도": 1,
        "대구광역시": 2, "경상북도": 2, "대전광역시": 3, "세종특별자치시": 3, "충청북도": 3, "충청남도": 3,
        "서울특별시": 4, "경기도": 4, "인천광역시": 4, "강원특별자치도": 5, "강원도": 5, "전북특별자치도": 6, "전라북도": 6}

stations = {
    0: "부산 북부산 김해시 양산시 울산 창원 북창원 통영 진주 거제 밀양 산청 거창 합천 함양군 의령군 남해",
    1: "광주 목포 여수 완도 순천 해남 진도군 보성군 강진군 장흥 고흥 광양시 영광군 흑산도",
    2: "대구 포항 안동 상주 구미 영천 경주시 영주 문경 의성 봉화 청송군 영덕 울진 울릉도",
    3: "대전 청주 서청주 충주 제천 보은 천안 서산 보령 부여 금산 세종 홍성 추풍령",
    4: "서울 인천 수원 이천 양평 강화 동두천 파주 백령도",
    5: "속초 북춘천 철원 대관령 춘천 북강릉 강릉 동해 영월 인제 홍천 태백 정선군 원주",
    6: "전주 군산 고창 정읍 남원 부안 임실 장수 순창군 고창군"}
stn2reg = {s: r for r, v in stations.items() for s in v.split()}

def read_any(path):
    for enc in ("utf-8-sig", "cp949"):
        try: return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError: pass
    raise ValueError(path)

pop = [0] * 7; hosp = [0] * 7
d = read_any(os.path.join(HERE, 'population.csv'))
for _, r in d.iterrows():
    k = prov.get(str(r.iloc[0]).strip().split(" ")[0])
    if k is not None:
        try: pop[k] += int(float(str(r.iloc[1]).replace(',', '')))
        except ValueError: pass
for a in read_any(os.path.join(HERE, 'hospitals.csv'))["주소"]:
    k = prov.get(str(a).strip().split(" ")[0])
    if k is not None: hosp[k] += 1

outage = [{"id": i + 1, "region": n, "lat": coords[n][0], "lng": coords[n][1],
           "pop": pop[i], "hosp": hosp[i], "shelters": 0} for i, n in enumerate(regions)]

# ---- 기상청: 권역별 '시간 단위' 집계 (화면에서 원하는 시점을 고를 수 있도록 전체 기간 보관)
k = read_any(os.path.join(HERE, 'kma_weather.csv')).rename(
    columns={"기온(°C)": "temp", "강수량(mm)": "rain", "풍속(m/s)": "wind", "일시": "dt", "지점명": "stn"})
k.loc[k["기온 QC플래그"] == 9, "temp"] = np.nan
k.loc[k["풍속 QC플래그"] == 9, "wind"] = np.nan
k["rain"] = k["rain"].fillna(0.0)          # 강수량 공란 = 무강수
k["dt"] = pd.to_datetime(k["dt"])
k = k[k["stn"].isin(stn2reg)]
idx = pd.date_range(k["dt"].min(), k["dt"].max(), freq="h")
allst = sorted(stn2reg)
sidx = {s: i for i, s in enumerate(allst)}
P = {c: k.pivot_table(index="dt", columns="stn", values=c, aggfunc="first").reindex(idx) for c in ("temp", "rain", "wind")}
R24 = P["rain"].fillna(0).rolling(24, min_periods=1).sum()

def r1(a): return [None if (v is None or np.isnan(v)) else round(float(v), 1) for v in a]
def top(df):  # 권역 내 최대값과 그 지점 번호
    a = df.fillna(-1).values; m = a.max(axis=1); j = a.argmax(axis=1)
    cols = list(df.columns)
    return np.where(m < 0, 0, m), [sidx[cols[x]] for x in j]

hourly = {}
for ri, name in enumerate(regions):
    cols = [s for s in allst if stn2reg[s] == ri]
    wm, wms = top(P["wind"][cols]); rm, rms = top(P["rain"][cols]); r24, r24s = top(R24[cols])
    hourly[name] = {"t": r1(P["temp"][cols].mean(axis=1)), "w": r1(P["wind"][cols].mean(axis=1)),
                    "wm": r1(wm), "wms": wms, "r": r1(rm), "rs": rms, "r24": r1(r24), "r24s": r24s, "n": len(cols)}

# ---- 대표 사례(프리셋): 전국에서 강풍 3건 + 호우 3건 (72시간 이상 간격)
def peaks(kind, n=3):
    best = np.zeros(len(idx)); info = [None] * len(idx)
    for name in regions:
        h = hourly[name]; key, skey = ("wm", "wms") if kind == "wind" else ("r", "rs")
        for i in range(len(idx)):
            v = h[key][i] or 0
            if v > best[i]: best[i] = v; info[i] = (name, v, allst[h[skey][i]])
    out = []
    for i in np.argsort(-best):
        if all(abs(i - e["i"]) >= 72 for e in out):
            nm, v, st = info[i]
            lbl = f"최대풍속 {v}m/s" if kind == "wind" else f"시간강수 {v}mm"
            out.append({"i": int(i), "label": f"{'🌀' if kind == 'wind' else '🌧'} {idx[i]:%m/%d %H시} · {nm} {lbl}({st})"})
        if len(out) == n: break
    return out
events = peaks("wind") + peaks("rain")

meta = {"start": f"{idx[0]:%Y-%m-%d %H:%M}", "n": len(idx), "stations": allst, "last": len(idx) - 1}
with open(os.path.join(JS_DIR, 'weather.js'), 'w', encoding='utf-8') as f:
    f.write("const weatherMeta = " + json.dumps(meta, ensure_ascii=False) + ";\n")
    f.write("const weatherEvents = " + json.dumps(events, ensure_ascii=False) + ";\n")
    f.write("const weatherHourly = " + json.dumps(hourly, ensure_ascii=False, separators=(',', ':')) + ";\n")

with open(os.path.join(JS_DIR, 'data.js'), 'w', encoding='utf-8') as f:
    f.write("// make_data.py 가 생성 (직접 수정 X)\nconst outageData = " + json.dumps(outage, ensure_ascii=False, indent=1) + ";\n\n")
    f.write('''const scenarioData = {
  A:{name:"A. 사회적 피해 최소화", short:"피해 최소화", rule:"우선순위 점수 ÷ 복구 소요시간이 큰 구역부터", desc:"영향 인구·중요시설·기상 위험을 종합한 우선순위 점수가 높고 빨리 끝나는 구역부터 복구해, 정전 상태로 머무는 인구·시간을 줄입니다."},
  B:{name:"B. 중요시설 우선", short:"중요시설 우선", rule:"응급의료기관이 많은 구역부터", desc:"병원 등 응급의료기관이 많은 구역을 먼저 복구해 생명·안전과 직결된 시설의 정전 시간을 줄입니다."},
  C:{name:"C. 네트워크 효율 우선", short:"효율 우선", rule:"복구 소요시간이 짧은 구역부터", desc:"작업량이 적은 구역부터 끝내 복구 완료 구역 수를 빠르게 늘립니다."}
};
''')
print("병원", hosp, "인구", pop)
print("기상:", meta["n"], "시간,", len(allst), "지점 / 대표 사례:", [e["label"] for e in events])