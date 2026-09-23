import pandas as pd
import numpy as np
import glob
from sklearn.ensemble import RandomForestRegressor
from sklearn.ensemble import IsolationForest

# 1. 공공데이터 기준점 파일 읽기 (인코딩 자동 예방)
target_file = 'voltis_merged_data_all.csv'
print(f"1. [Data Loading] 기준 공공데이터셋 읽는 중: [{target_file}]")

encodings = ['utf-8-sig', 'cp949', 'euc-kr', 'utf-8']
df = None
for enc in encodings:
    try:
        df = pd.read_csv(target_file, encoding=enc)
        print(f"   └ [성공] '{enc}' 인코딩으로 데이터를 로드했습니다.")
        break
    except Exception:
        continue

if df is None:
    raise ValueError("파일 읽기에 실패했습니다. 인코딩 및 파일명을 확인해 주세요.")

# 시간(hour) 추출
df['hour'] = pd.to_datetime(df['timestamp']).dt.hour

# 2. [1단계 AI] 기상-시간 조건 기반 정상 예상 발전량 산출 (RandomForest Regressor)
print("2. [1단계 ML] 기상 및 시간 조건 기반 정상 발전량 Baseline 학습 중...")
features = ['hour', '기온(°C)', '일조(hr)', '일사(MJ/m2)', '전운량(10분위)']
X = df[features].fillna(0)
y = df['전력거래량(MWh)'].fillna(0)

# 머신러닝 회귀 모델 학습
reg_model = RandomForestRegressor(n_estimators=30, random_state=42, n_jobs=-1)
reg_model.fit(X, y)
df['AI_예측발전량'] = reg_model.predict(X)

# 3. [2단계 AI] 오차/잔차(Residual) 계산 및 Isolation Forest 고립 분석
print("3. [2단계 AI] 잔차(Residual = 실제값 - 예측값) 계산 및 비지도 이상 탐지 실행 중...")
df['residual'] = df['전력거래량(MWh)'] - df['AI_예측발전량']

# 잔차 데이터 공간에 Isolation Forest 모델 적용
iso_model = IsolationForest(n_estimators=100, contamination=0.0005, random_state=42)
df['anomaly_flag'] = iso_model.fit_predict(df[['residual']])

# 4. 정밀 유형 분류 (도메인 맥락 결합)
df['AI_탐지결과'] = '정상'

# 잔차가 300 이상 크면서 야간/무일조 시간에 터무니없이 튄 경우 -> 부정청구
fraud_cond = (df['residual'] > 300.0) & ((df['hour'] >= 20) | (df['hour'] <= 5))

# 잔차가 -200 이하로 떨어지면서 한낮 고일조 시간에 발전량이 0인 경우 -> 계측고장
fault_cond = (df['residual'] < -200.0) & ((df['hour'] >= 11) & (df['hour'] <= 14)) & (df['일조(hr)'] > 0.8) & (df['전력거래량(MWh)'] == 0)

df.loc[fraud_cond, 'AI_탐지결과'] = '부정청구(야간발전조작)'
df.loc[fault_cond, 'AI_탐지결과'] = '계측기고장(주간무발전)'

# 5. 탐지 결과 통계 출력
anomalies = df[df['AI_탐지결과'] != '정상']

print("\n==================================================")
print(f"📊 [2단계 AI 관제 엔진] 총 {len(anomalies)}건의 이상 거래 포착")
print("==================================================")

if len(anomalies) > 0:
    summary = anomalies['AI_탐지결과'].value_counts()
    for category, count in summary.items():
        print(f"  • {category}: {count}건")
    print("\n[상세 포착 샘플 (상위 5건)]")
    print(anomalies[['timestamp', '전력거래량(MWh)', 'AI_예측발전량', 'residual', 'AI_탐지결과']].head())
else:
    print("✅ 모든 데이터가 정상 범주 내에 있습니다.")

# 결과 내보내기 (웹 대시보드 연동용 CSV)
output_file = 'final_anomaly_results.csv'
df.to_csv(output_file, index=False, encoding='utf-8-sig')
print(f"\n✅ 분석 결과 저장 완료: '{output_file}'")