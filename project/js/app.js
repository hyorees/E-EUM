const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let selected = outageData[0];
let map = null;
let mapMarkers = [];

// 기상 데이터가 없어도 기존 화면이 깨지지 않도록 방어
const WX = (typeof weatherData !== "undefined") ? weatherData : {};
const WX_META = (typeof weatherMeta !== "undefined") ? weatherMeta : {};
const wxOf = region => WX[region] || null;

/* ───────── 1. Leaflet 지도 + GeoJSON ───────── */
function initMap(){
  const mapContainer = $("#leafletMap");
  if(!mapContainer) return;

  map = L.map('leafletMap').setView([36.2, 127.8], 7);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  fetch('data/korea.json')
    .then(r => r.json())
    .then(geo => {
      L.geoJSON(geo, {
        style: { color:'#0284c7', weight:2.5, opacity:0.9, fillColor:'#0284c7', fillOpacity:0.12 }
      }).addTo(map);
    })
    .catch(err => console.log('GeoJSON 로드 실패 (파일 경로 확인 필요):', err));

  renderMapMarkers();
}

/* ───────── 2. 지도 마커 (기상 위험도 링 + 툴팁) ───────── */
function markerTooltip(o){
  const w = wxOf(o.region);
  if(!w) return `<b>${o.region}</b>`;
  return `<div class="wx-tip"><b>${o.region}</b><br>
    기온 ${w.current.temp}℃ · 풍속 ${w.current.wind}m/s<br>
    24h 최대풍속 ${w.peak24.wind}m/s · 시간강수 ${w.peak24.rain1h}mm<br>
    기상 상태: <b>${w.levelText}</b></div>`;
}

function renderMapMarkers(){
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  outageData.forEach(o => {
    const wxCls = o.weatherLevel && o.weatherLevel !== "ok" ? ` wx-${o.weatherLevel}` : "";
    const icon = L.divIcon({
      className: `custom-map-marker ${o.level}${wxCls}`,
      html: `<span>${o.score}</span>`,
      iconSize: [28, 28]
    });
    const marker = L.marker([o.lat, o.lng], {icon}).addTo(map);
    marker.bindTooltip(markerTooltip(o), {direction:'top', offset:[0,-10]});
    marker.on('click', () => selectOutage(o.id));
    mapMarkers.push(marker);
  });
}

/* ───────── 3. 복구 우선순위 TOP 5 ───────── */
function renderPriority(){
  const list = $("#priorityList");
  if(!list) return;

  const sorted = [...outageData].sort((a,b) => b.score - a.score).slice(0, 5);
  list.innerHTML = sorted.map((o, i) => `
    <button class="priority-item ${selected.id === o.id ? 'selected' : ''}" onclick="selectOutage(${o.id})">
      <span class="rank">${i + 1}</span>
      <span class="priority-main"><b>${o.region}</b><small>${o.facilities}개 시설 · ${o.people}</small></span>
      <span class="mini-bar"><i style="width:${o.score}%"></i></span>
      <strong>${o.score}</strong>
    </button>`).join("");
}

/* ───────── 4. 기상 패널 ───────── */
function setText(sel, v){ const el = $(sel); if(el) el.textContent = v; }

function renderWeather(){
  const w = wxOf(selected.region);
  if(!w){
    setText("#weatherTitle", `${selected.region} 기상 현황`);
    setText("#weatherLevel", "데이터 없음");
    return;
  }
  const c = w.current, p = w.peak24;

  setText("#weatherTitle", `${selected.region} 기상 현황`);
  const badge = $("#weatherLevel");
  if(badge){ badge.textContent = `기상 ${w.levelText}`; badge.className = `wx-badge ${w.level}`; }
  setText("#weatherTime", `${WX_META.updated || ""} 관측 · 지점 ${w.stationCount}개`);

  setText("#wxTemp", `${c.temp}℃`);
  setText("#wxWind", `${c.wind} m/s`);
  setText("#wxWindSub", `${c.wdir}풍 · 최대 ${c.windMax}m/s (${c.windMaxStn})`);
  setText("#wxRain", `${c.rain} mm`);
  setText("#wxPeakWind", `${p.wind} m/s`);
  setText("#wxPeakWindSub", `${p.windStn} · ${p.windTime}`);
  setText("#wxPeakRain", `${p.rain1h} mm/h`);
  setText("#wxPeakRainSub", `${p.rain1hStn} · 24h 누적 최대 ${p.rain24}mm (${p.rain24Stn})`);

  const e = w.extreme;
  setText("#wxExtreme",
    `${WX_META.periodStart || ""} ~ ${WX_META.periodEnd || ""} 중 최대풍속 ${e.wind}m/s (${e.windStn}, ${e.windTime}) · 최대 시간강수 ${e.rain1h}mm (${e.rain1hStn}, ${e.rainTime})`);

  drawWeatherChart(w.series);
}

