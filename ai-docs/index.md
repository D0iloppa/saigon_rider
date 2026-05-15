# Saigon Rider — Document Map

> **이 파일은 산출물의 안정적 지도입니다.** 현재 작업 상태는 [`context/current.md`](context/current.md), 규칙은 [`/GUIDELINE.md`](../GUIDELINE.md).

## 🏗 아키텍처 / 설계

- [시스템 아키텍처 (BFF + Engine)](context/architecture.md) — `saigon_bff` + `saigon_engine` 분리, Nginx 라우팅, HTTP 클라이언트 연계
- [프론트엔드 구조 및 패턴](context/frontend.md) — 네이티브 브릿지 API, 공통 UI 컴포넌트 목록
- [ERD & DB 스키마](schema/erd.md) — 테이블 19종, Mermaid ERD, PostGIS, 마이그레이션 목록
- [인증 구조](schema/auth.md) — FastAPI 인증, 쿠키 세션, passcode 발급

## 📋 명세

- [프로젝트 개요](spec/overview.md) — 27개 화면, 기능 목록, API dummy, NativeInterface 브릿지
- [프론트엔드 기능 TODO](spec/frontend_features.md) — 화면별 구현 항목
- [백엔드 기능 TODO](spec/backend_features.md) — 27개 엔드포인트, 관리자 콘솔

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

## 🛠 엔진 내부 설계 (SRE)

- [비즈니스 규칙](engine/01-sre-business-rules.md) · [기술 스택](engine/02-sre-tech-stack.md) · [설계 스펙](engine/sre-design-spec.md)
- [ERD (PostgreSQL)](engine/sre-erd-mermaid.postgres.md)
- [미션 매핑 리포트](engine/sre-mission-mapping-report.md) · [미션 룰 매핑](engine/sre-mission-rule-mapping.md)
- [code 명령어](engine/code명령어.md)

## 📦 태스크 / 트러블슈팅 이력

- [활성 태스크](task/active/) — 현재 진행 중 (현황은 [`current.md`](context/current.md))
- [완료 태스크 아카이브](task/archive.md) — 날짜별 색인
- [트러블슈팅 인덱스](trouble/index.md) — 날짜별 색인

## 🌐 외부 자원

- [Developer Wiki](http://localhost:18090/wiki/) — Docusaurus (wiki 프로파일 기동 필요)
- 위키 발행: 루트의 `./wikidoc_publish.sh`
