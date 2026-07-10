-- ================================================================
-- 113_business_partner.sql  (SGR-312 BP-1)
-- 비즈니스 파트너 스키마 — 스키마만 (API/화면은 후속 BP-2~ 패키지)
--   · business_group   : 얇은 브랜드 그룹 (D4 — 스키마 자리만 선확보, UI 없음)
--   · business_profile : 지점(가게) 단위 프로필. 1계정:N프로필
--     (상한 3개는 API 레벨 제약 — 이 테이블에는 강제하지 않음)
--   · marketplace_ads   : owner_business_profile_id FK 추가 (D5, 이관은 BP-5)
--                         + review_status(광고 건별 심사, D3) 추가
--     기존 노출 [DEV] 시드 광고가 계속 보이도록 review_status 기본값 APPROVED.
-- ================================================================

-- ── 브랜드 그룹 (D4) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_group (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── 비즈니스 프로필 (D1: 계정 부착형, D2: 수동 심사) ─────────────
CREATE TABLE IF NOT EXISTS business_profile (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id          UUID REFERENCES business_group(id) ON DELETE SET NULL,
    name              VARCHAR(120) NOT NULL,             -- 상호명
    category          VARCHAR(60),                       -- 업종
    address           VARCHAR(200),                      -- 주소 텍스트
    latitude          NUMERIC(9, 6),
    longitude         NUMERIC(9, 6),
    phone             VARCHAR(30),                        -- 연락처
    photo_content_id  UUID REFERENCES contents(id) ON DELETE SET NULL,  -- 대표사진
    status            TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
    reject_reason     TEXT,
    reviewed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biz_profile_user   ON business_profile (user_id);
CREATE INDEX IF NOT EXISTS idx_biz_profile_status ON business_profile (status);

-- ── 광고 owner FK + 건별 심사 상태 (D5, D3) ──────────────────────
ALTER TABLE marketplace_ads
    ADD COLUMN IF NOT EXISTS owner_business_profile_id UUID REFERENCES business_profile(id) ON DELETE SET NULL;

ALTER TABLE marketplace_ads
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'APPROVED'
        CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED', 'STOPPED')),
    ADD COLUMN IF NOT EXISTS reject_reason TEXT;
