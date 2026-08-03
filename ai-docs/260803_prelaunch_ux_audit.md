# 출시 전 사용자 관점 UX 통합 감사 — 2026-08-03

> **판정: 사용자 경험 관점 NO-GO.** 아래 **P0 2건**을 닫기 전에는 공개하면 안 된다.
> 기준 커밋: `634d29a` (`main` = `origin/main`) · 실측 환경: 운영 `app.saigon-rider.com`(비로그인) + dev `saigon.doil.me`(로그인)
>
> **이 문서는 같은 날 작성된 아래 두 감사를 통합·검증한 단일 SoT 다.**
> - `TEST/preopen_user_experience_audit_260803.md` — 정적 코드 경로 감사 (UX-01~07, UX-13/14)
> - `260803_prelaunch_user_ux_audit.md` — 운영 실접속 계측 (A/B/C/D)
>
> 통합하면서 **모든 항목을 실행 중인 앱에서 재검증**했다. 그 결과 ①정적 지적 2건이 실행 레벨에서 확증되고 ②새 결함 12건이 추가로 드러났으며 ③내 이전 추정 2건이 사실이 아님을 확인해 정정했다.
>
> 관련(성격이 다른 축): [`260802_remaining_blockers.md`](./260802_remaining_blockers.md) — 보안·법무·인프라. 그 문서 §2-4-3 이 남긴 **"시각 회귀 부재 — CSS 깨짐은 사람 눈으로만 잡는다"**를 이 문서가 메운다.

---

## 0. 한눈에 보기

| ID | 문제 | 등급 | 확인 |
|---|---|---|---|
| **P0-1** | 비로그인 사용자가 **약관·방침을 20초 이상 읽을 수 없다** — 강제 이탈 + "세션 만료" 거짓 오류 | **P0** | 운영 실측 2회 재현 |
| **P0-2** | 공유·푸시 **딥링크 목적지가 로그인 과정에서 소실** (구 UX-03 = A-2) | **P0** | 코드+실측 교차검증 |
| P1-1 | **게임 아이템 스프라이트 텍스트 수백 자가 모든 화면 DOM 최상단**에 주입 — 스크린리더가 콘텐츠 전에 이것부터 읽음 | P1 | dev 실측 |
| P1-2 | **판매완료 매물에 `가격 수정`·상태 전환이 남고**, API 도 SOLD→ON_SALE 되돌리기를 허용 (구 UX-01) | P1 | 코드 재확인 |
| P1-3 | **동네지도 진입만으로 GPS 권한 요청** (구 UX-02) | P1 | **실측 확증** (`getCurrentPosition` 1회) |
| P1-4 | **통화 표기가 앱 안에서 두 벌** — `280.000 đ` vs `22,850₫`. 베트남 관례상 후자는 오독된다 | P1 | dev 실측 |
| P1-5 | **위치 출처를 숨기고 fallback 을 실제 위치처럼 표시** — "Bến Thành \| 1075.27 km", "3km 이내" (구 UX-06) | P1 | 실측 보강 |
| P1-6 | **DM 로드 실패가 빈 대화로 보이고, 전송 실패 시 작성문 소실** (구 UX-04) | P1 | 코드 |
| P1-7 | **작성 화면에 탭바가 남아 오터치 한 번으로 초안 소실** (구 UX-05) | P1 | 코드 |
| P1-8 | **탭바가 30여 화면에서 전부 비활성** — 현재 위치를 알 수 없음 (구 B-1 ⊃ UX-05) | P1 | 운영 실측 |
| P1-9 | 비로그인 화면에 탭바가 떠 있고 **누르면 튕겨나감** (구 B-2) | P1 | 운영 실측 |
| P1-10 | 웹에서 **Google 로그인 버튼만 한국어 고정** (구 B-3) | P1 | 운영 실측 |
| P1-11 | **언어 선택 국기 3개 전부 404** (구 B-5) | P1 | 운영 실측 |
| P1-12 | **스플래시 하단 회색 덩어리** — 다크 배경에 라이트 유리 (구 B-4) | P1 | DOM 계산 스타일 |
| P1-13 | **공개 랜딩 스크린샷에 `[DEV]`·`del_*`·중복 사진** 노출 (구 UX-07) | P1 | 게시 자산 |
| P1-14 | 핵심 컨트롤이 **`div onClick`** 이라 키보드·보조기기로 조작 불가 (구 UX-13/14) | P1 | 코드 |
| **P1-15** | **제출 버튼이 전송 중에도 계속 눌린다** — 매물 등록·글쓰기 등 8개 폼에서 중복 제출 가능 | P1 | 코드 (신규) |
| P1-16 | **거래 이력·프로필 조회 실패가 "데이터 없음"으로** 보임 (구 UX-11 중 P1 구간) | P1 | 코드 |
| P2-1~16 | 번들·폰트 CDN·유령 토큰·중복 폴링·lazy 미적용 · **FAB 가 마지막 카드 가림 · 탭 상태 초기화 · TopBar Back · 오류를 `[]` 로 · GIS 실패 시 가짜 버튼 · 44px 미만 타깃 · safe-area fallback** | P2 | 혼합 |
| **§5** | **화면상 부조화·정보구조** — 홈이 각 탭 책임을 흐림 / 생성 CTA 위치가 화면마다 다름 / 마켓 "전체 지역"↔"내 주변" 모순 / 상세 헤더 문법 불일치 / 거래 안전 문맥 부재 | 구조 | 실측+코드 |
| D-1~5 | 제품·경영 결정 필요 5건 | 결정 | — |

### 이미 잘 되어 있는 것 (되돌리지 말 것)

문제만 나열하면 판단이 왜곡되므로 함께 적는다.

- **공개 Splash·인증 화면**의 브랜드·계층·CTA 가 명확하고 베트남어로 정리돼 있다.
- **하단 최상위 목적지 5개**는 Android 권장 3~5개 범위 안이고, 탭바 자체의 활성 표시 구현(색+상단 인디케이터)과 터치 높이는 기준을 만족한다.
- **빈 상태 처리 자산이 잘 갖춰져 있다** — `StateBlock`/`InfoState` 계열이 36파일 67곳, vi 로케일 `empty*` 키 46개. 마켓·피드·정보 다수가 loading/error/empty 를 구분하고 재시도 CTA 를 제공한다.
- **DM 전송은 중복 방지가 제대로 되어 있다** — 핸들러마다 `sending` 가드 7곳(P1-15 의 반례이자 다른 화면이 따라야 할 기준).
- **로케일 3벌 키 패리티가 유지**되고 있고, JSX 하드코딩 한국어는 전수 검사 결과 2건뿐이다.
- 네이티브 기능은 `native.ts` 경유 원칙을 대체로 지킨다.
- **pull-to-refresh 가 13개 화면**에 적용돼 있고 검색 디바운스도 존재한다.
- 신고 기능이 존재한다(다만 노출 지점은 §5.3).

### 점검 축별 대응 (요청 정의 기준)

| 축 | 해당 항목 | 상태 |
|---|---|---|
| **사용자 여정** (진입·인증·거래·이탈) | P0-1 · P0-2 · P1-2 · P1-6 · P1-7 · P1-15 · D-4 | 로그인 전 실측 / 로그인 후 dev 실측+코드 |
| **내비게이션** | P0-2 · P1-8 · P1-9 · P2-7 · **P2-11**(탭 상태 초기화) · **P2-12**(Back) · **§5.1**(홈↔탭 책임) | 실측+코드 |
| **클릭 피드백** | **P1-15**(중복 제출) · P1-2(성공할 수 없는 버튼) · **P2-14**(가짜 로그인 버튼) · P1-14(키보드 조작 불가) · P2-6(토스트) | 코드+실측 |
| **화면 일관성** | P1-4(통화 2벌) · P1-11(국기) · P1-12(다크/라이트 혼용) · P2-3(유령 토큰) · **§5.2**(화면별 문법·생성 CTA 위치) · D-2 · D-5 | 실측 |
| **접근성** | **P1-1**(스프라이트가 콘텐츠를 가림) · P1-14(`div onClick`) · **P2-15**(44px 미만 타깃) · P2-10·P2-16(겹침·inset) | 실측+코드 |
| **오류/빈 상태** | P0-1(거짓 오류) · P1-5(거짓 위치) · P1-6(실패를 빈 상태로) · **P1-16**(거래 이력) · **P2-13**(오류를 `[]` 로) · D-4(문구 모순) | 실측+코드 |
| (부가) **성능·현지화·신뢰** | P2-1 · P2-2 · P2-8 / P1-10 · P1-4 / **§5.3**(거래 안전 문맥) | 실측 |

---

## 1. 방법과 한계

### 1.1 이번에 실제로 한 것

| 축 | 내용 |
|---|---|
| 운영 실측(비로그인) | 모바일 뷰포트(420×900) 접속 → 스플래시·언어 전환·로그인 화면·약관/방침. DOM 계산 스타일·네트워크·리소스 타이밍 계측 |
| **dev 실측(로그인)** | `saigon.doil.me` 로그인 상태에서 홈·마켓·동네지도·커뮤니티·프로필·설정·정보·알림·매물 상세 순회. `getCurrentPosition` 후킹으로 GPS 호출 계측, DOM 텍스트·이미지·SVG 실측. **여기 적재된 콘텐츠는 테스트 데이터**이므로 데이터 내용 자체(`[DEV]` 업체명·QA 매물 등)는 결함으로 집계하지 않았고, **동작·표시 로직**만 판정했다 |
| 코드 대조 | 발견마다 원인 라인 특정. 정적 감사 항목은 현재 커밋에서 재확인 |
| 외부 검증 | 판단 기준을 공식 가이드·시장 자료로 교차검증(§6) |

