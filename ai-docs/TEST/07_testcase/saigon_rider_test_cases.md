# 사이공라이더 통합 테스트 케이스 (2026-08-03)

> 대표 호치민 방문(2026-08-03) 중 실기기로 최근 작업분과 핵심 플로우를 직접 돌려보기 위한
> 수동 테스트 시트. `ai-docs/TEST/`가 이 저장소의 테스트 문서 SoT.
>
> **2026-07-31 코드 대조 검증 완료** — 모든 기대값을 실제 코드(파일:라인)와 대조해 정정했다.
> `⚠️ 미구현` 표시가 붙은 케이스는 기능 자체가 없으므로 "실제 동작"을 기대값으로 적어두었다.
> 각 케이스에 진입 라우트를 명시했다(다음 단계 Playwright 실측 입력용).

## 0. 계정 정보 — 로그인 (개발 서버 전용, OAuth 우회)

우회 엔드포인트는 `POST /auth/dev-login-as` (`backend/app/routers/auth.py:923-949`).
프론트는 부팅 시 `?dev_login=` 쿼리를 읽어 이 API를 호출하고 쿼리를 URL에서 지운다
(`frontend/src/App.tsx:312-331`).

게이팅 조건 2개를 **동시에** 만족해야 한다 (`auth.py:930`):
- `APP_ENV ∈ {development, dev, local, test}` (`auth.py:839-840`)
- 요청 `Host` 헤더(포트 제거)가 env `DEV_HOST` 와 **정확히 일치** — `DEV_HOST` 가 비어 있으면 항상 거부 (`auth.py:912-916`)

현재 dev `.env`: `APP_ENV=development`, `DEV_HOST=saigon.doil.me`.
운영은 `docker-compose.prod.yml` 이 `APP_ENV=production` / `DEV_HOST=`(빈값)을 하드코딩해 2중 차단.

```
https://saigon.doil.me/?dev_login=<user_id>
```

계정 3개는 `backend/scripts/seed_dev_test_accounts.py`로 dev DB에 시드해둔 것.
멱등(phone unique upsert)이지만 **uuid 는 스크립트 상수가 아니라 `gen_random_uuid()` DB 생성값**
(`seed_dev_test_accounts.py:55,74`)이다 — 같은 DB 안에서는 재실행해도 동일하지만,
DB를 초기화·재생성하면 아래 uuid 는 무효다. **실측 직전 스크립트를 한 번 돌려 출력된 uuid 를 쓸 것.**

| 역할 | 계정 | user_id (2026-07-31 dev DB 기준) | 접속 URL |
|---|---|---|---|
| 유저 A (마켓 판매자 역) | DevTestUser1 (phone `__dev_test_u1__`) | `e6174582-1157-4bb4-a92d-ce1e66da3cdd` | `https://saigon.doil.me/?dev_login=e6174582-1157-4bb4-a92d-ce1e66da3cdd` |
| 유저 B (마켓 구매자 역) | DevTestUser2 (phone `__dev_test_u2__`) | `d00681ec-ca0f-43bd-845e-b59da955a96f` | `https://saigon.doil.me/?dev_login=d00681ec-ca0f-43bd-845e-b59da955a96f` |
| 업체 계정 | DevTestBizOwner (phone `__dev_test_biz1__`, business_profile `status='APPROVED'`, id=`21b59a38-70ed-4d87-81d0-4c6e919c07ca`) | `2d55962f-254d-48ee-ac08-aedb090c2e4d` | `https://saigon.doil.me/?dev_login=2d55962f-254d-48ee-ac08-aedb090c2e4d` |

`status='APPROVED'` / `verification_status='verified'` 는 시드에서 실제로 넣는 값이 맞다
(`seed_dev_test_accounts.py:74`).

같은 브라우저로 계정을 바꿔가며 테스트할 땐 링크 접속 시 세션이 즉시 교체된다(로그아웃 불필요) —
`App.tsx:319-325` 가 `saveSession()` + `loginFromBackend()` 로 기존 세션을 덮어쓴다.

승인 권한 계정(관리자 승인 테스트용): 운영 admin(`.env` `ADMIN_USER`/root) 또는 `admin_accounts`.
승인 화면은 신·구 둘 다 살아 있다 — 신 SPA `/admin/biz/accounts`(`admin-frontend/src/App.tsx:153-154`),
구 서버렌더 `/admin-legacy/biz-accounts`(`backend/app/routers/admin_legacy.py:3728`).

### 0.1 시드 계정 선행 조건

**아래는 2026-07-31 dev DB 실측값이다** (코드 추론이 아니라 `psql` 직접 조회). 실측 직전 재확인 권장.

| # | 항목 | 실측 상태 | 실측에 대한 의미 |
|---|---|---|---|
| 0.1.1 | 유저 A/B/업체 전화 인증 | ✅ **3개 모두 인증됨** (`phone_verified_at IS NOT NULL`), `manner_temp` 전부 36.5 | §8 상품등록 블로커 **없음**. 단 §8.1.1(미인증 계정 차단)은 시드 계정으로 재현 불가 — 별도 미인증 계정 필요 |
| 0.1.2 | 시드 업체 프로필 (`21b59a38-…`) | ✅ `status=APPROVED`, `verification_status=verified`, `latitude=10.775600`, `longitude=106.701900`(Bến Thành Q1), `photo_content_id` 존재. ⚠️ **`category` 만 빈 값** | 좌표·사진 있으므로 **`/map` 에 정상 노출된다.** `category` 필터는 optional 이라 노출 자체는 막히지 않음(`biz.py:877-878`) — 단 카드의 업종 표기가 비고, 업종 필터 적용 시엔 빠진다 |
| 0.1.3 | 시드 업체의 가격표·소식 | ⚠️ **`business_price` 0건 / `business_news` 0건** | §1.2 가격표·§3.3~3.4 소식 노출은 **볼 데이터가 없다.** → §4.6(가격표 관리)·§7.4.2~7.4.3(등록)을 **먼저** 실행해 데이터를 만든 뒤 §1·§3 을 실측해야 한다 (단계 순서 재배치 근거) |

---

## 1. 동네지도 — ward chip / 업체 가격표 (유저 A/B) — `/map`, `/biz/:id`

