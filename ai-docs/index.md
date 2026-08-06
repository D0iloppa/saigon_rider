# Saigon Rider — Document Map

> **이 파일은 산출물의 안정적 지도입니다.** 현재 작업 상태는 [`context/current.md`](context/current.md). 행동 원칙은 [`/CLAUDE.md`](../CLAUDE.md).

## 🛠 운용 규칙 (Operating Rules)

- [AI Agent Guideline](agent-guidelines.md) — 진입 순서, 기본 작업 워크플로우, SoT 매핑, 보안, __DEV Context, 린터, 컨텐츠 관리 — **Session Start 직후 반드시 로드**
- [서브에이전트 QM 루프 핸드오프](subagent-handoff.md) — 화면별 품질 점검 2-에이전트 루프(implementer→reviewer) 구성물·실행 절차. **새 세션에서만 가동**(커스텀 에이전트는 세션 시작 시 등록)

## 🏗 아키텍처 / 설계

- [시스템 아키텍처 (BFF + Engine)](context/architecture.md) — `saigon_bff` + `saigon_engine` 분리, Nginx 라우팅, HTTP 클라이언트 연계
- [프론트엔드 구조 및 패턴](context/frontend.md) — 네이티브 브릿지 API, iOS/Android 플랫폼 분기 CSS 아키텍처 (`--status-bar-height`, `data-platform`), StatusBar 여백 규칙, 공통 UI 컴포넌트 목록
- [디자인 시스템 — 화면 정비 규칙](context/design-system.md) — 아이콘(lucide/이모지 판별)·숫자 표기(.num, JetBrains Mono 금지)·색 용법·표면 문법(`styles/system.module.css`)·상태 4종(StateBlock/SkeletonRows)·저사양 제약·before/after. **화면군 정비 담당팀의 유일한 기준**
- [네이티브 키보드 연계 UX 규약](context/keyboard-ux.md) — KeyboardBridge → native.onKeyboardChange → useKeyboard 인프라, 스크롤 페이지형/오버레이 바텀시트형 정답 패턴, 안티패턴, 신규 화면 체크리스트
- [프론트엔드 페이지-메뉴-컴포넌트 맵](context/frontend-page-map.md) — 한글 메뉴명(탭바/게임허브) → 라우트 → 페이지/컴포넌트 파일 매핑, codebase-memory MCP 심화 조회 연결점
- [Legacy HCMC 행정경계 출처](context/map-boundary-source.md) — 2025년 7월 이전 22개 구·현 경계의 고정 원본·라이선스·SHA-256·재생성 절차
- [ERD & DB 스키마](schema/erd.md) — 테이블 19종, Mermaid ERD, PostGIS, 마이그레이션 목록
- [인증 구조](schema/auth.md) — FastAPI 인증, 쿠키 세션, passcode 발급

## 📋 명세

- [서비스 구상서 (2026-07-26)](spec/service-concept-260726.md) — **"이게 무슨 서비스인가"의 SoT**. 타겟·문제 정의·경쟁 지형·가치 제안 3가지·기능 지도·IA 구상(마켓 첫 화면·탭 4개)·**거래 라이프사이클 7단계 중 비어 있는 ④합의~⑤이동(=차별점) 갭 분석**·수익 구상·단계 구상. 확정/가정 구분(§11), 출사 차단 7항(§12). `spec/overview.md`(피벗 전 라이딩 게임앱 원본 스펙)보다 **우선**
- [프로젝트 개요](spec/overview.md) — 27개 화면, 기능 목록, API dummy, NativeInterface 브릿지 (⚠️ 피벗 전 원본 스펙 — 정체성은 `product-definition-260726.md` 참조)
- [프론트엔드 기능 TODO](spec/frontend_features.md) — 화면별 구현 항목
- [백엔드 기능 TODO](spec/backend_features.md) — 27개 엔드포인트, 관리자 콘솔
- [프로젝트 TODO 리스트](context/project_todo.md) — 프론트/백엔드/엔진 등 다영역 협업이 필요한 후속 구현 항목 (예: 퀘스트 [DBG] 버튼 → 정식 완료 트리거)
- [사용처(Sink) 경제 설계 — 스킬포인트 & 쿠폰 BM](spec/sink-economy-design.md) — 다마키 체험 디자인 관점. SGR-209 스킬 트리 + RP 쿠폰/기프티콘 교환 BM (재화↔sink 1:1, phase 분해)
- [광고 성과 지표 설계 / 구현 발주서](spec/ad-performance-metrics.md) — 노출(viewability)·클릭·CTA 전환·광고비 대비 효과(CPM/CPC/CPA) 정의, 이벤트 수집 지점(봇·자기노출·중복 필터), `ad_events`/`ad_daily_stats` 데이터 모델, 일별 롤업 전략, BFF vs Engine 책임 분리(엔진 out-of-scope 근거), 광고주 대시보드 요소+빈 상태 7종, **미구현 체크리스트(DB 4/BFF 12/프론트 13/엔진 0/정책 5)**
- **[근접 광고 + 방문 포인트 설계 260806](260806_proximity_ad_design.md)** — ⚠️ **승인 대기(D-1 백그라운드 위치 / D-6 오픈범위 미결)**. 대표 지시 260806 18:47~18:50 로 최초 공유된 사업모델(이동 중 위치추적 → 유료 가맹점 반경 진입 전 광고·푸시 → 방문 → 포인트 적립 / 가맹점 tier 과금) 정식화. **모듈 경계 판정: 신규는 `modules/proximity/`(근접판정·쿨다운·방문자격·위조방어) 하나뿐 — 광고는 기존 `AdsApplication` + `ad_events.surface='proximity'` 재사용(머니경로 이중화 금지), 알림은 `notification_outbox`/`noti_worker`, 포인트는 Engine `action_definition.rp_grant`**. 판정 위치 하이브리드(알림=클라 1차 / 적립=서버 확정, GPS 스푸핑 환금 방어). 신규 테이블 `proximity_hit`·`proximity_policy`(킬스위치 `is_enabled=FALSE` 시작). **제약: `@capacitor/geolocation` 은 포그라운드 전용 → 백그라운드 추적 불가**(도입 시 iOS `UIBackgroundModes` 심사 소명·Play 별도 승인). **GPS 정책 3회 반전 이력 기록 — 본 모델은 260806 08:48 "전 화면 GPS 기본" 과만 정합**. 8월 오픈 범위 제외 근거, 선행조건=가맹점 수