### 1.2 아직 못 한 것

- **네이티브 실기기** — `native/android`·`native/ios` 서브모듈 **미초기화**. 하드웨어 뒤로가기·권한 팝업·딥링크 스킴·키보드·저사양 체감은 실기기 재검증 필요.
- **운영 로그인 화면** — 로그인 후 실측은 **dev 데이터 기준**이다. 운영 DB 의 데이터 상태(P1-13)는 별도 확인이 필요하다.
- **스크린샷 회귀 자동화 없음** — 이번 감사도 사람이 본 것이다. CSS 깨짐 재발은 여전히 자동으로 안 잡힌다.

### 1.3 통합하면서 정정한 것 (내 이전 문서의 오류)

| 이전 서술 | 실측 결과 |
|---|---|
| "홈 닉네임 자리에 `■■■` — 폰트 렌더 실패 의심" | **오류.** 실제 닉네임이 `ㅁㅁㅁ`(U+3141 ×3)였다. 결함 아님 |
| "게임 허브 FAB 가 30여 화면에 노출된다" | **부정확.** `display:none !important` 로 가려져 **보이지 않는다**. 다만 컴포넌트는 계속 마운트된다(P2-5) |
| "베트남 4G 가 느려 번들이 문제" | **반박됨.** 베트남 모바일은 2026-01 기준 평균 90Mbps·종합 200Mbps 로 세계 평균의 2배. 문제는 네트워크가 아니라 **저사양 단말 파싱**(P2-1) |
| "dev 앱 화면의 `[DEV]`·QA 매물·비정상 가격이 데이터 결함" | **철회.** `saigon.doil.me` 는 테스트 데이터다(대표 확인). 해당 지적과 그에 딸린 "가격 상한 검증 부재" 항목을 삭제했다. P1-13 은 **공개 랜딩 게시 자산**에만 적용된다 |

---

## 2. P0 — 출시를 막는 것

### P0-1. 비로그인 사용자가 약관·개인정보처리방침을 읽을 수 없다

**증상** — 운영에서 2회 재현(대기만 하면 100%)

`/settings/privacy` 또는 `/settings/terms` 를 로그인 없이 열고 **아무 조작도 하지 않은 채 약 20초**가 지나면, 화면이 스플래시로 강제 전환되며
**"Phiên đã hết hạn. Vui lòng đăng nhập lại"(세션이 만료되었습니다. 다시 로그인해주세요)** 오류가 뜬다.
**한 번도 로그인한 적 없는 사용자에게 세션이 만료됐다고 말한다 — 거짓 오류다.**

**원인 사슬** (전 구간 확인)

| # | 지점 | 근거 |
|---|---|---|
| 1 | 약관·방침만 의도적으로 가드 밖 (로그인 전 열람이 목적) | `App.tsx:531-532` — 이 둘만 `PrivateRoute` 없음 |
| 2 | 그런데 이 화면에서도 `AppShell` 이 마운트되어 **20초 주기 DM 폴링** | `components/layout/AppShell.tsx:11`(`DM_POLL_MS=20_000`), `:50-54` |
| 3 | 비로그인이라 DM API 가 **419** 반환 | 운영 실측: `GET /api/bff/dm/conversations` → **419** |
| 4 | 클라이언트가 **419 를 무조건 세션만료로 처리** | `api/client.ts:206` — `if (res.status === 419) handleSessionError();` |
| 5 | 면제 목록에 `/settings/*` 없음 | `App.tsx:180` — `['/splash','/auth/oauth','/auth/restore']` |
| 6 | → 로그아웃 + 플래그 + 강제 이동 | `App.tsx:206-208` |
| 7 | → 스플래시가 오류 토스트 | `pages/auth/Splash.tsx:33-36` |

**사용자 영향**
- **법적 고지를 물리적으로 읽을 수 없다.** 방침 본문은 수천 자인데 20초마다 쫓겨난다.
- 로그인 화면 하단 "계속을 누르면 이용약관과 개인정보처리방침에 동의합니다" 링크를 눌러 읽으려던 사용자가 **로그인 화면에서마저 이탈**한다.
- [`260802_remaining_blockers.md`](./260802_remaining_blockers.md) §1-3 이 정리한 PDPD 동의 근거가 **UI 층에서 무너진다** — 문안 정확성과 무관하게 "고지받을 기회"가 없다.
- 첫 오류 경험이 거짓말이다.

**개선안**
1. **폴링을 로그인 상태에 종속**시킨다(근본). `AppShell` 폴링을 `isAuthenticated` 일 때만 — 어차피 P2-4(폴링 2벌)로 정리가 필요한 자리다.
2. `SESSION_EXEMPT_PREFIXES` 에 `/settings/terms`·`/settings/privacy` 추가 (App.tsx:179 주석이 이미 이 확장을 안내한다).
3. **"세션 없음"과 "세션 만료"를 구분** — 처음부터 세션이 없던 419 는 조용히 무시하고 토스트를 띄우지 않는다.

**합격 기준**: 시크릿 창에서 방침 화면 3분 방치 → 이탈·토스트 0. 로그인 후 실제 만료 시에는 기존 동작 유지.

---

### P0-2. 딥링크 목적지가 로그인 과정에서 사라진다 (구 UX-03 = A-2)

> **교차 검증됨** — 정적 감사와 운영 실측이 서로 독립적으로 같은 결론에 도달했다.

**증상**: 로그인 없이 `https://app.saigon-rider.com/market` 접속 → 스플래시. 원래 가려던 곳으로 돌아가지 않는다.

**원인**

- `PrivateRoute` 는 목적지를 넘기기는 한다: `components/auth/PrivateRoute.tsx:15` — `<Navigate to="/splash" replace state={{ from: location }} />`
- **스플래시가 그 값을 인증 화면으로 전달하지 않는다**: `pages/auth/Splash.tsx:134`
- **로그인 성공 4지점이 전부 `/home` 하드코딩**: `OAuthLogin.tsx:72·86·254`, `OAuthResult.tsx:47`
- `/link?action=...` 딥링크는 파라미터를 보존하지 않고 `/splash` 로 교체: `pages/link/LinkRouter.tsx:31-42`
- `state.from` 을 소비하는 곳은 `PhoneVerify.tsx:133-134` 하나뿐(폴백도 `/market/new`)

**사용자 영향** — 중고거래·동네지도 앱에서 유입 경로 전멸
- Zalo·Messenger 로 **매물 링크를 받은 사람**이 열면 홈. 그 매물을 다시 찾을 방법이 없다.
- **푸시 알림**(새 메시지·가격 제안)을 세션 만료 상태에서 누르면 홈. 알림의 목적이 사라진다.
- 업체가 자기 가게 링크(`/biz/:id`)를 홍보해도 신규 사용자는 도달 못 한다 — **비즈니스 파트너 상품 가치와 직결**.

