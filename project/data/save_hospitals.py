# project/data/save_hospitals.py
"""
공공데이터포털 API를 호출하여 전국 응급의료기관 데이터를 가져온 뒤 
hospitals.csv 파일로 저장하는 데이터 수집(API 연동) 스크립트입니다.
"""

import csv  # 데이터를 CSV 파일 형태로 저장하기 위한 파이썬 기본 라이브러리
import json  # API가 응답해 주는 JSON 형태의 데이터를 파이썬 객체로 변환하기 위한 라이브러리
import os  # 컴퓨터 환경변수(API 키 등)를 읽어오기 위한 라이브러리
from urllib.parse import unquote, urlencode  # 인터넷 주소(URL) 양식 변환 도구
from urllib.request import urlopen  # 인터넷 웹 주소로 요청을 보내 데이터를 가져오는 도구

# 1. 공공데이터포털에서 발급받은 개인 인증키(SERVICE KEY)를 컴퓨터 환경변수에서 읽어옵니다.
API_KEY = os.environ.get("DATA_GO_KR_SERVICE_KEY")
if API_KEY:
    # 인증키에 포함된 %2F 같은 인코딩 특수문자를 원래 문자로 디코딩(해독)합니다.
    API_KEY = unquote(API_KEY)

# 응급의료기관 위치정보 조회 공공데이터 API의 기본 인터넷 주소
BASE_URL = (
    "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire"
)
PAGE_SIZE = 1000  # 한 번 요청할 때 가져올 최대 병원 데이터 개수 (1000개씩)


def main():
    """공공데이터 API에 접속하여 병원 목록 전체를 수집하고 CSV로 저장하는 메인 함수"""
    # API 키가 없으면 작동을 멈추고 안내 에러 메시지를 띄웁니다.
    if not API_KEY:
        raise RuntimeError(
            "DATA_GO_KR_SERVICE_KEY 환경변수에 공공데이터포털 서비스 키를 설정해 주세요."
        )

    items = []  # 가져온 병원 정보들을 쌓아둘 빈 리스트
    page = 1  # 수집을 시작할 페이지 번호 (1페이지부터 시작)

    # 모든 데이터를 다 가져올 때까지 1페이지씩 증가하며 반복(while) 수집합니다.
    while True:
        # API 서버로 보낼 요청 파라미터(설정값) 묶음
        params = {
            "serviceKey": API_KEY,  # 인증키
            "pageNo": str(page),  # 요청할 페이지 번호
            "numOfRows": str(PAGE_SIZE),  # 한 번에 요청할 데이터 개수 (1000개)
            "_type": "json",  # 데이터 형태를 JSON으로 요청
        }

        # 주소에 파라미터를 붙여 완전한 접속 URL을 만듭니다.
        url = f"{BASE_URL}?{urlencode(params)}"

        # 인터넷 주소로 접속해서 API 응답 데이터를 읽어옵니다 (최대 30초 대기)
        with urlopen(url, timeout=30) as response:
            data = json.loads(
                response.read().decode("utf-8")
            )  # JSON 글자를 파이썬 딕셔너리로 변환

        # API 응답 결과에서 헤더(성공 여부)와 바디(실제 병원 데이터)를 분리합니다.
        api_response = data.get("response", {})
        header = api_response.get("header", {})

        # API 결과 코드(resultCode)가 "00"(성공)이 아니면 에러를 내며 정지합니다.
        if header.get("resultCode") != "00":
            raise RuntimeError(
                f"공공데이터 API 오류: {header.get('resultMsg', '알 수 없는 오류')}"
            )

        body = api_response.get("body")
        if not isinstance(body, dict) or "totalCount" not in body:
            raise ValueError(
                "공공데이터 API 응답에 body 또는 totalCount가 없습니다."
            )

        total_count = int(body["totalCount"])  # 전체 응급의료기관 총 개수
        page_items = body.get("items", {}).get(
            "item", []
        )  # 현재 페이지의 병원 목록

        # 가져온 데이터가 단 1개라 딕셔너리로 올 경우 리스트로 감싸줍니다.
        if isinstance(page_items, dict):
            page_items = [page_items]
        if not isinstance(page_items, list):
            raise ValueError(
                "공공데이터 API 응답의 병원 목록 형식이 올바르지 않습니다."
            )

        # 더 이상 받아올 데이터가 없으면 수집 루프를 종료합니다.
        if not page_items:
            if len(items) < total_count:
                raise RuntimeError(
                    f"병원 데이터 수집이 중단됐습니다: {len(items)}/{total_count}건"
                )
            break

        # 수집한 병원 데이터들을 items 리스트 끝에 추가합니다.
        items.extend(page_items)

        # 전체 개수만큼 다 수집했으면 반복을 멈춥니다.
        if len(items) >= total_count:
            break
        # 한 페이지 분량보다 적게 반환되었다면 데이터가 끝난 것이므로 에러 검사
        if len(page_items) < PAGE_SIZE:
            raise RuntimeError(
                f"병원 데이터가 일부만 반환됐습니다: {len(items)}/{total_count}건"
            )

        page += 1  # 다음 페이지 번호로 이동

    # 수집된 총 개수가 API 전체 개수와 맞지 않으면 확인용 오류 출력
    if len(items) != total_count:
        raise RuntimeError(
            f"병원 데이터 건수가 맞지 않습니다: {len(items)}/{total_count}건"
        )

    # 2. 수집된 병원 데이터를 hospitals.csv 파일로 새로 씁니다.
    filename = "hospitals.csv"
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        # CSV 파일 맨 첫 줄(헤더/열 제목) 작성
        writer.writerow(["병원명", "주소", "위도", "경도"])

        # 수집한 항목에서 병원명(dutyName), 주소(dutyAddr), 위도(wgs84Lat), 경도(wgs84Lon)만 뽑아 저장
        for item in items:
            writer.writerow([
                item.get("dutyName", ""),
                item.get("dutyAddr", ""),
                item.get("wgs84Lat", ""),
                item.get("wgs84Lon", ""),
            ])

    print(
        f"총 {len(items)}개의 응급의료기관 데이터를 '{filename}'로 저장했습니다."
    )


# 파이썬 명령어로 이 파일(save_hospitals.py)을 직접 실행했을 때만 main() 함수를 구동
if __name__ == "__main__":
    main()