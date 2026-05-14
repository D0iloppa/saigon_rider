# Mission Mapping Report

- 원본: `sre-mission-list-12m.csv` (240개 미션)
- 시드: `sre-mission-seed.sql` (240개 INSERT, 자동 파싱 100%)
- 전체 매핑 CSV: `sre-mission-mapping-full.csv` (검토용)
- 검토 필요(`_unparsed`): 0개
- `custom` 윈도우: 0개 (시즌 50건은 `season`, 드라이버 18건은 `calendar_day`+`eligibility`로 정리됨)

---

## 1. 통계 요약

### 1.1 집계 방식 (`agg`) 분포

| agg | 개수 | 비중 | 설명 |
|---|---:|---:|---|
| `count_event` | 142 | 59.2% | 이벤트 개수 |
| `sum_field` | 37 | 15.4% | 특정 필드 누적 합계 |
| `count_distinct` | 22 | 9.2% | 특정 필드 고유값 카운트 |
| `composite` | 21 | 8.8% | AND/OR 결합 |
| `count_mission_complete` | 7 | 2.9% | 다른 미션 완료 카운트 |
| `count_distinct_category` | 5 | 2.1% | 활동 카테고리 고유 카운트 |
| `count_distinct_district` | 4 | 1.7% | District 고유 카운트 |
| `streak_days` | 2 | 0.8% | 연속일 |

### 1.2 윈도우 분포

| window.type | 개수 | 비중 |
|---|---:|---:|
| `calendar_day` | 72 | 30.0% |
| `calendar_week` | 62 | 25.8% |
| `season` | 59 | 24.6% |
| `calendar_month` | 32 | 13.3% |
| `onboarding` | 15 | 6.2% |

**시즌 라벨 분포 (window.type=season)**

| label | 개수 |
|---|---:|
| `ANNUAL` | 9 |
| `TET` | 8 |
| `SUMMER` | 7 |
| `SPRING` | 6 |
| `RAINY` | 6 |
| `VN_INDEPENDENCE` | 6 |
| `MID_AUTUMN` | 6 |
| `DRY_SEASON` | 6 |
| `XMAS` | 5 |

### 1.3 사용자 자격 필터 (`eligibility`)

- `eligibility` 태그된 미션: **18건** (모두 드라이버 한정)
- `target_rule.eligibility.account_type=["DRIVER"]` 적용

### 1.4 액션 코드 사용 빈도

composite의 child 액션 포함 누적 카운트입니다.

| action_code | 사용 횟수 | 비고 |
|---|---:|---|
| `RIDE_KM` | 106 |  |
| `PHOTO_UPLOAD` | 22 | **신규 추가 필요** |
| `DELIVERY_RECEIPT` | 14 |  |
| `DAILY_INSPECTION` | 10 | **신규 추가 필요** |
| `REVIEW_PHOTO` | 10 |  |
| `MARKET_LISTING` | 9 |  |
| `MAINTENANCE_RECEIPT` | 8 |  |
| `REFERRAL` | 7 |  |
| `LIKE_RECEIVED` | 5 | **신규 추가 필요** |
| `COMMENT_POST` | 5 | **신규 추가 필요** |
| `MARKET_SUCCESS` | 5 |  |
| `QUEST_COMPLETE` | 3 |  |
| `FUEL_RECEIPT` | 3 |  |
| `POST_CREATE` | 3 | **신규 추가 필요** |
| `PROFILE_UPDATE` | 2 | **신규 추가 필요** |
| `MARKET_BROWSE` | 2 | **신규 추가 필요** |
| `MARKET_INQUIRY` | 2 | **신규 추가 필요** |
| `CAR_WASH_RECEIPT` | 2 | **신규 추가 필요** |
| `DRIVER_VERIFY` | 1 | **신규 추가 필요** |
| `MARKET_FAVORITE` | 1 | **신규 추가 필요** |
| `MARKET_CHAT` | 1 | **신규 추가 필요** |
| `SHARE_SNS` | 1 |  |
| `PART_REPLACE` | 1 | **신규 추가 필요** |
| `ACCOUNT_AGE` | 1 | **신규 추가 필요** |

