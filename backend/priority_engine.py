def calculate_recovery_priority(data_list, strategy: str = "BALANCED"):
    """
    정전 발생 지역에 대해 복합 리스크 우선순위 점수를 계산하고 정렬합니다.
    strategy 옵션:
      - BALANCED: 종합 균형 모드 (기본)
      - CRITICAL_FACILITY: 중요시설(의료기관/대피소) 최우선 모드
      - POPULATION: 피해 인구 최우선 모드
    """
    processed_list = []

    # 1. 가중치 설정
    if strategy == "CRITICAL_FACILITY":
        w_pop, w_hosp, w_shelter, w_risk = 0.2, 0.45, 0.2, 0.15
    elif strategy == "POPULATION":
        w_pop, w_hosp, w_shelter, w_risk = 0.5, 0.2, 0.15, 0.15
    else:  # BALANCED (종합 균형)
        w_pop, w_hosp, w_shelter, w_risk = 0.3, 0.3, 0.2, 0.2

    # 정전이 발생한 지역만 추출
    outage_regions = [d for d in data_list if d.get("is_outage", False)]

    if not outage_regions:
        return []

    # 정규화를 위한 최대값 산출
    max_affected_pop = max([d["population"] * d["outage_ratio"] for d in outage_regions] or [1])
    max_hosp = max([d["hospitals"] for d in outage_regions] or [1])
    max_shelter = max([d["shelters"] for d in outage_regions] or [1])
    max_risk = max([d["risk_score"] for d in outage_regions] or [1])

    for item in outage_regions:
        affected_pop = item["population"] * item["outage_ratio"]

        # 0~100점 표준화 점수 계산
        score_pop = (affected_pop / max_affected_pop) * 100 if max_affected_pop > 0 else 0
        score_hosp = (item["hospitals"] / max_hosp) * 100 if max_hosp > 0 else 0
        score_shelter = (item["shelters"] / max_shelter) * 100 if max_shelter > 0 else 0
        score_risk = (item["risk_score"] / max_risk) * 100 if max_risk > 0 else 0

        # 최종 복구 우선순위 점수 계산
        priority_score = round(
            (score_pop * w_pop) + (score_hosp * w_hosp) + (score_shelter * w_shelter) + (score_risk * w_risk), 1
        )

        item_copy = item.copy()
        item_copy["affected_population"] = int(affected_pop)
        item_copy["priority_score"] = priority_score
        processed_list.append(item_copy)

    # 우선순위 점수 기준 내림차순 정렬
    processed_list.sort(key=lambda x: x["priority_score"], reverse=True)

    # 순위(Rank) 부여
    for rank, item in enumerate(processed_list, start=1):
        item["priority_rank"] = rank

    return processed_list