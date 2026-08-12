# 출시 준비도 · 당근 대비 UX · 코드 수정 통합 작업서 (2026-08-12)

> 기준: `main` / `763bd18b95bef8916c5a6a2389caf9d01e35d5a3`
> Git: `git pull --ff-only` 실행 결과 `Already up to date`; `HEAD == origin/main`
> 결론: **서버는 응답하지만 전면 공개는 NO-GO. 코드 P0(A~E)는 수정했지만 공급·운영 RC·계측을 닫은 뒤에만 파일럿 GO.**
> 비교 결론: **현재 중고거래 편의성은 당근보다 낮다(정성 점수 5.0/10 대 8.8/10).** 호치민 오토바이 거래의 `약속 → 이동` 축만 잠재 우위다.
> 구현 상태: 이 기준 SHA 이후 **A 업체 소유권, B 위치·광고 차단, C 공개 탐색, D 마켓 우선 진입, E 판매 초안·OTP 복구를 소스에 적용**했다. F 거래 조종석과 G 계측·운영 RC는 미구현이다.
> 문서 성격: 출시 판정, UX 비교, 근거 코드, 실제 구현 결과, 남은 수정 순서와 테스트 기준을 이 파일 하나에 통합한다.

이 문서는 “프로세스가 떠 있는가”, “안전하게 공개할 수 있는가”, “사용자가 쓸 이유가 있는가”를 분리한다. `health=200`은 첫 번째만 증명한다.

---

## 1. 한눈에 보는 판정

| 질문 | 판정 | 근거 |
|---|---|---|
| 운영 웹 프로세스가 현재 응답하는가 | **YES** | `/api/bff/health` 200, 앱 셸 응답 |
| 이 PC에서 같은 상태를 재현·기동했는가 | **NO — 미검증** | Docker CLI·`.env` 없음, native submodule 미초기화 |
| 지금 스토어/전면 공개 가능한가 | **NO-GO** | 코드 취약점은 차단했지만 콘텐츠 0건, OAuth/SMS/FCM·native·fresh DB 증적과 퍼널 계측 부재 |
| 읽기 중심 1개 구 파일럿 가능한가 | **운영 P0 해소 후 조건부 GO** | 코드 A~E와 회귀 검사는 통과; 실제 공급·production-like RC·핵심 E2E가 먼저 |
| 당근보다 중고거래가 편리한가 | **아니다** | 첫 가치, 공급 밀도, 판매 등록, 채팅 접근, 신뢰, 거래 완료에서 열위 |
| 이 서비스만의 승산이 있는가 | **있다, 범위가 좁다** | 오토바이 경로·침수·주유·정비·다국어를 거래 약속과 결합할 때 |

가장 중요한 정정은 두 가지다.

1. **콘텐츠 0건만이 차단 요소가 아니다.** 현재 업체 자동 클레임은 공개된 전화번호만 아는 로그인 사용자가 타 업체를 가져갈 수 있어 보안 P0다.
2. **기능 수가 당근과 비슷하다는 사실은 편의성과 무관하다.** 사용자는 기능 목록이 아니라 `보임 → 문의 → 답변 → 만남 → 완료`가 끊기지 않는지를 체감한다.

---

## 2. pull 이후 확인한 사실

### 2.1 Git과 작업 환경

| 확인 | 결과 |
|---|---|
| 현재 브랜치 | `main` |
| pull | `Already up to date` |
| 로컬/원격 SHA | 모두 `763bd18b95bef8916c5a6a2389caf9d01e35d5a3` |
| codebase-memory MCP | 현재 세션에 미노출 — 프로젝트 규칙에 따라 `rg`와 선별 파일 읽기로 대체 |
| Docker / WSL | Docker CLI 없음, 사용 가능한 WSL 환경 없음 |
| 환경파일 | workspace `.env` 없음; `.env.example`만 존재 |
| native | `native/android`, `native/ios` submodule 모두 미초기화(`git submodule status`의 선행 `-`) |

따라서 이 PC에서는 Compose 기동, 빈 볼륨 migration, readiness, signed native build, GPS/FCM/OAuth 실기기 검증을 하지 못했다. 이는 실패 판정이 아니라 **출시 근거로 쓸 수 없는 미검증**이다.

### 2.2 운영 공개면 비파괴 실측

2026-08-12에 익명 GET만 호출했다.

| 호출 | 결과 | 해석 |
|---|---|---|
| `GET https://app.saigon-rider.com/api/bff/health` | `200 {"status":"ok"}` | BFF 프로세스 생존만 확인 |
| `GET /api/bff/market/listings?page=1&size=1` | `200`, `total: 0` | 공개 활성 매물 0건 |
| `GET /api/bff/biz/public/map?...HCMC bbox...` | `200`, `total: 0` | 지도에 노출되는 승인 업체 0건 |

즉 현재 서비스는 **열리지만 비어 있다.** health 응답만으로 Engine, worker, 알림, 외부 공급자, migration head, 백업·복구까지 정상이라고 추론할 수 없다.

### 2.3 로컬 정적 검증

| 검사 | 결과 |
|---|---|
| `frontend: npx tsc -b --pretty false` | PASS |
| `frontend: npx eslint src/` | 오류 0, 경고 269, exit 0 |
| `python -m compileall -q backend/app engine/app` | PASS |
| `tools/check_committed_secrets.py` | PASS |
| `tools/check_production_seed_safety.py` | PASS |
| `tools/check_migration_prefixes.py` | PASS |
| frontend `*.test.mjs` 전체 | **168 PASS**; Windows 비호환 harness 2건도 portable하게 수정 |
| backend pytest | **465 PASS, 4 SKIP**, subtest 17 PASS |
| engine pytest | **75 PASS** |
| 변경 Python Ruff | PASS |
| 독립 pre-push 코드리뷰 | 검색 로그인 벽·업로드 index 경합·draft 보관 지적을 수정한 뒤 **No findings** |
| admin frontend | `node_modules`가 없어 미실행 |

CI도 backend/engine pytest와 frontend TypeScript·ESLint 중심이다. admin frontend, native submodule/build, production override smoke, worker/noti-worker health는 현재 workflow 밖이다(`.github/workflows/ci.yml`).

---

## 3. 공개 오픈 차단 항목

### P0-1. 업체 프로필 탈취 — 코드 해결, 배포 검증 대기