## 🔬 리서치

- [당근 동네지도 조사 — 동네지도 개편 방향 제안서](research/260710_karrot_map/당근_동네지도_조사.md) — SGR-315 사전조사 정본. 채택/변형/배제 14항 + P1~P3 실행 순서. 원문 17건은 [`sources/`](research/260710_karrot_map/sources/), 재개 원장 [`_HANDOFF.md`](research/260710_karrot_map/_HANDOFF.md)

## ✅ 점검 / QA

- **[출시 전 사용자 관점 UX 통합 감사 260803](260803_prelaunch_ux_audit.md)** — **사용자 경험 관점 단일 SoT**(정적 감사 UX-01~14 + 운영·dev 실측을 통합·재검증). `634d29a` 기준. **P0 2건**(비로그인 약관/방침 20초 강제 이탈+거짓 세션만료 · 딥링크 목적지 소실) · **P1 16건**(게임 스프라이트 전역 주입으로 스크린리더 차단, 판매완료 조작 UI, 지도 진입 GPS 자동요청 실측 확증, 통화 표기 2벌, 위치 출처 은폐, DM·거래이력 유실, 작성 중 초안 소실, 탭바 비활성 30여 화면, Google 버튼 언어·국기 404·스플래시 glass, 랜딩 캡처 데이터, div onClick 접근성, 제출 중 중복 클릭 8개 폼) · **P2 16건**(번들 750KB/파싱 2.5MB, 폰트 외부 CDN, 유령 토큰, 폴링 2벌, lazy 미적용, FAB 겹침, 탭 상태 초기화, TopBar Back, 44px 미만 타깃, safe-area) · **§5 화면상 부조화·정보구조**(홈↔탭 책임, 생성 CTA 위치 불일치, 화면별 문법, 거래 안전 문맥) · 제품 결정 5건. **점검 축별 매핑 · Gate A/B/C 처리 순서 · 출시 합격 시나리오 · 공식 기준(Android/Apple/WCAG/Chợ Tốt) 대조**
  - 통합 전 정적 코드 감사 원본: [`TEST/preopen_user_experience_audit_260803.md`](TEST/preopen_user_experience_audit_260803.md) (UX-01~17 — 위 통합본에 전부 흡수됨)
