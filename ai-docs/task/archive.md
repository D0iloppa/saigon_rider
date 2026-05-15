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

## 260515

- [alert/confirm → Toast/ConfirmDialog 교체](active/260515_alert_to_toast_task.md) — sonner toast + Zustand 기반 ConfirmDialog, iOS alert 미동작 문제 해소 (완료)
