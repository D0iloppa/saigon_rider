# §7 퀘스트 COUNT_EVENT 검증 점검

> 진척도: [../progress.md](../progress.md) · 이슈 로그: [../issues.md](../issues.md)
> 구현 보고서: [../../engine/quest-count-event-implementation.md](../../engine/quest-count-event-implementation.md)

`count_event` 검증기 종단(BFF 도메인액션 → 엔진 이벤트 → 카드 카운트 → 완료/보상)을 점검한다.
[DBG] 시드 퀘스트 `00000000-0000-0000-0000-0000000d8003` (= "[DBG] 피드 1회 공유", SHARE_SNS ×1) 사용.

## 7.0 사전 조건

| 항목 | 확인 | 상태 |
|---|---|---|
| 마이그레이션 적용 | `quest_card_type`/`quest_card_type_enum` 에 `COUNT_EVENT` 존재, `sre_quest_card.progress`·`quests.criteria` 컬럼 존재 | ⬜ |
| alembic 버전 | `SELECT version_num FROM alembic_version` == `sre047` | ⬜ |
| 디버그 시드 | `quests` 에 `…d8003` 행 존재, `card_type='COUNT_EVENT'`, `criteria={"action_code":"SHARE_SNS","target_count":1}` | ⬜ |
| 컨테이너 | engine/worker/bff/frontend 모두 healthy, worker agents 에 `quest_completed` 포함 | ⬜ |

## 7.1 검증기 단위 (엔진 내부)

| # | 시나리오 | 기대 | 상태 |
|---|---|---|---|
| 7.1.1 | COUNT_EVENT 카드 생성 후 `dispatch_event(SHARE_SNS)` 1회 | `progress.count=1`, target 미달 시 `ACTIVE` 유지 | ⬜ |
| 7.1.2 | target_count 도달까지 반복 | 도달 순간 `status=COMPLETED`, `completed_ids` 에 card_id | ⬜ |
| 7.1.3 | 무관 action_code(예: COMMENT_POST) 디스패치 | 해당 카드 `progress` 불변·`ACTIVE` 유지 (미카운트) | ⬜ |
| 7.1.4 | GpsSignal 디스패치 | COUNT_EVENT 카드는 `accepts`=False 로 무시 | ⬜ |

## 7.2 HTTP 종단 (서비스 간)

| # | 호출 | 기대 | 상태 |
|---|---|---|---|
| 7.2.1 | `POST /v1/quest-cards` (COUNT_EVENT) | 201, `status=ACTIVE`, `progress={}` | ⬜ |
| 7.2.2 | `POST /v1/events` (SHARE_SNS, PROCESSED) | event PROCESSED 후 카드 `COMPLETED` 로 전이 | ⬜ |
| 7.2.3 | `GET /v1/quest-cards/by-user-quest` (= BFF `/quests/active-card`) | 응답에 `progress` 필드 노출 | ⬜ |
| 7.2.4 | 일일캡 초과 이벤트(2번째 SHARE_SNS, 같은 날) | `DAILY_COUNT_LIMIT` reject → 퀘스트 카운트 **안 됨**(설계상 정상) | ⬜ |

## 7.3 앱 화면 (휴먼 점검)

| # | 동작 | 기대 | 상태 |
|---|---|---|---|
| 7.3.1 | 퀘스트 목록에서 "[DBG] 피드 1회 공유" 수령 | 수령 후 "수행 시작" 확인 다이얼로그 | ⬜ |
| 7.3.2 | 수행 시작 | `/ride-nav`(지도)가 아니라 **`/quest-check/:id`** 로 이동, 탭바 숨김 | ⬜ |
| 7.3.3 | QuestChecker 표시 | 제목·"피드 공유 0 / 1 회"·진행바·진행 힌트 표시 | ⬜ |
| 7.3.4 | 피드 1회 공유 후 화면 복귀 | 3초 폴링으로 `count` 갱신, 도달 시 진행바 100%·완료 힌트·완료 버튼 | ⬜ |
| 7.3.5 | 완료 후 | UserQuest=COMPLETED, exp/gold 지급(프로필/보상 반영) | ⬜ |

## 7.4 점검 명령 (참고)

```bash
# enum/컬럼 확인
docker exec saigon_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT t.typname, string_agg(e.enumlabel, '\'','\'') FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid \
   WHERE t.typname IN ('\''quest_card_type'\'','\''quest_card_type_enum'\'') GROUP BY 1;"'

# 디버그 시드 확인
docker exec saigon_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT card_type, criteria FROM quests WHERE id='\''00000000-0000-0000-0000-0000000d8003'\'';"'

# 카드 상태 추적
docker exec saigon_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT card_id, card_type, criteria, progress, status FROM sre_quest_card ORDER BY card_id DESC LIMIT 5;"'
```

> 주의: `SHARE_SNS` 는 일일캡 1. `target_count>1` 검증기 테스트는 7.1(엔진 내부 dispatch_event 직접 호출)로 한다.
