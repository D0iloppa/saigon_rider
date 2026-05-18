# 완료 태스크 아카이브

> 활성 태스크는 [`active/`](active/) 폴더 참조. 트러블슈팅은 [`../trouble/index.md`](../trouble/index.md).

## 260513

- [Contents 이미지 서빙 구현](260513/260513_contents_task_plan.md) — DB 스키마(contents), 업로드 API, imgproxy URL 서빙 기능 (완료)
- [프로필 사진·닉네임 변경 구현](260513/260513_profile_task.md) — 기본 아바타, 사진 업로드, 닉네임 수정 API (완료)

## 260514

- [Engine Phase 1 — 컨테이너 기반 구축](260514/260514_engine_phase1_task.md) — `engine/` 골격 생성, docker-compose BFF 분리, nginx 업데이트 (완료)
- [Engine Phase 2 — DB 마이그레이션](260514/260514_engine_phase2_task.md) — Alembic 초기화, SRE 리비전 001~009 작성 및 `alembic upgrade head` 검증 완료
- [Engine Phase 3 — 핵심 서비스 레이어](260514/260514_engine_phase3_task.md) — ORM 모델, Pydantic 스키마, deps, 서비스 7종(event_bus 포함) 구현 완료
- [Engine Phase 4 — API 라우터 및 배치](260514/260514_engine_phase4_task.md) — 라우터 6종(25 라우트), 어댑터 3종, APScheduler 배치 잡 4종 구현 완료
- [Engine Phase 5 — BFF Engine 클라이언트 연동](260514/260514_engine_phase5_task.md) — engine_client.py, P0~P1 엔드포인트 34개(quest/ride/feed 라우터), Engine 이벤트 연동 완료
- [Engine Phase 6 — 미션 데이터 및 테스트](260514/260514_engine_phase6_task.md) — 미션 시드 로더, structlog JSON 로깅, Prometheus 메트릭, 단위 테스트 31개 완료
- [Wiki — Docusaurus 개발자 포털 구축](260514/260514_wiki_docusaurus_task.md) — Docusaurus 3 빌드, /wiki/ Nginx 라우팅, Public/Private 권한 분리(Basic Auth), docker-compose wiki 프로파일 (완료)
- [BFF 미구현 기능 완수](260514/260514_bff_completion_task.md) — Notification·UserStats·Badge·Account·Admin 6개 sub-task로 BFF 잔여 10개 엔드포인트 완수 + 문서 일괄 현행화 (완료)
- [NativeInterface — WebView ↔ Native 브릿지 모듈](260514/260514_native_interface_task.md) — send/request(Promise)/on(Push) 3종 API, 플랫폼 자동 감지(Android/iOS/Browser), callbackId 매칭, Dev fallback (완료)
- [기능 점검 (Functional Test)](260514/260514_functional_test_task.md) — 화면별 BFF/Engine 호출 점검 (완료)
- [Human UX Check (260514)](260514/260514_human_ux_check_task.md) — 휴먼 UX 점검 1차, 댓글 UX 결함 3종 + 피드 이미지 스켈레톤·라이트박스 신규 구현 (완료)
- [app_config 테이블 추가 & 사용 가이드](260514/260514_app_config_task.md) — API 키/앱 설정 KV 스토어, `(group_name, key)` super-key, 초기 데이터 INSERT, 조회 패턴 문서화 (완료)

## 260516

- [관리자 콘솔 전체 기능 구현](260516/260516_admin_console_full.md) — 5개 메뉴(대시보드/퀘스트/피드/유저/설정) + 사이드바 공통 레이아웃 + admin user 시드(015), 7개 페이지 + 11개 admin 라우트 추가 (완료)
- [관리자 콘솔 콘텐츠 contents 중개 / 피드 CRUD 보강](260516/260516_admin_content_mediation_fix.md) — 피드·프로필 이미지 `content_id` 매핑(017 마이그레이션), 인스타형 피드 리스트 + 수정 기능 + 해시태그, 퀘스트 썸네일 체인 정리 (완료)
- [기본 프로필 이미지 풀 (profile_mock) 도입](260516/260516_profile_mock_pool.md) — 단일 default 아바타 → 6장 풀(018·019 마이그레이션), `/contents/profile-mock-img` seed 결정론적 서빙, resolver 일원화 (완료)
- [피드 소셜 기능 확장](260516/260516_feed_social_expansion.md) — 팔로우/DM/위치기반 필터/피드작성(020~023 마이그레이션), follows·dm 라우터, 프론트 5개 페이지 신규, 피드 헤더 재구성 (완료)

## 260518