- [ ] `/map` 진입 → 업체 카드에 **ward(동) chip**이 노출되는지 (`031009e`) — 구현 확인됨: `frontend/src/pages/map/BizRichCard.tsx:31,46` (`bizWardLabel()` → `styles.bizWard`). **ward 는 프로필 좌표에서 역산**(`biz.py:840-849`)하므로 좌표 없는 프로필엔 chip 이 안 뜬다(§0.1.2)
- [ ] 업체 카드 → 상세(`/biz/:id`) 진입 → **가격 탭**이 보이고 항목별 가격이 정상 표기되는지 — `BizPublic.tsx:39` `DETAIL_TABS` 에 `price` 탭 존재 + 홈 탭에도 "가격" 프리뷰. 항목 0건이면 `<EmptyArea label="가격표" />`
- [ ] `/biz/:id` 홈 탭에서 **위치 지도카드**가 **연락처/주소 카드 바로 아래, "소식" 프리뷰 위**에 노출되는지 (`c8bc67c`) — `BizPublic.tsx:373-386` (`styles.mapCard` + `SaigonMapV5`, 단일 마커)
- [ ] 지도 마커/카드 색상·톤이 마켓(중고거래)과 통일돼 있는지 (`70c20ab`) — **⚠️ 주관 판정 / 공용 토큰 없음**: `70c20ab` 커밋 메시지가 "공용 Chip 수렴은 보류, 스타일만 마켓 칩 규격으로 정렬"이라고 명시. 값이 손으로 맞춰진 상태이므로 **육안 대조만 가능**(자동 검증 불가)

## 2. 정보(info) — 침수 지도 배지 (유저 A/B) — `/info/flood`

- [ ] `/info/flood` 진입 → 배지가 **재설계된 위치**에서 보이는지 (`c8bc67c`) — 실제 구현: 백엔드가 계산한 `ward_slug` 로 그룹핑 후 `WARD_GPS_BY_SLUG` 좌표에 고정 배치 (`InfoFloodMap.tsx:43-45`, `SaigonMapV5.tsx:1245-1260`). **배지 간 겹침 회피(collision avoidance) 로직은 없다** — 뷰포트 밖 배지를 잘라내는 클리핑만 있음(`SaigonMapV5.tsx:1248-1249`). 따라서 "겹침 없음"은 기대값이 아니고, **겹침 발생 여부를 관찰·기록**하는 케이스로 볼 것
- [ ] 지도를 이동/줌 → 뷰포트 필터가 동작하는지 (`9efbe23`) — 실제 동작: `onBboxChange` → `viewportBbox` (`InfoFloodMap.tsx:101-104,338`) 가 **하단 리스트**를 bbox 로 필터한다 (`InfoFloodMap.tsx:167-210`). 지도 배지 자체는 도시 전역 데이터이고 뷰포트 클리핑만 받는다. 트리거는 Leaflet `moveend` 가 아니라 커스텀 SVG 맵의 viewBox 변환 콜백 (`SaigonMapV5.tsx:615-620`)
- [ ] **⚠️ 미구현 — `SaigonMapV5.tsx:1253`**: 집계 배지는 `pointerEvents="none"` 이라 **탭이 안 된다.** 기대값 = 배지 탭 시 아무 반응 없음
- [ ] (대체) 개별 침수 신고/위험 마커 탭 → 상세 정보 표시 — `SaigonMapV5.tsx:1276,1362,1377` (`onClick={m.onClick}`). 실측은 배지가 아니라 이 마커로 할 것

## 3. 단골(소식 구독) (유저 A → 업체 계정) — `/biz/:id`, `/map/profile`, `/map/follows`, `/home`, `/feed`

- [ ] 유저 A로 `/biz/:id` 에서 **단골 맺기/해제** 버튼 동작 확인 (`2019da8`) — `BizPublic.tsx` `followRow`, API `POST /biz/follow/{profile_id}`(201) / `DELETE /biz/follow/{profile_id}` (`backend/app/routers/biz.py:1385,1401`)
- [ ] **⚠️ 문서 정정**: 용어는 **"단골" 그대로**다. 코드·i18n 어디에도 "구독"으로 리네임되지 않았다 — `frontend/src/locales/ko/translation.json:1587` `"단골 업체"`, `:1919-1921` `"단골 {{count}}"` / `"단골 맺기"`. `2019da8` 이 완성한 건 *라벨*이 아니라 *동작*(전용 목록 화면 + 데드엔드 토스트 `regularsComingSoon` 키 제거). UI 문구는 "단골"로 나오는 게 정상
- [ ] `/map/profile` → 퀵메뉴 "단골 업체" → `/map/follows` 진입점이 정상 연결되는지 — `NeighborhoodProfile.tsx:62` → `MapFollows` (`App.tsx:407`)
- [ ] 업체 계정으로 `/biz/news/new` 소식 작성 → 유저 A **`/map/follows` 및 `/home` 업체소식 레일에 노출**되는지 (`9365572`, `9efbe23`)
- [ ] **⚠️ 미구현 — `backend/app/routers/biz.py:1067-1093`**: `create_news()` 는 `BusinessNews`(+사진) 행만 insert 하고 커밋한다. **구독자 알림 팬아웃·알림행 생성·푸시 enqueue 가 전혀 없다.** `2019da8` 커밋 본문도 "푸시/인앱 알림은 아직 없다"고 명시. 기대값 = 소식 작성 후 유저 A `/notifications` 에 **아무 알림도 오지 않음**, `/map/follows` 를 직접 열어야 보임
- [ ] **⚠️ 문서 정정**: `/home` 업체소식 섹션은 **가로 스크롤 레일**이다 (`WorldMapV2.tsx:390-417`, `styles.hScroll`) — 2열 그리드가 아니다. `9efbe23` 의 "피드 2열 그리드"는 **커뮤니티 피드(`/feed`)** 얘기다 (`frontend/src/pages/feed/FeedList.module.css:130` `grid-template-columns: repeat(2, ...)`) → `/home` 은 레일, `/feed` 는 2열 그리드로 각각 확인

## 4. 업체(파트너) 대시보드 (업체 계정) — `/biz/manage`, `/biz/ads/new`, `/biz/prices`

