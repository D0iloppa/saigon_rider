# 퀘스트 달성 체크 시스템 설계서

> 작성일: 2026-05-22
> 상태: DRAFT — 리뷰 후 구현 착수

---

## 1. 개요

GPS 좌표/이동거리 수신 시 마일리지와 퀘스트 달성을 동시에 체크하는 시스템.
기존 `GpsAgent → mileage.update_mileage() → policy_engine` 체인에 퀘스트 체크를 추가한다.

### 현재 흐름
```
Redis Stream (type="gps")
  → GpsAgent.handle()
    → mileage.update_mileage(user_id, distance_m)
      → policy_engine.evaluate_policies(user_id)
```

### 목표 흐름
```
Redis Stream (type="gps")
  → GpsAgent.handle()
    → mileage.update_mileage(user_id, distance_m)
      → policy_engine.evaluate_policies(user_id)
    → quest_tracker.update(user_id, lat, lng, distance_m)   ← NEW
      → 활성 퀘스트 카드 순회 → 달성 체크 → 완료 처리
```

---

## 2. 데일리 퀘스트 슬롯 정책

### 2.1 개념

- 하루에 수행 가능한 **데일리 퀘스트** 수에 상한을 둔다 (기본 3개)
- **주간 퀘스트**, **이벤트 퀘스트**는 이 상한에 포함되지 않음
- 레벨 + 착용 아이템 조합으로 상한이 증가

### 2.2 Seed 정책 (sre_seed_config)

| seed_code | value | 설명 |
|-----------|-------|------|
| `DAILY_QUEST_BASE_SLOTS` | 3 | 기본 일일 퀘스트 슬롯 |
| `CHECKPOINT_PROXIMITY_M` | 100 | 포인트 도달 인정 반경 (미터) |
| `MIN_MOVE_SPEED_KMH` | 3 | GPS 노이즈 필터 최소 속도 |

### 2.3 슬롯 계산 공식

```python
def calc_daily_slots(user_id: int) -> int:
    base = get_seed("DAILY_QUEST_BASE_SLOTS")          # 3
    level_bonus = calc_level_bonus(user_level)          # 레벨 구간별 +N
    item_bonus = calc_item_bonus(equipped_items)        # 착용 아이템 효과 합산
    return base + level_bonus + item_bonus
```

**레벨 보너스 테이블** (seed `DAILY_SLOT_LEVEL_BONUS`):

```json
{
  "type": "step",
  "steps": [
    [5,  1],
    [10, 1],
    [20, 1],
    [30, 1]
  ]
}
```
→ Lv5 +1, Lv10 +1(누적+2), Lv20 +1(누적+3), Lv30 +1(누적+4)

**아이템 보너스**: 아이템 `effects` JSONB에 `{"daily_quest_slot": 1}` 효과가 있는 착용 아이템의 합산.

### 2.4 슬롯 체크 시점

BFF `POST /api/quests/{quest_id}/accept`에서:
1. 퀘스트 period가 `DAILY`인 경우
2. Engine API `GET /v1/users/{user_id}/daily-quest-slots` 호출
3. 오늘 수락한 데일리 퀘스트 수 vs 슬롯 상한 비교
4. 초과 시 `409 Conflict` 반환

---

## 3. 퀘스트 카드 모델

### 3.1 개념

퀘스트를 수락하면 **퀘스트 카드**가 생성된다. 카드에는 달성 조건이 담겨 있으며,
GPS 데이터가 들어올 때마다 활성 카드를 순회하며 달성 여부를 체크한다.

### 3.2 카드 타입

| card_type | 달성 조건 | 예시 |
|-----------|-----------|------|
| `DISTANCE` | 누적 이동거리 달성 | "5km 라이딩" |
| `CHECKPOINT` | 특정 좌표 근접 도달 | "Pham Ngu Lao 도착" |

### 3.3 테이블: `sre_quest_card`

