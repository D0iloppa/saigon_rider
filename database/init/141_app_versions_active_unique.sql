-- ================================================================
-- 141_app_versions_active_unique.sql (BIZ-11)
-- app_versions.is_active 는 지금까지 컬럼 COMMENT("각 platform 당 1개만 권장")로만
-- 단일 활성 행을 "권장"했을 뿐 DB 로 강제하지 않아, platform 당 복수 활성 행이
-- 들어갈 수 있었다(app_version.py GET /current 의 tie-break 버그와 짝을 이루는 원인).
-- platform 당 활성(is_active=TRUE) 행을 1개로 강제하는 부분 유니크 인덱스를 추가한다.
-- 주의: 마이그레이션 시점에 이미 platform 당 활성 행이 2개 이상이면 아래 인덱스 생성이
-- 실패한다 — 적용 전 중복 활성 행을 선정리해야 한다.
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_versions_active_platform
    ON app_versions(platform) WHERE is_active = TRUE;
