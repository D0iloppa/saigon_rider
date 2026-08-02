-- 관리자 직접 등록 업체는 신청자(user)가 없을 수 있다 (대표 결정 — 영업 확보 업체 초기 데이터 채우기).
-- user_id NOT NULL 제약을 완화. 소유자 연결은 후속 기능(미구현) — 지금은 NULL = 미연결. 멱등.
ALTER TABLE business_profile ALTER COLUMN user_id DROP NOT NULL;
