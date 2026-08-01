# 서비스 오픈 가부 판정 — 기능/서비스 관점 전면 검토 (코드 기준)

> 작성일: 2026-07-31
> **판정: 전면 오픈 불가 (HOLD). 범위 축소 오픈만 현실적.**
> **기준 커밋: `c8bc67c` (2026-07-28, origin/main 최신)**
> 방법: 6개 영역 병렬 독립 감사 → **27커밋 최신화 후 5개 영역 재검증** + 감독이 충돌 지점 직접 검증
> **역할 분담**: 이 문서는 **저장소 코드 기준** 판정 SoT. **실배포면·시크릿·실행검증**은 [`260731_prelaunch_go_no_go_audit.md`](./260731_prelaunch_go_no_go_audit.md) 참조 — 두 문서는 경쟁이 아니라 상호보완이며, 그쪽에만 있는 P0가 §6에 있다.
> 선행 감사: [`260722_service_user_full_launch_audit_task.md`](./260722_service_user_full_launch_audit_task.md) · [`260722_audit_applied_summary.md`](./260722_audit_applied_summary.md)

---

## 0. 결론

코드 성숙도가 낮아서가 아니다. **핵심 로직(거래 무결성·보상 멱등·게이트·OAuth)은 실제로 견고한데, 서비스를 서비스로 성립시키는 껍데기가 비어 있다.**

| 감사 영역 | 1차 판정 | **재검증(`c8bc67c`)** | 결정적 사유 |
|---|---|---|---|
| 마켓 거래 여정 | NO | **NO 유지** | 판매자가 자기 매물을 수정·삭제할 수 없음 (27커밋이 마켓 코어 무변경) |
| 인증·법무 | NO | **NO 유지** | 동의 기록 0건 / 방침-동작 불일치 (7건 전부 미해결) |
| RP·라이딩 경제 | NO | **NO 유지** | 재화 획득만 살아있고 소비처 0개 (`main.py` diff 0줄) |
| 운영 준비도 | NO | **NO 유지** | 백업·신고알림·에러트래킹 부재, migration 공백 잔존 |
| P0 적대적 반증 | 부분 실패 | **부분 실패 유지** | 무인증 IDOR 5건 전부 그대로 |
| 지도·업체 | NO | **NO 유지(내용 변화 큼)** | 역할 중복은 해소됐으나 업체를 채울 수단이 코드에 없음 |

---

## 1. ⚠️ 이 문서의 평가 이력 — stale 기준으로 평가했다가 정정한 경위

**최초 평가는 `3d5d28a`(7/25) 기준이었고, 그 시점 로컬은 origin/main보다 27커밋 뒤처져 있었다**(119파일 +12,678/-3,308). 대표 지적으로 발견해 `c8bc67c`로 최신화 후 5개 영역을 재검증했다. **판정 자체는 전부 유지됐으나 지도·업체 영역은 내용이 크게 바뀌었고, 새 결함 6건이 추가로 드러났다.**

교훈으로 남긴다: **감사 착수 전 `git fetch` + `main..origin/main` 확인은 필수 절차다.**

### 1.1 선행 감사 문서에 대한 정정 (오탐 3건, 재검증에서도 유지)

1. **"운영 DB에 `[DEV]` 가짜 매물이 노출된다" → 오탐.**
   `085_marketplace_seed.sql:48`·`087_marketplace_seed_districts.sql:52` 는 `seed_profile` 가드는 없지만 `WHERE EXISTS (SELECT 1 FROM users WHERE users.id = seed.seller_id)` 로 막혀 있다. 하드코딩 seller UUID `a4681186…` 를 생성하는 init 파일은 **존재하지 않는다**(`database/init` 전체 grep 1건 = 087 자신). fresh 운영 DB에서는 0행.
   **단 조건부**: 현 운영 DB는 fresh init 이 아니라 **dev 덤프 복원본**이므로(§4-S6) 실제 서버에는 dev 데이터가 잔존할 수 있다 — 서버 확인 필요.
