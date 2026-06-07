-- ================================================================
-- 068_quest_reclassify_count_event.sql
-- 비라이딩 활성 퀘스트 개별 재분류 (B=DB제목 기준).
-- DISTANCE 폴백으로 지도네비가 잘못 뜨던 퀘스트를, 제목 의미에 맞는
-- count_event 검증타입으로 전환(card_type+criteria). mission_code(카드아트)는 보존.
-- emitter 없는 action_code 는 QuestChecker 에서 진행도만 표시(완료는 emitter 연결 후).
-- 보류(모호/검증기미구현)·DISTANCE유지 건은 제안서 참조:
--   ai-docs/engine/quest-reclassification-proposal.md
-- ================================================================


UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_BROWSE", "target_count": 3}'::jsonb WHERE mission_code='D-DL-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "COMMENT_POST", "target_count": 1}'::jsonb WHERE mission_code='D-CM-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "COMMENT_POST", "target_count": 1}'::jsonb WHERE mission_code='D-CM-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "COMMENT_POST", "target_count": 1}'::jsonb WHERE mission_code='D-CM-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "QUEST_COMPLETE", "target_count": 1}'::jsonb WHERE mission_code='O-CM-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REFERRAL", "target_count": 1}'::jsonb WHERE mission_code='W-CM-04' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REFERRAL", "target_count": 10}'::jsonb WHERE mission_code='W-CM-05' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REFERRAL", "target_count": 1}'::jsonb WHERE mission_code='W-CM-08' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REFERRAL", "target_count": 3}'::jsonb WHERE mission_code='W-CM-09' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "COMMENT_POST", "target_count": 30}'::jsonb WHERE mission_code='W-CM-10' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "LIKE_RECEIVED", "target_count": 50}'::jsonb WHERE mission_code='W-CM-11' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "FUEL_RECEIPT", "target_count": 1}'::jsonb WHERE mission_code='D-DL-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_FAVORITE", "target_count": 1}'::jsonb WHERE mission_code='D-DL-05' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REVIEW_PHOTO", "target_count": 1}'::jsonb WHERE mission_code='D-DL-06' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_LISTING", "target_count": 1}'::jsonb WHERE mission_code='D-DL-07' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 10}'::jsonb WHERE mission_code='D-DL-08' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 10}'::jsonb WHERE mission_code='D-DL-09' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 30}'::jsonb WHERE mission_code='D-DL-10' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 50}'::jsonb WHERE mission_code='D-DL-11' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 1}'::jsonb WHERE mission_code='D-DL-12' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 1}'::jsonb WHERE mission_code='D-DL-13' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 1000}'::jsonb WHERE mission_code='M-DL-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 500}'::jsonb WHERE mission_code='M-DL-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 1}'::jsonb WHERE mission_code='O-DL-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "FUEL_RECEIPT", "target_count": 1}'::jsonb WHERE mission_code='O-DL-04' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 1}'::jsonb WHERE mission_code='O-DL-05' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_LISTING", "target_count": 30}'::jsonb WHERE mission_code='W-DL-06' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_SUCCESS", "target_count": 5}'::jsonb WHERE mission_code='W-DL-07' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "POST_CREATE", "target_count": 50}'::jsonb WHERE mission_code='W-DL-08' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_SUCCESS", "target_count": 1}'::jsonb WHERE mission_code='W-DL-10' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REVIEW_PHOTO", "target_count": 1}'::jsonb WHERE mission_code='W-DL-11' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_LISTING", "target_count": 10}'::jsonb WHERE mission_code='W-DL-15' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "COMMENT_POST", "target_count": 100}'::jsonb WHERE mission_code='W-DL-16' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 100}'::jsonb WHERE mission_code='W-DL-17' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "CAR_WASH_RECEIPT", "target_count": 2}'::jsonb WHERE mission_code='W-DL-18' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_SUCCESS", "target_count": 2}'::jsonb WHERE mission_code='W-DL-19' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 200}'::jsonb WHERE mission_code='W-DL-20' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "CAR_WASH_RECEIPT", "target_count": 3}'::jsonb WHERE mission_code='W-DL-23' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 3}'::jsonb WHERE mission_code='W-DL-24' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 30}'::jsonb WHERE mission_code='W-DL-25' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MAINTENANCE_RECEIPT", "target_count": 5}'::jsonb WHERE mission_code='W-DL-26' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "FUEL_RECEIPT", "target_count": 5}'::jsonb WHERE mission_code='W-DL-27' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_LISTING", "target_count": 5}'::jsonb WHERE mission_code='W-DL-28' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 50}'::jsonb WHERE mission_code='W-DL-29' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "FUEL_RECEIPT", "target_count": 7}'::jsonb WHERE mission_code='W-DL-30' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 1}'::jsonb WHERE mission_code='W-DL-31' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 5}'::jsonb WHERE mission_code='W-DL-32' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 7}'::jsonb WHERE mission_code='W-DL-33' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_BROWSE", "target_count": 1}'::jsonb WHERE mission_code='D-MK-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_BROWSE", "target_count": 1}'::jsonb WHERE mission_code='D-MK-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "PHOTO_UPLOAD", "target_count": 1}'::jsonb WHERE mission_code='D-MK-04' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-04' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "CAR_WASH_RECEIPT", "target_count": 1}'::jsonb WHERE mission_code='D-MT-05' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-06' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-07' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-08' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='D-MT-09' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='O-MT-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='W-MT-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_BROWSE", "target_count": 1}'::jsonb WHERE mission_code='W-MT-04' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='W-MT-05' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "PART_REPLACE", "target_count": 2}'::jsonb WHERE mission_code='W-MT-07' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='W-MT-08' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 1}'::jsonb WHERE mission_code='W-MT-10' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "PART_REPLACE", "target_count": 1}'::jsonb WHERE mission_code='W-MT-13' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MAINTENANCE_RECEIPT", "target_count": 1}'::jsonb WHERE mission_code='W-MT-14' AND is_active=TRUE;

