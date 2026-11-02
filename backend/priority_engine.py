# backend/priority_engine.py
"""정전 현황(outages) → 복구 우선순위 계산 엔진

[점수 산출 공식]
최종 점수(0~100점) = 100 × Σ (지표별 가중치 × 지표별 정규화 값)
  - pop : 정전 영향 인구            (전체 구역 중 최다 인구 대비 비율)
  - fac : 정전 영향 응급의료기관 수 (전체 구역 중 최다 병원 대비 비율)
  - vul : 정전 영향 65~74세 인구    (전체 구역 중 최다 고령층 대비 비율)
  - sev : 정전 비율                 (구역 내 정전 비중, 0.0 ~ 1.0)
  - dur : 예상 복구 소요시간         (구간 정규화)
"""

# 1. 복구 시나리오(A/B/C)별 가중치 설정 사전 (Dictionary)
# 각 지표 가중치의 합은 1.0(100%)이 되도록 설정됩니다.
STRATEGIES = {
    # A 시나리오: 인구, 병원, 고령층, 정전비율을 균형 있게 고려
    "MIN_DAMAGE": {
        "label": "A. 사회적 피해 최소화", 
        "w": {"pop": 0.30, "fac": 0.25, "vul": 0.20, "sev": 0.25, "dur": 0.00}
    },
    # B 시나리오: 응급의료기관(fac)에 50%의 가중치를 집중 배치
    "CRITICAL_FACILITY": {
        "label": "B. 중요시설 우선",      
        "w": {"pop": 0.15, "fac": 0.50, "vul": 0.20, "sev": 0.15, "dur": 0.00}
    },
    # C 시나리오: 복구 소요시간(dur)에 100% 가중치를 몰아줌 (시간 전용 정렬)
    "EFFICIENCY": {
        "label": "C. 네트워크 효율 우선", 
        "w": {"pop": 0.00, "fac": 0.00, "vul": 0.00, "sev": 0.00, "dur": 1.00}
    },
}

# 기본적으로 적용할 시나리오 이름
DEFAULT_STRATEGY = "MIN_DAMAGE"

# 지표 키값을 화면에 표시할 한글 명칭 매핑 표
LABEL = {
    "pop": "영향 인구", 
    "fac": "응급의료기관", 
    "vul": "고령층(65~74세)", 
    "sev": "정전 비율", 
    "dur": "복구 소요시간"
}


def _normalize(w):
    """
    [가중치 정규화 보조 함수]
    사용자가 전달한 가중치(w)의 총합이 1.0(100%)이 되도록 비율을 맞춰줍니다.
    예: pop:2, fac:2 -> 전체합이 4이므로 pop:0.5, fac:0.5로 변환
    """
    # 음수값이 들어오지 못하도록 max(0.0, 값) 처리
    w = {k: max(0.0, float(w.get(k, 0))) for k in LABEL}
    s = sum(w.values()) # 모든 가중치의 총합
    
    # 합이 0보다 크면 각 가중치를 총합(s)으로 나누어 비율 산출, 합이 0이면 기본 가중치 적용
    return {k: v / s for k, v in w.items()} if s > 0 else dict(STRATEGIES[DEFAULT_STRATEGY]["w"])


def _man(n):
    """
    [숫자 단위 변환 보조 함수]
    숫자를 '만 명' 단위 텍스트로 보기 쉽게 변환합니다. (예: 15000 -> "1.5만 명")
    """
    return f"{n / 1e4:,.1f}만 명"


def _level(rank, n):
    """
    [심각도 등급 부여 보조 함수]
    순위(rank)와 전체 구역 수(n)의 비율을 계산하여 4단계 등급 텍스트를 부여합니다.
    - 1위이거나 상위 10% 이내: critical (심각)
    - 상위 30% 이내: high (높음)
    - 상위 60% 이내: mid (중간)
    - 나머지: low (낮음)
    """
    pct = rank / n
    if rank == 1 or pct <= 0.10: return "critical"
    if pct <= 0.30: return "high"
    if pct <= 0.60: return "mid"
    return "low"


