-- =============================================================
-- Saigon Rider — SGR-272: 스킬트리 ↔ 아이템 효과 4축 정합
-- safe_rider 폐기, QUEST_SLOT / COST_DISCOUNT 스킬 신설 (각 0~3)
-- 048_user_skill_levels.sql 의 후속 (safe_rider 컬럼은 048에서 추가됨)
-- =============================================================

ALTER TABLE users
    DROP COLUMN IF EXISTS skill_safe_rider,
    ADD COLUMN skill_quest_slot    SMALLINT NOT NULL DEFAULT 0 CHECK (skill_quest_slot BETWEEN 0 AND 3),
    ADD COLUMN skill_cost_discount SMALLINT NOT NULL DEFAULT 0 CHECK (skill_cost_discount BETWEEN 0 AND 3);