-- ── 2차: B 보류건 결정 적용 (제목기준 판단; 일부 저확신·count_distinct/streak 근사) ──
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "LIKE_RECEIVED", "target_count": 1}'::jsonb WHERE mission_code='O-CM-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "LIKE_RECEIVED", "target_count": 100}'::jsonb WHERE mission_code='W-CM-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "POST_CREATE", "target_count": 5}'::jsonb WHERE mission_code='W-CM-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REFERRAL", "target_count": 5}'::jsonb WHERE mission_code='W-CM-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "COMMENT_POST", "target_count": 5}'::jsonb WHERE mission_code='W-CM-06' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "LIKE_RECEIVED", "target_count": 30}'::jsonb WHERE mission_code='W-CM-07' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_INQUIRY", "target_count": 5}'::jsonb WHERE mission_code='D-DL-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DELIVERY_RECEIPT", "target_count": 5}'::jsonb WHERE mission_code='D-DL-04' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_INQUIRY", "target_count": 1}'::jsonb WHERE mission_code='O-DL-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_INQUIRY", "target_count": 1}'::jsonb WHERE mission_code='O-DL-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_SUCCESS", "target_count": 1}'::jsonb WHERE mission_code='O-DL-06' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MAINTENANCE_RECEIPT", "target_count": 3}'::jsonb WHERE mission_code='W-DL-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "SHARE_SNS", "target_count": 5}'::jsonb WHERE mission_code='W-DL-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_SUCCESS", "target_count": 5}'::jsonb WHERE mission_code='W-DL-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MAINTENANCE_RECEIPT", "target_count": 5}'::jsonb WHERE mission_code='W-DL-04' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "PROFILE_UPDATE", "target_count": 1}'::jsonb WHERE mission_code='W-DL-05' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MAINTENANCE_RECEIPT", "target_count": 1}'::jsonb WHERE mission_code='W-DL-09' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_SUCCESS", "target_count": 3}'::jsonb WHERE mission_code='W-DL-12' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_INQUIRY", "target_count": 10}'::jsonb WHERE mission_code='W-DL-13' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_BROWSE", "target_count": 5}'::jsonb WHERE mission_code='W-DL-14' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_LISTING", "target_count": 10}'::jsonb WHERE mission_code='W-MK-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_LISTING", "target_count": 1}'::jsonb WHERE mission_code='W-MK-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MARKET_SUCCESS", "target_count": 5}'::jsonb WHERE mission_code='W-MK-03' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "FUEL_RECEIPT", "target_count": 5}'::jsonb WHERE mission_code='W-MT-02' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MAINTENANCE_RECEIPT", "target_count": 2}'::jsonb WHERE mission_code='W-MT-06' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "MAINTENANCE_RECEIPT", "target_count": 2}'::jsonb WHERE mission_code='W-MT-09' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "FUEL_RECEIPT", "target_count": 1}'::jsonb WHERE mission_code='W-MT-11' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 10}'::jsonb WHERE mission_code='W-MT-12' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 25}'::jsonb WHERE mission_code='M-MT-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "DAILY_INSPECTION", "target_count": 7}'::jsonb WHERE mission_code='W-MT-15' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "REFERRAL", "target_count": 1}'::jsonb WHERE mission_code='A-MX-01' AND is_active=TRUE;
UPDATE quests SET card_type='COUNT_EVENT', criteria='{"action_code": "QUEST_COMPLETE", "target_count": 5}'::jsonb WHERE mission_code='O-MX-01' AND is_active=TRUE;
