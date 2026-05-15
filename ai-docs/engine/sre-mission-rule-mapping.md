# Mission `condition` → `target_rule` 변환 규칙 v1

미션 CSV의 자연어 `condition` 컬럼을 `mission_definition.target_rule` (JSONB) 컬럼으로 변환하는 규칙 정의서입니다. 운영 중 미션 추가/수정 시에도 이 규칙을 따라 작성하면 미션 평가 엔진이 별도 수정 없이 동작합니다.

- 대상 테이블: `mission_definition.target_rule JSONB NOT NULL`
- 시드 생성 스크립트: `build_mission_seed.py`
- 시드 SQL: `sre-mission-seed.sql` (240행, 자동 파싱 100%)
- 매핑 결과 리포트: `sre-mission-mapping-report.md`

---

## 1. `target_rule` JSON 스키마

```jsonc
{
  // 필수: 집계 방식
  "agg": "sum_field | count_event | count_distinct | count_distinct_district
         | count_distinct_category | count_mission_complete | streak_days | composite",

  // 필수: 목표 수치 (composite일 때는 없음)
  "target": 30,

  // 조건부: 집계 대상 액션 (composite, count_distinct_category일 때는 없거나 __META__)
  "action_code": "RIDE_KM",

  // 조건부: sum_field / count_distinct일 때 합산·중복제거 대상 필드
  "field": "distance_km",

  // 선택: 추가 필터
  "filters": {
    "time_of_day": { "from": "05:00", "to": "07:00" },
    "date":        { "date": "12-31", "label": "NYE" },
    "weather":     "RAIN | HEAVY_RAIN",
    "speed_kmh":   { "min": 25, "max": 40 },
    "geo": {
      "type":   "district | district_count | district_all | poi | road | city | area | road_type | novel_road | novel_route | poi_category",
      "values": ["..."],
      "target": 5    // type=*_count 일 때
    },
    "min_duration_min": 30,
    "max_duration_min": 15
  },

  // 선택: 미션 평가 윈도우 (mtype별 기본값 자동 부여)
  "window": {
    "type": "calendar_day | calendar_week | calendar_month | rolling_days
           | onboarding | season | custom",
    "days":  14,
    "label": "TET | XMAS | SUMMER | SPRING | RAINY | DRY_SEASON
           | VN_INDEPENDENCE | MID_AUTUMN | ANNIVERSARY_1Y | ...",
    "raw":   "원본 자연어"
  },

  // 선택: 사용자 자격 필터 (특정 계정 유형 한정)
  "eligibility": {
    "account_type": ["STANDARD", "DRIVER", "BUSINESS"],   // 화이트리스트
    "min_account_age_days": 0                              // 최소 가입 경과일
  },

  // composite일 때
  "composite": {
    "operator": "AND | OR",
    "children": [ <rule>, <rule> ]
  }
}
```

### `agg` 별 의미

| `agg` | 의미 | 필수 필드 | 예시 condition |
|---|---|---|---|
| `sum_field` | 특정 필드의 누적 합계 | `action_code`, `field` | `누적 5km`, `1000km` |
| `count_event` | 이벤트 개수 카운트 | `action_code` | `정비 영수증 1건`, `좋아요 3개` |
| `count_distinct` | 특정 필드의 고유값 개수 | `action_code`, `field` | `District 2곳`, `카페 5곳` |
| `count_distinct_district` | District 단위 고유 카운트 | - | `5개 District`, `전 District` |
| `count_distinct_category` | 카테고리 단위 고유 카운트 | - | `5개 카테고리` |
| `count_mission_complete` | 다른 미션 완료 개수 | - | `시즌 미션 3개+`, `신규 미션 8개+` |
| `streak_days` | 연속일 카운트 | `action_code` | `7일 연속` |
| `composite` | AND/OR 결합 | `composite.children` | `야간+조명 사진`, `타이어+주유` |

---

## 2. 파싱 우선순위

규칙은 위에서 아래 순서로 적용되며, 먼저 매칭된 규칙이 적용됩니다.

```
0. 복합 조건 감지 (조건 안에 ' + '가 있고 단순 수식어가 아닌 경우)
     → composite로 분해, 각 child를 재귀적으로 파싱

1. extract_filters()  — 모든 필터 키워드를 우선 추출 (시간/날짜/날씨/지역/속도/지속시간)

2. extract_action_and_target()  — 단위(km/건/장/명/회/일/곳)와 액션 키워드 매칭

3. fallback_parse()  — 위에서 매칭 실패 시 카테고리·키워드 기반 추정
     - 1회성 인증 (프로필 입력, 드라이버 인증)
     - 단순 사진 인증 (체인 사진, 압력 사진 등 → PHOTO_UPLOAD ×1)
     - 체크리스트 / 점검 (DAILY_INSPECTION ×N)
     - 누적 시간 (N시간 → RIDE_KM.duration_minutes)
     - 장소 N곳 (카페·다리·랜드마크·공원·시장)
     - District N개 / 전 District
     - 가입 N일 (ACCOUNT_AGE)
     - 출/퇴근 분리 (RIDE_KM ×2)
     - 댓글 / 좋아요 합계
     - 필터만 있고 횟수 없음 → 라이딩 1회로 간주
```

