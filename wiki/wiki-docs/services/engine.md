---
sidebar_position: 4
title: SRE Engine
---

# Saigon Rider Engine (SRE)

> **Saigon Rider Reward Engine** — 라이딩·미션·보상의 RP(리워드 포인트) 경제를 전담하는 채널-중립 마이크로서비스.
>
> 핵심 원칙: **"엔진은 똑똑하게, 보상은 단순하게"**
>
> 이 문서는 SRE의 **설계 의도·도메인 용어·핵심 규칙**을 한 곳에 모은 공개 레퍼런스입니다. 코드 변경 시 함께 갱신해 주세요.

---

## 1. SRE는 무엇이고, 왜 분리되어 있는가

SRE는 **"어떤 사용자가 어떤 행동을 했다"는 이벤트만 받아 RP를 계산·적립·교환하는 책임**만 갖습니다. UI / 인증 / 푸시 / 결제 / GPS 트래킹은 모두 SRE 바깥의 책임입니다.

### 분리 이유

| 분리하지 않을 때 | 분리할 때 |
|---|---|
| UI 변경 시 보상 로직 재배포 | 영향 없음 |
| 마켓·관리자·외부 파트너에 보상 로직 중복 | API 호출 한 줄 |
| 룰 변경 시 앱 업데이트 필요 | 룰 테이블만 수정 |
| 클라이언트 검증 신뢰 불가 | 서버 단일 진입점에서 어뷰징 검증 |
| 정산·감사 분산 | 단일 트랜잭션 원장 |

### In-Scope (SRE가 한다)
- 행동 이벤트 수집 → RP 계산 → 적립
- 미션 정의 / 진행률 / 완료 처리
- 다양성 계수 / 등급 / 스트릭 계산
- RP 잔액 / 거래 원장 / 만료
- 보상 카탈로그 / 교환 / 외부 발급 API 호출
- 어뷰징 검증 (속도·빈도·GPS·중복)
- 모든 거래의 감사 로그

### Out-of-Scope (SRE가 하지 않는다)
- 사용자 인증·세션 (BFF/Auth 서비스 담당)
- 푸시 알림 발송 (Notification 서비스가 SRE 이벤트를 구독)
- GPS 트래킹·지도 렌더링 (모바일 앱)
- 피드 게시물·댓글 (BFF)
- 결제 (v2 마켓플레이스)

---

## 2. 도메인 경계 다이어그램

```
┌──────────────────────────────────────────────────────────────┐
│                  Saigon Rider Mobile App                     │
│   (UI, 라이딩 추적, 화면 흐름, 알림, 인증)                    │
└────────────────────────┬─────────────────────────────────────┘
                         │  (앱은 SRE를 직접 호출하지 않음)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                BFF Gateway (FastAPI)                         │
│   - 인증, 세션, 화면별 데이터 조립                            │
│   - X-Service-Key + X-User-Id 헤더로 SRE 호출                │
└────────────────────────┬─────────────────────────────────────┘
                         │  HTTPS / REST
                         │  POST /v1/events, GET /v1/users/{id}/balance ...
                         ▼
┌──────────────────────────────────────────────────────────────┐
│        Saigon Rider Reward Engine (SRE) — :8090              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐   │
│  │ Event Bus  │ │ Mission    │ │ Point      │ │ Reward   │   │
│  └────────────┘ └────────────┘ │ Ledger     │ └──────────┘   │
│  ┌────────────┐ ┌────────────┐ └────────────┘ ┌──────────┐   │
│  │ Anti-Abuse │ │ Diversity  │ ┌────────────┐ │ Audit    │   │
│  └────────────┘ │ Calculator │ │ Tier &     │ │ Log      │   │
│                 └────────────┘ │ Streak     │ └──────────┘   │
│                                └────────────┘                │
│  + APScheduler 4종 일배치 (RP 만료, 정합성 검증 등)           │
└────────────────────────┬─────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
   ┌────────────────────┐   ┌────────────────────┐
   │  PostgreSQL 15     │   │  External Partners │
   │  (SRE 스키마)       │   │  Got It / Urbox /  │
   │                    │   │  Viettel Topup ... │
   └────────────────────┘   └────────────────────┘
```

---

## 3. 용어집 (Glossary)

설계 문서 전체에 반복 등장하는 용어들. 새 문서를 작성할 때는 여기 정의된 표현을 그대로 쓰세요.

