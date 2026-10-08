# backend/main.py
"""재난 전력복구 의사결정 지원 API

흐름
  1) 재난 발생      POST /api/simulate        (데모용 트리거. /docs 에서도 실행 가능)
  2) 정전 정보 수신 GET  /api/outage-report   (화면이 주기적으로 조회 → 새 재난이 오면 표시)
  3) 우선순위 산출  POST /api/priority        (화면이 받은 정전 정보를 보내면 순위를 계산)
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_generator import DISASTERS, generate_disaster_scenario, load_regions
from priority_engine import STRATEGIES, calculate_priority

app = FastAPI(title="재난 전력복구 의사결정 지원 API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

STATE = {"event": None, "outages": []}      # 현재 진행 중인 재난 (메모리 보관)


class SimulateRequest(BaseModel):
    disaster_type: str = "TYPHOON"
    severity: float = 1.0                  # 0.5(약) ~ 1.5(강)


class PriorityRequest(BaseModel):
    outages: list[dict]
    strategy: str = "BALANCED"
    weights: dict | None = None            # {"pop":..,"fac":..,"vul":..,"sev":..} 직접 지정 시


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


@app.post("/api/priority")
def priority(req: PriorityRequest):
    return calculate_priority(req.outages, req.strategy, req.weights)