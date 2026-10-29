# backend/outage_ingest.py
"""외부 시스템이 보낸 정전 정보를 검증하고, 화면·우선순위 엔진이 쓰는 형식으로 변환한다.

- 외부에서는 '지역 식별 + 정전 비율 + 예상 복구시간' 만 보내면 된다.
  인구·65~74세 인구·병원 수·좌표·지역 유형은 backend/data/regions.csv 에서 채운다.
- 형식이 틀리면 일부만 받지 않고 전체를 거절한다(IngestError). 잘못된 값으로 순위가 계산되는 것을 막기 위함.
- 값이 어색하지만 계산은 가능한 경우(예: 병원 수 초과)는 보정하고 warnings 로 알린다.
- 외부 라이브러리(FastAPI 등)에 의존하지 않는다 → 단독으로 테스트할 수 있다.

입력 규격 전문: docs/outage_report_spec.md
"""
from datetime import datetime

MAX_OUTAGES = 1000
MAX_HOURS = 24 * 30          # 복구 예상 30일 초과는 입력 오류로 본다
MAX_ERRORS_SHOWN = 50


class IngestError(Exception):
    def __init__(self, errors):
        super().__init__("; ".join(errors[:3]))
        self.errors = errors


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and v not in (float("inf"), float("-inf"))


def _index_regions(regions):
    by_id = {r["id"]: r for r in regions}
    by_pair = {(r["sido"], r["sigungu"]): r for r in regions}
    by_name = {r["name"]: r for r in regions}
    return by_id, by_pair, by_name


def _find_region(o, idx_tools):
    by_id, by_pair, by_name = idx_tools
    if o.get("region_id") is not None:
        rid = o["region_id"]
        try:
            rid = int(rid) if not isinstance(rid, bool) and (isinstance(rid, int) or (isinstance(rid, str) and rid.strip().isdigit())) else None
        except (TypeError, ValueError):
            rid = None
        return by_id.get(rid) if rid is not None else None
    if o.get("sido") and o.get("sigungu"):
        return by_pair.get((str(o["sido"]).strip(), str(o["sigungu"]).strip()))
    if o.get("region_name"):
        return by_name.get(str(o["region_name"]).strip())
    return None


