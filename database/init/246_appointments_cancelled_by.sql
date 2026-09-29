-- 246: 약속 취소 플로우(F-X-01 FR-1 r8, 2026-09-29) — 취소 행위자 기록(제안 철회/거절/약속 취소 판별·취소 카드 스냅샷). 멱등.
ALTER TABLE marketplace_appointments
    ADD COLUMN IF NOT EXISTS cancelled_by uuid NULL REFERENCES users(id) ON DELETE SET NULL;