| 용어 | 정의 |
|---|---|
| **SRE** | Saigon Rider (Reward) Engine — 본 서비스 |
| **RP** | Reward Point. 사용자가 축적하는 단일 화폐 단위. `BIGINT` 정수로 저장 |
| **Action** | 사용자가 일으킨 의미 있는 행동 (`RIDE_KM`, `QUEST_COMPLETE` 등). `action_definition` 테이블의 한 행 |
| **Action Event** | Action이 실제로 발생한 1건의 인스턴스. `action_event` 테이블의 한 행 |
| **action_code** | Action의 식별자 문자열 (예: `RIDE_KM`). DB 외래키이자 미션/룰 어휘 |
| **payload** | Action Event에 첨부되는 JSONB 메타데이터 (`distance_km`, `ride_id`, `weather` 등) |
| **base_rp** | Action 정의에 명시된 기본 RP (예: RIDE_KM은 1km당 1) |
| **volume** | 이벤트의 수량 계수. `payload`에서 추출 (예: `distance_km` 값), 없으면 1 |
| **diversity_multiplier** | 다양성 계수. 월간 활성 카테고리 수에 따라 1.0~2.0 |
| **abuse_penalty** | 어뷰징 페널티 배율. 1.0 = 페널티 없음 |
| **final_rp** | `ROUND(base_rp × volume × diversity × abuse_penalty)` 의 결과. 실제 적립되는 정수 RP |
| **Mission** | 사용자에게 부여되는 달성 과제. `mission_definition` (정의) + `user_mission_progress` (진행도) |
| **target_rule** | 미션의 달성 조건을 표현하는 JSONB 스키마 (`agg`/`target`/`action_code`/`filters`/`window`) |
| **Tier** | 누적 RP + 다양성 카테고리 기준의 사용자 등급 (Rookie → Rider → Veteran → Pro → Legend) |
| **Streak** | 연속 라이딩 일수 |
| **Category** | 행동의 상위 분류 (`RIDING`, `MAINT`, `MARKET`, `COMMUNITY`, `DELIVERY` — 5종) |
| **Ledger** | 이중 원장. `rp_transaction` (진실의 원천) + `rp_balance` (캐시 잔액) |
| **Idempotency Key** | 호출자가 발급하는 중복 차단 키 (예: `ride-9876-final`). 7일 TTL |
| **Redemption** | 보상 교환 1건. `reward_redemption` 행 |
| **Voucher Code** | 외부 파트너로부터 받은 발급 코드 (UUID 또는 외부 시스템 코드) |
| **Adapter** | 외부 파트너별 발급 인터페이스 (`InternalAdapter`, `StubPartnerAdapter`, `ManualPartnerAdapter`) |
| **Advisory Lock** | PostgreSQL의 애플리케이션 정의 락. APScheduler 일배치의 단일 실행 보장에 사용 |
| **VN_TZ** | `Asia/Ho_Chi_Minh` (UTC+7). 월 경계·일배치 시각의 기준 타임존 |
| **`__META__`** | 다른 미션 완료 개수를 카운트하는 시스템 가상 액션 |

---

## 4. 8개 모듈 책임 정의

SRE 내부는 8개 논리 모듈로 구성되며, `engine/app/services/` 하위 파일과 1:1 대응됩니다.

| # | 모듈 | 책임 | 파일 |
|---|---|---|---|
| 1 | **Event Bus** | 외부 이벤트의 단일 진입점. 인증·멱등성·라우팅 | `services/event_bus.py` |
| 2 | **Mission Module** | 미션 CRUD, 진행률 추적, 자동 추천, 완료 처리 | `services/mission.py` |
| 3 | **Point Ledger** | `rp_transaction` 이중 원장, `rp_balance` 캐시, 만료 처리 | `services/point_ledger.py` |
| 4 | **Reward Module** | 보상 카탈로그, 교환 트랜잭션, 외부 발급 호출, 실패 환불 | `services/reward.py` |
| 5 | **Anti-Abuse Module** | 속도·빈도·GPS·중복 검증, REJECT / REDUCE / CAP 룰 평가 | `services/anti_abuse.py` |
| 6 | **Tier & Streak** | 누적 RP + 다양성으로 등급 갱신, 연속일 추적 | `services/tier.py` |
| 7 | **Diversity Calculator** | 월간 카테고리 카운트, 다양성 계수 1.0~2.0 계산 | `services/diversity.py` |
| 8 | **Audit Log** | 모든 RP 변동·교환·미션 완료의 영구 기록 | `services/audit.py` |

---

## 5. 데이터 모델 개요

### 5.1 도메인별 테이블 그룹

| 도메인 | 테이블 |
|---|---|
| 사용자 식별 | `sre_user` (외부 user_id 매핑만) |
| 이벤트 | `action_definition`, `action_event` |
| 미션 | `mission_definition`, `user_mission_progress`, `mission_recommendation` |
| 포인트 (Ledger) | `rp_balance`, `rp_transaction`, `rp_expiration_schedule` |
| 다양성 / 등급 | `behavior_category_log`, `user_diversity_score`, `tier_definition`, `user_tier` |
| 보상 | `reward_partner`, `reward_catalog`, `reward_redemption` |
| 어뷰징 | `abuse_rule`, `abuse_event`, `idempotency_key` |
| 감사 | `audit_log` |

### 5.2 핵심 원칙: 진실의 원천 = `rp_transaction`

```
rp_balance     = 빠른 조회용 캐시(잔액 스냅샷)
rp_transaction = 진실의 원천 (EARN/REDEEM/EXPIRE/REFUND/ADJUST_* 변동 모두 기록)
```

배치로 `rp_transaction` 합계를 재계산해 `rp_balance`와 대조 가능해야 합니다 (정합성 검증, 매일 04:30 배치).

### 5.3 `rp_transaction` 트랜잭션 타입

| `tx_type` | 의미 | 부호 |
|---|---|---|
| `EARN` | 적립 (이벤트·미션·보너스) | + |
| `REDEEM` | 보상 교환으로 차감 | − |
| `EXPIRE` | 3개월 미사용 만료 | − |
| `REFUND` | 외부 발급 실패 환불 | + |
| `ADJUST_PLUS` / `ADJUST_MINUS` | 관리자 수기 보정 | ± |

---

## 6. RP 계산 공식 (단일 진실)

```
final_rp = ROUND( base_rp × volume × diversity_multiplier × abuse_penalty )
```

- **반올림 규칙**: 소수점 첫째 자리에서 반올림 (`Decimal.quantize(ROUND_HALF_UP)`). 최종 저장은 정수
- **중간값 저장**: `action_event.calculated_rp NUMERIC(12,2)` 에 계산 중간값 보관, `applied_multiplier` 에는 `diversity × penalty` 기록 — 감사 시 역산 가능