---

## 3. 액션 코드 (`action_code`) 어휘집

미션 평가 엔진이 인식해야 하는 액션 코드 목록입니다. `action_definition` 테이블 시드와 일치해야 합니다.

| `action_code` | 정의 | 비고 |
|---|---|---|
| `RIDE_KM` | 1km 주행 (raw event는 거리 단위 누적) | `payload.distance_km` 사용 |
| `QUEST_COMPLETE` | 퀘스트 완료 | |
| `STREAK_7` | 7일 연속 라이딩 보너스 | |
| `GROUP_RIDE` | 그룹 라이딩 (3명 이상) | |
| `MAINTENANCE_RECEIPT` | 정비 영수증 인증 | |
| `FUEL_RECEIPT` | 주유 영수증 인증 | |
| `DELIVERY_RECEIPT` | 배달 영수증 인증 | |
| `MARKET_LISTING` | 중고 부품 등록 | |
| `MARKET_SUCCESS` | 거래 성공 | |
| `MARKET_BROWSE` | 부품 조회 | 추가 필요 |
| `MARKET_CHAT` | 채팅 | 추가 필요 |
| `MARKET_INQUIRY` | 판매자 문의 | 추가 필요 |
| `MARKET_FAVORITE` | 즐겨찾기 | 추가 필요 |
| `REVIEW_PHOTO` | 리뷰 사진 작성 | |
| `REFERRAL` | 친구 초대 가입 성공 | |
| `SHARE_SNS` | TikTok/Zalo 공유 | |
| `POST_CREATE` | 피드 게시물 작성 | 추가 필요 |
| `COMMENT_POST` | 댓글 작성 | 추가 필요 |
| `LIKE_RECEIVED` | 좋아요 받음 | 추가 필요 |
| `PHOTO_UPLOAD` | 사진 업로드 (정비/풍경/등불 등) | 추가 필요 |
| `DAILY_INSPECTION` | 일일 점검 (체크리스트 1회) | 추가 필요 |
| `CAR_WASH_RECEIPT` | 세차 영수증 | 추가 필요 |
| `PART_REPLACE` | 부품 교체 인증 | 추가 필요 |
| `PROFILE_UPDATE` | 프로필 정보 입력 | 추가 필요 |
| `DRIVER_VERIFY` | 드라이버 인증 | 추가 필요 |
| `ACCOUNT_AGE` | 가입 경과일 (시간 누적 가상 액션) | 시스템 가상 |
| `__META__` | 다른 미션 카운트용 가상 액션 | 시스템 가상 |

> **주의**: "추가 필요" 표시된 액션은 `action_definition` 테이블 시드에 추가해야 합니다. 현재 DDL의 INSERT에는 RIDE_KM 등 12개만 있으므로, 미션 시드 적용 전에 액션 코드 시드를 확장해야 합니다.

---

## 4. 필터 키워드 매핑표

### 시간대 (`filters.time_of_day`)

| 자연어 | JSON |
|---|---|
| `05-07시` | `{ "from": "05:00", "to": "07:00" }` |
| `19-22시` | `{ "from": "19:00", "to": "22:00" }` |
| `새벽` | `{ "from": "05:00", "to": "07:00" }` |
| `야간` | `{ "from": "19:00", "to": "22:00" }` |
| `19시 후` | `{ "from": "19:00", "to": "23:59" }` |

### 날짜 / 캠페인 (`filters.date`)

| 자연어 | JSON |
|---|---|
| `12/24-25` | `{ "from": "12-24", "to": "12-25", "label": "XMAS" }` |
| `12/31` | `{ "date": "12-31", "label": "NYE" }` |
| `9/2` | `{ "date": "09-02", "label": "VN_NATIONAL_DAY" }` |
| `3/8` | `{ "date": "03-08", "label": "INTL_WOMENS_DAY" }` |
| `5/1` | `{ "date": "05-01", "label": "LABOR_DAY" }` |
| `10/20` | `{ "date": "10-20", "label": "VN_WOMENS_DAY" }` |
| `Tết` | `{ "period": "TET" }` |
| `연휴` | `{ "period": "HOLIDAY" }` |
| `주년` | `{ "period": "SERVICE_ANNIVERSARY" }` |

### 날씨 (`filters.weather`)

| 자연어 | 값 |
|---|---|
| `폭우` | `HEAVY_RAIN` |
| `강수`, `비 ` | `RAIN` |