`POST /biz/apply`는 로그인만 요구하고 신청 폼의 임의 입력값 `body.phone`을 CSV 선등록 업체의 전화번호와 비교한다. 일치하면 계정 전화 소유나 OTP 증명 없이 즉시 `claimable.user_id = session_uid`로 바꾼다.

- 매칭·클레임: `backend/app/routers/biz.py:148-175,179-211`
- 사용자가 임의 번호를 입력하는 폼: `frontend/src/pages/biz/BizApply.tsx:191-200`
- 동시 요청을 직렬화하는 행 잠금도 없음

공개된 가게 번호를 복사해 입력하면 먼저 시도한 계정이 업체 프로필·소식·가격표·매물 권한을 가져갈 수 있다. 온보딩 편의 개선이 아니라 **소유권 검증 우회**다.

**즉시 조치:** 자동 클레임을 feature gate로 끈다. 복구 시에는 `User.phone_verified_at`이 있고 정규화한 계정 전화와 후보 전화가 같을 때만 `SELECT ... FOR UPDATE` 후 1회 클레임한다. 다른 번호는 프로필에 귀속된 OTP challenge 또는 운영 검수로 분리한다.

**수용 기준:** 미인증 계정·다른 번호·동시 요청은 전부 실패, 검증된 같은 번호의 단일 요청만 성공, 응답으로 후보 존재 여부를 누설하지 않으며 감사 로그가 남는다.

**구현 결과:** 신청 폼의 `body.phone`을 권한 근거에서 제거했다. 세션 사용자의 `phone_verified_at`과 계정 전화만 사용하고, 후보 행을 `SELECT ... FOR UPDATE`로 잠근 뒤 소유자·승인 상태·정규화 전화번호를 재검사한다. 미인증·불일치·경합 패자는 기존과 같은 신규 `PENDING` 신청으로 흐른다. 관련 업체 테스트 73건과 전체 backend 465건이 통과했다. 운영 배포 후 동시 요청 E2E와 감사 로그 증적은 남아 있다.

### P0-2. 로그인 직후 무동의 GPS — 코드 해결, 실기기 검증 대기

앱 전역에서 로그인 사용자에게 `<ProximityAlerts enabled={!!user} />`를 마운트한다(`frontend/src/App.tsx:466-470`). 훅은 즉시 `native.getLocation()`을 호출한 뒤 후보가 0건이거나 서버 정책이 OFF여도 `native.watchLocation()`을 시작한다(`frontend/src/hooks/useProximityAlerts.ts:48-105`).

이는 첫 로그인 때 권한 팝업, 배터리·프라이버시 불신, 스토어 심사 설명 부담을 만든다. 서버의 광고 킬스위치는 알림 결과만 비울 뿐 클라이언트 위치 스트림을 끄지 않는다.

**즉시 조치:** 파일럿 빌드에서는 근접 기능을 OFF로 고정해 훅 자체를 마운트하지 않는다. 재개 시 명시적 opt-in 설정, 서버 policy ON 확인, 후보 존재 확인 뒤에만 watcher를 시작하고 언제든 끌 수 있게 한다.

**수용 기준:** 신규 로그인·마켓 열람만으로 geolocation API 호출 0회. 사용자가 기능을 켰을 때만 OS 권한 요청 1회, OFF/로그아웃/백그라운드 정책에 맞춰 watcher가 종료된다.

**구현 결과:** `PROXIMITY_ALERTS_ENABLED = false`에서 훅이 위치 API 호출 전에 종료되고, `ADS_ENABLED = false`에서는 광고 요청도 실행하지 않는다. 마켓 첫 열람은 저장된 동의와 좌표가 없으면 전체 지역 모드로 시작한다. 계약 테스트는 이 kill switch와 무자동 GPS를 고정한다. 기능 재개 전에 opt-in UI와 Android/iOS 실기기 권한 테스트가 필요하다.

### P0-3. 실제 콘텐츠가 0건이라 첫 사용자가 가치를 볼 수 없다

운영 API 기준 활성 매물 0건, 승인 업체 0건이다. 동시에 광고 배치는 `ADS_ENABLED = true`다(`frontend/src/lib/adPlacement.ts:19`). 현재 공개하면 “거래·동네 앱”이 아니라 빈 화면 또는 광고가 먼저인 앱으로 인식된다.

**즉시 조치:** 광고를 OFF로 되돌리고 한 개 파일럿 구에 실제 동의받은 매물을 집중한다. 가짜 매물·타 플랫폼 무단 복사는 사용하지 않는다.

**수용 기준:** 파일럿 구 활성 매물 150건 이상, 3km 평균 노출 20건 이상, 주간 신규 20건 이상, 문의의 48시간 내 응답률 60% 이상을 2주간 확인한다.

**구현 결과:** 공급 임계치 전 광고는 코드에서 OFF했다. 그러나 실제 동의받은 매물·업체 공급은 저장소 수정으로 만들 수 없으므로 이 P0는 계속 열려 있다.

### P0-4. 운영 RC가 외부 연동과 fresh DB를 재현했다는 증거가 없다

- OAuth seed는 Google/Apple/Facebook/Zalo 모두 `CHANGE_ME`; 실제 운영 DB 주입·redirect/deep-link 성공은 저장소로 확인할 수 없다(`database/init/101~104_*`).
- 개인 판매는 전화 인증을 강제하지만 production에서 `SMS_PROVIDER_API_KEY`가 없으면 발송이 중단된다(`backend/app/sms_client.py:30-42`).
- Engine은 FCM credential이 없어도 로그만 남기고 기동하며 readiness가 FCM을 실패 조건으로 보지 않는다(`engine/app/main.py:85-90,159-173`). Compose는 경로 env만 전달하고 prod override는 Engine source mount를 제거한다. tracked build context에도 credential이 없다.
- 최신 migration 139~177은 Compose에 등록됐지만 Docker가 없어 빈 DB bootstrap·재실행 멱등성을 확인하지 못했다.
- native submodule이 없어 앱 서명, OAuth deep link, GPS 권한, FCM token/수신을 확인하지 못했다.

**수용 기준:** exact SHA로 production-like fresh deploy → migration head → BFF/Engine/worker/noti-worker ready → 실제 Google/Apple/Zalo 로그인 → 베트남 실번호 OTP → Android/iOS FCM foreground/background 수신 → GPS/딥링크/강제업데이트 핵심 E2E를 영상·로그·artifact digest와 함께 남긴다. FCM을 출시 범위에 넣는다면 credential을 secret mount로 공급하고 readiness도 검증해야 한다. 제외한다면 해당 기능을 UI·worker에서 명시적으로 OFF한다.