2. **"네이티브 프로젝트가 없다(파일 0개)" → 오탐.** `native/ios`·`native/android` 는 별도 GitHub 레포 서브모듈(`saigon-rider-ios`, `saigon-rider-android`)이며 커밋 해시가 잡혀 있다. **"부재"가 아니라 "미클론 = 검증 불가"**.
3. **`ai-docs/context/project_todo.md:12-32` "[DBG] 버튼 → 정식 트리거" 항목은 stale.** 프론트 전체에 DBG 흔적 0건. 실제 흐름은 `QuestDetail.handleStartRide` → `user_quests.py:44-93` start-ride → `internal.py:184-226` 웹훅 자동완료로 **이미 정식 배선**.

---

## 2. 27커밋(`3d5d28a`→`c8bc67c`)으로 실제 개선된 것

재작업 금지 대상이다.

| 개선 | 근거 | 효과 |
|---|---|---|
| **동네지도 역할 중복 해소** — 매물·피드 레이어 제거(`api/map.ts` -80줄), **마켓=매물 / 지도=업체 / 커뮤니티=피드** 배타 분리 | `frontend/src/components/TabBar.tsx:54-56` | 1차 감사의 "탭 간 중복" 지적 해소 |
| 지역 선택 시트 신설 | `NeighborhoodMap.tsx:120-135,283` | 지역 선택 수단 부재 해소 |
| 업체 카드 리치화 + 집계(평점·리뷰·단골·최신소식) | `BizRichCard.tsx`, `biz.py:890-914` | 카드 빈약 해소 |
| **`bff_migrate` 150~156 등록** (150~154보다 넓게 확장) | `docker-compose.yml:82-118` | 149 이후 신규분의 기존 볼륨 미적용 문제 해소 |
| **OTP dev 우회 3중 게이트 — 운영 우회 불가** | `docker-compose.prod.yml:37-41`(빈값 강제 override) + `auth.py:838-839`(`_DEV_MODE` fail-safe 화이트리스트) + `auth.py:849` | 운영에서 플래그를 켜도 뚫리지 않음. `.env.example:125` 키 쌍 일치 |
| 신규 biz API 전부 가드 정상 | 소식 `biz.py:1067-1112`·가격표 `:1141-1188`·광고성과 `:430-436,536-542`·단골 `:1304-1420` 모두 세션 + `_get_own_profile` 오너십. 공개 API는 `status != "APPROVED"` → 404 | **27커밋은 새 인증 결함을 만들지 않았다** |

---

## 3. 기능 관점 — 코드가 없거나 틀린 것 (전부 미해결)

### 3.1 보안 — 즉시 차단 (선행 감사의 "P0 전부 닫힘" 주장이 깨진 지점)

| ID | 결함 | 근거(`c8bc67c`) | 공격/피해 |
|---|---|---|---|
| **F-1** | `GET /api/users/search` 세션 의존성 없음 + `User.phone.ilike('%q%')` 부분일치 + `deleted_at` 필터 없음 | `backend/app/routers/users.py:354-375`(쿼리 `:364`) | 인증 없이 가입자 열거·번호 존재 확인. **탈퇴 계정까지 노출**. 획득 UUID가 F-3·F-4의 입력 |
| **F-2** | `GET /api/quests/ride-trail` 무인증 원본 GPS 궤적 최대 500점 | `quests.py:285-289` | 위치 마스킹은 피드에만. `device_uuid`는 자격증명이 아닌 단말 식별자 → 유출 시 이동경로 전량 |
| **F-3** | `GET /api/quests/active-card` — db·세션 의존성 자체가 없음 | `quests.py:276-277` | 임의 `user_quest_id` 로 퀘스트 상태 조회 |
| **F-4** | `follows.py` GET 4종 무인증 + 헤더 `x_user_id` 원시 신뢰. **같은 파일 POST/DELETE(`:58,:85`)는 세션을 요구 — GET만 비대칭으로 열림** | `follows.py:28-35,97-127,129-159,161-173,175+` | 소셜 그래프 전량 스크레이핑 |
| **F-5** | `GET /api/users/{id}/profile` 세션 없음 + `requester_id` 쿼리를 뷰어로 신뢰 + `deleted_at` 필터 없음 | `users.py:315-324,333`(쿼리 `:320`) | 익명화된 `del_<hex>` 계정도 200 반환 |