### 6.1 멀티 이벤트 결합 정책

**1 이벤트 = 1 트랜잭션.** 결합하지 않습니다.

라이딩 종료 시 발생하는 N개 이벤트는 **각각 독립 트랜잭션**으로 발행합니다.

```
[라이딩 종료]
  POST /v1/events  action=RIDE_KM         volume=5.2  → rp_transaction A (+7)
  POST /v1/events  action=QUEST_COMPLETE  volume=1    → rp_transaction B (+70)
```

이유: 환불·감사·정산 단위가 명확해야 하고, 클라이언트의 묶음 시점/순서를 보장하기 어렵습니다.

### 6.2 어뷰징 룰의 적용 방식

| 룰 종류 | 동작 |
|---|---|
| **REJECT** (`GPS_SPEED_RANGE`, `DUPLICATE_RECEIPT`) | 이벤트 자체를 거부, `process_status='REJECTED'`. `rp_transaction` 생성 안 함 |
| **REDUCE** (`NEW_ACCOUNT_50`) | `abuse_penalty=0.5` 곱셈 (가입 후 3일간) |
| **CAP** (`DAILY_RP_CAP`) | 누적이 상한 초과 시 해당 이벤트는 RP 0으로 PROCESSED (`reject_reason_code='DAILY_CAP_EXCEEDED'`) |

### 6.3 RP 계산 파이프라인

```
1. action_event 수신, idempotency_key 검사
2. 기본 검증 (action_definition.is_active, user 상태)
3. 어뷰징 룰 평가
   3-1. REJECT 룰 (GPS_SPEED_RANGE, DUPLICATE_RECEIPT) → 위반 시 즉시 REJECTED
   3-2. REDUCE 룰 (NEW_ACCOUNT_50) → abuse_penalty 결정
   3-3. CAP 룰 (DAILY_RP_CAP) → 일일 누적 조회 후 0/1 결정
4. daily_count_limit 검사 (action_definition) → 초과 시 REJECTED
5. RP 계산 (§6 공식)
6. rp_transaction INSERT
7. rp_balance UPDATE (SELECT FOR UPDATE)
8. behavior_category_log INSERT
9. user_mission_progress 갱신 (해당 미션 모두)
10. user_tier 재평가
11. audit_log INSERT (트랜잭션 커밋)
```

---

## 7. 다양성 계수

### 7.1 정의

`user_diversity_score` 는 **(user_id, month_key) 단위**로 저장됩니다. `month_key = YYYYMM` 정수 (예: `202605`).

| 활성 카테고리 수 | multiplier |
|---|---|
| 0~1 | 1.00 |
| 2 | 1.20 |
| 3 | 1.40 |
| 4 | 1.60 |
| 5+ | 2.00 |

**활성 카테고리**: 해당 월에 `behavior_category_log` 에 최소 1건이라도 기록된 `category_code`. 후보 5종: `RIDING`, `MAINT`, `MARKET`, `COMMUNITY`, `DELIVERY`.

### 7.2 적용 시점

- RP 계산 시 `user_diversity_score` 에서 (user_id, 현재 month_key) 실시간 SELECT
- 행이 없으면 multiplier=1.00
- 이벤트 처리 후 `behavior_category_log` INSERT, 배경 작업이 `multiplier` 재계산
- **예외**: 새 카테고리 첫 진입은 같은 트랜잭션에서 UPSERT (사용자 경험 보호)

### 7.3 월 경계 / 타임존

```python
from zoneinfo import ZoneInfo
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
month_key = int(occurred_at.astimezone(VN_TZ).strftime("%Y%m"))
```

월이 바뀌면 카운트는 0부터 시작. 전월 데이터는 `behavior_category_log` 에 영구 보관.

---

## 8. RP 만료

| 항목 | 결정 |
|---|---|
| 만료 기간 | 적립일 기준 **3개월** |
| 소진 순서 | **FIFO** (만료일 오름차순) |
| 만료 배치 | 매일 베트남 시간 **04:00** |
| 락 정책 | REDEEM 시 `rp_expiration_schedule`을 `FOR UPDATE` |
| 환불 시 만료일 | **환불일 기준 3개월** (원본 만료일 복원 X) |

`EARN` 트랜잭션 생성 시 `rp_expiration_schedule (PENDING, remaining_amount=amount, expires_at=occurred_at+3mo)` 행을 함께 INSERT. `REDEEM` / `EXPIRE` 가 이 행들을 FIFO로 소진.

---

## 9. 미션 (Mission)

### 9.1 `target_rule` JSONB 스키마

```jsonc
{
  "agg": "sum_field | count_event | count_distinct | count_distinct_district
        | count_distinct_category | count_mission_complete | streak_days | composite",
  "target": 30,
  "action_code": "RIDE_KM",
  "field": "distance_km",           // sum_field / count_distinct 일 때
  "filters": {
    "time_of_day": { "from": "05:00", "to": "07:00" },
    "date":        { "date": "12-31", "label": "NYE" },
    "weather":     "RAIN | HEAVY_RAIN",
    "speed_kmh":   { "min": 25, "max": 40 },
    "geo": {
      "type":   "district | district_count | district_all | poi | road | city | area | road_type | novel_road | novel_route | poi_category",
      "values": ["..."],
      "target": 5
    },
    "min_duration_min": 30
  },
  "window": {
    "type": "calendar_day | calendar_week | calendar_month | rolling_days | onboarding | season | custom",
    "days":  14,
    "label": "TET | XMAS | SUMMER | RAINY | VN_INDEPENDENCE | ANNIVERSARY_1Y | ..."
  },
  "eligibility": {
    "account_type": ["STANDARD", "DRIVER", "BUSINESS"],
    "min_account_age_days": 0
  },
  "composite": {
    "operator": "AND | OR",
    "children": [ <rule>, <rule> ]
  }
}
```

