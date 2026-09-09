-- 233: 가게 쿠폰 (사업자 발행 → 고객 수령/사용). 당근 갭 트리아지 F061.
-- 비현금성 판촉 쿠폰 — 정산/환불/결제 연계 없음(대표 승인 전제). reward_catalog(Engine RP 교환)와
-- 완전히 별개 도메인 — 절대 공유하지 않는다(062 migration 폐기 정책 참조).
--
-- 상태는 컬럼으로 저장하지 않고 조회 시점에 파생한다(redemption row 존재 여부 + coupon.expires_at) —
-- 상태 컬럼과 실제 사실이 어긋나는 동기화 버그를 원천 차단한다(business_review.hidden_at 패턴 미러).
CREATE TABLE IF NOT EXISTS business_coupon (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    expires_at TIMESTAMPTZ,
    -- NULL = 발행중(신규 수령 가능). 값이 있으면 신규 수령만 막는다 — 이미 수령한 고객의 보유분은
    -- 그대로 사용 가능(중단 = 광고 STOPPED 와 동일하게 소급 무효화하지 않는다).
    stopped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_business_coupon_profile ON business_coupon (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS business_coupon_claim (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES business_coupon(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (coupon_id, user_id) -- 동일 쿠폰 중복 수령 방지
);

CREATE INDEX IF NOT EXISTS ix_business_coupon_claim_user ON business_coupon_claim (user_id, claimed_at DESC);

-- 사용 처리 = 이 테이블에 1행 INSERT. claim_id PRIMARY KEY 제약이 이중 사용을 DB 레벨에서 차단한다
-- (동시 요청이 몰려도 두 번째 INSERT 는 unique violation 으로 실패 — marketplace_transactions 의
-- appointment_id PRIMARY KEY 1:1 패턴 미러, init/232).
CREATE TABLE IF NOT EXISTS business_coupon_redemption (
    claim_id UUID PRIMARY KEY REFERENCES business_coupon_claim(id) ON DELETE CASCADE,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
