-- ================================================================
-- 197_report_images.sql
-- 신고 코멘트 + 사진 첨부(대표 지적 2026-08-18) — 매물 신고에 증빙 사진(여러 장)을 붙일 수 있게 한다.
-- marketplace_listing_images(084) 팬아웃 패턴을 그대로 미러링. contents 테이블 중개 원칙 준수
-- (CLAUDE.md — 엔티티는 *_content_id UUID FK 만, 출력은 build_imgproxy_url() 변환).
-- 멱등: CREATE TABLE/INDEX IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS report_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    content_id  UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_images_report ON report_images (report_id, sort_order);