- **[출시 가부 판정 260731 — 코드 기준](260731_launch_readiness_verdict.md)** — `c8bc67c` 기준 6영역 감사 + 27커밋 재검증. 기능/서비스 관점 분리, 차단 항목·오픈 범위 권고. **실배포면·시크릿은 아래 문서와 상호보완**
- **[공개 출시 GO/NO-GO 감사 260731 — 배포면 기준](260731_prelaunch_go_no_go_audit.md)** — `app.saigon-rider.com` 실배포면·시크릿·실행검증 SoT
- [전체 시스템 점검 보고서 260703](TEST/inspection_260703.md) — 아키텍처·코드·서비스 전수 감사 (P0~P2 조치목록) + 핸드오프 [`context/handoff_260703.md`](context/handoff_260703.md)
- [구현 회고 — 이렇게 만든 게 맞았나 (2026-07-26)](context/build-retrospective-260726.md) — 서비스 구상서 기준으로 되짚은 **배분 감사**. 도메인별 코드 실측(코어 거래 14.2% vs 휴면 게임 21.3% vs 광고주 0인 B2B 15.1%, 차별점 0%), 맞았던 결정 11건 / 틀렸던 결정 10건, **변명 10건 성립·불성립 판정**, 근본 원인(제품 정의 부재), 재발 방지 절차 5항
- [진척 트래커](TEST/progress.md) — 그룹별 진척도 (휘발성)
- [이슈 로그](TEST/issues.md) — 발견된 결함 + 미구현(⛔) 잔여
- [체크리스트 인덱스](TEST/checklist/README.md) — §0~§6 섹션 진입점
  - [§0 점검 절차](TEST/checklist/s0_setup.md)
  - [§1 화면 라우팅](TEST/checklist/s1_routing.md)
  - [§2 화면 기능](TEST/checklist/s2_features.md)
  - [§3 엔진](TEST/checklist/s3_engine.md)
  - [§4 시스템](TEST/checklist/s4_system.md)
  - [§6 부록 (진단 명령)](TEST/checklist/s6_appendix.md)
  - [§7 퀘스트 COUNT_EVENT](TEST/checklist/s7_quest_count_event.md)

## 🛠 엔진 내부 설계 (SRE)

- [비즈니스 규칙](engine/01-sre-business-rules.md) · [기술 스택](engine/02-sre-tech-stack.md) · [설계 스펙](engine/sre-design-spec.md)
- [ERD (PostgreSQL)](engine/sre-erd-mermaid.postgres.md)
- [게이미피케이션 v2 배포 가이드](engine/sre-gamification-deployment-guide.md) — 가챠/상점/시즌 RPG 경제 패러다임 (v2.0)
- [퀘스트 달성 체크 시스템 설계](engine/sre-quest-completion-design.md) — GPS 기반 퀘스트 카드 체크 + 데일리 슬롯 정책
- [퀘스트 COUNT_EVENT 종단 구현](engine/quest-count-event-implementation.md) — agg=count_event 검증기(A안) 종단 구현 보고서
- [퀘스트 비라이딩 재분류 결정서](engine/quest-reclassification-proposal.md) — DISTANCE 폴백 퀘스트의 제목기준(B) 재분류 적용/보류 내역
- [미션 매핑 리포트](engine/sre-mission-mapping-report.md) · [미션 룰 매핑](engine/sre-mission-rule-mapping.md)
- [code 명령어](engine/code명령어.md)

## 🔄 워크플로우

> 반복 태스크의 절차·맥락. 필요할 때만 로드.

- [워크플로우 인덱스](workflow/README.md) — 등록된 워크플로우 목록
- [Docusaurus 위키 현행화](workflow/wiki-update.md) — 변경 영역→파일 매핑, 편집 지침, 발행 절차
- [시스템 컨텐츠 이미지 업로드](workflow/system-contents-upload.md) — imgproxy 서빙 구조, 파일 배치 절차, URL 패턴
- [Project TODO 관리](workflow/project-todo-management.md) — `project_todo.md` 등록·착수·완료 아카이빙·보류 절차
- [__DEV Context 현행화](workflow/dev-context-management.md) — DB 기반 진행 상태 관리 (Feature·Todo·Context), 어드민/API/위키 연동

## 📦 태스크 / 트러블슈팅 이력

- [활성 태스크](task/active/) — 현재 진행 중 (현황은 [`current.md`](context/current.md))
- [세션 이력](context/history.md) — 완료된 세션 작업 이력 (current.md에서 분리)
- [완료 태스크 아카이브](task/archive.md) — 날짜별 색인
- [트러블슈팅 인덱스](trouble/index.md) — 날짜별 색인

## 🎨 디자인 시안 (정적 HTML)

> 프로젝트 루트 `dev-test/` 하위에 배치. 최상위 Nginx가 `/dev-test/`를 직접 정적 서빙한다 (프론트엔드 빌드와 무관). **배포 대상이 아닌 디자인 검토 전용 페이지.**

- [`/dev-test/item-catalog/`](../dev-test/item-catalog/index.html) — 아이템 비주얼 시스템 카탈로그 (컬렉션·등급·SVG)
- [`/dev-test/equip-preview/`](../dev-test/equip-preview/index.html) — 아이템 착용 미리보기 (라이더/바이크/이펙트 탭, 실루엣 배치)

## 🌐 외부 자원

- [Developer Wiki](http://localhost:18090/wiki/) — Docusaurus (wiki 프로파일 기동 필요)
- 위키 발행: 루트의 `./wikidoc_publish.sh`
