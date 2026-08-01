-- 033: badges 테이블에 policy_id 추가
-- reward_policy는 Engine DB에 존재하므로 FK 없이 soft reference
-- Application 레이어에서 engine.reward_policy.id와 매핑

ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS policy_id BIGINT DEFAULT NULL;

COMMENT ON COLUMN badges.policy_id IS 'Engine DB reward_policy.id soft reference — 이 뱃지의 획득 조건 정책';
