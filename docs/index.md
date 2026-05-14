# 문서 색인 (Index)

새로운 스레드가 시작될 때, 이 문서를 가장 먼저 확인하여 필요한 산출물 문서를 파악하세요.
새로운 산출물이 생성되면 아래 목록에 반드시 추가(색인화)해야 합니다.

## 📌 아키텍처 및 설정
- [ERD & DB 스키마](erd.md) - 테이블 설계, Mermaid ERD, PostGIS 컬럼, Docker 연동 방식 (`database/init/001_init_schema.sql`)
- [회원가입 & 인증 구조](auth.md) - FastAPI 인증 흐름, 쿠키 세션, passcode 발급 방식
- [**SRE 엔진 통합 지침서 v2** ✅ 현행](engine_intg_v2.md) - **BFF + Engine 분리 아키텍처** 확정안. `saigon_bff` / `saigon_engine` 두 컨테이너 구성, Docker Compose 변경, Nginx 라우팅, BFF→Engine HTTP 클라이언트 연계, Phase별 구현 계획

## ⚙️ SRE 엔진 명세 (`docs/engine/`)
- [SRE 설계서](engine/sre-design-spec.md) - 8개 모듈 경계, 도메인 범위, 보안 모델
- [SRE 비즈니스 룰](engine/01-sre-business-rules.md) - RP 계산식, 어뷰징 정책, 멱등성, 보상 교환 정책
- [SRE 기술 스택](engine/02-sre-tech-stack.md) - 패키지 구조, Alembic, APScheduler, 인증 결정
- [SRE ERD (PostgreSQL)](engine/sre-erd-mermaid.postgres.md) - 전체 테이블 정의 및 관계 (Mermaid)
- [SRE SQL DDL](engine/sre-schema.postgres.sql) - PostgreSQL 실제 DDL
- [SRE OpenAPI 명세](engine/sre-api.openapi.yml) - REST API 전체 스펙 (v1)
- [SRE 미션 룰 매핑](engine/sre-mission-rule-mapping.md) - 미션↔액션 코드 매핑 테이블
- [SRE 미션 시드 SQL](engine/sre-mission-seed.sql) - 미션 240개 초기 데이터

## 🚀 기능 요구사항 및 구현
- [프로젝트 개요](README.md) - 환경구성, 프로젝트 구성, 개요
- [화면 & 기능 명세서](spec.md) - 27개 화면 목록, 기능 목록, API dummy 함수 목록 (scene.html 기준 정적 디자인 참조 명시)
- [프론트엔드 TODO LIST](features_todo.md) - 프론트엔드 화면별 구현 항목 (245개 전체 완료)
- [백엔드 구현 필요 기능 & Admin Console](backend_todo.md) - spec.md [API-DUMMY] 기준 산출, 총 27개 엔드포인트 (P0~P3 우선순위), 관리자 콘솔 접근 경로 포함

## 📦 기능 구현 태스크
- [260513 Contents 이미지 서빙 구현](260513_contents_task_plan.md) - DB 스키마(contents), 업로드 API, imgproxy URL 서빙 기능 (모두 완료)
- [260513 프로필 사진·닉네임 변경 구현](20260513_profile_task.md) - 기본 아바타, 사진 업로드, 닉네임 수정 API (모두 완료)

## 🛠 트러블슈팅 및 로그
- [260513 Auth/Imgproxy 트러블슈팅](260513_auth_imgproxy_troubleshooting.md) - passcode_hash 누락, Zustand persist로 인한 home 진입, nginx slash merge, .env LAN IP 문제 및 조치
- [SRE 엔진 통합 지침서 v1 ~~DEPRECATED~~](_deprecated/engine_intg_deprecated.md) - 모놀리식 통합 방식(폐기). 2026-05-14 아키텍처 재검토로 `engine_intg_v2.md`로 대체
