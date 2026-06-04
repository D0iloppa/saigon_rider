# 현재 상황 (Session Carry-Over)

> 진행 상태의 SoT는 **Plane CE** (https://plane.doil.me)이다. Plane MCP 또는 `/admin/dev`로 확인.
> Context KV는 DB(`__DEV_context`)에 유지. Features/Todos는 Plane Issues 기반 (폴백: DB).
> 이 파일은 Plane에 담기 어려운 **맥락적 판단·결정사항·외부 의존**만 기록한다.
> 완료 이력은 [`history.md`](history.md). **마지막 갱신**: 2026-06-04 (SGR-220 DONE — 개발→운영 1차 배포 + 배포 SOP/도메인 마이그레이션 규칙 수립. 운영 letantonsheriff.com 가동. 후속 SGR-227 init 스키마 결함)

---

## 외부 의존 / 대기 중

| 항목 | 상태 | 다음 액션 |
|---|---|---|
| 다크모드 (SGR-192) | 코어 완료·빌드/배포 됨, 시각검증 대기 | Settings 토글로 라이트/다크 확인 → Feature DONE 전환. 잔여 P4(status 틴트·glass-light·rarity)는 SGR-197 |
| Capacitor 네이티브 빌드 검증 | Mac 측 대기 | `native/CAPACITOR_MIGRATION.md` §3 회귀 체크리스트 |
| SaigonDistrictMap 집계 배지 | 시각검증 대기 | 브라우저에서 줌/배지 탭 확인 |
| OpenWeather API 키 | `.env`에 설정 완료, 활성화 대기 | mock fallback 동작 중 |

## 미해결 결함 ([issues.md](../TEST/issues.md))

| 기능 ID | 화면 | 수정 방향 |
|---|---|---|
| F-AUTH-LOGIN | AUTH-002 OtpInput | `handleVerify` → `apiLogin(phone, passcode)` 호출 |
| F-02-7 | AUTH-002 재전송 | 재전송 버튼 onClick에 `apiRegister(phone)` 호출 추가 |
| F-03-2 | PROFILE-SETUP 닉네임 중복 | debounce + `check-nickname` API 연동 |

## 트러블슈팅 (QA 점검) — 2026-05-30

> 메인 티켓: "트러블슈팅 (QA 점검)" / Plane 서브이슈로 개별 추적

| # | 그룹 | 항목 | 상태 |
|---|---|---|---|
| TS-1 | 에러/502 | 페이지 이동시 502에러 발생 | 미확인 |
| TS-2 | 에러/502 | 시즌패스 404 에러발생 | 미확인 |
| TS-3 | 아이템/상점 | 아이템 작업 후 구매시 에러발생 | 미확인 |
| TS-4 | 아이템/상점 | 아이템 구매시 골드 부족 → 구매불가 알림 안뜸 | 미확인 |
| TS-5 | 아이템/상점 | 가차 내역이 없음 | 미확인 |
| TS-6 | 피드/SNS | 댓글 열었을때 채팅창 짤림 | 미확인 |
| TS-7 | 피드/SNS | 댓글 누르고 닫을수 없음 | 미확인 |
| TS-8 | 피드/SNS | 공유하기 아이콘 제거 | 미확인 |
| TS-9 | 설정/계정 | 알림설정 연동 | 미확인 |
| TS-10 | 설정/계정 | 위치정보 표기만 됨 | ✅ SGR-199 완료 (권한 조회/재요청/앱설정 직행) |
| TS-11 | 설정/계정 | 계정관리 아이디 확인 및 다운로드 기능 | 미확인 |
| TS-12 | 설정/계정 | 개인정보 미구현 | 미확인 |
| TS-13 | 설정/계정 | 이용약관 미구현 | 미확인 |
| TS-14 | 설정/계정 | 고객센터 확인 | 미확인 |
| TS-15 | 설정/계정 | 계정탈퇴 기능 확인 필요 | 미확인 |

## 활성 태스크 (🔧)

- (없음) — **SGR-220 개발→운영 1차 배포 + SOP 완료** (운영 `https://letantonsheriff.com` 가동). 이력은 [`history.md`](history.md) 2026-06-04, runbook `task/active/260604_deploy_prod_task.md`.
  - **배포 후속(backlog)**: ① **SGR-227** init 스키마 베이스라인 결함(fresh DB 빌드 불가 — dump-restore 우회 중) ② FCM firebase json 마운트(푸시 활성화) ③ official/grand-opening.jpg 1건(saigon.doil.me 복구 시) ④ 전용 도메인 구매 시 마이그레이션(규칙은 runbook §도메인 마이그레이션)

## 부분 점검 (🟡)

- F-03-1 닉네임 1자 IME 이슈 — 재빌드 후 재점검 필요
- 퀘스트 `thumbnail_content_id` 미연결 — 어드민 퀘스트 편집 시 컨텐츠 연결 UI 필요

## 다음 우선순위

1. **CHECKPOINT BFF 연동** — BFF Quest 모델에 target_lat/lng 추가 또는 quest_pins 연동
2. **유가 후속 (Feature #50)** — admin 페이지, WorldMap 위젯 적용, InfoGasList nearby-v2
3. **GAP-H1 (#32)** E2E 테스트 시나리오 5개

---

## TODO 리스트 (스프레드시트 기준)

### 그룹 A — 아이템·퀘스트·푸시

| # | 내용 | 상태 | 비고 |
|---|---|---|---|
| A-1 | 퀘스트 개수를 20개로 줄이기 | 미진행 | |
| A-2 | 아이템 효과정의 | ✅ 완료 (SGR-210 DONE) | 착용효과 4종(RP/Gold 배수·퀘스트 슬롯·비용 할인), rarity별 고정 테이블. 슬롯별 시드(sre036). **사용자 노출 UI 완료**: 개러지 합산 HUD(탭→상세 시트)+개러지/인벤토리 개별 배지, effect 필드 Engine→BFF→Front. 개별 조정은 어드민 effect_type |
| A-3 | 아이템 착용시 개러지에 캐릭터에 착용 효과 보여주기 | 미진행 | A-2 완료, 시각화는 별도 |
| A-4 | 아이템 개수도 부위별 5개로 줄이기 | 미진행 | |
| A-5 | 앱에서 접속시 FCM 토큰 서버전송 | 미진행 | |
| A-6 | 관리자페이지에서 PUSH 기능 | 미진행 | |

### 그룹 B — 연동·테스트·알림

| # | 내용 | 상태 | 비고 |
|---|---|---|---|
| B-1 | 쿠폰연동 | 미진행 | 기존 작업 완료 후 진행 |
| B-2 | 회원가입 OAuth 연동 | 미진행 | 기존 작업 완료 후 진행 |
| B-3 | 안드로이드 14일 테스트 | 미진행 | 크몽에서 5000~6000원정도에 가능, 14일 테스트가 필수이기 때문에 앱등록이 필요함 |
| B-4 | 아이폰 알림서비스 클릭시 페이지 이동 | 미진행 | |
| B-5 | 안드로이드 알림서비스 클릭시 페이지 이동 | 미진행 | |
| B-6 | 앱푸시연동 | **진행중** | DB에 해당 단말에 미열람개수를 확인하여 변수로 넘겨야함(1000보다크면 무조건 999로) |
