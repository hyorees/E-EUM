const outageData = [
  {id:1, region:"부산 권역", x:500,y:385, score:96, level:"critical", people:"18.2만 명", facilities:31, time:"6.2시간", cascade:"매우 높음", reason:"대형 병원·상수도 시설 밀집 + 높은 영향 인구 + 주요 선로 연계"},
  {id:2, region:"광주·전남 권역", x:305,y:355, score:92, level:"critical", people:"14.7만 명", facilities:27, time:"5.4시간", cascade:"매우 높음", reason:"대규모 정전 범위 + 의료·교통·통신 시설 동시 영향"},
  {id:3, region:"대구·경북 권역", x:455,y:290, score:87, level:"high", people:"11.3만 명", facilities:22, time:"4.8시간", cascade:"높음", reason:"산업시설과 주거지역이 집중된 선로의 연쇄 정전 가능성"},
  {id:4, region:"충청 권역", x:350,y:275, score:79, level:"high", people:"8.6만 명", facilities:19, time:"4.2시간", cascade:"높음", reason:"정전 지역 확대 시 생활·산업시설 영향 증가 예상"},
  {id:5, region:"수도권 남부", x:395,y:205, score:74, level:"mid", people:"7.9만 명", facilities:24, time:"3.9시간", cascade:"보통", reason:"영향 인구는 높지만 대체 전력 공급 가능성이 상대적으로 높음"},
  {id:6, region:"강원 권역", x:390,y:150, score:63, level:"mid", people:"3.2만 명", facilities:12, time:"3.1시간", cascade:"보통", reason:"피해 시설 수는 적으나 산악지역 복구 접근성 저하"},
  {id:7, region:"전북 권역", x:310,y:315, score:57, level:"low", people:"2.8만 명", facilities:9, time:"2.7시간", cascade:"낮음", reason:"영향 범위와 중요시설 수가 상대적으로 낮음"}
];

const scenarioData = {
 A:{name:"사회적 피해 최소화", score:"82.4", time:"4.1시간", people:"51.2만 명", desc:"영향 인구와 중요시설을 동시에 고려하여 사회적 피해가 가장 작도록 복구 순서를 배치합니다."},
 B:{name:"중요시설 우선", score:"74.8", time:"4.6시간", people:"58.7만 명", desc:"병원·소방·상수도·통신 등 중요시설을 우선 복구하는 시나리오입니다."},
 C:{name:"네트워크 효율 우선", score:"69.2", time:"3.7시간", people:"64.3만 명", desc:"복구 작업량과 전력망 효율을 우선하여 전체 정전 복구시간을 단축하는 시나리오입니다."}
};
