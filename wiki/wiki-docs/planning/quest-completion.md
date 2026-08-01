---
sidebar_position: 4
title: "퀘스트 달성 체크 시스템"
---

# 퀘스트 달성 체크 시스템

GPS 좌표/이동거리 수신 시 마일리지 업데이트와 퀘스트 달성 여부를 동시에 체크하는 시스템.

## 아키텍처

```
Redis Stream (type="gps")
  → GpsAgent.handle()
    → mileage.update_mileage()           ← 기존 마일리지 누적
      → policy_engine.evaluate_policies() ← 기존 정책 평가
    → quest_tracker.update()              ← 신규 퀘스트 체크
      → 활성 퀘스트 카드 순회
      → DISTANCE: 거리 차감 → 달성 시 완료
      → CHECKPOINT: 좌표 근접(100m) → 달성 시 완료
```

### 데이터 흐름

```
BFF: POST /api/quests/{id}/accept
  ← 퀘스트 수락 → UserQuest 생성
  → Engine: POST /v1/quest-cards
    ← 퀘스트 카드 생성 (DISTANCE | CHECKPOINT)

GPS 수신 (라이딩 중, 매초~수초)
  → Redis Stream → GpsAgent
    → quest_tracker.update(user_id, lat, lng, distance_m)
      → sre_quest_card 상태 갱신

BFF: 클라이언트 주기적 폴링
  → Engine: GET /v1/users/{id}/quest-cards/completed
    ← 완료된 카드 목록 → user_quests 상태 갱신 → 보상 지급
```

## 퀘스트 카드 타입

| 타입 | 달성 조건 | 예시 |
|------|-----------|------|
| `DISTANCE` | 누적 이동거리가 목표 달성 | "5km 라이딩하기" |
| `CHECKPOINT` | 특정 좌표 반경 100m 이내 도달 | "Pham Ngu Lao 도착하기" |

### sre_quest_card 테이블 (Engine)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `card_id` | BIGINT PK | 자동 증가 |
| `user_id` | BIGINT FK | sre_user 참조 |
| `external_quest_id` | VARCHAR(64) | BFF quests.id |
| `user_quest_id` | VARCHAR(64) | BFF user_quests.id |
| `card_type` | ENUM | DISTANCE / CHECKPOINT |
| `target_distance_m` | INTEGER | 목표 거리 (DISTANCE) |
| `current_distance_m` | INTEGER | 현재 누적 거리 |
| `target_lat` / `target_lng` | NUMERIC(9,6) | 목표 좌표 (CHECKPOINT) |
| `status` | ENUM | ACTIVE / COMPLETED / EXPIRED / CANCELLED |
| `expires_at` | TIMESTAMPTZ | 만료 시각 |

## 데일리 퀘스트 슬롯

하루에 수행 가능한 데일리 퀘스트 수에 상한을 두는 정책.

### 기본 규칙

- **기본 슬롯**: 3개 (seed: `DAILY_QUEST_BASE_SLOTS`)
- **주간/이벤트 퀘스트**: 슬롯 제한 없음
- **레벨 보너스**: Lv5 +1, Lv10 +1, Lv20 +1, Lv30 +1 (최대 +4)
- **아이템 보너스**: 착용 아이템의 `daily_quest_slot` 효과 합산

### 슬롯 계산

```
max_slots = base(3) + level_bonus + item_bonus
remaining = max_slots - today_used_count
```

## Seed 정책 파라미터

| seed_code | 기본값 | 설명 |
|-----------|--------|------|
| `DAILY_QUEST_BASE_SLOTS` | 3 | 일일 퀘스트 기본 슬롯 수 |
| `CHECKPOINT_PROXIMITY_M` | 100 | 체크포인트 도달 인정 반경 (m) |
| `MIN_MOVE_SPEED_KMH` | 3 | GPS 노이즈 필터 최소 속도 |
| `DAILY_SLOT_LEVEL_BONUS` | JSON | 레벨별 슬롯 보너스 스텝 |

## Engine API

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/v1/quest-cards` | 카드 생성 |
| `GET` | `/v1/users/{id}/quest-cards` | 카드 목록 (status 필터) |
| `GET` | `/v1/users/{id}/quest-cards/completed` | 완료 카드 폴링 |
| `POST` | `/v1/quest-cards/{id}/cancel` | 카드 취소 |
| `GET` | `/v1/users/{id}/daily-quest-slots` | 슬롯 현황 |

## 구현 로드맵

| Phase | 내용 | 상태 |
|-------|------|------|
| **1** | DISTANCE 카드 체크 + Engine API + BFF 연동 | 완료 |
| **2** | 데일리 슬롯 제한 적용 (BFF accept 시 체크) | 완료 |
| **3** | GPS 노이즈 필터, Push 통지, 만료 배치 (APScheduler) | 완료 |

## 트랜잭션 설계

- `mileage.update_mileage()`와 `quest_tracker.update()`는 별도 DB 세션
- 마일리지 성공 + 퀘스트 실패 시: 마일리지 유지, 퀘스트는 다음 GPS에서 재시도
- CHECKPOINT도 위치가 맞으면 다음 GPS에서 재체크 (멱등)

## 검증 절차

### 1. 빌드 및 마이그레이션

```bash
# 전체 백엔드 스택 빌드
docker compose --profile backend up --build -d

# 마이그레이션 확인 (Engine 컨테이너 접속)
docker compose exec engine alembic upgrade head

# 테이블 생성 확인
docker compose exec db psql -U saigon -d saigon_db -c "\dt sre_seed_config"
docker compose exec db psql -U saigon -d saigon_db -c "\dt sre_quest_card"

