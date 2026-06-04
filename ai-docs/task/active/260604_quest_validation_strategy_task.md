# 퀘스트 검증 인터페이스 추상화 (전략패턴 + 신호 기반)

> **상태**: PLANNED · **생성**: 2026-06-04 · **영역**: engine (SRE)
> **SoT**: 이 문서 · **Notion 미러**: https://app.notion.com/p/3753bd6b405d81758859f134f2b857e3

## 목적

퀘스트 검증 로직을 타입별 `if/elif` 하드코딩에서 **전략패턴 + 신호(Signal) 기반 인터페이스**로 추상화한다.
퀘스트 유형이 GPS 기반(이동거리·체크포인트)을 넘어 이벤트 기반(댓글달기·퀘스트 N개 수행 등)으로
다양해질 때, 신규 타입을 **Validator 한 개 추가**만으로 확장할 수 있게 한다.

## 현재 구조 (AS-IS)

- `engine/app/services/quest_tracker.py:21` `update(user_id, lat, lng, distance_m)`
  - GPS 핑을 트리거로 호출 (`engine/app/workers/gps_agent.py`)
  - `card_type == DISTANCE` → 누적거리 ≥ 목표거리
  - `card_type == CHECKPOINT` → Haversine 근접거리 ≤ 임계값(seed `CHECKPOINT_PROXIMITY_M`, 기본 100m)
- `engine/app/enums.py:169` `QuestCardTypeEnum` (DISTANCE / CHECKPOINT)
- `migration 024` CHECK 제약: 타입별 필수 컬럼이 테이블에 직접 박힘
  (`DISTANCE→target_distance_m`, `CHECKPOINT→target_lat/lng`)

### 핵심 문제

1. **트리거 강결합** — `update()` 시그니처가 GPS 핑(lat/lng/distance)에 묶여 있다.
   이벤트형 타입(댓글·카운터)은 GPS 핑과 무관하게 평가돼야 하므로, GPS 시그니처에 비-GPS
   타입을 억지로 얹으면 규약이 무너진다.
2. **스키마 확장 폭발** — 타입별 목표 컬럼을 늘리면 CHECK 제약·마이그레이션이 타입마다 증식한다.

## 설계 (TO-BE)

추상화 축을 **입력 신호(Signal)** 로 잡는다.

```
Signal
 ├─ GpsSignal   { lat, lng, distance_m }
 └─ EventSignal { kind, payload }          # comment_created, quest_completed, ...
        ↓ dispatch (signal.kind → 구독 Validator)
QuestValidator (전략 인터페이스)
   on_signal(card, signal) -> ValidationResult { completed, telemetry_patch }
   ├─ DistanceValidator    (GpsSignal 구독)
   ├─ CheckpointValidator  (GpsSignal 구독)
   └─ (신규) CounterValidator / CommentValidator (EventSignal 구독)
ValidatorRegistry: card_type → Validator
```

- **목표 파라미터는 `criteria JSONB` 컬럼으로 전면 이관** (사용자 결정).
  기존 2종 컬럼 데이터(`target_distance_m`, `target_lat/lng`)를 `criteria`로 백필하고,
  타입별 CHECK 제약을 제거한다. (라이브 텔레메트리 컬럼 `current_distance_m`,
  `distance_to_target_m`, `last_*`는 런타임 상태이므로 유지)

## Phase / 서브태스크

### P1. 스키마 — criteria JSONB 전면 이관 → 검증: 마이그레이션 정/역 + 백필 데이터 정합
- `sre_quest_card.criteria JSONB NOT NULL` 컬럼 추가 마이그레이션
- 기존 DISTANCE/CHECKPOINT 행을 `criteria`로 백필 (예: `{"target_distance_m": N}` / `{"target_lat":..,"target_lng":..}`)
- 타입별 CHECK 제약(`chk_card_type`) 제거
- `models.py` `SreQuestCard.criteria` 매핑, `schemas.py` `QuestCardCreate/Read` 반영
- ⚠️ 신규 enum 값 추가 시 [PG enum 이중 갱신 규약] 준수: migration + `enums.py` 동시 + 엔진 재시작

### P2. Signal + Validator 인터페이스 정의 → 검증: 타입 정의 import·mypy/ruff 통과
- `engine/app/services/quest_validators/` (신설) — `base.py`에 `Signal`, `GpsSignal`,
  `EventSignal`, `QuestValidator` ABC, `ValidationResult`, `ValidatorRegistry`
- 시그니처: `async on_signal(card, signal, db) -> ValidationResult`

### P3. 기존 로직 전략 이관 → 검증: DISTANCE/CHECKPOINT 동작 불변 (회귀 테스트)
- `DistanceValidator`, `CheckpointValidator` 로 `quest_tracker.update`의 if/elif 추출
- `quest_tracker.update`를 GpsSignal 생성 → registry dispatch 로 리팩토링
- 라이브 텔레메트리(속도·last_*) 갱신 책임 분리 (공통 vs validator)
- **회귀 기준**: 기존 GPS 시나리오에서 완료 판정·완료 이벤트(`quest_completed`)가 동일

### P4. 이벤트 신호 디스패치 경로 (시드만) → 검증: 진입점 존재
- 비-GPS 트리거용 진입점: `quest_tracker.dispatch_event(user_id, kind, payload)` 추가 ✅
- **결정(2026-06-04)**: 구체 이벤트 타입(COUNTER 등)·publisher 배선은 **본 티켓 범위에서 제외**.
  아직 해당 타입을 쓰는 퀘스트가 없어 enum/DB 선반영은 speculative(카파시 §2). 실제 제품 요구
  발생 시 `QuestValidator` 구현 + enum 추가(이중 갱신 규약)로 대응한다.

### P5. 검증·회귀 → 검증: 엔진 재기동 후 기존/신규 타입 5xx 무발생
- 엔진 컨테이너 재빌드·재기동
- 기존 DISTANCE/CHECKPOINT 라이드 완료 플로우 회귀
- 신규 enum/criteria 경로 smoke

## 제약 / 주의

- BFF는 Engine DB 직접 접근 금지 — `engine_client.py` HTTP만 (criteria 전달도 동일).
- Engine 코드 `datetime.now()` naive 금지 — timezone-aware 유지.
- `card_type` enum 추가 = PG enum 값 추가 → 마이그+`enums.py`+엔진재시작 동시 (누락 시 500 LookupError).
- BFF `start_ride`(`backend/app/routers/user_quests.py`)도 criteria 페이로드로 맞춰 조정 필요.

## 영향 파일 (예상)

- `engine/app/services/quest_tracker.py` (리팩토링)
- `engine/app/services/quest_validators/*` (신설)
- `engine/app/enums.py`, `engine/app/models.py`, `engine/app/schemas.py`
- `engine/alembic/versions/0XX_quest_criteria_jsonb.py` (신설)
- `engine/app/routers/quest_cards.py`, `backend/app/routers/user_quests.py` (criteria 배선)