### 1.5 필터 키 사용 빈도

| filter | 사용 횟수 |
|---|---:|
| `geo` | 21 |
| `time_of_day` | 17 |
| `date` | 11 |
| `weather` | 8 |
| `speed_kmh` | 1 |
| `max_duration_min` | 1 |

### 1.6 카테고리 × 집계 방식

| category | `composite` | `count_distinct` | `count_distinct_category` | `count_distinct_district` | `count_event` | `count_mission_complete` | `streak_days` | `sum_field` | 합계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| COMMUNITY | 6 | 0 | 0 | 0 | 36 | 0 | 0 | 1 | **43** |
| DELIVERY | 0 | 2 | 0 | 0 | 15 | 0 | 1 | 1 | **19** |
| MAINT | 5 | 3 | 0 | 0 | 29 | 0 | 0 | 0 | **37** |
| MARKET | 2 | 0 | 1 | 0 | 23 | 0 | 0 | 1 | **27** |
| MIXED | 2 | 1 | 4 | 0 | 2 | 7 | 0 | 1 | **17** |
| RIDING | 6 | 16 | 0 | 4 | 37 | 0 | 1 | 33 | **97** |

---

## 2. 까다로운 패턴별 샘플

자동 파싱이 정상적으로 동작했는지 확인하기 위한 대표 케이스입니다.

### 2.1 복합 조건 (`composite` — 21건 중 5건)

| code | condition | target_rule |
|---|---|---|
| `D-RD-19` | `30분+ 라이딩` | `{"agg": "composite", "operator": "AND", "children": [{"agg": "count_event", "target": 1, "filters": {"min_duration_mi...` |
| `W-RD-08` | `3인+ 1회` | `{"agg": "composite", "operator": "AND", "children": [{"agg": "count_event", "target": 1}, {"agg": "count_event", "tar...` |
| `W-RD-10` | `과속 0+50km` | `{"agg": "composite", "operator": "AND", "children": [{"agg": "count_event", "target": 1}, {"agg": "sum_field", "targe...` |
| `W-MT-04` | `주유 2건+거리` | `{"agg": "composite", "operator": "AND", "children": [{"agg": "count_event", "target": 2, "action_code": "FUEL_RECEIPT...` |
| `W-MT-05` | `교체+영수증` | `{"agg": "composite", "operator": "AND", "children": [{"agg": "count_event", "target": 1}, {"agg": "count_event", "tar...` |

### 2.2 메타 미션 (`count_mission_complete` — 7건 중 3건)

| code | condition | target_rule |
|---|---|---|
| `O-MX-02` | `신규 미션 8개+` | `{"agg": "count_mission_complete", "target": 8, "window": {"type": "onboarding", "days": 14}}` |
| `M-MX-02` | `월 미션 5개+` | `{"agg": "count_mission_complete", "target": 5, "window": {"type": "calendar_month"}}` |
| `S-TET-08` | `Tết 미션 4개+` | `{"agg": "count_mission_complete", "target": 4, "filters": {"date": {"period": "TET"}}, "window": {"type": "season", "...` |

### 2.3 연속일 (`streak_days` — 2건 전부)

| code | condition | target_rule |
|---|---|---|
| `W-RD-04` | `7일 연속` | `{"agg": "streak_days", "target": 7, "action_code": "RIDE_KM", "field": "ride_date", "window": {"type": "calendar_week"}}` |
| `W-DL-06` | `7일 연속` | `{"agg": "streak_days", "target": 7, "action_code": "RIDE_KM", "field": "ride_date", "window": {"type": "calendar_day"...` |

### 2.4 시즌 미션 (`window.type=season` — 59건 중 5건)