### P0-5. 가입 전 로그인 벽 — 코드 해결, 브라우저 E2E 대기

마켓 목록·상세와 업체 상세가 모두 `PrivateRoute`다(`frontend/src/App.tsx:509-535`). 반면 백엔드 조회는 익명 세션을 이미 지원한다. Zalo/Facebook 공유 링크를 받은 신규 사용자는 물건 대신 OAuth부터 본다.

**수정:** `/market`, `/market/:id`, `/biz/:id`를 public read로 옮기고 찜·채팅·가격제안·등록 시점에 로그인시킨다. `returnTo`로 원래 매물에 복귀시킨다.

**수용 기준:** 로그아웃 상태에서 공유 링크의 사진·가격·지역·판매자 신뢰정보를 보고, 채팅을 누러 로그인한 뒤 같은 매물/대화로 돌아온다.

**구현 결과:** 마켓 목록·검색·상세와 업체 상세를 public read로 옮겼다. 내 매물 검색(`?mine=1`)과 찜·채팅·가격제안·팔로우·신고·차단·리뷰·키워드 알림은 현재 URL의 path/query/hash를 저장한 뒤 기존 OAuth로 보내고, 로그인 후 원위치로 복귀한다. 스플래시와 인증 기본 복귀는 `/market`으로 통일했다. 계약 테스트는 통과했으며 실제 OAuth 공급자 브라우저 E2E는 운영 RC에서 확인해야 한다.

### P0-6. 파일럿 성공 여부를 판정할 퍼널 계측이 없다

`landing_view → listing_view → auth_prompted → chat_started → offer_accepted → appointment_accepted → route_result → trade_completed → review_submitted`를 잇는 제품 계측을 찾지 못했다. 운영 데이터 없이 “편리해졌다”를 코드 완료로 오판하게 된다.

**수용 기준:** 개인정보 원문 없이 `ward_id`, 결과 건수 bucket, 실패 reason 정도만 붙여 첫 가치·빈 결과·응답·약속·완료 퍼널을 한 대시보드에서 본다.

---

## 4. 사용자 관점에서 당근보다 편리한가

### 4.1 비교 방법과 한계

점수는 2026-08-12 현재 코드·운영 공개면과 당근의 공개 제품 설명을 1~10으로 평가한 **휴리스틱**이다. 실사용자 동시 비교시험 결과가 아니다. 또한 성숙한 한국 네트워크와 공급 0건인 호치민 초기 서비스를 비교하므로, 의도적으로 “기능 개수”가 아니라 사용자의 성공 가능성을 본다.