// 최근 24시간: 막대 = 강수(권역 내 최대 지점), 실선 = 풍속 최대, 점선 = 풍속 평균
function drawWeatherChart(series){
  const box = $("#weatherChart");
  if(!box) return;
  if(!series || !series.length){ box.innerHTML = ""; return; }

  const W = 600, H = 170, L = 34, R = 34, T = 12, B = 22;
  const cw = W - L - R, ch = H - T - B;
  const n = series.length;
  const step = cw / n;

  const wMax = Math.max(15, Math.ceil(Math.max(...series.map(s => s.windMax)) / 5) * 5);
  const rMax = Math.max(10, Math.ceil(Math.max(...series.map(s => s.rainMax)) / 10) * 10);
  const yW = v => T + ch - (v / wMax) * ch;
  const yR = v => T + ch - (v / rMax) * ch;
  const xC = i => L + step * i + step / 2;

  let g = "";
  for(let i = 0; i <= 4; i++){
    const y = T + (ch / 4) * i;
    g += `<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3 3"/>`;
    g += `<text x="${L-6}" y="${y+3}" text-anchor="end">${Math.round(wMax - (wMax/4)*i)}</text>`;
    g += `<text x="${W-R+6}" y="${y+3}" text-anchor="start">${Math.round(rMax - (rMax/4)*i)}</text>`;
  }
  g += `<text x="${L-6}" y="${T-3}" text-anchor="end">m/s</text><text x="${W-R+6}" y="${T-3}">mm</text>`;

  // 강풍주의보 기준선 14m/s
  if(wMax >= 14){
    const y14 = yW(14);
    g += `<line x1="${L}" x2="${W-R}" y1="${y14}" y2="${y14}" stroke="#e11d48" stroke-width="1" stroke-dasharray="5 3" opacity=".7"/>`;
    g += `<text x="${W-R-2}" y="${y14-3}" text-anchor="end" style="fill:#e11d48">강풍 14m/s</text>`;
  }

  const bars = series.map((s,i) => {
    const h = (s.rainMax / rMax) * ch;
    return `<rect x="${xC(i) - step*0.3}" y="${T + ch - h}" width="${step*0.6}" height="${Math.max(h,0)}" rx="2" fill="#7dd3fc"><title>${s.t} 강수 ${s.rainMax}mm</title></rect>`;
  }).join("");

  const line = key => series.map((s,i) => `${i ? "L" : "M"}${xC(i).toFixed(1)} ${yW(s[key]).toFixed(1)}`).join(" ");
  const lines =
    `<path d="${line('windAvg')}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="4 3"/>` +
    `<path d="${line('windMax')}" fill="none" stroke="#0284c7" stroke-width="2.5"/>`;

  const labels = series.map((s,i) => (i % 3 === 0 || i === n-1)
    ? `<text x="${xC(i)}" y="${H-6}" text-anchor="middle">${s.t}</text>` : "").join("");

  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 24시간 풍속 및 강수 추이">${g}${bars}${lines}${labels}</svg>`;
}

