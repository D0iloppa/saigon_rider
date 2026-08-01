-- ================================================================
-- 160_schema_migrations.sql (X-3)
-- 기존 볼륨에 적용된 incremental patch(139번대~)를 추적할 이력 테이블.
-- psql -f 나열 방식(bff_migrate)이라 별도 러너가 없으므로, docker-compose.yml
-- 의 bff_migrate command 가 각 "-f .../NNN.sql" 뒤에 "-c" 로 자기 번호를
-- INSERT 한다(이 파일 자체는 테이블 정의만 담당 — 기존 15개 SQL 은 무수정).
-- fresh-init(빈 볼륨)은 001~158 을 initdb 로 한 번에 통째로 실행하므로
-- 이 이력 테이블이 굳이 필요하지 않다 — existing-volume 경로 전용.
-- ================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