- [ ] `/biz/manage` 진입 → 탭이 **홈 / 대시보드** 2개인지 (`BizManage.tsx:32-33` `MANAGE_TABS`). "파트너 라운지"는 섹션이 아니라 **페이지 TopBar 제목**이다 (`BizManage.tsx:235`)
- [ ] 대시보드 탭 섹션 순서가 **광고 성과 → 업체 지표 → 최근 후기** 인지 (`605e740`) — `BizDashboard.tsx:567,591,612`
- [ ] 광고 성과 시계열 차트 렌더 + 기간 필터 동작 (`3df5ad6`, `76f2af8`) — `GET /biz/profiles/{id}/ad-stats-series` 실존 (`biz.py:531-536`). 기간 파라미터는 `period`, 허용값 **`7d` / `14d` / `30d` 뿐** (`biz.py:386` `_SERIES_PERIODS`) — `all` 은 summary 전용이라 series 에 넣으면 400
- [ ] **광고 대시보드 재설계** 후 지표가 0/에러 없이 표기되는지 (`ebd8559`) — 지표 필드: `impressions, reach, clicks, cta_call/follow/favorite/review(+primary_cta_total), cta_secondary` + 파생 `ctr, cvr, spend_vnd, cpm_vnd, cpc_vnd, cpa_vnd` (`biz.py:466-524`). 0 처리: 광고 0건이면 `state="no_ads"` 로 계산 전 조기 반환 (`biz.py:446-449`), 데이터 없는 날도 0 으로 채움 (`biz.py:585-603`), 비율 지표는 `MIN_SAMPLE_FOR_RATIO=100` 미달 시 `None` (`biz.py:73,487-492`) → 프론트에서 숨김. **0/None 이 나오는 것 자체가 정상 동작이며 "0이면 실패"가 아니다**
- [ ] dev 광고통계 시드가 들어가 있으면 차트가 비지 않는지 (`4d8ed2c`) — `backend/scripts/seed_ad_daily_stats.py` (`_require_dev_env()` 가드, `impressions = max(5, ...)` `:109` 이라 항상 ≥5). 시드 미실행이면 `no_ads` 빈 상태가 정답
- [ ] **플랜 선택 가이드** — **⚠️ 별도 화면/모달이 아니다.** `/biz/ads/new` 의 "플랜" 스텝 안 인라인 섹션 "어떤 플랜이 맞을까요?" (`BizAdsNew.tsx:234-244`, `ebd8559`)
- [ ] **⚠️ 미구현 — 업체 대시보드에 단골 *목록* 화면은 없다.** `GET /biz/follow` (`biz.py:1414`)는 **라이더 쪽** "내가 단골 맺은 업체" 목록이고 `/map/follows` 가 소비한다. 업체 대시보드에는 집계 `follower_count` 만 노출 (`BizDashboard.tsx:530,603`). `76f2af8` 도 이 API 를 동네지도 데드엔드 해소용으로 추가한 것 → 기대값 = 대시보드에서 단골 목록 진입점 없음
- [ ] `/biz/prices` 가격표 관리에서 **항목 추가/삭제** 후 유저 화면(§1)에 반영되는지 — `POST /biz/prices` (`biz.py:1141`), `DELETE /biz/prices/{price_id}` (`biz.py:1171`), 공개 조회 `GET /biz/public/{profile_id}/prices` (`biz.py:1114`)
- [ ] **⚠️ 미구현 — 가격 항목 *수정*(PUT/PATCH) 엔드포인트가 없다.** `BizPriceManage.tsx` 도 `createBizPrice` / `deleteBizPrice` 만 import 한다 → 수정은 삭제 후 재등록으로만 가능. "수정" 케이스는 그렇게 실측할 것
- [ ] **광고 노출면은 현재 꺼져 있다** — `ADS_ENABLED` 는 env 가 아니라 **프론트 하드코딩 상수** `frontend/src/lib/adPlacement.ts:18` `export const ADS_ENABLED = false;`. `.env`/compose 에 해당 키 없음. 꺼져서 안 보이는 곳: `/biz/:id` 광고 캐러셀(`BizPublic.tsx:432`), `/home` 광고 슬롯·인터스티셜(`WorldMapV2.tsx:362,370,446`), `/market` 빈 상태 광고 슬롯(`MarketMain.tsx:335`). **대시보드 통계는 이 플래그와 무관**하게 `ad_daily_stat` 을 읽으므로 지표는 정상 표기된다

## 5. OTP / 로그인 회귀 — `/auth/phone-verify`

- [ ] 실기기 전화번호로 OTP 인증 플로우 — `POST /auth/otp/request` (`auth.py:288`) / `POST /auth/otp/verify` (`auth.py:365`), 화면 `/auth/phone-verify` (`App.tsx:394`). **⚠️ dev 서버(`saigon.doil.me`)는 `OTP_DEV_BYPASS=true` 라 실제 SMS 를 보내지 않고 형식(6자리 숫자)만 검증한다** (`auth.py:344-346`, `:390-395`). 실제 SMS 발송 경로를 보려면 운영 도메인에서 테스트해야 한다
- [ ] `APP_ENV=production` 인 운영 도메인에서 `?dev_login=...` 접속 시 — 기대값: **HTTP 403, 본문 `{"detail":"Not available in production"}`** (`auth.py:930`). 조용한 무시가 아니라 명시적 거부다. `DEV_HOST` 미설정/불일치만으로도 fail-closed (보안 회귀 — 매 배포마다 확인 권장)

---

## 6. 업체 프로필 사진 교체 (신규 기능, `BizManage.tsx` 카메라 버튼) — `/biz/manage`

대상: `PUT /biz/profiles/{id}`(`photo_content_id`, `backend/app/routers/biz.py:201-237`) +
`POST /contents/upload`(`backend/app/routers/contents.py:74-131`).

### 6.1 정상 플로우

| # | 케이스 | 기대 |
|---|---|---|
| 6.1.1 | 사진 카메라 버튼 탭 → jpg 선택 | 파일선택 즉시 버튼 disabled + 사진 반투명(업로드 중), 완료 후 새 사진이 카드에 즉시 반영 — `photoUploading` state `BizManage.tsx:55`, `disabled={photoUploading}` `:280`, `styles.photoLoading` `:274` |
| 6.1.2 | png / webp / gif 선택 | 동일하게 성공 — 허용 MIME 은 `image/jpeg, image/png, image/gif, image/webp` 4종 (`contents.py:35-40`) |
| 6.1.3 | 사진 교체 후 새로고침 | 새 사진 유지(`photo_content_id` 서버 반영 확인) |
| 6.1.4 | "정보 수정"(이름/전화) 폼과 독립 동작 확인 | 사진만 바꿔도 이름/전화 불변, 반대도 마찬가지 |

### 6.2 업로드 실패 케이스