def calculate_priority(outages: list, strategy: str = DEFAULT_STRATEGY, weights: dict | None = None):
    """
    [우선순위 산출 메인 함수]
    - outages: 정전 구역 데이터 목록 (리스트)
    - strategy: 선택한 시나리오 이름 ("MIN_DAMAGE", "CRITICAL_FACILITY", "EFFICIENCY")
    - weights: 커스텀 가중치 딕셔너리 (전달되지 않으면 시나리오 기본값 사용)
    """
    
    # 1. 시나리오 검증 및 가중치 확정
    strategy = (strategy or DEFAULT_STRATEGY).upper()
    if strategy not in STRATEGIES:
        strategy = DEFAULT_STRATEGY
        
    # 사용자 정의 가중치가 있으면 정규화해서 쓰고, 없으면 선택된 시나리오 기본 가중치 사용
    w = _normalize(weights) if weights else dict(STRATEGIES[strategy]["w"])
    
    # 정전 구역 목록이 비어 있으면 계산 없이 빈 결과 구조를 즉시 반환
    if not outages:
        return {
            "strategy": strategy, 
            "strategy_label": STRATEGIES[strategy]["label"], 
            "weights": w, 
            "items": [], 
            "summary": {}
        }

    # 2. 정규화(0.0~1.0 변환) 기준이 될 전체 구역의 최댓값(mx)과 최솟값(mn) 구하기
    # (0으로 나누는 에러를 방지하기 위해 `or 1` 안전장치 포함)
    mx = {
        "pop": max(o["affected_population"] for o in outages) or 1,  # 정전 피해 인구 최댓값
        "fac": max(o["hospitals_affected"] for o in outages) or 1,    # 피해 병원 수 최댓값
        "vul": max(o["vulnerable_affected"] for o in outages) or 1,   # 피해 고령층 수 최댓값
        "dur": max(float(o.get("est_hours", 0) or 0) for o in outages) or 1, # 복구시간 최댓값
    }
    mn = {
        "dur": min(float(o.get("est_hours", 0) or 0) for o in outages) if outages else 0, # 복구시간 최솟값
    }
    
    # 전체 정전 피해 인구 합계
    total_pop = sum(o["affected_population"] for o in outages) or 1

    # 3. 구역별 점수 계산
    scored = []
    for o in outages:
        est = float(o.get("est_hours", 0) or 0)  # 해당 구역의 복구시간
        dur_span = (mx["dur"] - mn["dur"]) or 1   # 복구시간의 전체 편차 범위(최댓값 - 최솟값)
        
        # [0.0 ~ 1.0 정규화 연산]
        norm = {
            "pop": o["affected_population"] / mx["pop"], # 피해인구 / 최다피해인구
            "fac": o["hospitals_affected"] / mx["fac"],   # 피해병원 / 최다피해병원
            "vul": o["vulnerable_affected"] / mx["vul"],  # 피해고령층 / 최다고령층
            "sev": o["outage_ratio"],                     # 정전 비율 (이미 0~1 값)
            
            # [복구시간 정규화] (mx - est) / dur_span 공식 적용
            # est(복구시간)가 짧을수록 점수가 1.0(만점)에 가깝게 계산됩니다.
            "dur": (mx["dur"] - est) / dur_span if dur_span > 0 else 1.0,
        }
        
        # 각 지표별 획득 점수 산출 = 100점 × 가중치(w) × 정규화값(norm)
        parts = {k: round(100 * w[k] * norm[k], 1) for k in LABEL}
        
        # 원본 구역 정보 딕셔너리를 복사한 뒤 점수 데이터 추가
        it = dict(o)
        it["priority_score"] = round(sum(parts.values()), 1) # 지표별 점수의 총합 (최종 우선순위 점수)
        it["score_parts"] = parts                            # 세부 항목별 점수 내역
        scored.append(it)

    # 4. 내림차순 순위 정렬
    # 1차 기준: priority_score 점수가 높은 순 (- 붙이면 내림차순)
    # 2차 기준: 점수가 동점일 경우 피해 인구(affected_population)가 많은 순
    scored.sort(key=lambda x: (-x["priority_score"], -x["affected_population"]))
    
    n = len(scored) # 전체 정전 구역 수
    
    # 5. 순위(rank), 심각도(level), 사유 문구(reason) 생성
    for i, it in enumerate(scored):
        it["priority_rank"] = i + 1            # 순위 지정 (1부터 시작)
        it["level"] = _level(i + 1, n)          # 등급 지정 (critical/high/mid/low)
        
        # 가장 높은 점수를 획득한 지표 항목 찾기
        top = max(it["score_parts"], key=it["score_parts"].get)
        
        # 심사위원 및 관제자 표시용 자동 생성 문장
        it["reason"] = (
            f"{it['region_name']}: 정전 비율 {it['outage_ratio']*100:.0f}%로 영향 인구 {_man(it['affected_population'])}"
            f"(전체의 {it['affected_population']/total_pop*100:.1f}%), 응급의료기관 {it['hospitals_affected']}곳, "
            f"65~74세 {_man(it['vulnerable_affected'])}이 영향을 받습니다. "
            f"점수 {it['priority_score']}점 중 '{LABEL[top]}' 기여가 {it['score_parts'][top]}점으로 가장 큽니다."
        )

    # 6. 상위 구역 분석 및 요약 데이터(summary) 작성
    first = scored[0] # 1위 구역
    top10 = sum(x["affected_population"] for x in scored[:10]) # 상위 10개 구역의 피해 인구 합계
    
    summary = {
        "headline": f"{first['region_name']}부터 복구를 권고합니다 ({STRATEGIES[strategy]['label']} 기준)",
        "top_region": first["region_name"],
        "total_affected_population": total_pop,
        "top10_share": round(top10 / total_pop * 100, 1), # 상위 10개 구역이 전체 인구에서 차지하는 비중(%)
        "zones": n,
        "strategy_weights": w,
    }
    
    # 7. 최종 결과 반환
    return {
        "strategy": strategy, 
        "strategy_label": STRATEGIES[strategy]["label"], 
        "weights": w, 
        "items": scored, 
        "summary": summary
    }