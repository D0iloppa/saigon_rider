---
title: "기능 점검 진척도 (Progress Tracker)"
---

:::info 자동 동기화 문서
이 페이지는 `ai-docs/TEST/progress.md` 에서 자동 복사되었습니다.
편집은 **원본 파일**에서, 발행은 프로젝트 루트의 `./wikidoc_publish.sh` 로 수행하세요.
:::

# 기능 점검 진척도 (Progress Tracker)

> **점검 시작일**: 2026-05-14  **마지막 갱신**: 2026-05-15  **담당자**: D0iloppa  
> **체크리스트 본문**: [checklist/](checklist/) (섹션별 분할)  
> **이슈 로그**: [issues.md](issues.md)

## 상태 범례

| 기호 | 의미 |
|---|---|
| ⬜ | 미점검 (default) |
| 🟡 | 진행 중 / 부분 점검 |
| ✅ | Pass — 기대 결과대로 동작 |
| ❌ | Fail — 결함/회귀 발견 ([issues.md](issues.md) 참조) |
| ⛔ | N/A — 미구현·스코프 외 |

## 그룹별 진척도 (수동 집계)

| 그룹 | 항목수 | ⬜ | 🟡 | ✅ | ❌ | ⛔ | 진척률 | 본문 |
|---|---|---|---|---|---|---|---|---|
| §0 점검 절차 / 헬스 | 6 | 4 | 0 | 2 | 0 | 0 | 33% | [s0_setup.md](checklist/s0_setup.md) |
| §1 화면 라우팅 | 28 | 0 | 0 | 28 | 0 | 0 | 100% | [s1_routing.md](checklist/s1_routing.md) |
| §2 화면별 기능 | 98 | 52 | 2 | 39 | 4 | 2 | 40% | [s2_features.md](checklist/s2_features.md) |
| §3 엔진 (SRE) | 43 | 43 | 0 | 0 | 0 | 0 | 0% | [s3_engine.md](checklist/s3_engine.md) |
| §4 시스템 전반 | 18 | 18 | 0 | 0 | 0 | 0 | 0% | [s4_system.md](checklist/s4_system.md) |
| **합계** | **193** | **117** | **2** | **69** | **4** | **2** | **~37%** | |

> **260515 기준 §2 세부**: §2.1~2.6·2.10 점검 완료(부분 포함). §2.7 QUEST-DETAIL, §2.8 RIDE-ACTIVE, §2.9 RIDE-RESULT, §2.11~2.15 PROFILE/SETTINGS 미점검.

## TODO 체크리스트 (큰 단위)

각 항목 완료 시 체크 → 해당 섹션 표의 `상태` 컬럼도 동기 갱신.

- [ ] **§0** 인프라 기동 & 헬스체크 (saigon_* 7개 컨테이너 Up · BFF/Engine/Wiki 헬스 200)
- [x] **§1.1~1.8** 화면 라우팅 28종 전부 ✅
- [x] **§2.1** ONB-001 스플래시 기능 4종
- [x] **§2.2** AUTH-001 번호입력 기능 5종
- [x] **§2.3** AUTH-002 OTP/Passcode 입력 기능 5종 (❌ F-02-7·F-AUTH-LOGIN 결함)
- [x] **§2.4** PROFILE-SETUP 기능 6종 (❌ F-03-2·F-03-4 결함)
- [x] **§2.5** HOME-001 월드맵 기능 10종 (F-04-4·F-04-8·F-04-9 미점검 제외 8종 ✅)
- [x] **§2.6** QUEST-LIST 기능 6종 (F-05-2 결함 수정 완료, F-05-4·F-05-5 재점검 필요)
- [ ] **§2.7** QUEST-DETAIL 기능 6종
- [ ] **§2.8** RIDE-ACTIVE/PAUSE/GPS-ERROR 기능 12종
- [ ] **§2.9** RIDE-RESULT-S/F 기능 7종
- [x] **§2.10** FEED 기능 15종 (F-09-8·9 미점검, F-09-3 BFF 미구현으로 🟡, F-09-10 ⛔)
- [ ] **§2.11** PROFILE-001 기능 10종 (+RP 잔액)
- [ ] **§2.12** SETTINGS 메인 기능 4종
- [ ] **§2.13** SET-NOTI 기능
- [ ] **§2.14** SET-LANG 기능
- [ ] **§2.15** SET-ACCOUNT 기능 4종
- [ ] **§3.1** 화면↔엔진 연계 매트릭스 5건
- [ ] **§3.2** Engine API 17개 엔드포인트 직접 호출
- [ ] **§3.3** Engine 서비스 레이어 8종
- [ ] **§3.4** Engine 배치 잡 4종
- [ ] **§3.5** Engine 관측성
- [ ] **§3.6** 데이터 정합성 SQL 4종
- [ ] **§4.1~4.7** 시스템 전반 18 항목

## 테스트 환경 기본값

- 공개 진입 URL 베이스: `http://localhost:18090` (Nginx, `$NGINX_PORT`)
- 프론트 라우트: `http://localhost:18090/{경로}` (React Router, BrowserRouter)
- BFF API 베이스: `http://localhost:18090/api/bff/*` → 내부 `bff:8080/api/*`
- Engine API 베이스(서비스간): `http://localhost:18090/api/sre/*` → 내부 `engine:8090/v1/*`
- Engine 내부 전용 경로: `/engine/*` (Docker 내부 네트워크 `172.16/12`만 허용)
- DB 직접 점검: `docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME`
- 컨테이너 기동: `docker compose --env-file .env --profile backend up -d`