### 3.2 사용자 자기서비스 부재 (27커밋 무변경 — 마켓 코어 미수정)

| ID | 결함 | 근거 | 사용자 체감 |
|---|---|---|---|
| **F-6** | **매물 본문(제목/설명/사진/카테고리) 수정 API 없음** — 라우트 27개 전수 확인, PATCH는 `/status`·`/price`뿐 | `market.py:574,605` / `App.tsx:387-392` 에 편집 라우트 없음 | 오타·잘못된 사진 = 재작성 불가 → 중복 매물 누적 |
| **F-7** | **매물 삭제·철회 없음** — DELETE는 `/users/{id}/block`·`/keyword-alerts/{id}`뿐. 판매자 선택지 `['ON_SALE','RESERVED']`, 관리자 모더레이션 매물은 판매자가 되돌릴 수도 없음 | `MarketDetail.tsx:42`, `market.py:594-596` | 판매 포기해도 영구히 피드에 잔존. 유일한 우회로가 CS(앱 내 경로 없음) |
| **F-8** | 사진 교체 경로 원천 부재 (F-6 파생) | 업로드 UI가 `MarketCreate.tsx` 에만 존재 | — |

### 3.3 법적 요건

| ID | 결함 | 근거 | 리스크 |
|---|---|---|---|
| **F-9** | **가입 시 약관·개인정보 동의를 캡처하지 않음** — User 모델에 consent/terms_version/agreed_at 0건, 약관 문구는 클릭 불가 장식 span | `backend/app/models.py:123-158`, `frontend/src/pages/auth/OAuthLogin.tsx:307-313` | 베트남 Nghị định 13/2023 Đ11 "증빙 가능한 동의 기록" 부재 |
| **F-10** | **공표 정책과 실제 동작 불일치** — 방침은 "30일 내 영구삭제", 실제는 `deleted_at`/phone/nickname/passcode_hash만 익명화. **`backend/app/jobs/` 5개 잡 중 파기 배치 0건**. RideSession·UserQuest·UserBadge 는 FK로 무기한 잔존 | `locales/*/translation.json:1438` ↔ `users.py:229-247` | 소비자 기만 소지 |

### 3.4 안전 정보의 거짓말

| ID | 결함 | 근거 | 피해 |
|---|---|---|---|
| **F-11** | **침수 예측 fail-open** — 비200/예외를 `0.0`으로 삼키고 `DELETE FROM flood_risk_daily` 무조건 실행. **UI는 그 상태를 초록 ShieldCheck "안전"으로 렌더** | `backend/app/jobs/predict_flood_risk.py:37,42,83,88` → `frontend/src/pages/info/InfoFloodMap.tsx:378` | 폭우 중 "침수 위험 없음". 안전 기능의 fail-open 은 기능 부재보다 나쁘다 |

### 3.5 장애를 콘텐츠 부재로 위장

| ID | 결함 | 근거 |
|---|---|---|
| **F-12** | 매물 목록·검색 실패를 조용히 삼켜 "매물 없음"으로 렌더, 재시도 도선 없음 | `frontend/src/hooks/useInfiniteScroll.ts:55-56` |
| **F-13** | 홈 위젯이 실패를 빈 배열로 표시 — 같은 파일의 날씨·침수는 `unavailable` 로 구분해 **기준이 갈림** | `WorldMapV2.tsx` |
| **F-14** | 지도 자산 로드 실패 완전 무음(신규 city-outline 포함) — 도로·건물 없는 흰 지도가 정상처럼 보임 | `SaigonMapV5.tsx:363,551,568` |

