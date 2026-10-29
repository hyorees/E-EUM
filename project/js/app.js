const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const API = "http://127.0.0.1:8000";
const POLL_MS = 3000;

const LEVEL_COLOR = { critical: "#e11d48", high: "#f97316", mid: "#0284c7", low: "#16a34a" };
const LEVEL_TXT = { critical: "긴급", high: "높음", mid: "보통", low: "낮음" };
const SC_NAME = { A: "A. 사회적 피해 최소화", B: "B. 중요시설 우선", C: "C. 네트워크 효율 우선" };
const SC_RULE = {
  A: "종합 우선순위 점수(인구·병원·고령층·정전비율 균형)가 높은 구역부터 복구합니다.",
  B: "응급의료기관 가중치(50%)를 크게 둔 점수가 높은 구역부터 복구합니다.",
  C: "복구 소요시간 가중치(55%)를 크게 둔 점수가 높은 구역, 즉 빨리 끝나는 구역부터 복구합니다."
};
const SC_COLOR = { A: "#e11d48", B: "#f97316", C: "#0284c7" };
const CREWS = 10;                       // 복구반 수 (고정)
const SEV_TXT = { "0.7": "약", "1": "보통", "1.3": "강" };
const DEFAULT_STRATEGY_WEIGHTS = {
  A: { pop: 0.30, fac: 0.25, vul: 0.20, sev: 0.25, dur: 0.00 },
  B: { pop: 0.15, fac: 0.50, vul: 0.20, sev: 0.15, dur: 0.00 },
  C: { pop: 0.00, fac: 0.00, vul: 0.00, sev: 0.00, dur: 1.00 }
};

const S = {
  eventId: null, event: null, outages: [], rows: [],
  phase: "idle",              // idle → received → analyzing → done (| error)
  analyzed: false, summary: null,
  facSort: "rank", facOnly: true,
  careSort: "rank", careOnly: true,
  sel: null, crews: CREWS, sc: "A", reqSeq: 0, metaLoaded: false,
  strategyMeta: { ...DEFAULT_STRATEGY_WEIGHTS }
};
let SC = {}, REC = "A", map = null, layer = null, geoLayer = null, polling = false;

/* ── 유틸 ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const man = n => (n / 1e4).toLocaleString("ko", { maximumFractionDigits: 1 }) + "만 명";
const setText = (s, v) => { const e = $(s); if (e) e.textContent = v; };
const setHTML = (s, v) => { const e = $(s); if (e) e.innerHTML = v; };
const ratioLevel = r => r >= 0.7 ? "critical" : r >= 0.45 ? "high" : r >= 0.2 ? "mid" : "low";
const SCORE_FACTORS = ["pop", "fac", "vul", "sev", "dur"];
const SCORE_LABEL = {
  pop: "영향 인구", fac: "응급의료기관", vul: "고령층(65~74세)", sev: "정전 비율", dur: "복구 소요시간"
};
const scenarioWeights = key => S.strategyMeta[key] || DEFAULT_STRATEGY_WEIGHTS[key];
const scenarioDescription = key => {
  const weights = scenarioWeights(key);
  const weightText = SCORE_FACTORS
    .map(name => `${SCORE_LABEL[name]} ${(Number(weights[name] || 0) * 100).toFixed(1).replace(/\.0$/, "")}%`)
    .join(" · ");
  return `${SC_RULE[key]} 현재 가중치: ${weightText}. 막대 색상은 항목별 점수 기여도입니다.`;
};

function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const e = new Error(path + " → " + res.status); e.status = res.status; throw e; }
  return res.json();
}

/* ── 데이터 변환 ── */
function fromOutage(o) {
  return {
    id: o.region_id, region: o.region_name, sido: o.sido, type: o.type, lat: o.lat, lng: o.lng,
    pop: o.affected_population, totPop: o.population, vul: o.vulnerable_affected,
    ratio: o.outage_ratio, pct: Math.round(o.outage_ratio * 100),
    hosp: o.hospitals_affected, totHosp: o.hospitals, dur: o.est_hours, hazard: o.hazard_text, cause: o.outage_cause || "",
    score: null, rank: null, level: ratioLevel(o.outage_ratio), parts: null, reason: ""
  };
}
function fromItem(it) {
  const r = fromOutage(it);
  r.score = it.priority_score; r.rank = it.priority_rank; r.level = it.level;
  r.parts = it.score_parts; r.reason = it.reason;
  r.baseScore = r.score; r.baseParts = r.parts; r.baseReason = r.reason;
  return r;
}

/* ── 백엔드 수신 ── */
function setConn(ok, msg) {
  $("#liveStat").classList.toggle("off", !ok);
  setText("#liveText", msg || (ok ? "실시간 수신 중" : "백엔드 연결 안 됨"));
}