### 9.2 `agg` 별 의미

| `agg` | 의미 | 필수 필드 |
|---|---|---|
| `sum_field` | 특정 필드 누적 합계 | `action_code`, `field` |
| `count_event` | 이벤트 개수 | `action_code` |
| `count_distinct` | 특정 필드 고유값 개수 | `action_code`, `field` |
| `count_distinct_district` | District 단위 고유 카운트 | — |
| `count_distinct_category` | 카테고리 단위 고유 카운트 | — |
| `count_mission_complete` | 다른 미션 완료 카운트 | — |
| `streak_days` | 연속일 카운트 | `action_code` |
| `composite` | AND/OR 결합 | `composite.children` |

### 9.3 미션 타입 / 윈도우 기본값

| Mission Type | duration_hours | repeatable | 비고 |
|---|---:|:---:|---|
| Onboarding | 336 (14일) | FALSE | 가입 직후 14일 |
| Daily | 24 | TRUE | |
| Weekly | 168 | TRUE | |
| Monthly | 720 | TRUE | |
| Seasonal | NULL | FALSE | 캠페인별 `starts_at` / `ends_at` |
| Anniversary | 24 | FALSE | |

### 9.4 미션 완료 시 보상 처리

미션 완료 보상도 §6 RP 파이프라인을 통과합니다 (다양성·페널티 적용). 단 별도 `action_event` 는 생성하지 않습니다 — 이미 트리거된 이벤트의 후속 처리입니다.

`rp_transaction (tx_type='EARN', source_type='MISSION', source_id=mission_id)` 로 적립.

---

## 10. 등급 (Tier)

| 등급 | 누적 RP | 다양성 요건 |
|---|---|---|
| Rookie | 0 | — |
| Rider | 5,000 | 카테고리 2+ |
| Veteran | 25,000 | 카테고리 3+ |
| Pro | 100,000 | 카테고리 4+ |
| Legend | 500,000 | 카테고리 5+ |

- **평가 시점**: 매 `EARN` 트랜잭션 직후 동기 재평가 (`REDEEM`/`EXPIRE`/`REFUND` 는 트리거 안 함)
- **다양성 카운트 기준**: **lifetime distinct categories** (한 번이라도 활동한 카테고리)
- **강등 없음**: lifetime RP·distinct 카테고리 모두 줄지 않으므로 자연 강등 시나리오 없음. 관리자가 `ADJUST_MINUS` + 수동 갱신 시에만 강등

---

## 11. 어뷰징 가드

| 룰 | 값 | 종류 |
|---|---|---|
| 일일 RP 상한 (일반) | 250 | CAP |
| 일일 RP 상한 (드라이버) | 2,000 | CAP |
| 신규 계정 페널티 | 가입 후 3일간 ×0.5 | REDUCE |
| GPS 속도 범위 | 5~80 km/h | REJECT |
| 중복 영수증 | OCR 해시 동일 | REJECT |
| 멱등성 키 TTL | 7일 | — |

`abuse_event` 테이블에 평가 결과를 기록하여 사후 분석 가능.

---

## 12. 보상 (Reward)

### 12.1 카탈로그 & 파트너

`reward_catalog` 의 각 항목은 `reward_partner` 와 연결되며 `integration_type` 으로 발급 방식이 분기됩니다.

| `integration_type` | v1 동작 |
|---|---|
| `INTERNAL` | 즉시 발급. `voucher_code` 는 UUID (뱃지·프로필 프레임 등) |
| `TELCO` / `GOTIT` / `URBOX` | **Stub 모드**: RP 차감 후 `status='REQUESTED'` 큐 적재. 외부 연동 추가 시 자동 발급 |
| `MANUAL` | 차감 후 운영자 알림, 운영자가 수기로 `voucher_code` 입력 → `FULFILLED` |

### 12.2 교환 트랜잭션 흐름

```
1. POST /v1/users/123/redemptions (catalog_id: 42)
2. Reward Module → 잔액 조회 (≥ required_rp 검증)
3. RP 차감 트랜잭션 (rp_transaction: REDEEM, -1200)
4. rp_expiration_schedule FIFO 차감
5. PartnerAdapter.issue_voucher(...)
6. 성공  → reward_redemption (FULFILLED, voucher_code)
   실패  → rp_transaction (REFUND, +1200), reward_redemption (FAILED)
7. audit_log INSERT
8. 응답 (바우처 코드 / 사용 가이드)
```

---

## 13. 동시성 / 정합성

### 13.1 잔액 갱신 락 정책

```sql
BEGIN;
SELECT current_balance FROM rp_balance WHERE user_id = :user_id FOR UPDATE;
-- 계산
INSERT INTO rp_transaction ...;
UPDATE rp_balance SET current_balance = :new ... WHERE user_id = :user_id;
INSERT INTO audit_log ...;
COMMIT;
```

REDEEM 시에는 `rp_expiration_schedule` 도 같은 트랜잭션에서 `FOR UPDATE`.

### 13.2 정합성 검증 (일 1회 배치, 04:30)

```sql
SELECT user_id,
  SUM(CASE WHEN tx_type IN ('EARN','REFUND','ADJUST_PLUS') THEN amount
           WHEN tx_type IN ('REDEEM','EXPIRE','ADJUST_MINUS') THEN -amount END) AS computed
FROM rp_transaction
GROUP BY user_id
HAVING computed != (SELECT current_balance FROM rp_balance WHERE user_id = rp_transaction.user_id);
```