| code | csv_window | condition | window |
|---|---|---|---|
| `S-TET-01` | `Tet` | `50km 장거리` | `{"type":"season","label":"TET","raw":"Tet"}` |
| `S-TET-02` | `Tet` | `연휴 첫날` | `{"type":"season","label":"TET","raw":"Tet"}` |
| `S-TET-03` | `Tet` | `5일+ 라이딩` | `{"type":"season","label":"TET","raw":"Tet"}` |
| `S-TET-04` | `Tet` | `야간+조명 사진` | `{"type":"season","label":"TET","raw":"Tet"}` |
| `S-TET-05` | `Tet` | `공원 3곳` | `{"type":"season","label":"TET","raw":"Tet"}` |

### 2.5 드라이버 한정 미션 (`eligibility` — 18건 중 5건)

| code | condition | target_rule |
|---|---|---|
| `D-DL-01` | `영수증 1건` | `{"agg": "count_event", "target": 1, "action_code": "DELIVERY_RECEIPT", "window": {"type": "calendar_day"}, "eligibili...` |
| `D-DL-02` | `영수증 10건` | `{"agg": "count_event", "target": 10, "action_code": "DELIVERY_RECEIPT", "window": {"type": "calendar_day"}, "eligibil...` |
| `D-DL-03` | `영수증 30건` | `{"agg": "count_event", "target": 30, "action_code": "DELIVERY_RECEIPT", "window": {"type": "calendar_day"}, "eligibil...` |
| `D-DL-04` | `영수증 50건` | `{"agg": "count_event", "target": 50, "action_code": "DELIVERY_RECEIPT", "window": {"type": "calendar_day"}, "eligibil...` |
| `D-DL-05` | `19시 후 10건` | `{"agg": "count_event", "target": 10, "action_code": "DELIVERY_RECEIPT", "filters": {"time_of_day": {"from": "19:00", ...` |

---

## 3. 전체 매핑 결과

전체 240행은 `sre-mission-mapping-full.csv`에 있습니다 (엑셀로 열어 검토 권장).
아래는 카테고리별 첫 5건씩 표시한 발췌입니다.

