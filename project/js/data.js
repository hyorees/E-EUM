const outageData = [
  {
    "id": 1,
    "region": "부산 권역",
    "lat": 35.17955,
    "lng": 129.0756,
    "score": 77,
    "level": "high",
    "people": "330.0만 명",
    "facilities": 35,
    "shelters": 0,
    "time": "5.1시간",
    "cascade": "높음",
    "reason": "응급의료기관 35개소 · 영향 인구 330.0만 명 기반 AI 산출"
  },
  {
    "id": 2,
    "region": "광주·전남 권역",
    "lat": 35.15954,
    "lng": 126.8526,
    "score": 77,
    "level": "high",
    "people": "320.0만 명",
    "facilities": 35,
    "shelters": 0,
    "time": "5.1시간",
    "cascade": "높음",
    "reason": "응급의료기관 35개소 · 영향 인구 320.0만 명 기반 AI 산출"
  },
  {
    "id": 3,
    "region": "대구·경북 권역",
    "lat": 35.87143,
    "lng": 128.6014,
    "score": 82,
    "level": "high",
    "people": "490.0만 명",
    "facilities": 35,
    "shelters": 0,
    "time": "5.5시간",
    "cascade": "높음",
    "reason": "응급의료기관 35개소 · 영향 인구 490.0만 명 기반 AI 산출"
  },
  {
    "id": 4,
    "region": "충청 권역",
    "lat": 36.35041,
    "lng": 127.3845,
    "score": 84,
    "level": "high",
    "people": "550.0만 명",
    "facilities": 36,
    "shelters": 0,
    "time": "5.6시간",
    "cascade": "높음",
    "reason": "응급의료기관 36개소 · 영향 인구 550.0만 명 기반 AI 산출"
  },
  {
    "id": 5,
    "region": "수도권 남부",
    "lat": 37.26357,
    "lng": 127.0286,
    "score": 96,
    "level": "critical",
    "people": "980.0만 명",
    "facilities": 37,
    "shelters": 0,
    "time": "6.4시간",
    "cascade": "매우 높음",
    "reason": "응급의료기관 37개소 · 영향 인구 980.0만 명 기반 AI 산출"
  },
  {
    "id": 6,
    "region": "강원 권역",
    "lat": 37.88536,
    "lng": 127.7298,
    "score": 73,
    "level": "mid",
    "people": "150.0만 명",
    "facilities": 37,
    "shelters": 0,
    "time": "4.9시간",
    "cascade": "보통",
    "reason": "응급의료기관 37개소 · 영향 인구 150.0만 명 기반 AI 산출"
  },
  {
    "id": 7,
    "region": "전북 권역",
    "lat": 35.82422,
    "lng": 127.148,
    "score": 73,
    "level": "mid",
    "people": "175.0만 명",
    "facilities": 35,
    "shelters": 0,
    "time": "4.9시간",
    "cascade": "보통",
    "reason": "응급의료기관 35개소 · 영향 인구 175.0만 명 기반 AI 산출"
  }
];

const scenarioData = {
  A:{name:"A. 사회적 피해 최소화", score:"82.4", time:"4.1시간", people:"51.2만 명", desc:"영향 인구와 중요시설을 동시에 고려하여 사회적 피해가 가장 작도록 복구 순서를 배치합니다."},
  B:{name:"B. 중요시설 우선", score:"74.8", time:"4.6시간", people:"58.7만 명", desc:"병원·소방·상수도·통신 등 중요시설을 우선 복구하는 시나리오입니다."},
  C:{name:"C. 네트워크 효율 우선", score:"69.2", time:"3.7시간", people:"64.3만 명", desc:"복구 작업량과 전력망 효율을 우선하여 전체 정전 복구시간을 단축하는 시나리오입니다."}
};
