# 퀘스트 검증기 — COUNT_EVENT 종단 구현 보고서

> 작성일: 2026-06-07
> 상태: DONE — count_event 종단 + count_distinct 검증기 구현·검증 완료
> 관련: [sre-quest-completion-design.md](sre-quest-completion-design.md), [sre-mission-mapping-report.md](sre-mission-mapping-report.md), [quest-reclassification-proposal.md](quest-reclassification-proposal.md)

> **추가(2026-06-07): `count_distinct` 검증기.**
> `CountDistinctValidator` — 이벤트 payload 의 식별키(`distinct_key`) 기준 **서로 다른 값 개수**를 집계.
> criteria: `{action_code, distinct_key, target_count}`, progress: `{seen: [중복제거 키목록]}`.
> 같은 대상 반복 이벤트는 1개로만 집계(count_event 와의 차이). "정비소 비교"류(`W-MT-06`,`W-MT-09`)에 적용
> (`MAINTENANCE_RECEIPT` / `distinct_key=shop_id` / 2곳). enum `COUNT_DISTINCT` 추가(alembic `sre048`, init `069`).
> emitter 가 payload 에 `shop_id` 를 실어야 집계(현재 미연결 → 진행도만). 프론트 QuestChecker 가 COUNT_DISTINCT 표시 지원.

---

## 1. 배경 / 결정

퀘스트 검증은 `QuestValidator` ABC(전략 패턴) + `ValidatorRegistry`(card_type 1:1)로 추상화돼 있었으나,
실제 구현은 GPS 신호 기반 2종(`DISTANCE`, `CHECKPOINT`)뿐이었다. 사용자에게 노출되는 240여 퀘스트의
대다수는 **이벤트 횟수/누적/고유수 집계(agg)** 형이라 검증기가 없는 상태였다.

**결정 (A안):** 검증기를 **카테고리(RIDING/COMMUNITY…)가 아니라 집계방식(agg)** 축으로 분리한다.
같은 "횟수 세기"가 댓글·영수증·배달에 공통으로 쓰이므로, `count_event` 검증기 1개가 다수 퀘스트를 커버한다.
무엇을 셀지(`action_code`)·얼마나(`target_count`)는 검증기가 아니라 **card 의 `criteria` 로 주입**한다.

이 문서는 그 첫 종단(`count_event`) 1줄기를 기록한다.

---

## 2. 종단 흐름

```
[도메인 액션] 피드 공유 (BFF)
  feed.create_feed_post()
   └→ engine_client.post_event(action_code="SHARE_SNS")          # 기존 RP 경로 재사용
        └→ Engine POST /v1/events
             └→ event_bus.process_event()  (멱등→검증→어뷰징→일일캡→RP→미션)
                  └→ [NEW] quest_tracker.dispatch_event(user_id, action_code, payload)   # PROCESSED 경로에서만
                       └→ EventSignal(kind=action_code) 디스패치
                            └→ CountEventValidator.accepts(EventSignal)==True
                                 └→ on_signal: progress.count += 1
                                      └→ count >= criteria.target_count  → ValidationResult(completed=True)
                                           └→ _complete_card() → Redis "quest_completed" 발행
                                                └→ QuestCompletedAgent → BFF /internal/quest-card-completed
                                                     └→ UserQuest=COMPLETED, exp/gold 지급
```

**핵심 설계점**
- 퀘스트 디스패치는 `process_event` 의 **PROCESSED 경로에서만** 호출된다. 어뷰징/일일캡으로 reject 된
  이벤트는 퀘스트에도 카운트되지 않는다(= 진짜로 인정된 행동만 카운트).
- `dispatch_event` 는 **자체 DB 세션**으로 동작하고, 실패해도 이벤트 처리 결과에 영향을 주지 않는다(try/except).
- 검증기는 GPS 경로(`quest_tracker.update`)와 이벤트 경로(`dispatch_event`)를 **공통 `dispatch()`** 로 처리.
  `accepts(signal)` 가 신호 종류(Gps/Event)를 1차 게이트, `on_signal` 안에서 `action_code` 매칭을 2차 게이트.

---

## 3. 데이터 모델

### sre_quest_card (Engine)
| 컬럼 | 설명 |
|---|---|
| `criteria` JSONB | 목표 스펙(불변). count_event: `{"action_code": "...", "target_count": N}` |
| `progress` JSONB | **신규.** 검증기 런타임 상태(가변). count_event: `{"count": N}` |

> `criteria`/`progress` 분리: 목표(불변) vs 진행(가변). 향후 agg(distinct/streak)는 progress 키만 늘리면 됨.
> JSONB 변경은 in-place 가 아닌 **새 dict 재할당**으로 dirty 추적(`card.progress = {**card.progress, ...}`).

