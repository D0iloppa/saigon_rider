---
title: "Saigon Rider — 기능 점검 체크리스트 v1 (2026-05-14)"
---

:::info 자동 동기화 문서
이 페이지는 `ai-docs/TEST/CHECKLIST_v1_260514.md` 에서 자동 복사되었습니다.
편집은 **원본 파일**에서, 발행은 프로젝트 루트의 `./wikidoc_publish.sh` 로 수행하세요.
:::

# Saigon Rider — 기능 점검 체크리스트 v1 (2026-05-14)

> **목적**: 화면별 구현 기능, BFF/Engine API 연계, 엔진 독립 기능 점검을 위한 단일 진실 공급원(SoT).
> **참조 원칙**: 모든 맥락은 [`/GUIDELINE.md`](../../GUIDELINE.md)를 절대적 원칙으로 따른다.
> **관련 문서**: [`spec.md`](../spec.md) · [`engine_intg_v2.md`](../engine_intg_v2.md) · [`backend_todo.md`](../backend_todo.md) · [`features_todo.md`](../features_todo.md)
>
> **테스트 환경 기본값**
> - 공개 진입 URL 베이스: `http://localhost:18090` (Nginx, `$NGINX_PORT`)
> - 프론트 라우트: `http://localhost:18090/{경로}` (React Router, BrowserRouter)
> - BFF API 베이스: `http://localhost:18090/api/bff/*` → 내부 `bff:8080/api/*`
> - Engine API 베이스(서비스간): `http://localhost:18090/api/sre/*` → 내부 `engine:8090/v1/*`
> - Engine 내부 전용 경로: `/engine/*` (Docker 내부 네트워크 `172.16/12`만 허용)
> - DB 직접 점검: `docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME`
> - 컨테이너 기동: `docker compose --env-file .env --profile backend up -d`

---

## 📊 진척도 (Progress Tracker)

> **점검 시작일**: 2026-05-14  **마지막 갱신**: 2026-05-15  **담당자**: D0iloppa

### 상태 범례

| 기호 | 의미 |
|---|---|
| ⬜ | 미점검 (default) |
| 🟡 | 진행 중 / 부분 점검 |
| ✅ | Pass — 기대 결과대로 동작 |
| ❌ | Fail — 결함/회귀 발견 (§5 이슈 로그에 상세 기재) |
| ⛔ | N/A — 미구현·스코프 외 (예: spec mock 잔여) |

### 그룹별 진척도 (수동 집계)

> 각 섹션 표의 `상태` 컬럼 값을 합산해 채워 넣는다. 점검 진행하면서 갱신.

| 그룹 | 항목수 | ⬜ | 🟡 | ✅ | ❌ | ⛔ | 진척률 |
|---|---|---|---|---|---|---|---|
| §0 점검 절차 / 헬스 | 6 | 4 | 0 | 2 | 0 | 0 | 33% |
| §1 화면 라우팅 | 28 | 0 | 0 | 28 | 0 | 0 | 100% |
| §2 화면별 기능 | 98 | 52 | 2 | 39 | 4 | 2 | 40% |
| §3 엔진 (SRE) | 43 | 43 | 0 | 0 | 0 | 0 | 0% |
| §4 시스템 전반 | 18 | 18 | 0 | 0 | 0 | 0 | 0% |
| **합계** | **193** | **117** | **2** | **69** | **4** | **2** | **~37%** |

> **260515 기준 §2 세부**: §2.1~2.6·2.10 점검 완료(부분 포함). §2.7 QUEST-DETAIL, §2.8 RIDE-ACTIVE, §2.9 RIDE-RESULT, §2.11~2.15 PROFILE/SETTINGS 미점검.

### TODO 체크리스트 (큰 단위)

각 항목 완료 시 체크 → 해당 섹션 표의 `상태` 컬럼도 동기 갱신.

- [ ] **§0** 인프라 기동 & 헬스체크 (saigon_* 7개 컨테이너 Up · BFF/Engine/Wiki 헬스 200)
- [x] **§1.1** 그룹 A 인증 플로우 화면 7종 (`ONB-001`, `AUTH-*`, `PROFILE-SETUP`, `LINK-ROUTER`)
- [x] **§1.2** 그룹 B 홈 & 월드맵 3종 (`HOME-001/EMPTY/LOADING`)
- [x] **§1.3** 그룹 C 퀘스트 4종 (`QUEST-LIST/EMPTY/DETAIL/LOCK`)
- [x] **§1.4** 그룹 D 라이딩 5종 (`RIDE-ACTIVE/PAUSE/GPS-ERROR/RESULT-S/RESULT-F`)
- [x] **§1.5** 그룹 E 소셜 피드 3종 (`FEED-001/EMPTY/COMMENT`)
- [x] **§1.6** 그룹 F 프로필 2종 (`PROFILE-001`, `BADGE-DETAIL`)
- [x] **§1.7** 그룹 G 설정 4종 (`SETTINGS`, `SET-NOTI/LANG/ACCOUNT`)
- [x] **§1.8** 기타 라우트 / Fallback (404·PrivateRoute 가드·Admin 콘솔)
- [x] **§2.1** ONB-001 스플래시 기능 4종
- [x] **§2.2** AUTH-001 번호입력 기능 5종
- [x] **§2.3** AUTH-002 OTP/Passcode 입력 기능 5종 (❌ F-02-7·F-AUTH-LOGIN 결함)
- [x] **§2.4** PROFILE-SETUP 기능 6종 (❌ F-03-2·F-03-4 결함)
- [x] **§2.5** HOME-001 월드맵 기능 10종 (F-04-4·F-04-8·F-04-9 미점검 제외 8종 ✅)
- [x] **§2.6** QUEST-LIST 기능 6종 (F-05-2 결함 수정 완료, F-05-4·F-05-5 재점검 필요)
- [ ] **§2.7** QUEST-DETAIL 기능 6종
- [ ] **§2.8** RIDE-ACTIVE/PAUSE/GPS-ERROR 기능 12종
- [ ] **§2.9** RIDE-RESULT-S/F 기능 7종
- [x] **§2.10** FEED 기능 15종 (F-09-8·9 미점검, F-09-3 BFF 미구현으로 🟡, F-09-10 ⛔ — 핵심 기능 전체 점검·수정 완료 + 이미지 스켈레톤·라이트박스 신규 구현)
- [ ] **§2.11** PROFILE-001 기능 10종 (+RP 잔액)
- [ ] **§2.12** SETTINGS 메인 기능 4종
- [ ] **§2.13** SET-NOTI 기능
- [ ] **§2.14** SET-LANG 기능
- [ ] **§2.15** SET-ACCOUNT 기능 4종
- [ ] **§3.1** 화면↔엔진 연계 매트릭스 5건 (RIDE_KM·QUEST_COMPLETE·SHARE_SNS·잔액조회·REFERRAL)
- [ ] **§3.2** Engine API 17개 엔드포인트 직접 호출 (events·balance·missions·catalog·redemptions·admin)
- [ ] **§3.3** Engine 서비스 레이어 8종 (event_bus·point_ledger·anti_abuse·diversity·mission·tier·reward·audit)
- [ ] **§3.4** Engine 배치 잡 4종 (expire_rp·expire_missions·cleanup_idem·verify_balance)
- [ ] **§3.5** Engine 관측성 (메트릭·로그·헬스·단위 테스트)
- [ ] **§3.6** 데이터 정합성 SQL 4종 (잔액·멱등·신규계정·일일캡)
- [ ] **§4.1** 인프라 / 컨테이너 4개 항목
- [ ] **§4.2** 인증 플로우 E2E
- [ ] **§4.3** 화면 라우팅 / 디자인
- [ ] **§4.4** BFF API 호출 (네트워크)
- [ ] **§4.5** BFF ↔ Engine 연계
- [ ] **§4.6** Engine 독립 점검
- [ ] **§4.7** 미구현/Mock 잔여 항목 분류

---

## 0. 점검 절차 개요

