-- 245: 순수 약속(2026-09-29) — 매물 없이 1:1 대화방에서 잡는 만남. listing_id NULL 허용(멱등).
ALTER TABLE marketplace_appointments ALTER COLUMN listing_id DROP NOT NULL;
