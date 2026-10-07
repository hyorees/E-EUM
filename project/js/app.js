const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const H = weatherHourly, M = weatherMeta, ST = M.stations;
const pad = n => String(n).padStart(2, "0");
const T0 = (() => { const [d, t] = M.start.split(" "), [y, m, dd] = d.split("-"), [hh, mm] = t.split(":"); return Date.UTC(+y, m - 1, +dd, +hh, +mm); })();
const dateOf = i => new Date(T0 + i * 36e5);
const fmt = i => { const d = dateOf(i); return `${d.getUTCMonth() + 1}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}시`; };
const fmtFull = i => { const d = dateOf(i); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`; };
const toInput = i => fmtFull(i).replace(" ", "T");
const fromInput = v => { const [d, t] = v.split("T"), [y, m, dd] = d.split("-"); return Math.round((Date.UTC(+y, m - 1, +dd, +t.split(":")[0]) - T0) / 36e5); };
const man = n => (n / 1e4).toLocaleString("ko", { maximumFractionDigits: 1 }) + "만 명";
const short = n => n.replace(" 권역", "").replace("수도권 남부", "수도권");
const setText = (s, v) => { const e = $(s); if (e) e.textContent = v; };
const setHTML = (s, v) => { const e = $(s); if (e) e.innerHTML = v; };
const LBL = { pop: "영향 인구", fac: "응급의료기관", wx: "기상 위험" };
const WL = { ok: "양호", warn: "주의", danger: "위험" };

const OUT_DEMO = { 1: 40, 2: 60, 3: 30, 4: 25, 5: 15, 6: 0, 7: 50 };  // 예시값(권역 id → 정전 비율 %)
const S = { t: M.last, w: { pop: 40, fac: 30, wx: 30 }, crews: 3, sc: "A", sel: null, out: { ...OUT_DEMO }, ovr: {}, mode: "auto" };  // mode: auto(기상 추정) / manual(직접 입력) / mixed(추정+보정)
let ROWS = [], SC = {}, REC = "A", map = null, markers = [];

/* ── 기상: 선택 시점 S.t 기준 최근 24시간 ── */
function wxAt(name, i) {
  const h = H[name], lo = Math.max(0, i - 23); let pw = -1, pwi = i, pr = -1, pri = i;
  for (let k = lo; k <= i; k++) {
    if ((h.wm[k] || 0) > pw) { pw = h.wm[k] || 0; pwi = k; }
    if ((h.r[k] || 0) > pr) { pr = h.r[k] || 0; pri = k; }
  }
  return { temp: h.t[i], wind: h.w[i], pw, pws: ST[h.wms[pwi]], pwt: fmt(pwi), pr, prs: ST[h.rs[pri]], prt: fmt(pri), r24: h.r24[i], r24s: ST[h.r24s[i]], n: h.n };
}
const EXT = {};
function extreme(name) {
  if (EXT[name]) return EXT[name];
  const h = H[name]; let w = 0, wi = 0, r = 0, ri = 0;
  for (let k = 0; k < M.n; k++) { if ((h.wm[k] || 0) > w) { w = h.wm[k]; wi = k; } if ((h.r[k] || 0) > r) { r = h.r[k]; ri = k; } }
  return EXT[name] = { w, ws: ST[h.wms[wi]], wt: fmt(wi), r, rs: ST[h.rs[ri]], rt: fmt(ri) };
}

/* ── 기상 → 정전 비율 추정 (임의 가정 곡선: 실제 정전 이력으로 보정 전) ── */
const lin = (v, p) => { if (v <= p[0][0]) return p[0][1]; for (let i = 1; i < p.length; i++) if (v <= p[i][0]) { const [a, b] = p[i - 1], [c, d] = p[i]; return b + (d - b) * (v - a) / (c - a); } return p[p.length - 1][1]; };
function estOut(wx) {
  const w = lin(wx.pw, [[9, 0], [14, 25], [21, 70], [25, 90]]), r = lin(wx.pr, [[10, 0], [30, 15], [50, 30], [100, 50]]);
  return Math.min(95, Math.round((Math.max(w, r) + .3 * Math.min(w, r)) / 5) * 5);   // 큰 값 + 작은 값의 30%, 5% 단위
}
const MODE_LBL = { auto: "기상 자동 추정", manual: "직접 입력", mixed: "추정 + 직접 보정" };
function outInfo(o) {
  const wx = wxAt(o.region, S.t), est = estOut(wx); let pct = est, src = "기상 추정";
  if (S.mode === "manual") { pct = S.out[o.id]; src = "직접 입력"; }
  else if (S.mode === "mixed" && S.ovr[o.id] != null) { pct = S.ovr[o.id]; src = `직접 보정(추정 ${est}%)`; }
  return { wx, est, pct, src };
}

/* ── 우선순위 모델 ── */
function model() {
  const mp = Math.max(...outageData.map(o => o.pop)), mf = Math.max(...outageData.map(o => o.hosp));
  const W = S.w, sw = (W.pop + W.fac + W.wx) || 1;
  const rows = outageData.map(o0 => ({ o0, info: outInfo(o0) })).filter(x => x.info.pct > 0).map(({ o0, info }) => {
    const pct = info.pct, k = pct / 100;
    const o = { ...o0, pct, src: info.src, totPop: o0.pop, totHosp: o0.hosp, pop: o0.pop * k, hosp: Math.max(1, Math.round(o0.hosp * k)) };  // 이후 pop·hosp = 정전 영향분
    const wx = info.wx, pN = o.pop / mp, fN = o.hosp / mf;
    const xN = Math.max(Math.min(1, wx.pw / 21), Math.min(1, wx.pr / 50));
    const part = { pop: 100 * W.pop / sw * pN, fac: 100 * W.fac / sw * fN, wx: 100 * W.wx / sw * xN };
    const score = part.pop + part.fac + part.wx, sc = (pN + fN) / 2;
    return { ...o, wx, pN, fN, xN, part, score,
      level: score >= 70 ? "critical" : score >= 45 ? "high" : score >= 30 ? "mid" : "low",
      wl: (wx.pw >= 14 || wx.pr >= 30) ? "danger" : (wx.pw >= 9 || wx.pr >= 10) ? "warn" : "ok",
      dur: 2 + 3 * sc + 2.5 * xN, cascade: sc >= .6 ? "매우 높음" : sc >= .3 ? "높음" : "보통" };
  }).sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => r.rank = i + 1);
  rows.forEach(r => {
    const top = Object.entries(r.part).sort((a, b) => b[1] - a[1])[0][0];
    let s = `정전 ${r.pct}%(${r.src}) → 영향 인구 ${man(r.pop)}(권역 ${man(r.totPop)}) · 응급의료기관 ${r.hosp}개소(권역 ${r.totHosp}) · 최근 24h 최대풍속 ${r.wx.pw}m/s, 시간강수 ${r.wx.pr}mm → 점수 기여가 가장 큰 항목은 ${LBL[top]}(${r.part[top].toFixed(1)}점).`;
    const nb = rows[r.rank - 2] || rows[1];
    if (nb && nb !== r) {
      const d = Object.keys(LBL).map(k => [k, r.part[k] - nb.part[k]]);
      if (r.rank > 1) { const m = d.sort((a, b) => a[1] - b[1])[0]; s += ` ${nb.region}(${r.rank - 1}위)보다 ${LBL[m[0]]} 항목이 ${Math.abs(m[1]).toFixed(1)}점 낮아 ${r.rank}위입니다.`; }
      else { const m = d.sort((a, b) => b[1] - a[1])[0]; s += ` 2위 ${nb.region}보다 ${LBL[m[0]]} 항목이 ${m[1].toFixed(1)}점 높아 1위입니다.`; }
    }
    r.reason = s;
  });
  return rows;
}

/* ── 복구 시나리오: 복구반 K팀이 구역을 순서대로 맡는 일정 계산 ── */
function metrics(order, K, full) {
  const free = Array(K).fill(0), sc = {}; let D = 0, F = 0, Mk = 0;
  for (const r of order) {
    let c = 0; for (let j = 1; j < K; j++) if (free[j] < free[c]) c = j;
    const s = free[c]; free[c] = s + r.dur;
    D += r.pop / 1e4 * free[c]; F += r.hosp * free[c]; Mk = Math.max(Mk, free[c]);
    if (full) sc[r.id] = { s, f: free[c], c };
  }
  return { D, F, M: Mk, sc };
}
function scenarios(rows) {
  const K = S.crews, mn = [1e18, 1e18, 1e18], mx = [-1, -1, -1];
  (function perm(a, l) {  // 7! = 5040가지 모든 순서로 최선·최악 범위를 구해 0~100점으로 환산
    if (l === a.length) { const m = metrics(a, K); [m.D, m.F, m.M].forEach((v, i) => { mn[i] = Math.min(mn[i], v); mx[i] = Math.max(mx[i], v); }); return; }
    for (let i = l; i < a.length; i++) { [a[l], a[i]] = [a[i], a[l]]; perm(a, l + 1); [a[l], a[i]] = [a[i], a[l]]; }
  })(rows.slice(), 0);
  const ord = { A: [...rows].sort((a, b) => b.score / b.dur - a.score / a.dur), B: [...rows].sort((a, b) => b.hosp - a.hosp || b.score - a.score), C: [...rows].sort((a, b) => a.dur - b.dur) };
  const totP = rows.reduce((s, r) => s + r.pop / 1e4, 0), totH = rows.reduce((s, r) => s + r.hosp, 0), out = {};
  for (const k in ord) {
    const m = metrics(ord[k], K, true), nz = (v, i) => mx[i] > mn[i] ? (v - mn[i]) / (mx[i] - mn[i]) : 0;
    out[k] = { k, order: ord[k], sc: m.sc, makespan: m.M, avgP: m.D / totP, avgH: m.F / totH,
      score: 100 * (.5 * (1 - nz(m.D, 0)) + .3 * (1 - nz(m.F, 1)) + .2 * (1 - nz(m.M, 2))) };
  }
  out.totP = totP; return out;
}

/* ── 렌더링 ── */
function renderBanner() {
  const mw = [...ROWS].sort((a, b) => b.wx.pw - a.wx.pw)[0], mr = [...ROWS].sort((a, b) => b.wx.pr - a.wx.pr)[0];
  const bad = ROWS.filter(r => r.wl !== "ok").length;
  setText("#alertTitle", `${fmtFull(S.t)} 기준 기상·정전 영향 분석`);
  setText("#alertSub", `최근 24시간 최대풍속 ${mw.wx.pw}m/s(${mw.wx.pws}) · 최대 시간강수 ${mr.wx.pr}mm(${mr.wx.prs}) · 기상 주의 이상 ${bad}개 권역 · 정전 비율: ${MODE_LBL[S.mode]}`);
  setText("#aZones", ROWS.length); setText("#aFac", ROWS.reduce((s, r) => s + r.hosp, 0));
  setText("#aPop", man(ROWS.reduce((s, r) => s + r.pop, 0)).replace(" 명", ""));
  const rec = SC[REC];
  setText("#k1", man(ROWS.reduce((s, r) => s + r.pop, 0)).replace("만 명", "만"));
  setText("#k1s", `최대 ${ROWS[0].region} ${man(Math.max(...ROWS.map(r => r.pop)))}`);
  setText("#k2", ROWS.filter(r => r.level === "critical" || r.level === "high").length);
  setText("#k2s", `최상위: ${ROWS[0].region} (${ROWS[0].score.toFixed(0)}점)`);
  setText("#k3", ROWS.reduce((s, r) => s + r.hosp, 0));
  setText("#k3s", `기상 위험 권역 ${ROWS.filter(r => r.wl === "danger").length} · 주의 ${ROWS.filter(r => r.wl === "warn").length}`);
  setText("#k4", rec.avgP.toFixed(1)); setText("#k4s", `${scenarioData[REC].name} 기준 (인구 가중)`);
}
function renderMap() {
  if (!map) return; markers.forEach(m => map.removeLayer(m)); markers = [];
  ROWS.forEach(r => {
    const icon = L.divIcon({ className: `custom-map-marker ${r.level}`, html: `<span>${Math.round(r.score)}</span>`, iconSize: [28, 28] });
    const m = L.marker([r.lat, r.lng], { icon }).addTo(map);
    m.bindTooltip(`<div class="wx-tip"><b>${r.region}</b> · ${r.rank}위 (${r.score.toFixed(1)}점)<br>풍속 최대 ${r.wx.pw}m/s · 시간강수 ${r.wx.pr}mm · 기상 ${WL[r.wl]}</div>`, { direction: "top", offset: [0, -10] });
    m.on("click", () => selectOutage(r.id)); markers.push(m);
  });
}
function renderPriority() {
  setHTML("#priorityList", ROWS.slice(0, 5).map(r => `
    <button class="priority-item ${S.sel === r.id ? "selected" : ""}" onclick="selectOutage(${r.id})">
      <span class="rank">${r.rank}</span><span class="priority-main"><b>${r.region}</b><small>${r.hosp}개 시설 · ${man(r.pop)}</small></span>
      <span class="mini-bar"><i style="width:${r.score}%"></i></span><strong>${Math.round(r.score)}</strong></button>`).join(""));
}
const stack = r => `<span class="stack" title="인구 ${r.part.pop.toFixed(1)} / 시설 ${r.part.fac.toFixed(1)} / 기상 ${r.part.wx.toFixed(1)}"><i class="s-pop" style="width:${r.part.pop}%"></i><i class="s-fac" style="width:${r.part.fac}%"></i><i class="s-wx" style="width:${r.part.wx}%"></i></span>`;
function renderSelected() {
  const r = ROWS.find(x => x.id === S.sel) || ROWS[0]; S.sel = r.id;
  setText("#selectedTitle", r.region + " 정전"); setText("#selectedRank", r.rank + "순위");
  setText("#selectedScore", Math.round(r.score)); setText("#selectedPeople", man(r.pop));
  setText("#selectedFacilities", r.hosp + "개"); setText("#selectedTime", r.dur.toFixed(1) + "시간"); setText("#selectedCascade", r.cascade);
  setHTML("#selectedReason", `${stack(r)}<div class="stack-legend"><i class="s-pop"></i>인구 ${r.part.pop.toFixed(1)}<i class="s-fac"></i>시설 ${r.part.fac.toFixed(1)}<i class="s-wx"></i>기상 ${r.part.wx.toFixed(1)}</div>${r.reason}`);
}
function renderWeather() {
  const r = ROWS.find(x => x.id === S.sel), w = r.wx, h = H[r.region], e = extreme(r.region);
  setText("#weatherTitle", `${r.region} 기상 현황`);
  const b = $("#weatherLevel"); b.textContent = `기상 ${WL[r.wl]}`; b.className = `wx-badge ${r.wl}`;
  setText("#weatherTime", `${fmtFull(S.t)} 관측 · 지점 ${w.n}개`);
  setText("#wxTemp", w.temp == null ? "-" : w.temp + "℃"); setText("#wxWind", (w.wind ?? "-") + " m/s");
  setText("#wxWindSub", `권역 평균 · 최대 ${h.wm[S.t]}m/s (${ST[h.wms[S.t]]})`);
  setText("#wxRain", h.r[S.t] + " mm"); setText("#wxRainSub", `시간당 · 최대 지점 ${ST[h.rs[S.t]]}`);
  setText("#wxPeakWind", w.pw + " m/s"); setText("#wxPeakWindSub", `${w.pws} · ${w.pwt}`);
  setText("#wxPeakRain", w.pr + " mm/h"); setText("#wxPeakRainSub", `${w.prs} · 24h 누적 최대 ${w.r24}mm (${w.r24s})`);
  setText("#wxExtreme", `${M.start.slice(0, 10)} ~ ${fmtFull(M.last).slice(0, 10)} 중 최대풍속 ${e.w}m/s (${e.ws}, ${e.wt}) · 최대 시간강수 ${e.r}mm (${e.rs}, ${e.rt})`);
  const ser = []; for (let k = Math.max(0, S.t - 23); k <= S.t; k++) ser.push({ t: fmt(k).split(" ")[1], windAvg: h.w[k] || 0, windMax: h.wm[k] || 0, rainMax: h.r[k] || 0 });
  drawWeatherChart(ser);
}
function drawWeatherChart(series) {
  const W = 600, Hh = 170, L = 34, R = 34, T = 12, B = 22, cw = W - L - R, ch = Hh - T - B, n = series.length, step = cw / n;
  const wMax = Math.max(15, Math.ceil(Math.max(...series.map(s => s.windMax)) / 5) * 5), rMax = Math.max(10, Math.ceil(Math.max(...series.map(s => s.rainMax)) / 10) * 10);
  const yW = v => T + ch - v / wMax * ch, xC = i => L + step * i + step / 2; let g = "";
  for (let i = 0; i <= 4; i++) { const y = T + ch / 4 * i; g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3 3"/><text x="${L - 6}" y="${y + 3}" text-anchor="end">${Math.round(wMax - wMax / 4 * i)}</text><text x="${W - R + 6}" y="${y + 3}">${Math.round(rMax - rMax / 4 * i)}</text>`; }
  g += `<text x="${L - 6}" y="${T - 3}" text-anchor="end">m/s</text><text x="${W - R + 6}" y="${T - 3}">mm</text><line x1="${L}" x2="${W - R}" y1="${yW(14)}" y2="${yW(14)}" stroke="#e11d48" stroke-dasharray="5 3" opacity=".7"/><text x="${W - R - 2}" y="${yW(14) - 3}" text-anchor="end" style="fill:#e11d48">강풍 14m/s</text>`;
  const bars = series.map((s, i) => { const h = s.rainMax / rMax * ch; return `<rect x="${xC(i) - step * .3}" y="${T + ch - h}" width="${step * .6}" height="${h}" rx="2" fill="#7dd3fc"><title>${s.t} 강수 ${s.rainMax}mm</title></rect>`; }).join("");
  const ln = k => series.map((s, i) => `${i ? "L" : "M"}${xC(i).toFixed(1)} ${yW(s[k]).toFixed(1)}`).join(" ");
  const lb = series.map((s, i) => i % 3 === 0 || i === n - 1 ? `<text x="${xC(i)}" y="${Hh - 6}" text-anchor="middle">${s.t}</text>` : "").join("");
  setHTML("#weatherChart", `<svg viewBox="0 0 ${W} ${Hh}">${g}${bars}<path d="${ln("windAvg")}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="4 3"/><path d="${ln("windMax")}" fill="none" stroke="#0284c7" stroke-width="2.5"/>${lb}</svg>`);
}
function renderTables() {
  setHTML("#weatherTable", ROWS.map(r => `<tr class="${S.sel === r.id ? "selected" : ""}" onclick="selectOutage(${r.id})"><td>${r.region}</td><td>${r.wx.temp ?? "-"}℃</td><td>${r.wx.wind ?? "-"}<small>m/s</small></td><td>${r.wx.pw}<small>${r.wx.pws}</small></td><td>${r.wx.pr}<small>${r.wx.prs}</small></td><td><span class="wx-badge ${r.wl}">${WL[r.wl]}</span></td></tr>`).join(""));
  setHTML("#impactTable", ROWS.map(r => { const e = extreme(r.region); return `<tr onclick="selectOutage(${r.id});openTab('tab-dashboard')"><td>${r.region}</td><td>${r.score.toFixed(1)}</td><td>${man(r.pop)}</td><td>${r.wx.temp ?? "-"}℃</td><td>${r.wx.wind ?? "-"} m/s</td><td>${r.wx.pw} m/s<small>${r.wx.pws}</small></td><td>${r.wx.pr} mm<small>${r.wx.prs}</small></td><td>${r.wx.r24} mm<small>${r.wx.r24s}</small></td><td>${e.w} m/s<small>${e.ws} · ${e.wt}</small></td><td>${e.r} mm<small>${e.rs} · ${e.rt}</small></td><td><span class="wx-badge ${r.wl}">${WL[r.wl]}</span></td></tr>`; }).join(""));
  setHTML("#rankTable", ROWS.map(r => `<tr onclick="selectOutage(${r.id})"><td>${r.rank}</td><td>${r.region}</td><td><b>${r.score.toFixed(1)}</b>${stack(r)}</td><td>${man(r.pop)}<small>+${r.part.pop.toFixed(1)}점</small></td><td>${r.hosp}개<small>+${r.part.fac.toFixed(1)}점</small></td><td>${r.wx.pw}m/s · ${r.wx.pr}mm<small>+${r.part.wx.toFixed(1)}점 · ${WL[r.wl]}</small></td><td>${r.dur.toFixed(1)}h</td><td class="why">${r.reason}</td></tr>`).join(""));
}
function renderScenarios() {
  REC = Object.keys(scenarioData).sort((a, b) => SC[b].score - SC[a].score)[0];
  setHTML("#scenarioCards", Object.keys(scenarioData).map(k => { const s = SC[k], d = scenarioData[k]; return `
    <div class="scenario ${k === REC ? "recommended" : ""}"><div class="scenario-top"><b>${d.name}</b><span>${k === REC ? "최적안" : "비교"}</span></div><strong>${s.score.toFixed(1)}점</strong>
    <div class="scenario-row"><span>전체 복구 완료</span><b>${s.makespan.toFixed(1)}시간</b></div>
    <div class="scenario-row"><span>인구 평균 정전시간</span><b>${s.avgP.toFixed(1)}시간</b></div>
    <div class="scenario-row"><span>병원 평균 복구시간</span><b>${s.avgH.toFixed(1)}시간</b></div>
    <div class="scenario-row"><span>첫 복구 구역</span><b>${short(s.order[0].region)}</b></div>
    <button onclick="goToScenarioDetail('${k}')">상세 시뮬레이션</button></div>`; }).join(""));
  // 잔여 영향 인구 추이
  const mx = Math.max(...Object.keys(scenarioData).map(k => SC[k].makespan)), tot = SC.totP, col = { A: "#0284c7", B: "#f97316", C: "#64748b" };
  let svg = `<svg viewBox="0 0 620 170" preserveAspectRatio="none">`;
  for (let i = 0; i <= 4; i++) svg += `<line x1="40" x2="610" y1="${10 + 120 * i / 4}" y2="${10 + 120 * i / 4}" stroke="#e2e8f0" stroke-dasharray="3 3"/><text x="36" y="${14 + 120 * i / 4}" text-anchor="end" style="font-size:9px;fill:#94a3b8">${Math.round(tot * (1 - i / 4)).toLocaleString()}</text>`;
  for (let i = 0; i <= 4; i++) svg += `<text x="${40 + 570 * i / 4}" y="150" text-anchor="middle" style="font-size:9px;fill:#94a3b8">${(mx * i / 4).toFixed(0)}h</text>`;
  Object.keys(scenarioData).forEach(k => {
    const ev = SC[k].order.map(r => [SC[k].sc[r.id].f, r.pop / 1e4]).sort((a, b) => a[0] - b[0]); let rem = tot, x = 0, p = `M40 10`;
    ev.forEach(([f, pp]) => { const px = 40 + 570 * f / mx; p += ` L${px} ${10 + 120 * (1 - rem / tot)} `; rem -= pp; p += `L${px} ${10 + 120 * (1 - rem / tot)}`; });
    svg += `<path d="${p}" fill="none" stroke="${col[k]}" stroke-width="${k === REC ? 3 : 1.8}"/>`;
  });
  setHTML("#impactChart", svg + `</svg><div class="wx-legend" style="padding:0 16px">${Object.keys(scenarioData).map(k => `<span style="color:${col[k]}">━ ${k}. ${scenarioData[k].short}</span>`).join("")}</div>`);
  setText("#impactMax", `${Math.round(tot).toLocaleString()}만 명`);
  setText("#impactNote", `${REC}안은 정전 인구가 가장 빨리 줄어듭니다 (인구 평균 정전시간 ${SC[REC].avgP.toFixed(1)}h).`);
  renderSimDetail();
}
function renderSimDetail() {
  const k = S.sc, s = SC[k], d = scenarioData[k], K = S.crews;
  $$(".sc-tab").forEach(b => b.classList.toggle("active", b.dataset.sc === k));
  setText("#simName", d.name); setText("#simScore", s.score.toFixed(1)); setText("#simTime", s.makespan.toFixed(1) + "시간");
  setText("#simPeople", s.avgP.toFixed(1) + "시간"); setText("#simHosp", s.avgH.toFixed(1) + "시간"); setText("#simDesc", d.desc);
  setText("#crewsVal", K + "팀"); setText("#scenarioDetailDesc", `분석 시점 ${fmtFull(S.t)} · 복구반 ${K}팀 기준. 복구 소요시간 = 2h + 규모(인구·시설) 3h + 기상 지연 2.5h(풍속·강수에 비례).`);
  const mx = Math.max(...Object.values(s.sc).map(x => x.f)); let g = "";
  for (let c = 0; c < K; c++) g += `<div class="g-row"><span>복구반 ${c + 1}</span><div class="g-track">${s.order.filter(r => s.sc[r.id].c === c).map(r => `<i class="g-bar ${r.level}" style="left:${s.sc[r.id].s / mx * 100}%;width:${r.dur / mx * 100}%" title="${r.region} ${s.sc[r.id].s.toFixed(1)}~${s.sc[r.id].f.toFixed(1)}h"><b>${short(r.region)}</b></i>`).join("")}</div></div>`;
  setHTML("#gantt", g + `<div class="g-row"><span></span><div class="g-axis"><em>0h</em><em>${(mx / 2).toFixed(1)}h</em><em>${mx.toFixed(1)}h</em></div></div>`);
  const ks = Object.keys(scenarioData), best = f => ks.reduce((a, b) => SC[b][f] < SC[a][f] ? b : a);
  const cmp = (f, nm) => (best(f) === k || s[f] - SC[best(f)][f] < 0.05) ? `${nm} ${s[f].toFixed(1)}h로 3개안 중 최단` : `${nm} ${s[f].toFixed(1)}h (최단 ${best(f)}안 ${SC[best(f)][f].toFixed(1)}h보다 +${(s[f] - SC[best(f)][f]).toFixed(1)}h)`;
  setHTML("#simWhy", `<b>이 결과가 나온 이유</b><ul><li>복구 순서 규칙: <b>${d.rule}</b> → ${s.order.map((r, i) => `${i + 1}.${short(r.region)}`).join(" ")}</li>
    <li>${cmp("avgP", "인구 평균 정전시간")} · ${cmp("avgH", "병원 평균 복구시간")} · ${cmp("makespan", "전체 복구 완료")}</li>
    <li>점수 = 인구 정전시간 50% + 병원 복구시간 30% + 전체 완료시간 20%를 <b>가능한 모든 복구 순서(5,040가지)의 최선~최악</b> 범위에서 0~100점으로 환산한 값입니다.</li>
    <li>현재 최적안은 <b>${REC}안</b>입니다. 복구반 수·기상 시점·우선순위 가중치를 바꾸면 결과가 달라집니다.</li></ul>`);
}
function renderAll() {
  renderBanner(); renderMap(); renderPriority(); renderSelected(); renderWeather(); renderTables(); renderScenarios();
  $("#wxTime").value = toInput(S.t);
  const p = weatherEvents.findIndex(e => e.i === S.t); $("#wxPreset").value = p >= 0 ? p : "";
}
function refreshOutLabels() {
  outageData.forEach(o => {
    const i = outInfo(o), el = document.querySelector(`#outageInputs input[data-id="${o.id}"]`);
    if (el) { el.value = i.pct; el.disabled = S.mode === "auto"; }
    setText("#outV" + o.id, i.pct ? `${i.pct}% · ${man(o.pop * i.pct / 100)} · ${i.src}` : `정전 없음 (추정 ${i.est}%)`);
  });
}
function renderOutInputs() {
  setHTML("#outageInputs", outageData.map(o => `<div class="out-row"><b>${o.region}</b><input type="range" min="0" max="100" step="5" value="0" data-id="${o.id}"><span id="outV${o.id}"></span></div>`).join(""));
  $$("#outageInputs input").forEach(i => i.addEventListener("input", e => {
    const id = +e.target.dataset.id, v = +e.target.value;
    if (S.mode === "manual") S.out[id] = v; else if (S.mode === "mixed") S.ovr[id] = v;
    update();
  }));
}
function setMode(m) { S.mode = m; $$('input[name="outMode"]').forEach(r => r.checked = r.value === m); update(); }
function setOut(f) { outageData.forEach(o => S.out[o.id] = f(o)); setMode("manual"); }
function renderEmpty() {
  const msg = `<div class="empty-msg">정전이 입력된 권역이 없습니다. '복구 우선순위' 탭에서 정전 상황을 입력하세요.</div>`;
  setText("#alertTitle", `${fmtFull(S.t)} 기준 · 정전 구역 없음`); setText("#alertSub", "정전 비율을 입력하면 우선순위와 시나리오가 계산됩니다.");
  ["#aZones", "#aFac", "#aPop", "#k1", "#k2", "#k3", "#k4"].forEach(i => setText(i, "-"));
  ["#priorityList", "#scenarioCards", "#impactChart", "#gantt", "#simWhy"].forEach(i => setHTML(i, msg));
  ["#rankTable", "#weatherTable", "#impactTable"].forEach(i => setHTML(i, `<tr><td colspan="11">${msg}</td></tr>`));
  setText("#selectedTitle", "정전 구역 없음"); renderMap();
}
function update() { ROWS = model(); refreshOutLabels(); if (!ROWS.length) return renderEmpty(); SC = scenarios(ROWS); renderAll(); }