### 지역 (`filters.geo`)

| 자연어 | JSON |
|---|---|
| `District 1 통과` | `{ "type": "district", "values": ["District 1"] }` |
| `5개 District` | `{ "type": "district_count", "target": 5 }` |
| `District 2곳` | `{ "type": "district_count", "target": 2 }` |
| `전 District` | `{ "type": "district_all" }` |
| `Saigon Bridge` | `{ "type": "poi", "values": ["Saigon Bridge"] }` |
| `NH1A` | `{ "type": "road", "values": ["NH1A"] }` |
| `Thu Duc City 진입` | `{ "type": "city", "values": ["Thu Duc"] }` |
| `PMH 진입` | `{ "type": "area", "values": ["Phu My Hung"] }` |
| `강변` | `{ "type": "road_type", "values": ["riverside"] }` |
| `미통과 도로` | `{ "type": "novel_road" }` |
| `신규 경로` | `{ "type": "novel_route" }` |
| `야시장` | `{ "type": "poi_category", "values": ["night_market"] }` |
| `재래시장` | `{ "type": "poi_category", "values": ["traditional_market"] }` |
| `카페`, `다리`, `랜드마크`, `공원` | `count_distinct` 집계용 카테고리 |

---

## 5. 윈도우 매핑 (CSV `window` 컬럼 → `target_rule.window`)

| CSV 값 | JSON | 비고 |
|---|---|---|
| `-` + type=Daily | `{ "type": "calendar_day" }` | |
| `-` + type=Weekly | `{ "type": "calendar_week" }` | |
| `-` + type=Monthly | `{ "type": "calendar_month" }` | |
| `신규 14일` | `{ "type": "onboarding", "days": 14 }` | |
| `Tet` | `{ "type": "season", "label": "TET", "raw": "Tet" }` | 베트남 음력설 |
| `Summer` | `{ "type": "season", "label": "SUMMER", ... }` | 6~8월 |
| `Spring` | `{ "type": "season", "label": "SPRING", ... }` | 3~4월 |
| `Rain` | `{ "type": "season", "label": "RAINY", ... }` | 5~10월 우기 |
| `Dry` | `{ "type": "season", "label": "DRY_SEASON", ... }` | 11~4월 건기 |
| `Xmas` | `{ "type": "season", "label": "XMAS", ... }` | 12/24~12/25 |
| `Indep` | `{ "type": "season", "label": "VN_INDEPENDENCE", ... }` | 9/2 국경일 |
| `Mid` | `{ "type": "season", "label": "MID_AUTUMN", ... }` | 중추절 |
| `1주년` | `{ "type": "season", "label": "ANNIVERSARY_1Y", ... }` | |
| `드라이버` | `{ "type": "calendar_day" }` + `eligibility.account_type=["DRIVER"]` | 윈도우가 아니라 자격 필터 |
| 기타 | `{ "type": "custom", "raw": "<원본>" }` | 수동 검토 필요 |

> **시즌 미션 운영 모델**: `target_rule.window.label`은 시즌 식별자만 표현하고, 실제 시작·종료 일정은 `mission_definition.starts_at` / `ends_at` 컬럼으로 관리합니다. 매년 같은 시즌 라벨로 starts_at/ends_at만 갱신하면 됩니다. 평가 엔진은 윈도우 라벨로 시즌 카탈로그를 구분하고, 실제 시간 필터는 starts_at/ends_at으로 결정합니다.

> **드라이버 미션 자격**: CSV의 `window=드라이버` 미션 18개는 드라이버 인증 계정에만 노출됩니다. `target_rule.eligibility.account_type`이 사용자의 `sre_user.account_type`을 화이트리스트로 검사하며, 미해당 사용자에게는 미션 추천·진행도가 생성되지 않습니다.

미션 타입별 기본 `duration_hours` (테이블 컬럼):

| Type | `duration_hours` | `is_repeatable` |
|---|---:|:---:|
| Onboarding | 336 (14일) | FALSE |
| Daily | 24 | TRUE |
| Weekly | 168 | TRUE |
| Monthly | 720 | TRUE |
| Seasonal | NULL (캠페인별 `starts_at`/`ends_at`로 제어) | FALSE |
| Anniversary | 24 | FALSE |

---

## 6. 변환 예시

### 단순 누적 거리
```
condition: "누적 5km"
→ {
    "agg": "sum_field",
    "target": 5,
    "action_code": "RIDE_KM",
    "field": "distance_km"
  }
```

### 시간대 + 횟수
```
condition: "05-07시 5일"  (window=Weekly)
→ {
    "agg": "count_distinct",
    "target": 5,
    "action_code": "RIDE_KM",
    "field": "ride_date",
    "filters": { "time_of_day": { "from": "05:00", "to": "07:00" } },
    "window": { "type": "calendar_week" }
  }
```

