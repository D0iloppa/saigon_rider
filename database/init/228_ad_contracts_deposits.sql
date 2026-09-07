-- ================================================================
-- 228_ad_contracts_deposits.sql
-- 260907_ad_payment_pipeline_design.md §3 — 광고 계약(ad_contracts)·입금 원장(ad_deposits) +
-- ad_tiers 기간 확정가(3/6개월). P1-1(스키마·ORM·시드).
--
-- 파이프라인: 계약(accepted) → 입금 안내(awaiting_payment) → 입금 관측(ingest_deposit,
-- partially_paid/paid) → 관리자 승인(active) → 노출(ad_gating, 무변경). 상세 상태기계는
-- 설계문서 §4-1, 대조 규칙은 §4-2 참조 — 이 마이그레이션은 스키마만.
--
-- 멱등: 전부 IF NOT EXISTS / ON CONFLICT. 재실행 안전.
-- ================================================================

CREATE TABLE IF NOT EXISTS ad_contracts (
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ad_id                           UUID NOT NULL REFERENCES marketplace_ads(id) ON DELETE RESTRICT,
    tier_id                         UUID NOT NULL REFERENCES ad_tiers(id) ON DELETE RESTRICT,
    months                          SMALLINT NOT NULL CHECK (months IN (1, 3, 6)),
    amount_vnd                      BIGINT NOT NULL,
    payment_code                    VARCHAR(12) NOT NULL UNIQUE,
    status                          VARCHAR(20) NOT NULL,
    contract_token                  UUID NOT NULL UNIQUE,
    accepted_at                     TIMESTAMPTZ NULL,
    contract_method                 VARCHAR(20) NULL,
    signer_name                     VARCHAR(120) NULL,
    signer_ip                       VARCHAR(45) NULL,
    contract_snapshot               JSONB NULL,
    payment_instructions_issued_at  TIMESTAMPTZ NULL,
    period_start                    TIMESTAMPTZ NULL,
    period_end                      TIMESTAMPTZ NULL,
    approved_at                     TIMESTAMPTZ NULL,
    approved_by                     VARCHAR(80) NULL,
    closed_at                       TIMESTAMPTZ NULL,
    closed_reason                   TEXT NULL,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_contracts_ad_id ON ad_contracts(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_contracts_status ON ad_contracts(status);

CREATE TABLE IF NOT EXISTS ad_deposits (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id          UUID NULL REFERENCES ad_contracts(id) ON DELETE RESTRICT,
    kind                 VARCHAR(10) NOT NULL CHECK (kind IN ('deposit', 'refund')),
    amount_vnd           BIGINT NOT NULL CHECK (amount_vnd > 0),
    paid_at              TIMESTAMPTZ NOT NULL,
    payer_name           TEXT NULL,
    memo_raw             TEXT NULL,
    bank_ref             TEXT NULL,
    source               VARCHAR(20) NOT NULL,
    source_ref           TEXT NULL,
    evidence_content_id  UUID NULL REFERENCES contents(id) ON DELETE SET NULL,
    note                 TEXT NULL,
    recorded_by          VARCHAR(80) NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_deposits_contract_id ON ad_deposits(contract_id);

-- 어댑터 ②③(csv/bank_feed)의 웹훅·명세서 재전송 멱등키. manual 은 source_ref NULL 이라 무관.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_deposits_source_ref
    ON ad_deposits(source, source_ref)
    WHERE source_ref IS NOT NULL;

-- ad_tiers 기간 확정가(설계문서 §3-3). 1개월 = 기존 monthly_price_vnd.
ALTER TABLE ad_tiers
    ADD COLUMN IF NOT EXISTS price_3m_vnd BIGINT NULL,
    ADD COLUMN IF NOT EXISTS price_6m_vnd BIGINT NULL;

UPDATE ad_tiers SET price_3m_vnd = 539000,   price_6m_vnd = 999000   WHERE id = '00000000-0000-4000-8000-000000000002';  -- 일반
UPDATE ad_tiers SET price_3m_vnd = 1349000,  price_6m_vnd = 2499000  WHERE id = '00000000-0000-4000-8000-000000000001';  -- 프리미엄