async function loadMeta() {
  const d = await api("/api/disasters");
  const strategyMap = {};
  (d.strategies || []).forEach(s => {
    strategyMap[s.type] = { ...DEFAULT_STRATEGY_WEIGHTS[s.type], ...(s.weights || {}) };
  });
  S.strategyMeta = { ...DEFAULT_STRATEGY_WEIGHTS, ...strategyMap };
  setHTML("#simType", d.disasters.map(x => `<option value="${x.type}">${x.name}</option>`).join(""));
  renderStrategyBtns();
  S.metaLoaded = true;
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const d = await api("/api/outage-report");
    if (!S.metaLoaded) await loadMeta();
    setConn(true);
    if (d.event) { if (d.event.event_id !== S.eventId) await onNewEvent(d); }
    else if (S.eventId) clearEvent();
  } catch (e) {
    if (e.status === 404) setConn(false, "백엔드가 구버전입니다 (main.py 교체 후 uvicorn 재시작)");
    else setConn(false);
    console.warn("poll 실패:", e);
  } finally { polling = false; }
}

async function onNewEvent(d) {
  S.eventId = d.event.event_id; S.event = d.event; S.outages = d.outages;
  S.rows = d.outages.map(fromOutage).sort((a, b) => b.pop - a.pop);
  S.analyzed = false; S.summary = null; S.sc = "A"; SC = {};
  S.sel = S.rows.length ? S.rows[0].id : null;
  S.phase = "received";
  renderStrategyBtns();
  renderAll(true);
  toast(`[${d.event.type_name}] 정전 정보 수신: ${d.outages.length}개 시·군·구`);
  await runAnalysis();
}

function clearEvent() {
  S.eventId = null; S.event = null; S.outages = []; S.rows = []; S.summary = null;
  S.analyzed = false; S.phase = "idle"; S.sel = null; S.sc = "A"; SC = {}; S.reqSeq++;
  renderStrategyBtns();
  renderAll(true);
}

async function runAnalysis() {
  if (!S.outages.length) return;
  const seq = ++S.reqSeq;
  S.phase = "analyzing"; renderFlow(); renderBanner();
  await sleep(700);
  try {
    const body = { outages: S.outages, strategy: "MIN_DAMAGE" };
    const res = await api("/api/priority", { method: "POST", body: JSON.stringify(body) });
    if (seq !== S.reqSeq) return;
    S.rows = res.items.map(fromItem); S.summary = res.summary;
    S.analyzed = true; S.phase = "done";
    SC = scenarios(S.rows);
    applyScenarioPriority();
    if (!S.rows.find(r => r.id === S.sel)) S.sel = S.rows[0] ? S.rows[0].id : null;
    renderAll(false);
    toast(`우선순위 분석 완료 (${SC_NAME[S.sc]})`);
  } catch (e) {
    if (seq !== S.reqSeq) return;
    S.phase = "error"; renderFlow(); renderBanner();
    toast("우선순위 분석 실패: 백엔드를 확인하세요");
  }
}

/* ── 복구 시나리오 계산 ── */
function metrics(order, K) {
  const free = Array(K).fill(0), sc = {};
  let D = 0, F = 0, Mk = 0;
  for (const r of order) {
    let c = 0;
    for (let j = 1; j < K; j++) if (free[j] < free[c]) c = j;
    const s = free[c]; free[c] = s + r.dur;
    D += (r.pop / 1e4) * free[c]; F += r.hosp * free[c]; Mk = Math.max(Mk, free[c]);
    sc[r.id] = { s, f: free[c], c };
  }
  return { D, F, M: Mk, sc };
}

// 시나리오 간 비교 점수 가중치 (인구 평균 정전시간 / 병원 평균 복구시간 / 전체 완료시간)
const SCENARIO_W = { A: { p: .5, h: .3, m: .2 }, B: { p: .2, h: .6, m: .2 }, C: { p: .2, h: .2, m: .6 } };
// 상대 점수 = 100 × (세 시나리오 중 가장 짧은 값 ÷ 내 값). 가장 좋은 안 = 100점, 나머지는 실제 격차만큼만 감점.
// 예) 전체 완료시간이 최선 115.6h, 내 값 121.0h → 100 × 115.6 / 121.0 = 95.5점
const relScore = (v, best) => (v <= 0 || best <= 0) ? 100 : Math.min(100, 100 * best / v);

function scenarioComparison(out) {
  const keys = ["A", "B", "C"];
  const best = f => Math.min(...keys.map(k => out[k][f]));
  const bestP = best("avgP"), bestH = best("avgH"), bestM = best("makespan");
  keys.forEach(k => {
    const w = SCENARIO_W[k], s = out[k];
    s.w = w;
    s.pScore = relScore(s.avgP, bestP);
    s.hScore = relScore(s.avgH, bestH);
    s.mScore = relScore(s.makespan, bestM);
    s.raw = s.pScore * w.p + s.hScore * w.h + s.mScore * w.m;
    s.score = Math.min(100, Math.max(0, s.raw));
  });
}

