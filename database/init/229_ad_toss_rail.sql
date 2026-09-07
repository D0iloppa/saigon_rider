-- ================================================================
-- 229_ad_toss_rail.sql
-- 260907_toss_payment_rail_design.md §4-3/§3-4 — 토스페이먼츠 결제 레일 도입:
-- tier×기간 KRW 확정가(seam-D) + 카드 결제 청구 스냅샷. P2-1.
--
-- 값은 넣지 않는다 — price_*_krw 는 NULL 로 생성한다(대표 결정 D-F 보류, §4-3). NULL =
-- 카드 rail 미노출(무료/오가 계약 방지). 값 채움은 이 마이그레이션 범위 밖(관리자 tier 화면 또는 SQL).
--
-- 멱등: 전부 IF NOT EXISTS. 재실행 안전.
-- ================================================================

ALTER TABLE ad_tiers
    ADD COLUMN IF NOT EXISTS price_1m_krw BIGINT NULL,
    ADD COLUMN IF NOT EXISTS price_3m_krw BIGINT NULL,
    ADD COLUMN IF NOT EXISTS price_6m_krw BIGINT NULL;

ALTER TABLE ad_deposits
    ADD COLUMN IF NOT EXISTS charge_snapshot JSONB NULL;
