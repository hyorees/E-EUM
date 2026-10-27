# backend/build_regions.py
import pandas as pd
import os

HERE = os.path.dirname(os.path.abspath(__file__))
POP_CSV = os.path.join(HERE, "data", "202609_202609_주민등록인구및세대현황_월간.csv")
TARGET_CSV = os.path.join(HERE, "data", "regions.csv")

def apply_real_population():
    if not os.path.exists(POP_CSV) or not os.path.exists(TARGET_CSV):
        print("파일 경로를 확인해 주세요.")
        return

    # 공공데이터 읽기
    pop_df = pd.read_csv(POP_CSV, encoding='euc-kr')
    pop_col = [c for c in pop_df.columns if '총인구수' in c][0]
    
    pop_map = {}
    for _, row in pop_df.iterrows():
        name = str(row['행정구역']).split('(')[0].strip()
        val = str(row[pop_col]).replace(',', '').strip()
        if val.isdigit():
            pop_map[name] = int(val)

    # regions.csv 업데이트
    reg_df = pd.read_csv(TARGET_CSV, encoding='utf-8-sig')
    
    for idx, row in reg_df.iterrows():
        sido, sigungu = row['sido'], row['sigungu']
        for k, v in pop_map.items():
            if sigungu in k and (sido[:2] in k):
                reg_df.at[idx, 'pop'] = v
                reg_df.at[idx, 'pop65'] = int(v * 0.192) # 고령층 비율 반영
                break

    reg_df.to_csv(TARGET_CSV, index=False, encoding='utf-8-sig')
    print("성공: 2026년 9월 최신 주민등록 실인구 데이터가 regions.csv에 적용되었습니다.")

if __name__ == "__main__":
    apply_real_population()