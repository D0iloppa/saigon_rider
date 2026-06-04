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

- **SGR-236 info 화면 마무리** — 발행 2026-06-04. 4모듈 골격은 완성, 마무리만 남음. 하위 P1~P4(SGR-237~240): P1 비 레이더 RainViewer 실연동(현 CSS 목업), P2 유가 후속 #50(admin 가격입력·WorldMap 위젯), P3 **초기 seed 정확화**(gas_station/repair_shop/repair_review/fuel_price INSERT 0건 — 현재 프론트 MOCK 의존), P4 시각 QA·통일성. 순서: P3→P4 선행, P1/P2 병렬. SoT `task/active/260604_info_screens_finalize_task.md`, Notion `3753bd6b-405d-819e...`.
- **SGR-228 재화 개념 정의 + 밸런싱 (RP·골드·스킬포인트)** — In Progress. 환율 **골드 100 : 스킬 10 : 크리스탈(RP) 1**. 골드=퀘스트+레벨업→아이템/가차, 스킬=레벨업→스킬. 확정 사항:
  - **RP 가치 = 1 RP : 100 VND**. 커피 한 잔(50,000 VND) = **500 RP**. 쿠폰 카탈로그 face_value 항목 재가격(mig **sre040**): DATA_1GB 140 / GOTIT_50K 500(커피) / GOTIT_100K 1000.
  - **데일리 퀘스트 RP = 0** (`ride.py` payload.rp→0). RP 수급은 **이벤트 퀘스트 전용**(재고 예측). 현재는 일괄 0, 경제밸런스 확정 후 이벤트 한정 도입(분기 미구현). 엔진 `action_definition.rp_grant`는 sre039서 이미 0.
  - **코스메틱 재가격**(mig **sre041**): BADGE_FOUNDER 100 / FRAME_NEON 300 / BADGE_LEGEND 2000 (커피 500 기준).
  - **마일리지 = EXP 전용**(mig **sre042**): MILEAGE_XP(고아 XP) 비활성, MILEAGE_EXP(10/km) 유지.
  - **레벨업 보상 단일 발동점 + 정책 주도**: `gain_exp(db,user,amt)` 단일 함수(`utils.py`)로 exp+레벨업+보상 통합(`apply_level_up` 폐기). 보상값은 BFF `levelup_reward_policy`(init **049**, seed GOLD 200/SKILL_PT 1)에서 읽음. 엔진 `LEVELUP_REWARD` 비활성(**sre044**; sre043은 SGR-229 criteria 점유). 호출처 전부(ride/quests/internal) gain_exp 경유 — quests 퀘완료 레벨업 누락도 교정.
  - 가챠 통화 라벨 `XP→RP` 통일(BFF `_CURRENCY_MAP`/`_gacha_type` + 프론트 gacha.ts/GachaMain + i18n tab_gc).
  - **Gold 확정**: 퀘 50/건 유지 + 레벨업 정책 GOLD 200/레벨.
  - ✅ **보고서 SGR-235 Done** — `ai-docs/spec/economy-balance-report.md` + Notion "260604 재화 경제 체계 정립 보고서". sink-economy-design.md `reward_exp×0.3` OBSOLETE 배너 정정 완료.
  - **미결(설계상 후속)**: 이벤트 퀘 RP 도입 / monthly_quota 실값(비즈니스 입력) / 마이그·049 활성화(기존 DB 수동, 배포 시). Notion 260604.
- (없음) — **SGR-220 개발→운영 1차 배포 + SOP 완료** (운영 `https://letantonsheriff.com` 가동). 이력은 [`history.md`](history.md) 2026-06-04, runbook `task/active/260604_deploy_prod_task.md`.
  - **배포 후속(backlog)**: ① **SGR-227** init 스키마 베이스라인 결함(fresh DB 빌드 불가 — dump-restore 우회 중) ② FCM firebase json 마운트(푸시 활성화) ③ official/grand-opening.jpg 1건(saigon.doil.me 복구 시) ④ 전용 도메인 구매 시 마이그레이션(규칙은 runbook §도메인 마이그레이션)

## 활성 — 검증 대기 (🔧)

- **SGR-229 퀘스트 검증 인터페이스 추상화 (전략패턴 + 신호 기반)** — 코드 DONE(P1~P4), **P5 BLOCKED**. 서브 P1~P5(SGR-230~234).
  - 완료: `quest_tracker`를 Signal(GpsSignal/EventSignal) 기반 `QuestValidator` 전략 + `ValidatorRegistry` 디스패치로 리팩토링. DISTANCE/CHECKPOINT → `quest_validators/{distance,checkpoint}.py`. 목표 파라미터 `criteria JSONB` 전면 이관(mig **sre043**, 타입별 컬럼·CHECK 제약 제거). BFF `start_ride`/`engine_client`/프론트 `ActiveCardState`까지 criteria 배선. `dispatch_event()` 이벤트 진입점 시드(구체 타입은 제품 요구 시). ruff clean·validator 등록·alembic head 단일 검증 완료.
  - **BLOCKED**: dev DB가 sre039이고 `upgrade head`가 **SGR-228 미적용 마이그 040에서 실패**(아래 결함 참조) → 제 043 적용·엔진 재시작·라이드 회귀 불가. 현재 가동 엔진은 구코드(sre039)로 정상, DB 롤백됨. SoT `task/active/260604_quest_validation_strategy_task.md`, Notion `3753bd6b...`.
- **✅ RESOLVED(SGR-228 마이그 결함)**: `040`/`041`의 `required_rp`→**`required_xp`** 교정 완료(/code-review 2026-06-04). 추가로 levelup 비활성 마이그가 SGR-229 `043_quest_card_criteria`(sre043)와 ID 충돌 → **sre044**로 재번호. 체인 선형화: sre042→043(criteria)→044(levelup). **→ SGR-229 P5 BLOCKED 해소**(이제 `upgrade head` 040에서 안 막힘). ruff·체인 단일 head 검증 완료.

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
