# backend/main.py
"""재난 전력복구 의사결정 지원 API

흐름
  1) 정전 정보 입력 (둘 중 하나)
       · POST /api/simulate        데모용 가상 재난 생성기 (/docs 에서도 실행 가능)
       · POST /api/outage-report   외부 시스템(한전 등)이 보내는 실제 정전 정보  ← 규격: docs/outage_report_spec.md
  2) 정전 정보 조회 GET  /api/outage-report   (화면이 주기적으로 조회 → 새 재난이 오면 표시)
  3) 우선순위 산출  POST /api/priority        (화면이 받은 정전 정보를 보내면 순위를 계산)
"""
"""재난 전력복구 의사결정 지원 API 메인 서버

이 파일은 웹 브라우저(프론트엔드 app.js) 및 외부 관제 시스템(한전 등)과 백엔드를 연결해 주는
REST API 웹 서버 모듈입니다.
"""

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
# 다른 파이썬 파일들에서 작성해 둔 핵심 기능(함수/변수)들을 가져옵니다.
from data_generator import DISASTERS, generate_disaster_scenario, load_regions
from outage_ingest import IngestError, build_report
from priority_engine import STRATEGIES, calculate_priority
# 1. FastAPI 웹 애플리케이션 객체 생성
# title: Swagger 웹 문서(/docs) 상단에 표시될 시스템 제목
app = FastAPI(title="재난 전력복구 의사결정 지원 API")
# 2. CORS(교차 출처 자원 공유) 보안 설정
# 프론트엔드(웹 화면)와 백엔드 서버의 주소/포트 번호가 서로 달라도 브라우저 차단 없이 데이터를 정상 수신하도록 허용합니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # 모든 도메인 주소에서의 접속을 허용
    allow_credentials=True,   # 인증 정보 포함 요청 허용
    allow_methods=["*"],      # GET, POST 등 모든 HTTP 메서드 허용
    allow_headers=["*"],      # 모든 헤더 정보 허용
)
# 3. 현재 진행 중인 재난 데이터를 서버 메모리에 보관하는 전역 상태 상자
# 데이터베이스(DB) 대신 파이썬 딕셔너리로 재난 정보를 기억합니다.
STATE = {"event": None, "outages": []}      # 현재 진행 중인 재난 (메모리 보관)


# 4. 프론트엔드가 보낸 데이터 양식을 검사하는 Pydantic 클래스 정의

class SimulateRequest(BaseModel):
    """시뮬레이션 재난 생성 요청 데이터 양식"""
    disaster_type: str = "TYPHOON"  # 재난 종류 (기본값: 태풍)
    severity: float = 1.0           # 재난 강도 (기본값: 1.0, 범위: 0.5~1.5)


class PriorityRequest(BaseModel):
    """복구 우선순위 산출 요청 데이터 양식"""
    outages: list[dict]             # 정전이 발생한 구역 데이터 목록
    strategy: str = "MIN_DAMAGE"     # 선택한 복구 시나리오 (기본값: A. 사회적 피해 최소화)
    weights: dict | None = None     # 사용자가 직접 수정한 가중치 (필요 시)

# 5. API 엔드포인트(웹 접속 창구) 정의
@app.get("/")
def root():
    """웹 서버 최상단 접속 시 시스템 안내 문구와 주요 접속 주소를 보여주는 기본 창구 (GET 방식)"""
    return {
        "안내": "아래 주소를 브라우저에서 열어 보세요",
        "API 문서(실행 화면)": "/docs", 
        "수신 원본 데이터(JSON)": "/api/outage-report", 
        "상태 확인": "/api/health"
    }

@app.get("/api/health")
def health():
    """서버가 잘 작동하고 있는지, regions.csv 데이터를 정상적으로 읽는지 확인하는 헬스체크 창구"""
    return {"ok": True, "regions": len(load_regions())}


@app.get("/api/disasters")
def disasters():
    """시스템이 지원하는 재난 4종류와 복구 시나리오(A/B/C) 목록을 프론트엔드에 전달하는 창구"""
    return {
        "disasters": [{"type": k, **v} for k, v in DISASTERS.items()],
        "strategies": [{"type": k, "label": v["label"], "weights": v["w"]} for k, v in STRATEGIES.items()],
    }


@app.post("/api/simulate")
def simulate(req: SimulateRequest):
    """
    [가상 재난 시뮬레이션 창구 (POST 방식)]
    웹 화면에서 '태풍 강도 1.2' 등을 전달받으면 data_generator.py를 실행하여
    가상 정전 데이터를 새로 만들고 서버 메모리(STATE)에 기억시킵니다.
    """
    try:
        # data_generator.py의 메인 함수를 실행해 재난 정보와 정전 목록을 생성
        event, outages = generate_disaster_scenario(req.disaster_type, req.severity)
    except ValueError as e:
        # 없는 재난 종류가 입력된 경우 400 에러(Bad Request) 반환
        raise HTTPException(status_code=400, detail=str(e))
    
    # 결과를 서버 메모리(STATE)에 교체 저장
    STATE["event"], STATE["outages"] = event, outages
    return {"event": event, "outages": outages}

@app.post("/api/reset")
def reset():
    """현재 진행 중인 재난 상황을 초기화(삭제)하여 깨끗하게 비우는 창구"""
    STATE["event"], STATE["outages"] = None, []
    return {"ok": True}

@app.get("/api/outage-report")
def outage_report():
    """웹 화면이 현재 발생한 정전 현황을 정기적으로 읽어갈 때 사용하는 조회 창구"""
    return {"event": STATE["event"], "outages": STATE["outages"]}


@app.post("/api/outage-report")
def receive_outage_report(payload: dict = Body(...)):
    """
    [외부 데이터 접수 창구 (POST 방식)]
    한전 등 외부 관제 시스템에서 실제 정전 정보를 보낼 때 입구가 되는 창구입니다.
    outage_ingest.py의 build_report 함수를 사용해 오타나 잘못된 범위를 검증한 후 메모리에 보관합니다.
    """
    try:
        # outage_ingest.py를 통해 외부 데이터 검증 및 변환
        event, outages, warnings = build_report(payload, load_regions())
    except IngestError as e:
        # 형식이 틀리면 422 에러(Unprocessable Entity)와 에러 사유 목록을 리턴
        raise HTTPException(
            status_code=422, 
            detail={"message": "정전 정보 형식 오류로 접수하지 않았습니다.", "errors": e.errors}
        )
    
    # 동일한 event_id가 올 경우 화면 중복 갱신 방지 경고 추가
    if STATE["event"] and STATE["event"]["event_id"] == event["event_id"]:
        warnings.append("event_id 가 현재 재난과 같아 화면은 새로고침하지 않습니다. 새 정보로 갱신하려면 다른 event_id 를 쓰세요.")
    
    # 검증을 통과한 데이터로 메모리 교체
    STATE["event"], STATE["outages"] = event, outages
    return {"ok": True, "event_id": event["event_id"], "accepted": len(outages), "warnings": warnings}

@app.post("/api/priority")
def priority(req: PriorityRequest):
    """
    [우선순위 계산 창구 (POST 방식)]
    프론트엔드가 현재 정전 구역 목록과 선택한 시나리오(A/B/C)를 넘겨주면,
    priority_engine.py의 calculate_priority 함수를 실행해 1순위부터 정렬된 최종 리스트를 돌려줍니다.
    """
    return calculate_priority(req.outages, req.strategy, req.weights)