/* 재난 전력복구 의사결정 지원 — 화면
 *
 * 흐름
 *  1) 백엔드가 재난을 발생시키면(POST /api/simulate) 화면이 주기적으로 GET /api/outage-report 를 조회해
 *     '정전 정보'를 수신한다.                                  → 지도·표에 정전 현황 표시 (순위 없음)
 *  2) 정전 정보를 받으면 그 데이터를 POST /api/priority 로 보내 복구 우선순위를 계산한다.
 *  3) 결과(순위·근거·시나리오)를 보여 주고, 최종 결정은 관리자가 한다.
 */
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const API = "http://127.0.0.1:8000";
const POLL_MS = 3000;

const LEVEL_COLOR = { critical: "#e11d48", high: "#f97316", mid: "#0284c7", low: "#16a34a" };
const LEVEL_TXT = { critical: "긴급", high: "높음", mid: "보통", low: "낮음" };
const SC_NAME = { A: "A. 사회적 피해 최소화", B: "B. 중요시설 우선", C: "C. 네트워크 효율 우선" };
const SC_RULE = {
  A: "우선순위 점수가 높은 구역부터 복구합니다.",
  B: "정전 영향 응급의료기관이 많은 구역부터 복구합니다.",
  C: "복구 소요시간이 짧은 구역부터 복구해 완료 구역 수를 빠르게 늘립니다."
};
const SC_COLOR = { A: "#e11d48", B: "#f97316", C: "#0284c7" };
const CREWS = 10;                       // 복구반 수 (고정)
const SEV_TXT = { "0.7": "약", "1": "보통", "1.3": "강" };

const S = {
  eventId: null, event: null, outages: [], rows: [],
  phase: "idle",              // idle → received → analyzing → done (| error)
  analyzed: false, summary: null,
  strategy: "BALANCED", strategies: [],
  sel: null, crews: CREWS, sc: "A", reqSeq: 0, metaLoaded: false
};
let SC = {}, REC = "A", map = null, layer = null, geoLayer = null, polling = false;

/* ── 유틸 ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const man = n => (n / 1e4).toLocaleString("ko", { maximumFractionDigits: 1 }) + "만 명";
const setText = (s, v) => { const e = $(s); if (e) e.textContent = v; };
const setHTML = (s, v) => { const e = $(s); if (e) e.innerHTML = v; };
const ratioLevel = r => r >= 0.7 ? "critical" : r >= 0.45 ? "high" : r >= 0.2 ? "mid" : "low";
const stratLabel = () => (S.strategies.find(x => x.type === S.strategy) || {}).label || S.strategy;

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
  return r;
}

/* ── 백엔드 수신 ── */
function setConn(ok, msg) {
  $("#liveStat").classList.toggle("off", !ok);
  setText("#liveText", msg || (ok ? "실시간 수신 중" : "백엔드 연결 안 됨"));
}

async function loadMeta() {
  const d = await api("/api/disasters");
  S.strategies = d.strategies;
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
  S.analyzed = false; S.summary = null; SC = {};
  S.sel = S.rows.length ? S.rows[0].id : null;
  S.phase = "received";
  renderAll(true);
  toast(`[${d.event.type_name}] 정전 정보 수신: ${d.outages.length}개 시·군·구`);
  await runAnalysis();
}

function clearEvent() {
  S.eventId = null; S.event = null; S.outages = []; S.rows = []; S.summary = null;
  S.analyzed = false; S.phase = "idle"; S.sel = null; SC = {}; S.reqSeq++;
  renderAll(true);
}