function scenarios(rows) {
  if (!rows || !rows.length) return {};
  const K = S.crews;
  const totP = rows.reduce((s, r) => s + r.pop / 1e4, 0) || 1;
  const totH = rows.reduce((s, r) => s + r.hosp, 0) || 1;
  const maxHosp = Math.max(...rows.map(r => r.hosp), 0);
  const maxPop = Math.max(...rows.map(r => r.pop), 1);
  const maxVul = Math.max(...rows.map(r => r.vul), 1);
  const minDur = Math.min(...rows.map(r => r.dur));
  const maxDur = Math.max(...rows.map(r => r.dur), minDur);
  const durSpan = maxDur - minDur || 1;
  const r1 = v => Math.round(v * 10) / 10;
  const out = {};
  for (const k of ["A", "B", "C"]) {
    const w = scenarioWeights(k), scores = {}, parts = {};
    for (const r of rows) {
      parts[r.id] = {
        pop: r1(100 * w.pop * r.pop / maxPop),
        fac: r1(100 * w.fac * (maxHosp ? r.hosp / maxHosp : 0)),
        vul: r1(100 * w.vul * r.vul / maxVul),
        sev: r1(100 * w.sev * r.ratio),
        dur: r1(100 * w.dur * (maxDur - r.dur) / durSpan)
      };
      scores[r.id] = r1(SCORE_FACTORS.reduce((sum, f) => sum + parts[r.id][f], 0));
      // A안은 백엔드(priority_engine.py)가 계산한 점수를 그대로 사용 → 서버 순위와 항상 일치
      if (k === "A" && r.baseScore != null) { scores[r.id] = r.baseScore; parts[r.id] = r.baseParts; }
    }
    // 복구 순서 = 시나리오 점수 내림차순 (동점이면 영향 인구 많은 곳, 그다음 복구시간 짧은 곳)
    const order = [...rows].sort((a, b) => scores[b.id] - scores[a.id] || b.pop - a.pop || a.dur - b.dur);
    const m = metrics(order, K);
    out[k] = { k, order, scores, parts, sc: m.sc, makespan: m.M, avgP: m.D / totP, avgH: m.F / totH };
  }
  scenarioComparison(out);
  out.totP = totP;
  return out;
}

function levelForRank(rank, count) {
  const pct = rank / count;
  if (rank === 1 || pct <= 0.1) return "critical";
  if (pct <= 0.3) return "high";
  if (pct <= 0.6) return "mid";
  return "low";
}

function applyScenarioPriority() {
  const scenario = SC[S.sc];
  if (!scenario) return;
  const count = scenario.order.length;
  scenario.order.forEach((r, index) => {
    r.rank = index + 1;
    r.score = scenario.scores[r.id];
    r.level = levelForRank(r.rank, count);
    if (S.sc === "A") {
      r.parts = r.baseParts;
      r.reason = r.baseReason;
    } else if (S.sc === "B") {
      r.parts = scenario.parts[r.id];
      r.reason = `${r.region}: 응급의료기관 ${r.hosp}곳이 영향을 받아 중요시설 우선 시나리오의 ${r.rank}순위로 배정됩니다.`;
    } else if (S.sc === "C") {
      r.parts = scenario.parts[r.id];
      r.reason = `${r.region}: 예상 복구시간 ${r.dur.toFixed(1)}시간으로 효율 우선 시나리오의 ${r.rank}순위로 배정됩니다.`;
    }
  });
}

/* ── 렌더링 ── */
function renderFlow() {
  const st = { idle: [1, 0, 0], received: [2, 1, 0], analyzing: [2, 1, 0], error: [2, 1, 0], done: [2, 2, 1] }[S.phase];
  const cls = [
    st[0] === 2 ? "done" : "active",
    st[1] === 2 ? "done" : st[1] === 1 ? "active" : "",
    st[2] === 2 ? "done" : st[2] === 1 ? "active" : ""
  ];
  $$("#flowSteps li").forEach((li, i) => {
    li.className = cls[i] + (S.phase === "analyzing" && i === 1 ? " busy" : "");
  });
  setText("#flowSteps li:nth-child(1) span", S.phase === "idle" ? "재난 발생 · 정전 정보 수신 (대기 중)" : "재난 발생 · 정전 정보 수신");
  setText("#flowSteps li:nth-child(2) span", S.phase === "analyzing" ? "복구 우선순위 분석 중…" : "복구 우선순위 분석");
}

function renderBanner() {
  const box = $("#alertBox"), e = S.event;
  box.classList.toggle("idle", !e);
  if (!e) {
    setText("#alertTitle", "수신된 재난 정보 없음");
    setText("#alertSub", "백엔드에서 재난이 발생하면 정전 정보가 자동으로 들어옵니다. (우측 상단 '재난 발생 ▶' 또는 백엔드 /docs 의 POST /api/simulate)");
    setText("#aZones", "-"); setText("#aFac", "-"); setText("#aPop", "-");
    return;
  }
  const sm = e.summary;
  const phase = S.phase === "analyzing" ? "우선순위 분석 중…" : S.phase === "error" ? "분석 실패" : S.analyzed ? `복구 기준: ${SC_NAME[S.sc]}` : "분석 대기";
  setText("#alertTitle", `[${e.type_name}] 정전 정보 수신 · ${e.occurred_at}`);
  setText("#alertSub", `${e.desc}${e.severity == null ? "" : ` · 강도 ${SEV_TXT[String(e.severity)] || e.severity}`} · ${phase}`);
  setText("#aZones", sm.outage_zones);
  setText("#aFac", sm.hospitals_affected);
  setText("#aPop", man(sm.affected_population).replace(" 명", ""));
}