- [ProfileCard Draggable Sheet + 피드 조회](260518/260518_profilecard_draggable_feed.md) — 커스텀 draggable overlay, 피드 인터랙션, 속도 기반 스냅 (완료)
- [Profile Sheet 스크롤 UX 수정](260518/260518_profile_sheet_scroll_ux.md) — ImageCarousel touch-action:none, Sheet setTimeout 단축 (완료)
- [월드맵 SECTION 1/2 실데이터 연동](260518/260518_world_section1_section2.md) — refreshUser, 추천 퀘스트, AppConfig 모델 (완료)
- [API 에러 Toast + 프로필 수정](260518/260518_api_error_toast_profile_fix.md) — API 클라이언트 에러 Toast 일괄 적용, 프로필 PUT 500 수정 (완료)
- [앱 버전 관리 시스템](260518/260518_app_version_management.md) — app_versions 트리 구조, 공개 API 3종 + 관리자 CRUD (완료)
- [ProfileSetup StatusBar 수정](260518/260518_profilesetup_statusbar_fix.md) — StatusBar 누락 + 건너뛰기 버튼 (완료)

## 260517

- [프로필 피드 관리](260517/260517_profile_feed_management.md) — 백엔드 GET/PUT/DELETE /feed/{id}, 프로필 feeds 탭, FeedEdit 페이지 (완료)

## 260516

- [관리자 콘솔 전체 기능 구현](260516/260516_admin_console_full.md) — 5개 메뉴(대시보드/퀘스트/피드/유저/설정) + 사이드바 공통 레이아웃 + admin user 시드(015), 7개 페이지 + 11개 admin 라우트 추가 (완료)
- [관리자 콘솔 콘텐츠 contents 중개 / 피드 CRUD 보강](260516/260516_admin_content_mediation_fix.md) — 피드·프로필 이미지 `content_id` 매핑(017 마이그레이션), 인스타형 피드 리스트 + 수정 기능 + 해시태그, 퀘스트 썸네일 체인 정리 (완료)
- [기본 프로필 이미지 풀 (profile_mock) 도입](260516/260516_profile_mock_pool.md) — 단일 default 아바타 → 6장 풀(018·019 마이그레이션), `/contents/profile-mock-img` seed 결정론적 서빙, resolver 일원화 (완료)
- [피드 소셜 기능 확장](260516/260516_feed_social_expansion.md) — 팔로우/DM/위치기반 필터/피드작성(020~023 마이그레이션), follows·dm 라우터, 프론트 5개 페이지 신규, 피드 헤더 재구성 (완료)
- [친구 기능 마무리](260516/260516_friend_feature.md) — ProfileCard BottomSheet, 프로필 Draggable Sheet, QR 공유 (완료, FriendAdd 미완)
- [무한스크롤 + PTR + 퀘스트 완료 구조](260516/260516_infinite_scroll.md) — useInfiniteScroll, usePullToRefresh, 서버사이드 필터링 (완료)

## 260515

- [인증 체계 구현](260515/260515_auth_todo.md) — OTP 인증 API 연동 (부분 완료, auth 잔여)
- [§2.7~2.15 휴먼 UX 점검](260515/260515_human_ux_check.md) — 58항목 점검 (부분 완료)
- [Quest FK 매핑](260515/260515_quest_fk_mapping.md) — thumbnail_content_id 연결 (부분 완료)
- [TabBar iOS + 스크롤 레이아웃](260515/260515_tabbar_scroll_layout_fix.md) — TabBar iOS 수정, 스크롤 레이아웃 (완료)
- [TabBar UX 개선](260515/260515_tabbar_ux_polish.md) — TabBar UX 개선 (완료)
- [alert/confirm → Toast/ConfirmDialog 교체](260515/260515_alert_to_toast_task.md) — sonner toast + Zustand 기반 ConfirmDialog, iOS alert 미동작 문제 해소 (완료)
- [프론트엔드 CSS 수정 & iOS/Android 플랫폼 분기 아키텍처](260515/260515_frontend_css_platform_task.md) — StatusBar 여백 정규화, ProfileMain 아이콘·아바타 위치, TabBar 인디케이터 수정, `data-platform` UA 감지 + `--status-bar-height` CSS 변수 도입 (완료)
- [Quest 인프라 3종](260515/260515_quest_infra_task.md) — District enum(17개 구) 프론트 chips 연동, user_quests.period_key 중복 방지 unique index, quests.thumbnail_content_id contents FK 연동 (완료)
- [시스템 이미지 & Mock Fallback 구축](260515/260515_mock_fallback_image.md) — district/quest 이미지 imgproxy 서빙, contents 테이블 연동(011~013 마이그레이션), mock owner_type 추가, `/contents/mock-img` 랜덤 서빙 엔드포인트, fallback 체인(quest→district→mock) 완성 (완료)
