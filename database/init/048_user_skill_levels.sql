-- =============================================================
-- Saigon Rider — SGR-209 A2: 스킬 레벨 영속화
-- users 테이블에 스킬 3종 레벨 컬럼 추가 (0~3, investSkill 골격과 동일)
-- =============================================================

ALTER TABLE users
    ADD COLUMN skill_distance_rider SMALLINT NOT NULL DEFAULT 0 CHECK (skill_distance_rider BETWEEN 0 AND 3),
    ADD COLUMN skill_gold_hunter    SMALLINT NOT NULL DEFAULT 0 CHECK (skill_gold_hunter BETWEEN 0 AND 3),
    ADD COLUMN skill_safe_rider     SMALLINT NOT NULL DEFAULT 0 CHECK (skill_safe_rider BETWEEN 0 AND 3);