| # | 케이스 | 기대 |
|---|---|---|
| 6.2.1 | 15MB 초과 이미지 | **413** → 에러 토스트, 기존 사진 유지, 버튼 재활성화 — `MAX_UPLOAD_BYTES = 15 * 1024 * 1024` (`contents.py:33`), 413 at `:99-100`. (nginx `client_max_body_size` 25MB 보다 낮게 잡아둔 값) |
| 6.2.2 | 미지원 포맷(pdf, svg) | **415** → 에러 토스트 — `contents.py:85-86` |
| 6.2.3 | 확장자/MIME 위조 파일 | 매직넘버 스니핑에 걸려 **400** `"File content does not match declared content type"` — `_sniff_mime()` `contents.py:43-53`, 400 at `:101-102`. (415 와 다른 코드다) |
| 6.2.4 | 업로드 중 네트워크 끊김 | 에러 토스트(`toast.error(extractDetail(...))` `BizManage.tsx:216`), `photoUploading` 은 `finally` 에서 반드시 풀림 (`:217-219`) |
| 6.2.5 | 파일 선택 취소 | 아무 변화 없음 |

### 6.3 계정 상태별 동작 (부작용 확인)

| # | 케이스 | 기대 |
|---|---|---|
| 6.3.1 | `status='PENDING'` 프로필에서 사진 변경 시도 | 409 `"Profile under review — cannot edit"` (`biz.py:209-210`) → 에러 토스트, 미반영. **단 `/biz/manage` 자체가 APPROVED 프로필만 통과시키므로(§7.2.1) UI 로는 이 경로에 도달할 수 없다 — API 직접 호출로만 재현 가능** |
| 6.3.2 | `status='REJECTED'` 프로필에서 사진만 변경 | 사진은 바뀌고 **부작용으로 status 가 자동 PENDING(재심사)으로 전환**됨 — 코드 확인됨: `biz.py:229-233` (REJECTED 면 어떤 필드 수정이든 `status='PENDING'`, `reject_reason=None`, `reviewed_at=None`). 단 6.3.1 과 같은 이유로 `/biz/manage` UI 로는 도달 불가 → API 직접 호출로 재현 |
| 6.3.3 | `status='APPROVED'`(시드 계정 기본값) | 사진 변경만으로 상태 변화 없음 (`biz.py:229` 주석 "APPROVED 는 정보 수정만, 상태 유지") |

### 6.4 다중 프로필 / 반영 전파

| # | 케이스 | 기대 |
|---|---|---|
| 6.4.1 | 프로필 A 변경 후 스위처로 B 전환 | B엔 영향 없음 — 스위처는 `profiles.length > 1` 일 때만 렌더 (`BizManage.tsx:237-249`) |
| 6.4.2 | A→B→A 복귀 | A의 변경 유지 |
| 6.4.3 | 동네지도(`/map`) 업체 카드 | 새 사진 반영(캐시로 잠깐 구사진 보일 수 있음). **좌표 있는 프로필만 지도에 뜬다**(§0.1.2) |
| 6.4.4 | 업체 공개 상세(`/biz/:id`) | 새 사진 반영, 확대(`ImageViewer`) 정상 |

**알려진 제약**: `_require_content()`는 content_id의 존재만 검증하고 소유권은 검사하지 않는다 —
docstring 에 `"소유권은 미검사(존재만)"` 로 명시 (`biz.py:115-118`). API 레벨 공격 표면으로 기록,
이번 작업 범위 아님.

---

## 7. 업체 가입(파트너 온보딩) 시연

목적: 업체 신청→승인→실사용까지 하나의 흐름을 처음부터 끝까지 시연할 수 있는가. 한 명이 유저 계정(신청자 역)과 관리자 계정(승인자 역)을 오가며 진행.

라우트 등록 상태 (`frontend/src/App.tsx`) — 전부 실존 확인:
`/biz/intro`(:415) `/biz/apply`(:416) `/biz/status`(:417) `/biz/manage`(:418)
`/biz/verification`(:419) `/biz/ads/new`(:420) `/biz/ads/:id`(:421)
`/biz/news/new`(:422) `/biz/news/:id`(:423) `/biz/prices`(:424) `/biz/:id`(:165 및 :425).
참고: `/biz/:id`(공개 상세)는 두 번 등록돼 있고 **양쪽 다 `PrivateRoute` 로 감싸져 있다** —
이름만 "public" 이고 실제로는 로그인 필요.

### 7.1 업체 신규 가입 시연

| # | 케이스 | 진입 라우트 | 기대 |
|---|---|---|---|
| 7.1.1 | 유저 계정으로 "신청하기" | `/biz/intro` | `/biz/apply` 이동 |
| 7.1.2 | 대표사진 미첨부 + 필수값만 채워 제출 | `/biz/apply` | 사진은 선택이라 제출 성공 — placeholder 도 `"대표·간판 사진 (권장)"` (`BizApply.tsx:132`), `canSubmit` 조건에 `photoContentId` 없음 (`:64-65`) |
| 7.1.3 | 위치 선택 시트에서 실제 GPS 현재 위치 지정 | `/biz/apply` | `LocationPickerSheet`로 정확히 찍히는지 |
| 7.1.4 | 대표사진 첨부 후 제출 | `/biz/apply` | `/contents/upload` 성공 → `photoContentId` 포함 제출 |
| 7.1.5 | 필수값 누락 | `/biz/apply` | 제출 버튼 비활성. 필수값은 **상호명·업종·연락처·좌표·주소 5개** (`BizApply.tsx:64-65`) |
| 7.1.6 | 제출 완료 | `/biz/status` | `/biz/status`로 이동, `PENDING` 노출 |
| 7.1.7 | 이미 프로필 3개 보유 계정으로 추가 신청 | `/biz/apply` | 409 `"Business profile limit reached (max 3)"` — `MAX_PROFILES_PER_USER = 3` (`biz.py:67`), 카운트는 **`status != 'REJECTED'` 인 것만** (`biz.py:141-142`) → 반려된 건은 한도에서 빠진다 |

### 7.2 승인 대기 상태 제약