function renderAI() {
  const box = $("#aiSummary");
  if (!S.analyzed || !S.summary || !S.rows.length) { box.classList.add("hidden"); return; }
  const order = SC[S.sc].order;
  const top3 = order.slice(0, 3).map(r => `${r.rank}순위 ${r.region}`).join(" → ");
  const totalPop = order.reduce((sum, r) => sum + r.pop, 0) || 1;
  const top10Share = order.slice(0, 10).reduce((sum, r) => sum + r.pop, 0) / totalPop * 100;
  box.classList.remove("hidden");
  box.innerHTML = `<b>${SC_NAME[S.sc]} 복구 순서</b> · ${order[0].region}부터 배정합니다.<br>${top3}. 상위 10개 시·군·구가 전체 영향 인구의 <b>${top10Share.toFixed(1)}%</b>를 차지합니다.
    <br><small>※ 아래 순서는 복구 시나리오의 구역 배정 순서와 같습니다. 최종 결정은 관리자 확인 후 수행됩니다.</small>`;
}

function renderKpis() {
  const R = S.rows;
  if (!R.length) { ["#k1", "#k2", "#k3", "#k4"].forEach(s => setText(s, "-")); ["#k1s", "#k2s", "#k3s", "#k4s"].forEach(s => setText(s, "")); return; }
  const pop = R.reduce((s, r) => s + r.pop, 0);
  const urgent = R.filter(r => r.level === "critical" || r.level === "high").length;
  const hosp = R.reduce((s, r) => s + r.hosp, 0), totH = R.reduce((s, r) => s + r.totHosp, 0);
  const avg = R.reduce((s, r) => s + r.dur, 0) / R.length, mx = Math.max(...R.map(r => r.dur));
  setText("#k1", pop.toLocaleString()); setText("#k1s", `정전 ${R.length}개 시·군·구`);
  setText("#k2", urgent); setText("#k2s", S.analyzed ? "우선순위 분석 기준" : "분석 전 (정전 비율 기준)");
  setText("#k3", hosp.toLocaleString()); setText("#k3s", `해당 구역 전체 ${totH}곳 중`);
  setText("#k4", avg.toFixed(1)); setText("#k4s", `최장 ${mx.toFixed(1)}시간`);
}

function renderMap(fit) {
  if (!map) return;
  layer.clearLayers(); geoLayer.clearLayers();
  setText("#mapTitle", S.analyzed ? "전국 정전 피해 및 복구 우선순위 지도" : "전국 정전 현황 지도");
  const g = S.event && S.event.geo;
  if (g && g.kind === "path") L.polyline(g.points, { color: "#7c3aed", weight: 3, dashArray: "8 6", opacity: .8 }).addTo(geoLayer).bindTooltip("태풍 예상 경로");
  if (g && g.kind === "point") {
    L.circle([g.lat, g.lng], { radius: g.radius_km * 1000, color: "#7c3aed", weight: 2, dashArray: "6 5", fillOpacity: .06 }).addTo(geoLayer);
    L.circleMarker([g.lat, g.lng], { radius: 5, color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 1 }).addTo(geoLayer).bindTooltip(S.event.type_name + " 중심");
  }
  if (!S.rows.length) return;
  const maxPop = Math.max(...S.rows.map(r => r.pop), 1);
  [...S.rows].sort((a, b) => b.pop - a.pop).forEach(r => {
    const c = LEVEL_COLOR[r.level], isSel = r.id === S.sel;
    const m = L.circleMarker([r.lat, r.lng], {
      color: isSel ? "#0f172a" : c, weight: isSel ? 3 : 1, fillColor: c, fillOpacity: .75,
      radius: 5 + 15 * Math.sqrt(r.pop / maxPop)
    }).addTo(layer);
    m.bindTooltip(`<b>${S.analyzed ? `[${r.rank}위] ` : ""}${r.region}</b><br>정전 ${r.pct}% · ${man(r.pop)}`);
    m.on("click", () => selectOutage(r.id));
  });
  if (fit) {
    const b = L.latLngBounds(S.rows.map(r => [r.lat, r.lng]));
    if (b.isValid()) map.fitBounds(b.pad(0.15));
  }
}

function renderPriority() {
  setText("#priorityHeading", `${SC_NAME[S.sc]} · TOP 5`);
  $$("#priorityScenarioBtns button").forEach(b => b.classList.toggle("active", b.dataset.sc === S.sc));
  if (!S.analyzed) {
    const msg = !S.rows.length ? "재난이 발생하면 정전 정보 수신 후 우선순위를 자동으로 분석합니다."
      : S.phase === "error" ? "분석에 실패했습니다. 백엔드를 확인하세요." : "정전 정보를 수신했습니다. 우선순위를 분석하는 중…";
    setHTML("#priorityList", `<div class="empty-msg">${msg}</div>`);
    return;
  }
  const scenario = SC[S.sc];
  setHTML("#priorityList", scenario.order.slice(0, 5).map(r => `
    <button class="priority-item ${S.sel === r.id ? "selected" : ""}" onclick="selectOutage('${r.id}')">
      <span class="rank">${r.rank}</span>
      <span class="priority-main"><b>${r.region}</b><small>정전 ${r.pct}% · ${r.hosp}개 시설 · ${man(r.pop)}</small></span>
      <span class="mini-bar"><i style="width:${r.score}%;background:${LEVEL_COLOR[r.level]}"></i></span>
      <strong style="color:${LEVEL_COLOR[r.level]}">${Math.round(r.score)}</strong>
    </button>`).join(""));
}

