-- =============================================================
-- Saigon Rider — 마일리지 보상 증폭 스킬 (skill_mileage_rate)
-- 누적 마일리지로 지급되는 RP/Gold/EXP 보상을 단계당 +1% 증폭 (최대 +3%).
-- 0~9 서브포인트 체계(단계 = 값 // 3), 072 의 후속.
-- =============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS skill_mileage_rate SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_skill_mileage_rate_check;
ALTER TABLE users ADD CONSTRAINT users_skill_mileage_rate_check CHECK (skill_mileage_rate BETWEEN 0 AND 9);