| 단계 | 작업 | 명령/도구 | 상태 |
|---|---|---|---|
| 0-1 | 인프라 기동 확인 | `docker compose ps` — `saigon_nginx`, `saigon_frontend`, `saigon_bff`, `saigon_engine`, `saigon_db`, `saigon_imgproxy` 모두 `Up` 상태 | ✅ |
| 0-2 | 헬스체크 | `curl -i http://localhost:18090/` (200), `curl -i http://localhost:18090/api/bff/health` (200), `curl -i http://localhost:18090/api/sre/health` (200) ⚠️ 체크리스트 경로 `/api/sre/healthz` → 실제 엔드포인트는 `/api/sre/health` | ✅ |
| 0-3 | 화면 진입 점검 | 브라우저로 §1 표의 URL 직접 호출, 콘솔/네트워크 오류 모니터링 | ⬜ |
| 0-4 | API 호출 점검 | DevTools Network 탭 또는 `curl` 로 §2 항목 검증 | ⬜ |
| 0-5 | DB 사이드이펙트 점검 | psql 쿼리(섹션별 명시) | ⬜ |
| 0-6 | 엔진 직접 호출 | §3 의 `curl -H "X-Service-Key: $ENGINE_SERVICE_KEY" ...` | ⬜ |

---

## 1. 화면 목록 (Screen Inventory)

> **출처**: `frontend/src/App.tsx` 라우터 정의 기준.
> `PrivateRoute`로 감싸진 화면은 로그인(`user` 컨텍스트)이 없으면 `/splash`로 리다이렉트된다.

### 1.1 그룹 A — 온보딩 / 인증

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| ONB-001 | 스플래시 | `/` (→ `/splash` 리다이렉트) · 직접: `/splash` | `pages/auth/Splash.tsx` | Public | `01 · ONB-001` | ✅ |
| AUTH-001 | 번호입력 | `/auth/phone` | `pages/auth/PhoneInput.tsx` | Public | `02 · AUTH-001` | ✅ |
| AUTH-001-E | 번호오류(상태분기) | `/auth/phone` (입력 오류 상태) | `pages/auth/PhoneInput.tsx` | Public | `03 · AUTH-001-E` | ✅ |
| AUTH-002 | OTP 코드 입력 | `/auth/otp` | `pages/auth/OtpInput.tsx` | Public | `04 · AUTH-002` | ✅ |
| AUTH-002-E | OTP 코드 오류(상태분기) | `/auth/otp` (검증 실패 상태) | `pages/auth/OtpInput.tsx` | Public | `05 · AUTH-002-E` | ✅ |
| PROFILE-SETUP | 라이더 프로필 설정 | `/auth/profile-setup` | `pages/auth/ProfileSetup.tsx` | Public | `06 · PROFILE-SETUP` | ✅ |
| LINK-ROUTER | 딥링크 진입 | `/link` (쿼리 파라미터 처리) | `pages/link/LinkRouter.tsx` | Mixed | — | ✅ |

### 1.2 그룹 B — 홈 & 월드맵

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| HOME-001 | 월드맵 홈 | `/home` | `pages/home/WorldMap.tsx` | Private | `07 · HOME-001 ⭐` | ✅ |
| HOME-001-EMPTY | 월드맵 홈(빈상태) | `/home` (추천 퀘스트 null 상태) | 동일 | Private | `08 · HOME-001-EMPTY` | ✅ |
| HOME-001-LOADING | 월드맵 홈(로딩) | `/home` (초기 fetch 진행 중) | 동일 | Private | `09 · HOME-001-LOADING` | ✅ |

### 1.3 그룹 C — 퀘스트

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| QUEST-LIST | 퀘스트 목록 | `/quests` | `pages/quest/QuestList.tsx` | Private | `10 · QUEST-LIST` | ✅ |
| QUEST-LIST-EMPTY | 퀘스트 목록(빈상태) | `/quests` (필터 결과 0건 상태) | 동일 | Private | `11 · QUEST-LIST-EMPTY` | ✅ |
| QUEST-DETAIL | 퀘스트 상세 | `/quests/:id` | `pages/quest/QuestDetail.tsx` | Private | `12 · QUEST-DETAIL ⭐` | ✅ |
| QUEST-DETAIL-LOCK | 잠금 모달 | `/quests/:id` (레벨미달 상태) | 동일 | Private | `13 · QUEST-DETAIL-LOCK` | ✅ |

### 1.4 그룹 D — 라이딩

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| RIDE-ACTIVE | 주행 HUD | `/ride/active` | `pages/ride/RideActive.tsx` | Private | `14 · RIDE-ACTIVE ⭐` | ✅ |
| RIDE-PAUSE | 일시정지 BottomSheet | `/ride/active` (오버레이) | 동일 | Private | `15 · RIDE-PAUSE` | ✅ |
| RIDE-GPS-ERROR | GPS 오류 | `/ride/active` (오버레이) | 동일 | Private | `16 · RIDE-GPS-ERROR` | ✅ |
| RIDE-RESULT-S | 결과 — 성공 | `/ride/result/success` | `pages/ride/RideResultSuccess.tsx` | Private | `17 · RIDE-RESULT-S ⭐` | ✅ |
| RIDE-RESULT-F | 결과 — 실패 | `/ride/result/fail` | `pages/ride/RideResultFail.tsx` | Private | `18 · RIDE-RESULT-F` | ✅ |

### 1.5 그룹 E — 소셜 피드

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| FEED-001 | 피드 목록 | `/feed` | `pages/feed/FeedList.tsx` | Private | `19 · FEED-001` | ✅ |
| FEED-EMPTY | 피드 빈상태 | `/feed` (게시물 0건) | 동일 | Private | `20 · FEED-EMPTY` | ✅ |
| FEED-COMMENT | 댓글 BottomSheet | `/feed` (오버레이) | 동일 | Private | `21 · FEED-COMMENT` | ✅ |

### 1.6 그룹 F — 프로필

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| PROFILE-001 | 내 프로필 | `/profile` | `pages/profile/ProfileMain.tsx` | Private | `22 · PROFILE-001` | ✅ |
| BADGE-DETAIL | 배지 상세 모달 | `/profile` (오버레이) | 동일 | Private | `23 · BADGE-DETAIL` | ✅ |

### 1.7 그룹 G — 설정

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| SETTINGS | 설정 메인 | `/settings` | `pages/settings/Settings.tsx` | Private | `24 · SETTINGS` | ✅ |
| SET-NOTI | 알림 설정 | `/settings/notifications` | `pages/settings/NotiSettings.tsx` | Private | `25 · SET-NOTI` | ✅ |
| SET-LANG | 언어 설정 | `/settings/language` | `pages/settings/LangSettings.tsx` | Private | `26 · SET-LANG` | ✅ |
| SET-ACCOUNT | 계정 관리 | `/settings/account` | `pages/settings/AccountSettings.tsx` | Private | `27 · SET-ACCOUNT` | ✅ |

### 1.8 기타 라우트 / Fallback

| 항목 | 동작 | 점검 | 상태 |
|---|---|---|---|
| `*` (404) | `/home`으로 Navigate | `/some-random` 접근 시 `/home` 으로 이동 또는 로그인 안된 경우 `/splash` | ✅ |
| `PrivateRoute` 가드 | 미로그인 시 모든 Private URL → `/splash` 리다이렉트 | App.tsx `PrivateRoute` 코드 확인: `isAuthenticated` false → `<Navigate to="/splash">` | ✅ |
| 관리자 콘솔 | `http://localhost:18090/admin/`, `/admin/login` | `/admin/` → 307 redirect → `/admin/login` 200 ✅ | ✅ |

---

## 2. 화면별 기능 점검 항목 (Feature × Endpoint × 점검)

> **범례**
> - `[STATIC]` 로컬 상태만 (API 불필요)
> - `[DEVICE]` 디바이스 API (GPS·카메라·Clipboard·navigator.share)
> - `[BFF]` BFF API 호출 — `/api/bff/...`
> - `[SRE]` Engine API 호출 — BFF가 내부에서 `engine_client`로 호출 (앱에서 직접 호출 불가)
> - `[MOCK]` 현재 프론트가 mock 응답(`VITE_USE_MOCK=true`)을 사용 — 실 API 연동 미완

### 2.1 ONB-001 · 스플래시

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-01-1 | 그라디언트/로고 애니메이션 | `[STATIC]` | — | `/splash` 진입 시 brand 그라디언트 + 로고 fade-in 표시 확인 | ✅ 휴먼 확인 |
| F-01-2 | 자동 라우팅 (토큰 검사) | `[STATIC]` | `isAuthenticated` → `navigate('/home')` | 코드 확인: `useEffect` + `isAuthenticated` 감지 구현 ✅ | ✅ |
| F-01-3 | 언어 선택 Chip | `[STATIC]` | i18n locale 전환 | VI/EN/KO 드롭다운 + 텍스트 즉시 변경 ✅ 휴먼 확인 | ✅ 휴먼 확인 |
| F-01-4 | 시작/로그인 CTA | `[STATIC]` | navigate(`/auth/phone`) | 시작하기·로그인 버튼 모두 `/auth/phone` 이동 ✅ 휴먼 확인 | ✅ 휴먼 확인 |