function renderSelected() {
  const r = S.rows.find(x => x.id === S.sel);
  if (!r) {
    ["#selectedTitle", "#selectedRank", "#selectedScore", "#selectedPeople", "#selectedFacilities", "#selectedTime", "#selectedPct"].forEach(s => setText(s, "-"));
    setText("#selectedScoreLbl", "우선순위 점수"); setText("#selectedReason", "선택된 구역이 없습니다."); setText("#selectedCause", "-");
    return;
  }
  setText("#selectedTitle", r.region);
  setText("#selectedRank", S.analyzed ? `${r.rank}순위` : "분석 대기");
  setText("#selectedScore", S.analyzed ? Math.round(r.score) : r.pct + "%");
  setText("#selectedScoreLbl", "우선순위 점수");
  setText("#selectedPeople", man(r.pop));
  setText("#selectedFacilities", `${r.hosp}개소 (전체 ${r.totHosp})`);
  setText("#selectedTime", r.dur.toFixed(1) + "시간");
  setText("#selectedPct", r.pct + "%");
  setText("#selectedCause", r.cause);
  setText("#selectedReason", S.analyzed ? r.reason : `${r.hazard} 로 정전 발생. 우선순위 분석 결과를 기다리는 중입니다.`);
  const el = $("#selectedScore"); if (el) el.style.color = LEVEL_COLOR[r.level];
}

function stackBar(r) {
  if (!r.parts) return "";
  const total = SCORE_FACTORS.reduce((sum, factor) => sum + (r.parts[factor] || 0), 0);
  const scale = total > 0 ? r.score / total : 1;
  return `<div class="stackbar" title="${scenarioDescription(S.sc)}">` +
    SCORE_FACTORS.map(k => `<i class="sb-${k}" style="width:${(r.parts[k] || 0) * scale}%"></i>`).join("") + `</div>`;
}

function renderTables() {
  const R = S.rows, by = [...R].sort((a, b) => b.pop - a.pop);
  const cls = r => r.id === S.sel ? "sel" : "";
  const empty = n => `<tr><td colspan="${n}" class="empty-msg">수신된 정전 정보가 없습니다.</td></tr>`;

  // 피해 영향 분석
  const sido = {};
  R.forEach(r => { const a = sido[r.sido] = sido[r.sido] || { n: 0, pop: 0, vul: 0, hosp: 0, ratio: 0 }; a.n++; a.pop += r.pop; a.vul += r.vul; a.hosp += r.hosp; a.ratio += r.ratio; });
  setHTML("#sidoTable", Object.entries(sido).sort((a, b) => b[1].pop - a[1].pop).map(([k, a]) =>
    `<tr style="cursor:default"><td><b>${k}</b></td><td>${a.n}곳</td><td>${man(a.pop)}</td><td>${man(a.vul)}</td><td>${a.hosp}개소</td><td>${Math.round(a.ratio / a.n * 100)}%</td></tr>`).join("") || empty(6));
  setHTML("#impactTable", by.map(r => `
    <tr class="${cls(r)}" onclick="pickFromTable('${r.id}')"><td><b>${r.region}</b></td><td>${r.pct}%</td><td>${man(r.pop)}</td><td>${man(r.vul)}</td>
    <td>${r.hosp} / ${r.totHosp}</td><td>${r.dur.toFixed(1)}h</td><td class="why">${r.cause}</td></tr>`).join("") || empty(7));

  // 복구 우선순위
  const list = S.analyzed ? SC[S.sc].order : by;
  setHTML("#rankTable", list.map(r => `
    <tr class="${cls(r)}" onclick="pickFromTable('${r.id}')">
      <td>${S.analyzed ? r.rank : "-"}</td><td><b>${r.region}</b></td>
      <td>${S.analyzed ? `<span class="lvl ${r.level}">${LEVEL_TXT[r.level]}</span>` : "-"}</td>
      <td><b>${S.analyzed ? r.score.toFixed(1) : "-"}</b></td><td>${stackBar(r)}</td>
      <td>${man(r.pop)}<br><small>정전 ${r.pct}%</small></td><td>${r.hosp}개소</td><td>${r.dur.toFixed(1)}h</td>
      <td class="why">${r.reason || "분석 대기 중"}</td></tr>`).join("") || empty(9));

  renderFacilities();
  renderCareCenters();
}

/* ── 시설 상세: hospitals.csv (js/hospitals.js) 기반 병원 목록 ── */
function renderFacilities() {
  $$("#facilityScenarioBtns button").forEach(b => b.classList.toggle("active", b.dataset.sc === S.sc));
  renderFacilityList({
    items: window.hospitalList || [],
    sort: S.facSort,
    onlyOutage: S.facOnly,
    sortButtons: "#facSortBtns",
    count: "#facCount",
    table: "#facTable",
    itemLabel: "병원"
  });
}

function renderCareCenters() {
  renderFacilityList({
    items: window.careCenterList || [],
    sort: S.careSort,
    onlyOutage: S.careOnly,
    sortButtons: "#careSortBtns",
    count: "#careCount",
    table: "#careTable",
    itemLabel: "기관"
  });
}

