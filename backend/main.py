from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from data_generator import generate_disaster_scenario
from priority_engine import calculate_recovery_priority

app = FastAPI(title="E-EUM Disaster Recovery Backend")

# CORS 허용 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "E-EUM 백엔드 서버가 정상적으로 실행 중입니다."}

# 기본 재난 데이터 생성 API
@app.get("/api/disaster-data")
def get_disaster_data(disaster_type: str = "TYPHOON"):
    data = generate_disaster_scenario(disaster_type)
    return {
        "disaster_type": disaster_type,
        "count": len(data),
        "data": data
    }

# AI 복구 우선순위 추천 API (GET)
@app.get("/api/recommend-priority")
def get_recommend_priority(disaster_type: str = "TYPHOON", strategy: str = "BALANCED"):
    raw_data = generate_disaster_scenario(disaster_type)
    prioritized_data = calculate_recovery_priority(raw_data, strategy=strategy)
    return {
        "disaster_type": disaster_type,
        "strategy": strategy,
        "total_outage_count": len(prioritized_data),
        "recommendations": prioritized_data
    }

# 가중치 커스텀 요청 구조 정의
class PriorityRequest(BaseModel):
    disaster_type: str = "TYPHOON"
    strategy: str = "BALANCED"
    w_pop: float = 40.0
    w_fac: float = 30.0
    w_wx: float = 30.0

# AI 복구 우선순위 추천 API (POST)
@app.post("/api/recommend-priority-custom")
def get_custom_priority(req: PriorityRequest):
    raw_data = generate_disaster_scenario(req.disaster_type)
    prioritized_data = calculate_recovery_priority(raw_data, strategy=req.strategy)
    return {
        "disaster_type": req.disaster_type,
        "strategy": req.strategy,
        "recommendations": prioritized_data
    }