```sql
CREATE TABLE sre_quest_card (
    card_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES sre_user(user_id),
    external_quest_id UUID NOT NULL,          -- BFF quests.id
    user_quest_id   UUID NOT NULL,            -- BFF user_quests.id (1:1)
    card_type       VARCHAR(20) NOT NULL,     -- DISTANCE | CHECKPOINT

    -- DISTANCE 타입
    target_distance_m   INTEGER,              -- 목표 거리 (미터)
    current_distance_m  INTEGER DEFAULT 0,    -- 현재 누적 거리

    -- CHECKPOINT 타입
    target_lat      NUMERIC(9,6),             -- 목표 위도
    target_lng      NUMERIC(9,6),             -- 목표 경도

    -- 공통
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                    -- ACTIVE | COMPLETED | EXPIRED | CANCELLED
    accepted_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,              -- 데일리: 당일 23:59:59

    CONSTRAINT chk_card_type CHECK (
        (card_type = 'DISTANCE' AND target_distance_m IS NOT NULL) OR
        (card_type = 'CHECKPOINT' AND target_lat IS NOT NULL AND target_lng IS NOT NULL)
    )
);

CREATE INDEX idx_quest_card_user_active
    ON sre_quest_card (user_id, status) WHERE status = 'ACTIVE';
```

### 3.4 카드 생성 흐름

```
BFF: POST /api/quests/{quest_id}/accept
  → UserQuest 생성 (기존)
  → Engine API 호출: POST /v1/quest-cards
    {
      user_uuid: "...",
      external_quest_id: "...",
      user_quest_id: "...",
      card_type: "DISTANCE",
      target_distance_m: 5000,
      -- 또는 --
      card_type: "CHECKPOINT",
      target_lat: 10.7769,
      target_lng: 106.7009
    }
  → Engine: sre_quest_card INSERT
  → 반환: card_id
```

---

## 4. 퀘스트 체크 서비스 (`quest_tracker.py`)

### 4.1 핵심 함수

```python
# engine/app/services/quest_tracker.py

async def update(user_id: int, lat: float, lng: float, distance_m: float) -> list[int]:
    """
    GPS 수신 시 호출. 활성 퀘스트 카드를 순회하며 달성 체크.
    완료된 card_id 리스트 반환.
    """
    async with AsyncSessionLocal() as db:
        active_cards = await _get_active_cards(db, user_id)
        completed_ids = []

        for card in active_cards:
            if card.card_type == "DISTANCE":
                card.current_distance_m += int(distance_m)
                if card.current_distance_m >= card.target_distance_m:
                    await _complete_card(db, card)
                    completed_ids.append(card.card_id)

            elif card.card_type == "CHECKPOINT":
                threshold = await _get_seed("CHECKPOINT_PROXIMITY_M")  # 100m
                dist = _haversine(lat, lng, card.target_lat, card.target_lng)
                if dist <= threshold:
                    await _complete_card(db, card)
                    completed_ids.append(card.card_id)

        await db.commit()
    return completed_ids
```

### 4.2 카드 완료 처리

```python
async def _complete_card(db: AsyncSession, card: SreQuestCard):
    card.status = "COMPLETED"
    card.completed_at = datetime.now(timezone.utc)
    # BFF에 콜백 (선택: Redis pub/sub 또는 HTTP)
    # → BFF가 user_quests.status = COMPLETED 갱신 + 보상 지급
```

### 4.3 완료 통지 방식

**Option A: Pull 방식 (권장)**
- Engine은 카드 상태만 갱신
- BFF가 주기적으로 또는 클라이언트 요청 시 `GET /v1/quest-cards/{user_id}/completed` 폴링
- 클라이언트가 라이딩 화면에서 주기적으로 BFF에 상태 확인 → 완료 팝업

**Option B: Push 방식**
- Engine이 카드 완료 시 Redis Streams에 `quest_completed` 이벤트 발행
- BFF Worker가 구독하여 자동 처리

→ **Phase 1에서는 Option A (Pull)** 로 시작. 실시간성이 필요하면 Phase 2에서 Push 추가.

### 4.4 Haversine 거리 계산

```python
from math import radians, sin, cos, sqrt, atan2

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 좌표 간 거리 (미터)."""
    R = 6_371_000  # 지구 반경 (m)
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))
```

---

## 5. GpsAgent 확장

```python
# engine/app/workers/gps_agent.py (변경)

class GpsAgent(BaseAgent):
    message_types = {"gps"}

    async def handle(self, msg_id: str, fields: dict) -> None:
        device_uuid = fields.get("uuid", "?")
        raw = fields.get("message", "{}")
        try:
            o = json.loads(raw)
            lat, lng, d = float(o.get("y", 0)), float(o.get("x", 0)), float(o.get("d", 0))
        except (json.JSONDecodeError, AttributeError, ValueError):
            lat, lng, d = 0.0, 0.0, 0.0

        user_id = await resolve_user_id(device_uuid)
        if user_id is None:
            return

        # 1. 마일리지 갱신 (기존)
        if d > 0:
            await update_mileage(user_id, d, device_uuid)

        # 2. 퀘스트 카드 체크 (NEW)
        if d > 0 or (lat != 0 and lng != 0):
            from app.services.quest_tracker import update as quest_update
            completed = await quest_update(user_id, lat, lng, d)
            if completed:
                log.info("[GPS] user=%d quest cards completed: %s", user_id, completed)
```