**외부 근거**: 표준 관행은 *"목적지를 메모리에 보관 → 로그인 요구 → 즉시 원래 목적지로. 홈에 떨구지 않는다"* 이며, 설치 직후 유입에는 deferred deep linking 을 쓴다.
([Adjust](https://www.adjust.com/blog/deep-linking-dos-and-donts/) · [Rocketfarm Studios](https://www.rocketfarmstudios.com/blog/deep-linking-and-deferred-deep-linking-in-mobile-apps/))

**개선안**
1. 앱 내부 경로만 허용하는 검증된 `returnTo` 를 **Splash → OAuth → 프로필 설정까지 보존**하고 성공 후 **한 번만 소비**한다. OAuth 는 페이지를 벗어나므로 `sessionStorage` 보관이 안전하다.
2. 외부 URL·`javascript:` 는 거부(open redirect 방지).
3. 신규 가입은 `profile-setup` 완료 **후** 목적지로.

**합격 기준**: 로그아웃 상태에서 DM·상품·알림 딥링크를 열고 로그인하면 각각 원래 화면에 도착. 뒤로가기로 인증 화면에 재루프하지 않음.

---

## 3. P1 — 핵심 여정·신뢰

### P1-1. 게임 아이템 스프라이트가 모든 화면 DOM 최상단을 차지한다 (신규)

**실측**: dev 로그인 상태에서 `document.body.innerText` 를 읽으면 **어느 화면이든** 이렇게 시작한다.

```
EXPRESS / 01/100 / RIDER / GHOST / SAIGON ROYALTY / 59 - X1 / 1234 /
ROOKIE / NEON HUNTER / SAIGON LEGEND / RANK BRONZE ★ / RANK MYTHIC ★★★★★★★ /
龍 / 鳳 / IMPERIAL / #0001 / 500 / THE LEGEND · DISTRICT MASTER · ALL 24 ...
```

- 매물 상세·알림함 등 **모든 화면**에서 재현. 실제 콘텐츠(매물 제목·가격)는 이 수백 자 뒤에 나온다.
- SVG 총 **385KB**, 그중 단일 스프라이트가 **225KB**. 주입 지점은 `App.tsx:400-401` 의 `<SpriteProvider />`·`<QuestCardSprites />`.
- **게이미피케이션은 보류 상태다** — 가챠·상점·인벤토리 라우트는 전부 주석 처리(`App.tsx:488-504`)인데 자산만 전 화면에 살아 있다.

**사용자 영향**
- **스크린리더 사용자는 어느 화면에서도 본문에 도달하기 전에 게임 아이템 이름 100여 개를 듣는다.** 실질적으로 앱을 쓸 수 없다.
- 모든 화면에서 385KB DOM 파싱·메모리. 저사양 단말에 직접 부담.

**개선안**: 게임 UI 를 실제로 쓰는 화면에서만 스프라이트를 마운트한다(현재는 쓰는 화면이 **없다**). 전역 마운트를 제거하고, 남긴다면 `aria-hidden="true"` + `<defs>` 안에 두어 텍스트 노드가 접근성 트리에 노출되지 않게 한다.

**합격 기준**: 임의 화면에서 `document.body.innerText` 첫 100자가 그 화면의 실제 콘텐츠. 스크린리더 첫 낭독이 화면 제목.

### P1-2. 판매완료가 종결 상태로 동작하지 않는다 (구 UX-01)

**근거** — 현재 커밋에서 재확인
- 판매자 화면에서 **`가격 수정` 은 상태와 무관하게 렌더**된다: `pages/market/MarketDetail.tsx:375-385`. SOLD 가드는 **`매물 수정`·`매물 철회` 에만** 걸려 있다(`:386-397`).
- **상태 전환 버튼도 SOLD 에서 그대로 렌더**된다: `:398-408`.
- 백엔드: 가격 API 는 SOLD 면 409 로 거절(`backend/app/routers/market.py:677-697`) → **`가격 수정`은 눌러도 성공할 수 없는 버튼**이다.
- 상태 API 는 목표 상태가 SOLD 인 것만 막고 **현재 상태가 SOLD 인 매물을 막지 않는다**(`:624-674`) → **판매완료를 판매중으로 되돌릴 수 있다**.

**사용자 영향**: 완료된 거래 이력과 상태 신뢰가 훼손된다. 구매자 입장에서 "판매완료"가 언제든 뒤집힐 수 있다.

**개선안**: ①SOLD 판매자에게는 가격·상태·철회 UI 를 숨기고 거래이력/후기/재등록만 ②백엔드에서 `status == SOLD` 인 매물의 일반 상태 PATCH 거절 ③"다시 판매"는 **새 매물 복제**로(기존 거래 기록 변조 금지).

**합격 기준**: 판매완료 상세에서 성공할 수 없는 버튼 0개. API 직접 호출로도 판매완료 거래를 재개할 수 없음.

### P1-3. 동네지도 진입만으로 위치 권한을 요청한다 (구 UX-02 — **실측 확증**)

**실측**: `navigator.geolocation.getCurrentPosition` 을 후킹한 뒤 탭바로 `/map` 진입 → **호출 1회 발생**(경로 `/map`). 정적 지적이 실행 레벨에서 확인됐다.

**근거**: `pages/map/NeighborhoodMap.tsx:74-98` 이 mount 직후 `requestDeviceLocation()` 실행 → `lib/serviceLocation.ts:11-13` 이 `native.ensureLocationPermission()` 후 실제 위치를 읽는다.
**프로젝트 자체 규칙 위반**이기도 하다 — `ai-docs/context/service-rules.md:11-12` 는 화면 이동 시 GPS 자동 측정을 금지하고 지도/정보 탐색은 GPS 없이 가능해야 한다고 명시한다.

**외부 근거**: 권한은 **사용자가 그 기능을 시작한 맥락에서** 요청하고, 거부해도 앱이 계속 동작해야 한다(Android 공식 권한 지침).

**개선안**: 자동 요청 제거 → 기본은 저장 지역/수동 선택. `내 주변순`·`현재 위치로 이동`을 누를 때 목적을 설명하고 요청. 거부·위치 꺼짐·timeout 을 구분하고 `지역 직접 선택` CTA 를 항상 제공.

**합격 기준**: 새 설치 후 홈·마켓·지도·정보를 둘러보는 동안 OS 위치 권한창이 뜨지 않는다.

### P1-4. 통화 표기가 앱 안에서 두 벌이다 (신규)

**실측** — 같은 세션, 같은 앱

| 화면 | 표기 | 구분자 |
|---|---|---|
| 홈·마켓 매물 | `280.000 đ` · `24.500.000 đ` | **마침표** + 소문자 `đ` 후치 |
| 정보(주유소·정비소) | `22,850₫/L` · `250,000₫` | **쉼표** + 기호 `₫` |

**베트남 표기 관례는 마침표가 천단위 구분자이고 쉼표는 소수점**이다. 따라서 `22,850₫` 는 현지 사용자에게 **22.85동**으로 읽힐 수 있다 — 리터당 2만원대 유가가 22동으로 보인다.
[`context/current.md`](./context/current.md) 는 2026-07-07 에 "가격 표기 현지화(`N đ` 후치, Chotot 실측 관례)"를 마켓 표면에만 적용했다고 기록한다 — **정보 화면이 그 정비에서 누락됐다.**

**개선안**: 통화 포맷 유틸 하나로 통일(`Intl.NumberFormat('vi-VN')`), 정보 화면 3곳(주유·정비·평균단가) 교체. 문자열 리터럴에 숫자를 직접 넣는 곳을 금지 규칙으로 남긴다.

### P1-5. 위치의 출처를 숨기고 기본값을 실제 위치처럼 보여준다 (구 UX-06 — 실측 보강)

**실측**
- 홈 헤더에 지역명과 거리가 함께 뜨는데 **무엇으로부터의 거리인지 설명이 없다**. 실측값은 접속 환경에 따라 `0.00 km`(운영) / `1075.27 km`(dev, 국외 접속) 로 나왔다 — **어느 쪽도 사용자에게 의미가 없고**, 후자는 명백히 표시해선 안 되는 값이다.
- 같은 화면 정보 위젯은 그 상태에서도 **"주유소 32곳 · 3km 이내", "정비소 117곳 · 3km 이내"** 라고 단언한다. 기준 좌표가 1000km 밖이어도 문구는 그대로다.

**근거**: 홈은 위치가 없으면 Bến Thành fallback 으로 시작하고 헤더에 출처 표시 없이 정상 지역명처럼 보여준다(`pages/home/WorldMapV2.tsx:160-170, 217-223, 351-355`).
동네지도 목록의 지역 선택은 로컬 state 라 `지도보기` 전환에 전달되지 않는다(`pages/map/NeighborhoodMap.tsx:32-37, 159-164` — 코드 주석상 알려진 트레이드오프).

**사용자 영향**: 같은 좌표가 매물·날씨·침수·주유소·정비소 문맥에 모두 쓰인다. **안전 정보(침수)를 기본 좌표 기준으로 보여주면서 실제 주변 정보처럼 표시**하는 것이 가장 위험하다.

**개선안**: 위치마다 `device / saved / manual / default` 출처를 유지하고, fallback 이면 "내 주변" 대신 **`기본 지역: Bến Thành · 지역 설정`** 처럼 사실을 표시. 목록의 `selectedRegion` 을 route state 로 지도에 전달. **의미 없는 거리(0.00km/1075km)는 표시하지 않는다.**

### P1-6. DM 장애가 빈 대화와 메시지 유실로 보인다 (구 UX-04)

- 초기 대화 요청 오류를 무시하고 loading/error 상태가 없다: `pages/dm/DmDetail.tsx:56-84` → **로드 실패가 "대화 없음"으로 보인다.**
- 전송 전에 입력을 비우고 실패 시 toast 만 띄운 뒤 원문을 복원하지 않는다: `:153-170` → **거래 협상 메시지가 사라진다.**

**개선안**: `loading / error+retry / genuinely empty / ready` 분리, 초기 로드 완료 전 composer 잠금, 전송 실패 시 draft 복원 또는 실패 bubble 에 `재전송`, 실패는 `role=alert` 로 보조기기에도 전달.

### P1-7. 작성 중 탭 오터치로 초안이 사라진다 (구 UX-05)

- 탭바 숨김 목록에 `/feed/new`·`/feed/*/edit` 가 없다: `AppShell.tsx:23-38`.
- 작성 내용·업로드 상태는 로컬 state 이고 이탈 경고·draft 복구가 없다: `FeedCreate.tsx:28-40`, `FeedEdit.tsx:34-45`.

**개선안**: 작성/수정 라우트에서 탭바를 숨기고(P1-8 과 함께 처리), 변경이 있으면 이탈 시 `계속 작성 / 버리기`를 묻고, 최소한 텍스트 draft 를 세션 보존.

### P1-8. 탭바가 30여 화면에서 전부 비활성이다 (구 B-1 — UX-05 의 상위 문제)

**실측**: 약관 화면 캡처에서 탭 5개(Trang chủ·Chợ·Bản đồ·Cộng đồng·Hồ sơ)가 **모두 회색**이다. 활성 표시가 하나도 없다.
(5개 루트 화면에서는 활성 표시가 정상 동작함을 dev 에서 확인했다 — 문제는 **탭에 속하지 않는 화면**이다.)

**원인**: 탭바는 5개 루트만 안다(`TabBar.tsx:52-58`). 숨김 목록(`AppShell.tsx:23-38`)에 없는 화면은 **탭바가 뜨는데 어느 탭에도 매칭되지 않는다.**

| 영역 | 해당 경로 |
|---|---|
| 설정 | `/settings` + 하위 9개 |
| 정보 | `/info` + 하위 8개 |
| 알림·DM | `/notifications`, `/dm`(숨김 규칙이 `'/dm/'` 라 루트는 걸리지 않음) |
| 프로필 파생 | `/trades`, `/followers/:id`, `/following/:id`, `/friends/:id`, `/friends/add` |
| 기타 | `/quests`, `/quests/:id`, `/notices`, `/notices/:id`, `/faq`, `/guide/safe-trade` |
| 작성 화면 | `/feed/new`, `/feed/edit/:id` (P1-7) |

**외부 근거**: Material Design 3 는 활성 목적지를 filled 아이콘 + active indicator + 강조색으로 표시하도록 규정한다. 탭바 구현 자체는 이 기준을 만족한다(`TabBar.module.css:67-81`) — **문제는 규칙이 아니라 적용 범위다.**
([Material 3](https://m3.material.io/components/navigation-bar/overview) · [UXPin](https://www.uxpin.com/studio/blog/mobile-navigation-examples/))

**개선안**(택1, 1번 권장): ①경로→탭 매핑으로 **소속 탭을 활성 표시**(`/settings/*`·`/trades`·`/friends/*`→프로필, `/info/*`→홈, `/notifications`·`/dm`→프로필) ②서브페이지에서 탭바를 숨김.
지금은 두 방식이 섞여 있다 — `/market/*`·`/biz/*`·`/dm/*` 은 숨기고 `/settings/*`·`/info/*` 는 띄운 채 비활성. **하나로 통일해야 한다.**

### P1-9. 비로그인 화면에 탭바가 떠 있고 누르면 튕겨나간다 (구 B-2)

**실측**: 약관 화면(비로그인)에서 "Trang chủ" 클릭 → 스플래시 + "세션 만료" 오류. 가입 전 사용자에게 **누를 수 있게 생겼지만 누르면 실패하는 버튼 5개**를 보여준다. P0-1 의 거짓 오류와 겹쳐 첫 경험이 두 번 나빠진다.

**개선안**: 미인증 상태에서 탭바를 숨기거나, 탭을 누르면 오류 없이 로그인 화면으로 안내(P0-2 의 목적지 보관과 함께 처리하면 로그인 후 원래 화면 복귀).

### P1-10. 웹에서 Google 로그인 버튼만 한국어로 고정된다 (구 B-3)

**실측**: 앱 언어를 VI 로 바꾼 뒤에도 — Zalo 는 `Tiếp tục với Zalo` ✅ / Google 은 **`Google 계정으로 계속하기`** ❌

**원인**: 웹은 GIS 공식 버튼을 SDK 가 렌더한다(`OAuthLogin.tsx:123-130`). `renderButton` 에 **`locale` 을 넘기지 않고**, 초기화 effect 가 마운트 1회라 **언어를 바꿔도 재렌더되지 않는다**(`:108`). 네이티브 버튼은 `t('oauthLogin.googleBtn')` 이라 정상(`:291`) — **웹 접속자에게만** 발생.
로케일 파일 자체는 정상이다(vi/en/ko `:292` 모두 채워져 있고, JSX 하드코딩 한국어는 전수 검사 결과 2건뿐).

**개선안**: `renderButton` 에 현재 언어 전달 + 언어 변경 시 재렌더. 폭 불일치도 함께(`width: offsetWidth || 320`(`:129`)가 레이아웃 확정 전 값을 읽어 Google 버튼이 Zalo 보다 좁게 렌더된다).

### P1-11. 언어 선택 국기 3개가 전부 404 다 (구 B-5)

**실측**: `.../notemoji/latest/1f1fb-1f1f3/512.gif` → 로드 실패(`naturalWidth = 0`). **Noto 애니메이션 이모지에는 국기가 없다.**
`lib/emoji.ts:5` 주석이 *"국기처럼 CDN에 없는 경우에만 외부 URL fallback"* 이라고 적으면서 **그 CDN 으로 폴백하는 자기모순**이다(`:26`). 사용처는 `pages/auth/Splash.tsx:15-18, 86-87, 103-104`.

**해법은 이미 앱 안에 있다** — `flag-icons` 가 번들에 있고(`main.tsx:8`) 다른 화면은 그걸로 정상 렌더한다: `settings/LangSettings.tsx:41`, `auth/PhoneVerify.tsx:162`.
`LangSettings.tsx:10` 주석: *"국기는 flag-icons 사용 — **이모지 국기는 단말별 렌더 편차가 큼**"*. **팀이 이미 알고 고친 문제인데 첫 화면만 옛 방식으로 남았다.**

**개선안**: 스플래시 국기를 `fi fi-vn`/`fi fi-us`/`fi fi-kr` 로 교체(2줄). 언어 선택 UI 가 두 벌(스플래시/설정)인 것도 정리.

### P1-12. 스플래시 하단의 회색 덩어리 (구 B-4)

**DOM 계산 스타일 실측**

| 요소 | 배경 |
|---|---|
| 스플래시 루트 | `rgb(8, 9, 15)` |
| 버튼을 감싼 `glass-surface` | **`rgba(255, 255, 255, 0.55)`** |
| `backdrop-filter` | `none` |

**라이트 테마용 유리 표면을 다크 화면에 얹었다.** 뒤가 검정이라 반투명 흰색이 회색 판으로 보인다.

**개선안**: 스플래시에서 유리 표면을 쓰지 않거나 다크 변형(`rgba(255,255,255,0.08)` + 밝은 테두리)을 쓴다. `backdrop-filter` 없이 반투명만 쓰는 조합은 어느 배경에서도 유리로 보이지 않는다.

### P1-13. 공개 랜딩 스크린샷이 제품 신뢰를 깎는다 (구 UX-07)

> **범위 주의** — 이 항목은 **일반인에게 공개된 랜딩 게시 자산**에 한정한다.
> dev 서버(`saigon.doil.me`)에서 관찰된 `[DEV]`·QA 문자열은 **테스트 데이터이므로 결함이 아니다**(대표 확인, 2026-08-03).

**근거**: 현재 랜딩은 홈·마켓·상세·커뮤니티 스크린샷을 직접 공개한다(`landing/apps/client/src/pages/home/Index.tsx:31-33, 253`).
- 홈 캡처에 `[DEV]` 업체명
- 마켓 목록 캡처가 **서로 다른 상품에 같은 흑백 사진을 반복**하고 제목·사진 의미가 어긋남
- 상세 캡처에 제목과 무관한 사진 + 판매완료 조작 UI(P1-2 가 그대로 찍혀 있다)
- 커뮤니티 캡처에 내부 익명화 닉네임 **`del_6a6ed1a9`** 노출 (탈퇴 익명화 규칙: `backend/app/routers/users.py:305-310`)

**사용자 영향**: 앱을 설치하기 전 처음 보는 화면이 **테스트 중인 서비스처럼** 보인다.

**개선안**: ①**캡처 전용 시드**를 고정하고 상품별로 의미가 맞는 사진·자연스러운 베트남어 예시 사용 ②탈퇴 사용자는 공개 화면에서 현지화된 "탈퇴한 사용자" + 중립 avatar 로 표시하고 내부 익명화 값을 UI 모델 밖으로 ③재캡처 후 제품 담당자 승인 ④`[DEV]`·`del_*`·UUID 가 **공개 자산**에 들어가지 않는지 CI 검사.

**합격 기준**: 공개 랜딩 4개 캡처에서 `[DEV]`·`del_*`·중복/불일치 사진 0건. 캡처의 제목·가격·상태·사진·CTA 가 서로 의미상 일치.

**후속 조치 (2026-08-03, fix/260803-ux-gate-a)**

- 탈퇴 사용자 표시(②): 공용 유틸 `frontend/src/lib/format.ts` 에 `isWithdrawnNickname`/`displayNickname` 추가, `pages/info/InfoRepairDetail.tsx` 의 리뷰 작성자 닉네임 표시에 적용(로케일 키 `common.withdrawnUser`: vi "Người dùng đã rời đi" / ko "탈퇴한 사용자" / en "Withdrawn user"). **아직 안 고친 경로** — 담당 파일 밖이라 보고만 함: `backend/app/routers/dm.py:160,189,265,426`, `feed.py:108,442`, `market.py:440,833,1544`, `follows.py:21`, `biz.py:1257,1289,1297,1320,1367`, `users.py:363,410,445`, `info_repair.py:254,312`(익명 아닌 경우 raw nickname 통과) 가 전부 `del_*` 원본값을 그대로 직렬화한다 — 프론트 쪽도 `feed/FeedList.tsx:138`, `feed/FeedDetail.tsx:144`, `market/MarketDetail.tsx:268,347,348`, `dm/DmDetail.tsx:78`, `dm/DmList.tsx:72`, `profile/FriendAdd.tsx:158`, `FollowerList.tsx:80`, `FriendList.tsx:61`, `FollowingList.tsx:97`, `components/ProfileCard.tsx:515` 가 마스킹 없이 렌더한다. **권고**: `deleted_at is not None` 을 이미 들고 있는 백엔드 직렬화 레이어(각 라우터가 `User` row 를 이미 조회함)에 공용 `display_nickname(user)` 헬퍼를 두고 위 지점들에 일괄 적용 — 프론트 개별 컴포넌트에 `startsWith('del_')` 를 흩뿌리는 것보다 단일 지점이고, 와이어에 원본 `del_*` 값이 애초에 나가지 않는다.
- CI 검사(④): `tools/check_landing_public_assets.py` 신설, `.pre-commit-config.yaml` 에 `landing-public-assets` 훅으로 등록(`landing/apps/client/{public,src}/**`). `[DEV]`·`del_<hex16>`·UUID 리터럴을 텍스트 파일에서, 이미지 등 바이너리는 임베디드 ASCII 메타데이터만 얕게 검사. 현재 실행 결과: **위반 0건**(현재 소스에 리터럴 노출 없음 — 스크린샷 자체는 픽셀 내용이라 코드로 판별 불가, 아래 재캡처 체크리스트로 보완).
- 재캡처 시 확인 체크리스트(③ 전 단계): 재캡처 세션은 아래를 확인 후 게시한다.
  1. 업체/상품명에 `[DEV]`·`test`·`QA`·`더미` 등 내부 표식이 없는가.
  2. 마켓 목록 캡처의 각 카드 사진이 실제로 서로 다른 상품이고 제목과 사진이 일치하는가.
  3. 상세 캡처의 사진이 제목 상품과 일치하고, 판매 상태 UI(판매중/예약중/판매완료)가 실제 유효한 상태를 보여주는가(P1-2 조작 여지가 있는 상태가 찍히지 않았는가).
  4. 커뮤니티/리뷰 캡처의 작성자 닉네임이 정상 계정이고 `del_*` 형태가 아닌가.
  5. 위 4개 이미지를 `tools/check_landing_public_assets.py` 로 재검사(0건 확인 후 배포).

### P1-15. 제출 버튼이 전송 중에도 계속 눌린다 — 중복 제출 (신규, 클릭 피드백)

**근거** — 매물 등록이 대표 사례다.

```tsx
// pages/market/MarketCreate.tsx:138-140
<Button onClick={handleSubmit} disabled={!canPost} style={{ minWidth: 64 }}>
  {posting ? t('market.posting') : t('market.submit')}
</Button>
```
- 라벨은 `posting` 에 따라 "등록 중"으로 바뀌는데 **`disabled` 는 `!canPost` 만 본다** — `posting` 이 반영되지 않는다.
- 진입 가드도 `if (!canPost || !user) return;`(`:104`) 로 **`posting` 을 확인하지 않는다.**
- → **연타하면 `createListing` 이 중복 호출된다.** 느린 네트워크일수록 사용자는 반응이 없다고 느껴 재탭하므로 실제로 발생한다.

**같은 패턴(제출 중 상태가 `disabled` 에 반영되지 않음)**: `MarketEdit.tsx:143` · `FeedCreate.tsx:129` · `FeedEdit.tsx:173` · `BizApply.tsx:215` · `BizNewsCreate.tsx:118` · `BizPriceManage.tsx:114` · `BizAdsNew.tsx:403`
**제대로 된 예도 있어 규칙이 일관되지 않다**: `ProfileSetup.tsx:240`(`!isValid || saving || ...`) · `BizVerification.tsx:241`(`|| uploading || submitting`) · `DmDetail`(핸들러마다 `sending` 가드 7곳 — 메시지 중복 전송은 막혀 있다).

**사용자 영향**: 같은 매물·게시글이 여러 건 등록된다. 중고거래에서 중복 매물은 판매자 신뢰와 목록 품질을 직접 깎고, 삭제라는 수습 작업을 사용자에게 떠넘긴다.

**개선안**: ①공용 `Button` 에 `loading` prop 을 두고 **`loading` 이면 자동으로 `disabled` + 스피너**를 적용해 화면마다 다시 구현하지 않게 한다 ②모든 제출 핸들러 진입부에 `if (busy) return;` ③성공 후 `replace: true` 이동은 이미 되어 있으므로(뒤로가기로 폼 복귀 방지) 그대로 유지.

**합격 기준**: 느린 네트워크(3G 스로틀)에서 등록 버튼을 5회 연타해도 매물이 1건만 생성된다. 전송 중 버튼에 진행 표시가 보이고 다시 눌리지 않는다.

> **관련 범위 확장**: 좋아요·팔로우·대화 시작·날씨 알림 등 **비동기 액션 전반**에 pending 표시·중복 탭 방지·상태 알림이 부족하다(구 UX-16). 같은 `Button loading` 규칙과 `aria-busy`/`aria-live` 로 함께 정리한다.

### P1-16. 거래 이력·프로필 조회 실패가 "데이터 없음"으로 보인다 (구 UX-11 중 P1 구간)

프로필의 거래 이력·퀘스트 등 일부 조회는 오류를 `[]` 또는 무응답으로 바꾼다. 사용자는 **서버 장애를 "내 거래 기록이 사라졌다"로 읽는다.**
중고거래에서 거래 이력은 **판매자 신뢰의 근거**이고, 구매자가 판단에 쓰는 정보다. 그것이 "0건"으로 보이는 것은 단순 빈 화면이 아니라 **신뢰 정보의 훼손**이다.

**개선안**: 거래 이력·프로필 핵심 데이터는 `error + 재시도`를 명시하고 **빈 상태와 오류를 절대 같은 화면으로 렌더하지 않는다**. 부가 목록(지도 찜·팔로우 등)은 P2-13 으로 함께.
**합격 기준**: 해당 API 에 500/timeout 을 주입했을 때 "거래 0건"이 아니라 오류+재시도가 표시된다.

### P1-14. 핵심 컨트롤이 보조기기에 동등하게 제공되지 않는다 (구 UX-13/14)

- 공용 `Chip` 은 항상 `div` 를 렌더하는데 마켓의 거래완료 숨기기·피드 필터가 이를 클릭 컨트롤로 쓴다: `components/ui/Chip.tsx:6-20`, `market/MarketMain.tsx:295-307`, `feed/FeedList.tsx:138-156`.
- 지역·업종·응원 선택과 unread dot 일부는 색만 바뀌고 `aria-pressed`/`aria-checked`/읽지 않은 개수가 일관되지 않다.
- FAQ·공지·고객지원·업체 카드 일부도 `div onClick` 이라 Tab/Enter/Space 로 진입 불가.
- **P1-1 과 합쳐지면** 스크린리더 사용자는 사실상 앱을 쓸 수 없다.

**개선안**: 클릭 가능한 `Chip` 은 `button` 으로 렌더(`as` prop), 선택 상태에 `aria-pressed`, 카드형 진입점은 `button`/`a`, unread 는 개수를 텍스트로 제공.

---

## 4. P2 — 구조·성능·완성도

| ID | 항목 | 근거 | 개선 |
|---|---|---|---|
| **P2-1** | **단일 번들 750KB(gzip) / 파싱 2,546KB**, CSS 158KB(791KB). 코드 스플리팅 0 — `App.tsx:24-149` 가 40여 라우트를 전부 정적 import | 운영 실측 | 라우트 `React.lazy`(특히 지도·게임 스프라이트·업체 관리), `manualChunks`, **CSS 부터**(`flag-icons` 전체 스프라이트가 통째로 들어가 있는데 쓰는 국기는 3개), nginx **brotli** 추가 |
| **P2-2** | 본문 폰트를 **외부 CDN** 에서 로드 — `cdn.jsdelivr.net`(Pretendard), `fonts.googleapis.com`(Space Grotesk·Instrument Serif) | 운영 네트워크 실측 | 자체 호스팅 + `font-display: swap` + 베트남어 서브셋. **오프라인 폴백·제3자 IP 전송(국외이전 고지)·첫 렌더 의존** 3중 문제 |
| **P2-3** | **유령 토큰 `--text-1`** 미정의인데 13곳(6파일) 참조 — `PostPanel`(6)·`WorldMap`(2)·`MapFollows`(2)·`MapFavorites`·`ProfileMain`·`LegalPage` | 운영 실측(빈 문자열) | 정의하거나 실토큰으로 치환 + **미정의 `var(--*)` CI 검사**(시각 회귀 부재의 값싼 대체재) |
| **P2-4** | DM 폴링이 **두 벌** — `AppShell.tsx:50-54`(로그인 무관, 20초) + `App.tsx:~290-302`(`user?.id` 의존) | 코드 | 하나로 통합. **P0-1 의 직접 원인**이라 같이 처리 |
| **P2-5** | 게임 허브 FAB 가 `display:none !important` 로 가려진 채 **30여 화면에서 계속 마운트**. 시트 항목은 `/info` **1개**뿐이고 골드·XP HUD 가 `fetchWallet()` 호출. 아이콘은 오토바이·라벨은 "라이딩 시작"인데 동작은 정보 허브 | `FloatingActionButton.module.css:2-3`(바로 다음 줄 `display:flex` 와 선언 충돌), `GameHubSheet.tsx:16-23` | CSS 로 가리지 말고 **마운트 자체를 제거**. 부활 지점은 주석으로 |
| **P2-6** | 토스트 `position="top-center"` 인데 `offset` 은 `bottom` 만 지정 — 무효 | `App.tsx:402-407` | 상단 오프셋으로 교체. iOS 노치 간섭 실기기 확인 |
| **P2-7** | **404 화면이 없다** — 오타 URL·삭제된 매물 링크가 설명 없이 홈/스플래시로 흡수 | `App.tsx:538` | "찾을 수 없는 페이지" + 홈/이전 CTA. P0-2 와 함께 하면 "링크가 만료됐어요" 안내 가능 |
| **P2-8** | **이미지 lazy loading 0개** — 목록 화면에서 이미지 24개가 전부 즉시 로드(`loading="lazy"` 지정 0) | 실측 | 목록·캐러셀 이미지에 `loading="lazy"` + `decoding="async"`. 데이터 요금·메모리 직결 |
| **P2-9** | 설정 화면 **"위치 권한: …"** 값이 채워지지 않은 채 노출 | 실측 | 상태 조회 실패/미지원을 명시적 문구로 |
| **P2-10** | **FAB 가 마지막 카드를 가린다** — 52px FAB 가 `bottom:18px` overlay 인데 콘텐츠 하단 예약 여백은 16px 수준 | `WorldMapV2.module.css:789-808`, `MarketMain.module.css:110-144` (홈 실측에서도 거래 가이드 카드와 겹침 확인) | FAB 지름+offset+여유만큼 **최소 86px** 하단 공간 예약. 320/390px 폭, iOS/Android gesture inset 에서 마지막 항목 전체 노출 확인 |
| **P2-11** | **탭 전환 시 상태가 초기화된다** — 지도 지역·카테고리, 피드 필터·스크롤이 unmount 와 함께 사라짐. 마켓은 상세 진입 때만 스크롤 저장 | 코드 | 탭별 route/state cache 또는 URL query 로 필터·스크롤·지도 viewport 보존. **Apple HIG 는 탭별 navigation state 보존을 요구**한다 |
| **P2-12** | **공용 TopBar 의 Back 이 무조건 `navigate(-1)`** — 외부 딥링크·새 탭 진입에서 앱 밖/빈 history 로 이탈 가능 | `components/.../TopBar.tsx:32-36` | 상단 버튼을 **앱 계층의 Up** 으로 정의하고 history 가 없으면 섹션 root 로. 시스템 Back 과 역할을 분리 |
| **P2-13** | **일부 오류를 `[]`·무응답으로 바꾼다** — 지도 찜/팔로우, 피드/마켓 수정 초기 로드 등. 서버 장애가 "내 데이터 없음"으로 보임 | 코드 | 섹션별 stale-data + error/retry, empty 와 error 분리. 500/timeout fault-injection. ※ **거래 이력·프로필 데이터는 P1-16 으로 분리** |
| **P2-14** | **GIS 초기화 실패 시 눌리지 않는 가짜 로그인 버튼**이 남는다 — 정적 placeholder 가 계속 표시되고 원인·재시도가 없음 | `OAuthLogin.tsx:107-125, 318-324` | 명시적 로딩 → 공급자 오류 + 재시도. 실제 `button` 의 disabled/aria 사용. **Zalo 가 정상이면 P2, Google 이 유일 경로면 P1** (P1-10 과 같은 파일이라 함께 처리) |
| **P2-15** | **44px 미만 터치 타깃이 반복된다** — 피드 헤더 40px, 지도 프로필 36px, 프로필 친구/DM 34px, 피드 사진 삭제 24px, 키워드 알림 삭제 **18px** | 코드 | 시각 크기는 유지하되 **hit area 를 iOS 44pt / Android 48dp** 로. (탭바 자체는 기준 충족 — 문제는 개별 아이콘 버튼들) |
| **P2-16** | Capacitor Core 8.3.4 인데 `@capacitor/system-bars` 가 없고 CSS 가 주로 `env(safe-area-inset-*)` 에 의존 | 의존성·CSS | **즉시 결함으로 단정하지 말 것.** inset 을 0 으로 보고하는 **구형 Android WebView 실기기에서 확인** 후, 재현되면 SystemBars fallback 변수를 기존 토큰에 연결 |

**성능 항목의 정확한 근거** — 네트워크는 문제가 아니다. 베트남 모바일은 2026-01 기준 평균 다운로드 **90.05Mbps**, Ookla 종합 **200.54Mbps** 로 세계 평균의 약 2배다.
**진짜 비용은 저사양 단말의 파싱·컴파일**이며 이는 메인 스레드를 막는다. 업계 기준선은 *"gzip 150KB ≈ 코드 1MB ≈ 대부분의 폰에서 1초 이상"* 인데 **우리는 그 5배**다.
Capacitor 네이티브는 다운로드 비용은 없지만 **파싱 비용은 그대로**다.
([VietnamPlus](https://en.vietnamplus.vn/vietnams-internet-speeds-surge-at-start-of-2026-post338313.vnp) · [V8](https://v8.dev/blog/cost-of-javascript-2019) · [web.dev](https://web.dev/articles/optimizing-content-efficiency-javascript-startup-optimization))

---

## 5. 화면상 부조화와 정보구조

개별 결함이 아니라 **화면들 사이의 문법이 어긋나는 문제**다. 하나씩은 사소해 보이지만 합쳐지면 "여러 앱을 이어붙인 느낌"을 만든다.

### 5.1 최상위 내비게이션 — 홈이 각 탭의 책임을 흐린다

하단 5개 탭의 **개수 자체는 문제없다**(Android 권장 3~5개 범위). 문제는 **홈이 마켓·업체 소식·커뮤니티·생활정보를 다시 긴 목록으로 복제**한다는 점이다.
사용자는 "홈에서 볼지, 마켓/피드에서 볼지"를 매번 판단해야 한다. 실측한 홈은 섹션이 7개+였다(D-5).

두 해석이 가능하므로 **제품 결정이 필요하다.**

1. **홈 유지안** — 홈은 개인화된 짧은 요약과 미확인 상태만 제공하고, 긴 피드·중복 CTA·게임 재화는 각 전문 탭으로 보낸다.
2. **마켓 우선 4탭안** — 서비스 구상서의 마켓 피벗과 4탭 방향을 채택하고 홈을 제거한다. 첫 화면을 마켓으로, 지도/커뮤니티/프로필을 독립 목적지로 유지한다.

**현재 제품 SoT([`spec/service-concept-260726.md`](./spec/service-concept-260726.md))가 마켓 우선을 선언하고 있으므로 2안이 더 일관적이다.**
다만 이는 UI 패치가 아니라 진입점과 지표를 바꾸는 결정이므로 **별도 승인 후** 진행한다.

### 5.2 화면별 시각·행동 문법

| 화면 | 관찰 | 개선 방향 |
|---|---|---|
| **Splash / OAuth** | 브랜드·CTA 계층은 좋다. 다만 뒤로가기 40px, 언어 선택 약 34px, 약관 링크가 작다. 하단 시트가 다크 배경에 라이트 유리(P1-12). 전체화면 loop video/blur 는 저사양·reduced-motion 에서 부담 | 타깃 44/48 확보, poster + `prefers-reduced-motion`, 작은 높이·200% 확대 점검 |
| **홈** | 프로필·재화·거리, 검색, 근처 상품, 업체 소식, 최근 상품, 생활정보, 커뮤니티가 **한 화면에 밀집**하고 전역 탭과 중복 | 1차 목적을 정하고 요약 모듈 수를 줄임. "더보기" hit area 확대. **fallback 위치 출처 표시**(P1-5) |
| **마켓** | 헤더가 **"전체 지역"인데 부제는 "내 주변 라이더 마켓"** — 범위가 모순된다(실측 확인). FAB 가 마지막 항목을 가림 | `호치민 전역 장터` / `내 근처 장터`를 **모드별로 문구 전환**. FAB 안전 여백(P2-10) |
| **동네지도** | 목록의 지역 선택이 지도로 이어지지 않고(P1-5) 자동 GPS 요청까지 겹침(P1-3). 카테고리 칩 마지막 항목이 화면 밖으로 잘림 | 지역·카테고리·viewport 를 **같은 세션 컨텍스트**로 전달. GPS 는 명시적 버튼에서만. 칩 가로 스크롤 여백 보정 |
| **커뮤니티** | 새 글 CTA 가 **좌상단 `+`** 인데 홈·마켓은 **우하단 FAB** — 같은 행동(생성)의 위치가 화면마다 다르다. 작성 화면에는 전역 탭이 남음(P1-7) | **최상위 화면의 생성 행동 규칙을 하나로** 확정. 최소한 CTA 위치·레이블·이탈 보호를 일관되게 |
| **프로필** | 거래 신뢰 정보와 함께 **EXP·Gold·칭호 배지·주행 그래프**가 크게 남아 있으나 관련 sink·스킬은 숨김 상태(D-2) | 미사용 재화는 숨기거나 거래 혜택과 연결될 때만 노출. **거래 이력·후기·인증을 먼저** 배치 |
| **상세 / 정보** | `MarketDetail` 은 공용 `TopBar` 대신 자체 헤더를 쓰고, 일부 카드형 행은 비시맨틱 클릭 영역(P1-14). 통화 표기도 화면마다 다름(P1-4) | detail 용 **공용 header variant** 를 만들고 back/action 위치·hit area 통일 |

### 5.3 현지 거래 서비스로서 빠진 신뢰 문맥

신고 기능이 존재하는 것은 긍정적이다. 다만 **위험이 실제로 발생하는 순간**(상품 상세 → DM → 약속 확정)에 짧은 안내가 없다.
[Chợ Tốt 안전 구매 안내](https://trogiup.chotot.com/nguoi-mua/meo-mua-hang-an-toan/)가 강조하는 항목을 그 지점에 1~2줄로 배치하면 현지 사용자의 거래 불안을 줄일 수 있다.

- **선입금 제한**, 물품 상태 직접 확인, 가능하면 2인 이상 동행 또는 COD
- 상품·사용자·대화 **단위별 신고 진입**과 처리 상태 표시
- **"인증됨"이 무엇을 뜻하는지 명시** — 전화인지, 동네인지, 신원인지

긴 안전센터 문서를 새로 만드는 문제가 아니라, **위험 지점에 링크와 한 줄을 놓는 문제**다.

---

## 6. 제품·경영 결정이 필요한 것

### D-1. 약관이 존재하지 않는 기능을 규정한다
운영 약관 본문에 **"3. Tiền ảo & Vật phẩm"(가상화폐·아이템)** 조항이 있다(Gold·XP·배지·아이템의 성격, 양도 금지, 가치 변경권). 그런데 게이미피케이션은 보류돼 관련 라우트가 전부 주석 처리됐다(`App.tsx:488-504`).
**공표한 것과 실제 기능이 어긋나 있다.** 법무 회신에 이 항목을 포함해야 한다.

### D-2. 보류한 게임 요소가 화면 곳곳에 남아 있다
- 스플래시 슬로건 **"Nơi mỗi chuyến đi là một nhiệm vụ"**(모든 주행이 하나의 퀘스트) — 제품은 중고거래+동네지도로 피벗했다.
- 프로필 핵심 위치에 **EXP 진행바(`200 EXP → LV.2`)와 칭호 배지**("Hiệp sĩ bóng đêm", "Hàng xóm mới").
- 커뮤니티 빈 상태: **"주행을 완료하고 사이공의 순간을 남기세요"** — 라이딩 포지셔닝.
- 정보 화면: **"정보 신고 시 RP 적립! 침수 신고 +10 RP"** — RP sink 는 0개다([`260802_remaining_blockers.md`](./260802_remaining_blockers.md) §2-2 S-1).
- 홈 최상단에 재화 표시(다이아 `0`).

**쌓이기만 하고 쓸 데 없는 재화를 계속 적립하라고 유도**하는 상태다. 재화 UI 를 내릴지 sink 를 열지 결정이 필요하다.

### D-3. 판매자 연락 수단이 채팅뿐이다
베트남 최대 중고 플랫폼 **Chợ Tốt**(Carousell 계열, 이용자 1,000만+·월 방문 5,500만)는 상세에서 **채팅과 전화를 함께** 제공하고 "Nearby Items"로 근거리 발견을 민다.
([Carousell](https://press.carousell.com/2025/01/17/cho-tot-ai-revolutionizing-home-decluttering-with-the-scan-to-sell-feature/) · [Chotot](https://apipark.com/techblog/en/chotot-buy-sell-smarter-on-vietnams-marketplace/))
우리는 전화 CTA 를 의도적으로 보류했다(전화번호 미보유 + 동의 정책 선행, 2026-07-07 기록). 근거 있는 결정이지만 **현지 기대와 어긋난다.** 근거리 발견(동네지도·ward 목록)이 이미 강하므로 **거기로 차별화해 전화 부재를 상쇄**하는 편이 현실적이다.

### D-4. 콜드 스타트 — 출시 시점에 앱이 비어 있다
**운영 실측**: 홈 "주변 인기 상품" **0건**, "최근 등록" **0건**, 마켓 **0건**, 동네지도 업체 **0건**.
빈 상태 처리 자체는 잘 돼 있다(`StateBlock`/`InfoState` 계열이 36파일 67곳, vi `empty*` 키 46개). **문제는 화면이 아니라 콘텐츠다.**

다만 **문구 하나는 지금 고쳐야 한다** — 동네지도 빈 상태가 *"나중에 다시 시도하거나 HCM 의 다른 지역을 탐색하세요"* 라고 안내하는데, 헤더는 이미 **"전체 지역"**이고 결과가 0 이다. **다른 지역에도 없다.** 사용자를 헛수고시킨다.

### D-5. 홈이 "모든 것의 목록"이 됐다
홈 한 화면에 섹션이 **7개+**(주변 인기 상품 / 업체 소식 / 최근 등록 / 거래 가이드 / 정보 위젯 4종 / 커뮤니티 인기글 / 공지). 초점이 없다.
무엇을 먼저 하라는 화면인지 사용자가 알 수 없고, 세로로 매우 길어 하단 섹션은 사실상 도달하지 않는다.

**함께 볼 것**: 공지 영역에 **"지금 바로 앱스토어에서 앱을 다운로드하세요"** 문구가 노출된다 — 이미 앱을 쓰는 사용자에게 하는 말이다. 공지 채널이 앱 내/외부용으로 분리돼 있지 않다는 신호다.

---

## 7. 처리 순서

**Gate A — 일반 공개 전 (여기까지 통과해야 출시)**

| 순서 | 항목 | 규모 | 근거 |
|---|---|---|---|
| 1 | **P0-1** 법적 문서 이탈·거짓 오류 | 반나절 | 출시 차단. 법무 리스크를 UI 가 무효화 |
| 2 | **P0-2** 딥링크 목적지 보존 | 반나절~1일 | 출시 차단. 공유·푸시·광고 유입이 전부 여기로 |
| 3 | **P1-1** 스프라이트 전역 마운트 제거 | 2시간 | 접근성 차단 + 모든 화면 385KB. 제거만으로 해결 |
| 4 | **P1-2** 판매완료 종결 처리 | 반나절 | 거래 신뢰의 근간 |
| 5 | **P1-3** GPS 자동 요청 제거 | 반나절 | 첫 진입 신뢰 + 자체 규칙 위반 |
| 6 | **P1-10·P1-11** Google 버튼 언어 · 국기 404 | 1~2시간 | 첫 화면, 해법이 이미 코드 안에 있음 |
| 7 | **P1-8(⊃P1-7)** 탭바 활성 규칙 통일 + 작성 이탈 보호 | 반나절 | 규칙 하나로 30여 화면이 동시 정상화 |
| 8 | **P1-15** 제출 중 중복 클릭 차단 (공용 `Button` 에 `loading`) | 2~3시간 | 한 컴포넌트 수정으로 8개 폼이 동시에 닫힌다 |
| 9 | **P1-4·P1-5** 통화 표기 통일 · 위치 출처 표기 | 반나절 | 오독·오인 방지 |
| 10 | **P1-6** DM 상태 분리·draft 복원 | 반나절 | 거래 대화 유실 방지 |
| 11 | **P1-9·P1-12** 비로그인 탭바 · 스플래시 유리 | 2~3시간 | 첫인상 |
| 12 | **P1-13** 공개 랜딩 재캡처 + 공개 자산 CI 검사 | 반나절 | 설치 전 첫인상 |
| 13 | **P1-16** 거래 이력·프로필 오류/빈 상태 분리 | 2~3시간 | 판매자 신뢰 정보 |
| 14 | **P1-14** `Chip`/카드 시맨틱·ARIA | 1일 | P1-1 과 함께해야 실효 |

**Gate B — 출시 후보 빌드에서**

| 순서 | 항목 |
|---|---|
| 15 | **P2-10** FAB/키보드/safe-area 겹침을 320px·390px, iOS·Android 내비게이션 모드별 확인 |
| 16 | **P2-11** 탭별 스크롤·필터·지도 viewport 보존 |
| 17 | **P2-12** safe Back fallback 과 Android 시스템 Back 일치 |
| 18 | **P2-13·P2-14** 오류/empty 분리, 로그인 공급자 실패 재시도 |
| 19 | **P2-15** hit area, **P2-3~P2-9** 유령 토큰·폴링·FAB 마운트·토스트·404·lazy·설정 표시 |
| 20 | **P2-1·P2-2** 번들 분할 · 폰트 자체 호스팅 (구조 변경 — CSS `flag-icons` 부터) |
| 21 | **P2-16** 구형 Android WebView safe-area 실기기 확인 |

**Gate C — 제품 결정 후**

| 순서 | 항목 |
|---|---|
| 22 | **§5.1** 홈 유지 vs 마켓 우선 4탭 결정 |
| 23 | **D-2** 게임 재화·퀘스트를 숨길지 거래 가치로 재정의할지 |
| 24 | **§5.2** root header·생성 CTA 공통 문법 확정 |
| 25 | **D-1·D-3·D-4·D-5** 약관 문안 · 연락수단 · 콜드스타트 · 홈 구조 |

---

## 8. 출시 합격 시나리오

아래를 **실제 API 가 연결된 signed iOS/Android 빌드**에서 모두 통과해야 한다. (지금까지의 검증은 전부 브라우저·서버 기준이다.)

| 여정 | 합격 조건 |
|---|---|
| 딥링크 → 로그인 | 로그아웃 상태의 DM/상품/알림 링크가 로그인·프로필 설정 후 **원래 목적지**에 도착 |
| 법적 문서 열람 | 비로그인으로 방침·약관을 **3분 이상 머물러도** 이탈·오류 없음 |
| 지도 첫 진입 | 새 설치에서 **권한창 없음**. 지역 선택만으로 탐색 가능. `내 주변`을 누른 뒤에만 권한 요청 |
| 지도 지역 연속성 | 목록에서 고른 지역·업종이 **지도 전환 후 그대로** 유지 |
| 판매완료 상품 | 가격·상태 변경 UI 없음. **API 직접 호출로도 재개 불가** |
| 중복 제출 | 3G 스로틀에서 등록/작성 버튼 5회 연타 → **1건만** 생성 |
| DM 불안정망 | GET/POST timeout 에서 과거 대화와 draft 를 잃지 않고 재시도 가능 |
| 피드 작성 | 탭 오터치 불가. Back 취소 후 모든 입력 유지. 저장 후 draft 제거 |
| 탭 왕복 | 각 탭의 스크롤·필터·지도 viewport 복구 |
| 하단 겹침 | 마지막 카드와 CTA 가 FAB·탭바·gesture area·키보드에 가려지지 않음 |
| 접근성 | 임의 화면의 **첫 낭독이 그 화면 제목**(P1-1), 주요 타깃 44pt/48dp, 모든 필터 키보드 조작, 선택/unread/오류를 보조기기가 인지 |
| 공개 콘텐츠 | 랜딩 캡처에 `[DEV]`·`del_*`·UUID·의미 불일치/중복 이미지 **0건** |

**실기기 매트릭스**
- iPhone notch/Dynamic Island + **200% 텍스트** + VoiceOver
- Android **3-button navigation / gesture navigation** + TalkBack
- **320px 폭** 소형 화면, 저사양 Android, 느린 4G·offline 전환
- 위치 **허용 / 거부 / 다시 묻지 않음 / 시스템 위치 꺼짐**
- 키보드가 열린 작성·DM·검색 화면에서 **Back 1회** 동작

### 아직 결함으로 단정하지 않은 고위험 점검

정적 코드와 공개 화면만으로 합격/불합격을 확정하지 않은 항목이다. **출시 전에 별도 증거를 남겨야 한다.**

- 상품·프로필·DM·만남 장소별 **정확 위치 노출 범위**, 저장 기간, 철회·삭제 동작
- approximate/coarse vs precise 권한 선택, one-time 권한, 앱 복귀 중 권한 철회 처리
- 위치 accuracy·timestamp 가 오래되거나 부정확할 때 이를 **"현재 위치"로 표현하지 않는지**
- 사용자 차단·괴롭힘 신고, DM 의 외부 메신저/피싱 URL/선입금 경고와 우회 패턴
- 일반 텍스트 **4.5:1**·비텍스트 상태 **3:1** 대비, 200% 확대와 reflow
- Android 구형 WebView 의 safe-area fallback 및 IME/키보드 inset (P2-16)

---

## 9. 외부 기준과 이 프로젝트에 적용한 판단

| 외부 공식 자료 | 핵심 적용점 |
|---|---|
| [Android navigation principles](https://developer.android.com/guide/navigation/principles) | Back 은 방문 이력의 역순이며 딥링크도 현실적인 back stack 을 구성해야 함 → **P0-2 `returnTo`·P2-12 safe Back** 근거 |
| [Capacitor App API](https://capacitorjs.com/docs/apis/app) | `backButton` 을 구독하면 앱이 history/종료 동작을 책임진다. 현재 의존성·코드에서 `@capacitor/app` 구독이 확인되지 않아 **현 구현의 직접 증거로는 사용하지 않음**(실기기 확인 대상) |
| [Android Navigation bar](https://developer.android.com/develop/ui/compose/components/navigation-bar) | compact 화면의 3~5개 동등하고 일관된 최상위 목적지 → 탭 **개수는 기준 내**이며 홈/마켓 위계는 별도 결정(5.1) |
| [Navigation bar — Material Design 3](https://m3.material.io/components/navigation-bar/overview) | 활성 목적지를 filled 아이콘 + active indicator + 강조색으로 표시 → **P1-8** 근거 |
| [Apple Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | 탭은 최상위 섹션이고 **탭별 navigation state 를 보존** → **P2-11** 근거 |
| [Android runtime permissions](https://developer.android.com/training/permissions/requesting) | 사용자가 기능을 시작한 맥락에서 최소 권한 요청, 거부 후 graceful degradation → **P1-3 자동 GPS 제거** 근거 |
| [Apple Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy) | 권한 목적을 분명히 하고 launch-time 요청을 피함 → 위치 CTA 설명 근거 |
| [WCAG 2.2 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [Apple](https://developer.apple.com/design/human-interface-guidelines/accessibility) · [Android](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) | AA 최소는 24×24 CSS px 또는 충분한 간격. **iOS 44×44pt / Android 48×48dp 를 품질 목표로** 적용하되 44pt 를 iOS 절대 최소로 오인하지 않음 → **P2-15** |
| [WCAG Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | 성공·실패·검색 결과·busy 를 포커스 이동 없이 보조기기에 전달 → **P1-15·P1-6**(toast/색상-only 보완) |
| [WCAG Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) | 색만으로 선택·상태를 전달하지 않음 → **P1-14**(chip·응원·unread) |
| [WCAG Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text) | 200% 확대에서도 콘텐츠·기능이 사라지거나 잘리지 않아야 함 → 베트남어 긴 문구·고정 높이 화면 검증 |
| [Android edge-to-edge](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge) · [Capacitor SystemBars](https://capacitorjs.com/docs/apis/system-bars) | system/gesture inset 에 핵심 조작이 가려지지 않아야 함 → **P2-10·P2-16** |
| [Android WindowInsets/IME](https://developer.android.com/develop/ui/compose/system/insets) | 키보드/IME inset 은 edge-to-edge 와 별도로 검증 → 작성·DM composer 키보드 겹침 gate |
| [How deep linking works — Adjust](https://www.adjust.com/blog/deep-linking-dos-and-donts/) · [Rocketfarm Studios](https://www.rocketfarmstudios.com/blog/deep-linking-and-deferred-deep-linking-in-mobile-apps/) | 목적지를 보관 → 로그인 → 즉시 전달. 홈에 떨구지 않음 → **P0-2** |
| [The cost of JavaScript — V8](https://v8.dev/blog/cost-of-javascript-2019) · [web.dev](https://web.dev/articles/optimizing-content-efficiency-javascript-startup-optimization) | gzip 150KB ≈ 코드 1MB ≈ 대부분의 폰에서 1초+ → **P2-1**(우리는 5배) |
| [VietnamPlus](https://en.vietnamplus.vn/vietnams-internet-speeds-surge-at-start-of-2026-post338313.vnp) · [VOV](https://english.vov.vn/en/society/vietnams-internet-speeds-surge-in-early-2026-5g-posts-sharp-gains-post1271183.vov) | 베트남 모바일 평균 90Mbps·종합 200Mbps(세계 평균 2배) → **번들 문제를 네트워크가 아닌 파싱 축으로 재정의** |
| [Chợ Tốt 안전 구매 안내](https://trogiup.chotot.com/nguoi-mua/meo-mua-hang-an-toan/) · [Carousell](https://press.carousell.com/2025/01/17/cho-tot-ai-revolutionizing-home-decluttering-with-the-scan-to-sell-feature/) | 직접 거래·동행·COD·선입금 제한·증빙 보관·신고, 채팅+전화 병행, Nearby Items → **5.3 맥락형 안전 안내·D-3** |
| [Text expansion in localization — POEditor](https://poeditor.com/blog/text-expansion-and-contraction-localization/) · [WPML](https://ptc.wpml.org/documentation/ui-localization-prevent-layout-issues-long-translations/) | 번역 길이 변화가 레이아웃을 깨뜨림 → 베트남어 화면의 고정 높이·잘림 점검 |

---

## 10. 추적 메모

- 이 문서는 `260731` 출시 감사 2건을 **덮어쓰지 않는다.** 그 문서들은 당시 커밋·배포면 판정의 이력이고, 이 문서는 `634d29a` 기준 **사용자 경험·내비게이션·화면 일관성** 감사다.
- **남은 검증**: 네이티브 실기기(서브모듈 초기화 후) — 하드웨어 뒤로가기·권한 팝업·딥링크 스킴·키보드·저사양 체감.
- **스크린샷 회귀가 없어 CSS 깨짐은 여전히 사람 눈으로만 잡힌다** — P2-3 의 CI 토큰 검사가 최소한의 대체재다.
- 코드 수정 후에는 프로젝트 규칙에 따라 codebase-memory 재인덱싱 + ADR·`frontend-page-map.md` 동기화가 필요하다(이 감사 자체는 문서만 작성했으므로 해당 없음).

---

*작성: 2026-08-03. 운영 앱은 읽기 전용 GET 조회만 수행했고 로그인·폼 제출·데이터 변경은 하지 않았다. dev(`saigon.doil.me`)는 대표가 로그인해 둔 세션으로 화면 순회·조회만 수행했다.*
