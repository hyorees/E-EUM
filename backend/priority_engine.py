# backend/priority_engine.py
"""정전 현황(outages) → 복구 우선순위.

점수(0~100) = 100 × Σ (가중치 × 정규화 값)
  pop : 정전 영향 인구            (최대 구역 대비)
  fac : 정전 영향 응급의료기관 수 (최대 구역 대비)
  vul : 정전 영향 65세 이상 인구  (최대 구역 대비)
  sev : 정전 비율                 (구역 내 정전 비중, 0~1)
"""

STRATEGIES = {
    "BALANCED":          {"label": "균형 복구",       "w": {"pop": 0.30, "fac": 0.25, "vul": 0.20, "sev": 0.25}},
    "POPULATION":        {"label": "인구 우선",       "w": {"pop": 0.55, "fac": 0.15, "vul": 0.15, "sev": 0.15}},
    "CRITICAL_FACILITY": {"label": "중요시설 우선",   "w": {"pop": 0.15, "fac": 0.50, "vul": 0.20, "sev": 0.15}},
    "RISK_FIRST":        {"label": "피해 규모 우선",  "w": {"pop": 0.15, "fac": 0.15, "vul": 0.20, "sev": 0.50}},
}
LABEL = {"pop": "영향 인구", "fac": "응급의료기관", "vul": "고령층(65세+)", "sev": "정전 비율"}


def _normalize(w):
    w = {k: max(0.0, float(w.get(k, 0))) for k in LABEL}
    s = sum(w.values())
    return {k: v / s for k, v in w.items()} if s > 0 else dict(STRATEGIES["BALANCED"]["w"])


def _man(n):
    return f"{n / 1e4:,.1f}만 명"


def _level(rank, n):
    pct = rank / n
    if rank == 1 or pct <= 0.10: return "critical"
    if pct <= 0.30: return "high"
    if pct <= 0.60: return "mid"
    return "low"


def calculate_priority(outages: list, strategy: str = "BALANCED", weights: dict | None = None):
    strategy = (strategy or "BALANCED").upper()
    if strategy not in STRATEGIES:
        strategy = "BALANCED"
    w = _normalize(weights) if weights else dict(STRATEGIES[strategy]["w"])
    if not outages:
        return {"strategy": strategy, "strategy_label": STRATEGIES[strategy]["label"], "weights": w, "items": [], "summary": {}}

    mx = {
        "pop": max(o["affected_population"] for o in outages) or 1,
        "fac": max(o["hospitals_affected"] for o in outages) or 1,
        "vul": max(o["vulnerable_affected"] for o in outages) or 1,
    }
    total_pop = sum(o["affected_population"] for o in outages) or 1

    scored = []
    for o in outages:
        norm = {
            "pop": o["affected_population"] / mx["pop"], "fac": o["hospitals_affected"] / mx["fac"],
            "vul": o["vulnerable_affected"] / mx["vul"], "sev": o["outage_ratio"],
        }
        parts = {k: round(100 * w[k] * norm[k], 1) for k in LABEL}
        it = dict(o)
        it["priority_score"] = round(sum(parts.values()), 1)
        it["score_parts"] = parts
        scored.append(it)

    scored.sort(key=lambda x: (-x["priority_score"], -x["affected_population"]))
    n = len(scored)
    for i, it in enumerate(scored):
        it["priority_rank"] = i + 1
        it["level"] = _level(i + 1, n)
        top = max(it["score_parts"], key=it["score_parts"].get)
        it["reason"] = (
            f"{it['region_name']}: 정전 비율 {it['outage_ratio']*100:.0f}%로 영향 인구 {_man(it['affected_population'])}"
            f"(전체의 {it['affected_population']/total_pop*100:.1f}%), 응급의료기관 {it['hospitals_affected']}곳, "
            f"65세 이상 {_man(it['vulnerable_affected'])}이 영향을 받습니다. "
            f"점수 {it['priority_score']}점 중 '{LABEL[top]}' 기여가 {it['score_parts'][top]}점으로 가장 큽니다."
        )

    first = scored[0]
    top10 = sum(x["affected_population"] for x in scored[:10])
    summary = {
        "headline": f"{first['region_name']}부터 복구를 권고합니다 ({STRATEGIES[strategy]['label']} 기준)",
        "top_region": first["region_name"],
        "total_affected_population": total_pop,
        "top10_share": round(top10 / total_pop * 100, 1),
        "zones": n,
    }
    return {"strategy": strategy, "strategy_label": STRATEGIES[strategy]["label"], "weights": w, "items": scored, "summary": summary}