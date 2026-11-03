"""외부 정전 정보 입구(outage_ingest.py) 점검. 실행: python test_outage_ingest.py  (pytest 없이도 동작)"""
from data_generator import estimate_recovery_hours, load_regions
from outage_ingest import IngestError, build_report
from priority_engine import calculate_priority

R = load_regions()
A, B = R[0], R[1]
checks = 0


def ok(cond, msg):
    global checks
    assert cond, msg
    checks += 1


def report(payload):
    return build_report({"repair_crew_count": 50, **payload}, R)


def rejects(payload, expect):
    try:
        report_payload = {"repair_crew_count": 50, **payload} if isinstance(payload, dict) else payload
        build_report(report_payload, R)
    except IngestError as e:
        ok(any(expect in m for m in e.errors), f"'{expect}' 오류가 없음: {e.errors}")
        return
    raise AssertionError(f"거절되어야 하는데 통과함: {payload}")


# 1) 최소 입력: 복구반 수 + 지역 식별 + outage_ratio, 나머지는 내부 계산/regions.csv 로 채워짐
ev, out, warn = build_report({"repair_crew_count": 12, "outages": [{"region_id": A["id"], "outage_ratio": 0.4}]}, R)
o = out[0]
ok(o["population"] == A["pop"] and o["pop65"] == A["pop65"] and o["hospitals"] == A["hosp"], "인구·병원 자동 채움")
ok(o["affected_population"] == int(A["pop"] * 0.4), "영향 인구 = 인구 × 정전 비율")
ok(ev["type"] == "EXTERNAL" and ev["severity"] is None and ev["repair_crew_count"] == 12, "event 기본값 및 복구반 수")
ok(ev["summary"]["outage_zones"] == 1, "event 요약")
ok(o["est_hours"] == round(estimate_recovery_hours("EXTERNAL", A["type"], 0.4), 1), "외부 est_hours 없이 내부 추정")
ok(warn == [], "경고 없음")

# 2) 사건 종류에 따라 내부 추정 기준시간이 바뀐다
_, out, _ = build_report({"repair_crew_count": 12, "event": {"type": "TYPHOON"},
                          "outages": [{"region_id": A["id"], "outage_ratio": 0.4}]}, R)
ok(out[0]["est_hours"] == round(estimate_recovery_hours("TYPHOON", A["type"], 0.4), 1), "사건 종류별 복구시간 추정")

# 3) 시·도+시군구 / 지역명으로도 찾을 수 있다
_, out, _ = report({"outages": [{"sido": B["sido"], "sigungu": B["sigungu"], "outage_ratio": 0.2}]})
ok(out[0]["region_id"] == str(B["id"]), "sido+sigungu 매칭")
_, out, _ = report({"outages": [{"region_name": B["name"], "outage_ratio": 0.2}]})
ok(out[0]["region_id"] == str(B["id"]), "region_name 매칭")

# 4) 선택 값을 직접 주면 그 값을 사용하고, 불가능한 값은 보정 + 경고
_, out, warn = report({"outages": [{"region_id": A["id"], "outage_ratio": 0.5,
                                    "hospitals_affected": 999, "affected_population": 10 ** 12}]})
ok(out[0]["hospitals_affected"] == A["hosp"] and out[0]["affected_population"] == A["pop"], "초과값 보정")
ok(len(warn) == 2, f"경고 2건이어야 함: {warn}")

# 5) 정전 비율 0 인 구역은 제외 + 경고, 전부 0이면 거절
_, out, warn = report({"outages": [{"region_id": A["id"], "outage_ratio": 0},
                                    {"region_id": B["id"], "outage_ratio": 0.3}]})
ok(len(out) == 1 and len(warn) == 1, "정전 0 제외")
rejects({"outages": [{"region_id": A["id"], "outage_ratio": 0}]}, "하나도 없습니다")

# 6) 잘못된 입력은 전체 거절
good = {"region_id": B["id"], "outage_ratio": 0.3}
rejects({"outages": [good, {"region_id": A["id"], "outage_ratio": 42}]}, "0~1 사이")  # 퍼센트로 보낸 실수
rejects({"outages": [{"region_id": A["id"], "outage_ratio": "0.4"}]}, "0~1 사이")    # 문자열
rejects({"outages": [{"region_id": A["id"], "outage_ratio": True}]}, "0~1 사이")    # bool
rejects({"outages": [{"region_id": A["id"], "outage_ratio": 0.4, "est_hours": 4}]}, "est_hours")
rejects({"outages": [{"region_id": A["id"], "outage_ratio": 0.4, "repair_crew_count": 3}]}, "요청 최상위")
rejects({"outages": [{"region_id": 99999, "outage_ratio": 0.4}]}, "지역을 찾을 수 없습니다")
rejects({"outages": [{"outage_ratio": 0.4}]}, "지역을 찾을 수 없습니다")              # 지역 식별 없음
rejects({"outages": [good, good]}, "중복")
rejects({"outages": []}, "1개 이상")
rejects({"outages": "x"}, "1개 이상")
rejects([], "JSON 객체")
rejects({"outages": [good], "event": {"severity": "강"}}, "event.severity")
rejects({"outages": [good], "event": {"geo": {"kind": "circle"}}}, "event.geo")
rejects({"outages": [{"region_id": A["id"], "outage_ratio": float("nan")}]}, "0~1 사이")
for bad_count in (0, -1, 1001, "3", True):
    try:
        build_report({"repair_crew_count": bad_count, "outages": [good]}, R)
    except IngestError as e:
        ok("repair_crew_count" in e.errors[0], f"잘못된 복구반 수 오류: {bad_count!r}")
    else:
        raise AssertionError(f"잘못된 복구반 수가 거절되지 않음: {bad_count!r}")
try:
    build_report({"outages": [good]}, R)
except IngestError as e:
    ok("repair_crew_count" in e.errors[0], "복구반 수 누락 오류")
else:
    raise AssertionError("복구반 수가 없으면 거절되어야 함")

# 7) 변환 결과가 우선순위 엔진을 그대로 통과한다
payload = {"repair_crew_count": 20, "event": {"event_id": "TEST-1", "type_name": "외부 테스트", "severity": 1.0},
           "outages": [{"region_id": r["id"], "outage_ratio": 0.1 + 0.01 * (r["id"] % 50)} for r in R[:40]]}
ev, out, _ = build_report(payload, R)
res = calculate_priority(out, "MIN_DAMAGE")
ok(len(res["items"]) == 40 and res["items"][0]["priority_rank"] == 1, "우선순위 계산 연결")
ok(ev["event_id"] == "TEST-1" and ev["repair_crew_count"] == 20 and ev["summary"]["outage_zones"] == 40, "event_id/복구반 수 유지")

print(f"통과: {checks}개 점검")
