-- ──────────────────────────────────────────────────────────────────────────
-- Saigon Rider — Action Definition 확장 시드
-- 발행일: 2026-05-18
-- 참조: sre-mission-mapping-report.md §4 (신규 액션 코드 14개)
--       sre-mission-rule-mapping.md §3 (액션 코드 어휘집)
--
-- 240개 미션의 target_rule이 참조하는 14개 신규 action_code를 추가합니다.
-- 기존 action_definition 시드에는 RIDE_KM 등 12개만 있어, 미션 시드 적용
-- 전에 이 스크립트가 먼저 실행되어야 외래키 검증 (애플리케이션 레벨) 통과.
--
-- 의존성: 기존 action_definition 테이블이 이미 존재해야 함.
-- 실행 순서: migration-step2 이후, sre-mission-reward-bundle.sql 이전.
-- 멱등성: ON CONFLICT DO NOTHING으로 재실행 안전.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 사용 빈도 순 (매핑 리포트 §1.4 기준)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO action_definition (
  action_code, display_name, description,
  unit, default_rp, is_active, requires_payload, category_code
) VALUES

-- ─── 사진/콘텐츠 (22 + 10 + 3 = 35건 사용) ───
('PHOTO_UPLOAD',
  '사진 업로드',
  '정비, 풍경, 등불 등 범용 사진 업로드. payload에 image_uri, photo_type 포함',
  '장', 3, TRUE, TRUE, 'COMMUNITY'),

('DAILY_INSPECTION',
  '일일 점검',
  '체크리스트 1회 완료 (타이어 공기압, 등화, 브레이크 등). payload에 checklist_items',
  '회', 5, TRUE, TRUE, 'MAINT'),

('POST_CREATE',
  '피드 게시물 작성',
  '커뮤니티 피드에 게시물 1건 작성. payload에 post_id, content_length',
  '건', 4, TRUE, TRUE, 'COMMUNITY'),

-- ─── 커뮤니티 상호작용 (5 + 5 = 10건) ───
('LIKE_RECEIVED',
  '좋아요 받음',
  '본인 게시물/사진이 다른 사용자로부터 좋아요를 받음. payload에 target_post_id, from_user_id',
  '개', 1, TRUE, TRUE, 'COMMUNITY'),

('COMMENT_POST',
  '댓글 작성',
  '게시물에 댓글 작성. payload에 target_post_id, comment_length',
  '건', 2, TRUE, TRUE, 'COMMUNITY'),

-- ─── 프로필 / 인증 (2 + 1 = 3건) ───
('PROFILE_UPDATE',
  '프로필 정보 입력',
  '닉네임, 사진, 지역, 바이크 정보 등 프로필 항목 입력/수정. payload에 updated_fields',
  '회', 5, TRUE, TRUE, 'MIXED'),

('DRIVER_VERIFY',
  '드라이버 인증',
  '배달 드라이버 자격 인증 시도. payload에 verification_status (PENDING/APPROVED/REJECTED)',
  '회', 0, TRUE, TRUE, 'DELIVERY'),

-- ─── 마켓 보조 액션 (2 + 2 + 1 + 1 = 6건) ───
('MARKET_BROWSE',
  '부품 조회',
  '중고 부품 상세 페이지 열람. payload에 listing_id, browse_duration_sec',
  '건', 1, TRUE, TRUE, 'MARKET'),

('MARKET_INQUIRY',
  '판매자 문의',
  '판매자에게 첫 문의 전송. payload에 listing_id, seller_user_id',
  '건', 2, TRUE, TRUE, 'MARKET'),

('MARKET_FAVORITE',
  '즐겨찾기',
  '판매 게시물 즐겨찾기 추가. payload에 listing_id',
  '건', 1, TRUE, TRUE, 'MARKET'),

('MARKET_CHAT',
  '판매자 채팅',
  '판매자와 채팅 메시지 송수신. payload에 listing_id, message_count',
  '건', 1, TRUE, TRUE, 'MARKET'),

-- ─── 정비 영수증 분화 (2 + 1 = 3건) ───
('CAR_WASH_RECEIPT',
  '세차 영수증',
  '세차 영수증 인증. payload에 amount, vendor_name, receipt_image_uri',
  '건', 3, TRUE, TRUE, 'MAINT'),

('PART_REPLACE',
  '부품 교체 인증',
  '오일/타이어/체인 등 부품 교체 인증. payload에 part_type, replaced_at, receipt_image_uri',
  '건', 5, TRUE, TRUE, 'MAINT'),

-- ─── 시스템 가상 액션 (1건) ───
('ACCOUNT_AGE',
  '가입 경과일',
  '시간 누적 가상 액션. 직접 이벤트로 발행되지 않으며, 미션 평가 엔진이 sre_user.created_at에서 산출. payload는 사용 안 함',
  '일', 0, TRUE, FALSE, 'MIXED')

ON CONFLICT (action_code) DO NOTHING;


-- ──────────────────────────────────────────────────────────────────────────
-- 검증
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT action_code, display_name, category_code, is_active
--   FROM action_definition
--  WHERE action_code IN (
--    'PHOTO_UPLOAD','DAILY_INSPECTION','POST_CREATE','LIKE_RECEIVED',
--    'COMMENT_POST','PROFILE_UPDATE','DRIVER_VERIFY','MARKET_BROWSE',
--    'MARKET_INQUIRY','MARKET_FAVORITE','MARKET_CHAT','CAR_WASH_RECEIPT',
--    'PART_REPLACE','ACCOUNT_AGE'
--  );
--   기대: 14행
--
-- SELECT COUNT(*) FROM action_definition;
--   기대: 26 (기존 12 + 신규 14)

COMMIT;

-- ──────────────────────────────────────────────────────────────────────────
-- 주의 사항
-- ──────────────────────────────────────────────────────────────────────────
-- 1. action_definition 테이블 스키마가 위 INSERT 컬럼과 다르면
--    실제 스키마에 맞게 컬럼 목록을 조정해야 합니다.
--    표준 컬럼: action_code, display_name, description, unit, default_rp,
--               is_active, requires_payload, category_code
--
-- 2. ACCOUNT_AGE는 가상 액션입니다.
--    raw event로 발행되지 않으며, 미션 평가 엔진이
--    sre_user.created_at에서 일 단위로 계산하여 마치 누적 이벤트처럼 평가합니다.
--    A-MX-02 (가입 365일) 미션이 이 액션을 참조합니다.
--
-- 3. category_code 컬럼이 없는 스키마라면 해당 값을 제외하고 INSERT하세요.
--    카테고리는 미션 측 mission_definition.category_code에서 관리됩니다.
-- ──────────────────────────────────────────────────────────────────────────
