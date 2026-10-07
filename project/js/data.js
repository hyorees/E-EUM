const outageData = [
  {
    "id": 1,
    "region": "부산 권역",
    "lat": 35.17955,
    "lng": 129.0756,
    "score": 70,
    "level": "mid",
    "people": "750.5만 명",
    "facilities": 99,
    "shelters": 0,
    "time": "4.7시간",
    "cascade": "보통",
    "reason": "응급의료기관 99개소 · 영향 인구 750.5만 명 기반 AI 산출",
    "weatherLevel": "ok"
  },
  {
    "id": 2,
    "region": "광주·전남 권역",
    "lat": 35.15954,
    "lng": 126.8526,
    "score": 64,
    "level": "low",
    "people": "315.4만 명",
    "facilities": 70,
    "shelters": 0,
    "time": "4.3시간",
    "cascade": "보통",
    "reason": "응급의료기관 70개소 · 영향 인구 315.4만 명 기반 AI 산출",
    "weatherLevel": "warn"
  },
  {
    "id": 3,
    "region": "대구·경북 권역",
    "lat": 35.87143,
    "lng": 128.6014,
    "score": 65,
    "level": "mid",
    "people": "483.7만 명",
    "facilities": 60,
    "shelters": 0,
    "time": "4.3시간",
    "cascade": "보통",
    "reason": "응급의료기관 60개소 · 영향 인구 483.7만 명 기반 AI 산출",
    "weatherLevel": "ok"
  },
  {
    "id": 4,
    "region": "충청 권역",
    "lat": 36.35041,
    "lng": 127.3845,
    "score": 65,
    "level": "mid",
    "people": "557.5만 명",
    "facilities": 53,
    "shelters": 0,
    "time": "4.3시간",
    "cascade": "보통",
    "reason": "응급의료기관 53개소 · 영향 인구 557.5만 명 기반 AI 산출",
    "weatherLevel": "ok"
  },
  {
    "id": 5,
    "region": "수도권 남부",
    "lat": 37.26357,
    "lng": 127.0286,
    "score": 96,
    "level": "critical",
    "people": "2,612.5만 명",
    "facilities": 197,
    "shelters": 0,
    "time": "6.4시간",
    "cascade": "매우 높음",
    "reason": "응급의료기관 197개소 · 영향 인구 2,612.5만 명 기반 AI 산출",
    "weatherLevel": "warn"
  },
  {
    "id": 6,
    "region": "강원 권역",
    "lat": 37.88536,
    "lng": 127.7298,
    "score": 58,
    "level": "low",
    "people": "150.7만 명",
    "facilities": 23,
    "shelters": 0,
    "time": "3.9시간",
    "cascade": "보통",
    "reason": "응급의료기관 23개소 · 영향 인구 150.7만 명 기반 AI 산출",
    "weatherLevel": "ok"
  },
  {
    "id": 7,
    "region": "전북 권역",
    "lat": 35.82422,
    "lng": 127.148,
    "score": 58,
    "level": "low",
    "people": "171.6만 명",
    "facilities": 21,
    "shelters": 0,
    "time": "3.9시간",
    "cascade": "보통",
    "reason": "응급의료기관 21개소 · 영향 인구 171.6만 명 기반 AI 산출",
    "weatherLevel": "ok"
  }
];

