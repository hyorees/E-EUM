import pandas as pd
import os
import warnings
warnings.filterwarnings('ignore') # 성가신 경고 메시지 숨기기

print("1. 데이터를 불러오는 중입니다...")

# 1. 태양광 데이터 불러오기
csv_file = '한국전력거래소_지역별 시간별 태양광 및 풍력 발전량_20251231.csv'
solar_df = pd.read_csv(csv_file, encoding='utf-8')

# '태양광' 발전 데이터만 남기기 및 결측치 제거
solar_df = solar_df.dropna(subset=['거래시간'])
solar_df = solar_df[solar_df['연료원'] == '태양광']

# 시간 변환
solar_df['timestamp'] = pd.to_datetime(solar_df['거래일']) + pd.to_timedelta(solar_df['거래시간'], unit='h')


# 2. 전국 광역지자체 ↔ 기상청 대표 관측지점 매칭
region_mapping = {
    '서울시': '서울', '부산시': '부산', '대구시': '대구', '인천시': '인천',
    '광주시': '광주', '대전시': '대전', '울산시': '울산', '세종시': '세종',
    '경기도': '수원', '강원도': '춘천', '충청북도': '청주', '충청남도': '홍성',
    '전라북도': '전주', '전라남도': '목포', '경상북도': '안동', '경상남도': '창원', '제주도': '제주'
}
solar_df['매칭지점'] = solar_df['지역'].map(region_mapping)


# 3. 기상 데이터 불러오기
xls_file = 'OBS_ASOS_TIM_20260922100115.xls'
weather_df = pd.read_csv(xls_file, sep='\t', encoding='cp949', low_memory=False)

# 시간 변환
weather_df['timestamp'] = pd.to_datetime(weather_df['일시'])


print("2. 전국 데이터를 짝지어 병합하고 있습니다...")

# 4. 데이터 병합 (Merge)
merged_df = pd.merge(
    solar_df, 
    weather_df, 
    left_on=['timestamp', '매칭지점'],   
    right_on=['timestamp', '지점명'],     
    how='inner'
)

# ★수정된 부분★ 
# 분석에 쓸 핵심 컬럼만 먼저 떼어냅니다. (copy()를 써서 안전하게 복사)
final_df = merged_df[[
    'timestamp', '지역', '지점명', 
    '전력거래량(MWh)', '기온(°C)', '일조(hr)', '일사(MJ/m2)', '전운량(10분위)'
]].copy()

# 글자 칸은 놔두고, 숫자가 들어가야 하는 칸의 빈칸(NaN)만 0으로 채웁니다.
numeric_columns = ['전력거래량(MWh)', '기온(°C)', '일조(hr)', '일사(MJ/m2)', '전운량(10분위)']
final_df[numeric_columns] = final_df[numeric_columns].fillna(0)


print("3. 파일 저장을 시작합니다...")

# 5. 최종 결과물 저장 및 파일 위치 확인
file_name = 'voltis_merged_data_all.csv'
final_df.to_csv(file_name, index=False, encoding='utf-8-sig')

saved_path = os.path.abspath(file_name)

print("===================================================")
print("✅ 전국 데이터 병합 완료!")
print(f"📁 파일 저장 위치: {saved_path}")
print("===================================================")
print("미리보기(위에서 5줄):")
print(final_df.head())