-- ================================================================
-- 140_marketplace_trade_integrity.sql
-- 거래 무결성 보강 (MKT-2/MKT-7/MKT-9, DB-2/DB-3/DB-11)
--   기존 DB(dev)에 소급 적용 — 신규 볼륨은 001/084/090/105/110 소스에서 이미 동일 계약.
--   · marketplace_listings : agreed_price_vnd(합의가 스냅샷) 컬럼, price/original_price 음수 CHECK
--   · marketplace_appointments : status CHECK, 매물당 활성(ACCEPTED) 약속 1건 부분 유니크
--   · marketplace_price_offers : amount 음수 CHECK, status CHECK
--   · ride_sessions : UNIQUE(user_quest_id), reward_exp/reward_gold 음수 CHECK
-- 주의: 기존 데이터가 CHECK/UNIQUE 를 위반하면 해당 ALTER 가 실패한다(위반 행 선정리 필요).
-- ================================================================

-- ── 매물 (MKT-7 합의가 스냅샷 + DB-2 음수 가격 방어) ─────────────
DO $$
BEGIN
  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS agreed_price_vnd BIGINT;

    ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS ck_mp_listings_price_nonneg;
    ALTER TABLE marketplace_listings ADD CONSTRAINT ck_mp_listings_price_nonneg CHECK (price_vnd >= 0);

    ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS ck_mp_listings_orig_price_nonneg;
    ALTER TABLE marketplace_listings ADD CONSTRAINT ck_mp_listings_orig_price_nonneg CHECK (original_price_vnd >= 0);
  END IF;
END $$;

-- ── 거래 약속 (MKT-2 이중 예약 차단 + DB-11 status CHECK) ────────
DO $$
BEGIN
  IF to_regclass('public.marketplace_appointments') IS NOT NULL THEN
    ALTER TABLE marketplace_appointments DROP CONSTRAINT IF EXISTS ck_mp_appointment_status;
    ALTER TABLE marketplace_appointments
      ADD CONSTRAINT ck_mp_appointment_status
      CHECK (status IN ('PROPOSED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'));
  END IF;
END $$;

-- 매물당 활성(ACCEPTED) 약속은 최대 1건 (부분 유니크) — 서로 다른 대화의 동시 수락 방지 backstop
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_appointment_active_per_listing
    ON marketplace_appointments (listing_id)
    WHERE status = 'ACCEPTED';

-- ── 가격 제안 (DB-2 음수 방어 + DB-11 status CHECK) ─────────────
DO $$
BEGIN
  IF to_regclass('public.marketplace_price_offers') IS NOT NULL THEN
    ALTER TABLE marketplace_price_offers DROP CONSTRAINT IF EXISTS ck_mp_price_offer_amount_nonneg;
    ALTER TABLE marketplace_price_offers ADD CONSTRAINT ck_mp_price_offer_amount_nonneg CHECK (amount >= 0);

    ALTER TABLE marketplace_price_offers DROP CONSTRAINT IF EXISTS ck_mp_price_offer_status;
    ALTER TABLE marketplace_price_offers
      ADD CONSTRAINT ck_mp_price_offer_status
      CHECK (status IN ('PROPOSED', 'ACCEPTED', 'DECLINED', 'CANCELLED'));
  END IF;
END $$;

-- ── 라이드 세션 (DB-3) ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_ride_sessions_user_quest ON ride_sessions(user_quest_id);

DO $$
BEGIN
  IF to_regclass('public.ride_sessions') IS NOT NULL THEN
    ALTER TABLE ride_sessions DROP CONSTRAINT IF EXISTS ck_ride_sessions_reward_exp_nonneg;
    ALTER TABLE ride_sessions ADD CONSTRAINT ck_ride_sessions_reward_exp_nonneg CHECK (reward_exp >= 0);

    ALTER TABLE ride_sessions DROP CONSTRAINT IF EXISTS ck_ride_sessions_reward_gold_nonneg;
    ALTER TABLE ride_sessions ADD CONSTRAINT ck_ride_sessions_reward_gold_nonneg CHECK (reward_gold >= 0);
  END IF;
END $$;
