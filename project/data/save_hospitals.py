import requests
import csv
from urllib.parse import unquote

raw_key = "916fe7c0750ed9974761e0a52a92e21c184fbdb8232ec87b16295d0cf0cf235d"
API_KEY = unquote(raw_key)

BASE_URL = "http://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire"

# 전국 데이터를 한 번에 수집하기 위해 numOfRows를 1000으로 설정
params = {
    'serviceKey': API_KEY,
    'pageNo': '1',
    'numOfRows': '1000',
    '_type': 'json'
}

response = requests.get(BASE_URL, params=params)

if response.status_code == 200:
    data = response.json()
    items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
    
    if isinstance(items, dict):
        items = [items]
        
    # CSV 파일로 저장 (한글 깨짐 방지를 위해 utf-8-sig 사용)
    filename = "hospitals.csv"
    with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['병원명', '주소', '위도', '경도'])
        
        for item in items:
            writer.writerow([
                item.get('dutyName', ''),
                item.get('dutyAddr', ''),
                item.get('wgs84Lat', ''),
                item.get('wgs84Lon', '')
            ])
            
    print(f"총 {len(items)}개의 응급의료기관 데이터를 '{filename}'로 저장했습니다.")
else:
    print("수집 실패:", response.status_code)