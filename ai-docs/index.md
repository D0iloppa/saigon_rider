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

## 🔬 리서치

- [당근 동네지도 조사 — 동네지도 개편 방향 제안서](research/260710_karrot_map/당근_동네지도_조사.md) — SGR-315 사전조사 정본. 채택/변형/배제 14항 + P1~P3 실행 순서. 원문 17건은 [`sources/`](research/260710_karrot_map/sources/), 재개 원장 [`_HANDOFF.md`](research/260710_karrot_map/_HANDOFF.md)

## ✅ 점검 / QA

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
