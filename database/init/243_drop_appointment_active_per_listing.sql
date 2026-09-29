-- 243: 약속 독립 원칙(F-N-02 FR-7 ③, 260929) — 약속은 만남 제안일 뿐 거래 상태를 좌우하지 않는다.
-- 한 매물에 여러 구매자의 ACCEPTED 약속이 공존할 수 있어야 하므로 매물당 활성 약속 1건 유니크를 제거한다.
-- 배타성은 uq_trade_set_items_active_listing(항목 RESERVED/COMPLETED 유일성)이 보장한다.
-- 멱등: IF EXISTS.
DROP INDEX IF EXISTS uq_mp_appointment_active_per_listing;