| code | type | cat | condition → 요약 |
|---|---|---|---|
| `O-RD-01` | Onboarding | RIDING | `1km 라이딩` → agg=sum_field, target=1, action=RIDE_KM, win=onboarding |
| `O-RD-02` | Onboarding | RIDING | `누적 5km` → agg=sum_field, target=5, action=RIDE_KM, win=onboarding |
| `O-RD-03` | Onboarding | RIDING | `추천 퀘스트 1개` → agg=count_event, target=1, action=QUEST_COMPLETE, win=onboarding |
| `O-MT-01` | Onboarding | MAINT | `바이크 정보 입력` → agg=count_event, target=1, action=PROFILE_UPDATE, win=onboarding |
| `O-MT-02` | Onboarding | MAINT | `주유 영수증 1건` → agg=count_event, target=1, action=FUEL_RECEIPT, win=onboarding |
| `O-MT-03` | Onboarding | MAINT | `일일 점검 1회` → agg=count_event, target=1, action=DAILY_INSPECTION, win=onboarding |
| `O-MK-01` | Onboarding | MARKET | `부품 5개 조회` → agg=count_event, target=5, action=MARKET_BROWSE, win=onboarding |
| `O-MK-02` | Onboarding | MARKET | `판매자 문의 1건` → agg=count_event, target=1, action=MARKET_INQUIRY, win=onboarding |
| `O-CM-01` | Onboarding | COMMUNITY | `게시물 1건` → agg=count_event, target=1, action=POST_CREATE, win=onboarding |
| `O-CM-02` | Onboarding | COMMUNITY | `좋아요 3개` → agg=count_event, target=3, action=LIKE_RECEIVED, win=onboarding |
| `O-CM-03` | Onboarding | COMMUNITY | `초대 가입 1명` → agg=count_event, target=1, action=REFERRAL, win=onboarding |
| `O-DL-01` | Onboarding | DELIVERY | `드라이버 인증 시도` → agg=count_event, target=1, action=DRIVER_VERIFY, win=onboarding |
| `O-MX-01` | Onboarding | MIXED | `사진/닉네임/지역` → agg=count_event, target=1, action=PROFILE_UPDATE, win=onboarding |
| `O-MX-02` | Onboarding | MIXED | `신규 미션 8개+` → agg=count_mission_complete, target=8, win=onboarding |
| `D-RD-01` | Daily | RIDING | `누적 3km` → agg=sum_field, target=3, action=RIDE_KM, win=calendar_day |
| `D-RD-02` | Daily | RIDING | `누적 8km` → agg=sum_field, target=8, action=RIDE_KM, win=calendar_day |
| `D-RD-03` | Daily | RIDING | `District 2곳` → agg=count_distinct_district, target=2, action=RIDE_KM, win=calendar_day |
| `D-MT-01` | Daily | MAINT | `영수증 1건` → agg=count_event, target=1, action=MAINTENANCE_RECEIPT, win=calendar_day |
| `D-MT-02` | Daily | MAINT | `체크리스트` → agg=count_event, target=1, action=DAILY_INSPECTION, win=calendar_day |
| `D-MT-03` | Daily | MAINT | `등화 체크리스트` → agg=count_event, target=1, action=DAILY_INSPECTION, win=calendar_day |
| `D-MK-01` | Daily | MARKET | `부품 10개 조회` → agg=count_event, target=10, action=MARKET_BROWSE, win=calendar_day |
| `D-MK-02` | Daily | MARKET | `즐겨찾기 3건` → agg=count_event, target=3, action=MARKET_FAVORITE, win=calendar_day |
| `D-MK-03` | Daily | MARKET | `같은 부품 3건` → agg=count_event, target=3, action=MARKET_LISTING, win=calendar_day |
| `D-CM-01` | Daily | COMMUNITY | `코멘트 1건` → agg=count_event, target=1, action=COMMENT_POST, win=calendar_day |
| `D-CM-02` | Daily | COMMUNITY | `좋아요 5개` → agg=count_event, target=5, action=LIKE_RECEIVED, win=calendar_day |
| `D-CM-03` | Daily | COMMUNITY | `댓글 3개` → agg=count_event, target=3, action=COMMENT_POST, win=calendar_day |
| `D-DL-01` | Daily | DELIVERY | `영수증 1건` → agg=count_event, target=1, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `D-DL-02` | Daily | DELIVERY | `영수증 10건` → agg=count_event, target=10, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `D-DL-03` | Daily | DELIVERY | `영수증 30건` → agg=count_event, target=30, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `W-RD-01` | Weekly | RIDING | `누적 50km` → agg=sum_field, target=50, action=RIDE_KM, win=calendar_week |
| `W-RD-02` | Weekly | RIDING | `누적 100km` → agg=sum_field, target=100, action=RIDE_KM, win=calendar_week |
| `W-RD-03` | Weekly | RIDING | `5일+` → agg=count_distinct, target=5, action=RIDE_KM, win=calendar_week |
| `W-MT-01` | Weekly | MAINT | `영수증 5건` → agg=count_event, target=5, action=MAINTENANCE_RECEIPT, win=calendar_week |
| `W-MT-02` | Weekly | MAINT | `일일 점검 5일` → agg=count_event, target=5, action=DAILY_INSPECTION, win=calendar_week |
| `W-MT-03` | Weekly | MAINT | `정비 영수증 1건` → agg=count_event, target=1, action=MAINTENANCE_RECEIPT, win=calendar_week |
| `W-MK-01` | Weekly | MARKET | `등록 1건` → agg=count_event, target=1, action=MARKET_LISTING, win=calendar_week |
| `W-MK-02` | Weekly | MARKET | `등록 5건` → agg=count_event, target=5, action=MARKET_LISTING, win=calendar_week |
| `W-MK-03` | Weekly | MARKET | `거래 1건` → agg=count_event, target=1, action=MARKET_SUCCESS, win=calendar_week |
| `W-CM-01` | Weekly | COMMUNITY | `3건` → agg=count_event, target=3, action=REVIEW_PHOTO, win=calendar_week |
| `W-CM-02` | Weekly | COMMUNITY | `7장` → agg=count_event, target=7, action=PHOTO_UPLOAD, win=calendar_week |
| `W-CM-03` | Weekly | COMMUNITY | `가입 1명` → agg=count_event, target=1, action=REFERRAL, win=calendar_week |
| `W-DL-01` | Weekly | DELIVERY | `100건` → agg=count_event, target=100, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `W-DL-02` | Weekly | DELIVERY | `5일+` → agg=count_distinct, target=5, action=RIDE_KM, win=calendar_day [DRIVER] |
| `W-DL-03` | Weekly | DELIVERY | `19시 후 50건` → agg=count_event, target=50, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `M-RD-01` | Monthly | RIDING | `누적 300km` → agg=sum_field, target=300, action=RIDE_KM, win=calendar_month |
| `M-RD-02` | Monthly | RIDING | `누적 500km` → agg=sum_field, target=500, action=RIDE_KM, win=calendar_month |
| `M-RD-03` | Monthly | RIDING | `1000km` → agg=sum_field, target=1000, action=RIDE_KM, win=calendar_month |
| `M-MT-01` | Monthly | MAINT | `합 20건` → agg=count_event, target=20, action=MAINTENANCE_RECEIPT, win=calendar_month |
| `M-MT-02` | Monthly | MAINT | `정비소+점검 8` → agg=composite, target=, win=calendar_month |
| `M-MT-03` | Monthly | MAINT | `매주 4회` → agg=count_event, target=4, action=MAINTENANCE_RECEIPT, win=calendar_month |
| `M-MK-01` | Monthly | MARKET | `거래 3건` → agg=count_event, target=3, action=MARKET_SUCCESS, win=calendar_month |
| `M-MK-02` | Monthly | MARKET | `등록 15+별점 4.0` → agg=composite, target=, win=calendar_month |
| `M-MK-03` | Monthly | MARKET | `거래 5건` → agg=count_event, target=5, action=MARKET_SUCCESS, win=calendar_month |
| `M-CM-01` | Monthly | COMMUNITY | `15건+좋아요 100` → agg=composite, target=, win=calendar_month |
| `M-CM-02` | Monthly | COMMUNITY | `친구 5명` → agg=count_event, target=5, action=REFERRAL, win=calendar_month |
| `M-CM-03` | Monthly | COMMUNITY | `사진 30+TikTok 3` → agg=composite, target=, win=calendar_month |
| `M-DL-01` | Monthly | DELIVERY | `500건` → agg=count_event, target=500, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `M-DL-02` | Monthly | DELIVERY | `1000건` → agg=count_event, target=1000, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `M-DL-03` | Monthly | DELIVERY | `2000건` → agg=count_event, target=2000, action=DELIVERY_RECEIPT, win=calendar_day [DRIVER] |
| `M-MX-01` | Monthly | MIXED | `5개 카테고리` → agg=count_distinct_category, target=5, win=calendar_month |
| `M-MX-02` | Monthly | MIXED | `월 미션 5개+` → agg=count_mission_complete, target=5, win=calendar_month |
| `M-MX-03` | Monthly | MIXED | `5카테고리 각 100 RP` → agg=count_distinct_category, target=5, win=calendar_month |
| `S-TET-01` | Seasonal | RIDING | `50km 장거리` → agg=sum_field, target=50, action=RIDE_KM, win=season(TET) |
| `S-TET-02` | Seasonal | RIDING | `연휴 첫날` → agg=count_event, target=1, action=RIDE_KM, win=season(TET) |
| `S-TET-03` | Seasonal | RIDING | `5일+ 라이딩` → agg=count_distinct, target=5, action=RIDE_KM, win=season(TET) |
| `S-TET-04` | Seasonal | COMMUNITY | `야간+조명 사진` → agg=composite, target=, win=season(TET) |
| `S-TET-06` | Seasonal | MIXED | `5개 카테고리` → agg=count_distinct_category, target=5, win=season(TET) |
| `S-TET-07` | Seasonal | COMMUNITY | `Tết 1명 가입` → agg=count_event, target=1, action=RIDE_KM, win=season(TET) |
| `S-TET-08` | Seasonal | MIXED | `Tết 미션 4개+` → agg=count_mission_complete, target=4, win=season(TET) |
| `S-SPRING-04` | Seasonal | COMMUNITY | `3/8 라이딩+사진` → agg=composite, target=, win=season(SPRING) |
| `S-RAIN-04` | Seasonal | MAINT | `타이어+주유` → agg=composite, target=, win=season(RAINY) |
| `S-SUM-03` | Seasonal | MAINT | `영수증 2건` → agg=count_event, target=2, action=MAINTENANCE_RECEIPT, win=season(SUMMER) |
| `S-SUM-04` | Seasonal | MARKET | `거래 5건` → agg=count_event, target=5, action=MARKET_SUCCESS, win=season(SUMMER) |
| `S-INDEP-06` | Seasonal | MIXED | `시즌 미션 3개+` → agg=count_mission_complete, target=3, win=season(VN_INDEPENDENCE) |
| `A-MX-01` | Anniversary | MIXED | `주년 당일 라이딩` → agg=count_event, target=1, action=RIDE_KM, win=season(ANNUAL) |
| `A-MX-02` | Anniversary | MIXED | `가입 365일` → agg=sum_field, target=365, action=ACCOUNT_AGE, win=season(ANNUAL) |
| `A-MX-03` | Anniversary | RIDING | `12개월 5000km` → agg=sum_field, target=5000, action=RIDE_KM, win=season(ANNUAL) |
| `A-MX-04` | Anniversary | RIDING | `12개월 10000km` → agg=sum_field, target=10000, action=RIDE_KM, win=season(ANNUAL) |
| `A-MX-05` | Anniversary | COMMUNITY | `4주간 3명 가입` → agg=count_event, target=3, action=REFERRAL, win=season(ANNUAL) |
| `A-MX-06` | Anniversary | MIXED | `12개월 5카테고리` → agg=count_distinct_category, target=5, win=season(ANNUAL) |
| `A-MX-08` | Anniversary | RIDING | `4주 내 그룹 3회` → agg=count_event, target=3, action=RIDE_KM, win=season(ANNUAL) |