| # | 케이스 | 진입 라우트 | 기대 |
|---|---|---|---|
| 7.2.1 | `PENDING` 상태에서 관리 화면 접근 | `/biz/manage` | `/biz/status`로 리다이렉트 — 단 별도 가드 컴포넌트가 아니라 `BizManage` 내부 `useEffect` 가 프로필을 `status === 'APPROVED'` 로 필터하고 결과가 없으면 `navigate('/biz/status', {replace:true})` (`BizManage.tsx:104-108`). PENDING·REJECTED·SUSPENDED 전부 같은 경로로 튕긴다 |
| 7.2.2 | `PENDING` 상태에서 정보 수정 시도 | (API) | 409 `"Profile under review — cannot edit"` 로 막힘 (`biz.py:209-210`). 7.2.1 때문에 UI 진입이 불가하므로 API 직접 호출로 확인 |

### 7.3 관리자 승인

| # | 케이스 | 진입 라우트 | 기대 |
|---|---|---|---|
| 7.3.1 | PENDING 건 확인 | `/admin/biz/accounts`(신) 또는 `/admin-legacy/biz-accounts`(구) | 상호명/신청일 노출, "승인" 버튼 존재. 신 SPA: `admin-frontend/src/App.tsx:153-154`. 구: `admin_legacy.py:3728` |
| 7.3.2 | 승인 클릭 | 위와 동일 | 신 SPA → `POST /admin/api/biz/accounts/{id}/approve` (`admin_api/biz.py:315`) 후 토스트 `"승인되었습니다."` (`BizAccountDetailPage.tsx:159-160`). 구 → `POST /admin-legacy/biz-accounts/{id}/approve` (`admin_legacy.py:3800-3820`) 후 `?flash=approved` 리다이렉트. **둘의 성공 표시 방식이 다르다** |
| 7.3.3 | 승인 후 재접근 | `/biz/manage` | 정상 진입, 신청 시 입력값 그대로 반영 |
| 7.3.4 | 반려 처리 후 | `/biz/status` | `rejectReason` 노출 (`BizStatus.tsx:83-87`), "재신청" 버튼이 `state:{reapplyProfile}` 로 `/biz/apply` 프리필 재진입 (`BizStatus.tsx:89-93`, `BizApply.tsx:40-54` — name/category/address/phone/photo 프리필) |

### 7.4 승인 후 실사용 시연 포인트

| # | 케이스 | 진입 라우트 | 기대 |
|---|---|---|---|
| 7.4.1 | 파트너 라운지 진입 | `/biz/manage` | 프로필 카드·검증 카드 정상 |
| 7.4.2 | 가격표 등록 | `/biz/prices` → `/map`, `/biz/:id` | 유저 앱에서 즉시 노출 — 시연 임팩트 최대. (수정 API 없음, §4 참조) |
| 7.4.3 | 소식 작성 | `/biz/news/new` → `/home`, `/map/follows` | 홈 업체소식 레일/단골 목록에 노출. **알림은 오지 않는다**(§3 미구현) |
| 7.4.4 | 사업자 검증 제출(선택) | `/biz/verification` | 상태값은 **4종**이다: `pending`(모델 default, `backend/app/models.py:586`) → `docs_submitted`(`biz.py:258`) → `verified`(`admin_api/biz.py:451`), 그리고 `rejected`(`admin_api/biz.py:476`). 프론트 칩도 4종 열거 (`BizManage.tsx:42-47`). 생략해도 가입엔 무영향 |
| 7.4.5 | 가입 업체 확인 | `/map` | ward chip·가격표·사진 정상 노출, 좌표 정확도 재확인 |

### 7.5 반복 재현성

| # | 케이스 | 진입 라우트 | 기대 |
|---|---|---|---|
| 7.5.1 | 같은 계정으로 업체 2곳 연속 신청 | `/biz/apply` | 독립적으로 PENDING 생성, 스위처 구분(단 스위처는 APPROVED 2개 이상일 때만 의미 있음) |
| 7.5.2 | 서로 다른 계정으로 각각 신청 | `/auth/phone-verify` → `/biz/apply` | 실제 OTP 인증 경로까지 매끄러운지(§5 참조 — dev 는 바이패스) |

참고: 신청 건을 누가 유치했는지 기록하는 필드는 앱에 없다(가입 처리 자체와 무관, 기록만).

---

## 8. 유저 상품 등록·검색·구매 + 앱 내 부가 기능

이 서비스엔 온라인 결제가 없다 — 당근마켓처럼 채팅으로 약속을 잡고 현장 직거래한다. "구매"는
[채팅 → 가격제안(선택) → 거래약속 → 완료 → 후기] 흐름을 의미한다. 판매자=유저 A, 구매자=유저 B.

**선행**: 유저 A/B 는 이미 전화 인증 완료 상태다(§0.1.1 실측) — 별도 선행 처리 불필요.
단 §8.1.1(미인증 차단)만은 시드 계정으로 재현 불가하므로 미인증 계정을 따로 준비해야 한다.

### 8.1 상품 등록 (유저 A) — `/market/new`

| # | 케이스 | 기대 |
|---|---|---|
| 8.1.1 | 전화 미인증 계정으로 `/market/new` 접근 | `VerifiedSellerRoute` 가 `/auth/phone-verify` 로 **리다이렉트**(모달 아님) — `frontend/src/components/auth/VerifiedSellerRoute.tsx:11-22`. 우회해도 백엔드 403 `"Phone verification required to list items"` (`backend/app/routers/market.py:522-524`), 프론트에 403 안전망 재리다이렉트도 있음 (`MarketCreate.tsx:121-125`) |
| 8.1.2 | 제목만 + 사진 없이 제출 | 사진 최소 1장 필수라 제출 버튼 비활성 (`canPost` 에 `contentIds.length > 0`, `MarketCreate.tsx:99-100`) |
| 8.1.3 | 제목 + 사진 1장 + 지역 선택(카테고리/가격/설명 생략) 제출 | 성공. 가격 비우면 **`priceVnd: 0` 으로 저장**되고(`MarketCreate.tsx:112`) 표시가 "나눔"(`marketFormat.ts:5-7`) — null 이 아니라 0 이다. 입력 중 안내문도 노출(`:216`) |
| 8.1.4 | 사진 최대 10장 첨부 | `MAX_IMAGES = 10` (`MarketCreate.tsx:19`). 개별 업로드, 전부 완료 전 제출 버튼 비활성(`allUploaded`, `:98-100`) |
| 8.1.5 | 가격 입력 + "가격 제안 받기" ON | `isNegotiable=true` 로 저장, 구매자 쪽에 "가격제안" 버튼 노출(§8.3.2) |
| 8.1.6 | 거래 희망 위치 지도 선택 | `LocationPickerSheet`(`frontend/src/pages/market/LocationPickerSheet.tsx`, 마운트 `MarketCreate.tsx:248-256`). 미지정 시 선택한 지역 중심좌표로 폴백 |
| 8.1.7 | 등록 완료 | 심사 없이 즉시 `ON_SALE` (`market.py:544` 무조건 세팅), `/market/:id` 상세로 `replace` 이동 (`MarketCreate.tsx:119`) |
| 8.1.8 | **(보강)** 필수값 판정 재확인 | submit 활성 조건은 **로그인 + 제목 비어있지 않음 + 업로드 완료 사진 ≥1 + 지역(`district`) 선택** 4개. 카테고리("카테고리 선택 (선택)" `:191`)·설명·가격은 전부 선택 |