function renderFacilityList({ items, sort, onlyOutage, sortButtons, count, table, itemLabel }) {
  const byId = {}; S.rows.forEach(r => byId[r.id] = r);
  let list = items.map(item => ({ item, r: byId[String(item.rid)] || null }));
  const outN = list.filter(x => x.r).length;
  if (onlyOutage) list = list.filter(x => x.r);
  const rk = x => x.r ? (S.analyzed ? x.r.rank : 1e6) : 2e6;
  const cmp = {
    rank: (a, b) => rk(a) - rk(b) || (b.r ? b.r.ratio : 0) - (a.r ? a.r.ratio : 0) || a.item.n.localeCompare(b.item.n, "ko"),
    ratio: (a, b) => (b.r ? b.r.ratio : -1) - (a.r ? a.r.ratio : -1) || a.item.n.localeCompare(b.item.n, "ko"),
    region: (a, b) => a.item.reg.localeCompare(b.item.reg, "ko") || a.item.n.localeCompare(b.item.n, "ko"),
    name: (a, b) => a.item.n.localeCompare(b.item.n, "ko")
  }[sort];
  list.sort(cmp);
  $$(sortButtons + " button").forEach(b => b.classList.toggle("active", b.dataset.fs === sort));
  setText(count, S.rows.length ? `정전 구역 소재 ${outN}곳 / 전체 ${items.length}곳 · 표시 ${list.length}곳` : `전체 ${items.length}곳 (재난 발생 전)`);
  const empty = `<tr><td colspan="7" class="empty-msg">${S.rows.length ? `표시할 ${itemLabel} 목록이 없습니다.` : `재난이 발생하면 정전 구역 소재 ${itemLabel}이 표시됩니다. (체크 해제 시 전체 목록)`}</td></tr>`;
  setHTML(table, list.map((x, i) => `
    <tr ${x.r ? `class="${x.r.id === S.sel ? "sel" : ""}" onclick="pickFromTable('${x.r.id}')"` : ""}>
      <td>${i + 1}</td><td><b>${x.item.n}</b></td><td class="why">${x.item.a}</td><td>${x.item.reg}</td>
      <td>${x.r ? x.r.pct + "%" : "-"}</td><td>${x.r && S.analyzed ? x.r.rank + "순위" : "-"}</td>
      <td>${x.r ? `<span class="lvl ${x.r.level}">정전 구역</span>` : "정상"}</td></tr>`).join("") || empty);
}

function renderScenarios() {
  if (!SC || !SC.A) {
    setHTML("#scenarioCards", `<div class="empty-msg">우선순위 분석이 끝나면 복구 시나리오를 비교합니다.</div>`);
    setText("#simName", "-"); setText("#simScore", "-");
    ["#simTime", "#simPeople", "#simHosp", "#simDesc"].forEach(x => setText(x, "-"));
    return;
  }
  const keys = ["A", "B", "C"];
  REC = [...keys].sort((a, b) => SC[b].score - SC[a].score)[0];
  setText("#scenarioNote", `복구반 ${S.crews}팀 기준`);
  setHTML("#scenarioCards", keys.map(k => {
    const s = SC[k], first = s.order[0] ? s.order[0].region : "-";
    return `<div class="scenario ${k === REC ? "recommended" : ""}">
      <div class="scenario-top"><b>${SC_NAME[k]}</b><span>${k === REC ? "최적안" : "비교"}</span></div>
      <strong>${s.score.toFixed(1)}점</strong>
      <div class="scenario-row"><span>전체 복구 완료</span><b>${s.makespan.toFixed(1)}시간</b></div>
      <div class="scenario-row"><span>인구 평균 정전시간</span><b>${s.avgP.toFixed(1)}시간</b></div>
      <div class="scenario-row"><span>병원 평균 복구시간</span><b>${s.avgH.toFixed(1)}시간</b></div>
      <div class="scenario-row"><span>첫 복구 구역</span><b>${first}</b></div>
      <button onclick="goToScenarioDetail('${k}')">상세 시뮬레이션</button></div>`;
  }).join(""));
  renderSimDetail();
}

function renderSimDetail() {
  const k = S.sc, s = SC[k];
  $$(".sc-tab").forEach(b => b.classList.toggle("active", b.dataset.sc === k));
  if (!s) return;
  setText("#simName", SC_NAME[k]); setText("#simDesc", "");
  setText("#simScore", s.score.toFixed(1));
  setText("#simTime", s.makespan.toFixed(1) + "시간");
  setText("#simPeople", s.avgP.toFixed(1) + "시간");
  setText("#simHosp", s.avgH.toFixed(1) + "시간");

  renderScenarioExplanation(k, s);
}