---

## 4. 신규 액션 코드 시드 필요 목록

설계서 §6 액션 테이블에는 12개만 정의되어 있으나, 240개 미션을 완전 매핑하려면 아래 액션이 `action_definition` 테이블에 추가되어야 합니다.

| action_code | 미션 사용 횟수 | 의미 |
|---|---:|---|
| `PHOTO_UPLOAD` | 22 | 사진 업로드 (정비/풍경/등불 등 범용) |
| `DAILY_INSPECTION` | 10 | 일일 차량 점검 1회 |
| `LIKE_RECEIVED` | 5 | 좋아요 받음 |
| `COMMENT_POST` | 5 | 댓글 작성 |
| `POST_CREATE` | 3 | 피드 게시물 작성 |
| `PROFILE_UPDATE` | 2 | 프로필 정보 입력 |
| `MARKET_BROWSE` | 2 | 부품 조회 |
| `MARKET_INQUIRY` | 2 | 판매자 문의 |
| `CAR_WASH_RECEIPT` | 2 | 세차 영수증 |
| `DRIVER_VERIFY` | 1 | 드라이버 인증 |
| `MARKET_FAVORITE` | 1 | 즐겨찾기 |
| `MARKET_CHAT` | 1 | 판매자 채팅 |
| `PART_REPLACE` | 1 | 부품 교체 인증 |
| `ACCOUNT_AGE` | 1 | 가입 경과일 (가상 액션) |

---

## 5. 검증 권장 사항

1. **CSV의 240개 전체를 엑셀로 열어 condition → target_rule 매핑이 의도와 맞는지 검증**합니다 (특히 composite, 메타 미션).
2. 신규 액션 코드 14개의 명칭·의미를 확정한 뒤 `action_definition` 시드 SQL을 별도 작성해야 합니다.
3. Seasonal 미션 59개는 매년 캠페인 일정(`starts_at`/`ends_at`)을 시즌 라벨별로 수동 설정하는 운영 절차가 필요합니다.
4. 드라이버 한정 미션 18개는 미션 추천 모듈이 `target_rule.eligibility.account_type` 필드를 반드시 검사해야 합니다.
