"""응급의료기관 데이터를 hospitals.csv로 저장합니다.

PowerShell: $env:DATA_GO_KR_SERVICE_KEY="서비스 키"; python save_hospitals.py
"""
import csv
import json
import os
from urllib.parse import unquote, urlencode
from urllib.request import urlopen

API_KEY = os.environ.get("DATA_GO_KR_SERVICE_KEY")
if API_KEY:
    API_KEY = unquote(API_KEY)
BASE_URL = "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire"
PAGE_SIZE = 1000


def main():
    if not API_KEY:
        raise RuntimeError("DATA_GO_KR_SERVICE_KEY 환경변수에 공공데이터포털 서비스 키를 설정해 주세요.")

    items = []
    page = 1
    while True:
        params = {
            "serviceKey": API_KEY,
            "pageNo": str(page),
            "numOfRows": str(PAGE_SIZE),
            "_type": "json",
        }
        url = f"{BASE_URL}?{urlencode(params)}"
        with urlopen(url, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
        api_response = data.get("response", {})
        header = api_response.get("header", {})
        if header.get("resultCode") != "00":
            raise RuntimeError(f"공공데이터 API 오류: {header.get('resultMsg', '알 수 없는 오류')}")

        body = api_response.get("body")
        if not isinstance(body, dict) or "totalCount" not in body:
            raise ValueError("공공데이터 API 응답에 body 또는 totalCount가 없습니다.")
        total_count = int(body["totalCount"])
        page_items = body.get("items", {}).get("item", [])
        if isinstance(page_items, dict):
            page_items = [page_items]
        if not isinstance(page_items, list):
            raise ValueError("공공데이터 API 응답의 병원 목록 형식이 올바르지 않습니다.")
        if not page_items:
            if len(items) < total_count:
                raise RuntimeError(f"병원 데이터 수집이 중단됐습니다: {len(items)}/{total_count}건")
            break
        items.extend(page_items)

        if len(items) >= total_count:
            break
        if len(page_items) < PAGE_SIZE:
            raise RuntimeError(f"병원 데이터가 일부만 반환됐습니다: {len(items)}/{total_count}건")
        page += 1

    if len(items) != total_count:
        raise RuntimeError(f"병원 데이터 건수가 맞지 않습니다: {len(items)}/{total_count}건")

    filename = "hospitals.csv"
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["병원명", "주소", "위도", "경도"])
        for item in items:
            writer.writerow([
                item.get("dutyName", ""),
                item.get("dutyAddr", ""),
                item.get("wgs84Lat", ""),
                item.get("wgs84Lon", ""),
            ])

    print(f"총 {len(items)}개의 응급의료기관 데이터를 '{filename}'로 저장했습니다.")


if __name__ == "__main__":
    main()