function renderScenarioExplanation(k, s) {
  if (!s || !s.w) return;
  const w = s.w, finalScore = s.score;
  const reason = {
    A: "사회적 피해 최소화를 위해 인구가 오래 정전되는 상황을 가장 중요하게 보고(50%), 병원 영향과 전체 복구시간을 함께 반영합니다.",
    B: "응급의료기관의 복구를 가장 중요하게 보기 때문에 병원 평균 복구시간에 가장 높은 가중치(60%)를 적용합니다.",
    C: "전체 복구 완료시간을 가장 중요하게 보기 때문에 전체 복구시간 지표에 가장 높은 가중치(60%)를 적용합니다."
  };
  setText("#explainTitle", `${SC_NAME[k]} · 점수 산출 근거`);
  setText("#explainSummary", `${reason[k]} 이 점수는 A·B·C 세 시나리오끼리 비교한 상대 점수입니다(각 지표에서 가장 좋은 안이 100점이고, 나머지는 「가장 좋은 안의 값 ÷ 내 값 × 100」으로 계산합니다). 최종 점수는 ${s.score.toFixed(1)}점입니다.`);
  setText("#explainFormula", `최종점수 = 인구지표 × ${(w.p * 100).toFixed(0)}% + 의료기관지표 × ${(w.h * 100).toFixed(0)}% + 복구시간지표 × ${(w.m * 100).toFixed(0)}%`);
  setText("#explainP", `${s.pScore.toFixed(1)}점`);
  setText("#explainPDetail", `인구 평균 정전시간 ${s.avgP.toFixed(1)}시간`);
  setText("#explainH", `${s.hScore.toFixed(1)}점`);
  setText("#explainHDetail", `병원 평균 복구시간 ${s.avgH.toFixed(1)}시간`);
  setText("#explainM", `${s.mScore.toFixed(1)}점`);
  setText("#explainMDetail", `전체 복구 완료 ${s.makespan.toFixed(1)}시간`);
  setText("#explainCalculation", `(${s.pScore.toFixed(1)} × ${w.p.toFixed(2)}) + (${s.hScore.toFixed(1)} × ${w.h.toFixed(2)}) + (${s.mScore.toFixed(1)} × ${w.m.toFixed(2)}) = ${s.raw.toFixed(1)}점` + (s.raw !== finalScore ? ` → 최종 ${finalScore.toFixed(1)}점` : ""));
  setText("#explainReason", reason[k]);
}

function renderCurve() {
  if (!SC || !SC.A) { setHTML("#impactChart", `<div class="empty-msg">분석 후 표시됩니다.</div>`); setText("#impactMax", "-"); setText("#impactNote", ""); return; }
  const maxT = Math.max(SC.A.makespan, SC.B.makespan, SC.C.makespan) || 1, tot = SC.totP;
  // 글자가 찌그러지지 않도록 실제 차트 너비를 그대로 viewBox 로 사용한다
  const holder = $("#impactChart");
  const W = Math.max(320, (holder && holder.clientWidth ? holder.clientWidth - 24 : 0) || 600), H = 180;
  const X0 = 58, X1 = W - 14, Y1 = 10, Y0 = 140;
  const px = t => X0 + (t / maxT) * (X1 - X0), py = v => Y0 - (v / tot) * (Y0 - Y1);
  const line = k => {
    const s = SC[k], pts = [], N = 60;
    for (let i = 0; i <= N; i++) {
      const t = maxT * i / N;
      const rem = s.order.reduce((a, r) => a + (s.sc[r.id].f > t ? r.pop / 1e4 : 0), 0);
      pts.push(`${px(t).toFixed(1)},${py(rem).toFixed(1)}`);
    }
    return `<polyline fill="none" stroke="${SC_COLOR[k]}" stroke-width="2.2" points="${pts.join(" ")}"/>`;
  };
  // X축 눈금: 전체 시간을 약 6칸으로 나누되 6·12·24시간처럼 읽기 쉬운 간격 사용
  const step = [1, 2, 3, 6, 12, 24, 48, 72, 96, 120, 240].find(s => s >= maxT / 6) || 240;
  let xTicks = "";
  for (let t = 0; t <= maxT + 0.001; t += step) {
    xTicks += `<line x1="${px(t)}" y1="${Y0}" x2="${px(t)}" y2="${Y0 + 4}" stroke="#94a3b8"/>` +
      `<text x="${px(t)}" y="${Y0 + 16}" font-size="10" fill="#64748b" text-anchor="middle">${t}</text>`;
  }
  // Y축 눈금: 0~총 영향 인구를 4등분 (가로 격자선 포함)
  const fmtY = v => v === 0 ? "0" : v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1);
  let yTicks = "";
  for (let i = 0; i <= 4; i++) {
    const v = tot * i / 4, y = py(v);
    yTicks += `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="${i === 0 ? "#cbd5e1" : "#eef2f7"}"/>` +
      `<line x1="${X0 - 4}" y1="${y}" x2="${X0}" y2="${y}" stroke="#94a3b8"/>` +
      `<text x="${X0 - 7}" y="${y + 3}" font-size="10" fill="#64748b" text-anchor="end">${fmtY(v)}</text>`;
  }
  setHTML("#impactChart", `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="height:${H}px">
    ${yTicks}${xTicks}
    <line x1="${X0}" y1="${Y1}" x2="${X0}" y2="${Y0}" stroke="#cbd5e1"/>
    <text x="${(X0 + X1) / 2}" y="${H - 6}" font-size="11" fill="#475569" text-anchor="middle">경과 시간 (시간)</text>
    <text transform="rotate(-90 12 ${(Y0 + Y1) / 2})" x="12" y="${(Y0 + Y1) / 2 + 4}" font-size="11" fill="#475569" text-anchor="middle">잔여 영향 인구 (만 명)</text>
    ${line("A")}${line("B")}${line("C")}</svg>`);
  setText("#impactMax", man(tot * 1e4));
  setText("#impactNote", `${REC}안 기준 ${SC[REC].makespan.toFixed(1)}시간 후 전체 복구`);
}

