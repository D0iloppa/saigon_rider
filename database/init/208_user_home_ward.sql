-- P4-1: 유저 동네 귀속 (Q-7 확정 — 수동 설정, GPS 자동추정 아님).
-- 그룹 추천(동네 기반)에 쓰인다. 기존 유저는 전부 NULL(동네 미설정) — 온보딩/프로필에서 설정.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS home_ward_id SMALLINT REFERENCES wards(id) ON DELETE SET NULL;