불일치 1행이라도 발견 시 알림 → 수동 조사.

### 13.3 `balance_after` 의 의미

`rp_transaction.balance_after` 는 **트랜잭션 커밋 순서의 잔액**입니다. `occurred_at` 정렬 시점의 잔액과는 다를 수 있음에 주의.

---

## 14. 멱등성 (Idempotency)

### 14.1 키 정책

`action_event.idempotency_key`, `reward_redemption.idempotency_key` 는 **호출자(BFF)가 생성**합니다. 권장 포맷:

```
{resource_type}-{business_id}-{sequence}
예) ride-9876-final, ride-9876-km-checkpoint-3, redeem-user123-ts1715587200
```

### 14.2 재요청 시 동작

**동일 키 재요청 → 원래 응답을 그대로 반환 (캐시).**

```
1. idempotency_key 테이블 SELECT
2. 행이 있으면 → resource_id 로 원본 리소스 조회 후 같은 형식으로 200 OK
3. 행이 없으면 → 처리 후 INSERT (expires_at = NOW() + 7 days)
```

TTL=7일. 매일 04:10 배치에서 만료 키 삭제.

---

## 15. API 인터페이스

### 15.1 외부 ↔ SRE 경로

| 외부 (Nginx) | 내부 (Engine) | 비고 |
|---|---|---|
| `/api/sre/*` | `/v1/*` | BFF가 호출 |
| `/engine/*` | `/v1/*` | 내부망(172.16.0.0/12)만 |

### 15.2 인증 헤더

| 호출자 | 헤더 | 신뢰 범위 |
|---|---|---|
| BFF (게이트웨이) | `X-Service-Key: {SRE_SERVICE_API_KEY}` + `X-User-Id` | 사용자 인증 완료 가정 |
| 관리자 | `Authorization: Bearer {admin JWT}` | JWT `sub`/`roles` 기반 RBAC |

Path 의 `{user_id}` 와 `X-User-Id` 헤더가 다르면 **403**.

### 15.3 주요 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/v1/health` | 헬스체크 |
| `GET` | `/v1/version` | 버전 정보 |
| `GET` | `/v1/metrics` | Prometheus 메트릭 (내부망) |
| `POST` | `/v1/events` | 이벤트 발행 (RIDE_KM, QUEST_COMPLETE 등) |
| `GET` | `/v1/users/{id}/balance` | RP 잔액·등급·30일 내 만료 |
| `GET` | `/v1/users/{id}/wallet` | GP/GC 잔액 조회 |
| `GET` | `/v1/users/{id}/transactions` | 거래 내역 |
| `GET` | `/v1/users/{id}/missions` | 미션 진행도 (status 필터) |
| `POST` | `/v1/users/{id}/missions/{mid}/claim` | 미션 완료 수령 |
| `GET` | `/v1/catalog` | 보상 카탈로그 |
| `POST` | `/v1/users/{id}/redemptions` | 보상 교환 |
| **가챠** | | |
| `GET` | `/v1/gacha/list` | 활성 가챠 목록 |
| `POST` | `/v1/gacha/pull` | 가챠 뽑기 (1회/10연) |
| `GET` | `/v1/gacha/pity/{gacha_code}` | 천장 카운트 조회 |
| `GET` | `/v1/gacha/log/{user_uuid}` | 뽑기 이력 |
| `GET` | `/v1/gacha/eligibility/{gacha_code}` | 응모 자격 확인 |
| **상점** | | |
| `GET` | `/v1/shop/items` | 상점 아이템 목록 (필터 지원) |
| `GET` | `/v1/shop/daily-featured` | 오늘의 추천 아이템 |
| `POST` | `/v1/shop/purchase` | 아이템 구매 (GP/GC) |
| **인벤토리** | | |
| `GET` | `/v1/inventory/{user_uuid}/items` | 보유 아이템 목록 |
| `GET` | `/v1/inventory/{user_uuid}/equipment` | 현재 장착 아이템 |
| `PUT` | `/v1/inventory/{user_uuid}/equip` | 아이템 장착 |
| `DELETE` | `/v1/inventory/{user_uuid}/equip/{slot}` | 장착 해제 |
| `GET` | `/v1/inventory/{user_uuid}/collection-progress` | 컬렉션 진행도 |
| **시즌** | | |
| `GET` | `/v1/season/current` | 현재 활성 시즌 |
| `GET` | `/v1/season/{user_uuid}/pass` | 유저 시즌패스 상태 |
| `GET` | `/v1/season/levels/{season_code}` | 레벨별 보상 목록 |
| `POST` | `/v1/season/{user_uuid}/claim` | 시즌패스 보상 수령 |
| **메시지** | | |
| `GET` | `/v1/sreMessage` | SRE 메시지 이벤트 로깅 |
| **관리자** | | |
| `PUT` | `/v1/admin/action-definitions/{code}` | 룰 갱신 (RBAC: `RULE_EDITOR`) |
| `POST` | `/v1/admin/users/{id}/adjust` | 잔액 보정 (RBAC: `REWARD_OPS`) |
| `GET/POST/PUT/DELETE` | `/v1/admin/items/*` | 아이템 정의 CRUD |
| `GET/PUT` | `/v1/admin/gacha/definitions/*` | 가챠 정의 관리 |
| `GET/PUT` | `/v1/admin/shop/*` | 상점 아이템·일일 추천 관리 |
| `GET` | `/v1/admin/ops/daily-net` | GP/GC 수지 요약 (7일) |
| `GET` | `/v1/admin/ops/gacha-roi` | 가챠 ROI 통계 (30일) |
| `GET` | `/v1/admin/ops/channel-ratio` | 가챠 vs 상점 비율 (30일) |
| `GET` | `/v1/admin/ops/pity-distribution` | 천장 분포 통계 |

