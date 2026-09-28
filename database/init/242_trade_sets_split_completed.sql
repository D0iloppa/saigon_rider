-- 242: 241 백필이 과거 거래완료(COMPLETED) 항목까지 대화방의 ACTIVE 세트에 넣어, 방 상단 세트 바에
-- 이미 팔린 매물이 대표로 뜨고 합계에 포함됐다(260928 실렌더 확인). 정상 흐름에서는 완료 시 세트가
-- CLOSED 되므로, ACTIVE 세트 안의 COMPLETED 항목을 방별 CLOSED 세트 하나로 옮겨 정합을 맞춘다.
-- 멱등: 옮긴 뒤에는 COMPLETED 항목을 가진 ACTIVE 세트가 없어 재실행 시 no-op.
WITH src AS (
    SELECT ts.id AS active_id, ts.conversation_id, ts.buyer_id, ts.seller_id
    FROM trade_sets ts
    WHERE ts.status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM trade_set_items i WHERE i.set_id = ts.id AND i.status = 'COMPLETED')
),
ins AS (
    INSERT INTO trade_sets (conversation_id, buyer_id, seller_id, status)
    SELECT conversation_id, buyer_id, seller_id, 'CLOSED' FROM src
    RETURNING id, conversation_id
)
UPDATE trade_set_items i
SET set_id = ins.id, updated_at = NOW()
FROM src JOIN ins ON ins.conversation_id = src.conversation_id
WHERE i.set_id = src.active_id AND i.status = 'COMPLETED';
