# Saigon Rider — Document Map

> **이 파일은 산출물의 안정적 지도입니다.** 현재 작업 상태는 [`context/current.md`](context/current.md). 행동 원칙은 [`/CLAUDE.md`](../CLAUDE.md).

## 🛠 운용 규칙 (Operating Rules)

- [AI Agent Guideline](agent-guidelines.md) — 진입 순서, 기본 작업 워크플로우, SoT 매핑, 보안, __DEV Context, 린터, 컨텐츠 관리 — **Session Start 직후 반드시 로드**
- [서브에이전트 QM 루프 핸드오프](subagent-handoff.md) — 화면별 품질 점검 2-에이전트 루프(implementer→reviewer) 구성물·실행 절차. **새 세션에서만 가동**(커스텀 에이전트는 세션 시작 시 등록)

## 🏗 아키텍처 / 설계

- [시스템 아키텍처 (BFF + Engine)](context/architecture.md) — `saigon_bff` + `saigon_engine` 분리, Nginx 라우팅, HTTP 클라이언트 연계
- [프론트엔드 구조 및 패턴](context/frontend.md) — 네이티브 브릿지 API, iOS/Android 플랫폼 분기 CSS 아키텍처 (`--status-bar-height`, `data-platform`), StatusBar 여백 규칙, 공통 UI 컴포넌트 목록
- [ERD & DB 스키마](schema/erd.md) — 테이블 19종, Mermaid ERD, PostGIS, 마이그레이션 목록
- [인증 구조](schema/auth.md) — FastAPI 인증, 쿠키 세션, passcode 발급

## 📋 명세

- [프로젝트 개요](spec/overview.md) — 27개 화면, 기능 목록, API dummy, NativeInterface 브릿지
- [프론트엔드 기능 TODO](spec/frontend_features.md) — 화면별 구현 항목
- [백엔드 기능 TODO](spec/backend_features.md) — 27개 엔드포인트, 관리자 콘솔
- [프로젝트 TODO 리스트](context/project_todo.md) — 프론트/백엔드/엔진 등 다영역 협업이 필요한 후속 구현 항목 (예: 퀘스트 [DBG] 버튼 → 정식 완료 트리거)
- [사용처(Sink) 경제 설계 — 스킬포인트 & 쿠폰 BM](spec/sink-economy-design.md) — 다마키 체험 디자인 관점. SGR-209 스킬 트리 + RP 쿠폰/기프티콘 교환 BM (재화↔sink 1:1, phase 분해)

## ✅ 점검 / QA

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