### 15.4 이벤트 요청 / 응답 예

```http
POST /v1/events
X-Service-Key: ...
X-User-Id: 123
Content-Type: application/json

{
  "action_code": "RIDE_KM",
  "occurred_at": "2026-05-13T10:23:45Z",
  "payload": { "distance_km": 5.2, "ride_id": 9876 },
  "idempotency_key": "ride-9876-final"
}
```

```json
{
  "rp_awarded": 7,
  "transaction_id": 1234567,
  "diversity_multiplier": 1.4,
  "abuse_penalty": 1.0,
  "process_status": "PROCESSED"
}
```

### 15.5 Swagger / ReDoc

- Swagger: `http://localhost:18090/api/sre/docs`
- ReDoc:   `http://localhost:18090/api/sre/redoc`

Nginx 가 `/api/sre/*` → 내부 `/v1/*` 로 rewrite. OpenAPI 스펙은 외부 경로(`/api/sre/openapi.json`)로 노출되도록 `main.py` 에서 명시.

---

## 16. 백그라운드 작업 (APScheduler)

`engine/app/main.py` 의 lifespan 에 임베드. 모두 **Asia/Ho_Chi_Minh** 기준.

| Job | Cron | lock_id | 책임 |
|---|---|---|---|
| `expire_rp` | `0 4 * * *` | 1001 | `rp_expiration_schedule` PENDING 중 만료된 행 → EXPIRE 트랜잭션 |
| `expire_missions` | `5 4 * * *` | 1002 | `user_mission_progress.expires_at` 경과 → `EXPIRED` |
| `cleanup_idempotency` | `10 4 * * *` | 1003 | 7일 지난 멱등 키 삭제 |
| `verify_balance` | `30 4 * * *` | 1004 | `rp_transaction` 합계 ↔ `rp_balance` 정합성 검증 |

**단일 실행 보장**: PostgreSQL `pg_try_advisory_lock(lock_id)` 으로 N개 인스턴스 동시 기동 시 중복 방지.

```python
async def run_with_lock(lock_id: int, fn):
    got = await conn.scalar(text("SELECT pg_try_advisory_lock(:id)"), {"id": lock_id})
    if not got:
        return  # 다른 인스턴스가 이미 실행 중
    try:
        await fn()
    finally:
        await conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": lock_id})
```

---

## 17. 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SRE_SERVICE_API_KEY` | (필수) | BFF ↔ SRE 호출 인증 키 |
| `SRE_ADMIN_JWT_SECRET` | (필수) | 관리자 JWT 서명 키 |
| `SRE_TIMEZONE` | `Asia/Ho_Chi_Minh` | 기준 타임존 |
| `SRE_RP_EXPIRY_MONTHS` | `3` | RP 만료 월수 |
| `SRE_DAILY_CAP_STANDARD` | `250` | 일반 사용자 일일 RP 상한 |
| `SRE_DAILY_CAP_DRIVER` | `2000` | 드라이버 일일 RP 상한 |
| `SRE_NEW_ACCOUNT_PENALTY_DAYS` | `3` | 신규 패널티 적용일 |
| `SRE_NEW_ACCOUNT_MULTIPLIER` | `0.5` | 신규 패널티 배율 |
| `SRE_IDEMPOTENCY_TTL_DAYS` | `7` | 멱등 키 TTL |
| `SRE_LOG_LEVEL` | `INFO` | 로그 레벨 |
| `SRE_METRICS_ENABLED` | `true` | `/v1/metrics` 노출 여부 |

`action_definition.base_rp` 처럼 행동별 값은 환경변수가 아닌 **DB 관리자 API**로 조정합니다.

---

## 18. 기본 룰 (v1)

### 18.1 행동별 기본 RP

| action_code | 설명 | base_rp |
|---|---|---|
| `RIDE_KM` | 1km 주행 | 1 |
| `QUEST_COMPLETE` | 퀘스트 완료 | 50~500 |
| `STREAK_7` | 7일 연속 | 500 |
| `GROUP_RIDE` | 그룹 라이딩(3+) | 거리 ×1.2 |
| `MAINTENANCE_RECEIPT` | 정비 인증 | 200 |
| `FUEL_RECEIPT` | 주유 인증 | 50 (1일 1회) |
| `MARKET_LISTING` | 중고 부품 등록 | 30 (1일 3건) |
| `MARKET_SUCCESS` | 거래 성공 | 500 (양쪽) |
| `REVIEW_PHOTO` | 리뷰 작성 | 100 |
| `REFERRAL` | 친구 초대 | 250 (양방) |
| `SHARE_SNS` | TikTok/Zalo 공유 | 30 (1일 1회) |
| `DELIVERY_RECEIPT` | 배달 영수증 | 5/건 (1일 100건) |

### 18.2 사용자가 일으키는 액션 → 부수 효과 요약