/* ── 이벤트 ── */
function selectOutage(id) { S.sel = id; renderPriority(); renderSelected(); renderWeather(); renderTables(); const r = ROWS.find(x => x.id === id); if (map) map.panTo([r.lat, r.lng]); showToast(`${r.region} 선택 - 상세 데이터를 불러왔습니다.`); }
function openTab(id) { $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.tab === id)); $$(".tab-content").forEach(t => t.classList.remove("active")); $("#" + id).classList.add("active"); if (id === "tab-dashboard" && map) setTimeout(() => map.invalidateSize(), 100); }
function goToScenarioDetail(k) { S.sc = k; renderSimDetail(); openTab("tab-scenario"); }
function showToast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(window.tt); window.tt = setTimeout(() => t.classList.remove("show"), 2200); }
function initMap() {
  map = L.map("leafletMap").setView([36.2, 127.8], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
  fetch("data/korea.json").then(r => r.json()).then(g => L.geoJSON(g, { style: { color: "#0284c7", weight: 2.5, opacity: .9, fillColor: "#0284c7", fillOpacity: .12 } }).addTo(map)).catch(e => console.log("GeoJSON 로드 실패:", e));
}
function bind() {
  $$(".nav-item").forEach(b => b.addEventListener("click", () => openTab(b.dataset.tab)));
  $("#sidebarToggle").addEventListener("click", () => { $("#sidebar").classList.toggle("collapsed"); if (map) setTimeout(() => map.invalidateSize(), 250); });
  $("#wxTime").min = toInput(0); $("#wxTime").max = toInput(M.last);
  $("#wxPreset").innerHTML = `<option value="">직접 선택</option>` + weatherEvents.map((e, i) => `<option value="${i}">${e.label}</option>`).join("");
  $("#wxTime").addEventListener("change", e => { if (e.target.value) { S.t = Math.min(M.last, Math.max(0, fromInput(e.target.value))); update(); } });
  $("#wxPreset").addEventListener("change", e => { if (e.target.value !== "") { S.t = weatherEvents[+e.target.value].i; update(); } });
  $("#wxLatest").addEventListener("click", () => { S.t = M.last; update(); });
  [["wPop", "pop"], ["wFac", "fac"], ["wWx", "wx"]].forEach(([id, k]) => $("#" + id).addEventListener("input", e => { S.w[k] = +e.target.value; setText("#" + id + "V", e.target.value); update(); }));
  $("#crews").addEventListener("input", e => { S.crews = +e.target.value; update(); });
  $$(".sc-tab").forEach(b => b.addEventListener("click", () => { S.sc = b.dataset.sc; renderSimDetail(); }));
}
function bindOut() {
  renderOutInputs();
  $$('input[name="outMode"]').forEach(r => r.addEventListener("change", e => setMode(e.target.value)));
  $("#outAll").addEventListener("click", () => setOut(() => 100));
  $("#outNone").addEventListener("click", () => setOut(() => 0));
  $("#outDemo").addEventListener("click", () => setOut(o => OUT_DEMO[o.id]));
  $("#outReset").addEventListener("click", () => { S.ovr = {}; update(); });
}
window.addEventListener("DOMContentLoaded", () => { bind(); bindOut(); initMap(); update(); });