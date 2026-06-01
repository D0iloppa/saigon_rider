-- ──────────────────────────────────────────────────────────────────────────
-- Saigon Rider — Migration Step 1: 기존 SRE 테이블 ALTER
-- 발행일: 2026-05-18
-- 대상: PostgreSQL 14+
-- 참조: sre-mission-item-reward-spec.md §8.1
--
-- 이 스크립트는 기존 SRE v1 테이블에 게이미피케이션을 위한 컬럼을 추가합니다:
--   1. mission_definition.reward_bundle JSONB
--   2. rp_transaction.currency (GP|GC)
--   3. rp_balance.gc_balance + lifetime_gc_*
--   4. user_mission_progress.reward_dispatched_at + reward_dispatch_log
--
-- 멱등성: 모든 ALTER가 IF NOT EXISTS 사용 → 재실행 안전
-- 순서: migration-step2-new-tables.sql 보다 먼저 실행 권장 (단, 독립적임)
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1.1 mission_definition: reward_rp → reward_bundle 확장
-- ──────────────────────────────────────────────────────────────────────────
-- (1) 컬럼 추가
ALTER TABLE mission_definition
  ADD COLUMN IF NOT EXISTS reward_bundle JSONB;

-- (2) 기존 reward_rp 데이터를 reward_bundle.gp로 마이그레이션
--     이미 reward_bundle이 채워져 있으면 건드리지 않음 (멱등)
UPDATE mission_definition
SET reward_bundle = jsonb_build_object(
  'gp',    COALESCE(reward_rp, 0),
  'gc',    0,
  'sxp',   0,
  'items', '[]'::jsonb,
  'boxes', '[]'::jsonb
)
WHERE reward_bundle IS NULL;

-- (3) NOT NULL 제약 부여
ALTER TABLE mission_definition
  ALTER COLUMN reward_bundle SET NOT NULL;

-- (4) reward_rp는 호환성을 위해 유지하지만 DEPRECATED 표시
COMMENT ON COLUMN mission_definition.reward_rp IS
  'DEPRECATED: use reward_bundle.gp instead. v2에서 제거 예정';

-- (5) JSONB 내부 키 인덱스 (운영 쿼리 가속화)
CREATE INDEX IF NOT EXISTS idx_mission_def_reward_gp
  ON mission_definition (((reward_bundle->>'gp')::INT));
CREATE INDEX IF NOT EXISTS idx_mission_def_has_items
  ON mission_definition USING gin ((reward_bundle->'items'));


-- ──────────────────────────────────────────────────────────────────────────
-- 1.2 rp_transaction: 통화(currency) 컬럼 추가
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE rp_transaction
  ADD COLUMN IF NOT EXISTS currency VARCHAR(4) NOT NULL DEFAULT 'GP';

-- CHECK 제약 추가 (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rp_transaction_currency_check'
  ) THEN
    ALTER TABLE rp_transaction
      ADD CONSTRAINT rp_transaction_currency_check
      CHECK (currency IN ('GP', 'GC'));
  END IF;
END $$;

-- 사용자별 + 통화별 트랜잭션 인덱스 (잔액 재계산용)
CREATE INDEX IF NOT EXISTS idx_rp_tx_user_currency
  ON rp_transaction(user_id, currency, occurred_at DESC);


-- ──────────────────────────────────────────────────────────────────────────
-- 1.3 rp_balance: GC 잔액 컬럼 3개 추가
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE rp_balance
  ADD COLUMN IF NOT EXISTS gc_balance         BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_gc_earned BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_gc_spent  BIGINT NOT NULL DEFAULT 0;

-- 음수 잔액 방지
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rp_balance_gc_nonneg') THEN
    ALTER TABLE rp_balance
      ADD CONSTRAINT rp_balance_gc_nonneg CHECK (gc_balance >= 0);
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────────────────
-- 1.4 user_mission_progress: 보상 디스패치 멱등성 컬럼
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE user_mission_progress
  ADD COLUMN IF NOT EXISTS reward_dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_dispatch_log  JSONB;

COMMENT ON COLUMN user_mission_progress.reward_dispatched_at IS
  '보상 디스패처가 처리 완료한 시각. NULL이면 미처리. 멱등성 키.';
COMMENT ON COLUMN user_mission_progress.reward_dispatch_log IS
  '{"gp_tx_id", "gc_tx_id", "sxp_result", "items", "boxes", ...}';

-- COMPLETED 상태인데 아직 디스패치 안 된 미션 빠른 조회 (재시도 큐용)
-- ※ 이 인덱스는 sre-reward-dispatcher.sql 끝부분에도 정의되어 있음 (중복 안전)
CREATE INDEX IF NOT EXISTS idx_ump_status_dispatch
  ON user_mission_progress(status, reward_dispatched_at)
  WHERE status = 'COMPLETED' AND reward_dispatched_at IS NULL;


-- ──────────────────────────────────────────────────────────────────────────
-- 1.5 검증 쿼리 (실행 후 확인용)
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM mission_definition WHERE reward_bundle IS NOT NULL;
--   기대: 240 (모든 미션이 마이그레이션 완료)
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'rp_balance' AND column_name LIKE '%gc%';
--   기대: 3행 (gc_balance, lifetime_gc_earned, lifetime_gc_spent)
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'user_mission_progress'
--    AND column_name IN ('reward_dispatched_at', 'reward_dispatch_log');
--   기대: 2행

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- 다음 단계: migration-step2-new-tables.sql
-- ──────────────────────────────────────────────────────────────────────────
