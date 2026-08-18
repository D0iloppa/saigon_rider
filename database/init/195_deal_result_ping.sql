-- ================================================================
-- 195_deal_result_ping.sql
-- 016_PLATFORM_MASTER_SUPPLEMENT.md §4-7 #42 — 거래 결과 확인 핑.
--
-- 문제: deal_complete(약속 완료)는 자기신고라 누락률이 높다 — 판매자가 앱 밖에서 거래를
-- 끝내고 앱에 알리지 않으면 유동성 지표가 실제보다 낮게 나온다. 문의를 받고 조용해진
-- ON_SALE 매물에 4지선다 1탭 핑을 보내 ① 거래 전환율 보정 ② 유령 매물 정리 ③ "다른 데서
-- 판매" 비율(경쟁 플랫폼 유출률)을 동시에 얻는다(jobs/deal_result_ping.py 가 발송).
--
-- deal_result_ping_log 는 발송 이력이자 응답 저장소를 겸한다(UNIQUE listing_id — 매물당 1회만
-- 발송, title_transfer_reminder_log 와 달리 재발송 종류가 없어 이력 테이블을 나누지 않는다).
-- result IS NULL = 발송 후 미응답. 응답 시 market.py 가 responded_at·result 를 채운다.
-- "다른 데서 판매" 비율 = SOLD_ELSEWHERE 건수 / (응답 전체 건수) — result IS NOT NULL 로 집계.
--
-- 멱등: CREATE TABLE IF NOT EXISTS / ADD VALUE IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS deal_result_ping_log (
    id           BIGSERIAL PRIMARY KEY,
    listing_id   UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    result       VARCHAR(20) CHECK (result IN ('SOLD', 'STILL_SELLING', 'SOLD_ELSEWHERE', 'GAVE_UP')),
    UNIQUE (listing_id)
);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'DEAL_RESULT_PING';
