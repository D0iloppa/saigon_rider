# SRE 비즈니스 룰 명세서 v1.0

> 발행일: 2026-05-13
> 대상: Saigon Rider Reward Engine v1
> 상태: **설계 결정 (DECISION) — 코드 작성 전에 반드시 합의되어야 하는 항목**

이 문서는 설계서(`sre-design-spec.md`)에 명시되지 않았거나 모호한 부분을 코드 작성 가능한 수준으로 확정합니다. 각 항목은 **결정 / 근거 / 적용 위치 / 예시**로 구성됩니다.

---

## 1. RP 계산 공식

### 1.1 단일 이벤트 공식

```
final_rp = ROUND( base_rp × volume × diversity_multiplier × abuse_penalty )
```

| 변수 | 의미 | 출처 |
|---|---|---|
| `base_rp` | 행동 기본 RP | `action_definition.base_rp` |
| `volume` | 수량 계수 (예: 거리 km, 영수증 건수) | `action_event.payload`에서 추출, 없으면 1 |
| `diversity_multiplier` | 다양성 계수 | `user_diversity_score.multiplier` |
| `abuse_penalty` | 어뷰징 페널티 (1.0 = 페널티 없음) | 어뷰징 모듈에서 계산 |

**반올림 규칙**: 소수점 첫째 자리에서 반올림 (`Decimal.quantize(ROUND_HALF_UP)`). `rp_transaction.amount`는 `BIGINT`로 저장되므로 정수만 들어갑니다.

**저장**: 계산 중간값은 `action_event.calculated_rp` (`NUMERIC(12,2)`)에 보관하고, `action_event.applied_multiplier`에는 `diversity_multiplier × abuse_penalty`를 기록합니다. 감사 시 역산 가능해야 합니다.

### 1.2 멀티 이벤트 결합 정책

**결정: 멀티 이벤트는 결합하지 않는다. 1 이벤트 = 1 트랜잭션.**

설계서 예시 A의 `(5 + 84) × 1.4 = 124`는 오해의 소지가 있습니다. 실제 구현은 다음과 같이 분리합니다.

```
[라이딩 종료]
  POST /v1/events  action=RIDE_KM         volume=5.2  → rp_transaction A (+7)
  POST /v1/events  action=QUEST_COMPLETE  volume=1    → rp_transaction B (+70)
```

**이유**:
- 트랜잭션 단위가 명확해야 환불·감사·정산이 가능
- 클라이언트가 이벤트 묶음을 보내는 시점·순서를 보장하기 어려움
- 다양성 계수가 두 이벤트 사이에 바뀔 수 있음 (월 경계, 새 카테고리 첫 활동)

**클라이언트 가이드**: 라이딩 종료 시 발생하는 N개 이벤트는 동일 `ride_id`를 `payload`에 넣어 동기로 순차 호출하거나, 백엔드 게이트웨이가 fan-out 합니다. SRE 입장에서는 각각 독립 이벤트입니다.

### 1.3 어뷰징 페널티의 적용 방식

| 룰 | `abuse_penalty` 값 | 비고 |
|---|---|---|
| `NEW_ACCOUNT_50` (가입 후 3일) | 0.5 | 가입일 기준 72시간 |
| `DAILY_RP_CAP` 초과분 | 0.0 (해당 이벤트만 차단) | 일일 누적 RP가 상한을 넘는 순간부터의 이벤트는 RP 0으로 적립 (이벤트 자체는 PROCESSED, 사유는 `reject_reason_code='DAILY_CAP_EXCEEDED'`) |
| `GPS_SPEED_RANGE` 위반 | — (REJECT, 이벤트가 PROCESSED 되지 않음) | `process_status='REJECTED'` |
| `DUPLICATE_RECEIPT` | — (REJECT) | 동일 |

**중요**: REJECT 룰은 페널티가 아니라 **이벤트 자체를 거부**합니다. `rp_transaction`이 생성되지 않습니다.

### 1.4 적용 순서 (RP 계산 파이프라인)

```
1. action_event 수신, idempotency_key 검사
2. 기본 검증 (action_definition 존재, is_active, user 상태)
3. 어뷰징 룰 평가:
   3-1. REJECT 룰 먼저 (GPS_SPEED_RANGE, DUPLICATE_RECEIPT) → 위반 시 즉시 REJECTED
   3-2. REDUCE 룰 (NEW_ACCOUNT_50) → abuse_penalty 결정
   3-3. CAP 룰 (DAILY_RP_CAP) → 일일 누적 조회 후 abuse_penalty 0/1 결정
4. daily_count_limit 검사 (action_definition.daily_count_limit) → 초과 시 REJECTED
5. RP 계산 (§1.1)
6. rp_transaction INSERT (트랜잭션 시작)
7. rp_balance UPDATE
8. behavior_category_log INSERT
9. user_mission_progress 갱신 (해당하는 모든 미션)
10. user_tier 재평가 (§5)
11. audit_log INSERT (트랜잭션 커밋)
```