### 8.2 검색 (유저 B) — `/market`, `/market/search`

| # | 케이스 | 진입 라우트 | 기대 |
|---|---|---|---|
| 8.2.1 | 무한스크롤 목록에 방금 등록한 매물 노출 | `/market` | `recent` 정렬 최상단 근처. 기본 정렬 `recent` 확인됨(프론트 `MarketMain.tsx:73`, 백엔드 `market.py:218`), 무한스크롤 `useInfiniteScroll`+`ScrollSentinel`(`MarketMain.tsx:207-208,357`) |
| 8.2.2 | 키워드 검색 | `/market/search` | **300ms** 디바운스 후 결과 노출 (`MarketSearch.tsx:65-68`) |
| 8.2.3 | 카테고리 드릴다운 필터 | `/market/search` | 일치 항목만 — `CategoryPickerSheet`(`MarketSearch.tsx:23,209-216`), 서버에서 서브트리 매칭(`market.py:261-267`) |
| 8.2.4 | 가격대 필터 | `/market/search` | 프리셋 칩 5단(`MarketSearch.tsx:29-35`) + min/max 직접 입력(`:233-249`), 범위 안/밖 정확히 |
| 8.2.5 | 정렬 변경 | `/market/search` | 검색 화면 정렬은 **`recent` / `price_low` / `price_high` 3종뿐**(`MarketSearch.tsx:27`). **거리(distance) 정렬은 `/market` 메인에만 있다**(`MarketMain.tsx:56`) |
| 8.2.6 | 위치 모드 전환(전체/GPS/지도선택) | `/market` | **메인 피드 전용 기능이다 — `/market/search` 에는 없다.** `locationMode: 'all'|'gps'|'region'` 바텀시트(`MarketMain.tsx:78,388-459`) |
| 8.2.7 | "거래완료 숨기기" 토글 | `/market` | 칩 토글(`MarketMain.tsx:301-307`) → `hide_sold=true`(`frontend/src/api/market.ts:257`, 백엔드 `market.py:219,309-311`). **검색 화면에는 이 토글이 없고 `hideSold` 가 하드코딩**(일반검색 true / 내매물 false, `MarketSearch.tsx:78`) → §8.3.8 SOLD 처리 후 `/market` 에서 재확인 |

### 8.3 구매 프로세스 (DM 경유) — `/market/:id`, `/dm/:conversationId`

| # | 케이스 | 기대 |
|---|---|---|
| 8.3.1 | 상세에서 "채팅하기" | 매물 컨텍스트 달린 DM 방 생성(`createConversation(sellerId, {type:'listing', id})` → `backend/app/routers/dm.py:202`), `/dm/:conversationId` 이동 (`App.tsx:435`) |
| 8.3.2 | "가격제안" 버튼 → 금액 입력 | `POST /market/price-offers` (`market.py:1249`). 채팅에 전용 카드로 특수 렌더(금액·정가 대비·상태 pill, `DmDetail.tsx:496-524`). 버튼은 `status==='ON_SALE' && isNegotiable` 일 때만 노출(`MarketDetail.tsx:385`) |
| 8.3.3 | 판매자가 제안 수락/거절/취소 | 3종 전부 구현 — `PATCH /price-offers/{id}/accept`(`market.py:1353`) `/decline`(`:1373`) `/cancel`(`:1393`, 제안자만). 양측 채팅에 상태 정확히 반영 |
| 8.3.4 | 채팅에서 거래약속 제안(장소/시간) | `POST /market/appointments` (`market.py:1036`), `AppointmentLocationPicker`(`frontend/src/pages/dm/AppointmentLocationPicker.tsx`, 호출 `DmDetail.tsx:238`). **수락 버튼은 "제안자가 아닌 쪽"에 노출**(`canAccept = status==='PROPOSED' && !iAmProposer`, `DmDetail.tsx:431`) — 판매자 고정이 아니다 |
| 8.3.5 | 약속 수락 | `PATCH /market/appointments/{id}/accept` (`market.py:1142`) → 약속 `ACCEPTED` + **매물 자동 `RESERVED`**. 양측 확정 표시(`DmDetail.tsx:422-427,445`) |
| 8.3.6 | 상태를 `RESERVED`로 수동 변경 | 가능 (`PATCH /market/listings/{id}/status`, 프론트 선택지도 `['ON_SALE','RESERVED']` 뿐 — `MarketDetail.tsx:42`) |
| 8.3.7 | 상태를 `SOLD`로 직접 변경 시도 | **불가 — 서버 400 `{"code":"sold_via_appointment"}`** (`market.py:581-585`). 문서 주장 코드로 확인됨. UI 선택지에도 SOLD 가 없으므로 API 직접 호출로 재현 |
| 8.3.8 | 약속 `ACCEPTED` 상태에서 판매자가 "거래완료" | `PATCH /market/appointments/{appointment_id}/complete` (`market.py:1167` — 경로명 확인됨) → 약속 `COMPLETED` + 매물 자동 `SOLD` + `agreed_price_vnd` 확정 (`market.py:1198-1201`). **판매자만 가능**(`:1175-1176`), 중복 완료는 row lock 으로 차단(`:1128`). §8.2.7 토글에서 사라지는지 재확인 |
| 8.3.9 | **(보강)** "가격 제안 받기" OFF 매물에 제안 시도 | 403 `"Listing does not accept price offers"` (`market.py:1270-1271`). 버튼 자체가 안 뜨므로 API 직접 호출로 확인 |

### 8.4 판매자 관리 — `/market/:id`

