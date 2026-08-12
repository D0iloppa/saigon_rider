-- ================================================================
-- 179_appointment_completion_request.sql
--
-- S-16 / D-7(구매자 완료 참여): 구매자에게 "거래 완료 요청"권을 준다.
-- 완료 권한 자체는 판매자에게 그대로 남기고(D-7: 자동 완료 금지), 구매자의 요청을
-- 약속 행에 기록해 판매자 확인·운영 이의의 근거로 쓴다.
--
-- status 는 기존 4값(PROPOSED/ACCEPTED/COMPLETED/CANCELLED)을 그대로 유지한다 —
-- 요청은 ACCEPTED 의 하위 상태일 뿐이고, status 를 늘리면 리뷰 자격 판정
-- (routers/market.py 의 completed_appt 조회)·프론트 statusLabel 등 기존 소비처가
-- 전부 영향을 받기 때문이다.
--
-- 멱등(ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- ================================================================

-- `completion_declined_by` 는 거절 **행위자** 구분용이다: 판매자가 거절하면 판매자 id,
-- 운영자가 이의 큐에서 기각하면 NULL. 구매자 화면이 "판매자가 거절했다"와 "운영 검토에서
-- 기각됐다"를 다르게 말해야 하는데(연락할 상대가 다르다) 시각 하나로는 구분할 수 없다.
ALTER TABLE marketplace_appointments
  ADD COLUMN IF NOT EXISTS completion_requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_declined_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 어드민 이의 큐 — "요청은 있는데 아직 ACCEPTED 인" 건만 스캔한다(무응답 판매자 검토 대상).
CREATE INDEX IF NOT EXISTS ix_mp_appointment_completion_pending
  ON marketplace_appointments (completion_requested_at)
  WHERE completion_requested_at IS NOT NULL AND status = 'ACCEPTED';