당근 기준은 공식 [App Store 설명](https://apps.apple.com/kr/app/%EB%8B%B9%EA%B7%BC/id1018769995), [서비스 소개](https://about.daangn.com/service/), [웹 서비스](https://www.daangn.com/kr/service/)에서 동네 인증·매너 체계·1:1 채팅·동네가게·커뮤니티를 확인했다. 여기에 [AI 가격·글쓰기 지원](https://about.daangn.com/company/pr/archive/%EB%8B%B9%EA%B7%BC-ai-%EA%B8%B0%EB%B0%98-%EB%82%B4-%EB%AC%BC%EA%B1%B4-%EA%B0%80%EA%B2%A9-%EC%B0%BE%EA%B8%B0-%EA%B8%B0%EB%8A%A5-%EB%8F%84%EC%9E%85/), [AI 사기 패턴 탐지](https://about.daangn.com/company/pr/archive/%EB%8B%B9%EA%B7%BC-%EC%82%AC%EA%B8%B0-%ED%8C%A8%ED%84%B4-%EA%B0%90%EC%A7%80%ED%95%98%EB%8A%94-ai-%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8-%EB%8F%84%EC%9E%85/), [결제·배송을 묶은 바로구매](https://about.daangn.com/company/pr/archive/%EB%8B%B9%EA%B7%BC-%EC%A4%91%EA%B3%A0%EA%B1%B0%EB%9E%98-%EB%B0%94%EB%A1%9C%EA%B5%AC%EB%A7%A4-%EA%B8%B0%EB%8A%A5-%EB%8F%84%EC%9E%85/)까지 현재 신뢰·거래 편의 기준에 포함했다.

### 4.2 여정 점수

| 핵심 여정 | 사이공 | 당근 | 냉정한 이유 |
|---|---:|---:|---|
| 첫 가치 확인 | **2.0** | 9.0 | 모든 핵심 화면이 로그인 뒤이고 실제 데이터도 0건 |
| 지역 탐색·검색 | **6.5** | 9.0 | 검색·필터·지도·빈 상태 CTA는 좋지만 기본 GPS 3km와 밀도 부재 |
| 판매 등록 | **5.5** | 9.0 | 사진 실패 복구·업체 경로는 좋지만 개인은 폼 전 OTP, 초안·부족항목 안내 없음 |
| 채팅·가격·약속 | **6.0** | 8.5 | 구조화 가격제안·약속·길찾기는 강점, DM은 프로필 안쪽이고 5초 폴링 |
| 안전·신뢰 | **3.5** | 9.0 | 전화·후기·신고·모더레이션은 있으나 업체 탈취 P0와 방문 근거 없는 업체 후기 |
| 거래 완료·후기 | **5.0** | 8.5 | 판매자만 완료 가능해 판매자가 이탈하면 구매자의 이력·후기도 정지 |
| 동네가게·지도 | **7.0** | 8.5 | 가게 소식·가격표·매물·전화·지도 구성은 현 제품의 가장 강한 면 |
| 재방문 | **4.5** | 9.0 | 키워드·DM 알림은 있으나 채팅 접근·완료 정체·밀도·계측 부재 |
| **단순 평균** | **5.0** | **8.8** | 현재는 당근보다 편리하다고 말할 근거가 없음 |

### 4.3 실제로 불편한 핵심 네 지점

1. **보기도 전에 가입한다.** 공유 링크도 매물 대신 OAuth로 간다.
2. **팔기 전에 또 인증한다.** 개인 판매자는 폼에 들어가기 전 SMS OTP를 통과해야 하고 작성 복구도 없다.
3. **거래의 중심인 채팅이 묻혀 있다.** 탭은 홈·마켓·지도·커뮤니티·프로필이고 DM은 프로필 하위다(`frontend/src/components/layout/TabBar.tsx:71-79`).
4. **거래를 구매자가 닫을 수 없다.** 완료 API가 판매자만 허용한다(`backend/app/routers/market.py:1386-1397`).

### 4.4 사이공라이더가 이길 수 있는 좁은 구간

전체 중고거래에서는 우위가 없지만 다음 조합은 당근을 복제해서 얻을 수 없는 자산이다.

- 베트남 가격·거리 문법과 성조 없는 검색 흡수
- 오토바이용 경로와 거래 약속 장소의 직접 연결
- 침수·날씨·주유소·정비소를 만남 경로에 결합
- vi/ko/en 다국어
- 가격 제안 → 약속 → 좌표 → 길찾기의 구조화된 거래 상태

권장 포지션은 “당근보다 기능 많은 중고거래 앱”이 아니라 **“호치민 오토바이 이용자의 동네 거래 앱 — 약속부터 안전한 이동까지 한 번에”**다.

---

## 5. 수정 순서

### Wave 0 — 코드 공개·파일럿 전에 반드시

| 순서 | 최소 수정 | 수용 기준 |
|---:|---|---|
| 1 | **업체 자동 클레임 즉시 OFF 후 소유 전화 검증으로 재구현** | 다른 번호·미인증·경합 탈취 테스트 모두 차단, 동일 verified phone만 1건 성공 |
| 2 | **근접알림 훅과 광고 OFF** | 로그인·열람 시 위치 API 0회; 공급 150건 전 일반 광고 미노출 |
| 3 | **운영 RC 종단 검증** | fresh DB, 전체 ready, OAuth/SMS/FCM, signed Android/iOS, artifact SHA, 백업·복원 증적 |
| 4 | **비로그인 마켓·업체 열람 + 행동 시 로그인** | 공유 링크 열람과 로그인 후 원위치 복귀 E2E PASS |
| 5 | **스플래시 약속·기본 진입을 마켓으로 통일** | 신규 사용자가 2개 화면 이내 실제 매물 도달; 상용 첫 면에서 RP/퀘스트 약속 제거 |
| 6 | **한 개 구 실제 공급 집중** | 활성 150+, 3km 평균 20+, 주간 신규 20+, 48시간 응답률 60%+ |
| 7 | **최소 퍼널 이벤트 배선** | 첫 가치부터 후기까지 구·결과·실패 사유별 이탈 조회 가능 |

### Wave 1 — 파일럿 거래 성사율

1. 채팅을 1차 탭으로 올리고 미읽음 수를 표시한다.
2. DM 상단에 `문의 → 가격합의 → 약속 → 만남 → 완료` 상태와 현재 주 CTA 하나를 둔다.
3. 판매 폼 진입은 허용하고 OTP를 게시 직전으로 미룬다. 필드와 업로드된 `contentId`를 초안으로 복구하고 비활성 이유를 표시한다.
4. 구매자 완료 요청 → 판매자 확인 → 이의/운영 확정 흐름을 추가한다. 분쟁 정책 없이 자동 완료하지 않는다.
5. 약속 수락 시 안전 안내, 공개 장소 후보 3곳, 양측 ETA를 제공한다.
6. 홈의 매물 로딩을 날씨·침수·업체·피드와 분리하고, 상용 핵심 면의 Lv·RP·스킬포인트를 숨긴다.
7. 업체 후기는 방문·거래 근거 또는 명시된 운영 검수 조건을 둔다.

### Wave 2 — 검증된 차별점 확대

- 판매중·예약중·완료·문의 수를 보는 최소 판매 관리 화면
- 자체 경로 성공률·p95·폴백률 계측과 장애 시 한 번의 탭 이내 외부 지도 복구
- 약속 장소의 침수 위험·주유·정비 정보를 이동 문맥에 연결
- `삽니다(Cần mua)` 수요 글로 공급 전 수요 축적
- AI 가격·사기탐지는 기본 거래 퍼널과 신뢰 경계가 안정된 뒤 검토

---

## 6. 파일럿과 전면 공개의 수치 게이트

아래는 현재 성과가 아니라 첫 2주에 검증할 초기 제안치다.

| 지표 | 파일럿 GO 기준 |
|---|---:|
| 첫 세션 실제 매물 목록/상세 도달률 | 70% 이상 |
| 앱 진입 → 첫 실제 매물 카드 | p75 3초 이내 |
| 행동 기반 로그인 진입 후 미완료 | 40% 미만 |
| 파일럿 구·핵심 카테고리 빈 결과율 | 20% 미만 |
| 구매자 첫 문의 → 판매자 첫 응답 | 운영시간 중앙값 30분 이내 |
| 가격 수락 → 약속 수락 | 50% 이상 |
| 수락 약속의 완료 또는 명시 취소 | 80% 이상 |
| 인앱 경로 성공 또는 정상 폴백 | 99% 이상 |
| P0 보안·개인정보 결함 | 0건 |
| 핵심 E2E(Android/iOS) | 100% PASS |

전면 공개는 위 지표가 제한 파일럿에서 유지되고, 중대 보안·데이터 손상·핵심 흐름 차단이 0건이며, exact release artifact의 운영/복구 증적을 재감사한 뒤 별도 GO를 받아야 한다.

---

## 7. 이미 해결된 과거 지적

| 과거 항목 | 현재 상태 |
|---|---|
| 빈 결과 탈출구 없음 | **부분 해결** — 전체 지역·키워드 알림 CTA. 기본 3km와 추가 탭은 잔존 |
| 사진 업로드 실패가 조용히 빠짐 | **해결** — 실패 overlay·개별 재시도·제출 차단 |
| 채팅 알림 끄기 없음 | **해결** — 설정·schema·worker gate 연결 |
| 백그라운드 DM 요청 반복 | **대부분 해결** — visibility guard·복귀 즉시 fetch·catch |
| InfoHub 고정 좌표 | **해결** — service location 사용. 실제 진입점 부재는 별도 |
| 최소 1.2초 스플래시 | **해결** — 500ms로 단축. 주석만 stale |
| `two_wheeler` 외부 지도 오타 | **해결** — `two-wheeler` |
| 업체 명의 매물 등록 경로 없음 | **해결** — `/biz/listings/new`, 업체당 활성 5건 상한 |
| 공급 검수 도구 부족 | **개선** — 자동 flag와 admin 일괄 검수 추가 |

이 개선들은 되돌리지 않는다. 다만 업체 자동 클레임은 “온보딩 해결”로 계산하지 않는다. 신뢰 경계를 깨뜨린 신규 P0다.

---

## 8. 하지 말아야 할 것

- 공급과 거래 퍼널 전에 광고·RP·가챠·홈 카드를 더 늘리지 않는다.
- 업체 탈취를 이름·주소 fuzzy matching으로 덮지 않는다. 필요한 것은 더 좋은 추측이 아니라 소유 증명이다.
- 채팅 탭·현재 단계 CTA보다 먼저 WebSocket 전체 재작성을 시작하지 않는다.
- 분쟁·이의 절차 없이 거래를 자동 완료하지 않는다.
- 가짜 매물, 타 플랫폼 크롤링, dev seed를 실제 공급처럼 노출하지 않는다.
- 기본 여정이 막힌 상태에서 당근의 AI·결제 기능을 기능 단위로 복제하지 않는다.
- 호치민 전역에 얇게 뿌리지 않는다. 한 개 구에서 밀도를 만든 뒤 넓힌다.

---

## 9. 코드 수정 통합 명세

이 절은 Wave 0/1의 단일 구현·인계 지점이다. 실제 source 파일을 하나로 합치라는 뜻은 아니다. 소스의 기존 모듈 경계는 유지하고, 적용한 변경과 남은 변경을 여기 모았다.

### 9.1 변경 묶음과 실제 파일

| 묶음 | 실제 수정 파일 | 목적 | 상태 |
|---|---|---|---|
| A. 업체 소유권 | `backend/app/routers/biz.py`, 관련 backend test | 임의 전화번호 자동 클레임 차단 | **구현·테스트 완료** |
| B. 위치·광고 kill switch | `frontend/src/hooks/useProximityAlerts.ts`, `frontend/src/lib/adPlacement.ts` | 로그인 직후 GPS 및 빈 앱 광고 중단 | **구현·테스트 완료** |
| C. 공개 탐색 | `frontend/src/App.tsx`, `useRequireAuth.ts`, 마켓·업체 행동 버튼 | 공유 링크에서 가입 전 가치 제공 | **구현·계약 테스트 완료; OAuth E2E 대기** |
| D. 첫 약속·기본 진입 | `Splash.tsx`, vi/ko/en 번역, OAuth/ProfileSetup 복귀 경로, 홈·프로필 | 마켓 서비스로 정체성 통일 | **구현·테스트 완료** |
| E. 판매 복구 | `VerifiedSellerRoute.tsx`, `MarketCreate.tsx` | 폼 전 OTP 제거, 서버 업로드 초안 복구 | **구현·계약 테스트 완료; 실기기 OTP E2E 대기** |
| F. 거래 조종석 | `TabBar.tsx`, `DmDetail.tsx`, `market.py`, migration/model | 채팅 접근과 구매자 완료 요청 | **미구현 — 정책 결정 필요** |
| G. 계측·운영 게이트 | frontend event adapter, BFF event endpoint/schema, Compose/readiness/CI | 파일럿을 수치로 판정 | **미구현** |

### 9.2 A — 업체 자동 클레임

현재 권한 결정은 신청 폼의 입력값에 의존한다.

```python
# backend/app/routers/biz.py — 현재 위험 흐름
claimable = await _find_claimable_profile(db, body.phone)
if claimable is not None:
    claimable.user_id = session_uid
    await db.commit()
```

`body.phone`은 업체 연락처 데이터일 뿐 소유권 증명이 아니다. 목표 흐름은 다음과 같다.

```python
# 구현 형태 — 세부 명칭은 기존 모델 스타일을 따른다.
session_user = await db.get(User, session_uid)
if session_user is None or session_user.phone_verified_at is None or not session_user.phone:
    claimable = None
else:
    candidate = await _find_claimable_profile(db, session_user.phone)
    claimable = await _lock_and_recheck_claimable_profile(db, candidate, session_user.phone)

if claimable is not None:
    claimable.user_id = session_uid
```

구현 규칙:

- `_find_claimable_profile()` 호출에 `body.phone`을 넘기지 않는다.
- 후보를 찾은 뒤 해당 `BusinessProfile.id`만 `SELECT ... FOR UPDATE`로 다시 읽는다.
- 잠금 후 `user_id IS NULL`, `status == "APPROVED"`, verified account phone 일치를 모두 재검사한다.
- 불일치는 기존처럼 신규 `PENDING` 신청으로 진행하거나 별도 OTP 클레임 엔드포인트로 분리한다.
- 존재 여부가 200/404나 메시지 차이로 외부에 드러나지 않게 한다.

필수 테스트:

1. 미인증 계정 + 일치하는 `body.phone` → 클레임되지 않음.
2. 인증 계정 전화 A + `body.phone` B + 후보 전화 B → 클레임되지 않음.
3. 인증 계정 전화 A + 후보 전화 A → 1건 성공.
4. 동일 후보에 동시 요청 2건 → 정확히 1건만 성공.
5. 클레임 실패가 후보 업체 존재 여부를 노출하지 않음.

### 9.3 B — 로그인 직후 GPS와 광고 차단

현재 전역 마운트와 watcher 시작은 다음 두 줄로 요약된다.

```tsx
// frontend/src/App.tsx
<ProximityAlerts enabled={!!user} />

// frontend/src/hooks/useProximityAlerts.ts
stopWatch = native.watchLocation(onPosition);
```

파일럿 전 최소 변경은 명시적인 OFF 상수 하나를 전역 마운트에 적용하는 것이다.

```tsx
const PROXIMITY_ALERTS_ENABLED = false;

<ProximityAlerts enabled={PROXIMITY_ALERTS_ENABLED && !!user} />
```

광고도 공급 임계치 전까지 다음처럼 OFF로 둔다.

```ts
// frontend/src/lib/adPlacement.ts
export const ADS_ENABLED = false;
```

정식 재개 조건:

- 사용자 설정 opt-in이 true일 때만 `getLocation()`을 호출한다.
- 서버 policy가 ON이고 후보가 1건 이상일 때만 `watchLocation()`을 시작한다.
- 설정 OFF, 로그아웃, effect cleanup에서 watcher가 종료된다.
- 로그인과 마켓 열람만 수행한 E2E에서 위치 권한 prompt가 0회인지 검증한다.

### 9.4 C — 가입 전 공개 탐색

현재 세 라우트가 모두 인증 wrapper 안에 있다.

```tsx
<Route path="/market" element={<PrivateRoute><MarketMain /></PrivateRoute>} />
<Route path="/market/:id" element={<PrivateRoute><MarketDetail /></PrivateRoute>} />
<Route path="/biz/:id" element={<PrivateRoute><BizPublic /></PrivateRoute>} />
```

목표는 조회 화면만 public으로 두고 상태 변경 행동에서 인증하는 것이다.

```tsx
<Route path="/market" element={<MarketMain />} />
<Route path="/market/:id" element={<MarketDetail />} />
<Route path="/biz/:id" element={<BizPublic />} />
```

함께 수정할 사항:

- background-location용 중복 상세 라우트(`App.tsx:182-185`)도 동일하게 공개한다.
- 찜·채팅·가격제안·팔로우 버튼은 비로그인 시 `returnTo=현재 URL`로 OAuth를 연다.
- 익명 API 응답에서 전화 원문·내부 UUID·비공개 신뢰정보가 추가 노출되지 않는지 확인한다.
- 로그인 후 `returnTo`를 한 번 소비하고 같은 매물로 복귀한다.

필수 E2E는 `공유 링크 익명 열람 → 채팅 탭 → 로그인 → 같은 매물의 대화 시작` 한 개다.

### 9.5 D — 제품 첫 약속 통일

변경 범위는 새 기능 추가가 아니라 기존 문구와 기본 경로 정리다.

- vi/ko/en 스플래시의 “모든 라이드는 퀘스트”를 “호치민 오토바이 거래, 약속부터 안전한 이동까지” 의미로 맞춘다.
- 신규 로그인·프로필 설정 완료 기본 복귀를 `/home`에서 `/market`으로 바꾼다.
- 라이더 스타일은 필수 과정이 아니라 명시적 건너뛰기 가능한 선택값으로 내린다.
- 홈·프로필의 Lv·RP·스킬포인트는 파일럿 상용 첫 면에서 feature gate로 숨긴다.

수용 기준은 신규 베트남 사용자 5명 중 4명 이상이 첫 10초 안에 “동네 오토바이 거래와 만남 이동 앱”으로 같은 목적을 설명하고, 실제 매물까지 두 화면 이내 도달하는 것이다.

### 9.6 E — 개인 판매 작성 복구

`/market/new` 전체를 `VerifiedSellerRoute`로 막지 않고 로그인만 요구한다. `MarketCreate.handleSubmit`에서 게시 직전에 전화 인증 여부를 확인한다.

초안 최소 schema:

```ts
type MarketDraft = {
  title: string;
  description: string;
  price: string;
  category: string;
  wardId: string | null;
  imageContentIds: string[];
  savedAt: string;
};
```

구현 규칙:

- 서버 업로드가 끝난 `contentId`만 저장하고 로컬 blob/data URL은 보존하지 않는다.
- 사용자별 draft key를 사용하고 게시 성공·명시적 폐기 때 삭제한다.
- draft는 7일 후 만료시키고, 사진 업로드 결과는 배열 index가 아닌 안정적인 로컬 ID에 결합한다.
- OTP 화면으로 갈 때 현재 URL을 `returnTo`로 전달한다.
- `canPost === false`인 버튼 아래 사진·제목·지역·업로드 실패 중 정확한 부족항목을 표시한다.

필수 E2E는 `반 작성 → OTP 실패 또는 앱 종료 → 재진입 → 내용 복원 → 인증 → 1회 게시`다.

### 9.7 F — 채팅과 거래 완료

최소 UI 변경:

- 탭바의 홈 또는 커뮤니티 자리 중 제품 결정된 한 곳을 DM으로 바꾸고 미읽음 숫자를 노출한다.
- DM 상단에 `문의 → 가격합의 → 약속 → 만남 → 완료` 중 현재 단계와 주 CTA 하나만 둔다.
- 약속 수락 직전에 안전 장소·현장 확인·선입금 주의 안내를 한 번 노출한다.

완료 상태는 판매자 단독 PATCH를 바로 자동 완료로 바꾸지 않는다. 다음 명시 상태를 추가한다.

```text
ACCEPTED → COMPLETION_REQUESTED → COMPLETED
                         └──────→ DISPUTED/CANCELLED
```

- 구매자와 판매자 모두 완료 요청 가능.
- 상대방 확인 시 `COMPLETED`와 매물 `SOLD`를 같은 transaction에서 반영.
- 무응답 자동 완료는 운영 기간·이의 정책이 확정되기 전 도입하지 않음.
- 기존 review eligibility는 `COMPLETED`에서만 유지.

테스트는 권한, 중복 요청 멱등성, 매물 행 잠금, 양측 동시 확인, 취소/분쟁 충돌을 포함한다.

### 9.8 G — 계측·운영 RC

최소 이벤트는 다음 9개로 고정한다.

```text
landing_view
listing_view
auth_prompted / auth_completed
chat_started
offer_accepted
appointment_accepted
route_result
trade_completed
review_submitted
```

공통 속성은 `ward_id`, `count_bucket`, `reason`, `platform`, `app_version`으로 제한한다. 전화·메시지·정확한 GPS·검색 원문은 이벤트에 싣지 않는다.

코드 완료 뒤에도 다음 RC 절차를 통과해야 한다.

1. native submodule 초기화와 signed Android/iOS build.
2. fresh DB에서 migration head까지 1회 적용 후 재실행 멱등성 확인.
3. BFF·Engine·worker·noti-worker readiness 확인.
4. Google/Apple/Zalo 로그인, 베트남 실번호 OTP, FCM foreground/background 실기기 확인.
5. exact Git SHA와 image digest 기록, 배포 후 핵심 E2E와 backup/restore 실행.

### 9.9 구현 순서와 완료 정의

| 순서 | 작업 | 현재 상태 | 완료 정의 |
|---:|---|---|---|
| 1 | A 업체 클레임 차단 | **코드 PASS** | 운영 동시 요청·감사 로그 증적 |
| 2 | B GPS·광고 OFF | **코드 PASS** | Android/iOS 위치 호출 0회 증적 |
| 3 | C 공개 탐색 | **코드 PASS** | 익명 공유 링크와 로그인 복귀 E2E |
| 4 | D 첫 약속 통일 | **코드 PASS** | 사용자 5명 첫 가치 테스트 |
| 5 | E 판매 복구 | **코드 PASS** | draft/OTP/업로드 실기기 E2E |
| 6 | F 거래 조종석 | **F-1·F-2 코드 PASS** (§9.10) / F-3 거래 단계 스트립·안전 안내 미구현 | 단계 전이·권한·멱등성 테스트 |
| 7 | G 계측·RC | **미구현** | 퍼널 대시보드와 운영 증적 완성 |

### 9.10 F 구현 기록 (2026-08-12 후속 착수 — 대표 지시 "구매자 완료 요청권·채팅 탭 승격도 해야 한다")

§9.7 의 F 중 **F-1 채팅 탭 승격(S-5/D-6)** 과 **F-2 구매자 완료 요청권(S-16/D-7)** 을 구현했다.
F-3(DM 상단 거래 단계 스트립 · 약속 수락 직전 안전 안내)은 이번 범위 밖으로 남았다.

**F-1 채팅 탭 승격 — 대표 결정: 홈 유지 + 채팅 추가 = 6탭**

§9.7 은 "홈 또는 커뮤니티 자리를 DM 으로 교체"(D-6 원안은 홈 제거)였으나, 홈에 유가·날씨·침수·
주유소·정비소 진입점이 걸려 있어 빼면 그 기능 진입이 사라진다. 유틸리티 스트립 재배치
([`../spec/service-concept-260726.md`](../spec/service-concept-260726.md) §6.2)는 별건이라, **탭을 교체하지 않고 채팅을 추가**하는 안으로 확정됐다.

- `TabBar.tsx` — `홈·마켓·동네지도·채팅·커뮤니티·프로필` 6탭. `TAB_PATH_PREFIXES` 에 `'/dm': ['/dm']`
  신설, `/profile` 배열에서 `/dm` 제거(채팅 화면에서 프로필 탭이 활성 표시되던 문제).
- 미읽음은 프로필 탭의 **빨간 dot → 채팅 탭의 숫자 배지**(99 초과는 `99+`). `.navDot` 은 고아가 되어
  `.navBadge` 로 교체. 배지 소스는 기존 `useDmStore.totalUnread` 이고 갱신도 기존
  `App.tsx` 의 `dmPollInterval` 폴링이 그대로 담당한다(신규 폴링 없음).
- `AppShell.HIDE_TABBAR_PATHS` 는 무변경 — `/dm/`(대화방)은 이미 숨김 대상이고 `/dm`(목록)은
  탭 루트라 탭바가 필요하다.
- i18n `tabbar.chat` 은 3벌에 이미 존재해 신규 키 없음. 6탭에서 탭 폭이 좁아져 긴 vi 라벨
  (`Trò chuyện`)이 2줄로 접히지 않게 `.label { white-space: nowrap }` 추가.

**F-2 구매자 완료 요청권 — status 값을 늘리지 않고 필드로 표현**

§9.7 은 `ACCEPTED → COMPLETION_REQUESTED → COMPLETED` 상태 신설안이었으나, `status` 를 늘리면
리뷰 자격 판정(`market.py` 의 `completed_appt` 조회)·프론트 `statusLabel` 등 기존 소비처가 전부
영향을 받는다. **요청은 ACCEPTED 의 하위 상태**로 보고 컬럼 3개로만 표현했다(status 4값 불변).

- `database/init/179_appointment_completion_request.sql` — `marketplace_appointments` 에
  `completion_requested_by` / `completion_requested_at` / `completion_declined_at` 추가 +
  어드민 큐용 partial index(`ix_mp_appointment_completion_pending`). compose `bff_migrate` 등록 완료
  (dev DB 는 수동 적용도 완료).
- `PATCH /market/appointments/{id}/request-completion` — **구매자 전용**(판매자는 403
  `seller_completes_directly` — 판매자는 직접 완료하면 되므로 요청 개념이 없다. §9.7 의 "양측 요청
  가능"보다 D-7 결정에 맞춘 축소). ACCEPTED 만 허용, 중복 요청은 재알림 없이 멱등 반환,
  거절 후 재요청은 허용(`completion_declined_at` 을 비운다).
- `PATCH /market/appointments/{id}/decline-completion` — 판매자 전용. 약속은 ACCEPTED 유지,
  거절 시각만 기록하고 **요청 이력은 지우지 않는다**(운영 이의 큐의 판단 근거).
- 완료 확정은 여전히 `complete_appointment`(판매자) 한 곳뿐 — **자동 완료 없음**(D-7).
- 알림: `noti_events.enqueue` 로 도메인 변경과 같은 트랜잭션에 적재(FD-6 outbox),
  worker 핸들러 `market.completion_requested` / `market.completion_declined` 신설.
  타입은 DM 컨텍스트라 기존 `SOCIAL` 재사용(enum 신설 없음), 딥링크는 `dm&id=<conv>`.
  **푸시 게이트 없음** — 판매자 미응답이 곧 S-16 의 원인이라 chat 토글로 끌 수 있어야 할 성질이 아니다.
- accept/cancel 과 동일하게 **별도 DM 메시지를 만들지 않는다**(propose 만 메시지 생성) — 약속 카드
  자체가 상태를 표시하고, 판매자 부재 문제는 푸시가 담당한다.
- 프론트 `DmDetail.tsx` — 구매자에게 `거래 완료 요청`(거절 후엔 `완료 다시 요청`), 판매자에게
  `요청 거절`, 카드 상태 pill 은 요청 중이면 `완료 요청됨`. 거절 사실은 구매자 화면에 한 줄로
  남긴다(요청이 사라진 것으로 오인 방지).

**F-2 운영 이의 큐 (대표 결정: 어드민 큐까지 포함)**

- `backend/app/routers/admin_api/trades.py` 신설 — `GET /admin/api/trades/completion-requests`
  (`state=pending|declined|all`, `min_pending_hours` 로 방치 건만 필터, 경과 시간은 서버 계산),
  `POST .../{id}/force-complete`(약속 COMPLETED + 매물 SOLD + 합의가 스냅샷은 MKT-7 규칙 재사용),
  `POST .../{id}/dismiss`(거래는 미완료, 요청만 큐에서 내림 — 구매자 재요청 가능).
  두 조치 모두 **사유 필수**(양측 알림 본문·감사로그에 그대로 들어간다), 양측 `MODERATION` 알림 +
  `admin_audit_log`(`trade.completion_force_complete` / `trade.completion_dismiss`)를 단일 트랜잭션 커밋.
  매물 행은 앱 경로와 동일하게 `FOR UPDATE` 로 잠근다.
- 어드민 SPA `pages/trades/CompletionRequestListPage.tsx` + `api/trades.ts`,
  라우트 `/trades/completion-requests`, 사이드바 TRUST 그룹에 `거래 완료 이의` 추가.

**검증**

| 항목 | 결과 |
|---|---|
| backend 테스트 | **483 PASS / 4 skip** (신규 `test_market_completion_request` 9 + `test_admin_trade_completion_queue` 10) |
| ruff (backend 전체) | **0** |
| frontend 계약 테스트 | **181 PASS** (신규 `chatTabPromotion` 6 + `completionRequest` 5) |
| `tsc -b` (app / admin) | **0 / 0** |
| ESLint (변경 파일) | error **0** (경고 20은 기존 fetch-in-effect) |
| 로케일 3벌 | **1,951 키 패리티, 차이 0** |
| dev 실측 | init/179 적용 후 컬럼·index 확인, `/admin/api/trades/...` 미인증 401, noti_worker 신규 핸들러 2종 등록 로그 확인, app·admin SPA 재빌드 200 |

**push 전 code-review(high) 지적 6건 반영**

1. **blocker — init/179 가 mount 만 되고 실행되지 않았다.** `bff_migrate` 의 `volumes:` 에만 추가하고
   `command:` 의 `-f` + `VALUES (179)` 쌍을 빠뜨렸다. 배포 시 컬럼이 생기지 않고, 모델이 이미 그
   컬럼을 매핑하므로 **신규 기능만이 아니라 약속 카드·제안·수락·완료 등 기존 경로 전부**가
   `column ... does not exist` 로 죽는다. compose 수정 + 재발 방지로
   `test_compose_migration_wiring.py` 신설 — mount·실행·스탬프 **집합 동등성**을 검사해 번호를 몰라도
   같은 함정을 잡는다(현재 41/41/41 일치). 마이그레이션별 개별 검사(167 등)로는 다음 번호에서 반복된다.
2. **어드민 큐에 해소 경로 없는 행이 남았다.** SOLD 가드가 `_load_pending` 공용이라 강제완료·기각
   **둘 다** 409 였다. 판매자가 다른 대화로 먼저 판 건은 강제완료는 불가하되 기각은 가능해야 하므로
   가드를 `force_complete` 로만 옮겼다.
3. **`request-completion` 에 매물 상태 가드가 없었다.** accept/complete 와 달리 `appt.status` 만 봐서,
   이미 SOLD 인 매물에도 요청이 나가 완료 불가능한 거래에 판매자 푸시가 발송되고 2번의 잔류 행이
   만들어졌다. 잠근 행 기준 `listing.status == "SOLD"` 409 추가.
4. **탈퇴 계정 요청에서 알림이 `"None"` 으로 적재됐다.** FK 가 `ON DELETE SET NULL` 이라
   `requested_by` 만 NULL 이 되고 `requested_at` 은 남는데, 거절 가드가 `requested_at` 만 봤다.
   worker 가 `uuid.UUID("None")` 로 죽어 재시도를 모두 소진하고 DLQ 까지 갔다 → 받을 사람이 없으면
   적재를 건너뛴다(거절 기록은 유지).
5. **목록의 `total` 과 실제 행 수가 어긋날 수 있었다.** 매물 누락 시 조용히 `continue` 해 페이지네이션이
   빈 다음 페이지를 계속 제시했다. `listing_id` 는 `ON DELETE CASCADE` 라 누락이 구조적으로
   불가능하므로 skip 대신 드러낸다.
6. **어드민 기각이 구매자에게 "판매자가 거절"로 표시됐다.** `completion_declined_at` 을 재사용하는데
   프론트가 그 필드를 판매자 거절 문구로 렌더했다 — 사실과 다르고 연락할 상대도 잘못 가리킨다.
   init/179 에 **`completion_declined_by`**(판매자 거절=판매자 id, 운영 기각=NULL)를 추가하고 프론트가
   행위자로 문구를 분기한다(`dm.apptCompletionDismissedNote` 3벌 신규). 179 는 아직 dev 에만 적용됐고
   `ADD COLUMN IF NOT EXISTS` 라 별도 180 을 만들지 않고 179 를 확장했다.

미조치로 남긴 지적(리뷰도 finding 으로 올리지 않은 항목): 목록이 행당 `db.get` 3회(페이지 20건 기준
최대 60 라운드트립) — 내부 어드민 화면이고 page size 상한이 100 이라 배치 조회는 후속. 요청→거절→
재요청 반복에 rate limit 없음 — 남용 관측 후 대응.

**재검증**: backend **491 PASS/4 skip**(신규 27) · ruff check·format 0 · frontend 계약 **182 PASS** ·
`tsc -b` 0(앱·어드민) · 179 재적용 후 컬럼 4종 확인 · BFF 재시작 후 라우트 5종 등록·미인증 401 확인.

**잔여**

1. **어드민 인증 경로 curl 실측 미완** — root 비밀번호가 `.env` 에 해시(`ADMIN_PASS_HASH`)로만 있어
   로그인 토큰을 만들 수 없었다. 401(미인증) 경로만 실측했고 인증 후 목록·조치는 단위 테스트로만 고정.
   운영/dev 계정으로 브라우저 1회 순회 필요.
2. **E2E 미검증** — 구매자 요청 → 판매자 푸시 수신 → 확인/거절 → 리뷰 자격까지의 실기기 흐름.
3. **F-3 미구현** — DM 상단 거래 단계 스트립, 약속 수락 직전 안전 안내.
4. **DM 5초 폴링**(별건 지적)도 여전히 미착수.
5. 약속 시간 경과 후 양측 반복 노출(진단서 S-16 개선 2번)은 서버 스케줄 잡이 필요해 범위 밖.

A~E는 서로 맞물리는 출시 안전 묶음으로 한 commit에 통합한다. 전체 완료는 “코드가 존재함”이 아니라 §6 수치 게이트와 production-like RC 증적이 함께 PASS한 상태다.

---

## 10. 최종 답

**현재 URL은 살아 있고, 확인된 업체 소유권 탈취·무동의 위치 접근·가입 전 로그인 벽은 코드에서 차단했다. 그래도 아직 서비스를 공개할 상태는 아니다.** 실제 거래 공급이 0이고, 퍼널 계측과 운영 시크릿·native·fresh migration을 exact artifact로 증명하지 못했기 때문이다.

**사용자 입장에서도 아직 당근보다 편하지 않다.** 가입 전 열람과 판매 등록 중 OTP 이탈은 개선했지만, 공급 밀도·채팅 접근성·거래 완료·신뢰 체계가 여전히 열위다. 승부처는 당근 복제가 아니라 `호치민 오토바이 거래의 약속 → 안전한 이동`이다. 남은 F/G와 운영 P0를 닫고 한 개 구 파일럿 지표로 이 가설을 검증해야 한다.