# seed 데이터 확인
docker compose exec db psql -U saigon -d saigon_db -c "SELECT * FROM sre_seed_config"
```

### 2. Swagger UI 확인

- Engine: http://localhost:18090/api/sre/docs
- `quest-cards` 태그 아래 5개 엔드포인트 표시 확인:
  - `POST /v1/quest-cards`
  - `GET /v1/users/{user_id}/quest-cards`
  - `GET /v1/users/{user_id}/quest-cards/completed`
  - `POST /v1/quest-cards/{card_id}/cancel`
  - `GET /v1/users/{user_id}/daily-quest-slots`
  - `GET /v1/quest-cards/daily-slots` (uuid 기반)

### 3. 퀘스트 카드 CRUD 테스트

```bash
# 사전 조건: device-map으로 SRE 유저 등록 필요
curl -X POST http://localhost:18090/api/sre/v1/device-map \
  -H "X-Service-Key: $ENGINE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_uuid":"test-dev-001","external_user_uuid":"<BFF user UUID>"}'

# 카드 생성 (DISTANCE 5km)
curl -X POST http://localhost:18090/api/sre/v1/quest-cards \
  -H "X-Service-Key: $ENGINE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_uuid": "<BFF user UUID>",
    "external_quest_id": "<quest UUID>",
    "user_quest_id": "<user_quest UUID>",
    "card_type": "DISTANCE",
    "target_distance_m": 5000
  }'
# 예상: 201 Created, card_id 반환

# 활성 카드 조회
curl http://localhost:18090/api/sre/v1/users/{user_id}/quest-cards?status=ACTIVE \
  -H "X-Service-Key: $ENGINE_SERVICE_KEY"
# 예상: 방금 생성한 카드 표시, current_distance_m=0

# 카드 취소
curl -X POST http://localhost:18090/api/sre/v1/quest-cards/{card_id}/cancel \
  -H "X-Service-Key: $ENGINE_SERVICE_KEY"
# 예상: 204 No Content
```

### 4. 데일리 슬롯 확인

```bash
# uuid 기반 슬롯 조회
curl "http://localhost:18090/api/sre/v1/quest-cards/daily-slots?user_uuid=<UUID>" \
  -H "X-Service-Key: $ENGINE_SERVICE_KEY"
# 예상: {"max_slots":3,"used_slots":0,"remaining":3,"base":3,"level_bonus":0,"item_bonus":0}

# ACTIVE 카드 3개 생성 후 다시 조회 → remaining=0 확인
# BFF에서 DAILY 퀘스트 수락 시 409 반환 확인
```

### 5. GPS 기반 달성 체크 (GpsAgent)

```bash
# Redis Streams에 GPS 메시지 직접 발행 (테스트용)
docker compose exec redis redis-cli XADD sre:messages '*' \
  type gps \
  uuid test-dev-001 \
  message '{"y":10.7769,"x":106.7009,"d":2500}'

# Engine Worker 로그에서 확인
docker compose logs -f engine --since=1m | grep -i quest
# 예상: 카드 current_distance_m 증가 로그

# 2회째 GPS (추가 2500m → 합계 5000m = 목표 달성)
docker compose exec redis redis-cli XADD sre:messages '*' \
  type gps \
  uuid test-dev-001 \
  message '{"y":10.7770,"x":106.7010,"d":2500}'
# 예상: "[GPS] user=N quest cards completed: [card_id]" 로그

# 완료 카드 확인
curl http://localhost:18090/api/sre/v1/users/{user_id}/quest-cards/completed \
  -H "X-Service-Key: $ENGINE_SERVICE_KEY"
# 예상: status=COMPLETED, completed_at 값 존재
```

### 6. GPS 노이즈 필터 확인

```bash
# 연속 GPS 발행 (간격 1초 이내에 1000m → 시속 3600km, 비현실적)
docker compose exec redis redis-cli XADD sre:messages '*' \
  type gps uuid test-dev-001 message '{"y":10.7,"x":106.7,"d":100}'
# 즉시 이어서:
docker compose exec redis redis-cli XADD sre:messages '*' \
  type gps uuid test-dev-001 message '{"y":10.7,"x":106.7,"d":1000}'

# Worker 로그 확인
docker compose logs engine --since=1m | grep "noise"
# 예상: "noise filtered" 로그 → d=0 처리, 마일리지 미누적
```

### 7. 만료 배치 확인

```bash
# 만료 시각이 과거인 카드 생성
docker compose exec db psql -U saigon -d saigon_db -c "
  INSERT INTO sre_quest_card (user_id, external_quest_id, user_quest_id,
    card_type, target_distance_m, expires_at)
  VALUES (1, 'test-expire', 'test-expire-uq', 'DISTANCE', 9999,
    NOW() - INTERVAL '1 hour')
"

# 배치 수동 실행 (Engine 컨테이너)
docker compose exec engine python -c "
import asyncio
from app.jobs.expire_quest_cards import run
asyncio.run(run())
"

# 상태 확인
docker compose exec db psql -U saigon -d saigon_db -c "
  SELECT card_id, status FROM sre_quest_card
  WHERE external_quest_id = 'test-expire'
"
# 예상: status = 'EXPIRED'
```

### 8. Push 통지 (Redis Stream) 확인

```bash
# 카드 완료 후 Redis Stream에 quest_completed 이벤트 존재 확인
docker compose exec redis redis-cli XRANGE sre:messages - + COUNT 10
# 예상: type=quest_completed, message에 card_id/user_id/external_quest_id 포함
```

### 9. 린트

```bash
python3 -m ruff check engine/app/
python3 -m ruff check backend/app/
```

## 관련 문서

- [SRE 설계서](/wiki/docs/services/engine) — Engine 전체 아키텍처
- [SRE 비즈니스 규칙](/wiki/docs/services/engine) — 미션/보상 로직
