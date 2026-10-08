const $= s => document.querySelector(s),$$ = s => document.querySelectorAll(s);
const H = typeof window.weatherHourly !== "undefined" ? window.weatherHourly : (typeof weatherHourly !== "undefined" ? weatherHourly : {});
const M = typeof window.weatherMeta !== "undefined" ? window.weatherMeta : (typeof weatherMeta !== "undefined" ? weatherMeta : { start: "2026-10-01 00:00", last: 0, n: 1 });
const ST = M.stations || {};

const pad = n => String(n).padStart(2, "0");
const T0 = (() => { 
  const [d, t] = (M.start || "2026-10-01 00:00").split(" "), [y, m, dd] = d.split("-"), [hh, mm] = t.split(":"); 
  return Date.UTC(+y, m - 1, +dd, +hh, +mm); 
})();

const dateOf = i => new Date(T0 + i * 36e5);
const fmt = i => { const d = dateOf(i); return `${d.getUTCMonth() + 1}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}시`; };
const fmtFull = i => { const d = dateOf(i); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`; };
const toInput = i => fmtFull(i).replace(" ", "T");
const fromInput = v => { const [d, t] = v.split("T"), [y, m, dd] = d.split("-"); return Math.round((Date.UTC(+y, m - 1, +dd, +t.split(":")[0]) - T0) / 36e5); };
const man = n => (n / 1e4).toLocaleString("ko", { maximumFractionDigits: 1 }) + "만 명";
const short = n => String(n || "").replace(" 권역", "").replace("수도권 남부", "수도권");
const setText = (s, v) => { const e = $(s); if (e) e.textContent = v; };
const setHTML = (s, v) => { const e = $(s); if (e) e.innerHTML = v; };

const LBL = { pop: "영향 인구", fac: "응급의료기관", wx: "기상 위험" };
const WL = { ok: "양호", warn: "주의", danger: "위험" };

const BACKEND_URL = "http://127.0.0.1:8000";
const S = { 
  t: M.last || 0, 
  w: { pop: 40, fac: 30, wx: 30 }, 
  crews: 3, 
  sc: "A", 
  sel: null, 
  disasterType: "TYPHOON", 
  strategy: "BALANCED" 
};

let ROWS = [], SC = {}, REC = "A", map = null, markers = [];

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function getScoreColor(score) {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#facc15";
  return "#22c55e";
}

function getPriorityRows(rows) {
  return [...(rows || [])].sort((a, b) => b.score - a.score || a.dur - b.dur).slice(0, 5);
}

function localScoreRows() {
  const source = Array.isArray(window.outageData) ? window.outageData : (Array.isArray(outageData) ? outageData : []);
  if (!source.length) return [];

  const maxPop = Math.max(...source.map(r => Number(r.pop) || 0), 1);
  const maxHosp = Math.max(...source.map(r => Number(r.hosp) || 0), 1);
  const maxWind = Math.max(...source.map(r => Number(r.wind_speed) || 0), 25);
  const maxRain = Math.max(...source.map(r => Number(r.precipitation) || 0), 60);

  return source.map(row => {
    const pop = Number(row.pop) || 0;
    const hosp = Number(row.hosp) || 0;
    const est = Number(row.est_hours) || 0;
    const wind = Number(row.wind_speed) || 0;
    const rain = Number(row.precipitation) || 0;

    const score = clamp(
      (pop / maxPop) * 42 +
      (hosp / maxHosp) * 28 +
      (wind / maxWind) * 18 +
      (rain / maxRain) * 12 +
      Math.max(0, (8 - est) / 8) * 10,
      0,
      100
    );

    const level = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "mid" : "low";
    const dur = est || 4;
    const rankHint = row.rank || 0;

    return {
      id: row.id,
      region: row.region,
      lat: row.lat,
      lng: row.lng,
      pop,
      totPop: pop,
      hosp,
      totHosp: hosp,
      shelters: 0,
      pct: 0,
      src: "엑셀/CSV 데이터",
      score: Math.round(score),
      rank: rankHint,
      dur,
      level,
      wl: score >= 80 ? "danger" : score >= 60 ? "warn" : "ok",
      cascade: score >= 80 ? "매우 높음" : score >= 60 ? "높음" : "보통",
      part: { pop: score * 0.42, fac: score * 0.28, wx: score * 0.3 },
      wx: {
        pw: Math.round(wind),
        pr: Math.round(rain),
        pws: "관측소",
        prs: "관측소",
        temp: Number(row.temperature) || 0,
        pwt: fmt(S.t),
        prt: fmt(S.t),
        r24: Math.round(rain),
        r24s: "관측소",
        n: 1
      },
      reason: `${row.region}은(는) 영향 인구 ${man(pop)}, 응급의료기관 ${hosp}개소, 복구시간 ${dur.toFixed(1)}시간을 반영해 우선순위를 산출한 결과입니다.`
    };
  }).sort((a, b) => b.score - a.score || a.hosp - b.hosp).map((row, index) => ({ ...row, rank: index + 1 }));
}

/* ── 데이터 소스 선택: 로컬 엑셀/CSV가 있으면 우선 사용, 백엔드는 보조용 ── */
async function model() {
  const localFallback = localScoreRows();
  if (localFallback.length) return localFallback;

  try {
    const res = await fetch(`${BACKEND_URL}/api/recommend-priority?disaster_type=${S.disasterType}&strategy=${S.strategy}`);
    if (!res.ok) throw new Error("백엔드 수신 실패");

    const backendRes = await res.json();
    const recommendations = backendRes.recommendations || [];

    const rows = recommendations.map(r => {
      const pop = r.affected_population || r.population || 0;
      const hosp = r.hospitals || 0;
      const score = r.priority_score || 0;
      const rank = r.priority_rank || 1;
      const dur = Math.round((2 + (rank * 0.4) + (r.risk_score || 0) * 0.02) * 10) / 10;

      return {
        id: r.region_id,
        region: r.region_name,
        lat: r.lat,
        lng: r.lng,
        pop: pop,
        totPop: r.population || pop,
        hosp: hosp,
        totHosp: hosp,
        shelters: r.shelters || 0,
        pct: Math.round((r.outage_ratio || 0) * 100),
        src: "백엔드 실시간 연동",
        score: score,
        rank: rank,
        dur: dur,
        level: rank === 1 ? "critical" : rank <= 3 ? "high" : "mid",
        wl: (r.risk_score || 0) >= 50 ? "danger" : (r.risk_score || 0) >= 30 ? "warn" : "ok",
        cascade: score >= 80 ? "매우 높음" : score >= 60 ? "높음" : "보통",
        part: { pop: score * 0.4, fac: score * 0.4, wx: score * 0.2 },
        wx: {
          pw: r.wind_speed || 0,
          pr: r.rainfall || 0,
          pws: "관측소",
          prs: "관측소",
          temp: 24,
          pwt: fmt(S.t),
          prt: fmt(S.t),
          r24: r.rainfall || 0,
          r24s: "관측소",
          n: 1
        },
        reason: `AI 백엔드 산출 결과: 정전 영향 인구 ${man(pop)}, 의료시설 ${hosp}개소, 리스크 점수 ${r.risk_score}점을 기반으로 복구 ${rank}순위로 계산되었습니다.`
      };
    });

    if (rows.length) return rows.sort((a, b) => a.rank - b.rank);
  } catch (e) {
    console.warn("백엔드 연결 불가, 로컬 엑셀 데이터로 대체합니다:", e);
  }

  return localFallback;
}

/* ── 시뮬레이션 계산 ── */
function metrics(order, K) {
  const free = Array(K).fill(0), sc = {}; 
  let D = 0, F = 0, Mk = 0;
  
  for (const r of order) {
    let c = 0; 
    for (let j = 1; j < K; j++) if (free[j] < free[c]) c = j;
    const s = free[c]; 
    free[c] = s + r.dur;
    D += (r.pop / 1e4) * free[c]; 
    F += r.hosp * free[c]; 
    Mk = Math.max(Mk, free[c]);
    sc[r.id] = { s, f: free[c], c };
  }
  return { D, F, M: Mk, sc };
}

function scenarios(rows) {
  const K = S.crews;
  if (!rows || rows.length === 0) return {};

  const scoreSorted = [...rows].sort((a, b) => b.score - a.score || a.dur - b.dur);
  const ord = {
    A: scoreSorted,
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

  const allAvgP = Object.keys(ord).map(k => out[k].avgP);
  const allAvgH = Object.keys(ord).map(k => out[k].avgH);
  const allMakespan = Object.keys(ord).map(k => out[k].makespan);

  const minP = Math.min(...allAvgP), maxP = Math.max(...allAvgP);
  const minH = Math.min(...allAvgH), maxH = Math.max(...allAvgH);
  const minM = Math.min(...allMakespan), maxM = Math.max(...allMakespan);

  const norm = (v, min, max) => {
    if (Math.abs(max - min) < 0.01) return 85;
    return (1 - (v - min) / (max - min)) * 100;
  };

  const weights = {
    A: { p: 0.5, h: 0.3, m: 0.2 },
    B: { p: 0.2, h: 0.6, m: 0.2 },
    C: { p: 0.2, h: 0.2, m: 0.6 }
  };

  for (const k in ord) {
    const sP = norm(out[k].avgP, minP, maxP);
    const sH = norm(out[k].avgH, minH, maxH);
    const sM = norm(out[k].makespan, minM, maxM);
    const w = weights[k];

    const rawScore = (sP * w.p) + (sH * w.h) + (sM * w.m);
    out[k].score = Math.min(99.9, Math.max(25, rawScore));
  }

  out.totP = totP;
  return out;
}

/* ── 렌더링 ── */
function renderBanner() {
  if (!ROWS.length) return;
  setText("#alertTitle", `[${S.disasterType}] 백엔드 실시간 연동 분석`);
  setText("#alertSub", `분석 대상: ${ROWS.length}개 구역 | 모드: ${S.strategy}`);
  setText("#aZones", ROWS.length);
  setText("#aFac", ROWS.reduce((s, r) => s + r.hosp, 0));
  setText("#aPop", man(ROWS.reduce((s, r) => s + r.pop, 0)).replace(" 명", ""));

  /* ── 상단 4개 KPI 박스 실시간 데이터 계산 및 연동 ── */
  // 1. 총 영향 인구 합계
  const totalPop = ROWS.reduce((sum, r) => sum + (r.pop || 0), 0);
  setText("#k1", totalPop.toLocaleString());

  // 2. 긴급·높음 우선순위 구역 수
  const urgentCount = ROWS.filter(r => r.level === "critical" || r.level === "high").length;
  setText("#k2", urgentCount);

  // 3. 응급의료기관 수 합계
  const totalHosp = ROWS.reduce((sum, r) => sum + (r.hosp || 0), 0);
  setText("#k3", totalHosp.toLocaleString());

  // 4. 예상 평균 정전시간
  const avgDur = (ROWS.reduce((sum, r) => sum + (r.dur || 0), 0) / ROWS.length).toFixed(1);
  setText("#k4", avgDur);
}

function renderMap() {
  if (!map) return;
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const top = getPriorityRows(ROWS);
  ROWS.forEach(r => {
    const color = getScoreColor(r.score);
    const marker = L.circleMarker([r.lat, r.lng], {
      color,
      fillColor: color,
      fillOpacity: 0.8,
      radius: Math.max(8, 16 - (r.rank * 1.2))
    }).addTo(map);

    const isTop = top.some(x => x.id === r.id);
    if (isTop) {
      marker.bindTooltip(`<b>[${r.rank}위] ${r.region}</b><br>${Math.round(r.score)}점`);
    } else {
      marker.bindTooltip(`<b>${r.region}</b><br>${Math.round(r.score)}점`);
    }
    marker.bindPopup(`<b>${r.region}</b><br>우선순위 점수: ${Math.round(r.score)}점<br>복구시간: ${r.dur.toFixed(1)}시간`);
    marker.on("click", () => selectOutage(r.id));
    markers.push(marker);
  });

  if (ROWS.length) {
    const bounds = L.latLngBounds(getPriorityRows(ROWS).map(r => [r.lat, r.lng]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.3));
  }
}

function renderPriority() {
  const top = getPriorityRows(ROWS);
  setHTML("#priorityList", top.map(r => `
    <button class="priority-item ${S.sel === r.id ? "selected" : ""}" onclick="selectOutage('${r.id}')">
      <span class="rank">${r.rank}</span>
      <span class="priority-main"><b>${r.region}</b><small>${r.hosp}개 시설 · ${man(r.pop)}</small></span>
      <span class="mini-bar"><i style="width:${r.score}%;background:${getScoreColor(r.score)}"></i></span>
      <strong style="color:${getScoreColor(r.score)}">${Math.round(r.score)}</strong>
    </button>`).join(""));
}

function renderSelected() {
  const r = ROWS.find(x => x.id === S.sel) || ROWS[0];
  if (!r) return;
  S.sel = r.id;

  setText("#selectedTitle", r.region + " 복구 지점");
  setText("#selectedRank", r.rank + "순위");
  setText("#selectedScore", Math.round(r.score));
  setText("#selectedPeople", man(r.pop));
  setText("#selectedFacilities", r.hosp + "개소");
  setText("#selectedTime", r.dur.toFixed(1) + "시간");
  setText("#selectedCascade", r.cascade);
  setHTML("#selectedReason", r.reason);

  const scoreEl = document.getElementById("selectedScore");
  if (scoreEl) scoreEl.style.color = getScoreColor(r.score);
}

function renderTables() {
  setHTML("#rankTable", ROWS.map(r => `
    <tr onclick="selectOutage('${r.id}')">
      <td>${r.rank}</td>
      <td><b>${r.region}</b></td>
      <td><b>${r.score.toFixed(1)}</b></td>
      <td>${man(r.pop)}</td>
      <td>${r.hosp}개소</td>
      <td>${r.wx.pw}m/s · ${r.wx.pr}mm</td>
      <td>${r.dur.toFixed(1)}h</td>
      <td class="why">${r.reason}</td>
    </tr>`).join(""));
}

function renderScenarios() {
  if (!SC || Object.keys(SC).length === 0) return;

  const keys = ["A", "B", "C"].filter(k => SC[k]);
  REC = keys.sort((a, b) => SC[b].score - SC[a].score)[0] || "A";

  const labels = {
    A: { name: "A. 사회적 피해 최소화" },
    B: { name: "B. 중요시설 우선" },
    C: { name: "C. 네트워크 효율 우선" }
  };

  setHTML("#scenarioCards", keys.map(k => {
    const s = SC[k];
    const d = labels[k];
    const firstRegion = s.order[0] ? s.order[0].region : "-";

    return `
      <div class="scenario ${k === REC ? "recommended" : ""}">
        <div class="scenario-top"><b>${d.name}</b><span>${k === REC ? "최적안" : "비교"}</span></div>
        <strong>${s.score.toFixed(1)}점</strong>
        <div class="scenario-row"><span>전체 복구 완료</span><b>${s.makespan.toFixed(1)}시간</b></div>
        <div class="scenario-row"><span>인구 평균 정전시간</span><b>${s.avgP.toFixed(1)}시간</b></div>
        <div class="scenario-row"><span>병원 평균 복구시간</span><b>${s.avgH.toFixed(1)}시간</b></div>
        <div class="scenario-row"><span>첫 복구 구역</span><b>${firstRegion}</b></div>
        <button onclick="goToScenarioDetail('${k}')">상세 시뮬레이션</button>
      </div>`;
  }).join(""));

  renderSimDetail();
}

function renderSimDetail() {
  const k = S.sc, s = SC[k], K = S.crews;
  if (!s) return;

  $$(".sc-tab").forEach(b => b.classList.toggle("active", b.dataset.sc === k));
  setText("#simScore", s.score.toFixed(1));
  setText("#simTime", s.makespan.toFixed(1) + "시간");
  setText("#simPeople", s.avgP.toFixed(1) + "시간");
  setText("#simHosp", s.avgH.toFixed(1) + "시간");

  const mx = Math.max(...Object.values(s.sc).map(x => x.f)) || 1;
  let g = "";
  for (let c = 0; c < K; c++) {
    g += `<div class="g-row"><span>복구반 ${c + 1}</span><div class="g-track">${
      s.order.filter(r => s.sc[r.id].c === c).map(r => 
        `<i class="g-bar ${r.level}" style="left:${(s.sc[r.id].s / mx) * 100}\%;width:${(r.dur / mx) * 100}%" title="${r.region}"><b>${short(r.region)}</b></i>`
      ).join("")
    }</div></div>`;
  }
  setHTML("#gantt", g + `<div class="g-row"><span></span><div class="g-axis"><em>0h</em><em>${(mx / 2).toFixed(1)}h</em><em>${mx.toFixed(1)}h</em></div></div>`);
}

function renderEmpty() {
  const msg = `<div class="empty-msg">백엔드 서버 연동 중이거나 데이터가 없습니다.</div>`;
  setText("#alertTitle", "백엔드 연결 확인 필요");
  setHTML("#priorityList", msg);
  setHTML("#scenarioCards", msg);
}

function renderAll() {
  renderBanner();
  renderMap();
  renderPriority();
  renderSelected();
  renderTables();
  renderScenarios();
}

/* ── 메인 비동기 업데이트 ── */
async function update() {
  ROWS = await model();
  if (!ROWS.length) return renderEmpty();
  if (!S.sel || !ROWS.find(r => r.id === S.sel)) S.sel = ROWS[0].id;
  SC = scenarios(ROWS);
  renderAll();
}

/* ── 이벤트 바인딩 ── */
function selectOutage(id) {
  S.sel = id;
  renderPriority();
  renderSelected();
  renderTables();
  const r = ROWS.find(x => x.id === id);
  if (map && r) map.panTo([r.lat, r.lng]);
}

function openTab(id) {
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.tab === id));   $$
(".tab-content").forEach(t => t.classList.remove("active"));
  const target = $("#" + id);
  if (target) target.classList.add("active");
  if (id === "tab-dashboard" && map) setTimeout(() => map.invalidateSize(), 100);
}

function goToScenarioDetail(k) {
  S.sc = k;
  renderSimDetail();
  openTab("tab-scenario");
}

function initMap() {
  const el = $("#leafletMap") || $("#map");
  if (!el) return;
  map = L.map(el.id).setView([37.52, 126.98], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
}

function bind() {
  $$(".nav-item").forEach(b => b.addEventListener("click", () => openTab(b.dataset.tab)));   $$
(".sc-tab").forEach(b => b.addEventListener("click", () => { S.sc = b.dataset.sc; renderSimDetail(); }));
}

window.addEventListener("DOMContentLoaded", () => {
  bind();
  initMap();
  update();
});