---

## 2. 다양성 계수

### 2.1 정의

`user_diversity_score`는 **(user_id, month_key) 단위**로 저장됩니다. 월별로 다른 다양성 계수를 가질 수 있습니다.

| 활성 카테고리 수 | multiplier |
|---|---|
| 0~1 | 1.00 |
| 2 | 1.20 |
| 3 | 1.40 |
| 4 | 1.60 |
| 5+ | 2.00 |

**활성 카테고리의 정의**: 해당 월(`month_key`)에 `behavior_category_log`에 최소 1건이라도 기록된 `category_code`. 카테고리 후보: `RIDING`, `MAINT`, `MARKET`, `COMMUNITY`, `DELIVERY` (5개).

### 2.2 적용 시점

**결정: 다양성 계수는 RP 계산 직전에 실시간 조회한다. 단, 캐시를 통해 갱신은 비동기.**

흐름:
1. RP 계산 시 `user_diversity_score`에서 (user_id, 현재 month_key) 행을 SELECT
2. 행이 없으면 multiplier = 1.00 (초기값)
3. 이벤트 처리 후 `behavior_category_log`에 새 행 추가
4. 백그라운드 작업(또는 트리거)이 `user_diversity_score`의 `active_category_count`와 `multiplier`를 재계산

**왜 동기 재계산을 하지 않는가**: 새로운 카테고리 첫 활동 시 즉시 계수가 오르면 좋겠지만, 같은 트랜잭션 내 재계산 비용이 큽니다. 1~2초 지연된 반영을 허용합니다.

**예외 — "첫 카테고리 활성화 시 즉시 반영"**: 사용자 경험상 새 카테고리에 처음 진입했는데 즉시 보상이 안 오르면 혼란이 생깁니다. 따라서:
- 새 카테고리 첫 진입을 감지하면 (동일 month에 해당 카테고리 첫 row) `user_diversity_score`를 동일 트랜잭션에서 UPSERT
- 두 번째 이후 활동은 카운트만 늘리고 multiplier는 비동기

### 2.3 월 경계 처리

`month_key`는 `YYYYMM` 형식 정수입니다 (예: `202605`).

**결정: 월이 바뀌면 카운트는 0부터 다시 시작한다.** 전월 데이터는 `behavior_category_log`에 영구 보관됩니다.

**계산 시각의 기준 타임존**: **Asia/Ho_Chi_Minh (UTC+7)**. 사용자 대부분이 베트남에 있으므로 현지 시간 자정에 월이 바뀝니다. 백엔드 코드에서 `month_key`를 만들 때 항상 베트남 시간으로 변환:

```python
from zoneinfo import ZoneInfo
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
month_key = int(occurred_at.astimezone(VN_TZ).strftime("%Y%m"))
```

---

## 3. RP 만료 처리

### 3.1 만료 정책

**결정: 적립일 기준 3개월 후 만료. FIFO 소진.**

- 적립 트랜잭션(`tx_type='EARN'`) 생성 시 `expires_at = occurred_at + 3 months` 설정
- 동시에 `rp_expiration_schedule`에 같은 만료일로 행 추가 (`remaining_amount = amount`)
- 사용(`REDEEM`)이나 만료(`EXPIRE`) 시 `rp_expiration_schedule`을 **만료일 오름차순(FIFO)**으로 소진

### 3.2 소진 알고리즘

`REDEEM 1200 RP` 요청이 들어왔을 때:

```sql
-- 의사 SQL
WITH eligible AS (
  SELECT expire_id, remaining_amount
  FROM rp_expiration_schedule
  WHERE user_id = :user_id
    AND status IN ('PENDING', 'PARTIALLY_USED')
    AND expires_at > NOW()
  ORDER BY expires_at ASC, expire_id ASC
  FOR UPDATE
)
-- 차감 루프: 1200이 0이 될 때까지
-- 각 행에서 remaining_amount -= used, status 갱신
```

