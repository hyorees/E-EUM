const $ = s => document.querySelector(s);
const list = $("#priorityList");
const markers = $("#markers");
let selected = outageData[0];

function renderMarkers(){
  markers.innerHTML = outageData.map(o => `
    <g class="marker-group ${o.level}" transform="translate(${o.x} ${o.y})" onclick="selectOutage(${o.id})">
      <circle class="pulse" r="18"></circle>
      <circle class="marker-circle" r="11"></circle>
      <text x="17" y="5">${o.score}</text>
    </g>`).join("");
}

function renderPriority(){
  const sorted = [...outageData].sort((a,b)=>b.score-a.score).slice(0,5);
  list.innerHTML = sorted.map((o,i)=>`
    <button class="priority-item ${selected.id===o.id?'selected':''}" onclick="selectOutage(${o.id})">
      <span class="rank">${i+1}</span>
      <span class="priority-main"><b>${o.region}</b><small>${o.facilities}개 시설 · ${o.people}</small></span>
      <span class="mini-bar"><i style="width:${o.score}%"></i></span>
      <strong>${o.score}</strong>
    </button>`).join("");
}

function selectOutage(id){
  selected = outageData.find(x=>x.id===id);
  $("#selectedTitle").textContent = selected.region + " 정전";
  $("#selectedRank").textContent = `${outageData.slice().sort((a,b)=>b.score-a.score).findIndex(x=>x.id===id)+1}순위`;
  $("#selectedScore").textContent = selected.score;
  $("#selectedPeople").textContent = selected.people;
  $("#selectedFacilities").textContent = selected.facilities+"개";
  $("#selectedTime").textContent = selected.time;
  $("#selectedCascade").textContent = selected.cascade;
  $("#selectedReason").textContent = selected.reason;
  renderPriority();
  showToast(`${selected.region}의 AI 분석 결과를 불러왔습니다.`);
}

function selectScenario(key){
  const s = scenarioData[key];
  showToast(`시나리오 ${key} · ${s.name} 선택 — 예상 사회적 피해 ${s.people}`);
}

function showToast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>t.classList.remove("show"),2200);
}

renderMarkers();
renderPriority();
