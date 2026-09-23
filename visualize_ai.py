import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from sklearn.ensemble import RandomForestRegressor

# 한글 폰트 설정 (Windows 기준)
plt.rc('font', family='Malgun Gothic')
plt.rc('axes', unicode_minus=False)

# 1. 공공데이터 불러오기
target_file = 'voltis_merged_data_all.csv'
print(f"1. 시각화 데이터 읽는 중: [{target_file}]")

encodings = ['utf-8-sig', 'cp949', 'euc-kr', 'utf-8']
df = None
for enc in encodings:
    try:
        df = pd.read_csv(target_file, encoding=enc)
        break
    except Exception:
        continue

if df is None:
    raise ValueError("파일을 읽을 수 없습니다.")

df['timestamp'] = pd.to_datetime(df['timestamp'])
df['hour'] = df['timestamp'].dt.hour

# 2. 기상 기반 발전량 예측 (Random Forest Regressor)
print("2. 2단계 AI 기상 예측선(Baseline) 및 잔차(Residual) 계산 중...")
features = ['hour', '기온(°C)', '일조(hr)', '일사(MJ/m2)', '전운량(10분위)']
X = df[features].fillna(0)
y = df['전력거래량(MWh)'].fillna(0)

reg = RandomForestRegressor(n_estimators=30, random_state=42, n_jobs=-1)
reg.fit(X, y)
df['AI_예측발전량'] = reg.predict(X)

# 3. 잔차(Residual) 오차 계산
df['잔차'] = df['전력거래량(MWh)'] - df['AI_예측발전량']

# 시각화용 샘플 추출 (맨 뒤에 추가된 이상치 포함 구간 120건)
sample_df = df.tail(120).copy()

# 4. 고화질 다크테마 시각화 그래프 그리기
print("3. 관제 대시보드 시각화 그래프 그리는 중...")
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 7), dpi=150, sharex=True, gridspec_kw={'height_ratios': [2, 1]})
fig.patch.set_facecolor('#0f172a') # 다크 테마 배경색

for ax in [ax1, ax2]:
    ax.set_facecolor('#1e293b')
    ax.grid(True, color='#334155', linestyle='--', alpha=0.6)
    ax.tick_params(colors='#94a3b8')
    for spine in ax.spines.values():
        spine.set_color('#475569')

# [상단 차트] AI 예측선 vs 실제 기록값
ax1.plot(sample_df['timestamp'], sample_df['AI_예측발전량'], color='#38bdf8', linestyle='--', linewidth=2, label='AI 기상기반 예측 발전량 (정상 Baseline)')
ax1.plot(sample_df['timestamp'], sample_df['전력거래량(MWh)'], color='#94a3b8', alpha=0.6, linewidth=1.5, label='실제 기록 발전량')

# 이상치 포인트 강조 (야간 부정청구 & 주간 계측고장)
fraud = sample_df[(sample_df['hour'] >= 20) | (sample_df['hour'] <= 5)]
fraud = fraud[fraud['전력거래량(MWh)'] > 300]

fault = sample_df[(sample_df['hour'] >= 11) & (sample_df['hour'] <= 14)]
fault = fault[(fault['일조(hr)'] > 0.8) & (fault['전력거래량(MWh)'] == 0)]

ax1.scatter(fraud['timestamp'], fraud['전력거래량(MWh)'], color='#f43f5e', s=120, zorder=5, label='🚨 부정청구 (야간 조작)')
ax1.scatter(fault['timestamp'], fault['전력거래량(MWh)'], color='#f59e0b', s=120, marker='X', zorder=5, label='🔧 계측기 고장 (무발전)')

ax1.set_title('VOLTIS 2단계 AI 잔차(Residual) 분석 및 이상 탐지 관제 시각화', fontsize=14, fontweight='bold', color='#f8fafc', pad=12)
ax1.set_ylabel('전력거래량 (MWh)', color='#f8fafc', fontsize=10)
ax1.legend(loc='upper right', facecolor='#0f172a', edgecolor='#475569', labelcolor='#f1f5f9', fontsize=9)

# [하단 차트] 잔차(오차) 크기 막대 그래프
colors = np.where(sample_df['잔차'] > 300, '#f43f5e', np.where(sample_df['잔차'] < -200, '#f59e0b', '#38bdf8'))
ax2.bar(sample_df['timestamp'], sample_df['잔차'], width=0.03, color=colors, alpha=0.8)
ax2.axhline(0, color='#64748b', linewidth=1)
ax2.set_ylabel('잔차 (실제 - 예측)', color='#f8fafc', fontsize=10)
ax2.set_xlabel('일시 (Timestamp)', color='#f8fafc', fontsize=10)
ax2.xaxis.set_major_formatter(mdates.DateFormatter('%m-%d %H:%M'))

plt.tight_layout()

# 이미지 파일로 저장
output_img = 'ai_detection_visual.png'
plt.savefig(output_img)
print(f"✅ 시각화 이미지 생성 완료: '{output_img}'")