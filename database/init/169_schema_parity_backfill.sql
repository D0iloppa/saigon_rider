-- 169: 라이브 dev DB 와 database/init 간 스키마 드리프트 해소 (전수 diff 실측 결과, 2026-08-02)
-- 모두 멱등. 신규(fresh) 볼륨에는 대부분 이미 존재해 무연산.

-- (1) users.deleted_at — 코드 10곳(auth.py/users.py/deps.py/purge_deleted_accounts.py)이 참조하나
--     database/init 어디에도 컬럼 생성 SQL이 없었다(라이브에는 과거 수동 추가돼 존재). fresh 에 역보강.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- (2) badges.policy_id — 033_badges_policy_id.sql 에 이미 정의돼 있으나 라이브 DB 에는 미적용 상태였다
--     (033 은 bff_migrate 등록 범위(139~168) 이전 파일이라 기존 볼륨 증분적용 경로가 없음). 라이브에 역보강.
ALTER TABLE badges ADD COLUMN IF NOT EXISTS policy_id BIGINT DEFAULT NULL;

-- (3) repair_shop_stats 의 UNIQUE INDEX — 035_info_modules.sql 에 정의돼 있으나 라이브에는 누락돼
--     REFRESH MATERIALIZED VIEW CONCURRENTLY(jobs/refresh_repair_stats.py) 가 매 실행 실패하고 있었다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_stats_shop ON repair_shop_stats(shop_id);

-- (4) flood_confirmation.lat/lng NOT NULL — 035_info_modules.sql 정의(NOT NULL)와 라이브 제약이 어긋나 있었다.
--     API(FloodConfirmCreate.lat/lng)가 항상 필수값으로 받아 실 데이터에 NULL 이 없음을 확인 후 원복.
ALTER TABLE flood_confirmation ALTER COLUMN lat SET NOT NULL;
ALTER TABLE flood_confirmation ALTER COLUMN lng SET NOT NULL;