### 3.6 운영 안전망

| ID | 결함 | 근거 | 영향 |
|---|---|---|---|
| **F-15** | **DB fresh-init SGR-227 무변경** — 27커밋이 이 이슈에 손댄 적 없음. 정적으로는 `010_master_tables.sql:75-78` 이 `014` 보다 먼저 `rider_type_id` 를 추가하나, **Docker 미가용으로 실제 순차실행 미검증** | `init/010`,`init/014` | 재해복구 경로 신뢰 불가 — 실행 검증 필요 |
| **F-16** | **백업 스크립트 0건** — `tools/`·`deploy/`·`docker-compose*.yml` 어디에도 pg_dump/cron 없음 | 부재 | F-15와 결합 시 **볼륨 유실 = 복구 불능** |
| **F-17** | **신고 접수 시 운영자 알림 없음** — report 엔드포인트는 DB insert + commit 만, 이벤트 미발행. `noti_worker` 핸들러 5종(dm_message/listing_created/biz_profile_reviewed/biz_ad_reviewed/support_replied)에 **report 핸들러 없음** | `users.py:382` 외, `noti_worker/__main__.py` | 사기·성희롱 신고가 와도 수동 폴링 전까지 아무도 모름 |
| **F-18** | **에러 트래킹 0건** — requirements.txt·package.json에 sentry 없음(설계 문서에만 존재) | 부재 | 장애 인지 수단이 로그 직접 열람뿐 |
| **F-19** | 강제 업데이트 미배선 — `isForceUpdate` 가 `Settings.tsx:15,31,35` 표시용으로만 소비, `App.tsx` 에 차단 로직 없음 | `appVersion.ts:35,61` | 치명 버그 배포 후 구버전 차단 불가 |
| **F-20** | **`bff_migrate` 139~147 공백 잔존** — 150~156은 등록됐으나 139/140/141/142/143/144/147 없음. 147은 "멱등성 미확인 보류"로 명시, 139~144는 언급조차 없음 | `docker-compose.yml:82-106` | 기존 볼륨에 거래무결성(140)·신고(144) 등 미적용 |
| **F-21** | DLQ 조회 UI/API 부재(격리는 구현됨) | `engine/app/workers/__main__.py`, `noti_worker/__main__.py` | 쌓여도 보이지 않음 |

---

## 4. 서비스 관점 — 돌아가지만 서비스가 성립하지 않는 것

### S-1. RP 경제가 순환하지 않는다 (27커밋 동안 `main.py` diff **0줄**)

- **획득 살아있음**: 5km당 RP+30·Gold+20(`054_mileage_rewards_rp_gold.py`), 1km당 EXP+10(`021`), 퀘스트 완료 웹훅(`internal.py`) — 셋 다 무변경.
- **소비처 0개**: shop/gacha/inventory/season 주석(`backend/app/main.py:182-186`), 쿠폰 라우터 미등록, COFFEE_COUPON 비활성(`062_disable_internal_coupon_catalog.py`) — 전부 무변경.
- **무용한 잔액이 핵심 화면에 상시 노출**: `WorldMapV2.tsx:281,306-308`, `ProfileMain.tsx:104-105,347-354,749-822` (홈 개편 `9efbe23` 후에도 유지).
- 랭킹/리더보드 라우트 **0건**(유일 매치는 랜딩 정적 목업).

### S-2. 동네지도가 빈 채로 시작한다 — **위험이 분산에서 집중으로 이동**