| 액션 | 생성되는 row |
|---|---|
| EARN | `rp_transaction(EARN)`, `rp_balance` UPDATE, `rp_expiration_schedule(PENDING)`, `audit_log` |
| REDEEM | `rp_transaction(REDEEM)`, `rp_balance` UPDATE, `rp_expiration_schedule` 차감 N행, `reward_redemption`, `audit_log` |
| EXPIRE (배치) | `rp_transaction(EXPIRE)`, `rp_balance` UPDATE, `rp_expiration_schedule.status='EXPIRED'`, `audit_log` |
| REFUND | `rp_transaction(REFUND)`, `rp_balance` UPDATE, `rp_expiration_schedule(PENDING)` 신규 생성, `audit_log` |
| ADJUST_PLUS / MINUS | `rp_transaction(ADJUST_*)`, `rp_balance` UPDATE, `audit_log` (actor=관리자) |

---

## 19. 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| 언어 / 프레임워크 | Python 3.12 + FastAPI | async I/O |
| ORM | SQLAlchemy 2.0 (async) | |
| DB | PostgreSQL 15 | `TIMESTAMPTZ` 강제 |
| 마이그레이션 | Alembic | `database/init/` 는 baseline 후 비활성 |
| 스케줄러 | APScheduler | v1; v2에서 Celery 검토 |
| 캐시 | 없음 | `rp_balance`/메모리 lru_cache 로 충분 |
| 로깅 | `structlog` + JSON | |
| 메트릭 | `prometheus-client` | `/v1/metrics` |
| 트레이싱 | (v1 미도입) | v2 OpenTelemetry |
| 인증 | `X-Service-Key` (BFF) + JWT (admin) | RBAC: `RULE_EDITOR` / `REWARD_OPS` / `ABUSE_ANALYST` |
| 테스트 | pytest + httpx + testcontainers | services/ 80% 목표 |
| Lint / Type | ruff + mypy (sre 패키지 strict) | |

---

## 20. 트랜잭션 흐름 예시

### 20.1 라이딩 종료 → RP 적립

```
1. 모바일 → BFF (라이딩 결과 업로드)
2. BFF → POST /v1/events (action=RIDE_KM, distance_km=5.2)
3. SRE Event Bus → Anti-Abuse 검증 (GPS 속도 OK, 일일 cap 미초과)
4. base_rp(1) × volume(5.2) × diversity(1.4) × penalty(1.0) = 7.28 → 7
5. rp_transaction INSERT (+7), rp_balance UPDATE
6. behavior_category_log (RIDING) INSERT
7. user_mission_progress 갱신 (해당 미션 모두)
8. user_tier 재평가
9. audit_log INSERT
10. 응답: { rp_awarded: 7, transaction_id: ..., diversity_multiplier: 1.4 }
```

### 20.2 보상 교환

```
1. 모바일 → BFF → POST /v1/users/123/redemptions (catalog_id: 42)
2. Reward Module → 잔액 조회, required_rp(1200) 검증
3. rp_transaction (REDEEM, -1200) + rp_expiration_schedule FIFO 차감
4. PartnerAdapter.issue_voucher() (INTERNAL → 즉시 / GOTIT → stub 큐)
5. 성공 → reward_redemption (FULFILLED, voucher_code)
   실패 → rp_transaction (REFUND, +1200) + reward_redemption (FAILED)
6. audit_log INSERT
7. 응답: 바우처 코드 / 사용 가이드
```

---

## 21. 운영 / 확장 로드맵

### v1 (현재)
- 8개 모듈 모두 구현, 룰은 단순
- 보상 카탈로그 6~10개 (Got It + 데이터 + 자체 굿즈; v1은 INTERNAL + stub)
- 어뷰징은 필수 3종만 (속도·빈도·신규)

### v2 자연스러운 확장 지점
- `reward_catalog` 항목만 추가 → UI/엔진 수정 불필요
- `action_definition` 코드 추가 → 미션 자동 생성 가능
- 외부 파트너 채널 추가 → API 키 발급만으로 동일 엔진 재사용
- 백엔드 컨테이너 N개 스케일 필요 시 Celery 전환

### 모니터링 핵심 지표
- DAU 대비 이벤트 수 (정상 범위)
- 평균 다양성 계수 (1.0~1.4 분포)
- RP 발행량 vs 소진량 (인플레이션 감시)
- 보상 교환 성공률 (외부 API SLA)
- `sre_balance_verification_drift` (정합성 불일치 사용자 수)

---

## 22. 보안 / 신뢰 모델

- 모바일 앱은 SRE를 **직접 호출하지 않음**. BFF 가 중계
- SRE 는 BFF 의 `X-Service-Key` 만 신뢰, `X-User-Id` 도 신뢰
- 모든 이벤트는 `idempotency_key` **필수**
- 관리자 API 는 별도 JWT + RBAC
- 모든 트랜잭션은 외부 변경 불가능한 `audit_log` 영구 보존
- Nginx `/engine/` 경로는 `172.16.0.0/12` (Docker 내부망)만 허용, 외부는 `403 Forbidden`

---

## 23. 기동 / 운영

```bash
# 기동
docker compose --profile backend up --build -d engine
docker compose logs -f engine

# DB 마이그레이션 (Alembic)
docker compose --profile backend exec engine alembic upgrade head
docker compose --profile backend exec engine alembic history

# 메트릭 확인 (내부망)
curl http://engine:8090/v1/metrics

# 헬스체크
curl http://localhost:18090/api/sre/health
```

| 환경 | URL |
|---|---|
| Nginx 경유 | `http://localhost:18090/api/sre/` |
| Swagger UI | `http://localhost:18090/api/sre/docs` |
| ReDoc | `http://localhost:18090/api/sre/redoc` |
| 직접 (FastAPI) | `http://localhost:8091` |
| 내부망 전용 | `http://engine:8090/v1/` (BFF 컨테이너에서) |

