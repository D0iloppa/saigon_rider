-- RP→XP 리네임 잔존: tier_definition.min_lifetime_rp 컬럼이 코드(min_lifetime_xp)와 불일치
-- POST /v1/events 가 ORM 매핑 실패로 500 발생, GPS/마일리지 누적 차단.

ALTER TABLE tier_definition RENAME COLUMN min_lifetime_rp TO min_lifetime_xp;