const weatherData = {"부산 권역": {"current": {"temp": 15.4, "wind": 1.9, "windMax": 6.6, "windMaxStn": "부산", "wdir": "서남서", "rain": 0.0}, "peak24": {"wind": 6.6, "windStn": "부산", "windTime": "10/06 00시", "rain1h": 0.1, "rain1hStn": "산청", "rain24": 0.1, "rain24Stn": "산청"}, "extreme": {"wind": 13.1, "windStn": "부산", "windTime": "04/10 08시", "rain1h": 116.8, "rain1hStn": "거제", "rainTime": "08/17 03시"}, "series": [{"t": "01시", "windAvg": 0.6, "windMax": 1.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "02시", "windAvg": 0.4, "windMax": 1.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "03시", "windAvg": 0.5, "windMax": 1.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "04시", "windAvg": 0.6, "windMax": 1.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "05시", "windAvg": 0.8, "windMax": 2.8, "rainAvg": 0.01, "rainMax": 0.1}, {"t": "06시", "windAvg": 0.9, "windMax": 2.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "07시", "windAvg": 1.0, "windMax": 2.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "08시", "windAvg": 1.2, "windMax": 3.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "09시", "windAvg": 1.8, "windMax": 5.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "10시", "windAvg": 2.7, "windMax": 4.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "11시", "windAvg": 3.0, "windMax": 4.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "12시", "windAvg": 3.4, "windMax": 5.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "13시", "windAvg": 3.1, "windMax": 5.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "14시", "windAvg": 3.3, "windMax": 5.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "15시", "windAvg": 3.0, "windMax": 4.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "16시", "windAvg": 3.1, "windMax": 5.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "17시", "windAvg": 2.8, "windMax": 4.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "18시", "windAvg": 2.3, "windMax": 4.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "19시", "windAvg": 1.9, "windMax": 4.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "20시", "windAvg": 1.8, "windMax": 4.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "21시", "windAvg": 2.2, "windMax": 4.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "22시", "windAvg": 2.5, "windMax": 5.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "23시", "windAvg": 2.1, "windMax": 5.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "00시", "windAvg": 1.9, "windMax": 6.6, "rainAvg": 0.0, "rainMax": 0.0}], "level": "ok", "levelText": "양호", "stationCount": 17}, "광주·전남 권역": {"current": {"temp": 15.0, "wind": 3.2, "windMax": 11.4, "windMaxStn": "흑산도", "wdir": "남남서", "rain": 0.0}, "peak24": {"wind": 13.6, "windStn": "흑산도", "windTime": "10/05 19시", "rain1h": 0.7, "rain1hStn": "영광군", "rain24": 1.2, "rain24Stn": "영광군"}, "extreme": {"wind": 19.3, "windStn": "흑산도", "windTime": "04/09 12시", "rain1h": 111.7, "rain1hStn": "보성군", "rainTime": "08/30 19시"}, "series": [{"t": "01시", "windAvg": 1.9, "windMax": 8.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "02시", "windAvg": 2.0, "windMax": 10.6, "rainAvg": 0.03, "rainMax": 0.4}, {"t": "03시", "windAvg": 2.1, "windMax": 12.1, "rainAvg": 0.02, "rainMax": 0.3}, {"t": "04시", "windAvg": 2.4, "windMax": 10.5, "rainAvg": 0.05, "rainMax": 0.7}, {"t": "05시", "windAvg": 2.3, "windMax": 9.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "06시", "windAvg": 2.9, "windMax": 9.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "07시", "windAvg": 3.2, "windMax": 9.0, "rainAvg": 0.01, "rainMax": 0.1}, {"t": "08시", "windAvg": 3.4, "windMax": 8.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "09시", "windAvg": 4.3, "windMax": 8.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "10시", "windAvg": 4.6, "windMax": 7.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "11시", "windAvg": 5.0, "windMax": 10.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "12시", "windAvg": 5.1, "windMax": 11.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "13시", "windAvg": 5.1, "windMax": 11.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "14시", "windAvg": 5.1, "windMax": 9.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "15시", "windAvg": 5.0, "windMax": 10.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "16시", "windAvg": 5.0, "windMax": 11.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "17시", "windAvg": 4.8, "windMax": 11.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "18시", "windAvg": 4.9, "windMax": 13.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "19시", "windAvg": 4.7, "windMax": 13.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "20시", "windAvg": 4.5, "windMax": 12.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "21시", "windAvg": 4.3, "windMax": 12.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "22시", "windAvg": 3.9, "windMax": 11.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "23시", "windAvg": 3.4, "windMax": 12.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "00시", "windAvg": 3.2, "windMax": 11.4, "rainAvg": 0.0, "rainMax": 0.0}], "level": "warn", "levelText": "주의", "stationCount": 14}, "대구·경북 권역": {"current": {"temp": 13.7, "wind": 1.9, "windMax": 3.8, "windMaxStn": "영주", "wdir": "남서", "rain": 0.0}, "peak24": {"wind": 7.9, "windStn": "경주시", "windTime": "10/05 13시", "rain1h": 0.1, "rain1hStn": "울릉도", "rain24": 0.1, "rain24Stn": "구미"}, "extreme": {"wind": 17.7, "windStn": "울릉도", "windTime": "06/21 05시", "rain1h": 57.5, "rain1hStn": "울진", "rainTime": "08/22 16시"}, "series": [{"t": "01시", "windAvg": 1.0, "windMax": 3.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "02시", "windAvg": 0.9, "windMax": 3.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "03시", "windAvg": 1.2, "windMax": 4.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "04시", "windAvg": 1.6, "windMax": 6.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "05시", "windAvg": 1.8, "windMax": 5.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "06시", "windAvg": 2.3, "windMax": 6.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "07시", "windAvg": 2.2, "windMax": 5.6, "rainAvg": 0.01, "rainMax": 0.1}, {"t": "08시", "windAvg": 2.7, "windMax": 4.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "09시", "windAvg": 3.4, "windMax": 5.6, "rainAvg": 0.01, "rainMax": 0.1}, {"t": "10시", "windAvg": 3.8, "windMax": 7.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "11시", "windAvg": 4.1, "windMax": 6.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "12시", "windAvg": 4.1, "windMax": 7.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "13시", "windAvg": 4.2, "windMax": 7.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "14시", "windAvg": 3.9, "windMax": 6.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "15시", "windAvg": 3.9, "windMax": 6.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "16시", "windAvg": 3.4, "windMax": 5.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "17시", "windAvg": 2.8, "windMax": 4.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "18시", "windAvg": 2.1, "windMax": 3.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "19시", "windAvg": 1.6, "windMax": 2.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "20시", "windAvg": 1.8, "windMax": 3.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "21시", "windAvg": 1.8, "windMax": 3.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "22시", "windAvg": 2.0, "windMax": 3.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "23시", "windAvg": 2.0, "windMax": 4.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "00시", "windAvg": 1.9, "windMax": 3.8, "rainAvg": 0.0, "rainMax": 0.0}], "level": "ok", "levelText": "양호", "stationCount": 15}, "충청 권역": {"current": {"temp": 12.0, "wind": 0.9, "windMax": 2.8, "windMaxStn": "추풍령", "wdir": "남", "rain": 0.0}, "peak24": {"wind": 5.6, "windStn": "서산", "windTime": "10/05 14시", "rain1h": 1.9, "rain1hStn": "추풍령", "rain24": 1.9, "rain24Stn": "추풍령"}, "extreme": {"wind": 10.2, "windStn": "보령", "windTime": "07/15 00시", "rain1h": 66.3, "rain1hStn": "보은", "rainTime": "07/09 06시"}, "series": [{"t": "01시", "windAvg": 1.0, "windMax": 2.4, "rainAvg": 0.01, "rainMax": 0.1}, {"t": "02시", "windAvg": 1.3, "windMax": 2.4, "rainAvg": 0.01, "rainMax": 0.1}, {"t": "03시", "windAvg": 1.3, "windMax": 2.3, "rainAvg": 0.05, "rainMax": 0.5}, {"t": "04시", "windAvg": 1.5, "windMax": 3.8, "rainAvg": 0.14, "rainMax": 1.9}, {"t": "05시", "windAvg": 1.3, "windMax": 2.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "06시", "windAvg": 1.2, "windMax": 2.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "07시", "windAvg": 1.2, "windMax": 3.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "08시", "windAvg": 1.3, "windMax": 3.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "09시", "windAvg": 2.2, "windMax": 4.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "10시", "windAvg": 2.7, "windMax": 4.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "11시", "windAvg": 3.0, "windMax": 5.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "12시", "windAvg": 3.0, "windMax": 5.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "13시", "windAvg": 3.0, "windMax": 5.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "14시", "windAvg": 3.4, "windMax": 5.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "15시", "windAvg": 3.1, "windMax": 5.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "16시", "windAvg": 3.4, "windMax": 5.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "17시", "windAvg": 3.0, "windMax": 4.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "18시", "windAvg": 2.3, "windMax": 3.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "19시", "windAvg": 1.9, "windMax": 3.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "20시", "windAvg": 1.8, "windMax": 3.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "21시", "windAvg": 1.6, "windMax": 2.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "22시", "windAvg": 1.2, "windMax": 3.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "23시", "windAvg": 1.1, "windMax": 2.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "00시", "windAvg": 0.9, "windMax": 2.8, "rainAvg": 0.0, "rainMax": 0.0}], "level": "ok", "levelText": "양호", "stationCount": 14}, "수도권 남부": {"current": {"temp": 12.0, "wind": 1.3, "windMax": 4.6, "windMaxStn": "백령도", "wdir": "남남서", "rain": 0.0}, "peak24": {"wind": 10.1, "windStn": "백령도", "windTime": "10/05 11시", "rain1h": 1.0, "rain1hStn": "이천", "rain24": 1.0, "rain24Stn": "이천"}, "extreme": {"wind": 11.5, "windStn": "백령도", "windTime": "07/08 03시", "rain1h": 43.2, "rain1hStn": "서울", "rainTime": "07/18 05시"}, "series": [{"t": "01시", "windAvg": 2.4, "windMax": 6.6, "rainAvg": 0.16, "rainMax": 1.0}, {"t": "02시", "windAvg": 2.3, "windMax": 7.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "03시", "windAvg": 2.0, "windMax": 6.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "04시", "windAvg": 2.2, "windMax": 8.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "05시", "windAvg": 2.1, "windMax": 7.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "06시", "windAvg": 2.3, "windMax": 9.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "07시", "windAvg": 2.1, "windMax": 8.0, "rainAvg": 0.01, "rainMax": 0.1}, {"t": "08시", "windAvg": 2.2, "windMax": 7.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "09시", "windAvg": 2.3, "windMax": 5.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "10시", "windAvg": 3.1, "windMax": 8.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "11시", "windAvg": 3.0, "windMax": 10.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "12시", "windAvg": 3.5, "windMax": 8.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "13시", "windAvg": 3.2, "windMax": 9.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "14시", "windAvg": 3.2, "windMax": 7.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "15시", "windAvg": 3.3, "windMax": 6.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "16시", "windAvg": 3.3, "windMax": 8.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "17시", "windAvg": 3.6, "windMax": 7.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "18시", "windAvg": 3.0, "windMax": 7.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "19시", "windAvg": 2.8, "windMax": 7.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "20시", "windAvg": 2.3, "windMax": 6.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "21시", "windAvg": 1.9, "windMax": 5.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "22시", "windAvg": 1.8, "windMax": 6.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "23시", "windAvg": 1.5, "windMax": 5.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "00시", "windAvg": 1.3, "windMax": 4.6, "rainAvg": 0.0, "rainMax": 0.0}], "level": "warn", "levelText": "주의", "stationCount": 9}, "강원 권역": {"current": {"temp": 11.0, "wind": 1.2, "windMax": 2.5, "windMaxStn": "강릉", "wdir": "남남동", "rain": 0.0}, "peak24": {"wind": 7.3, "windStn": "대관령", "windTime": "10/05 13시", "rain1h": 3.3, "rain1hStn": "홍천", "rain24": 3.3, "rain24Stn": "홍천"}, "extreme": {"wind": 11.8, "windStn": "대관령", "windTime": "04/10 20시", "rain1h": 41.5, "rain1hStn": "강릉", "rainTime": "08/08 09시"}, "series": [{"t": "01시", "windAvg": 1.9, "windMax": 5.8, "rainAvg": 0.53, "rainMax": 3.3}, {"t": "02시", "windAvg": 1.7, "windMax": 4.2, "rainAvg": 0.09, "rainMax": 0.4}, {"t": "03시", "windAvg": 1.8, "windMax": 5.3, "rainAvg": 0.08, "rainMax": 0.7}, {"t": "04시", "windAvg": 1.9, "windMax": 5.0, "rainAvg": 0.03, "rainMax": 0.4}, {"t": "05시", "windAvg": 2.3, "windMax": 5.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "06시", "windAvg": 2.4, "windMax": 5.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "07시", "windAvg": 2.7, "windMax": 6.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "08시", "windAvg": 2.6, "windMax": 6.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "09시", "windAvg": 2.7, "windMax": 6.7, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "10시", "windAvg": 3.0, "windMax": 6.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "11시", "windAvg": 3.1, "windMax": 7.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "12시", "windAvg": 3.4, "windMax": 6.8, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "13시", "windAvg": 3.5, "windMax": 7.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "14시", "windAvg": 3.8, "windMax": 6.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "15시", "windAvg": 3.4, "windMax": 5.5, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "16시", "windAvg": 2.9, "windMax": 4.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "17시", "windAvg": 2.7, "windMax": 4.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "18시", "windAvg": 2.0, "windMax": 3.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "19시", "windAvg": 1.5, "windMax": 4.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "20시", "windAvg": 1.4, "windMax": 3.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "21시", "windAvg": 1.3, "windMax": 2.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "22시", "windAvg": 1.6, "windMax": 3.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "23시", "windAvg": 1.1, "windMax": 2.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "00시", "windAvg": 1.2, "windMax": 2.5, "rainAvg": 0.0, "rainMax": 0.0}], "level": "ok", "levelText": "양호", "stationCount": 14}, "전북 권역": {"current": {"temp": 11.9, "wind": 0.8, "windMax": 1.6, "windMaxStn": "남원", "wdir": "동남동", "rain": 0.0}, "peak24": {"wind": 7.6, "windStn": "군산", "windTime": "10/05 13시", "rain1h": 1.1, "rain1hStn": "임실", "rain24": 1.1, "rain24Stn": "임실"}, "extreme": {"wind": 13.2, "windStn": "고창", "windTime": "04/09 13시", "rain1h": 76.8, "rain1hStn": "임실", "rainTime": "08/30 16시"}, "series": [{"t": "01시", "windAvg": 1.2, "windMax": 3.0, "rainAvg": 0.07, "rainMax": 0.7}, {"t": "02시", "windAvg": 1.2, "windMax": 2.2, "rainAvg": 0.11, "rainMax": 0.6}, {"t": "03시", "windAvg": 1.1, "windMax": 2.6, "rainAvg": 0.11, "rainMax": 1.1}, {"t": "04시", "windAvg": 0.9, "windMax": 1.8, "rainAvg": 0.16, "rainMax": 0.9}, {"t": "05시", "windAvg": 0.8, "windMax": 1.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "06시", "windAvg": 1.2, "windMax": 2.7, "rainAvg": 0.02, "rainMax": 0.2}, {"t": "07시", "windAvg": 1.1, "windMax": 2.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "08시", "windAvg": 1.2, "windMax": 3.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "09시", "windAvg": 2.4, "windMax": 4.9, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "10시", "windAvg": 3.3, "windMax": 5.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "11시", "windAvg": 4.1, "windMax": 7.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "12시", "windAvg": 3.6, "windMax": 6.5, "rainAvg": 0.02, "rainMax": 0.2}, {"t": "13시", "windAvg": 4.3, "windMax": 7.6, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "14시", "windAvg": 4.5, "windMax": 7.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "15시", "windAvg": 4.6, "windMax": 7.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "16시", "windAvg": 4.2, "windMax": 7.3, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "17시", "windAvg": 4.7, "windMax": 7.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "18시", "windAvg": 3.7, "windMax": 6.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "19시", "windAvg": 2.7, "windMax": 4.0, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "20시", "windAvg": 2.8, "windMax": 4.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "21시", "windAvg": 2.0, "windMax": 3.2, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "22시", "windAvg": 1.3, "windMax": 2.4, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "23시", "windAvg": 1.0, "windMax": 2.1, "rainAvg": 0.0, "rainMax": 0.0}, {"t": "00시", "windAvg": 0.8, "windMax": 1.6, "rainAvg": 0.0, "rainMax": 0.0}], "level": "ok", "levelText": "양호", "stationCount": 10}};
const weatherMeta = {"updated": "2026-10-06 00:00", "periodStart": "2026-03-01", "periodEnd": "2026-10-06", "stations": 93};

const scenarioData = {
  A:{name:"A. 사회적 피해 최소화", score:"82.4", time:"4.1시간", people:"51.2만 명", desc:"영향 인구와 중요시설을 동시에 고려하여 사회적 피해가 가장 작도록 복구 순서를 배치합니다."},
  B:{name:"B. 중요시설 우선", score:"74.8", time:"4.6시간", people:"58.7만 명", desc:"병원·소방·상수도·통신 등 중요시설을 우선 복구하는 시나리오입니다."},
  C:{name:"C. 네트워크 효율 우선", score:"69.2", time:"3.7시간", people:"64.3만 명", desc:"복구 작업량과 전력망 효율을 우선하여 전체 정전 복구시간을 단축하는 시나리오입니다."}
};