---

## 24. 결정 사항 한눈 보기

| # | 항목 | 결정 |
|---|---|---|
| 1 | RP 계산식 | `ROUND(base × volume × diversity × penalty)` |
| 2 | 멀티 이벤트 | 결합하지 않음 (1 이벤트 = 1 트랜잭션) |
| 3 | NEW_ACCOUNT 페널티 | 최종 RP ×0.5 (3일) |
| 4 | DAILY_RP_CAP | 초과분은 RP 0으로 PROCESSED |
| 5 | 다양성 계수 단위 | (user_id, month_key) |
| 6 | 계수 적용 | 실시간 조회 + 비동기 갱신 (첫 카테고리 진입만 동기 UPSERT) |
| 7 | 월 경계 타임존 | Asia/Ho_Chi_Minh |
| 8 | RP 만료 | 3개월, FIFO |
| 9 | 만료 배치 시각 | 매일 베트남 04:00 |
| 10 | 환불 만료일 | 환불일 기준 3개월 (원본 복원 X) |
| 11 | 등급 평가 | 매 EARN 직후 동기 |
| 12 | 다양성 카운트 (등급용) | lifetime distinct categories |
| 13 | 강등 | 발생하지 않음 |
| 14 | 잔액 락 | `SELECT FOR UPDATE` row-level |
| 15 | 정합성 검증 | 일 1회 배치 (04:30) |
| 16 | 멱등 재요청 | 원래 응답 반환 (캐시) |
| 17 | 멱등 키 TTL | 7일 |
| 18 | 외부 파트너 v1 | INTERNAL 즉시 / 나머지 Stub 큐 적재 |
| 19 | 모듈 분리 | `engine/app/sre` 패키지 (단일 FastAPI 앱) |
| 20 | 마이그레이션 | Alembic (`database/init/` baseline 후 비활성) |
| 21 | 스케줄러 | APScheduler + advisory lock (v1) |
| 22 | 캐시 | v1은 외부 캐시 미사용 |
| 23 | 시간 표현 | timezone-aware datetime 강제 |
| 24 | 다국어 | `mission_definition.title/description` JSONB |

---

## 25. 메시지 스트림 (Redis Streams + Worker)

### 25.1 데이터 흐름

```
모바일 앱 (GPS/Heartbeat/Event)
    │  GET /api/sre/sreMessage?uuid=&message=&type=
    ▼
Engine (sreMessage 라우터)
    │  Redis XADD sre:messages
    ▼
Redis Stream (sre:messages)
    │  XREADGROUP (Consumer Group: sre-workers)
    ▼
Worker (Dispatcher)
    ├── GpsAgent      ← type=gps
    └── EventAgent    ← type=event, heartbeat
```

### 25.2 메시지 포맷

| type | message (JSON) | 설명 |
|---|---|---|
| `gps` | `{"x":127.09,"y":37.21,"d":5}` | x=경도, y=위도, d=폴링 간격 이동거리(m) |
| `heartbeat` | `{}` | 단말 생존 확인 |
| `event` | `{"n":"app_open"}` | 앱 이벤트 |

:::info d 값은 누적거리가 아닙니다
`d`는 폴링 term(3초) 동안의 이동거리입니다. 누적 이동거리는 agent에서 `d` 값들을 합산하여 계산합니다.
:::

### 25.3 Worker Agent 구조

```
engine/app/workers/
├── __main__.py      ← Dispatcher (메인루프 + agent 라우팅)
├── base.py          ← BaseAgent ABC
├── gps_agent.py     ← GPS 메시지 처리
└── event_agent.py   ← Event/Heartbeat 처리
```

새 agent 추가 시: `BaseAgent` 상속 → `message_types` 선언 → `__main__.py`의 `AGENTS` 리스트에 등록.

### 25.4 Worker 운영 명령어

```bash
# 로그 조회 (최근 50줄)
docker logs saigon_worker --tail 50

# 실시간 로그 스트리밍
docker logs -f saigon_worker

# GPS 로그만 필터링
docker logs saigon_worker 2>&1 | grep "\[GPS\]"

# Worker 재시작
docker compose --profile backend up --build -d worker

# Redis 스트림 현황 확인
docker exec saigon_redis redis-cli XLEN sre:messages
docker exec saigon_redis redis-cli XINFO GROUPS sre:messages

# 스트림 비우기
docker exec saigon_redis redis-cli XTRIM sre:messages MAXLEN 0
```

### 25.5 관리자 페이지 모니터링

관리자 콘솔의 **메시지 스트림** 메뉴에서:
- 스트림 적재 건수, Consumer Group 상태, Pending 수 확인
- 타입/UUID 필터링 조회
- **GPS 체크** 버튼: UUID + 시간범위 + 플랫폼 지정 → 팝업에서 Google Maps 이동경로 시각화

---

## 26. 참고 문서 (내부)

본 페이지는 다음 내부 설계 문서의 공개 요약입니다.

- 설계서: `ai-docs/engine/sre-design-spec.md`
- 비즈니스 룰: `ai-docs/engine/01-sre-business-rules.md`
- 기술 스택: `ai-docs/engine/02-sre-tech-stack.md`
- ERD: `ai-docs/engine/sre-erd-mermaid.postgres.md`
- DDL: `ai-docs/engine/sre-schema.postgres.sql`
- OpenAPI: `ai-docs/engine/sre-api.openapi.yml`
- 미션 룰 매핑: `ai-docs/engine/sre-mission-rule-mapping.md`
- 미션 매핑 리포트: `ai-docs/engine/sre-mission-mapping-report.md`