def build_report(payload, regions):
    """payload(dict) → (event, outages, warnings). 문제가 있으면 IngestError."""
    errors, warnings = [], []
    if not isinstance(payload, dict):
        raise IngestError(["요청 본문은 JSON 객체여야 합니다. 예: {\"outages\": [...]}"])
    raw = payload.get("outages")
    if not isinstance(raw, list) or not raw:
        raise IngestError(["outages 는 1개 이상의 항목을 가진 배열이어야 합니다. (정전 해제는 POST /api/reset)"])
    if len(raw) > MAX_OUTAGES:
        raise IngestError([f"outages 는 최대 {MAX_OUTAGES}개까지 받을 수 있습니다. (받은 개수: {len(raw)})"])

    tools = _index_regions(regions)
    outages, seen = [], set()

    for i, o in enumerate(raw):
        tag = f"outages[{i}]"
        if not isinstance(o, dict):
            errors.append(f"{tag}: 객체여야 합니다.")
            continue
        reg = _find_region(o, tools)
        if reg is None:
            who = o.get("region_id", o.get("region_name", f"{o.get('sido')} {o.get('sigungu')}"))
            errors.append(f"{tag}: 지역을 찾을 수 없습니다 ({who}). region_id 또는 sido+sigungu 는 regions.csv 값과 같아야 합니다.")
            continue
        tag = f"outages[{i}]({reg['name']})"
        if reg["id"] in seen:
            errors.append(f"{tag}: 같은 지역이 중복되었습니다.")
            continue
        seen.add(reg["id"])

        bad = False
        ratio, hours = o.get("outage_ratio"), o.get("est_hours")
        if not _is_num(ratio) or not 0 <= ratio <= 1:
            errors.append(f"{tag}: outage_ratio 는 0~1 사이 숫자여야 합니다. (받은 값: {ratio!r}) 예: 정전 42% → 0.42"); bad = True
        if not _is_num(hours) or not 0 < hours <= MAX_HOURS:
            errors.append(f"{tag}: est_hours 는 0 초과 {MAX_HOURS} 이하 숫자(시간)여야 합니다. (받은 값: {hours!r})"); bad = True

        pop = reg["pop"]
        for key in ("population", "pop65", "hospitals"):
            if o.get(key) is not None and (not _is_num(o[key]) or o[key] < 0):
                errors.append(f"{tag}: {key} 는 0 이상의 숫자여야 합니다. (받은 값: {o[key]!r})"); bad = True
        for key in ("affected_population", "vulnerable_affected", "hospitals_affected"):
            if o.get(key) is not None and (not _is_num(o[key]) or o[key] < 0):
                errors.append(f"{tag}: {key} 는 0 이상의 숫자여야 합니다. (받은 값: {o[key]!r})"); bad = True
        if bad:
            continue

        if ratio == 0:
            warnings.append(f"{tag}: outage_ratio 가 0 이라 정전 구역에서 제외했습니다.")
            continue

        population = int(o["population"]) if o.get("population") is not None else pop
        pop65 = int(o["pop65"]) if o.get("pop65") is not None else reg["pop65"]
        hospitals = int(o["hospitals"]) if o.get("hospitals") is not None else reg["hosp"]

        aff_pop = int(o["affected_population"]) if o.get("affected_population") is not None else int(population * ratio)
        if aff_pop > population:
            warnings.append(f"{tag}: affected_population({aff_pop:,})이 인구({population:,})보다 커서 인구로 보정했습니다.")
            aff_pop = population
        vul = int(o["vulnerable_affected"]) if o.get("vulnerable_affected") is not None else int(pop65 * ratio)
        if vul > pop65:
            warnings.append(f"{tag}: vulnerable_affected({vul:,})이 65~74세 인구({pop65:,})보다 커서 보정했습니다.")
            vul = pop65
        if o.get("hospitals_affected") is not None:
            hosp_aff = int(o["hospitals_affected"])
        else:
            hosp_aff = int(hospitals * ratio + 0.5)
            if hospitals > 0 and hosp_aff == 0 and ratio >= 0.5:
                hosp_aff = 1
        if hosp_aff > hospitals:
            warnings.append(f"{tag}: hospitals_affected({hosp_aff})가 병원 수({hospitals})보다 커서 보정했습니다.")
            hosp_aff = hospitals

        outages.append({
            "region_id": str(reg["id"]), "region_name": reg["name"], "sido": reg["sido"], "sigungu": reg["sigungu"],
            "type": reg["type"], "lat": reg["lat"], "lng": reg["lng"],
            "population": population, "pop65": pop65,
            "outage_ratio": round(float(ratio), 3),
            "affected_population": aff_pop, "vulnerable_affected": vul,
            "hospitals": hospitals, "hospitals_affected": hosp_aff,
            "est_hours": round(float(hours), 1),
            "wind_speed": 0.0, "rainfall": 0.0, "temperature": 0.0, "seismic_intensity": 0.0,
            "hazard_text": str(o.get("hazard_text") or "외부 수신 데이터"),
            "outage_cause": str(o.get("outage_cause") or f"외부 시스템에서 수신한 정전 정보 (정전 비율 {ratio * 100:.0f}%)"),
        })

    ev_in = payload.get("event")
    if ev_in is not None and not isinstance(ev_in, dict):
        errors.append("event 는 객체여야 합니다.")
        ev_in = {}
    ev_in = ev_in or {}
    sev = ev_in.get("severity")
    if sev is not None and (not _is_num(sev) or sev < 0):
        errors.append(f"event.severity 는 0 이상의 숫자여야 합니다. (받은 값: {sev!r})")
    geo = ev_in.get("geo")
    if geo is not None and (not isinstance(geo, dict) or geo.get("kind") not in ("point", "path")):
        errors.append("event.geo 는 {\"kind\":\"point\",\"lat\":..,\"lng\":..,\"radius_km\":..} 또는 {\"kind\":\"path\",\"points\":[[lat,lng],..]} 형식이어야 합니다.")

    if errors:
        shown = errors[:MAX_ERRORS_SHOWN]
        if len(errors) > MAX_ERRORS_SHOWN:
            shown.append(f"... 외 {len(errors) - MAX_ERRORS_SHOWN}건")
        raise IngestError(shown)
    if not outages:
        raise IngestError(["정전 비율이 0 보다 큰 구역이 하나도 없습니다."])

    now = datetime.now()
    event = {
        "event_id": str(ev_in.get("event_id") or now.strftime("%Y%m%d%H%M%S%f")),
        "type": str(ev_in.get("type") or "EXTERNAL").upper(),
        "type_name": str(ev_in.get("type_name") or "외부 정전 정보"),
        "desc": str(ev_in.get("desc") or "외부 시스템에서 수신한 정전 현황"),
        "severity": float(sev) if sev is not None else None,
        "occurred_at": str(ev_in.get("occurred_at") or now.strftime("%Y-%m-%d %H:%M:%S")),
        "geo": geo,
        "explain": {
            "how": ["외부 시스템이 보낸 정전 현황을 그대로 사용합니다. 인구·고령 인구·병원 수는 regions.csv 값으로 채웠습니다."],
            "notes": ["이 데이터는 시뮬레이션이 아니라 외부에서 수신한 값입니다."],
        },
        "summary": {
            "outage_zones": len(outages), "unaffected_zones": max(0, len(regions) - len(outages)),
            "affected_population": sum(x["affected_population"] for x in outages),
            "hospitals_affected": sum(x["hospitals_affected"] for x in outages),
        },
    }
    return event, outages, warnings