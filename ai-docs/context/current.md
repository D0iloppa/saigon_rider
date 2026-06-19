# 현재 상황 (Session Carry-Over)

> 진행 상태의 SoT는 **Plane CE** (https://plane.doil.me)이다. Plane MCP 또는 `/admin/dev`로 확인.
> Context KV는 DB(`__DEV_context`)에 유지. Features/Todos는 Plane Issues 기반 (폴백: DB).
> 이 파일은 Plane에 담기 어려운 **맥락적 판단·결정사항·외부 의존**만 기록한다.
> 완료 이력은 [`history.md`](history.md). **마지막 갱신**: 2026-06-08 (info 탭 정비리뷰·주유대기 RP 전환 + 리뷰 조회 화면 + `_earn_gp_safe` 적립버그 수정 — 코드 DONE·커밋 94d71ec, 시각검증 대기. 직전 SGR-285 회원가입 IME)

---

## 외부 의존 / 대기 중

| 항목 | 상태 | 다음 액션 |
|---|---|---|
| 다크모드 (SGR-192) | 코어 완료·빌드/배포 됨, 시각검증 대기 | Settings 토글로 라이트/다크 확인 → Feature DONE 전환. 잔여 P4(status 틴트·glass-light·rarity)는 SGR-197 |
| Capacitor 네이티브 빌드 검증 | Mac 측 대기 | `native/CAPACITOR_MIGRATION.md` §3 회귀 체크리스트 |
| SaigonDistrictMap 집계 배지 | 시각검증 대기 | 브라우저에서 줌/배지 탭 확인 |
| OpenWeather API 키 | `.env`에 설정 완료, 활성화 대기 | mock fallback 동작 중 |
| Google Maps Directions 키 (SGR-269) | 코드 완료·휴면, 키 발급 대기 | `GOOGLE_MAPS_API_KEY` 발급→`.env` 입력→`restart bff`. 가이드: [`google-maps-api-key-setup.md`](../google-maps-api-key-setup.md). 미설정 시 "준비 중" 폴백 |

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

- **B-2 OAuth 로그인 전환 (SGR-B2, 2026-06-19)** — P1~P5 코드 DONE, dev 검증 완료. SoT [`ai-docs/task/active/260619_oauth_login_task.md`](../task/active/260619_oauth_login_task.md).
  - P1: DB 마이그 100(users.phone nullable + user_oauth_identities) + 101(oauth app_config seed) — dev 적용 완료.
  - P2: BFF `POST /auth/oauth/login`(Google tokeninfo + Facebook debug_token) + `POST /auth/session/verify` + `POST /auth/dev-login`(개발 전용). `backend/app/services/oauth.py` 신규.
  - P3: `session.ts` → `{userId, sessionToken}`, `App.tsx` bootstrap → session/verify, `api/auth.ts` apiOAuthLogin/apiSessionVerify/apiDevLogin.
  - P4: `native.ts` signInWith stub, `OAuthLogin.tsx` 신규(Google/Facebook 버튼 + dev 테스트 버튼), i18n ko/en/vi. PhoneInput/OtpInput 폐기 삭제.
  - P5: `101_oauth_config_seed.sql` placeholder-only.
  - **⚠️ 잔여**: ① 실제 Google/Facebook client_id → app_config UPDATE(키 발급 안내 문서 `260619_oauth_login_task.md` §7) ② native SDK 통합(Android Capacitor 플러그인 — Mac 빌드 의존) ③ `01085213251` 테스트 계정 OAuth 연동(OAuth 완성 후) ④ 운영배포 시 APP_ENV=production 설정 필요(dev-login 차단).
  - **tsc 0 / eslint warning 0(기존 코드 경고만) / vite build 성공 / dev-login 200 / session-verify valid→200 bad→401**

- **침수 데이터 전략 3층 모델 (결정 2026-06-04)** — ①상습 핫스팟 baseline + ③실시간 UGC 제보 **안정화 완료**, ②날씨 기반 일일 예측은 **OpenWeather 실연동 후로 보류**.
  - ① baseline: `flood_hotspot_stats` 30건(037 시드, dev 적용됨) → 플러드 페이지 "🌧 상습 침수 지역" 섹션으로 표출(좌표→구역 필터). 제보 0건이어도 화면 채워짐.
  - ③ UGC: 침수 신고 = 주유/정비식 **바텀시트**(FAB→하단 CTA 이동), 깊이 select, **사진 실첨부**(`/contents/upload`→imgproxy_url을 photo_url 저장, FloodDetailSheet 표시), 현재 GPS. 즉시 반영(주유/정비와 달리 admin 큐 없음 — 실시간 특성).
  - **② 구현 완료(SGR-268, 시각검증 대기)**: OpenWeather **이미 라이브**(키 유효·BFF 전달·프론트 `VITE_USE_MOCK=false`; 메모리 "mock fallback" stale). init `054_flood_risk_daily.sql`+`FloodRiskDaily` 모델(flood_report와 분리). 잡 `jobs/predict_flood_risk.py`(구역별 24h pop≥50%→핫스팟 예측위험 당일 적재, BFF APScheduler 05:30/15:00 ICT). map-data에 `risks`+수동 트리거 `POST /info/flood/admin/predict-risk`(service key). 프론트: 통합 리스트에 "⚠️ 오늘 침수 위험 N%"(예측·실신고 아님 명시)+중복 핫스팟 억제. 만료 24h. 가짜 실신고 seed 없음.
  - **흡수/정렬**: 핫스팟·예측위험·실시간 제보를 "최근 침수" 단일 리스트로 통합·최신순(제보 reported_at > 예측 today > 핫스팟 last_flood). 헤더 "최근 침수 · N건".


- **SGR-251 정보 서브페이지 지도/리스트 템플릿 통일** — 코드 DONE, **시각검증 대기**. 부모 SGR-242(메인화면/지도 개편). 기준 템플릿=침수(InfoFloodMap): 토글 없이 [지도(상단)→활성리스트(하단)] 동시 표시.
  - **주유/정비**: `view` 토글(`[지도|리스트]`) 제거, `InfoMap variant="fullscreen"`(침수와 동일, mapWrap height 280px) + 리스트 하단 동시 표시. 죽은 `viewToggle*` CSS 정리.
  - **날씨**: 날씨 카드 기준은 현 동작(선택 구역 따라감) 유지. 지도 컴포넌트를 메인과 동일한 `InfoMap variant="section"`(구역 지도, 현 위치 구역 highlight)으로 교체. **RainRadar(RainViewer 강수 레이더) 제거**(`RainRadar.tsx` 삭제, weather `mapTitle` i18n 3종 추가). 잔여: `api/info.ts getRainRadar`/`RainRadarData`는 미사용 export로 잔존(라이브러리 메서드), weather radarTitle/radarUpdated/myLocation i18n 키 dead.
  - 검증: `tsc -b` 0, eslint 에러 0. seed 데이터(gas/repair) 정확화는 본 작업 후 별도(SGR-236 P3).
- **주유소 CSV 시드 전면교체 + UGC 제보 대기큐 + admin 검증** — P1~P3 코드 DONE, **시각검증 대기**(앱 제보 제출·admin 승인/반려 클릭). SGR-236 info 후속.
  - **P1 스키마+시드**: init `050_gas_ugc.sql`(gas_station +phone/url, `gas_station_submission` 대기큐 PENDING/CONFIRMED/REJECTED), `051_gas_seed_csv.sql`(OSM 759건 클리어→Google CSV 58건, **가격 없음**·district NULL·source=GOOGLE·brand 파생). dev DB 적용 완료(58건).
  - **P2 제보+화면**: BFF `POST /info/gas/report`→submission 적재(브랜드 서버 파생), nearby/상세에 phone. 프론트 **가격 UI 전면 숨김**(공식가 배너·cheapest 정렬·가격행 제거)→전화번호 표시, 하단 "주유소 제보" CTA+시트(현재 GPS). i18n 12종×3.
  - **P3 admin**: `/admin/gas-submissions` 큐(PENDING 상단)+승인(→gas_station upsert USER_REPORTED·verified_at)/반려. nav "주유소 제보" 추가. QA용 테스트 제보 1건(submission_id=1) 삽입해둠.
  - **결정**: 가격은 화면만 숨김(백엔드 fuel_price 유지), 제보는 신규추가만. **잔여**: 시각 QA / 향후 AI 자동검증(submission.status·review_note 개방) / 정비소 동일 패턴은 미요청. dead: gas viewMap/viewList·price CSS·formatPriceFull.
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
  - **✅ 상한 체계 + 리밸런싱 (2026-06-07, dev 적용·E2E PASS)** — SoT [`economy-cap-rebalance-design.md`](../spec/economy-cap-rebalance-design.md). 앵커: 커피≈30일(액티브 3슬롯)·RP예산 월100만원.
    - 구현: RP단가 7→6(`ride.py`) / 가챠 GP인하 BASIC 150·PREMIUM 1050(mig **sre049**) / 쿠폰 `monthly_quota` 200·50·100(sre049) / RP 일일캡 60·초과폐기(`xp_ledger.credit_gc`+`XpBalance.daily_gc_*`, mig **sre050**) / Lv30·SP누적12 캡(`utils.gain_exp`) / 슬롯합산 9 명문화(`quests`).
    - **보류(합의)**: 골드·마일리지 일일캡 — 무비용이라 ROI 낮음(예산은 quota가 보호).
    - **⚠️ 선재 갭 수정**: dev DB에 `levelup_reward_policy` 미존재(init/049 미적용)→레벨업 `gain_exp` 크래시 상태였음. init/049 적용함. **운영 배포 시 sre049·sre050 + init/049 + 엔진·워커 재시작 필요**.
  - **✅ 스킬 단계당 비용 1→3 SP (SGR-280, 2026-06-07 dev 적용·E2E PASS)** — SoT [`260607_skill_cost_3x_subpoints_task.md`](../task/active/260607_skill_cost_3x_subpoints_task.md). 효과 단계는 0~3 유지, 내부 저장을 **0~9 서브포인트**로 전환(단계=`//3`). 한 단계 = 3 서브칸 = 3 SP, 클릭당 1 SP 점진 투자. SP 적립 1/레벨 유지·**누적 상한 12→36**(`MAX_SKILL_PT_TOTAL`). 프론트 SkillTree는 3단계×3서브칸 시각화. 기존 단계값 ×3 보존(`init/072`).
    - 소비처 전부 `//3` 환산: `utils.resolve_reward_pct`(EXP/Gold)·`skill_cost_discount_pct`·`quests._item_slot_bonus`(슬롯 단계3 = `>=9`)·프론트 `rewards.ts`. invest 캡 `>=9`.
    - **⚠️ 운영 배포 시**: `init/072` 적용(CHECK 0..9 재설정 + 기존값 ×3) + BFF 재시작. 엔진 무관.
- (없음) — **SGR-220 개발→운영 1차 배포 + SOP 완료** (운영 `https://letantonsheriff.com` 가동). 이력은 [`history.md`](history.md) 2026-06-04, runbook `task/active/260604_deploy_prod_task.md`.
  - **배포 후속(backlog)**: ① **SGR-227** init 스키마 베이스라인 결함(fresh DB 빌드 불가 — dump-restore 우회 중) ② FCM firebase json 마운트(푸시 활성화) ③ official/grand-opening.jpg 1건(saigon.doil.me 복구 시) ④ 전용 도메인 구매 시 마이그레이션(규칙은 runbook §도메인 마이그레이션)

## 활성 — 검증 대기 (🔧)

- **info 탭 정비리뷰·주유대기 RP 전환 + 리뷰 조회 화면 (2026-06-08, 커밋 `94d71ec`)** — 코드 DONE, **시각검증 대기**.
  - **🔑 근본버그(전 영역 영향)**: info 모듈 `_earn_gp_safe`가 `engine_client.post_event`를 잘못된 인자명(`user_id=`/`isoformat()`/`idempotency_key=` ↔ 실제 `user_uuid=`/`datetime`/`idem_key=`)으로 호출 → 매 호출 TypeError가 `contextlib.suppress`에 삼켜져 **info 리워드 이벤트가 엔진에 한 번도 전송된 적 없었음**(repair/gas/flood 전부 GP·RP 0 적립). repair/gas/flood 교정(weather는 원래 정상). → 이제 침수/주유 제보·정비 리뷰 보상이 실제 발동.
  - **정비 리뷰 XP→RP**: 마이그 **sre051**(INFO_REPAIR_REVIEW/PHOTO/PRICE `base_xp→0`, `rp_grant→50/10/10`). RP=gc_balance, 일일캡 60(=리뷰50+사진10, 가격분 폐기). UI XP→RP(ko/en/vi), 응답키 `rp_earned`. 종단검증: 엔진 발행→`gc_balance 0→50` 확인.
  - **차종**: 고정 select→자유입력+localStorage(`sgr.repair.lastVehicle`) 최근값. **사진 +10 RP는 실제 미적립**(토글만 있고 실업로드 없어 `photo_url` 미전송 → INFO_REPAIR_PHOTO 미발동). 실첨부는 별도(침수처럼 `/contents/upload`).
  - **리뷰 등록 정직화**: 실패 시 가짜 성공(setDone) 제거→에러 토스트.
  - **주유 대기 제보 화면 신규**: `WaitReportSheet`(혼잡도 3단계 여유/보통/혼잡 → 기존 `wait_minutes` 0/5/15 매핑, 인프라 재사용). 보상 RP 전환(마이그 **sre052**, +5). **신선도 윈도우 90→30분**(nearby 집계+어뷰징가드+expires_at) + 카드 'N분 전' 표기.
  - **정비소 전체 리뷰 화면 신규**: `/info/repair/:id/reviews`(InfoRepairReviews) + BFF `GET /{shop_id}/reviews`(페이지네이션, offset clamp) + 상세 '전체 보기' 링크. 상세 `reviewer_name→reviewer_nickname` alias 정합(리뷰어명 익명표시 버그 교정).
  - **FAB**: 정보 탭 활성화(시즌패스만 비활성).
  - **⚠️ 잔여**: ① 시각검증(브라우저: 리뷰 등록→RP↑, 혼잡도 제보, 전체 리뷰) ② 마이그 sre051/sre052는 dev 적용·엔진 재시작 완료, **운영 배포 시 적용+엔진 재시작 필요** ③ 사진 실첨부 미구현 ④ push 미실행.

- **SGR-274 DM 푸시 알림 + 알림 클릭 → 해당 DM 딥링크** — 코드 DONE(P1~P5), **실기기 시각검증 + FCM 자격증명 대기**. 서브 SGR-275~279. SoT [`260607_dm_push_deeplink_task.md`](../task/active/260607_dm_push_deeplink_task.md), Notion `3783bd6b-405d-8163…`.
  - **연결고리 5곳**: DM 기능·FCM 인프라는 완비됐으나 미연결이었음 → ① BFF `dm.py send_message`가 수신자(`_other_user_id`)에 푸시 트리거(try/except로 흡수, DM 전송 우선) ② engine `POST /v1/push/notify`(service-key, external_uuid→`device_user_map.fcm_token` 해석, 토큰無=no-op 200, `send_push(log_history=False)`로 admin 이력 미오염) ③ `engine_client.notify_user_push` ④ 웹 `LinkRouter` `dm` 케이스 + `NotificationBridge`(BrowserRouter 내 상주, `onNotificationClick`→`/link?action=dm&id=<conv>` + 콜드스타트 `getPendingNotification` drain) ⑤ native: iOS `FcmPlugin.getPendingNotification`(콜드스타트 `pendingPushPayload` 소비) + Android `FcmPlugin.java` 신규(jsName "Fcm", emit/setPending) · `MyFirebaseMessagingService`가 data `navigateTo`를 Intent extra로 · `MainActivity` onCreate(콜드)/onNewIntent(웜) 분기.
  - **딥링크 규약**: `data.navigateTo="dm&id=<conv_id>"` → `/link?action=dm&id=<conv_id>` → `/dm/<conv_id>`. 기존 quest 컨벤션 동일.
  - **검증 완료**: ruff/eslint/tsc 0, frontend vite build·BFF·engine 기동 클린, `/v1/push/notify` 단위(토큰有=발송시도/無=no-op/키無=401), BFF→engine `notify_user_push` 종단 배선.
  - **⚠️ 잔여 의존**: ① **실기기 클릭→DM 이동**(iOS/Android, 빌드머신 Mac 대기. native는 각 origin main 직접 push) ② **실제 FCM 전달**: ✅정정(2026-06-17) — `engine/firebase-credentials.json` 유효한 서비스계정(project saigon-rider-af3c9) 마운트됨 + `device_user_map` 토큰 6개 존재 + `fcm_push.send_push`(HTTP v1 JWT→OAuth) 구현. **과거 "401 미인가"는 자격증명 없던 시절 메모로 stale**. 현재 푸시 경로 동작 가능(실기기 토큰 대상 전달은 미검증). ③ 웹 라우팅 브라우저 시각확인.
- **SGR-271 퀘스트 수행 인터페이스 RideNav 완전 이관** — 코드 DONE, **실기기 시각검증 대기**. 부모 SGR-242. 발견: 엔진 검증·보상은 **이미 완결**(네이티브 bg GPS→`/v1/sreMessage`→Redis→GpsAgent→`quest_tracker.update`→validators→`quest_completed`→BFF `/internal/quest-card-completed` 멱등 지급). 실작업=프론트 배선 교체.
  - RideNav `type=quest`을 `useRideStore`(서버 폴링값) 기반으로 재배선: 진행도(distance=서버 `current_distance_m`/target, checkpoint=`distance_to_target_m`)·완료(`reachedTarget`=서버 status COMPLETED, 두 타입 공통)·속도 전부 서버값. 클라 haversine 누적 제거.
  - GPS 소스 = **기존 네이티브 핑 재사용**(신규 BFF 채널 미신설). QuestDetail "수행 시작"→`/ride-nav?type=quest`. **RideActive.tsx+CSS 삭제**, `/ride/active` 라우트·AppShell hide 제거.
  - **보상 서버 권위화**: 클라 이중지급(`addExp/addGold`) 제거→완료 시 `refreshUser()`로 잔액 동기화. 결과화면 표시는 `calculateRewards`(display 전용) 유지.
  - 잔여: ① 실기기 시각검증 ② `RideResultFail` 진입점 고아(라우트만 잔존, 보존) ③ `refreshUser`가 워커 비동기 지급보다 빠를 수 있음(자가치유). `tsc -b` 0·eslint 에러 0.
  - **이동경로(trail) 시각화 추가(2026-06-05)**: BFF `GET /quests/ride-trail`(engine `/v1/admin/stream/messages?type=gps&uuid=` 재사용)로 서버 수신 GPS 궤적을 RideNav `MapCanvas`에 시안색 폴리라인 표시. FE 3초 폴링(`native.getDeviceUUID()` 기반).
  - **⚠️ DEBUG 임시조치 — 복구 필요**: RideNav quest origin 의 HCMC D1 폴백을 비활성화함(`resolveOrigin()`→`native.getLocation()` 직접, 실패 시 origin=null). 코드 `DEBUG(SGR-271)` 주석. 디버그 종료 시 `resolveOrigin()`으로 되돌릴 것.
- **SGR-229 퀘스트 검증 인터페이스 추상화 (전략패턴 + 신호 기반)** — 코드 DONE(P1~P4), **✅ P5 마이그 적용 완료(2026-06-05)**. 서브 P1~P5(SGR-230~234).
  - 완료: `quest_tracker`를 Signal(GpsSignal/EventSignal) 기반 `QuestValidator` 전략 + `ValidatorRegistry` 디스패치로 리팩토링. DISTANCE/CHECKPOINT → `quest_validators/{distance,checkpoint}.py`. 목표 파라미터 `criteria JSONB` 전면 이관(mig **sre043**, 타입별 컬럼·CHECK 제약 제거). BFF `start_ride`/`engine_client`/프론트 `ActiveCardState`까지 criteria 배선. `dispatch_event()` 이벤트 진입점 시드(구체 타입은 제품 요구 시). SoT `task/active/260604_quest_validation_strategy_task.md`, Notion `3753bd6b...`.
- **✅ RESOLVED(SGR-228/229 dev 마이그 미적용 — SGR-271 테스트 중 발견 2026-06-05)**: dev DB가 sre039 고정 + 엔진 코드는 신버전 → 코드↔스키마 불일치로 퀘스트 카드 생성 **502**(`criteria` 컬럼 없음) + 가챠/상점 깨짐(엔진이 4-arg `pull_gacha`/`purchase_shop_item` 호출하나 DB는 sre035 3-arg). **`alembic upgrade head` 로 sre039→sre046 전체 적용**(040·041 reprice / 042 mileage / 043 criteria / 044 levelup / 045 skill discount / 046 item rebalance). **마이그 결함 수정**: `045`/`046` 의 `op.execute`/`exec_driver_sql` 가 한 호출에 다중 SQL문(DROP;CREATE, 다중 UPDATE) → asyncpg `cannot insert multiple commands into a prepared statement`. 문장 단위로 분리 실행하도록 수정(SQL 본문 불변). 엔진 재시작 불필요(신규 enum 값 없음). → **SGR-229 P5 해소 + 502/TS-3/TS-5(가챠·상점) 동시 해소**.
    - **⚠️ 후속(2026-06-05)**: 마이그 후 `saigon_worker`(GPS 소비자)가 구 모델로 드롭된 `target_distance_m`를 조회 → quest_tracker가 모든 핑에서 죽어 **이동거리 측정이 멈춰 있었음**. 워커는 자동 reload 없음 → `docker restart saigon_worker`로 해소(거리 누적 재개 확인). 모델/스키마 마이그 시 워커 재시작 필수.
  - 이전 `040`/`041` `required_rp`→`required_xp` 교정 + levelup 마이그 ID 충돌(sre044 재번호)은 2026-06-04 처리분.

## 부분 점검 (🟡)

- F-03-1 닉네임 1자 IME 이슈 — 재빌드 후 재점검 필요
- **✅ SGR-285 회원가입 Android 버그 (F-03) — 해결 (2026-06-08)**. 사용자 제약 준수: Android 조치가 iOS 무영향.
  - ① **F-03-IME 전역 한글 밀림(블로커, 진짜 원인)**: Capacitor **`captureInput=true`** → `CapacitorWebView.onCreateInputConnection` 이 조합 미지원 `BaseInputConnection(this,false)` 반환 → **모든 입력창** 한글 조합 깨짐. React/controlled 무관(그래서 프론트 우회 전부 무효였음). **모바일 Chrome 정상 = 앱 WebView 설정 문제로 격리**. 해결 = **`captureInput=false`**: MainActivity CapConfig **+ `android/.../assets/capacitor.config.json`(WebView 실제 로드 파일 — cap sync 미실행으로 true 잔존했던 게 막판 핵심)** + `capacitor.config.ts`. → [[project_capacitor_captureinput_breaks_ime]]
  - ② **F-03-KBD 입력창 압축**: 키보드 무관 CSS — `.nickField`/`.styleCard` flex 자식 기본 `flex-shrink:1` 눌림 → **`flex-shrink:0`**(web). 보조 native `windowSoftInputMode=adjustPan`.
  - ③ **F-03-NICK 공백 닉네임**: 가입 시점 랜덤 닉네임 기본 부여(`auth.register`)+login/재가입 self-heal(`utils.generate_random_nickname`, UNIQUE 회피). 건너뛰기는 랜덤 유지.
  - 헛다리(원복됨): ProfileSetup uncontrolled+리스너/state-free, interactive-widget 런타임/정적 — IME엔 무효(captureInput이 원인이라). **교훈: 모바일 Chrome vs 앱 WebView 비교로 React vs WebView-config 를 먼저 격리**할 것.
  - 푸시: android `1d5a01f`(captureInput·adjustPan), primary `dbe8b30`. CSS/닉네임/다크모드숨김은 web 반영.
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
| B-4 | 아이폰 알림서비스 클릭시 페이지 이동 | 코드DONE·검증대기 | SGR-274. iOS FcmPlugin navigateTo 포워딩(실행중)+콜드스타트 getPendingNotification. 실기기 대기 |
| B-5 | 안드로이드 알림서비스 클릭시 페이지 이동 | 코드DONE·검증대기 | SGR-274. Android FcmPlugin.java 신규+Intent extra+onNewIntent. 실기기 대기 |
| B-6 | 앱푸시연동 | **진행중** | DM 푸시(SGR-274) 연동됨. 미열람개수는 기존 badge(Redis incr_badge, 999 cap)·DM unread_count 별개. 1000→999 캡 잔여 |
