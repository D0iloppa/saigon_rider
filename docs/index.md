# 문서 색인 (Index)

새로운 스레드가 시작될 때, 이 문서를 가장 먼저 확인하여 필요한 산출물 문서를 파악하세요.
새로운 산출물이 생성되면 아래 목록에 반드시 추가(색인화)해야 합니다.

## 📌 아키텍처 및 설정
- [ERD & DB 스키마](erd.md) - 테이블 설계, Mermaid ERD, PostGIS 컬럼, Docker 연동 방식 (`database/init/001_init_schema.sql`)
- [회원가입 & 인증 구조](auth.md) - FastAPI 인증 흐름, 쿠키 세션, passcode 발급 방식
- [**SRE 엔진 통합 지침서 v2** ✅ 현행](engine_intg_v2.md) - **BFF + Engine 분리 아키텍처** 확정안. `saigon_bff` / `saigon_engine` 두 컨테이너 구성, Docker Compose 변경, Nginx 라우팅, BFF→Engine HTTP 클라이언트 연계, Phase별 구현 계획


## 🚀 기능 요구사항 및 구현
- [프로젝트 개요](README.md) - 환경구성, 프로젝트 구성, 개요
- [화면 & 기능 명세서](spec.md) - 27개 화면 목록, 기능 목록, API dummy 함수 목록 (scene.html 기준 정적 디자인 참조 명시)
- [프론트엔드 TODO LIST](features_todo.md) - 프론트엔드 화면별 구현 항목 (245개 전체 완료)
- [백엔드 구현 필요 기능 & Admin Console](backend_todo.md) - spec.md [API-DUMMY] 기준 산출, 총 27개 엔드포인트 (P0~P3 우선순위), 관리자 콘솔 접근 경로 포함


## 🌐 개발자 포털
- [Developer Wiki](http://localhost:18090/wiki/) — Docusaurus 기반 통합 개발자 문서 (wiki 프로파일 기동 필요)


## 📊 이력관리

### 📦 기능 구현 태스크
- [기능 구현 태스크](_tasklog.md) - 기능 구현 태스크 색인

### 🛠 트러블슈팅 및 로그
- [트러블슈팅 및 로그](_troubleshooting.md) - 트러블슈팅 로그 색인
