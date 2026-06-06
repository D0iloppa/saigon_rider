-- 퀘스트 활성화 정리 + 수행가능 시간대 (2026-06-05)
-- 정책:
--   1) 구현된 검증기는 DISTANCE(누적거리)·CHECKPOINT(근접) 2종뿐. 그 외 의도
--      (세차/댓글/거래/정비/사진/geo/날씨/주간누적 등)는 미구현 placeholder.
--   2) 미구현 퀘스트 전부 비활성. DBG + 순수 거리/체크포인트 퀘스트 14개만 활성.
--   3) 일부 거리 퀘스트는 '수행가능 시간대'(ICT 로컬시각)를 가진다.
--      available_from/to 둘 다 NULL = 시간 제약 없음 (OPTIONAL).
--      게이트는 BFF start-ride 시점에서 검사 (엔진/검증기 변경 없음).
-- 멱등: 컬럼 추가는 IF NOT EXISTS, 활성화는 title_ko 기준 일괄 갱신.

BEGIN;

-- ── 1) 수행가능 시간대 컬럼 (OPTIONAL, ICT 로컬시각) ────────────────────────
ALTER TABLE quests ADD COLUMN IF NOT EXISTS available_from TIME;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS available_to   TIME;

COMMENT ON COLUMN quests.available_from IS '수행가능 시작시각 (ICT 로컬, NULL=제약없음). start-ride 게이트';
COMMENT ON COLUMN quests.available_to   IS '수행가능 종료시각 (ICT 로컬, NULL=제약없음). 자정 미교차 가정';

-- ── 2) 전체 비활성화 후 큐레이션 14개만 재활성 ────────────────────────────
UPDATE quests SET is_active = FALSE, available_from = NULL, available_to = NULL;

-- 체크포인트 (DBG) — 좌표는 기존값 유지
UPDATE quests SET is_active = TRUE
  WHERE title_ko IN ('[DBG] 테스트 장소 접근하기', '[DBG] 한일타운');

-- 거리 — 시간 무관 (목표 거리는 기존값 유지)
UPDATE quests SET is_active = TRUE
  WHERE title_ko IN (
    '[DBG] 5KM 라이딩',
    '오늘의 1km', '주행거리 기록', '도시 탐험가',
    '짧은 한 바퀴', '강변 산책',
    '쇼트 어택', '정속 라이더', '출퇴근 라이더'
  );

-- 거리 — 수행가능 시간대 지정
UPDATE quests SET is_active = TRUE, available_from = '05:00', available_to = '07:00'
  WHERE title_ko = '새벽 라이더';
UPDATE quests SET is_active = TRUE, available_from = '19:00', available_to = '22:00'
  WHERE title_ko = '야간 라이더';
UPDATE quests SET is_active = TRUE, available_from = '11:00', available_to = '13:00'
  WHERE title_ko = '점심시간 라이딩';

COMMIT;