### 2.2 AUTH-001 / AUTH-001-E · 번호 입력

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-02-1 | 국가코드(+84) 표시 | `[STATIC]` | — | 좌측 prefix `+84` 노출 | ✅ 휴먼 확인 |
| F-02-2 | 번호 실시간 포맷팅 | `[STATIC]` | 정규식(6~12자리) | 유효하지 않은 입력 시 버튼 비활성화로 처리 (에러 메시지 대신). 명세와 UX 패턴 다르나 동작 안전 | ✅ 휴먼 확인 |
| F-02-3 | 유효성 실패 시 에러 표시 | `[STATIC]` | — | 짧은 번호 입력 시 버튼 비활성화로 처리 (에러 메시지 미노출) — 명세는 에러 메시지 명시, 실제는 버튼 disable | ✅ 휴먼 확인 (패턴 상이) |
| F-AUTH-REG | 회원 등록(passcode 발급) | `[BFF]` | `POST /api/bff/auth/register` (body `{phone}`) | Network탭 200 확인 ✅ 휴먼 확인; 신규→profile-setup, 기존→home 분기 정상 | ✅ 휴먼 확인 |
| F-AUTH-PROXY | nginx 라우팅 정상 | infra | — | nginx → BFF 200 확인 ✅ | ✅ |

### 2.3 AUTH-002 / AUTH-002-E · OTP / Passcode 입력

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-02-5 | 6자리 박스 자동 포커스 이동 | `[STATIC]` | — | `inputsRef` + `focus()` 이동 구현 ✅ | ✅ |
| F-02-6 | 카운트다운 타이머(mm:ss) | `[STATIC]` | — | 180초 `setInterval` 구현 ✅ | ✅ |
| F-02-7 | 재전송 활성화 | `[BFF]` | `POST /api/bff/auth/register` 재호출 | ❌ **결함**: 재전송 버튼이 `setSeconds(180)` 타이머 리셋만 하고 BFF register 재호출 없음 | ❌ |
| F-AUTH-LOGIN | 코드 검증(로그인) | `[BFF]` | `POST /api/bff/auth/login` (body `{phone, passcode}`) | ❌ **결함**: OtpInput이 BFF login 미호출 — 더미 검증(`000000`=실패, 나머지=성공), `loginFromBackend`에 빈 user 객체(`id:''`) 전달. 실 인증 흐름은 PhoneInput에서 register 시 완료됨 | ❌ |
| F-02-9 | 검증 실패 — Shake 애니메이션 | `[STATIC]` | — | `error` state + `styles.otpCellError` 구현 ✅ (Shake CSS는 브라우저 확인 필요) | ✅ |

### 2.4 PROFILE-SETUP · 라이더 프로필 설정

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-03-1 | 닉네임 입력 / 유효성 | `[STATIC]` | — | 2~12자 제한 구현. ⚠️ 휴먼 확인: 한 글자 입력 시 버튼 활성화 보고 — 한국어 IME 조합 이슈 가능성, 재확인 필요 | 🟡 |
| F-03-1-b | 라이더 타입 카드 아이콘 | `[STATIC]` | — | ~~❌ 출퇴근러·나이트라이더 404~~ → 🔧 emoji 코드 교체(1f3cd·1f31f) 후 ✅ 휴먼 확인 완료 | ✅ 수정 확인 |
| F-03-2 | 닉네임 중복 확인 | `[BFF]` | `GET /api/bff/profile/check-nickname?nickname=...` | ❌ **결함**: ProfileSetup에 check-nickname 호출 없음. BFF API 자체는 200 `{available:true}` 정상 | ❌ |
| F-03-3 | 라이더 타입 선택 | `[STATIC]` | 3개 라디오(COMMUTER/CAFE_HUNTER/NIGHT_RIDER) | 클릭 시 `selected` CSS + state 반영 ✅ | ✅ |
| F-03-4 | 프로필 저장 → 홈 | `[BFF]` | `PUT /api/bff/profile` (body `{user_id, nickname, rider_type}`) | ❌ **결함 2건**: ① `setProfile(nickname, style)` Zustand만 업데이트, BFF PUT 미호출. ② `rider_type` 소문자(`night_rider`) 전송 시 BFF 400 (대문자 `NIGHT_RIDER` 필요) | ❌ |
| F-03-5 | 진행 단계 Dot Indicator | `[STATIC]` | — | 3단계 중 2번째 dot active ✅ | ✅ |
| F-03-6 | 기본 프로필 사진 | `[BFF]` | `UserOut.avatar_url` 기본값(`saigon-default.jpg`) | register 응답 `avatar_url` = imgproxy URL 확인 ✅ (화면 표시는 별도 확인 필요) | ✅ |