- 어드민에 **업체 생성 POST 없음**(approve/reject/suspend/verify뿐, `admin_api/biz.py:315,339,375,440`). 유일 유입은 유저 자가신청(`biz.py:128`). `backend/scripts/` 에 업체 시드 없음.
- 가게소식·가격표·단골은 **기존 업체를 풍부하게 할 뿐 0건을 못 채운다.**
- 27커밋으로 지도가 `GET /biz/public/map`(`biz.py:856`) **단일 소스**에 의존하게 되어, 빈 화면 리스크가 **집중**됐다.

### S-3. 서비스 경계 14.4km × 14.5km (37개 동) — 차단점이 5곳으로 증가

`serviceArea.ts:38` 그대로. `saigon-depth1.json` 은 27커밋 동안 **무변경**. 차단점: `api/market.ts:437`, `api/master.ts:87`, `RideNav.tsx:265`, `LocationPickerSheet.tsx:56`, `MarkerLocationPicker.tsx:72`. `map/districts.py:24` 주석이 "판정은 여전히 depth1 37워드 기준"이라 자인.
→ Thủ Đức 대부분·Bình Chánh·Q.12·Bình Tân 등 거주자는 **매물 등록도 라이드도 불가**.

### S-4. 행정구역이 **삼중 체계**로 악화

지도 폴리곤 37동(`saigon-depth1.json`) / `wards` 테이블 168동 목표(`backend/scripts/ward_import.py:16`) / city-outline은 레거시 `districts.boundary`(`map/districts.py:36`). `seed_dummy_market.py:6` 이 "지도 SVG 37개와 범위가 달라"라고 자인.
→ 카드에 뜬 동이 지도에 존재하지 않을 수 있다.

### S-5. "우리 동네"인데 전역 조회 + 거리 정렬 없음

`NeighborhoodMap.tsx:41,99` HCMC_BBOX 78×65km 기본, 정렬은 `biz.py:884` `id.asc()`. 거리는 계산·표기만(`:257`) → "우리 동네" 밑에 40km 밖 가게가 상단.

### S-6. 운영 인스턴스가 2026-06-04 스냅샷에 정지

거래무결성(140)·T&S/신고(126~131,144)·알림 아웃박스(145/146)·비즈파트너(113~116) 등 두 달치 미배포. F-20의 migration 공백과 결합. **지금 배포하는 행위 자체가 순서 누락 위험이 큰 이벤트다.**

### S-7. 외부 키 하나가 가입·판매를 통째로 막는다

`APP_ENV=production` + `SMS_PROVIDER_API_KEY` 미설정 → `RuntimeError` → 502 **전면 차단**(`sms_client.py:41-43`). dev bypass로도 우회되지 않음(운영 3중 게이트). `VerifiedSellerRoute` 우회 수단 없음 → **판매 등록 전면 차단**. 실값은 저장소에서 확인 불가.

---

## 5. 27커밋이 새로 만들었거나 드러낸 결함

