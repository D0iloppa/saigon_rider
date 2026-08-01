# Quest FK Mapping 태스크 (2025-05-15)

## 배경

퀘스트 테이블의 `district`, `rider_type`, `min_safety_grade` 컬럼을 문자열 enum이 아닌
마스터 테이블(FK)로 전환한 이후, 기존 241개 퀘스트에 대해 적절한 FK 값을 backfill 했다.

**원칙**
- NULL = 해당 속성과 무관한 퀘스트 (어떤 지역/타입/등급이어도 수행 가능)
- 필터 시 NULL 퀘스트도 결과에 포함됨 (`OR IS NULL` 패턴)

---

## 매핑 결과 요약

| 구분 | 매핑된 퀘스트 수 | NULL (제한 없음) |
|------|-----------------|-----------------|
| district | 5 | 236 |
| rider_type | 241 | 0 |
| min_safety_grade | 241 | 0 |
| 총 active 퀘스트 | 241 | — |

### 2026-05-16 갱신 — rider_type / safety_grade 전면 매핑

NULL 허용 정책에서 **반드시 매핑** 정책으로 전환 (`014_quest_full_mapping.sql`).

**정책**
1. 키워드 우선 (기존 매핑 유지)
2. NULL 잔여는 `period` 기반 폴백
   - rider_type:   DAILY→COMMUTER, WEEKLY→CAFE_HUNTER, EVENT→NIGHT_RIDER
   - safety_grade: DAILY→A,        WEEKLY→B,           EVENT→C

**최종 분포**
- rider_type:   COMMUTER 57 / CAFE_HUNTER 66 / NIGHT_RIDER 118
- safety_grade: A 64 / B 68 / C 109
- district 는 NULL 유지 (지역명 명시된 5건만 매핑)

---

## District 매핑 (5건)

지역명이 퀘스트 제목에 명시된 경우에만 district_id 할당.
나머지 236건은 NULL — 어느 지역 라이더도 수행 가능.

| 퀘스트명 | period | district_code | 매핑 근거 |
|---------|--------|---------------|----------|
| District 1 마스터 | DAILY | QUAN_1 | 제목에 "District 1" 명시 |
| Test Quest | DAILY | QUAN_1 | 테스트 데이터, QUAN_1 기본 할당 |
| Phu My Hung 라이딩 | DAILY | QUAN_7 | Phu My Hung은 7군 소재 |
| District 7 탐험 | DAILY | QUAN_7 | 제목에 "District 7" 명시 |
| Thu Duc 횡단 | DAILY | THU_DUC | 제목에 "Thu Duc" 명시 |

---

## Rider Type 매핑 (28건)

퀘스트 특성(시간대, 목적)이 라이더 타입과 명확히 일치하는 경우 할당.

### COMMUTER (5건) — 통근/출퇴근 테마
| 퀘스트명 | period | 매핑 근거 |
|---------|--------|----------|
| 출퇴근 라이더 | DAILY | 제목에 출퇴근 명시 |
| 통근 왕복 | DAILY | 제목에 통근 명시 |
| 점심시간 라이딩 | DAILY | 점심시간 = 통근 패턴 |
| 오늘의 첫 배차 | DAILY | 첫 배차 = 출근 라이더 |
| 통근 풀패스 | WEEKLY | 제목에 통근 명시 |

### CAFE_HUNTER (4건) — 카페 탐방 테마
| 퀘스트명 | period | 매핑 근거 |
|---------|--------|----------|
| 카페 투어 | DAILY | 제목에 카페 명시 |
| 카페 투어 5곳 | WEEKLY | 제목에 카페 명시 |
| 봄 카페 투어 | EVENT | 제목에 카페 명시 |
| 카페 투어 10곳 | EVENT | 제목에 카페 명시 |

### NIGHT_RIDER (19건) — 야간/새벽 테마
| 퀘스트명 | period | 매핑 근거 |
|---------|--------|----------|
| 야간 라이더 | DAILY | 제목에 야간 명시 |
| 새벽 라이더 | DAILY | 제목에 새벽 명시 |
| 야시장 코스 | DAILY | 야시장 = 야간 활동 |
| 야간 10건 | DAILY | 제목에 야간 명시 |
| 새벽 3회 | WEEKLY | 제목에 새벽 명시 |
| 야간 100km | WEEKLY | 제목에 야간 명시 |
| 야간 5일 | WEEKLY | 제목에 야간 명시 |
| 새벽 5일 | WEEKLY | 제목에 새벽 명시 |
| 야간 50건 | WEEKLY | 제목에 야간 명시 |
| 새벽 30건 | WEEKLY | 제목에 새벽 명시 |
| Lantern Night Ride | EVENT | Night Ride 명시 |
| 야간 우중 라이딩 | EVENT | 제목에 야간 명시 |
| 야간 라이더 월간 | EVENT | 제목에 야간 명시 |
| 새벽 봄 라이딩 | EVENT | 제목에 새벽 명시 |
| 여름 야간 100km | EVENT | 제목에 야간 명시 |
| 폭염 새벽 라이더 | EVENT | 제목에 새벽 명시 |
| 야간 퍼레이드 | EVENT | 제목에 야간 명시 |
| 새벽 라이더 월간 | EVENT | 제목에 새벽 명시 |
| 새벽 골든아워 | EVENT | 제목에 새벽 명시 |

---

## Safety Grade 매핑 (5건)

안전/정속 키워드가 제목에 명시된 경우 `A`등급(최고) 요건 할당.

| 퀘스트명 | period | safety_grade_code | 매핑 근거 |
|---------|--------|-------------------|----------|
| 정속 라이더 | DAILY | A | 정속 = 안전운전 요건 |
| 매너 라이더 | DAILY | A | 매너 = 안전운전 요건 |
| 안전 라이더 | WEEKLY | A | 제목에 안전 명시 |
| 정속 마스터 | WEEKLY | A | 정속 = 안전운전 요건 |
| 안전 라이더 월간 | EVENT | A | 제목에 안전 명시 |

---

## NULL로 남겨둔 퀘스트 (203건)

거리, 기간, EXP 등 일반 목표만 있고 지역/타입/등급 특성이 없는 퀘스트.
예: "10km 라이딩", "주간 50km", "첫 라이딩", "레인보우 코스" 등.
이런 퀘스트는 모든 라이더가 필터 조건과 무관하게 항상 조회된다.

---

## DB UPDATE 스크립트 (실행 완료)

```sql
-- District
UPDATE quests SET district_id = 1 WHERE title_ko LIKE '%District 1%' OR title_ko LIKE '%Test Quest%';
UPDATE quests SET district_id = 6 WHERE title_ko LIKE '%Phu My Hung%' OR title_ko LIKE '%District 7%';
UPDATE quests SET district_id = 17 WHERE title_ko LIKE '%Thu Duc%';

-- Rider type
UPDATE quests SET rider_type_id = 1 WHERE title_ko SIMILAR TO '%(통근|출퇴근|점심시간|첫 배차)%';
UPDATE quests SET rider_type_id = 2 WHERE title_ko LIKE '%카페%';
UPDATE quests SET rider_type_id = 3 WHERE title_ko SIMILAR TO '%(야간|새벽|Night)%' OR title_ko LIKE '%야시장%';

-- Safety grade
UPDATE quests SET min_safety_grade_id = 1 WHERE title_ko SIMILAR TO '%(안전|정속|매너)%';
```

**실행 결과**: district=5, rider_type=28, safety_grade=5, total=241
