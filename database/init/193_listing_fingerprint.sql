-- ================================================================
-- 193_listing_fingerprint.sql
-- 016_PLATFORM_MASTER_SUPPLEMENT.md §4-3 #38 — 이미지·텍스트 지문 인덱스.
-- D-34=(a): 산출·저장은 지금, 판정은 L2. 이 마이그레이션은 저장 컬럼 + 화이트리스트 테이블만
-- 추가한다(자동 판정/차단 로직 없음, M1).
--
-- 이미지 지문(dHash)은 contents.phash 에 저장 — 매물 이미지뿐 아니라 모든 업로드 이미지에
-- 공통 적용되는 위치(agent-guidelines §7 contents 중개 원칙과 정합, 재사용성).
-- 텍스트 지문(simhash)은 marketplace_listings.text_fingerprint 에 저장 — 제목+설명 기준.
--
-- 오탐 주의(016 §4-3): 동일 모델·색상 오토바이는 사진이 원래 비슷하고, 제조사 카탈로그 이미지는
-- 완전 일치한다. content_fingerprint_whitelist 는 운영자가 카탈로그성 phash 를 수동 등록해
-- 충돌 조회에서 제외하는 테이블 — 초기값 없음(운영 중 발견 시 수기 등록).
--
-- 멱등: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
-- ================================================================

ALTER TABLE contents ADD COLUMN IF NOT EXISTS phash VARCHAR(16);
CREATE INDEX IF NOT EXISTS idx_contents_phash ON contents (phash) WHERE phash IS NOT NULL;

ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS text_fingerprint VARCHAR(16);
CREATE INDEX IF NOT EXISTS idx_mp_listings_text_fp ON marketplace_listings (text_fingerprint)
    WHERE text_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS content_fingerprint_whitelist (
    phash      VARCHAR(16) PRIMARY KEY,
    note       VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
