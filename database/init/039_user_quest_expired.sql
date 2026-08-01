-- UserQuest 상태에 EXPIRED 추가 (DAILY 자정 자동 만료용).
-- ABANDONED 는 이미 존재 — 수령 포기 시 사용 (슬롯 환불 효과).

DO $$ BEGIN
  ALTER TYPE quest_status ADD VALUE IF NOT EXISTS 'EXPIRED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
