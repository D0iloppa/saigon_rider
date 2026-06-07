-- ================================================================
-- 070_deactivate_trade_quests.sql
-- P2P 거래(마켓 거래/판매/문의/찜) 기능 미구현 → 해당 의존 퀘스트 잠금(비활성).
-- 거래 기능 출시 시 동일 조건으로 is_active=TRUE 재활성화하면 됨.
-- 단순 시세 조회(MARKET_BROWSE)는 유지(참고가 보기 가능).
-- 그룹 식별: criteria->>'action_code' IN (거래 의존 액션).
-- ================================================================

UPDATE quests SET is_active = FALSE
WHERE is_active = TRUE
  AND card_type IN ('COUNT_EVENT','COUNT_DISTINCT')
  AND criteria->>'action_code' IN ('MARKET_SUCCESS','MARKET_INQUIRY','MARKET_LISTING','MARKET_FAVORITE');