**락 정책**: 동일 사용자의 동시 REDEEM 방지를 위해 `FOR UPDATE` 사용 (PostgreSQL row-level lock). 잔액 race condition은 §6에서 다룹니다.

### 3.3 만료 배치

**결정: 매일 베트남 시간 04:00에 만료 배치 실행.**

배치 작업:
```
SELECT * FROM rp_expiration_schedule
WHERE status IN ('PENDING', 'PARTIALLY_USED')
  AND expires_at <= NOW()
```

각 행에 대해:
1. `rp_transaction` INSERT (tx_type='EXPIRE', amount=remaining_amount)
2. `rp_expiration_schedule.status` = 'EXPIRED', `remaining_amount` = 0
3. `rp_balance.current_balance` 감소

배치는 **사용자 단위로 트랜잭션을 묶고**, 한 사용자에 여러 만료 row가 있으면 한 트랜잭션에서 처리합니다.

### 3.4 환불 시 만료 복원

`REFUND` (보상 교환 실패 환불) 시:
- `rp_transaction` (tx_type='REFUND') INSERT
- **환불된 RP는 원래 만료일을 복원하지 않고, 환불일 기준 3개월 후로 새 만료 스케줄 생성**

이유: 원본 적립 트랜잭션을 추적하면 복잡도가 급증하고, 사용자 입장에서도 "이미 잃었다고 생각한 포인트가 돌아왔다"는 인식이라 만료일 재설정이 자연스럽습니다.

---

## 4. 미션 진행도 갱신

### 4.1 target_rule JSONB 스키마

미션의 달성 조건을 정의합니다. 구체적인 매핑 규칙은 **4단계 문서**에서 다루고, 여기서는 스키마만 확정합니다.

```json
{
  "type": "count" | "sum" | "boolean" | "compound",
  "action_code": "RIDE_KM",
  "field": "distance_km",        // type=sum일 때 payload에서 합산할 필드
  "target": 5,
  "window": "session" | "daily" | "weekly" | "monthly" | "lifetime" | "custom",
  "filters": { ... },             // payload 매칭 조건 (예: { "weather": "rain" })
  "and": [ ... ]                  // type=compound일 때
}
```

### 4.2 미션 매칭 알고리즘

새 `action_event`가 PROCESSED 되면:
1. 해당 user의 `user_mission_progress` 중 `status='ACTIVE'`인 모든 행 조회
2. 각 미션의 `target_rule.action_code`가 이벤트의 `action_code`와 일치하면 진행도 갱신 후보
3. `filters`가 있으면 `payload`와 매칭 검사
4. 매칭 시 `current_value`를 증가 (type별로 +1 또는 +field값)
5. `current_value >= target_value`가 되면 `status='COMPLETED'`, `completed_at=NOW()` 설정
6. 미션의 `reward_rp`를 `rp_transaction` (tx_type='EARN', source_type='MISSION', source_id=mission_id)로 적립

**중요**: 미션 완료 보상도 §1의 RP 계산 파이프라인을 거칩니다 (다양성 계수 적용, 어뷰징 페널티 적용). 단, `action_event`는 생성하지 않습니다 — 이미 트리거가 된 이벤트의 후속 처리이기 때문입니다.

### 4.3 미션 만료

`user_mission_progress.expires_at`이 지나면 일 1회 배치로 `status='EXPIRED'`로 전환. 진행도는 보존되지만 보상은 지급되지 않습니다.

---

## 5. 등급 평가

### 5.1 평가 트리거

**결정: 매 `tx_type='EARN'` 트랜잭션 직후 동기 재평가.**

- `REDEEM`, `EXPIRE`, `REFUND`는 trigger 하지 않음 (등급은 lifetime 기반이라 줄어들지 않아야 함 — §5.3 참조)
- 비용은 작음 (`tier_definition`은 5행, 인덱스 lookup 1번)

### 5.2 평가 로직

```
1. lifetime_earned = SELECT SUM(amount) FROM rp_transaction WHERE user_id=? AND tx_type='EARN'
   (rp_balance.lifetime_earned 사용 가능)
2. diversity_count = (현재 월의 active_category_count) 또는 (lifetime distinct categories)
   → 결정: lifetime distinct categories (한 번이라도 활동한 카테고리 수)
3. tier_definition을 sort_order DESC로 SELECT
4. 조건(min_lifetime_rp ≤ lifetime AND min_diversity_count ≤ diversity_count)을 만족하는 첫 행이 새 등급
5. user_tier.current_tier_code가 다르면 UPDATE + achieved_at = NOW()
```

### 5.3 강등 정책