| # | 케이스 | 기대 |
|---|---|---|
| 8.4.1 | 가격 수정 | `PATCH /market/listings/{id}/price` (`market.py:605`), 검색/상세 즉시 반영. **SOLD 매물은 409 로 거부** (`:623-624`) |
| 8.4.2 | 끌어올리기(bump) | `POST /market/listings/{id}/bump` (`market.py:641`), 최상단 재노출. **쿨다운 4시간** (`_BUMP_COOLDOWN` `:71`) |
| 8.4.3 | 쿨다운 내 재시도 **(보강)** | **429** `{"code":"cooldown","retry_after":<초>}` (`market.py:659-661`) — 400 이 아니다. 에러 문구/남은 시간 표기 확인 |
| 8.4.4 | 매물 신고(구매자 관점) | `POST /market/listings/{id}/report` (`market.py:673`). 접수되고 **판매자에게 통보 없음 — 핸들러가 `Report` 행만 insert 하고 알림 enqueue 를 하지 않음**(`:704-714`, listing_created 와 대조). 중복 신고 409, 자기 매물 신고 400 |
| 8.4.5 | 유저 차단 | 3곳 전부 반영 확인됨 — 목록/검색(`market.py:294-303`, 두 화면이 같은 엔드포인트), 상세는 404 처리(`:396-408`), DM 은 `require_unblocked()`(`backend/app/services/dm_policy.py:16`; `dm.py:213,290,386,457` + 약속·제안 경로 `market.py:1048,1124,1339`) |

### 8.5 앱 내 부가 기능

| # | 기능 | 진입 라우트 | 기대 |
|---|---|---|---|
| 8.5.1 | 위시리스트(찜) | `/market/wishlist` | 즉시 반영. **해제는 상세 하트에서만** — 확인됨: 위시리스트 화면은 `ListingCard` 를 쓰고 카드 전체가 상세 이동 버튼 하나이며(`ListingCard.tsx:18`, `MarketWishlist.tsx:71`) 표시된 하트는 좋아요 **개수 표시용 정적 아이콘**(`ListingCard.tsx:38-45`)이다. 해제는 `MarketDetail.tsx:377-384` |
| 8.5.2 | 거래 완료 후 후기 작성 | `/market/:id`, `/trades` | 무결성 검증 확인됨 — 리뷰어·대상이 DM 참여자이고 `MarketplaceAppointment.status == 'COMPLETED'` 인 건이 있어야 하며 없으면 400 `"no completed trade with this buyer/seller"` (`market.py:792-829`), 중복 리뷰 409(`:832-842`). 별점 → `manner_temp` 변동: `{5:+0.5, 4:+0.25, 3:0, 2:-0.5, 1:-1.0}`, `[0,99]` 클램프 (`_recompute_manner_temp` `market.py:77-91`). 기본값 **36.5 확인됨** (`backend/app/models.py:149` `default=Decimal("36.5")`, `market.py:74` `_MANNER_BASE`) |
| 8.5.3 | 매너온도 노출 | `/market/:id` | **⚠️ 문서 정정 — 숫자 온도는 화면에 안 나온다.** `TrustTierChip` 은 `temp` 를 받아 `getTrustTier(temp)` 로 **티어 라벨 칩만** 렌더한다. 주석에 명시: `frontend/src/components/ui/TrustTierChip.tsx:5` "온도값 자체는 노출하지 않는다". 사용처 `MarketDetail.tsx:268`. 기대값 = 후기 후 **티어 칩이 바뀔 수 있음**(등급 경계를 넘을 때만), 숫자 변화는 UI 로 확인 불가 |
| 8.5.4 | 키워드 알림 | `/market`(벨 아이콘 바텀시트) → `/notifications` | **⚠️ 별도 설정 화면 라우트가 없다** — `/market` 상단 벨 아이콘(`MarketMain.tsx:286`)이 여는 `BottomSheet`(`:462-494`)가 전부. API `GET/POST /market/keyword-alerts`, `DELETE .../{id}` (`market.py:913-978`). 팬아웃 확인됨: `create_listing` → `noti_events.enqueue("market.listing_created")` (`market.py:562-566`) → `noti_worker/__main__.py:175-228` 이 키워드 부분일치(대소문자 무시)·판매자 제외·차단관계 제외 후 `KEYWORD` 알림행 insert + 푸시. 알림함 `/notifications` (`App.tsx:436`) |
| 8.5.5 | DM 목록 관리 | `/dm` | 여러 대화 구분, 안읽음 배지 (`DmList.tsx:79-80` `c.unreadCount > 0`) |
| 8.5.6 | 프로필 거래 이력 | `/trades` | 판매/구매 역할 구분 표시 — 백엔드가 `role = 'sold' | 'bought'` 계산(`market.py:1465`), 프론트가 배지 렌더(`frontend/src/components/market/TradeRow.tsx:34-35`) |

---

## 9. 자동 실측 가능성 (다음 단계 Playwright 판정)

`AUTO` = 브라우저 조작 + 스크린샷으로 자동 캡처 가능 / `SEMI` = 가능하나 2계정 동시 세션·파일
업로드 픽스처·순서 의존이 필요 / `MANUAL` = 실기기·DB 직접 조작·API 직접 호출·외부 자격증명 필요.