### 필터만 있는 1회 미션
```
condition: "Saigon Bridge"
→ {
    "agg": "count_event",
    "target": 1,
    "action_code": "RIDE_KM",
    "filters": { "geo": { "type": "poi", "values": ["Saigon Bridge"] } }
  }
```

### 복합 조건 (AND)
```
condition: "야간+조명 사진"
→ {
    "agg": "composite",
    "operator": "AND",
    "children": [
      { "agg": "count_event", "target": 1, "action_code": "RIDE_KM",
        "filters": { "time_of_day": { "from": "19:00", "to": "22:00" } } },
      { "agg": "count_event", "target": 1, "action_code": "PHOTO_UPLOAD" }
    ]
  }
```

### 메타 미션 (다른 미션 카운트)
```
condition: "시즌 미션 3개+"
→ {
    "agg": "count_mission_complete",
    "target": 3,
    "filters": { /* 시즌 미션만 카운트하는 룰은 평가 엔진에서 처리 */ }
  }
```

### 누적 시간
```
condition: "누적 10시간"
→ {
    "agg": "sum_field",
    "target": 600,
    "action_code": "RIDE_KM",
    "field": "duration_minutes"
  }
```

### 누적 일수 / 가입 경과일
```
condition: "가입 365일"
→ {
    "agg": "sum_field",
    "target": 365,
    "action_code": "ACCOUNT_AGE",
    "field": "days"
  }
```

---

## 7. 평가 엔진에 대한 함의

미션 평가 엔진(Mission Module)은 위 스키마를 해석할 수 있어야 하며, 최소한 다음 인터페이스를 구현해야 합니다.

```
evaluate(user_id, target_rule) -> { current_value, target_value, completed }
```

엔진 내부 처리 흐름:

1. `window` 해석 → 평가 대상 기간 결정 (예: `calendar_week` → 이번 주 월~일)
2. `filters` 적용 → 이벤트 후보 필터링 (`action_event` + `payload` JSONB 조건)
3. `agg` 적용 → 집계
   - `sum_field`  : `SUM(payload->>field)::numeric`
   - `count_event`: `COUNT(*)`
   - `count_distinct`: `COUNT(DISTINCT payload->>field)`
   - `streak_days`: 윈도우 내 연속일 최대값
   - `composite` : children 각각 평가 후 AND/OR 결합
4. `current_value >= target` → `user_mission_progress.status = COMPLETED`

평가 엔진의 SQL 생성은 별도 문서(`mission-evaluator-spec.md`)로 분리해야 하지만, 위 스키마 자체는 안정적입니다.

---

## 8. 운영 시 주의사항

1. **신규 액션 코드 추가 시**: `action_definition` 테이블에 먼저 INSERT한 뒤 미션을 추가해야 외래키 제약을 위반하지 않습니다 (단, 현재 DDL에서 `mission_definition.target_rule` 안의 action_code는 FK가 아닌 단순 JSON 문자열이므로 제약은 약함 — 어플리케이션 레벨에서 검증 필요).
2. **`__META__` 액션**: 다른 미션 완료를 카운트하는 가상 액션. `action_definition`에는 `is_active=FALSE`로 더미 레코드만 두거나, 평가 엔진에서 별도 분기 처리.
3. **`_unparsed` 마크**: 자동 파싱 실패 시 `{ "_unparsed": true, "raw": "<원본>" }`로 저장됨. 운영 중 발견되면 즉시 검토 후 정상 규칙으로 교체해야 합니다. 현재 시드는 0건.
4. **시즌 미션의 시작/종료**: `target_rule.window`에는 label만 있고 실제 날짜는 `mission_definition.starts_at` / `ends_at` 컬럼에 별도 세팅이 필요합니다. 현재 시드 SQL은 이 두 컬럼을 NULL로 두므로, Seasonal 미션 활성화 시 관리자가 매 시즌 캠페인 일정을 설정해야 합니다. 시즌 라벨이 같으면 매년 같은 미션 셋을 재활성화할 수 있습니다.
5. **드라이버 한정 미션 18개**: `target_rule.eligibility.account_type=["DRIVER"]`로 태그됨. 미션 추천 모듈은 이 필드를 먼저 검사해 비드라이버 사용자에게 노출하지 않아야 합니다. 또한 일일 RP 상한(설계서 §6: 일반 250 / 드라이버 2000)도 같은 자격 기준을 따릅니다.
6. **윈도우 `custom`의 의미**: 현재 시드 SQL에는 custom 윈도우가 0건입니다. 향후 미션 추가 시 custom으로 떨어지면 라벨 매핑 표(§5)를 보강하거나 평가 엔진이 `window.raw`를 해석하도록 확장해야 합니다.