async function runAnalysis() {
  if (!S.outages.length) return;
  const seq = ++S.reqSeq;
  S.phase = "analyzing"; renderFlow(); renderBanner();
  await sleep(700);                                   // '분석 중' 단계가 보이도록 잠깐 대기
  try {
    const body = { outages: S.outages, strategy: S.strategy };
    const res = await api("/api/priority", { method: "POST", body: JSON.stringify(body) });
    if (seq !== S.reqSeq) return;                     // 더 최신 요청이 있으면 버림
    S.rows = res.items.map(fromItem); S.summary = res.summary;
    S.analyzed = true; S.phase = "done";
    if (!S.rows.find(r => r.id === S.sel)) S.sel = S.rows[0] ? S.rows[0].id : null;
    SC = scenarios(S.rows);
    renderAll(false);
    toast(`우선순위 분석 완료 (${stratLabel()})`);
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

function scenarios(rows) {
  if (!rows || !rows.length) return {};
  const K = S.crews;
  const ord = {
    A: [...rows].sort((a, b) => b.score - a.score || a.dur - b.dur),
    B: [...rows].sort((a, b) => b.hosp - a.hosp || b.pop - a.pop),
    C: [...rows].sort((a, b) => a.dur - b.dur || b.score - a.score)
  };
  const totP = rows.reduce((s, r) => s + r.pop / 1e4, 0) || 1;
  const totH = rows.reduce((s, r) => s + r.hosp, 0) || 1;
  const out = {};
  for (const k in ord) {
    const m = metrics(ord[k], K);
    out[k] = { k, order: ord[k], sc: m.sc, makespan: m.M, avgP: m.D / totP, avgH: m.F / totH };
  }
  const rng = f => { const v = Object.keys(ord).map(k => f(out[k])); return [Math.min(...v), Math.max(...v)]; };
  const [minP, maxP] = rng(x => x.avgP), [minH, maxH] = rng(x => x.avgH), [minM, maxM] = rng(x => x.makespan);
  const norm = (v, mn, mx) => Math.abs(mx - mn) < 0.01 ? 85 : (1 - (v - mn) / (mx - mn)) * 100;
  const W = { A: { p: .5, h: .3, m: .2 }, B: { p: .2, h: .6, m: .2 }, C: { p: .2, h: .2, m: .6 } };
  for (const k in ord) {
    const w = W[k];
    const raw = norm(out[k].avgP, minP, maxP) * w.p + norm(out[k].avgH, minH, maxH) * w.h + norm(out[k].makespan, minM, maxM) * w.m;
    out[k].score = Math.min(99.9, Math.max(25, raw));
  }
  out.totP = totP;
  return out;
}

/* ── 렌더링 ── */
function renderFlow() {
  const st = { idle: [1, 0, 0], received: [2, 1, 0], analyzing: [2, 1, 0], error: [2, 1, 0], done: [2, 2, 1] }[S.phase];
  // 값: 0=대기, 1=진행(active), 2=완료(done)
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
  const phase = S.phase === "analyzing" ? "우선순위 분석 중…" : S.phase === "error" ? "분석 실패" : S.analyzed ? `복구 기준: ${stratLabel()}` : "분석 대기";
  setText("#alertTitle", `[${e.type_name}] 정전 정보 수신 · ${e.occurred_at}`);
  setText("#alertSub", `${e.desc} · 강도 ${SEV_TXT[String(e.severity)] || e.severity} · ${phase}`);
  setText("#aZones", sm.outage_zones);
  setText("#aFac", sm.hospitals_affected);
  setText("#aPop", man(sm.affected_population).replace(" 명", ""));
}

function renderAI() {
  const box = $("#aiSummary");
  if (!S.analyzed || !S.summary || !S.rows.length) { box.classList.add("hidden"); return; }
  const top3 = S.rows.slice(0, 3).map(r => `${r.rank}순위 ${r.region}`).join(" → ");
  box.classList.remove("hidden");
  box.innerHTML = `<b>복구 권고</b> · ${S.summary.headline}.<br>${top3}. 상위 10개 시·군·구가 전체 영향 인구의 <b>${S.summary.top10_share}%</b>를 차지합니다.
    <br><small>※ 정전 현황을 가중 점수로 계산한 권고안입니다. 최종 결정은 관리자 확인 후 수행됩니다.</small>`;
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
  if (!S.analyzed) {
    const msg = !S.rows.length ? "재난이 발생하면 정전 정보 수신 후 우선순위를 자동으로 분석합니다."
      : S.phase === "error" ? "분석에 실패했습니다. 백엔드를 확인하세요." : "정전 정보를 수신했습니다. 우선순위를 분석하는 중…";
    setHTML("#priorityList", `<div class="empty-msg">${msg}</div>`);
    return;
  }
  setHTML("#priorityList", S.rows.slice(0, 5).map(r => `
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
  setText("#selectedScoreLbl", S.analyzed ? "우선순위 점수" : "정전 비율");
  setText("#selectedPeople", man(r.pop));
  setText("#selectedFacilities", `${r.hosp}개소 (전체 ${r.totHosp})`);
  setText("#selectedTime", r.dur.toFixed(1) + "시간");
  setText("#selectedPct", r.pct + "%");
  setText("#selectedCause", r.cause);
  setText("#selectedReason", S.analyzed ? r.reason : `${r.hazard} 로 정전 발생. 우선순위 분석 결과를 기다리는 중입니다.`);
  const el = $("#selectedScore"); if (el) el.style.color = LEVEL_COLOR[r.level];
}

function stackBar(p) {
  if (!p) return "";
  return `<div class="stackbar" title="인구 ${p.pop} · 의료 ${p.fac} · 고령 ${p.vul} · 정전비율 ${p.sev}">` +
    ["pop", "fac", "vul", "sev"].map(k => `<i class="sb-${k}" style="width:${p[k]}%"></i>`).join("") + `</div>`;
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
  const list = S.analyzed ? R : by;
  setHTML("#rankTable", list.map(r => `
    <tr class="${cls(r)}" onclick="pickFromTable('${r.id}')">
      <td>${S.analyzed ? r.rank : "-"}</td><td><b>${r.region}</b></td>
      <td>${S.analyzed ? `<span class="lvl ${r.level}">${LEVEL_TXT[r.level]}</span>` : "-"}</td>
      <td><b>${S.analyzed ? r.score.toFixed(1) : "-"}</b></td><td>${stackBar(r.parts)}</td>
      <td>${man(r.pop)}<br><small>정전 ${r.pct}%</small></td><td>${r.hosp}개소</td><td>${r.dur.toFixed(1)}h</td>
      <td class="why">${r.reason || "분석 대기 중"}</td></tr>`).join("") || empty(9));

  // 시설 상세
  const fac = [...R].filter(r => r.totHosp > 0).sort((a, b) => b.hosp - a.hosp || b.pop - a.pop);
  setHTML("#facTable", fac.map(r => `
    <tr class="${cls(r)}" onclick="pickFromTable('${r.id}')"><td><b>${r.region}</b></td><td>${r.totHosp}개소</td><td>${r.hosp}개소</td><td>${r.pct}%</td><td>${S.analyzed ? r.rank + "순위" : "-"}</td></tr>`).join("") || empty(5));
}

function renderScenarios() {
  if (!SC || !SC.A) {
    setHTML("#scenarioCards", `<div class="empty-msg">우선순위 분석이 끝나면 복구 시나리오를 비교합니다.</div>`);
    setHTML("#gantt", ""); setText("#simName", "-"); setText("#simScore", "-");
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
  setText("#simName", SC_NAME[k]); setText("#simDesc", SC_RULE[k]);
  setText("#simScore", s.score.toFixed(1));
  setText("#simTime", s.makespan.toFixed(1) + "시간");
  setText("#simPeople", s.avgP.toFixed(1) + "시간");
  setText("#simHosp", s.avgH.toFixed(1) + "시간");
  const mx = Math.max(...Object.values(s.sc).map(x => x.f)) || 1;
  let g = "";
  for (let c = 0; c < S.crews; c++) {
    g += `<div class="g-row"><span>복구반 ${c + 1}</span><div class="g-track">` +
      s.order.filter(r => s.sc[r.id].c === c).map(r => {
        const w = (r.dur / mx) * 100;
        return `<i class="g-bar ${r.level}" style="left:${(s.sc[r.id].s / mx) * 100}%;width:${w}%" title="${r.region} (${r.dur.toFixed(1)}h)">${w >= 7 ? `<b>${r.region.split(" ").pop()}</b>` : ""}</i>`;
      }).join("") + `</div></div>`;
  }
  setHTML("#gantt", g + `<div class="g-row"><span></span><div class="g-axis"><em>0h</em><em>${(mx / 2).toFixed(1)}h</em><em>${mx.toFixed(1)}h</em></div></div>`);
}

function renderCurve() {
  if (!SC || !SC.A) { setHTML("#impactChart", `<div class="empty-msg">분석 후 표시됩니다.</div>`); setText("#impactMax", "-"); setText("#impactNote", ""); return; }
  const maxT = Math.max(SC.A.makespan, SC.B.makespan, SC.C.makespan) || 1, tot = SC.totP;
  const X0 = 44, X1 = 590, Y0 = 130, Y1 = 12, N = 60;
  const px = t => X0 + (t / maxT) * (X1 - X0), py = v => Y0 - (v / tot) * (Y0 - Y1);
  const line = k => {
    const s = SC[k], pts = [];
    for (let i = 0; i <= N; i++) {
      const t = maxT * i / N;
      const rem = s.order.reduce((a, r) => a + (s.sc[r.id].f > t ? r.pop / 1e4 : 0), 0);
      pts.push(`${px(t).toFixed(1)},${py(rem).toFixed(1)}`);
    }
    return `<polyline fill="none" stroke="${SC_COLOR[k]}" stroke-width="2.2" points="${pts.join(" ")}"/>`;
  };
  setHTML("#impactChart", `<svg viewBox="0 0 600 150" preserveAspectRatio="none">
    <line x1="${X0}" y1="${Y0}" x2="${X1}" y2="${Y0}" stroke="#cbd5e1"/><line x1="${X0}" y1="${Y1}" x2="${X0}" y2="${Y0}" stroke="#cbd5e1"/>
    <text x="${X0 - 6}" y="${Y1 + 4}" font-size="10" fill="#64748b" text-anchor="end">${tot.toFixed(0)}</text>
    <text x="${X0 - 6}" y="${Y0 + 3}" font-size="10" fill="#64748b" text-anchor="end">0</text>
    <text x="${X0}" y="146" font-size="10" fill="#64748b">0h</text>
    <text x="${X1}" y="146" font-size="10" fill="#64748b" text-anchor="end">${maxT.toFixed(0)}h</text>
    ${line("A")}${line("B")}${line("C")}</svg>`);
  setText("#impactMax", man(tot * 1e4));
  setText("#impactNote", `${REC}안 기준 ${SC[REC].makespan.toFixed(1)}시간 후 전체 복구`);
}

function renderStrategyBtns() {
  setHTML("#strategyBtns", S.strategies.map(x =>
    `<button data-st="${x.type}" class="${S.strategy === x.type ? "active" : ""}">${x.label}</button>`).join(""));
  $$("#strategyBtns button").forEach(b => b.addEventListener("click", () => chooseStrategy(b.dataset.st)));
  const st = S.strategies.find(x => x.type === S.strategy);
  if (st) {
    const w = st.weights;
    setText("#strategyDesc", `현재 가중치: 영향 인구 ${Math.round(w.pop * 100)}% · 응급의료기관 ${Math.round(w.fac * 100)}% · 고령층 ${Math.round(w.vul * 100)}% · 정전 비율 ${Math.round(w.sev * 100)}%`);
  }
}

function chooseStrategy(type) {
  S.strategy = type;
  renderStrategyBtns();
  if (S.outages.length) runAnalysis();
}

function renderHow() {
  const e = S.event;
  if (!e) {
    setHTML("#howList", `<li>재난이 발생하면 정전 데이터가 어떻게 만들어졌는지 여기에 설명이 표시됩니다.</li>`);
    setHTML("#causeList", `<div class="empty-msg">재난이 발생하면 정전 비율이 높은 구역과 그 원인이 표시됩니다.</div>`);
    return;
  }
  setHTML("#howList",
    e.explain.how.map(t => `<li>${t}</li>`).join("") + e.explain.notes.map(t => `<li class="note">${t}</li>`).join(""));
  const top = [...S.rows].sort((a, b) => b.ratio - a.ratio || b.pop - a.pop).slice(0, 5);
  setHTML("#causeList", top.map(r => `
    <button class="cause-item" onclick="selectOutage('${r.id}')"><b>${r.region}<em>정전 ${r.pct}%</em></b><small>${r.cause}</small></button>`).join(""));
}

function renderAll(fit) {
  renderFlow(); renderBanner(); renderAI(); renderKpis();
  renderMap(fit); renderPriority(); renderSelected(); renderTables(); renderHow();
  renderScenarios(); renderCurve();
}

/* ── 상호작용 ── */
function selectOutage(id) {
  S.sel = id;
  renderPriority(); renderSelected(); renderTables(); renderMap(false);
  const r = S.rows.find(x => x.id === id);
  if (map && r) map.panTo([r.lat, r.lng]);
}
function pickFromTable(id) { selectOutage(id); openTab("tab-dashboard"); }

function goToScenarioDetail(k) { S.sc = k; renderSimDetail(); openTab("tab-scenario"); }

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
  $$(".sc-tab").forEach(b => b.addEventListener("click", () => { S.sc = b.dataset.sc; renderSimDetail(); }));
  $("#sidebarToggle").addEventListener("click", () => { $("#sidebar").classList.toggle("collapsed"); setTimeout(() => map && map.invalidateSize(), 300); });
  $("#simGo").addEventListener("click", async () => {
    try {
      await api("/api/simulate", { method: "POST", body: JSON.stringify({ disaster_type: $("#simType").value, severity: +$("#simSev").value }) });
      toast("백엔드에 재난이 발생했습니다. 정전 정보를 수신합니다…");
      poll();
    } catch (e) { toast("백엔드에 연결할 수 없습니다 (uvicorn 실행 확인)"); }
  });
  $("#simReset").addEventListener("click", async () => {
    try { await api("/api/reset", { method: "POST" }); poll(); } catch (e) { toast("백엔드에 연결할 수 없습니다"); }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  bind(); initMap(); renderAll(false);
  poll(); setInterval(poll, POLL_MS);
});