**결정: 등급은 강등되지 않는다.** lifetime 누적 RP는 절대 줄어들지 않으므로 강등 시나리오는 다양성 카테고리 수가 줄어들 때만 발생하는데, lifetime distinct count는 줄지 않으므로 강등 자체가 발생하지 않습니다.

만약 운영자가 강등이 필요하다고 판단하면 (예: 어뷰징 적발 후 lifetime을 깎는 경우), `ADJUST_MINUS` 트랜잭션 후 수동으로 `user_tier`를 갱신해야 합니다.

---

## 6. 동시성 / 잔액 정합성

### 6.1 잔액 갱신의 동시성

같은 사용자가 동시에 RP 적립과 사용을 일으키는 경우:

**결정: `rp_balance` UPDATE는 row-level lock으로 직렬화.**

```sql
BEGIN;
SELECT current_balance FROM rp_balance WHERE user_id = :user_id FOR UPDATE;
-- 계산
INSERT INTO rp_transaction ...;
UPDATE rp_balance SET current_balance = :new_balance ... WHERE user_id = :user_id;
INSERT INTO audit_log ...;
COMMIT;
```

REDEEM 시에는 `rp_expiration_schedule`도 같은 트랜잭션에서 `FOR UPDATE`로 잠급니다.

### 6.2 진실의 원천과 캐시 정합성

설계서 §4의 원칙대로, `rp_balance`는 캐시이며 진실은 `rp_transaction`입니다.

**검증 쿼리** (정합성 점검용, 일 1회 배치):
```sql
SELECT user_id,
  SUM(CASE WHEN tx_type IN ('EARN','REFUND','ADJUST_PLUS') THEN amount
           WHEN tx_type IN ('REDEEM','EXPIRE','ADJUST_MINUS') THEN -amount END) AS computed_balance
FROM rp_transaction
GROUP BY user_id
HAVING computed_balance != (SELECT current_balance FROM rp_balance WHERE user_id = rp_transaction.user_id);
```

결과가 1행이라도 나오면 알림 (Slack/PagerDuty) 후 수동 조사.

### 6.3 balance_after 필드의 의미

`rp_transaction.balance_after`는 **해당 트랜잭션 직후의 잔액**입니다. 동시성 환경에서는 행 순서가 `transaction_id` 순서와 같지 않을 수 있으므로, **`occurred_at` 정렬 시점의 잔액이 아니라 트랜잭션 커밋 순서의 잔액**임에 주의합니다.

---

## 7. 멱등성 (Idempotency)

### 7.1 키 정책

`action_event.idempotency_key`와 `reward_redemption.idempotency_key`는 **호출자가 책임지고 생성**합니다. 권장 포맷:

```
{resource_type}-{business_id}-{sequence}
예) ride-9876-final, ride-9876-km-checkpoint-3, redeem-user123-ts1715587200
```

### 7.2 재요청 시 동작

**결정: 동일 키로 재요청 시 원래 응답을 그대로 반환한다 (캐시된 응답).**

구현:
1. 요청 수신 시 `idempotency_key` 테이블에서 SELECT
2. 행이 있으면:
   - `resource_id`를 찾아 원본 리소스 조회
   - 원본 응답 형식으로 반환 (200 OK, 새로 처리하지 않음)
3. 행이 없으면 처리 후 `idempotency_key`에 INSERT (`expires_at = NOW() + 7 days`)

### 7.3 키 TTL과 정리

`idempotency_key.expires_at`은 7일. 매일 04:00 배치에서 만료된 키 삭제 (`DELETE WHERE expires_at < NOW()`).

7일 이후 동일 키가 재사용되면 새 요청으로 처리되지만, 실무상 7일 이상 지난 재시도는 무시해도 안전합니다.

---

## 8. 보상 교환 (Redemption)

### 8.1 외부 파트너 미정 상태에서의 v1 구현

외부 파트너 협의 전이므로 v1은 다음과 같이 처리합니다:

| `integration_type` | v1 동작 |
|---|---|
| `INTERNAL` | 즉시 발급. `voucher_code`는 UUID 생성 (예: 뱃지, 프로필 프레임) |
| `TELCO`, `GOTIT`, `URBOX` | **stub 모드**: RP 차감은 하되, `reward_redemption.status='REQUESTED'`로 두고 외부 호출 대신 큐에 적재. 운영자 수동 발급 또는 외부 연동 추가 시 자동 처리 |
| `MANUAL` | 차감 후 운영자 알림. 운영자가 수기로 voucher_code 입력 후 `status='FULFILLED'` |