| 케이스 | 판정 | 비고 (MANUAL/SEMI 사유) |
|---|---|---|
| 0.1.1 전화인증 상태 | — | 실측 완료(DB 조회) — 브라우저 캡처 대상 아님 |
| 0.1.2 시드 업체 프로필 필드 | — | 실측 완료(DB 조회) — 브라우저 캡처 대상 아님 |
| 0.1.3 가격표·소식 0건 | — | 실측 완료(DB 조회). 단계 순서 재배치로 대응 |
| 1.1 ward chip | AUTO | |
| 1.2 가격 탭 | AUTO | |
| 1.3 위치 지도카드 | AUTO | |
| 1.4 마켓 톤 통일 | MANUAL | 주관 판정 — 공용 토큰이 없어 기계 비교 기준이 없다 |
| 2.1 침수 배지 배치 | AUTO | |
| 2.2 뷰포트 필터(리스트) | AUTO | |
| 2.3 배지 탭 무반응 | AUTO | |
| 2.4 개별 마커 탭 상세 | AUTO | |
| 3.1 단골 토글 | AUTO | |
| 3.2 용어 "단골" 유지 | AUTO | |
| 3.3 `/map/follows` 진입점 | AUTO | |
| 3.4 소식 작성 → 목록 노출 | SEMI | 업체 계정과 유저 계정 세션 전환 필요 |
| 3.5 알림 미발생 확인 | SEMI | 2계정 전환 + 부재 증명(negative assertion) |
| 3.6 홈 레일 / `/feed` 2열 | AUTO | |
| 4.1 탭 2개 / TopBar 제목 | AUTO | |
| 4.2 대시보드 섹션 순서 | AUTO | |
| 4.3 시계열 차트 + period 필터 | AUTO | |
| 4.4 지표 0/None 처리 | AUTO | |
| 4.5 광고통계 시드 차트 | MANUAL | `seed_ad_daily_stats.py` 를 서버에서 실행해야 함(DB 조작) |
| 4.6 플랜 가이드 인라인 섹션 | AUTO | |
| 4.7 단골 목록 부재 확인 | AUTO | |
| 4.8 가격표 추가/삭제 전파 | AUTO | |
| 4.9 가격 수정 API 부재 | MANUAL | 코드 사실 — UI 로 관찰할 대상이 없다 |
| 4.10 `ADS_ENABLED=false` 노출면 | AUTO | |
| 5.1 실제 SMS OTP | MANUAL | 실기기 + 실 전화번호 + 운영 도메인(SMS 프로바이더) 필요 |
| 5.2 운영 도메인 403 | MANUAL | 운영 도메인 접근 필요(dev 브라우저 세션으로 재현 불가) |
| 6.1.1~6.1.4 사진 정상 플로우 | SEMI | 파일 업로드 픽스처 필요(`setInputFiles`) |
| 6.2.1 15MB 초과 413 | SEMI | 15MB 초과 픽스처 생성 필요 |
| 6.2.2 미지원 포맷 415 | SEMI | pdf/svg 픽스처 필요 |
| 6.2.3 위조 파일 400 | SEMI | 확장자 위조 픽스처 필요 |
| 6.2.4 네트워크 끊김 복구 | SEMI | 라우트 abort 로 재현 가능 |
| 6.2.5 선택 취소 | AUTO | |
| 6.3.1 / 6.3.2 PENDING·REJECTED | MANUAL | `/biz/manage` 가드가 APPROVED 만 통과 — DB 상태 조작 + API 직접 호출로만 재현 |
| 6.3.3 APPROVED 무변화 | SEMI | 업로드 픽스처 필요 |
| 6.4.1~6.4.2 다중 프로필 | MANUAL | APPROVED 프로필 2개 이상 필요 → 승인 절차(어드민) 선행 |
| 6.4.3 / 6.4.4 전파 | SEMI | 업로드 후 화면 이동 |
| 7.1.1~7.1.6 신규 가입 | SEMI | GPS 위치(7.1.3)는 geolocation mock 필요, 사진(7.1.4)은 픽스처 필요 |
| 7.1.7 프로필 3개 한도 409 | MANUAL | APPROVED/PENDING 3건 사전 조성 필요 |
| 7.2.1 PENDING 리다이렉트 | AUTO | |
| 7.2.2 PENDING 수정 409 | MANUAL | API 직접 호출 |
| 7.3.1~7.3.4 어드민 승인/반려 | SEMI | 어드민 자격증명 + 별도 세션(`/admin/`) 필요 |
| 7.4.1~7.4.5 승인 후 실사용 | SEMI | 7.3 승인 선행 의존 |
| 7.5.1 2곳 연속 신청 | SEMI | 순서 의존 |
| 7.5.2 다계정 신청 | MANUAL | 실제 OTP 경로 확인이 목적(§5.1과 동일 제약) |
| 8.1.1 미인증 리다이렉트 | AUTO | |
| 8.1.2~8.1.8 상품 등록 | SEMI | 사진 업로드 픽스처 필수(최대 10장 케이스 포함) |
| 8.2.1~8.2.7 검색/필터 | AUTO | 8.2.6 GPS 모드만 geolocation mock 필요 |
| 8.3.1 채팅 생성 | SEMI | 판매자/구매자 2계정 |
| 8.3.2~8.3.5 제안·약속 | SEMI | 2계정 교대 조작 |
| 8.3.6 RESERVED 수동 변경 | AUTO | |
| 8.3.7 SOLD 직접 변경 400 | MANUAL | UI 에 SOLD 선택지가 없어 API 직접 호출 필요 |
| 8.3.8 거래완료 → SOLD | SEMI | 2계정 + 약속 ACCEPTED 선행 |
| 8.3.9 제안 OFF 매물 403 | MANUAL | 버튼 미노출 — API 직접 호출 |
| 8.4.1 가격 수정 | AUTO | |
| 8.4.2 bump | AUTO | |
| 8.4.3 쿨다운 429 | SEMI | 4시간 쿨다운 — 연속 2회 호출로 재현(대기 불필요) |
| 8.4.4 신고 + 판매자 무통보 | SEMI | 2계정, 부재 증명 |
| 8.4.5 차단 3면 반영 | SEMI | 2계정 |
| 8.5.1 위시리스트 해제 제약 | AUTO | |
| 8.5.2 후기 무결성 + 매너온도 | SEMI | 완료된 실거래 선행(8.3.8 의존) + 2계정 |
| 8.5.3 티어 칩(숫자 미노출) | AUTO | |
| 8.5.4 키워드 알림 팬아웃 | SEMI | 2계정 + noti_worker 동작 대기 |
| 8.5.5 DM 목록 배지 | SEMI | 2계정 |
| 8.5.6 거래 이력 역할 구분 | SEMI | 판매·구매 이력 양쪽 필요 |

**집계**: AUTO 29 / SEMI 25 / MANUAL 12 (표 66행 기준. 일부 행은 인접 케이스를 묶은 것).

### 실측 대상 라우트 전체 목록

앱: `/splash`, `/auth/phone-verify`, `/home`, `/feed`, `/map`, `/map/profile`, `/map/follows`,
`/info/flood`, `/biz/:id`, `/biz/intro`, `/biz/apply`, `/biz/status`, `/biz/manage`,
`/biz/verification`, `/biz/prices`, `/biz/news/new`, `/biz/news/:id`, `/biz/ads/new`, `/biz/ads/:id`,
`/market`, `/market/new`, `/market/search`, `/market/wishlist`, `/market/:id`,
`/dm`, `/dm/:conversationId`, `/notifications`, `/trades`

어드민(별도 세션): `/admin/biz/accounts`, `/admin/biz/accounts/:id`, `/admin-legacy/biz-accounts`

---

## 이슈 기록

| # | 영역 | 화면/단계 | 증상 | 재현 계정/상태 | 비고 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