function renderStrategyBtns() {
  setHTML("#strategyBtns", ["A", "B", "C"].map(k =>
    `<button data-st="${k}" class="${S.sc === k ? "active" : ""}">${SC_NAME[k]}</button>`).join(""));
  $$("#strategyBtns button").forEach(b => b.addEventListener("click", () => chooseScenario(b.dataset.st)));
  const weights = scenarioWeights(S.sc);
  const weightText = SCORE_FACTORS
    .map(name => `${SCORE_LABEL[name]} ${(Number(weights[name] || 0) * 100).toFixed(1).replace(/\.0$/, "")}%`).join(" · ");
  const legend = SCORE_FACTORS.filter(name => Number(weights[name] || 0) > 0)
    .map(name => `<span><i class="sb-${name}"></i>${SCORE_LABEL[name]}</span>`).join("");
  setHTML("#strategyDesc", `<span>현재 가중치: ${weightText}.</span><span class="score-legend">${legend}</span>`);
  setText("#strategyDescWeights", "");
}

function chooseScenario(type) {
  if (!SC_NAME[type]) return;
  S.sc = type;
  applyScenarioPriority();
  renderStrategyBtns();
  renderAll(false);
}

function renderAll(fit) {
  renderFlow(); renderBanner(); renderAI(); renderKpis();
  renderMap(fit); renderPriority(); renderSelected(); renderTables();
  renderScenarios(); renderCurve();
}

/* ── 상호작용 ── */
function selectOutage(id) {
  S.sel = id;
  renderPriority(); renderSelected(); renderTables(); renderMap(false);
  // 복구 우선순위에서 지역 선택 시 전국 현황 탭으로 이동하지 않고
  // 현재 화면에서 선택 상태만 유지한다.
}
function pickFromTable(id) { selectOutage(id); }

function goToScenarioDetail(k) { chooseScenario(k); openTab("tab-scenario"); }

function openTab(id) {
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  $$(".tab-content").forEach(t => t.classList.remove("active"));
  const t = $("#" + id); if (t) t.classList.add("active");
  if (id === "tab-dashboard" && map) setTimeout(() => map.invalidateSize(), 100);
}

function initMap() {
  map = L.map("leafletMap").setView([36.2, 127.8], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
  geoLayer = L.layerGroup().addTo(map); layer = L.layerGroup().addTo(map);
}

function bind() {
  $$(".nav-item").forEach(b => b.addEventListener("click", () => openTab(b.dataset.tab)));
  $$(".sc-tab").forEach(b => b.addEventListener("click", () => chooseScenario(b.dataset.sc)));
  $$("#priorityScenarioBtns button").forEach(b => b.addEventListener("click", () => chooseScenario(b.dataset.sc)));
  $$("#facilityScenarioBtns button").forEach(b => b.addEventListener("click", () => chooseScenario(b.dataset.sc)));
  $$("#facSortBtns button").forEach(b => b.addEventListener("click", () => { S.facSort = b.dataset.fs; renderFacilities(); }));
  $("#facOnlyOutage").addEventListener("change", e => { S.facOnly = e.target.checked; renderFacilities(); });
  $$("#careSortBtns button").forEach(b => b.addEventListener("click", () => { S.careSort = b.dataset.fs; renderCareCenters(); }));
  $("#careOnlyOutage").addEventListener("change", e => { S.careOnly = e.target.checked; renderCareCenters(); });
  $("#sidebarToggle").addEventListener("click", () => { $("#sidebar").classList.toggle("collapsed"); setTimeout(() => map && map.invalidateSize(), 300); });

  // 💡 백엔드 연결 여부 엄격 차단 로직 적용
  $("#simGo").addEventListener("click", async () => {
    try {
      await api("/api/simulate", { method: "POST", body: JSON.stringify({ disaster_type: $("#simType").value, severity: +$("#simSev").value }) });
      toast("백엔드에 재난이 발생했습니다. 정전 정보를 수신합니다…");
      await poll();
    } catch (e) {
      console.error("백엔드 연결 실패:", e);
      toast("⚠️ 백엔드 서버(uvicorn)가 꺼져 있어 재난을 발생시킬 수 없습니다!");
      clearEvent(); // 백엔드 미작동 시 기존 화면 완전 초기화 및 차단
    }
  });

  $("#simReset").addEventListener("click", async () => {
    try { 
      await api("/api/reset", { method: "POST" }); 
      poll(); 
    } catch (e) { 
      toast("⚠️ 백엔드 서버(uvicorn)가 꺼져 있습니다."); 
      clearEvent();
    }
  });
}

let _curveTimer;
window.addEventListener("resize", () => { clearTimeout(_curveTimer); _curveTimer = setTimeout(() => { try { renderCurve(); } catch (e) {} }, 150); });

window.addEventListener("DOMContentLoaded", () => {
  bind(); initMap(); renderAll(false);
  poll(); setInterval(poll, POLL_MS);
});