### 8.2 외부 호출 인터페이스 (stub)

```python
class PartnerAdapter(Protocol):
    async def issue_voucher(
        self, catalog_item: RewardCatalog, user: SreUser, idempotency_key: str
    ) -> VoucherResult: ...

# v1 구현체
class InternalAdapter(PartnerAdapter): ...      # 즉시 발급
class StubPartnerAdapter(PartnerAdapter): ...   # REQUESTED 상태로 보류
class ManualPartnerAdapter(PartnerAdapter): ... # 운영자 알림 후 보류
```

`api_config` (jsonb)는 v1에서 비워두거나 stub용 메타데이터만 저장.

### 8.3 실패 처리

`StubPartnerAdapter`는 v1에서 실패가 발생하지 않습니다 (외부 호출이 없으므로). 외부 연동이 추가되면 다음 정책 적용:

- 동기 호출 → 5초 타임아웃 → 실패 시 즉시 환불(`tx_type='REFUND'`), `status='FAILED'`
- 재시도는 운영자가 수동 결정 (자동 재시도는 v2)

---

## 9. 사용자 액션이 일으키는 부수 효과 요약

| 액션 | 생성되는 row |
|---|---|
| EARN | `rp_transaction(EARN)`, `rp_balance` UPDATE, `rp_expiration_schedule(PENDING)`, `audit_log` |
| REDEEM | `rp_transaction(REDEEM)`, `rp_balance` UPDATE, `rp_expiration_schedule` 차감 (N개 row UPDATE), `reward_redemption`, `audit_log` |
| EXPIRE (배치) | `rp_transaction(EXPIRE)`, `rp_balance` UPDATE, `rp_expiration_schedule.status='EXPIRED'`, `audit_log` |
| REFUND | `rp_transaction(REFUND)`, `rp_balance` UPDATE, `rp_expiration_schedule(PENDING)` 신규 생성, `audit_log` |
| ADJUST_PLUS / ADJUST_MINUS (관리자) | `rp_transaction(ADJUST_*)`, `rp_balance` UPDATE, `audit_log` (actor_user_id = 관리자) |

---

## 10. 결정 사항 한눈 보기

| # | 항목 | 결정 |
|---|---|---|
| 1.1 | RP 계산식 | `ROUND(base × volume × diversity × penalty)` |
| 1.2 | 멀티 이벤트 | 결합하지 않음 (1 이벤트 = 1 트랜잭션) |
| 1.3 | NEW_ACCOUNT 페널티 | 최종 RP에 0.5 곱셈 |
| 1.4 | DAILY_RP_CAP | 초과분은 RP 0으로 PROCESSED |
| 2.1 | 다양성 계수 단위 | (user_id, month_key) |
| 2.2 | 계수 적용 | 실시간 조회, 갱신은 비동기 (첫 카테고리 진입은 동기 UPSERT) |
| 2.3 | 월 경계 타임존 | Asia/Ho_Chi_Minh (UTC+7) |
| 3.1 | RP 만료 | 적립 후 3개월, FIFO |
| 3.3 | 만료 배치 | 매일 베트남 시간 04:00 |
| 3.4 | 환불 만료일 | 환불일 기준 3개월 (원본 복원 X) |
| 5.1 | 등급 평가 | 매 EARN 직후 동기 |
| 5.2 | 다양성 카운트 기준 | lifetime distinct categories |
| 5.3 | 강등 | 발생하지 않음 |
| 6.1 | 잔액 락 | `SELECT FOR UPDATE` row-level |
| 6.2 | 정합성 검증 | 일 1회 배치 |
| 7.2 | 멱등 재요청 | 원래 응답 반환 (캐시) |
| 7.3 | 멱등 키 TTL | 7일 |
| 8.1 | 외부 파트너 v1 | INTERNAL 즉시 발급, 나머지 stub 큐 적재 |

---

## 11. 미해결 항목 (외부 협의 필요)

다음 항목은 본 문서에서 결정하지 않았으며, 외부 파트너 협의 시점에 추가 결정이 필요합니다:

- 외부 파트너 호출 타임아웃·재시도 정책
- 외부 발급 실패 시 사용자 알림 채널 (Push? In-app?)
- 환불에 대한 외부 파트너의 응답 처리 (Got It은 환불 API 제공? 단방향?)
- voucher_code의 외부 시스템 검증 절차
- `monthly_quota` 초과 시 대기열인지 즉시 거절인지

---

(끝)