function renderWeatherTables(){
  const sorted = [...outageData].sort((a,b) => b.score - a.score);

  const t1 = $("#weatherTable");
  if(t1){
    t1.innerHTML = sorted.map(o => {
      const w = wxOf(o.region);
      if(!w) return `<tr onclick="selectOutage(${o.id})"><td>${o.region}</td><td colspan="5">데이터 없음</td></tr>`;
      return `<tr class="${selected.id === o.id ? 'selected' : ''}" onclick="selectOutage(${o.id})">
        <td>${o.region}</td>
        <td>${w.current.temp}℃</td>
        <td>${w.current.wind}<small>m/s</small></td>
        <td>${w.peak24.wind}<small>${w.peak24.windStn}</small></td>
        <td>${w.peak24.rain1h}<small>${w.peak24.rain1hStn}</small></td>
        <td><span class="wx-badge ${w.level}">${w.levelText}</span></td>
      </tr>`;
    }).join("");
  }

  const t2 = $("#impactTable");
  if(t2){
    t2.innerHTML = sorted.map(o => {
      const w = wxOf(o.region);
      if(!w) return `<tr><td>${o.region}</td><td>${o.score}</td><td>${o.people}</td><td colspan="8">기상 데이터 없음</td></tr>`;
      return `<tr onclick="selectOutage(${o.id}); openTab('tab-dashboard')">
        <td>${o.region}</td>
        <td>${o.score}</td>
        <td>${o.people}</td>
        <td>${w.current.temp}℃</td>
        <td>${w.current.wind} m/s</td>
        <td>${w.peak24.wind} m/s<small>${w.peak24.windStn}</small></td>
        <td>${w.peak24.rain1h} mm<small>${w.peak24.rain1hStn}</small></td>
        <td>${w.peak24.rain24} mm<small>${w.peak24.rain24Stn}</small></td>
        <td>${w.extreme.wind} m/s<small>${w.extreme.windStn} · ${w.extreme.windTime}</small></td>
        <td>${w.extreme.rain1h} mm<small>${w.extreme.rain1hStn} · ${w.extreme.rainTime}</small></td>
        <td><span class="wx-badge ${w.level}">${w.levelText}</span></td>
      </tr>`;
    }).join("");
  }
}

/* ───────── 5. 정전 구역 선택 ───────── */
function selectOutage(id){
  selected = outageData.find(x => x.id === id);
  if(!selected) return;

  setText("#selectedTitle", selected.region + " 정전");
  setText("#selectedRank", `${outageData.slice().sort((a,b) => b.score - a.score).findIndex(x => x.id === id) + 1}순위`);
  setText("#selectedScore", selected.score);
  setText("#selectedPeople", selected.people);
  setText("#selectedFacilities", selected.facilities + "개");
  setText("#selectedTime", selected.time);
  setText("#selectedCascade", selected.cascade);
  setText("#selectedReason", selected.reason);

  if(map) map.panTo([selected.lat, selected.lng]);
  renderPriority();
  renderWeather();
  renderWeatherTables();
  showToast(`${selected.region} 선택 - 상세 데이터를 불러왔습니다.`);
}

/* ───────── 6. 탭 이동 / 시나리오 ───────── */
function openTab(tabId){
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
  $$(".tab-content").forEach(tab => tab.classList.remove("active"));
  const el = $(`#${tabId}`);
  if(el) el.classList.add("active");
  if(tabId === "tab-dashboard" && map) setTimeout(() => map.invalidateSize(), 100);
}

function goToScenarioDetail(key){
  const s = scenarioData[key];
  if(!s) return;
  openTab("tab-scenario");
  setText("#simName", s.name);
  setText("#simScore", s.score);
  setText("#simTime", s.time);
  setText("#simPeople", s.people);
  setText("#simDesc", s.desc);
  showToast(`시나리오 [${s.name}] 상세 시뮬레이션 화면으로 이동했습니다.`);
}

/* ───────── 7. 토스트 / 이벤트 ───────── */
function showToast(msg){
  const t = $("#toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function bindNavEvents(){
  $$(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => openTab(btn.getAttribute("data-tab")));
  });

  const toggleBtn = $("#sidebarToggle");
  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      const sidebar = $("#sidebar");
      if(sidebar) sidebar.classList.toggle("collapsed");
      if(map) setTimeout(() => map.invalidateSize(), 250);
    });
  }
}

/* ───────── 8. 초기화 ───────── */
window.addEventListener("DOMContentLoaded", () => {
  bindNavEvents();
  initMap();
  renderPriority();
  renderWeather();
  renderWeatherTables();
  if(WX_META.updated) setText("#topUpdate", `기상 관측 기준: ${WX_META.updated}`);
});