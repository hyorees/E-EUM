# backend/main.py
"""재난 전력복구 의사결정 지원 API

흐름
  1) 정전 정보 입력 (둘 중 하나)
       · POST /api/simulate        데모용 가상 재난 생성기 (/docs 에서도 실행 가능)
       · POST /api/outage-report   외부 시스템(한전 등)이 보내는 실제 정전 정보  ← 규격: docs/outage_report_spec.md
  2) 정전 정보 조회 GET  /api/outage-report   (화면이 주기적으로 조회 → 새 재난이 오면 표시)
  3) 우선순위 산출  POST /api/priority        (화면이 받은 정전 정보를 보내면 순위를 계산)
"""
from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_generator import DISASTERS, generate_disaster_scenario, load_regions
from outage_ingest import IngestError, build_report
from priority_engine import STRATEGIES, calculate_priority

app = FastAPI(title="재난 전력복구 의사결정 지원 API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

STATE = {"event": None, "outages": []}      # 현재 진행 중인 재난 (메모리 보관)


class SimulateRequest(BaseModel):
    disaster_type: str = "TYPHOON"
    severity: float = 1.0                  # 0.5(약) ~ 1.5(강)


class PriorityRequest(BaseModel):
    outages: list[dict]
    strategy: str = "MIN_DAMAGE"
    weights: dict | None = None            # {"pop":..,"fac":..,"vul":..,"sev":..,"dur":..} 직접 지정 시


@app.get("/")
def root():
    return {"안내": "아래 주소를 브라우저에서 열어 보세요",
            "API 문서(실행 화면)": "/docs", "수신 원본 데이터(JSON)": "/api/outage-report", "상태 확인": "/api/health"}


@app.get("/api/health")
def health():
    return {"ok": True, "regions": len(load_regions())}


@app.get("/api/disasters")
def disasters():
    return {
        "disasters": [{"type": k, **v} for k, v in DISASTERS.items()],
        "strategies": [{"type": k, "label": v["label"], "weights": v["w"]} for k, v in STRATEGIES.items()],
    }


@app.post("/api/simulate")
def simulate(req: SimulateRequest):
    try:
        event, outages = generate_disaster_scenario(req.disaster_type, req.severity)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    STATE["event"], STATE["outages"] = event, outages
    return {"event": event, "outages": outages}


@app.post("/api/reset")
def reset():
    STATE["event"], STATE["outages"] = None, []
    return {"ok": True}


@app.get("/api/outage-report")
def outage_report():
    """현재 수신된 정전 현황. 재난이 없으면 event=null. (우선순위는 포함하지 않음)"""
    return {"event": STATE["event"], "outages": STATE["outages"]}


@app.post("/api/outage-report")
def receive_outage_report(payload: dict = Body(...)):
    """외부 시스템이 정전 정보를 보내는 입구. 검증을 통과하면 현재 재난으로 교체한다(화면이 자동으로 받아감).

    형식이 하나라도 틀리면 전체를 거절(422)하고 오류 목록을 돌려준다. 규격은 docs/outage_report_spec.md.
    """
    try:
        event, outages, warnings = build_report(payload, load_regions())
    except IngestError as e:
        raise HTTPException(status_code=422, detail={"message": "정전 정보 형식 오류로 접수하지 않았습니다.", "errors": e.errors})
    if STATE["event"] and STATE["event"]["event_id"] == event["event_id"]:
        warnings.append("event_id 가 현재 재난과 같아 화면은 새로고침하지 않습니다. 새 정보로 갱신하려면 다른 event_id 를 쓰세요.")
    STATE["event"], STATE["outages"] = event, outages
    return {"ok": True, "event_id": event["event_id"], "accepted": len(outages), "warnings": warnings}


@app.post("/api/priority")
def priority(req: PriorityRequest):
    return calculate_priority(req.outages, req.strategy, req.weights)