### 2.5 HOME-001 (LOADING / EMPTY 포함) · 월드맵 홈

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-04-1 | 사용자 정보 로드 | `[BFF]` | `GET /api/bff/auth/me?phone=...` (현 구현) | 응답: `{id, nickname, level, exp, xp, gold, skill_pt, avatar_url, rider_type}` | ✅ 휴먼 확인 |
| F-04-2 | 레벨 진행도 Progress Bar | `[STATIC]` | getMe 데이터 기반 % 계산 | 시각적 % 일치 확인 | ✅ 휴먼 확인 |
| F-04-3 | 재화 카운팅 애니메이션 | `[STATIC]` | — | 카드 진입 시 0→실제값 카운트업 | ✅ 휴먼 확인 |
| F-04-4 | 알림 뱃지 (미읽음 수) | `[BFF]` | `GET /api/bff/notifications?user_id=…` → `{unread_count}` | 응답의 `unread_count` 값이 뱃지에 반영되는지 확인 | ⬜ |
| F-04-5 | SVG 월드맵 렌더 | `[STATIC]` | 정적 SVG | 구역 폴리곤·강 표시, 줌/팬 동작 확인 | ✅ 휴먼 확인 |
| F-04-6 | 퀘스트 핀 로드 / 클릭 이동 | `[BFF]` | `GET /api/bff/quests/pins` | 응답: `[{id, lat, lng, ...}]`; 핀 클릭 → `/quests/{id}` | ✅ 휴먼 확인 |
| F-04-7 | 추천 퀘스트(Tonight's Pick) | `[BFF]` | `GET /api/bff/quests/recommended` | 200 응답의 퀘스트 카드가 우측 하단 패널 노출; null이면 EMPTY 상태 | ✅ 휴먼 확인 |
| F-04-8 | 로딩 스켈레톤 | `[STATIC]` | — | 네트워크 throttle 후 진입 시 스켈레톤 표시 | ⬜ |
| F-04-9 | 빈 상태 UI | `[STATIC]` | — | DB에서 quests 행 없는 상태 진입 시 안내 메시지 | ⬜ |
| F-04-10 | 하단 탭바 | `[STATIC]` | — | 월드 / 퀘스트 / FAB / 피드 / 프로필 5개 노출 + 라우팅 | ✅ 휴먼 확인 |

### 2.6 QUEST-LIST / QUEST-LIST-EMPTY · 퀘스트 목록

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-05-1 | 세그먼트 탭 (오늘/주간/이벤트) | `[STATIC]` | — | 클릭 시 active 표시 + 필터 파라미터 변경 | ✅ 휴먼 확인 |
| F-05-2 | 필터 Chip (구역/타입/안전등급) | `[STATIC]` | — | Chip 선택 상태 유지 + API 호출 시 쿼리 반영 | ❌ 수정 완료: useEffect deps에 activeFilter 누락 → FILTER_DISTRICT 맵 추가 + deps 수정 |
| F-05-3 | 퀘스트 카드 로드 | `[BFF]` | `GET /api/bff/quests?period=DAILY&district=...&safety_grade=...` | 200 응답의 카드 리스트 렌더, HOT/NEW/LIMITED 뱃지 표시 | ✅ 휴먼 확인 |
| F-05-4 | 결과 0건 빈 상태 | `[STATIC]` | — | 매칭 없는 필터 조합 → 일러스트 + 안내 표시 | ⛔ N/A: 필터 버그로 0건 재현 불가 (수정 후 재점검 가능) |
| F-05-5 | 필터 초기화 | `[STATIC]` | — | Chip 모두 해제, 리스트 재호출 | ⬜ |
| F-05-6 | 카드 → 상세 이동 | `[STATIC]` | navigate(`/quests/{id}`) | 정상 진입 확인 | ✅ 휴먼 확인 |

> **현재 mock 상태**: `frontend/src/api/quests.ts` 의 `fetchQuests`는 mock 응답을 우선 반환. `VITE_USE_MOCK=false` 빌드로 실 API 점검 필요.

> **⚠️ 아키텍처 개선 필요 (추후 태스크)**
> 1. **District Chip 동적화**: 현재 "Quận 1" 하드코딩 → `GET /api/bff/quests/districts` 엔드포인트 추가 후 동적 로드 필요. DB district 값과 프론트 불일치 방지.
> 2. **출퇴근/야간 Chip BFF 미지원**: `💼 출퇴근` · `🌙 야간` 칩은 현재 BFF에 대응 파라미터 없음 (전체 조회). `badge` 컬럼 또는 별도 `quest_type` 필드로 구분 후 API 파라미터화 필요.
> 3. **안전A Chip**: BFF `safety_grade` 파라미터 지원 확인 → 프론트 연결 완료 (260514). DB 퀘스트에 `min_safety_grade='A'` 데이터 추가 필요.
> 4. **Test Quest district 업데이트**: `district = 'Quận 1'` 로 직접 UPDATE 완료 (260514). 실 시드 SQL에도 반영 필요.

### 2.7 QUEST-DETAIL / QUEST-DETAIL-LOCK · 퀘스트 상세

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-06-1 | 상세 정보 로드 | `[BFF]` | `GET /api/bff/quests/{id}` | 응답에 히어로 이미지·설명·조건·보상 포함 | ⬜ |
| F-06-2 | 북마크 토글 | `[BFF]` | `POST /api/bff/quests/{id}/bookmark` | 200 `{bookmarked: bool}` + 아이콘 상태 반전; DB `user_quests` 갱신 | ⬜ |
| F-06-3 | 공유(딥링크 복사) | `[DEVICE]` | navigator.share or clipboard | 모바일/PWA에서 공유 시트 노출 | ⬜ |
| F-06-4 | 참여중 친구 아바타 | `[BFF]` | `GET /api/bff/quests/{id}/participants` | 상위 50명 아바타 표시 | ⬜ |
| F-06-5 | 퀘스트 시작 → HUD | `[BFF]` | `POST /api/bff/quests/{id}/accept` → navigate(`/ride/active`) | 200 응답 후 HUD 진입; DB `user_quests` insert | ⬜ |
| F-06-6 | 잠금 모달(레벨 미달) | `[STATIC]` | 클라이언트 비교 | 사용자 level < quest.min_level 시 잠금 모달 + "시작" 버튼 비활성 | ⬜ |

### 2.8 RIDE-ACTIVE / RIDE-PAUSE / RIDE-GPS-ERROR · 주행 HUD

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-07-1 | GPS 추적 시작 | `[DEVICE]` | `navigator.geolocation.watchPosition` | 권한 허용 후 위치 갱신 로그 | ⬜ |
| F-07-2 | 실시간 이동거리(Haversine) | `[STATIC]` | — | 좌표 변화에 따라 거리 누적 | ⬜ |
| F-07-3 | SVG 링 게이지 | `[STATIC]` | — | 진행률 % 시각화 | ⬜ |
| F-07-4 | 주행 시간 카운트업 | `[STATIC]` | — | mm:ss 1초마다 증가 | ⬜ |
| F-07-5 | 평균 속도 | `[STATIC]` | distance / time | km/h 표시 | ⬜ |
| F-07-6 | 안전 등급 실시간 | `[BFF]` | `POST /api/bff/ride/safety-grade` (body 텔레메트리) | A/B/C 응답을 주기적으로 받음 — 속도/제동 횟수 기반 룰: speed>50 +2, >35 +1, brakes>10 +2, >5 +1; total 0→A, 1→B, 3+→C | ⬜ |
| F-07-7 | GPS 신호 강도 아이콘 | `[DEVICE]` | `position.coords.accuracy` 활용 | 3단계 바 표시 | ⬜ |
| F-07-8 | 라이딩 스트릭 | `[BFF]` | `GET /api/bff/ride/streak` | 200 `{current, longest}` | ⬜ |
| F-07-9 | 일시정지 BottomSheet | `[STATIC]` | — | 정지 버튼 → 미니맵·현재 통계 표시 | ⬜ |
| F-07-10 | 계속/종료 분기 | `[STATIC]` | — | 종료 시 결과 화면으로 이동 | ⬜ |
| F-07-11 | GPS 에러 오버레이 | `[STATIC]` | — | watchPosition 에러 코드 1/2 발생 시 표시 | ⬜ |
| F-07-12 | OS 위치 설정 딥링크 | `[DEVICE]` | — | iOS/Android에서 설정 앱 호출 | ⬜ |

### 2.9 RIDE-RESULT-S / RIDE-RESULT-F · 라이딩 결과

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-08-1 | 보상 정산(성공) | `[BFF]`+`[SRE]` | `POST /api/bff/ride/submit` → BFF 내부에서 `engine_client.post_event(action_code="RIDE_KM")`, 퀘스트 완료 시 `"QUEST_COMPLETE"` | 응답에 reward 포함; DB `rp_transaction` `tx_type=EARN` 행 추가; `sre_user.lifetime_earned` 증가 | ⬜ |
| F-08-2 | Confetti 애니메이션 | `[STATIC]` | — | 성공 결과 진입 시 confetti 표시 | ⬜ |
| F-08-3 | 첫 클리어 보너스 배너 | `[STATIC]` | firstClear 플래그 | 응답에 firstClear=true 일 때만 배너 | ⬜ |
| F-08-4 | 피드에 공유 | `[BFF]`+`[SRE]` | `POST /api/bff/feed` → engine `SHARE_SNS` 이벤트 | 200 응답; DB `feed_posts` insert; Engine `action_event` insert 확인 | ⬜ |
| F-08-5 | 실패 결과 표시 | `[STATIC]` | — | 사유 + 달성거리 Progress | ⬜ |
| F-08-6 | 위로 보상(+20 EXP) | `[BFF]` | `POST /api/bff/ride/submit` (failed flag) | 응답 reward.exp=20 | ⬜ |
| F-08-7 | 재도전 분기 | `[STATIC]` | navigate | 다시 도전 / 다른 퀘스트 버튼 라우팅 | ⬜ |

### 2.10 FEED-001 / FEED-EMPTY / FEED-COMMENT · 소셜 피드

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-09-1 | 스토리 아바타 목록 | `[BFF]` | `GET /api/bff/feed/stories` | 상단 가로 스크롤 아바타 | ❌ 수정 완료: 하드코딩 mock(@minh 등) → `fetchStories()` 실 API 연결. DB에 is_story=true 게시물 없어 현재 빈 상태 정상 |
| F-09-2 | 피드 카드 로드 | `[BFF]` | `GET /api/bff/feed?filter=all&page=1&limit=20` | 카드 이미지/EXP/거리/안전도 표시; `filter=hot` 정렬 검증 | ✅ 휴먼 확인 (실 DB 데이터 노출) |
| F-09-3 | 필터 Chip 전환 | `[STATIC]` + 쿼리파라미터 | filter ∈ all / neighborhood / friends / hot | 클릭 시 쿼리 갱신 + 재호출 | 🟡 파라미터 전달은 ✅. 단 BFF가 neighborhood/friends에 WHERE 미적용 → 모든 필터에 전체 게시물 노출 (BFF 미구현) |
| F-09-4 | 응원(Like) 토글 | `[BFF]` | `POST /api/bff/feed/{post_id}/like` | 200 응답 `{liked, count}`; DB `feed_likes` 토글 | ✅ 휴먼 확인 |
| F-09-5 | 댓글 BottomSheet 열기 | `[STATIC]` | — | 댓글 아이콘 → 시트 오픈 | ✅ 휴먼 확인 |
| F-09-6 | 댓글 목록 로드 | `[BFF]` | `GET /api/bff/feed/{post_id}/comments` | 텍스트/이미지/대댓글 트리 표시 | ✅ 수정 완료: BFF `get_comments()` JOIN User 추가 + `_enrich_comment()` 헬퍼로 닉네임·아바타 포함 |
| F-09-6a | 댓글 닉네임 표시 | `[BFF]` | `GET /api/bff/feed/{post_id}/comments` → `user_nickname` 필드 포함 | 댓글 목록 내 작성자 닉네임(user_nickname) 노출 여부 | ✅ 수정 완료: BFF `outerjoin(User)` 추가, `CommentOut` 스키마에 `user_nickname` 포함 |
| F-09-6b | 댓글 아바타 표시 | `[BFF]` | `GET /api/bff/feed/{post_id}/comments` → `user_avatar_url` 필드 포함 | 피드 카드 아바타와 동일 방식으로 표시 여부 (imgproxy URL) | ✅ 수정 완료: `_enrich_comment()`에서 `default_avatar_url()` fallback 포함하여 반환 |
| F-09-6c | 댓글 좋아요 기능 | `[BFF]` | `POST /api/bff/feed/{post_id}/comments/{comment_id}/like` | ♥ 클릭 → BFF 호출 + 카운트 반영 | ✅ 수정 완료: DB `post_comment_likes` 테이블 + `post_comments.like_count` 컬럼 추가. BFF `toggle_comment_like()` 엔드포인트 신설. 프론트 `handleCommentLike()` + `toggleCommentLike()` 연결. `iLiked` active 스타일 적용 |
| F-09-7 | 댓글 작성 | `[BFF]` | `POST /api/bff/feed/{post_id}/comments` (body `{content, parent_id?}`) | 200 후 즉시 리스트 갱신 | ❌ 수정 완료: `postComment()` BFF 연결. 이전엔 로컬 state만 업데이트 |
| F-09-8 | 사진 댓글 첨부 | `[DEVICE]`+`[BFF]` | `POST /api/bff/contents/upload` (multipart) → content_id 로 댓글 작성 | 업로드 후 imgproxy URL 미리보기 | ⬜ |
| F-09-9 | 공유 버튼 | `[DEVICE]` | navigator.share | 시스템 시트 노출 | ⬜ |
| F-09-10 | 빈 상태 | `[STATIC]` | — | 피드 0건 시 안내 표시 | ⛔ N/A: 현재 게시물 존재로 재현 어려움 |
| F-09-11 | 피드 이미지 스켈레톤 로딩 | `[STATIC]` | — | 이미지 다운로드 중 shimmer 스켈레톤 → onLoad 시 fade-in 전환 | ✅ 260515 신규 구현: `PostImage` 컴포넌트, `@keyframes shimmer` CSS |
| F-09-12 | 피드 이미지 라이트박스 뷰어 | `[STATIC]` | — | 이미지 클릭 → 전체화면 뷰어. 핀치줌(1x~5x), 더블탭 토글(1x↔2.5x), 팬, 스와이프다운 닫기, 배경클릭 닫기, 마우스휠(데스크톱) | ✅ 260515 신규 구현: `ImageViewer` 컴포넌트 (`createPortal`), touch 제스처 핸들러 |

> **⚠️ 아키텍처/이슈 메모 (추후 태스크)**
> 1. **피드 이미지 미표시 → 수정 완료 (260514)**: 원인은 시드 데이터의 `image_url`이 `local:///official/grand-opening.jpg`를 참조했으나 imgproxy `/data/official/` 디렉토리가 비어 있어 404. `official/`은 운영자 공식 에셋용이므로, 피드 테스트 게시물의 `image_url`을 `user-contents` 내 실제 파일 imgproxy URL로 DB UPDATE 완료. ⚠️ 피드 시드 SQL 파일이 별도 존재하지 않으므로 DB 초기화 시 재현 안 됨 — **시드 SQL 추가 필요**.
> 2. **neighborhood/friends 필터 BFF 미구현**: BFF `get_feed()`에 location/follow WHERE 조건 없음 — 전체 게시물 반환. 팔로우 테이블 설계 후 WHERE 추가 필요.
> 3. **스토리 등록 기능 미구현** ⛔ 후속 태스크 필요: `POST /feed` 의 `is_story=true` 플래그는 존재하나 사용자용 업로드 UI 없음. 구현 범위: 카메라/갤러리 촬영 → `POST /api/bff/contents/upload` → `POST /api/bff/feed` (`is_story=true`) → 스토리 strip 즉시 반영.
> 4. **피드 게시물 등록 기능 미구현** ⛔ 후속 태스크 필요: 현재 피드는 라이딩 결과(`/ride/result/success`)에서 "피드에 공유" 버튼으로만 게시 가능. 독립적인 피드 작성(사진 선택 + 캡션 입력 + 해시태그) UI 없음. 구현 범위: 📷 버튼(`TopBar` 우측) 또는 하단 FAB → 작성 바텀시트/페이지 → `POST /api/bff/contents/upload` + `POST /api/bff/feed`.

> **현재 mock 상태 (260515 기준)**: `frontend/src/api/feed.ts` — `fetchFeed`, `toggleCheer` 여전히 mock 처리(`USE_MOCK` 분기). `fetchComments`, `postComment`, `fetchStories`, `toggleCommentLike`는 실 API 연결 완료. ⚠️ `fetchFeed`/`toggleCheer`의 mock→실 API 전환은 별도 확인 필요 (`VITE_USE_MOCK=false` 빌드 상태이므로 실 API 호출 중일 가능성 있음).

### 2.11 PROFILE-001 / BADGE-DETAIL · 프로필

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-10-1 | 프로필 정보 로드 | `[BFF]` | `GET /api/bff/auth/me?phone=...` | 응답: 닉네임/레벨/타입/avatar_url | ⬜ |
| F-10-2 | 레벨 진행도 바 | `[STATIC]` | — | exp / next_level_exp % | ⬜ |
| F-10-3 | 재화 카드 | `[STATIC]` | getMe 데이터 | XP/Gold/Skill Pt 카드 | ⬜ |
| F-RP | RP 잔액 표시 | `[BFF]`+`[SRE]` | `GET /api/bff/profile/{user_id}/rp-balance` → 내부 `engine_client.get_balance()` | 응답: `{current_balance, lifetime_earned, lifetime_spent, expiring_in_30d, tier}` | ⬜ |
| F-10-4 | 이번 달 통계 | `[BFF]` | `GET /api/bff/users/me/stats?user_id=…` → `{month, total_km, quest_count, avg_safety_grade}` | 응답값이 통계 카드에 표시되는지 확인 | ⬜ |
| F-10-5 | 월별 주행 미니 차트 | `[BFF]` | `GET /api/bff/ride/history?page=1&limit=N` | SVG 차트 데이터 시각화 | ⬜ |
| F-10-6 | 탭 전환(기록/배지/장비) | `[STATIC]` | — | active 상태 전환 | ⬜ |
| F-10-7 | 최근 라이딩 기록 | `[BFF]` | `GET /api/bff/ride/history` | 목록 렌더링 | ⬜ |
| F-10-8 | 배지 상세 모달 | `[BFF]` | `GET /api/bff/badges/{id}` → `{name, description, icon_url, condition_type, condition_value}` | 배지 상세 모달에 정보 표시 확인 | ⬜ |
| F-10-9 | 프로필 사진 변경 | `[DEVICE]`+`[BFF]` | `POST /api/bff/profile/avatar` (multipart `file`, `user_id`) | 200 응답 `{user, content_id}`; DB `users.avatar_content_id` 갱신; 이미지 변경 즉시 반영 | ⬜ |
| F-10-10 | 닉네임 변경 | `[BFF]` | `PUT /api/bff/profile/nickname` (body `{user_id, nickname}`) | 중복 시 409; 정상 시 200 + 프로필 갱신 | ⬜ |

### 2.12 SETTINGS · 설정 메인

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-1 | 미니 프로필 카드 → 편집 이동 | `[STATIC]` | navigate(`/profile`) | 카드 클릭 시 프로필 화면 진입 | ⬜ |
| F-11-2 | 다크 모드 토글 | `[STATIC]` | body class 토글 + localStorage | 토글 후 새로고침 시에도 유지 | ⬜ |
| F-11-3 | 위치 권한 상태 | `[DEVICE]` | `navigator.permissions.query({name:'geolocation'})` | granted/prompt/denied 표시 | ⬜ |
| F-11-4 | 로그아웃 | `[STATIC]` | localStorage 삭제 + navigate(`/splash`) | 새로고침 시에도 미로그인 유지 | ⬜ |

### 2.13 SET-NOTI · 알림 설정

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-5 | 알림 토글 저장 | `[BFF]` | `PUT /api/bff/notifications/settings` body `{user_id, quest_recommend, quest_expire, event, ride_result, social}` | 토글 변경 후 재조회 시 값 일치 확인 | ⬜ |

### 2.14 SET-LANG · 언어 설정

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-6 | 언어 선택 (KO/VI/EN) | `[STATIC]` | i18n locale 즉시 적용 | 선택 시 모든 화면 텍스트 변환, localStorage 영속 | ⬜ |

### 2.15 SET-ACCOUNT · 계정 관리

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-7 | 계정 정보 조회 | `[BFF]` | `GET /api/bff/auth/me?phone=...` | 휴대폰/가입일/계정ID 표시 | ⬜ |
| F-11-8 | 계정 ID 복사 | `[DEVICE]` | `navigator.clipboard.writeText` | 복사 후 토스트 표시 | ⬜ |
| F-11-9 | 데이터 다운로드 요청 | `[BFF]` | `POST /api/bff/users/export?user_id=…` → `{request_id, status:"QUEUED", estimated_ready_at}` | 200 응답 + toast 표시 확인 | ⬜ |
| F-11-10 | 계정 탈퇴 | `[BFF]` | `DELETE /api/bff/users/me?user_id=…` → 204 + CASCADE 삭제 | 위험 모달 → 확인 → 204 응답 → 로그인 화면 이동 확인 | ⬜ |

---

## 3. 엔진(SRE) 기능 점검

엔진은 **별도 컨테이너(`saigon_engine` :8090)** 로 동작하며, BFF는 `engine_client` HTTP 클라이언트(서비스 키 인증)를 통해서만 호출한다. 모바일 앱은 엔진을 **직접 호출할 수 없다**(Nginx `/engine/`은 내부 네트워크만 허용).

### 3.1 화면 ↔ 엔진 연계 매트릭스

| 트리거 화면 | 사용자 행동 | BFF 라우터 | Engine 호출 | Engine 액션 코드 | 사이드이펙트 | 상태 |
|---|---|---|---|---|---|---|
| RIDE-RESULT-S | 라이딩 종료 제출 | `ride.submit_ride()` | `POST /v1/events` × 1 | `RIDE_KM` | `rp_transaction` EARN, `sre_user.lifetime_earned` ↑, mission progress 갱신 | ⬜ |
| RIDE-RESULT-S | 퀘스트 완료 동반 | `ride.submit_ride()` | `POST /v1/events` × 1 (추가) | `QUEST_COMPLETE` | mission progress + RP EARN | ⬜ |
| RIDE-RESULT-S / FEED-001 | 결과 공유 / 피드 작성 | `feed.create_feed_post()` | `POST /v1/events` × 1 | `SHARE_SNS` | RP EARN, SHARE 카테고리 diversity 누적 | ⬜ |
| PROFILE-001 | RP 잔액 조회 | `profile.get_rp_balance()` | `GET /v1/users/{id}/balance` | — (조회) | 응답 캐시 없음(실시간) | ⬜ |
| (미정) | 친구 초대 | `users.*` (P2 ROADMAP) | `POST /v1/events` | `REFERRAL` | 등록 자 발생 시 1회 | ⬜ |

### 3.2 Engine API 점검 항목 (서비스간 직접 호출)

> 점검용 호출은 BFF 내부에서만 가능하나, 점검 편의를 위해 `docker exec saigon_bff sh -c 'curl ...'` 또는 호스트에서 `X-Service-Key` 헤더로 `localhost:18090/engine/...`(IP 제한 해제 시) 사용 가능.

| 엔드포인트 | Method | 인증 | 용도 | 점검 | 상태 |
|---|---|---|---|---|---|
| `/v1/events` | POST | `X-Service-Key` | 액션 이벤트 발행 (RP 파이프라인) | 멱등키 동일값 재호출 시 동일 응답·중복 적립 없음. `action_event` insert 1건만 확인 | ⬜ |
| `/v1/events/{event_id}` | GET | `X-Service-Key` | 이벤트 단건 조회 | event_id로 status/processed_at 확인 | ⬜ |
| `/v1/users/{user_id}/balance` | GET | `X-Service-Key` | 잔액 / lifetime / 만료예정 / 등급 | `current_balance == lifetime_earned − lifetime_spent − expired` 검증 | ⬜ |
| `/v1/users/{user_id}/transactions` | GET | `X-Service-Key` | 트랜잭션 페이지네이션 | `tx_type` 쿼리 EARN/REDEEM/EXPIRE/ADJUST_PLUS/ADJUST_MINUS/REFUND 필터 | ⬜ |
| `/v1/users/{user_id}/expirations` | GET | `X-Service-Key` | N일 내 만료예정 RP | `?days=30` 응답 합 == `expiring_in_30d` | ⬜ |
| `/v1/users/{user_id}/missions` | GET | `X-Service-Key` | 사용자 미션 진행도 | `status=ACTIVE/COMPLETED/EXPIRED/CANCELLED`, `category` 필터 | ⬜ |
| `/v1/users/{user_id}/missions/{progress_id}` | GET | `X-Service-Key` | 단건 미션 진행도 | progress_id 단건 조회 | ⬜ |
| `/v1/users/{user_id}/missions/{progress_id}/abandon` | POST | `X-Service-Key` | 미션 포기 | 상태가 CANCELLED로 변경 | ⬜ |
| `/v1/catalog` | GET | `X-Service-Key` | 보상 카탈로그 목록 | `is_active=true`, `visible_from/until` 게이트 통과 항목만 | ⬜ |
| `/v1/catalog/{catalog_id}` | GET | `X-Service-Key` | 카탈로그 단건 | 활성 항목만 노출 | ⬜ |
| `/v1/users/{user_id}/redemptions` | POST | `X-Service-Key` | 보상 교환(차감) | RP 부족 시 402, 재고/노출기간 외 409; 정상 시 PENDING/APPROVED | ⬜ |
| `/v1/users/{user_id}/redemptions` | GET | `X-Service-Key` | 교환 내역 | `status=PENDING/APPROVED/REJECTED/FULFILLED` | ⬜ |
| `/v1/users/{user_id}/redemptions/{id}` | GET | `X-Service-Key` | 교환 단건 | 단건 상태 확인 | ⬜ |
| `/v1/admin/action-definitions` | GET/POST/PUT | Admin JWT | 액션 정의 CRUD | `verify_admin_jwt` 통과 필요 | ⬜ |
| `/v1/admin/users/{user_id}` | GET | Admin JWT | 유저 요약 + 잔액 + 등급 | 단건 어드민 조회 | ⬜ |
| `/v1/admin/users/{user_id}/adjust` | POST | Admin JWT | 수동 RP 가감 | `audit_log` 1행 추가 + `rp_transaction` ADJUST_PLUS/MINUS | ⬜ |
| `/v1/admin/audit-logs` | GET | Admin JWT | 감사 로그 | 페이지네이션 | ⬜ |

### 3.3 Engine 서비스 레이어 점검 포인트

| 서비스 | 책임 | 점검 시나리오 | 상태 |
|---|---|---|---|
| `event_bus.py` | 이벤트 처리 파이프라인 11단계 (멱등→검증→어뷰징→일일캡→다양성→RP계산→트랜잭션→미션→등급) | 동일 idempotency_key 두 번 호출 → 1건만 처리. 동일일자 RIDE_KM 다회 호출 시 일일캡(`SRE_DAILY_CAP_STANDARD=250`) 초과분 미적립 | ⬜ |
| `point_ledger.py` | 잔액 / 트랜잭션 / 일일적립 | EARN 후 `rp_balance.current_balance` 증가. 만료 시 EXPIRE 트랜잭션 | ⬜ |
| `anti_abuse.py` | GPS_SPEED_RANGE(REJECT), DUPLICATE_RECEIPT(REJECT), NEW_ACCOUNT_50(REDUCE), DAILY_RP_CAP(CAP) | 가입 3일 이내 계정은 적립 ×0.5 적용; 비현실 속도 페이로드 → 거부 | ⬜ |
| `diversity.py` | 카테고리 다양성 배율 (월 단위) | 한 달 내 1~5종 카테고리 활동 → 배율 1.0 / 1.0 / 1.2 / 1.4 / 1.6 (최대 2.0) | ⬜ |
| `mission.py` | 액션 → 미션 진행도 누적 | 매핑된 액션 발생 시 `user_mission_progress.progress` ↑, 목표 도달 시 COMPLETED | ⬜ |
| `tier.py` | 등급 재평가 | 누적 lifetime_earned 임계 도달 시 `user_tier` 갱신 | ⬜ |
| `reward.py` | 보상 교환 트랜잭션 | RP 차감 + `reward_redemption` 생성 (멱등 보장) | ⬜ |
| `audit.py` | 모든 상태변경 감사 로그 | 어드민 adjust 후 `audit_log.entity_type/action_code/before/after` 적재 | ⬜ |

### 3.4 Engine 배치 잡 (APScheduler — VN 시간)

| 잡 | 스케줄 | 동작 | 점검 | 상태 |
|---|---|---|---|---|
| `expire_rp.py` | 매일 04:00 | 만료된 RP를 EXPIRED 처리·잔액 차감·EXPIRE 트랜잭션 적재 | 실행 후 `rp_expiration_schedule.status=EXPIRED`, 동일 금액 `rp_transaction` EXPIRE 행 존재 | ⬜ |
| `expire_missions.py` | 매일 04:05 | 만료된 미션 EXPIRED 마크 | `user_mission_progress.expires_at < now()` 행이 EXPIRED 로 전환 | ⬜ |
| `cleanup_idem.py` | 매일 04:10 | 멱등키 TTL 만료분 삭제 (`SRE_IDEMPOTENCY_TTL_DAYS=7`) | 7일 경과 `idempotency_key` 삭제 확인 | ⬜ |
| `verify_balance.py` | 매일 04:30 | `rp_balance` 캐시와 트랜잭션 합 일치 검증 — 불일치 시 structlog 경고 | 일부러 캐시 변조 후 잡 실행 → 로그에 mismatch 출력 | ⬜ |

**잡 수동 실행 점검 (개발 환경)**:
```bash
docker exec saigon_engine python -m app.jobs.expire_rp
docker exec saigon_engine python -m app.jobs.verify_balance
```

### 3.5 Engine 관측성 / 운영

| 항목 | 점검 | 상태 |
|---|---|---|
| Prometheus 메트릭 | `curl http://localhost:18090/api/sre/metrics` (또는 `/v1/metrics`) — counter/histogram 노출 확인 | ⬜ |
| structlog JSON 로깅 | `docker logs saigon_engine` — 키-값 JSON 형태로 출력 | ⬜ |
| 헬스체크 | `curl -i http://localhost:18090/api/sre/healthz` → 200 | ⬜ |
| 단위 테스트 | `docker exec saigon_engine pytest app/tests/` — `test_event_bus`, `test_point_ledger`, `test_anti_abuse` 통과 | ⬜ |
| 환경변수 | `.env` — `ENGINE_SERVICE_KEY`, `ENGINE_ADMIN_JWT_SECRET`, `SRE_DAILY_CAP_*`, `SRE_NEW_ACCOUNT_*`, `SRE_RP_EXPIRY_MONTHS` 설정 여부 | ⬜ |

### 3.6 데이터 정합성 점검 SQL

```sql
-- 1. 잔액 == 트랜잭션 합산 일치 검증
SELECT u.external_user_uuid,
       b.current_balance,
       COALESCE(SUM(CASE WHEN t.tx_type IN ('EARN','ADJUST_PLUS','REFUND') THEN t.amount
                         WHEN t.tx_type IN ('REDEEM','EXPIRE','ADJUST_MINUS') THEN -t.amount
                    END),0) AS computed
  FROM sre_user u
  JOIN rp_balance b ON b.user_id = u.id
  LEFT JOIN rp_transaction t ON t.user_id = u.id
 GROUP BY u.external_user_uuid, b.current_balance
HAVING b.current_balance <> COALESCE(SUM(...),0);  -- 결과 0행이 정상

-- 2. 멱등키 중복 처리 없음
SELECT idempotency_key, COUNT(*) FROM idempotency_key GROUP BY 1 HAVING COUNT(*) > 1;

-- 3. 신규 계정 0.5배 적용 확인
SELECT ae.*, t.amount, t.applied_multiplier
  FROM action_event ae JOIN rp_transaction t USING (event_id)
 WHERE ae.user_id = '<신규 가입 3일 이내 user uuid>'
 ORDER BY ae.occurred_at;

-- 4. 일일 적립 캡 확인 (STANDARD=250)
SELECT user_id, occurred_at::date AS day, SUM(amount) AS daily_earn
  FROM rp_transaction
 WHERE tx_type = 'EARN'
 GROUP BY 1,2 HAVING SUM(amount) > 250;
```

---

## 4. 시스템 전반 점검 체크리스트 (요약)

### 4.1 인프라 / 컨테이너

- [ ] `docker compose --env-file .env --profile backend up -d` 정상 기동
- [ ] `saigon_nginx`, `saigon_frontend`, `saigon_bff`, `saigon_engine`, `saigon_db`, `saigon_imgproxy` 모두 `Up`
- [ ] 포트: `NGINX_PORT=18090`, `BACKEND_PORT=18080`(예시), `ENGINE_PORT=8090`, `DB_PORT=15432` 등 충돌 없음
- [ ] `docker logs saigon_bff` 기동 직후 에러 없음, `docker logs saigon_engine` Alembic head 적용 완료 로그

### 4.2 인증 플로우 (E2E)

- [ ] `/splash` 진입 → 시작하기 → 번호 입력 → register → OTP/passcode → login → profile-setup → `/home` 정상 흐름
- [ ] localStorage `user` 객체 존재 시 `/splash` 진입이 `/home` 으로 자동 이동
- [ ] `PrivateRoute` 가드 — 미로그인 상태에서 `/home`, `/quests`, `/profile`, `/settings` 등 모두 `/splash` 리다이렉트

### 4.3 화면 라우팅 / 디자인

- [ ] §1 의 모든 URL 접근 시 404 없이 화면 렌더
- [ ] scene.html 기준 색상/컴포넌트 일치(`--brand-*`, `--ink-*`)
- [ ] 하단 탭바: WorldMap / QuestList / FAB / FeedList / ProfileMain 5개 라우트 동작

### 4.4 BFF API 호출 (네트워크 점검)

- [ ] §2.x 각 화면의 BFF 엔드포인트가 Network 탭에서 200/4xx로 정상 응답
- [ ] 401/403 등 인증 오류는 적절한 안내(로그아웃 또는 재로그인 유도)
- [x] mock 표시 항목은 `VITE_USE_MOCK=false` 빌드 후 실 API 전환 점검 가능 ✅ 2026-05-14 Dockerfile 수정 완료

### 4.5 BFF ↔ Engine 연계

- [ ] RIDE-RESULT-S 진입 시 BFF 로그에 `engine_client.post_event RIDE_KM` 호출 + Engine 로그에 200 응답
- [ ] FEED-001 게시물 작성 시 `SHARE_SNS` 이벤트 발행
- [ ] PROFILE-001 진입 시 `engine_client.get_balance` 호출 → 응답 표시
- [ ] `ENGINE_SERVICE_KEY` 미설정/오설정 시 BFF가 4xx 받고 적절한 fallback (또는 명시 실패)

### 4.6 Engine 독립 점검

- [ ] §3.2 모든 엔드포인트 200 응답
- [ ] §3.3 anti-abuse 시나리오: 신규계정/일일캡/속도이상 트래픽에서 적립 변동 확인
- [ ] §3.4 배치 잡 4종 정상 동작 (수동 실행으로 검증)
- [ ] §3.5 메트릭/로그/헬스체크 노출
- [ ] §3.6 SQL 4종 모두 0행 (정합성 OK)

### 4.7 미구현/Mock 잔여 항목 (점검 보류, 별도 트래킹)

> ✅ **2026-05-14 BFF 완수 Task 완료** — 아래 항목은 모두 BFF API로 구현되었습니다.
> 프론트엔드 연동(mock → 실 API 교체)은 별도 프론트 Task로 분리합니다.

| 함수 | 구현된 엔드포인트 | 상태 |
|---|---|---|
| `getNotifications()` | `GET /api/bff/notifications` | ✅ BFF 구현 완료 |
| `getMonthlyStats()` | `GET /api/bff/users/me/stats` | ✅ BFF 구현 완료 |
| `getBadgeDetail(id)` | `GET /api/bff/badges/{id}` | ✅ BFF 구현 완료 |
| `saveNotificationSettings()` | `PUT /api/bff/notifications/settings` | ✅ BFF 구현 완료 |
| `requestDataExport()` | `POST /api/bff/users/export` | ✅ BFF 구현 완료 |
| `deleteAccount()` | `DELETE /api/bff/users/me` | ✅ BFF 구현 완료 |
| `getStories()` 실 API | `GET /api/bff/feed/stories` | ✅ BFF 구현 완료 |
| 친구 초대 / `REFERRAL` | — | ⛔ Engine 매핑은 있으나 BFF 트리거 미구현 (후속 과제) |

---

## 5. 이슈 / 블로커 로그

> §1 ~ §4 표의 상태 컬럼이 ❌ Fail 또는 🟡 진행중(블로커 의심)으로 바뀐 항목은 여기에 상세 기록한다.
> 정상(Pass)인 항목은 본 로그에 적지 않는다.

### 5.1 발견된 이슈

| 발견일 | 기능 ID / 항목 | 화면 · 엔드포인트 | 증상(실측) | 원인 (가설/확정) | 조치 / 후속 작업 | 상태 |
|---|---|---|---|---|---|---|
| 2026-05-14 | F-09-2 피드 카드 로드 (및 전체 mock 항목) | FEED-001 · `GET /api/bff/feed` | 프론트 피드 리스트가 DB 데이터 대신 dummy mock 3건 노출 | `frontend/Dockerfile`에 `VITE_USE_MOCK` 빌드 arg 미전달 → `USE_MOCK=true` 기본값 적용 | `frontend/Dockerfile`에 `ARG VITE_USE_MOCK=false` / `ENV VITE_USE_MOCK=$VITE_USE_MOCK` 추가 후 컨테이너 리빌드 → BFF 실 데이터 정상 반환 확인 | ✅ |
| 2026-05-14 | F-09-6a 댓글 닉네임 | FEED-COMMENT · `GET /api/bff/feed/{id}/comments` | 댓글 목록에 닉네임 대신 user_id(UUID) 그대로 노출 | BFF 댓글 응답 쿼리에 `users` 테이블 JOIN 없음 → `user_nickname` 필드 미포함. `transformComment()`에서 `raw.user_nickname ?? raw.user_id` fallback으로 user_id 노출 | `get_comments()` `outerjoin(User)` 추가, `CommentOut` 스키마에 `user_nickname` 포함, `_enrich_comment()` 헬퍼 신설. 상세: `260514_comment_ux_troubleshooting.md` | ✅ |
| 2026-05-14 | F-09-6b 댓글 아바타 | FEED-COMMENT · `GET /api/bff/feed/{id}/comments` | 댓글 작성자 프로필 사진 미표시 (`<img src="undefined">`) | BFF 댓글 응답에 `user_avatar_url` 필드 누락 → 프론트 `transformComment()`에서 `undefined` 처리 | F-09-6a와 동일 수정으로 해결. `_enrich_comment()`에서 `default_avatar_url()` fallback 포함 | ✅ |
| 2026-05-14 | F-09-6c 댓글 좋아요 | FEED-COMMENT · `POST /api/bff/feed/{id}/comments/{comment_id}/like` | 댓글 ♥ 버튼 클릭 시 아무 반응 없음 | ① 프론트 onClick 핸들러 없음 ② BFF 엔드포인트 미존재 ③ DB `like_count` 컬럼·`post_comment_likes` 테이블 없음 | DB 마이그레이션(004_comment_likes.sql) + BFF `toggle_comment_like()` 신설 + 프론트 `handleCommentLike()` + `toggleCommentLike()` 구현. 상세: `260514_comment_ux_troubleshooting.md` | ✅ |
| 2026-05-14 | F-AUTH-LOGIN | AUTH-002 · OtpInput | OtpInput이 BFF `/auth/login` 미호출. 더미 검증(`000000`=실패, 나머지=성공), `loginFromBackend`에 `id:''` 빈 user 전달 | PhoneInput에서 register 완료 시 이미 로그인 처리되어 OTP 화면 거치지 않음 — OtpInput 자체가 레거시/미연동 상태 | OtpInput `handleVerify`를 `apiLogin(phone, digits.join(''))` 호출로 교체 필요 | ❌ |
| 2026-05-14 | F-02-7 | AUTH-002 · 재전송 버튼 | 재전송 버튼이 타이머만 리셋(`setSeconds(180)`), BFF register 재호출 없음 → 새 passcode 미발급 | OtpInput 재전송 핸들러에 `apiRegister` 호출 없음 | 재전송 버튼 onClick에 `apiRegister(phone)` 추가 필요 | ❌ |
| 2026-05-14 | F-03-2 | PROFILE-SETUP · 닉네임 중복확인 | ProfileSetup에서 `GET /api/bff/profile/check-nickname` 미호출. BFF는 정상 동작 | 닉네임 입력 후 중복확인 로직 없음 | 닉네임 입력 debounce + check-nickname API 연동 필요 | ❌ |
| 2026-05-14 | F-03-4 | PROFILE-SETUP · 프로필 저장 | `setProfile(nickname, style)`로 Zustand만 업데이트, `PUT /api/bff/profile` 미호출. rider_type 소문자(`night_rider`) → BFF 400 | ProfileSetup `handleSubmit`에 API 호출 없음 + rider_type 대소문자 불일치 | ① `PUT /api/bff/profile` 호출 추가 ② `rider_type` 대문자 변환 (`toUpperCase()`) | ❌ |
| 2026-05-14 | F-03-1-b | PROFILE-SETUP · 라이더 타입 카드 아이콘 | 출퇴근러(1f3d9 🏙)·나이트라이더(1f319 🌙) Google Fonts noto emoji 404 → onError로 아이콘 숨겨짐 | 체크리스트 미등재 항목 — 휴먼 점검 중 발견 | ProfileSetup.tsx emoji 코드 교체: 1f3d9→1f3cd(🏍️), 1f319→1f31f(🌟). 리빌드 완료 | 🔧 수정됨 |
| 2026-05-14 | F-03-1 | PROFILE-SETUP · 닉네임 1자 제출 가능 여부 | 휴먼 점검 중 "한 글자 입력 시 버튼 활성화" 보고 | 코드상 `length >= 2` 조건 존재 — 한국어 IME 조합 중 length 계산 차이 가능성 | 재빌드 후 재점검 필요 | 🟡 |

### 5.2 미구현 / Mock 잔여 (⛔ 분류 모음)

> **2026-05-14 갱신**: BFF 완수 Task(260514_bff_completion_task)로 대부분 구현 완료.  
> 잔여 미구현은 프론트엔드 연동(mock → 실 API) 및 REFERRAL 뿐입니다.

| 기능 ID / 함수 | 위치 | 우선순위 | 후속 작업 | 상태 |
|---|---|---|---|---|
| `getNotifications()` | HOME-001 알림 뱃지 | P2 | 프론트 연동 후 §2.5 재점검 | ✅ BFF 완료 |
| `getMonthlyStats()` | PROFILE-001 이번 달 통계 | P2 | 프론트 연동 후 §2.11 재점검 | ✅ BFF 완료 |
| `getBadgeDetail(id)` | BADGE-DETAIL 모달 | P3 | 프론트 연동 후 §2.11 재점검 | ✅ BFF 완료 |
| `saveNotificationSettings(prefs)` | SET-NOTI 토글 저장 | P3 | 프론트 연동 후 §2.13 재점검 | ✅ BFF 완료 |
| `requestDataExport()` | SET-ACCOUNT 데이터 다운로드 | P3 | 프론트 연동 후 §2.15 재점검 | ✅ BFF 완료 |
| `deleteAccount()` | SET-ACCOUNT 탈퇴 | P3 | 프론트 연동 후 §2.15 재점검 | ✅ BFF 완료 |
| `getStories()` 실 API | FEED-001 상단 스토리 | P2 | 프론트 연동 후 §2.10 재점검 | ✅ BFF 완료 |
| 친구 초대 / `REFERRAL` | (미정) BFF 라우터 | P3 | Engine 매핑은 있으나 BFF 트리거 부재 → §3.1 재점검 | ⛔ |

---

## 6. 부록 — 빠른 진단 명령

```bash
# 1. 인프라
docker compose ps
docker logs --tail=100 saigon_bff
docker logs --tail=100 saigon_engine
docker logs --tail=100 saigon_nginx

# 2. BFF 헬스 + 라우터 확인
curl -i http://localhost:18090/api/bff/auth/me?phone=%2B84xxxxxxxxxx

# 3. Engine 직접(서비스키)
curl -i http://localhost:18090/api/sre/users/<UUID>/balance \
     -H "X-Service-Key: $ENGINE_SERVICE_KEY"

# 4. DB 점검
docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM users;"
docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM action_event;"
docker exec -it saigon_db psql -U $DB_USER -d $DB_NAME -c "SELECT * FROM rp_balance ORDER BY updated_at DESC LIMIT 5;"

# 5. 배치 잡 수동 실행
docker exec saigon_engine python -m app.jobs.verify_balance
docker exec saigon_engine python -m app.jobs.expire_rp

# 6. 메트릭 / 헬스
curl http://localhost:18090/api/sre/healthz
curl http://localhost:18090/api/sre/metrics | head -50

# 7. Alembic 헤드 확인
docker exec saigon_engine alembic current
docker exec saigon_bff alembic current  # BFF Alembic 전환 시
```

---

(끝 — v1, 2026-05-14)