| ID | 결함 | 근거 | 영향 |
|---|---|---|---|
| **N-1** | **`wards` 테이블을 채우는 INSERT가 `database/init/` 어디에도 없다**(수동 `ward_import.py` 뿐) | `biz.py:823-849` 가 `wards` 최근접 센터로 ward chip 생성 | 신규 배포 시 `_ward_map` 빈 dict → **`031009e` 가 추가한 ward chip이 영구 미표시** |
| **N-2** | 업체 **100건 천장** — size≤100 + `id.asc()` 정렬, 프론트 `BIZ_MAX_ITEMS=100` | `biz.py:864-884`, `NeighborhoodMap.tsx:42` | 101번째 업체부터 위치·최신순 무관하게 **영구 미노출** |
| **N-3** | **광고 퍼널 전체가 dead code** — `ADS_ENABLED = false` 프론트 하드코딩(env 아님)인데 티어·가격·등록·성과 대시보드·`ad_events`/`ad_daily_stats` 테이블 전부 구축 | `frontend/src/lib/adPlacement.ts:18`, 게이트 지점 `MarketMain.tsx:335`·`WorldMapV2.tsx:362,370,446`·`BizPublic.tsx:432` | **업체가 결제해도 노출 지면이 없다.** 단 사업자 신청·승인·구독활성 경로는 게이트 밖이라 열려 있음 |
| **N-4** | **결제 수단 미구현** — `create_ad()` 가 `subscription_status="pending_payment"`, `activate_subscription()` 주석이 "월구독 **오프라인 입금확인** 후 admin 이 게시 활성". PG/IAP 코드 0건(momo·vnpay·zalopay·stripe·payos 등 전체 grep 무매치) | `backend/app/modules/ads/application.py:203,427-436` | 수익모델이 수동 정산 전제 |
| **N-5** | **위치 SoT 반쪽 단일화** — 리스트는 로컬 state(`NeighborhoodMap.tsx:71-72`, 주석 `:32-34` "전역 건드리면 회귀"), 캔버스는 전역(`NeighborhoodMapCanvas.tsx:709,923`) | 동상동명 | 같은 화면 두 뷰의 지역 불일치. **지도에서 동을 고르면 홈·날씨·주유소·정비소까지 몰래 바뀐다** |
| **N-6** | 소식 등록에 APPROVED 미검사 — 소유권만 확인 | `biz.py:1074-1080` | PENDING 프로필도 작성 가능(노출은 안 되니 저위험) |

---

## 6. 다른 감사 문서에만 있는 P0 — 실배포면·시크릿 (이 문서로는 확인 불가)

[`260731_prelaunch_go_no_go_audit.md`](./260731_prelaunch_go_no_go_audit.md) 가 `app.saigon-rider.com` 실배포면을 비파괴 확인해 잡은 것. **이 문서(코드 기준)로는 재현할 수 없으므로 그대로 인용한다.**

| 게이트 | 상태 | 내용 |
|---|---|---|
| Engine 긴급 차단 | FAIL | 공개 특권 경로 노출, 전역 키 회전·identity 분리 필요 |
| Secret 대응 | FAIL | **Zalo secret 폐기·재발급, Git 이력·artifact·로그 감사 필요** |
| 정확한 배포 | FAIL | readiness 404, 배포 drift, CORS·보안헤더, 운영 endpoint 노출 |
| 자동 회귀 | FAIL | **ESLint 2 errors / 226 warnings**, backend·engine 테스트·E2E 미실행 |

### ⚠️ 두 감사가 충돌하는 것처럼 보이는 지점과 해석

이 문서의 적대적 반증은 "Engine 전 엔드포인트에 `verify_service_key` 가 걸려 도달 불가"(`engine/app/routers/gacha.py:21,29,42,53,66`)로 **코드상 안전**을 확인했다. 반면 실배포면 감사는 **특권 경로 공개 노출**을 관측했다.
→ **둘 다 참일 가능성이 높다.** 실배포는 2026-06-04 스냅샷이라 그 시점 코드엔 가드가 없었을 수 있다. 즉 이 충돌 자체가 S-6(운영 두 달 정지)의 증거이며, 실체는 **"코드는 고쳐졌으나 사용자가 쓰는 것은 안 고쳐졌다"**이다. **배포 후 재확인 필수.**

---

## 7. 실제로 견고한 것 (적대적 반증에서도 깨지지 않음)

재작업 금지 대상이다.

