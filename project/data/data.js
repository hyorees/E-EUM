const outageData = [
  {
    "id": 1,
    "region": "부산 권역",
    "x": 500,
    "y": 385,
    "score": 98,
    "level": "critical",
    "people": "750.5만 명",
    "facilities": 99,
    "time": "6.5시간",
    "cascade": "매우 높음",
    "reason": "응급의료기관 99개소 밀집 · 영향 인구 750.5만 명 기반 AI 산출"
  },
  {
    "id": 2,
    "region": "광주·전남 권역",
    "x": 305,
    "y": 355,
    "score": 98,
    "level": "critical",
    "people": "315.4만 명",
    "facilities": 71,
    "time": "6.5시간",
    "cascade": "매우 높음",
    "reason": "응급의료기관 71개소 밀집 · 영향 인구 315.4만 명 기반 AI 산출"
  },
  {
    "id": 3,
    "region": "대구·경북 권역",
    "x": 455,
    "y": 290,
    "score": 98,
    "level": "critical",
    "people": "483.7만 명",
    "facilities": 60,
    "time": "6.5시간",
    "cascade": "매우 높음",
    "reason": "응급의료기관 60개소 밀집 · 영향 인구 483.7만 명 기반 AI 산출"
  },
  {
    "id": 4,
    "region": "충청 권역",
    "x": 350,
    "y": 275,
    "score": 98,
    "level": "critical",
    "people": "557.5만 명",
    "facilities": 56,
    "time": "6.5시간",
    "cascade": "매우 높음",
    "reason": "응급의료기관 56개소 밀집 · 영향 인구 557.5만 명 기반 AI 산출"
  },
  {
    "id": 5,
    "region": "수도권 남부",
    "x": 395,
    "y": 205,
    "score": 98,
    "level": "critical",
    "people": "2612.5만 명",
    "facilities": 193,
    "time": "6.5시간",
    "cascade": "매우 높음",
    "reason": "응급의료기관 193개소 밀집 · 영향 인구 2612.5만 명 기반 AI 산출"
  },
  {
    "id": 6,
    "region": "강원 권역",
    "x": 390,
    "y": 150,
    "score": 80,
    "level": "high",
    "people": "150.7만 명",
    "facilities": 23,
    "time": "5.3시간",
    "cascade": "높음",
    "reason": "응급의료기관 23개소 밀집 · 영향 인구 150.7만 명 기반 AI 산출"
  },
  {
    "id": 7,
    "region": "전북 권역",
    "x": 310,
    "y": 315,
    "score": 78,
    "level": "high",
    "people": "171.6만 명",
    "facilities": 21,
    "time": "5.2시간",
    "cascade": "높음",
    "reason": "응급의료기관 21개소 밀집 · 영향 인구 171.6만 명 기반 AI 산출"
  }
];

const scenarioData = {
 A:{name:"사회적 피해 최소화", score:"82.4", time:"4.1시간", people:"51.2만 명", desc:"영향 인구와 중요시설을 동시에 고려하여 사회적 피해가 가장 작도록 복구 순서를 배치합니다."},
 B:{name:"중요시설 우선", score:"74.8", time:"4.6시간", people:"58.7만 명", desc:"병원·소방·상수도·통신 등 중요시설을 우선 복구하는 시나리오입니다."},
 C:{name:"네트워크 효율 우선", score:"69.2", time:"3.7시간", people:"64.3만 명", desc:"복구 작업량과 전력망 효율을 우선하여 전체 정전 복구시간을 단축하는 시나리오입니다."}
};