### quests (BFF)
| 컬럼 | 설명 |
|---|---|
| `criteria` JSONB | **신규.** 비-GPS 검증타입의 목표 파라미터 SoT. start-ride 가 그대로 엔진 카드로 전달 |
| `card_type` | enum 에 `COUNT_EVENT` 추가. `quests_card_payload_chk` 제약도 COUNT_EVENT 인지형으로 확장 |

### enum (PG, 단일 DB 2종)
- `quest_card_type` (BFF quests) ← `COUNT_EVENT` 추가
- `quest_card_type_enum` (Engine sre_quest_card) ← `COUNT_EVENT` 추가

---

## 4. 변경 파일

### Engine
- `app/enums.py` — `QuestCardTypeEnum.COUNT_EVENT`
- `app/models.py` — `SreQuestCard.progress` JSONB
- `app/schemas.py` — `QuestCardRead.progress` 노출(프론트 폴링용)
- `app/services/quest_validators/count_event.py` — **신규** `CountEventValidator`
- `app/services/quest_validators/__init__.py` — registry 등록
- `app/services/event_bus.py` — PROCESSED 경로에 `quest_tracker.dispatch_event` 훅 + logger
- `alembic/versions/047_quest_count_event.py` — enum 값 + progress 컬럼

### BFF
- `app/models.py` — `Quest.criteria` JSONB
- `app/routers/user_quests.py` — start-ride 에 `COUNT_EVENT` 분기(criteria=quest.criteria)

### DB
- `database/init/067_quest_count_event.sql` — enum/criteria/CHECK/[DBG]시드 (재생성용)
- 가동 중 DB: 동일 DDL 직접 적용 + `alembic_version` → `sre047` stamp

### Frontend
- `api/types.ts`, `api/quests.ts` — `cardType`/`ActiveCardState` 에 COUNT_EVENT·`progress` 추가
- `pages/quest/QuestDetail.tsx` — start-ride 분기: 지도형→`/ride-nav`, COUNT_EVENT→`/quest-check/:id`
- `components/quest/QuestChecker.tsx` (+ `.module.css`) — **신규** 범용 검증 표출 컴포넌트
- `pages/quest/QuestCheckPage.tsx` (+ `.module.css`) — **신규** 폴링 컨테이너(3초)
- `App.tsx` — `/quest-check/:userQuestId` 라우트
- `components/layout/AppShell.tsx` — `/quest-check/` 탭바 숨김
- `store/useRideStore.ts` — cardType 내로잉(COUNT_EVENT는 ride store 미진입)
- `locales/{ko,en,vi}` — `questCheck` 블록

---

## 5. 프론트 분기 원칙

- **지도가 필요한 타입(DISTANCE/CHECKPOINT)** → 기존 `RideNav`(MapLibre, GPS 추적) 재사용.
- **비-지도 검증타입(COUNT_EVENT 등)** → 범용 `QuestChecker` 컴포넌트가 validator 진행도를 표출.
  `QuestChecker` 는 card_type 별로 표시(라벨·current/target·진행바)를 분기하는 범용 뷰이며,
  향후 agg(sum/distinct/streak) 추가 시 `QuestChecker` 의 switch 한 곳만 늘리면 된다.

---

## 6. 검증 결과 (구현 시점)

- 검증기 단위: EventSignal 3회 → `progress.count` 1→2→3, target=3 에서 `COMPLETED`. 무관 action_code 는 미카운트. ✅
- HTTP 종단: `POST /v1/quest-cards`(ACTIVE) → `POST /v1/events`(SHARE_SNS, PROCESSED) → 카드 `COMPLETED`. ✅
- `progress` 가 `/v1/quest-cards/by-user-quest`(= BFF `/quests/active-card`) 응답에 노출. ✅
- 전 컨테이너(engine/worker/bff/frontend) 정상 기동, 프론트 빌드 통과. ✅

---

## 7. 제약 / 후속 (중요)

- **SHARE_SNS 는 `action_definition.daily_count_limit=1`.** count_event 는 PROCESSED 이벤트만 카운트하므로,
  하루 1회 캡인 액션으로는 `target_count>1` 을 같은 날 충족할 수 없다. → [DBG] 시드는 `target_count=1` 로 설계.
  운영 퀘스트는 액션의 일일캡 ≥ target_count 가 되도록 설계할 것.
- **EventSignal 발행처(emitter)가 부족하다.** 현재 BFF→엔진 이벤트는 `SHARE_SNS`(피드 작성) 외에는 미연결.
  댓글/영수증/배달 등 다른 action_code 의 count_event 퀘스트를 살리려면 각 도메인 액션에서
  `engine_client.post_event(action_code=...)` 를 호출해야 한다.
- **다른 agg 검증기 미구현:** `sum_field`, `count_distinct`, `streak_days`, `composite`,
  `count_mission_complete`. A안 축을 그대로 확장하면 됨(QuestValidator 구현 + registry 등록 + progress 키).
- **240건 criteria 데이터 백필 미완:** 본 작업은 [DBG] 1건만 시드. 운영 활성 퀘스트의 agg/action_code/target
  데이터 입력은 별도 과업.