- **거래 무결성**: `_load_appointment`(`market.py:1126-1129`)가 accept/complete/cancel 전부에서 listing 을 `FOR UPDATE` 로 잠그고 재검사. `140_marketplace_trade_integrity.sql` 의 부분 유니크 `uq_mp_appointment_active_per_listing WHERE status='ACCEPTED'` 가 DB 레벨 backstop. 수동 SOLD 전이 400 거부(`market.py:583-585`), 합의가 `agreed_price_vnd` 스냅샷, 제3자는 `require_participant` + 교차검증 차단.
- **보상 멱등(이중지급 방향)**: Engine 이 `PolicyActionGrant` 유니크 키를 **BFF 호출 전에** 선점(`engine/app/services/policy_engine.py:113-125`), BFF 는 `InternalRewardGrant` 유니크로 독립 멱등(`internal.py:47-53`). 퀘스트는 `jobs/retry_quest_rewards.py` 스윕.
- **게이미피케이션 게이트 실효성**: BFF 미등록(404) + Engine `verify_service_key` + 프론트 라우트/GameHub/LinkRouter 진입점 제거 → 코드상 우회 경로 없음.
- **OAuth 3종**: PKCE·CSRF state·JWKS 서명검증(`auth.py:464-802`), 설정 누락 시 fail-safe.
- **OTP 운영 3중 게이트**(§2) 및 어뷰징 방어(쿨다운 60초·시간당 5회·시도 5회, `auth.py:254-257`).
- **세션 만료·정지 처리**: 419/403 전역 핸들러(`api/client.ts:164-198`) → `/splash`·`/suspended`, 무한로딩 없음.
- **구매자 여정 전 구간 정상 배선**: 목록→상세→찜→DM→가격제안→약속→완료→후기(`market.py:1036-1414`, `DmDetail.tsx:405-494`). 검색·필터는 실제 서버 쿼리(로컬 위장 아님).
- **안전정보 POI 실데이터**: 주유소 538건(`051`,`074`,`075`), 정비소 750건(`052`,`077`,`078`) — Google `place_id`·실주소·실전화. 날씨(OpenWeather)·유가(Petrolimex 수집)도 실데이터.
- **지도 성능 설계**: depth3 는 `vb.w < 7%`(~1km)에서 뷰포트 내 동만 로드, 목록우선 진입은 `lightweight` 로 depth3 미수신 → 자산 5.56MB/74파일이 한꺼번에 내려가지 않음.
- **GPS 를 첫 화면에 요구하지 않음**: 권한 거부해도 홈 정상 동작.

---

## 8. 권고 — 범위를 잘라 여는 것이 유일하게 현실적

### 8.1 오픈 범위에서 제외

| 대상 | 사유 |
|---|---|
| 라이딩·RP·퀘스트 전체 | S-1 재화 sink 0. **재화 UI(홈·프로필)도 함께 내려야** 모순이 보이지 않음 |
| 동네지도(업체 디렉터리) | S-2 업체 0건 + 유입 수단 부재. N-1(ward chip 미표시)·N-2(100건 천장) 동반 |
| 광고 상품 판매 | N-3 노출 지면 OFF + N-4 결제 미구현 — 파는 쪽만 열려 있음 |
| (이미 OFF 유지) 가챠·상점·인벤토리·시즌·쿠폰·차고 | 게이트 실효성 확인됨. 재오픈 시 EG-2~5 선수정 필요 |

→ 남는 후보: **마켓(중고거래) + 정보 4종 + 피드/DM**. 안전정보는 POI 실데이터 완성도가 높아 분리 오픈이 가능하나 **F-11(침수 fail-open) 선수정 필수**.

### 8.2 오픈 전 반드시 닫아야 하는 것 (권장 순서)