---

## 6. GPS 노이즈 필터링

GpsAgent 진입 시점에서 기본 필터링:

```python
# 속도 = 거리 / 시간 (이전 GPS와 현재 GPS 간격)
# 시속 3km 미만 → 정지 상태로 간주, 거리 누적 안 함
# 시속 150km 초과 → GPS 튐, 무시

MIN_SPEED = get_seed("MIN_MOVE_SPEED_KMH")    # 3
MAX_SPEED = 150  # kmh, 하드코딩 (오토바이 물리적 한계)
```

→ GPS 메시지에 timestamp 포함 시 속도 계산 가능. 없으면 distance만으로 판단.

---

## 7. API 엔드포인트 (Engine 신규)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/v1/quest-cards` | 카드 생성 (BFF accept 시 호출) |
| `GET` | `/v1/users/{user_id}/quest-cards?status=ACTIVE` | 활성 카드 목록 |
| `GET` | `/v1/users/{user_id}/quest-cards/completed` | 미확인 완료 카드 (BFF 폴링용) |
| `POST` | `/v1/quest-cards/{card_id}/cancel` | 카드 취소 (퀘스트 포기 시) |
| `GET` | `/v1/users/{user_id}/daily-quest-slots` | 슬롯 현황 (used / max) |

---

## 8. 트랜잭션 경계

### 주의: mileageUpdate와 questUpdate의 독립성

`mileage.update_mileage()`와 `quest_tracker.update()`는 **별도 DB 세션**을 사용한다.
마일리지가 성공하고 퀘스트 체크가 실패해도:
- 마일리지 누적은 유지됨 (정확한 거리 기록이 우선)
- 퀘스트 체크는 다음 GPS 수신 시 재시도됨 (누적 거리 기반이므로 멱등)
- CHECKPOINT 타입도 위치가 맞으면 다음 GPS에서 재체크됨

→ **동일 트랜잭션 불필요**. 대신 quest_tracker에 try/except로 실패 격리.

---

## 9. 구현 순서

### Phase 1: 기본 퀘스트 카드 체크
1. `sre_quest_card` 테이블 마이그레이션
2. `SreQuestCard` SQLAlchemy 모델 + Enum 추가
3. `quest_tracker.py` 서비스 (update, _complete_card, _haversine)
4. `GpsAgent.handle()`에 quest_tracker.update() 체이닝
5. Engine 라우터: POST/GET/CANCEL quest-cards
6. BFF `accept_quest`에서 Engine quest-card 생성 호출 추가
7. BFF 폴링 엔드포인트: 완료 카드 확인 → user_quests 상태 갱신

### Phase 2: 데일리 슬롯 정책
8. `sre_seed_config` 테이블 + seed 초기 데이터
9. 슬롯 계산 함수 (base + level_bonus + item_bonus)
10. Engine API: GET /v1/users/{user_id}/daily-quest-slots
11. BFF accept 시 슬롯 체크 → 초과 시 409

### Phase 3: 고도화
12. GPS 노이즈 필터 (속도 기반)
13. Push 통지 (Redis Streams quest_completed 이벤트)
14. 복합 카드 타입 (DISTANCE + CHECKPOINT 조합)
15. 퀘스트 카드 만료 배치 (APScheduler)

---

## 10. 기존 시스템과의 관계

| 기존 시스템 | 역할 | 퀘스트 카드와의 관계 |
|---|---|---|
| `MissionDefinition` + `UserMissionProgress` | 이벤트 기반 미션 (자동 추적) | **병렬 운용**. 미션은 이벤트 카운팅, 카드는 GPS 실시간 |
| `RewardPolicy` | 마일스톤 보상 (거리/레벨 도달 시) | 무관. 정책은 전체 누적 기준 |
| `event_bus.process_event()` | 행동 이벤트 → XP 계산 | 카드 완료 시 QUEST_COMPLETE 이벤트 발행 가능 |
| BFF `user_quests` | 퀘스트 수락/완료 상태 | 카드의 상위 엔티티. 카드 완료 → user_quests COMPLETED |
| BFF `ride_sessions` | 라이딩 결과 기록 | 카드와 독립. ride_submit은 별도 플로우 유지 |
