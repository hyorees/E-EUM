window.outageData = [
  {
    "id": 1,
    "region": "부산 권역",
    "lat": 35.17955,
    "lng": 129.0756,
    "pop": 7504814,
    "hosp": 99,
    "est_hours": 4.0,
    "temperature": 21.400000000000006,
    "wind_speed": 21.9,
    "precipitation": 44.7,
    "score": 61.1,
    "level": "high"
  },
  {
    "id": 2,
    "region": "광주·전남 권역",
    "lat": 35.15954,
    "lng": 126.8526,
    "pop": 3154398,
    "hosp": 70,
    "est_hours": 4.2,
    "temperature": 21.816666666666663,
    "wind_speed": 21.1,
    "precipitation": 41.8,
    "score": 48.3,
    "level": "mid"
  },
  {
    "id": 3,
    "region": "대구·경북 권역",
    "lat": 35.87143,
    "lng": 128.6014,
    "pop": 4837334,
    "hosp": 60,
    "est_hours": 4.6,
    "temperature": 21.454166666666666,
    "wind_speed": 21.7,
    "precipitation": 38.7,
    "score": 48.8,
    "level": "mid"
  },
  {
    "id": 4,
    "region": "충청 권역",
    "lat": 36.35041,
    "lng": 127.3845,
    "pop": 5575207,
    "hosp": 53,
    "est_hours": 6.7,
    "temperature": 22.195833333333336,
    "wind_speed": 21.9,
    "precipitation": 43.3,
    "score": 47.7,
    "level": "mid"
  },
  {
    "id": 5,
    "region": "수도권 남부",
    "lat": 37.26357,
    "lng": 127.0286,
    "pop": 26125375,
    "hosp": 197,
    "est_hours": 4.8,
    "temperature": 22.733333333333334,
    "wind_speed": 21.1,
    "precipitation": 42.9,
    "score": 100.0,
    "level": "critical"
  },
  {
    "id": 6,
    "region": "강원 권역",
    "lat": 37.88536,
    "lng": 127.7298,
    "pop": 1506701,
    "hosp": 23,
    "est_hours": 4.2,
    "temperature": 21.520833333333332,
    "wind_speed": 20.7,
    "precipitation": 44.8,
    "score": 39.5,
    "level": "low"
  },
  {
    "id": 7,
    "region": "전북 권역",
    "lat": 35.82422,
    "lng": 127.148,
    "pop": 1716229,
    "hosp": 21,
    "est_hours": 5.8,
    "temperature": 21.3125,
    "wind_speed": 21.9,
    "precipitation": 44.7,
    "score": 38.5,
    "level": "low"
  }
];
let outageData = window.outageData;

const scenarioData = {
  A:{name:"A. 사회적 피해 최소화", short:"피해 최소화", rule:"우선순위 점수 ÷ 복구 소요시간이 큰 구역부터", desc:"영향 인구·중요시설·기상 위험을 종합한 우선순위 점수가 높고 빨리 끝나는 구역부터 복구해, 정전 상태로 머무는 인구·시간을 줄입니다."},
  B:{name:"B. 중요시설 우선", short:"중요시설 우선", rule:"응급의료기관이 많은 구역부터", desc:"병원 등 응급의료기관이 많은 구역을 먼저 복구해 생명·안전과 직결된 시설의 정전 시간을 줄입니다."},
  C:{name:"C. 네트워크 효율 우선", short:"효율 우선", rule:"복구 소요시간이 짧은 구역부터", desc:"작업량이 적은 구역부터 끝내 복구 완료 구역 수를 빠르게 늘립니다."}
};
window.scenarioData = scenarioData;