| 순서 | 항목 | 대응 | 규모 |
|---|---|---|---|
| ① | **F-1~F-5** 무인증 엔드포인트 | `users.py`·`quests.py`·`follows.py` 에 `verify_user_session` + 소유자 검사, `users/search` 전화번호 부분일치 제거, `deleted_at` 필터 추가 | 소 (당일) |
| ② | **§6 시크릿 대응** | Zalo secret 폐기·재발급 + Git 이력 감사 (타 감사 소관, 최우선급) | 소~중 |
| ③ | **F-6~F-8** 매물 수정·삭제 | PATCH 본문 수정 + 판매자 철회 상태 + 편집 화면 | 중 |
| ④ | **F-9·F-10** 동의 캡처 + 방침 정합 | 동의 컬럼·가입 흐름 체크박스 + 방침을 실동작에 맞추거나 하드삭제 구현 | 중 (법무 동반) |
| ⑤ | **F-11** 침수 fail-open | 부분 실패 시 기존 스냅샷 보존, 전량 성공 시에만 교체 + UI "안전" 렌더 분리 | 소 |
| ⑥ | **F-15·F-16·F-20** DB 경로 | fresh-init 실행 검증 + 139~147 공백 해소 + pg_dump 크론 | 중~대 |
| ⑦ | **F-17·F-18** 신고 알림 + 최소 에러 알림 | 운영자 채널 웹훅 수준이면 충분 | 소 |
| ⑧ | **S-6** 배포 통합 체크리스트 후 배포 → §6 실배포 항목 재확인 | 139~156 순서 검증 | 중 |
| ⑨ | **S-7** `SMS_PROVIDER_API_KEY` 실값 확인 | 운영 서버 실측 | 소 |
| ⑩ | **F-12~F-14** 오류/빈상태 분리 | `useInfiniteScroll` error 노출 + 재시도 | 소~중 |

### 8.3 제품·경영 결정이 필요한 것 (개발이 정할 수 없음)

1. **서비스 경계(S-3)** — 14km 유지 vs HCMC 전역. 넓히면 지도 자산 재생성 동반.
2. **행정구역 체계(S-4)** — 삼중 체계를 어느 기준으로 통일할 것인가(2025 개편 후 신 체계 권장).
3. **업체 데이터 시딩(S-2·N-1)** — 어드민 생성 기능을 만들 것인가, 영업으로 자가가입을 유치할 것인가. `wards` 시드는 어느 쪽이든 필요.
4. **RP 경제(S-1)** — sink 를 하나 열 것인가(제휴 필요), 재화·라이딩을 완전히 감출 것인가.
5. **광고 수익모델(N-3·N-4)** — 노출 지면을 언제 켤 것인가, 결제를 PG로 갈 것인가 수동 정산 유지인가.
6. **약관·개인정보 문안 확정** — 법무.

---

## 9. 이 검토로 확인할 수 없는 것

- Android/iOS 실기기: 권한·백그라운드 GPS·FCM·OAuth 딥링크. (`native/*` 서브모듈 미클론)
- 운영 `.env` 실값(SMS·Google Maps·Translate·OpenWeather·FCM·imgproxy).
- Docker fresh-volume bootstrap, 브라우저 E2E (이 PC에 Docker·`.env` 없음) — **F-15 정적 분석의 실행 검증 포함**.
- 운영 DB 실제 잔존 데이터(§1.1-1 조건부).
- 2026-07-25 디자인 정비(143파일) 및 27커밋 UI 변경의 **실화면 검증** — 미배포라 아무도 보지 못했다.

---

## 10. 검토 방법 기록

- 1차: 6개 영역 병렬 독립 감사(마켓 / 인증·법무 / RP경제 / 운영준비도 / **P0 적대적 반증** / 지도·안전정보).
- **2차: 27커밋 최신화 후 5개 영역 재검증** — 대표 지적("최신 pull 기준인지 확인")으로 stale 발견.
- 모델 라우팅: 커버리지 성격은 Sonnet, **판단이 결과를 바꾸는 영역(P0 반증·지도·업체)은 Opus**. 종합은 메인.
  (이 과정에서 글로벌 규칙의 "Opus 서브에이전트 금지" 조항을 대표 지시로 폐기 — 2026-07-31.)
- 감사 문서는 **주장으로만 취급**하고 현재 코드로 재검증. 에이전트 간 결론이 충돌한 지점(seed 격리)은 감독이 직접 확인해 §1.1 에 정정 기록.
- **절차 교훈**: 감사 착수 전 `git fetch` + `main..origin/main` 확인을 필수 단계로 둔다.
