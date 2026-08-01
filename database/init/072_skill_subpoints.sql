-- =============================================================
-- Saigon Rider — SGR-280: 스킬 단계당 비용 1→3 SP (서브포인트 0~9 체계)
-- 효과 단계는 0~3 유지, 내부 저장을 0~9 서브포인트로 전환 (단계 = 값 // 3).
-- 한 단계 = 3 서브칸 = 3 SP. 048/056 의 후속.
-- 기존값(0~3 단계)을 ×3 하여 단계를 보존(파괴적 리셋 아님).
-- =============================================================

-- 0~3 CHECK 제거
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_skill_distance_rider_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_skill_gold_hunter_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_skill_quest_slot_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_skill_cost_discount_check;

-- 기존 단계값 → 서브포인트(×3) 로 보존 이관
UPDATE users SET
    skill_distance_rider = skill_distance_rider * 3,
    skill_gold_hunter    = skill_gold_hunter * 3,
    skill_quest_slot     = skill_quest_slot * 3,
    skill_cost_discount  = skill_cost_discount * 3;

-- 0~9 서브포인트 CHECK 재설정
ALTER TABLE users ADD CONSTRAINT users_skill_distance_rider_check CHECK (skill_distance_rider BETWEEN 0 AND 9);
ALTER TABLE users ADD CONSTRAINT users_skill_gold_hunter_check    CHECK (skill_gold_hunter BETWEEN 0 AND 9);
ALTER TABLE users ADD CONSTRAINT users_skill_quest_slot_check     CHECK (skill_quest_slot BETWEEN 0 AND 9);
ALTER TABLE users ADD CONSTRAINT users_skill_cost_discount_check  CHECK (skill_cost_discount BETWEEN 0 AND 9);
