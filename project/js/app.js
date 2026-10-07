const $ = s => document.querySelector(s); const $$ = s => document.querySelectorAll(s);

let selected = outageData[0];
let map = null;
let mapMarkers = [];

// 1. Leaflet 상세 지도 및 행정구역 GeoJSON 경계선 초기화
function initMap(){
  const mapContainer = $("#leafletMap");
  if(mapContainer){
    map = L.map('leafletMap').setView([36.2, 127.8], 7);

    // 타일 지도 배경
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    // 행정구역 GeoJSON 경계 데이터 불러오기
    fetch('data/korea.json')
      .then(response => response.json())
      .then(geoJsonData => {
        L.geoJSON(geoJsonData, {
          style: {
            color: '#0284c7',       // 경계선 색상 (진한 파란색)
            weight: 2.5,            // 경계선 두께 (1.5 -> 2.5로 상향)
            opacity: 0.9,           // 선 불투명도
            fillColor: '#0284c7',   // 영역 내부 채우기 색상
            fillOpacity: 0.12       // 내부 투명도
          }
        }).addTo(map);
      })
      .catch(err => console.log('GeoJSON 로드 실패 (파일 경로 확인 필요):', err));

    renderMapMarkers();
  }
}

// 2. 지도 마커 생성
function renderMapMarkers(){
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  outageData.forEach(o => {
    const customIcon = L.divIcon({
      className: `custom-map-marker ${o.level}`,
      html: `<span>${o.score}</span>`,
      iconSize: [28, 28]
    });

    const marker = L.marker([o.lat, o.lng], {icon: customIcon}).addTo(map);
    marker.on('click', () => selectOutage(o.id));
    mapMarkers.push(marker);
  });
}

// 3. 우측 복구 우선순위 TOP 5 목록
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

// 4. 정전 구역 선택 시 상세 카드 업데이트
function selectOutage(id){
  selected = outageData.find(x => x.id === id);
  if(!selected) return;

  if($("#selectedTitle")) $("#selectedTitle").textContent = selected.region + " 정전";
  if($("#selectedRank")) $("#selectedRank").textContent = `${outageData.slice().sort((a,b) => b.score - a.score).findIndex(x => x.id === id) + 1}순위`;
  if($("#selectedScore")) $("#selectedScore").textContent = selected.score;
  if($("#selectedPeople")) $("#selectedPeople").textContent = selected.people;
  if($("#selectedFacilities")) $("#selectedFacilities").textContent = selected.facilities + "개";
  if($("#selectedTime")) $("#selectedTime").textContent = selected.time;
  if($("#selectedCascade")) $("#selectedCascade").textContent = selected.cascade;
  if($("#selectedReason")) $("#selectedReason").textContent = selected.reason;
  
  if(map) map.panTo([selected.lat, selected.lng]);
  renderPriority();
  showToast(`${selected.region} 선택 - 상세 데이터를 불러왔습니다.`);
}

// 5. 시나리오 상세 시뮬레이션 이동
function goToScenarioDetail(key){
  const s = scenarioData[key];
  if(!s) return;

  $$(".nav-item").forEach(b => b.classList.remove("active"));
  const scenarioBtn = $('[data-tab="tab-scenario"]');   if(scenarioBtn) scenarioBtn.classList.add("active");    $$(".tab-content").forEach(tab => tab.classList.remove("active"));
  const scenarioTab = $("#tab-scenario");
  if(scenarioTab) scenarioTab.classList.add("active");

  if($("#simName")) $("#simName").textContent = s.name;
  if($("#simScore")) $("#simScore").textContent = s.score;
  if($("#simTime")) $("#simTime").textContent = s.time;
  if($("#simPeople")) $("#simPeople").textContent = s.people;
  if($("#simDesc")) $("#simDesc").textContent = s.desc;

  showToast(`시나리오 [${s.name}] 상세 시뮬레이션 화면으로 이동했습니다.`);
}

// 6. 토스트 알림
function showToast(msg){
  const t = $("#toast");    if(!t) return;    t.textContent = msg;    t.classList.add("show");   clearTimeout(window.toastTimer);    window.toastTimer = setTimeout(() => t.classList.remove("show"), 2200); }  // 7. 탭 전환 및 사이드바 이벤트 처리 
  function bindNavEvents(){   $$(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      
      $$(".nav-item").forEach(b => b.classList.remove("active"));       btn.classList.add("active");        $$
(".tab-content").forEach(tab => tab.classList.remove("active"));
      const activeTabEl = $(`#${targetTab}`);
      if(activeTabEl) activeTabEl.classList.add("active");

      if(targetTab === "tab-dashboard" && map){
        setTimeout(() => map.invalidateSize(), 100);
      }
    });
  });

  const toggleBtn = $("#sidebarToggle");
  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      const sidebar = $("#sidebar");
      if(sidebar) sidebar.classList.toggle("collapsed");
      if(map){
        setTimeout(() => map.invalidateSize(), 250);
      }
    });
  }
}

// 8. 페이지 로드 초기화
window.addEventListener("DOMContentLoaded", () => {
  bindNavEvents();
  initMap();
  renderPriority();
});