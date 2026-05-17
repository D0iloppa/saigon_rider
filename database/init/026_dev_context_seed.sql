-- __DEV: 현행 데이터 시드 (2026-05-17 기준)
-- 이 스크립트는 025_dev_context.sql 실행 후 적용

-- ── Context: 현재 진행 상태 ──────────────────────────────────────
INSERT INTO "__DEV_context" (key, value) VALUES
  ('current_sprint', '소셜 확장 + 프로필 피드 관리'),
  ('current_focus', '피드 CRUD · DM · 팔로우 시스템 · 프로필 개편'),
  ('last_deploy', '2026-05-17'),
  ('blocker', 'AUTH 플로우 실 연동 미완 (F-02-4, F-02-7, F-03-2)'),
  ('next_milestone', 'Ride HUD 실기기 GPS 연동 + 안전등급 연산')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- ── Features: 전체 기능 리스트 ───────────────────────────────────
INSERT INTO "__DEV_features" (category, name, status, sort_order) VALUES
  -- Auth
  ('auth', '스플래시 & 언어 선택', 'DONE', 1),
  ('auth', 'OTP 인증 플로우 (UI)', 'DONE', 2),
  ('auth', 'OTP 인증 API 연동', 'IN_PROGRESS', 3),
  ('auth', '프로필 초기 설정', 'IN_PROGRESS', 4),
  -- Home
  ('home', '월드맵 SVG 렌더링', 'DONE', 1),
  ('home', '유저 정보 로드 & 레벨 표시', 'DONE', 2),
  ('home', '추천 퀘스트 (Tonight''s Pick)', 'DONE', 3),
  ('home', '알림 뱃지', 'DONE', 4),
  -- Quest
  ('quest', '퀘스트 목록 (필터/세그먼트)', 'DONE', 1),
  ('quest', '퀘스트 상세 & 북마크', 'DONE', 2),
  ('quest', '퀘스트 수락 → 라이딩 진입', 'DONE', 3),
  ('quest', 'Infinite Scroll + PTR', 'DONE', 4),
  -- Ride
  ('ride', 'GPS 위치 추적 & HUD', 'PLANNED', 1),
  ('ride', '실시간 거리 계산 & 링 게이지', 'PLANNED', 2),
  ('ride', '안전등급 실시간 계산', 'PLANNED', 3),
  ('ride', '일시정지 & 종료 플로우', 'PLANNED', 4),
  ('ride', '라이딩 결과 (성공/실패)', 'PLANNED', 5),
  -- Feed
  ('feed', '피드 목록 & 필터', 'DONE', 1),
  ('feed', '좋아요 & 댓글', 'DONE', 2),
  ('feed', '피드 작성 (이미지 업로드)', 'DONE', 3),
  ('feed', '피드 수정/삭제', 'DONE', 4),
  ('feed', '스토리 아바타', 'DONE', 5),
  ('feed', 'DM 목록 & 채팅', 'DONE', 6),
  -- Profile
  ('profile', '프로필 정보 & 통계', 'DONE', 1),
  ('profile', '프로필 사진/닉네임 변경', 'DONE', 2),
  ('profile', '팔로우/팔로워 시스템', 'DONE', 3),
  ('profile', '배지 시스템', 'DONE', 4),
  ('profile', '프로필 피드 관리 탭', 'DONE', 5),
  ('profile', 'QR 프로필 공유', 'DONE', 6),
  -- Settings
  ('settings', '설정 메인 & 다크모드', 'DONE', 1),
  ('settings', '알림 설정', 'DONE', 2),
  ('settings', '언어 설정', 'DONE', 3),
  ('settings', '계정 관리 & 탈퇴', 'DONE', 4),
  -- Infra
  ('infra', 'Docker Compose 멀티 프로파일', 'DONE', 1),
  ('infra', 'Nginx 리버스 프록시 & 라우팅', 'DONE', 2),
  ('infra', 'imgproxy 이미지 서빙', 'DONE', 3),
  ('infra', '관리자 콘솔 (Admin)', 'DONE', 4),
  ('infra', '개발자 위키 (Docusaurus)', 'DONE', 5),
  ('infra', '__DEV Context 관리 시스템', 'DONE', 6)
ON CONFLICT DO NOTHING;

-- ── Todos: 현재 진행 중 & 예정 작업 ──────────────────────────────
INSERT INTO "__DEV_todos" (title, priority, status, feature_id, due_date) VALUES
  ('AUTH: handleVerify → apiLogin(phone, passcode) 연결', 'HIGH', 'TODO',
    (SELECT id FROM "__DEV_features" WHERE category='auth' AND name='OTP 인증 API 연동'), NULL),
  ('AUTH: 재전송 버튼 apiRegister(phone) 연동', 'HIGH', 'TODO',
    (SELECT id FROM "__DEV_features" WHERE category='auth' AND name='OTP 인증 API 연동'), NULL),
  ('AUTH: 닉네임 중복확인 debounce + check-nickname API', 'HIGH', 'TODO',
    (SELECT id FROM "__DEV_features" WHERE category='auth' AND name='프로필 초기 설정'), NULL),
  ('Ride HUD: Geolocation API 연동 & 거리 계산', 'MEDIUM', 'TODO',
    (SELECT id FROM "__DEV_features" WHERE category='ride' AND name='GPS 위치 추적 & HUD'), NULL),
  ('Ride HUD: SVG 링 게이지 진행률', 'MEDIUM', 'TODO',
    (SELECT id FROM "__DEV_features" WHERE category='ride' AND name='실시간 거리 계산 & 링 게이지'), NULL),
  ('Ride: 안전등급 알고리즘 (Engine 연동)', 'MEDIUM', 'TODO',
    (SELECT id FROM "__DEV_features" WHERE category='ride' AND name='안전등급 실시간 계산'), NULL),
  ('Ride: 결과화면 보상 정산 + Confetti', 'LOW', 'TODO',
    (SELECT id FROM "__DEV_features" WHERE category='ride' AND name='라이딩 결과 (성공/실패)'), NULL),
  ('UX 점검 58항목 잔여분 처리', 'MEDIUM', 'IN_PROGRESS', NULL, NULL),
  ('iOS TabBar + scroll 레이아웃 실기기 테스트', 'HIGH', 'BLOCKED', NULL, NULL),
  ('Feed: 위치 기반 필터 PostGIS 쿼리 최적화', 'LOW', 'TODO', NULL, NULL),
  ('Wiki: Private 섹션 보안 강화 (Option C 적용)', 'LOW', 'TODO', NULL, NULL)
ON CONFLICT DO NOTHING;
