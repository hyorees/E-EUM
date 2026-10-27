import os
import re
import pandas as pd

# 파일 경로 설정 (zzzz 최상위 폴더 기준)
POP_CSV = '202609_202609_주민등록인구및세대현황_월간.csv'
REGIONS_CSV = os.path.join('backend', 'data', 'regions.csv')

# 경로 예외 처리 (루트에 regions.csv가 있는 경우)
if not os.path.exists(REGIONS_CSV) and os.path.exists('regions.csv'):
    REGIONS_CSV = 'regions.csv'

# 1. 주민등록 인구 CSV 로드
df_pop = pd.read_csv(POP_CSV, encoding='cp949')

# 행정구역명 정제 (코드 제거)
df_pop['name_clean'] = df_pop['행정구역'].apply(lambda x: re.sub(r'\s*\(\d+\)', '', str(x)).strip())
df_pop['real_pop'] = df_pop['2026년09월_총인구수'].apply(lambda x: int(str(x).replace(',', '')))

pop_map = dict(zip(df_pop['name_clean'], df_pop['real_pop']))

# 2. 백엔드 regions.csv 로드 및 인구수 교체
df_reg = pd.read_csv(REGIONS_CSV, encoding='utf-8-sig')

updated_count = 0
for idx, row in df_reg.iterrows():
    fn = row['full_name']
    sido = row['sido']
    sigungu = row['sigungu']
    
    found_pop = None
    if fn in pop_map:
        found_pop = pop_map[fn]
    elif f"{sido} {sigungu}" in pop_map:
        found_pop = pop_map[f"{sido} {sigungu}"]
    elif sido == "세종특별자치시" or sigungu == "세종시":
        found_pop = pop_map.get("세종특별자치시")
    else:
        for k in pop_map:
            if sigungu in k and (sido[:2] in k or k.startswith(sido)):
                found_pop = pop_map[k]
                break
                
    if found_pop is not None:
        df_reg.at[idx, 'pop'] = found_pop
        ratio = row['pop65_ratio'] if 'pop65_ratio' in row and not pd.isna(row['pop65_ratio']) else 0.18
        df_reg.at[idx, 'pop65'] = int(found_pop * ratio)
        if 'pop_source' in df_reg.columns:
            df_reg.at[idx, 'pop_source'] = '주민등록인구(2026.09)'
        updated_count += 1

# 3. 저장
df_reg.to_csv(REGIONS_CSV, index=False, encoding='utf-8-sig')
print(f"성공: {updated_count}개 시·군·구 인구수가 실제 주민등록 인구수로 업데이트되었습니다!")