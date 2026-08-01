-- Quest FK 전면 매핑: rider_type_id, min_safety_grade_id 의 NULL 잔여분을 채운다.
-- 정책 (2026-05-16):
--   1) 키워드 매핑 (기존 011/013 까지의 결과 유지)
--   2) NULL 잔여분은 period 기반 폴백
--      - rider_type:   DAILY→COMMUTER(1), WEEKLY→CAFE_HUNTER(2), EVENT→NIGHT_RIDER(3)
--      - safety_grade: DAILY→A(1),        WEEKLY→B(2),           EVENT→C(3)
--
-- 이 SQL 은 멱등 (NULL 인 행만 UPDATE) — 재실행해도 키워드 매핑된 행을 덮어쓰지 않는다.

-- ── 키워드 우선 (멱등 — 기존 매핑 있는 경우 무시) ────────────────────────────

UPDATE quests SET rider_type_id = 1
  WHERE rider_type_id IS NULL
    AND title_ko SIMILAR TO '%(통근|출퇴근|점심시간|첫 배차)%';

UPDATE quests SET rider_type_id = 2
  WHERE rider_type_id IS NULL
    AND title_ko LIKE '%카페%';

UPDATE quests SET rider_type_id = 3
  WHERE rider_type_id IS NULL
    AND (title_ko SIMILAR TO '%(야간|새벽|Night)%' OR title_ko LIKE '%야시장%');

UPDATE quests SET min_safety_grade_id = 1
  WHERE min_safety_grade_id IS NULL
    AND title_ko SIMILAR TO '%(안전|정속|매너)%';

-- ── period 기반 폴백 (잔여 NULL) ──────────────────────────────────────────

UPDATE quests SET rider_type_id = 1 WHERE rider_type_id IS NULL AND period = 'DAILY';
UPDATE quests SET rider_type_id = 2 WHERE rider_type_id IS NULL AND period = 'WEEKLY';
UPDATE quests SET rider_type_id = 3 WHERE rider_type_id IS NULL AND period = 'EVENT';

UPDATE quests SET min_safety_grade_id = 1 WHERE min_safety_grade_id IS NULL AND period = 'DAILY';
UPDATE quests SET min_safety_grade_id = 2 WHERE min_safety_grade_id IS NULL AND period = 'WEEKLY';
UPDATE quests SET min_safety_grade_id = 3 WHERE min_safety_grade_id IS NULL AND period = 'EVENT';
