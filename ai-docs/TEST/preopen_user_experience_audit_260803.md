# 오픈 전 사용자 경험·내비게이션 종합 감사 — 2026-08-03

> **판정: 사용자 경험 관점 `NO-GO`**
> 일반 공개 전 `UX-01`~`UX-06`의 해결과 실제 기기 재검증이 필요하다. 공개 랜딩을 함께 여는 경우 `UX-07`, 접근 가능한 일반 공개 기준에서는 `UX-13/14`도 같은 gate다. 현재 진입·인증 화면의 완성도와 최근 오류 상태 정비는 양호하지만, 핵심 거래·위치·딥링크·DM 여정에서 사용자의 의도 또는 데이터 신뢰를 깨는 문제가 남아 있다.

## 1. 감사 기준과 범위

| 항목 | 내용 |
|---|---|
| 기준 커밋 | `634d29a` (`main` = `origin/main`) |
| Git 동기화 | `git fetch origin --prune` 후 `git pull --ff-only origin main` 실행 — `Already up to date` |
| 대상 | Splash/OAuth, 홈, 마켓 목록·상세·작성, 동네지도 목록·지도, 커뮤니티 피드·작성·수정, DM, 프로필, 알림·정보·설정, 하단 탭·뒤로가기 |
| 검증 방법 | 정적 코드 경로 감사, 공개 진입·인증 화면 브라우저 확인, 현재 랜딩에 게시된 화면 자산 육안 점검, 기존 제품·디자인 SoT 대조, 외부 공식 UX·접근성 기준 교차검증 |
| 주 사용자 가정 | 호치민에서 중고 거래·동네 정보·커뮤니티를 사용하는 모바일 사용자. 알림/공유 링크와 불안정한 모바일 네트워크를 정상 사용 조건에 포함 |
| 제외/한계 | 로컬 Docker/WSL을 사용할 수 없어 인증된 전체 백엔드 여정과 iOS/Android signed build는 실행하지 못했다. 네이티브 권한창, 키보드, 시스템 Back, 저사양 기기 체감은 실기기 재검증이 필요하다. 공개 랜딩 스크린샷의 데이터 문제는 **현재 게시 자산에서 확정**했으며, 운영 DB의 현재 데이터라고 단정하지 않는다. |

심각도는 다음처럼 사용한다.

- **P0:** 즉시 중단이 필요한 장애·보안·데이터 손상
- **P1:** 일반 공개 전에 해결해야 하는 핵심 여정·신뢰 문제
- **P2:** 출시 후보 빌드에서 해결해야 하는 높은 불편·접근성 문제
- **P3:** 후속 품질 개선. 단, 반복되면 제품 인상에 누적 영향

이번 감사에서 확정된 P0는 없었다.

## 2. 한눈에 보는 결론

### 잘 된 부분

- 공개 Splash와 인증 화면은 브랜드, 계층, 주요 CTA가 명확하고 베트남어로 정리되어 있다.
- 하단 최상위 목적지 5개는 Android가 권장하는 3~5개 범위 안에 있다.
- 마켓·피드·정보 화면 다수는 최근 정비로 loading/error/empty를 구분하고 재시도 CTA를 제공한다.
- 홈과 마켓의 매물 등록 FAB는 같은 경로(`/market/new`)와 같은 52px 시각 규격을 사용한다.
- 네이티브 기능은 `native.ts` 경유 원칙을 대체로 지키며, 루트 화면의 사용자 노출 한국어 하드코딩도 최근 정리되었다.
- 공개 환경에서 Google 로그인 행을 눌렀을 때 OAuth 팝업은 열렸다. 콘솔의 Google frame CSP 메시지만으로 로그인 장애라고 판정하지 않았다.

### 출시 차단 요약

| ID | 문제 | 사용자 영향 | 판정 |
|---|---|---|---|
| UX-01 | 판매완료 상품에 가격·상태 변경 UI가 남고, API는 판매완료를 다시 판매중/예약중으로 열 수 있음 | 완료된 거래 이력과 상태 신뢰 훼손 | P1 |
| UX-02 | 동네지도 목록 진입만으로 GPS 권한을 요청 | 맥락 없는 권한창, 내부 서비스 규칙 위반, 첫 사용 신뢰 저하 | P1 |
| UX-03 | 로그아웃 딥링크의 원래 목적지가 인증 후 소실 | DM·상품·알림 유입이 홈으로 이탈 | P1 |
| UX-04 | DM 초기 로드 실패가 빈 대화처럼 보이고, 전송 실패 시 작성문이 사라짐 | 거래 대화가 삭제된 듯 보이며 중요 메시지 재입력 필요 | P1 |
| UX-05 | 피드 작성·수정 화면에 하단 탭이 남고 이탈 보호가 없음 | 탭 오터치 한 번으로 작성 내용·업로드 작업 소실 | P1 |
| UX-06 | 지도 목록에서 고른 지역이 지도에 전달되지 않고, 홈 fallback 위치가 정상 ‘내 주변’처럼 보임 | 다른 지역 정보가 사용자 주변 정보로 오인됨 | P1 |
| UX-07 | 공개 랜딩 화면에 `[DEV]`, `del_*`, 반복·불일치 사진, 판매완료 조작 UI가 노출 | 서비스가 테스트 데이터·가짜 상품처럼 보여 거래 신뢰 저하 | 공개 랜딩 동시 출시 시 P1, 아니면 P2 |
| UX-13/14 | 핵심 필터·카드가 비시맨틱 `div`이고 선택 상태가 색으로만 전달됨 | 키보드·스위치·스크린리더 사용자가 핵심 탐색을 수행하거나 현재 상태를 인지할 수 없음 | 일반 공개 접근성 gate P1 |

## 3. P1 상세 — 문제, 최소 개선안, 합격 기준

### UX-01. 판매완료 상태가 종결 상태처럼 동작하지 않는다

**확정 근거**

- 판매자 상품 상세는 상태와 무관하게 `가격 수정`을 렌더하고, `ON_SALE`/`RESERVED` 상태 버튼도 계속 렌더한다: `frontend/src/pages/market/MarketDetail.tsx:361-408`.
- 가격 API는 현재 상태가 `SOLD`이면 409로 거절한다: `backend/app/routers/market.py:677-697`. 따라서 판매완료 화면의 `가격 수정`은 눌러도 성공할 수 없는 버튼이다.
- 상태 API는 목표 상태가 `SOLD`인 것만 막고, **현재 상태가 `SOLD`인 매물**을 막지 않는다: `backend/app/routers/market.py:624-674`. 판매완료 상품을 판매중/예약중으로 되돌릴 수 있다.
- 공개 랜딩의 [마켓 상세 화면](../../landing/apps/client/public/screens/market-detail.png)에서도 판매완료 상품에 가격·상태 조작이 함께 보인다.

**최소 개선안**

1. 프런트: `SOLD` 판매자에게 가격 수정·상태 전환·철회 UI를 숨기고 거래 이력/후기/재등록만 제공한다.
2. 백엔드: `listing.status == "SOLD"`이면 일반 상태 PATCH를 거절한다. 재등록이 필요하면 기존 거래를 변조하지 말고 새 매물 복제 흐름으로 만든다.
3. 테스트: `SOLD → ON_SALE`, `SOLD → RESERVED`, `SOLD 가격 변경`이 모두 실패하고 UI에도 조작부가 없는지 고정한다.

**합격 기준**

- 판매완료 상세에서 성공할 수 없는 버튼이 0개다.
- API를 직접 호출해도 판매완료 거래 기록을 재개할 수 없다.
- “다시 판매”는 새 매물 ID와 새 거래 이력을 만든다.

### UX-02. 사용자 행동 전에 위치 권한을 요청한다

**확정 근거**

- 동네지도 목록 mount 직후 `requestDeviceLocation()`을 실행한다: `frontend/src/pages/map/NeighborhoodMap.tsx:74-98`.
- 이 함수는 `native.ensureLocationPermission()` 후 실제 위치를 읽는다: `frontend/src/lib/serviceLocation.ts:11-13`.
- 프로젝트 서비스 규칙은 앱 진입·화면 이동 시 GPS 자동 측정을 금지하고, 지도/정보 탐색은 GPS 없이 가능해야 한다고 명시한다: `ai-docs/context/service-rules.md:11-12`.
- Android 공식 지침도 사용자가 위치가 필요한 기능을 시작한 맥락에서 권한을 요청하고, 거부해도 앱이 계속 동작하도록 하는 것을 기본 원칙으로 제시한다. P1의 직접 근거는 이 외부 지침만이 아니라 위 프로젝트 서비스 규칙과 첫 진입 신뢰 훼손이다.

**최소 개선안**

- 자동 요청을 제거한다. 기본은 저장 지역 또는 수동 지역 선택으로 표시한다.
- 사용자가 `내 주변순`, `현재 위치로 이동`을 누를 때 목적을 설명한 뒤 권한을 요청한다.
- 거부/시스템 위치 꺼짐/timeout을 구분하고 `지역 직접 선택` CTA를 항상 제공한다.

**합격 기준**

- 새 설치 후 홈·마켓·지도·정보 탭을 둘러보는 동안 OS 위치 권한창이 뜨지 않는다.
- 명시적 위치 기능을 누른 경우에만 한 번 요청하며, 거부 후에도 지역 선택으로 핵심 탐색이 가능하다.

### UX-03. 로그인 전 딥링크 목적지가 인증 과정에서 사라진다

**확정 근거**

- `/link?action=...`는 비로그인 상태에서 파라미터를 보존하지 않고 `/splash`로 교체한다: `frontend/src/pages/link/LinkRouter.tsx:31-42`.
- 일반 보호 라우트는 `state.from`을 만들지만 Splash의 시작 버튼은 이를 인증 화면으로 전달하지 않는다: `frontend/src/components/auth/PrivateRoute.tsx:14-15`, `frontend/src/pages/auth/Splash.tsx:134`.
- OAuth 성공은 신규 사용자면 프로필 설정, 기존 사용자면 항상 `/home`으로 이동한다: `frontend/src/pages/auth/OAuthLogin.tsx:65-86`.

**최소 개선안**

- 앱 내부 경로만 허용하는 검증된 `returnTo`를 Splash → OAuth → 프로필 설정까지 보존하고 로그인 성공 후 한 번만 소비한다.
- 외부 URL과 `javascript:` 등은 거부해 open redirect를 만들지 않는다.
- 신규 사용자는 프로필 설정 완료 후 원래 목적지로 보낸다.

**합격 기준**

- 로그아웃 상태에서 DM, 상품, 알림 딥링크를 열고 로그인하면 각각 원래 화면으로 도착한다.
- 뒤로가기를 눌러 인증 화면으로 다시 루프하지 않는다.

### UX-04. DM 장애가 빈 대화와 메시지 유실로 보인다

**확정 근거**

- 초기 대화 요청 오류를 무시하고 별도 loading/error 상태가 없다: `frontend/src/pages/dm/DmDetail.tsx:56-84`.
- 전송 전에 입력을 비우고, 실패 시 toast만 띄운 뒤 원문을 복원하지 않는다: `frontend/src/pages/dm/DmDetail.tsx:153-170`.

**최소 개선안**

- 대화 화면을 `loading / error+retry / genuinely empty / ready`로 분리하고 초기 로드가 끝나기 전 composer를 잠근다.
- 전송 실패 시 입력 draft를 복원하거나 실패 bubble에 `재전송`을 제공한다.
- 실패 메시지는 `aria-live` 또는 `role=alert`로 보조기기에도 전달한다.

**합격 기준**

- 메시지 GET 500/timeout에서 빈 대화처럼 보이지 않고 재시도할 수 있다.
- 메시지 POST 실패 후 원문이 그대로 남아 한 번의 조작으로 재전송할 수 있다.
- 중복 탭으로 같은 메시지가 두 번 전송되지 않는다.

### UX-05. 작성 중 전역 탭으로 이탈하면 초안이 사라진다

**확정 근거**

- 탭바 숨김 목록에 `/feed/new`와 `/feed/*/edit`가 없다: `frontend/src/components/layout/AppShell.tsx:23-38`.
- 피드 작성·수정 내용과 업로드 상태는 컴포넌트 로컬 state이며 이탈 경고·draft 복구가 없다: `frontend/src/pages/feed/FeedCreate.tsx:28-40`, `frontend/src/pages/feed/FeedEdit.tsx:34-45`.

**최소 개선안**

- 작성/수정 라우트에서는 전역 탭바를 숨긴다.
- 변경이 있는 상태에서 화면 Back·Android Back·제스처 이탈 시 `계속 작성 / 버리기`를 묻는다.
- 최소한 텍스트 draft를 세션 단위로 보존한다. 업로드 중 이탈은 명확히 차단하거나 취소 결과를 설명한다.

**합격 기준**

- 작성 화면에서 하단 탭 오터치로 이탈할 수 없다.
- Back 후 `계속 작성`을 고르면 텍스트·사진 선택·위치가 유지된다.
- 저장 성공 후에는 이탈 경고와 임시 draft가 남지 않는다.

### UX-06. 위치의 출처와 화면 간 공간 맥락이 일치하지 않는다

**확정 근거**

- 동네지도 목록의 지역 선택은 로컬 state이며 `지도보기` 전환에 전달되지 않는 것이 코드 주석상 알려진 트레이드오프다: `frontend/src/pages/map/NeighborhoodMap.tsx:32-37, 159-164`.
- 홈은 위치가 없을 때 Bến Thành fallback으로 시작하고, 헤더에 별도 출처 표시 없이 정상 지역명처럼 보여 준다: `frontend/src/pages/home/WorldMapV2.tsx:160-170, 217-223, 351-355`.
- 같은 좌표가 근처 상품뿐 아니라 날씨·침수·주유소·정비소 문맥에도 사용되어, 사용자가 실제 주변 정보로 오인할 여지가 있다.

**최소 개선안**

- 전역 위치를 덮어쓰지 않고 목록의 `selectedRegion`을 route state 또는 `initialRegion`으로 지도에 전달한다.
- 위치마다 `device / saved / manually selected / default` 출처를 내부 상태로 유지한다.
- fallback이면 “내 주변” 대신 `기본 지역: Bến Thành · 지역 설정`처럼 사실을 표시한다. 안전·날씨 정보에는 특히 기본 위치임을 숨기지 않는다.

**합격 기준**

- 목록에서 7군을 선택한 뒤 지도보기로 전환하면 같은 7군과 같은 필터 결과가 열린다.
- 권한 거부·위치 미설정 상태에서 어떤 화면도 기본 좌표를 실제 현재 위치라고 표현하지 않는다.

### UX-07. 공개 랜딩의 화면 자산이 제품 신뢰를 깎는다

**확정 근거**

- 현재 랜딩은 홈·마켓·상세·커뮤니티 스크린샷을 직접 공개한다: `landing/apps/client/src/pages/home/Index.tsx:31-33, 253`.
- [홈](../../landing/apps/client/public/screens/home.png)에 `[DEV]` 업체명이 보인다.
- [마켓 목록](../../landing/apps/client/public/screens/market-list.png)은 서로 다른 상품 여러 개에 같은 흑백 사진을 반복하고, 제목과 사진의 의미가 맞지 않는다.
- [마켓 상세](../../landing/apps/client/public/screens/market-detail.png)은 오토바이 제목과 무관한 사진 및 판매완료 조작 UI를 함께 보여 준다.
- [커뮤니티](../../landing/apps/client/public/screens/community-feed.png)는 내부 익명화 닉네임 `del_6a6ed1a9`를 그대로 노출한다. 백엔드가 탈퇴 시 `del_*` 닉네임을 만드는 것은 확인된다: `backend/app/routers/users.py:305-310`.

**최소 개선안**

- 랜딩 캡처용 시드 데이터를 별도 고정하고 `[DEV]`, 내부 ID, 개인정보성 데이터가 없는지 자동 검사한다.
- 상품별로 의미가 맞는 이미지와 자연스러운 베트남어 예시를 사용한다.
- 탈퇴 사용자는 모든 공개 화면에서 현지화된 `탈퇴한 사용자`와 중립 avatar로 표현하고 내부 익명화 값을 UI 모델 밖으로 노출하지 않는다.
- 수정 후 4개 화면을 다시 캡처하고 제품 담당자가 콘텐츠·상태·언어를 승인한다.

**합격 기준**

- 공개 랜딩과 앱 샘플 데이터에서 `[DEV]`, `del_*`, UUID, placeholder·중복 사진이 0건이다.
- 스크린샷의 제목·가격·상태·사진·CTA가 서로 의미상 일치한다.

### UX-13/14. 핵심 탐색 컨트롤이 보조기기에 동등하게 제공되지 않는다

**확정 근거**

- 공용 `Chip`은 항상 `div`를 렌더하지만 마켓의 거래완료 숨기기와 피드 필터는 이를 클릭 컨트롤로 사용한다: `frontend/src/components/ui/Chip.tsx:6-20`, `frontend/src/pages/market/MarketMain.tsx:295-307`, `frontend/src/pages/feed/FeedList.tsx:138-156`.
- 지역·업종·응원 선택과 unread dot 일부는 시각 스타일이나 색만 바뀌며 `aria-pressed`, `aria-checked`, 읽지 않은 개수가 일관되게 제공되지 않는다.
- FAQ·공지·고객지원·업체 카드 일부도 `div onClick`이어서 Tab/Enter/Space로 진입할 수 없다.

**최소 개선안과 합격 기준**

- 상호작용 Chip은 `button`+`aria-pressed`, 단일 선택은 `radiogroup`/`radio`+`aria-checked`, 이동 행은 실제 link/button으로 만든다.
- 색 외 문구·아이콘·접근성 이름으로 선택과 unread 상태를 함께 전달한다.
- VoiceOver/TalkBack 및 외부 키보드로 마켓 필터→상품 상세, 지도 업종 필터, 피드 필터→게시물 상세를 끝까지 수행한다.

## 4. P2 및 범위 조건부 P1 — 출시 후보에서 고칠 문제

| ID | 문제와 근거 | 사용자 영향 | 개선안 / 검증 |
|---|---|---|---|
| UX-08 | 홈·마켓의 52px FAB가 `bottom:18px` overlay인데 콘텐츠 하단 예약 여백은 16px 수준이다. `WorldMapV2.module.css:789-808`, `MarketMain.module.css:110-144` | 마지막 카드의 가격·반응·CTA를 가리고 오터치 유발 | FAB 지름+offset+여유만큼 최소 86px 하단 공간 예약. 320/390px 폭, iOS/Android gesture inset에서 마지막 항목 전체 노출 확인 |
| UX-09 | 탭 전환 시 지도 지역·카테고리, 피드 필터·스크롤 등 로컬 상태가 unmount와 함께 초기화된다. 마켓도 상세 진입 때만 스크롤을 저장한다. | 탐색을 반복해야 하고 탭이 독립 작업공간처럼 느껴지지 않음 | 탭별 route/state cache 또는 URL query로 필터·스크롤·지도 viewport 보존. 각 탭 왕복 테스트 |
| UX-10 | 공용 TopBar의 기본 Back이 무조건 `navigate(-1)`이다: `TopBar.tsx:32-36` | 외부 딥링크·새 탭 진입에서 앱 밖/빈 history로 이탈 가능 | 상단 버튼을 앱 계층의 Up으로 정의하고 history가 없으면 섹션 root로 이동. 앱 내부 진입에서는 시스템 Back과 같은 이전 화면, 외부 딥링크에서는 Up→앱 계층·시스템 Back→호출 앱을 각각 검증 |
| UX-11 | 지도 찜/팔로우, 프로필 거래·퀘스트, 피드/마켓 수정 초기 로드 등 일부 오류를 `[]` 또는 무응답으로 바꾼다. | 서버 장애를 “내 데이터가 없음/삭제됨”으로 오인 | **거래 이력·프로필 데이터는 P1**, 부가 목록은 P2. 섹션별 stale-data + error/retry, empty와 error 분리. 500/timeout fault-injection 테스트 |
| UX-12 | Google 설정/GIS 초기화 실패 시 실제 버튼이 아닌 정적 placeholder가 계속 남는다: `OAuthLogin.tsx:107-125, 318-324` | 눌리지 않는 가짜 로그인 버튼, 원인·재시도 없음 | Google이 유일한 정상 인증이면 P1, Zalo 등 대체 인증이 정상이라면 P2. 명시적 로딩 → 공급자 오류+재시도, 실제 `button`의 disabled/aria 상태 사용 |
| UX-15 | 피드 헤더 40px, 지도 프로필 36px, 프로필 친구/DM 34px, 피드 사진 삭제 24px, 키워드 알림 삭제 18px 등 44px 미만 타깃이 반복된다 | 이동 중 오터치, 운동·시각 제약 사용자 접근성 저하 | 시각 아이콘 크기는 유지하되 실제 hit area는 iOS 44pt/Android 48dp 목표. 최소 WCAG 24px+간격보다 높은 앱 기준 적용 |
| UX-16 | 좋아요·팔로우·대화 시작·날씨 알림 등 일부 비동기 액션에 pending/중복 탭 방지·상태 알림이 부족하다 | 여러 번 눌렀는지 불명확, 중복 요청과 조용한 실패 | 즉시 pressed 피드백, 작업별 busy/disabled, 실패 복구, `aria-busy`/`aria-live` 적용 |
| UX-17 | Capacitor Core 8.3.4를 사용하지만 `@capacitor/system-bars`가 없고 CSS는 주로 `env(safe-area-inset-*)`에 의존한다 | inset 값을 0으로 보고하는 구형 Android WebView에서 하단 gesture 영역과 조작부가 겹칠 위험 | 현 상태를 즉시 결함으로 단정하지 말고 구형 WebView 실기기에서 확인. 재현되면 SystemBars fallback 변수와 기존 토큰을 연결 |

## 5. 화면상 부조화와 정보구조 개선

### 5.1 최상위 내비게이션

하단 5개 탭의 **개수 자체는 문제없다.** 문제는 홈이 마켓·업체 소식·커뮤니티·생활정보를 다시 긴 목록으로 복제하여 각 탭의 책임을 흐린다는 점이다. 사용자는 “홈에서 볼지, 마켓/피드에서 볼지”를 매번 판단해야 한다.

두 해석이 가능하므로 제품 결정을 명시해야 한다.

1. **홈 유지안:** 홈은 개인화된 짧은 요약과 미확인 상태만 제공하고, 긴 피드·중복 FAB·게임 재화는 각 전문 탭으로 보낸다.
2. **마켓 우선 4탭안:** 현재 서비스 구상서의 마켓 피벗과 4탭 방향을 채택하고 홈을 제거한다. 첫 화면을 마켓으로 두고 지도/커뮤니티/프로필을 독립 목적지로 유지한다.

현재 제품 SoT가 마켓 우선을 선언하고 있으므로 **2안이 더 일관적**이다. 다만 이는 단순 UI 패치가 아니라 활성 사용자 진입점과 지표를 바꾸는 제품 결정이므로 별도 승인 후 진행한다.

### 5.2 화면별 시각·행동 문법

| 화면 | 관찰 | 개선 방향 |
|---|---|---|
| Splash/OAuth | 브랜드와 CTA 계층은 좋다. 뒤로가기 40px, 언어 선택 높이 약 34px, 약관 링크가 작다. 전체 화면 loop video/blur는 저사양·reduced-motion에서 부담 가능 | 타깃 44/48 확보, poster와 `prefers-reduced-motion`, 작은 높이/200% 글자 확대 점검 |
| 홈 | 프로필·RP·거리, 검색, 근처 상품, 업체 소식, 최근 상품, 생활정보, 커뮤니티가 한 화면에 밀집. 섹션과 전역 탭이 중복 | 한 화면의 1차 목적을 정하고 요약 모듈 수를 줄임. “더보기” hit area 확대. fallback 위치 출처 표시 |
| 마켓 | 기본 지역이 “전역”일 때도 부제는 “내 근처 장터”라 범위가 모순될 수 있음. FAB가 마지막 항목을 가림 | `호치민 전역 장터`/`내 근처 장터`를 모드별로 바꾸고 FAB 안전 여백 확보 |
| 지도 | 목록의 지역 선택이 지도에 이어지지 않고 자동 GPS 요청까지 겹침 | 지역·카테고리·viewport를 동일 세션 컨텍스트로 전달. GPS는 명시적 버튼에서만 |
| 피드 | 새 글 CTA가 좌상단 `+`이지만 홈·마켓은 우하단 FAB. 작성 화면에는 전역 탭이 남음 | 최상위 화면의 생성 행동 규칙을 하나로 정함. 최소한 CTA 위치·레이블·이탈 보호를 일관되게 적용 |
| 프로필 | 거래 신뢰 정보와 함께 XP·Gold·Skill Point, 퀘스트·주행 그래프가 크게 남아 있으나 관련 sink/스킬 기능은 숨김 | 미사용 재화는 숨기거나 거래 혜택과 연결될 때만 설명. 거래 이력·후기·인증을 먼저 배치 |
| 상세/정보 | MarketDetail은 공용 TopBar 대신 자체 헤더, 일부 카드형 행은 비시맨틱 클릭 영역 | detail용 공용 header variant를 만들고 back/action 위치·hit area를 통일 |

### 5.3 현지 거래 서비스로서 빠진 신뢰 문맥

신고 기능 자체는 존재해 긍정적이다. 다만 Chợ Tốt의 공식 안전 안내처럼 상품 상세→DM→약속 확정 순간에 다음 내용을 짧게 연결하면 현지 사용자의 거래 불안을 줄일 수 있다.

- 선입금 제한, 물품 상태 직접 확인, 가능하면 2인 이상 동행 또는 COD 이용
- 상품/사용자/대화 단위 신고 진입과 처리 상태
- “인증됨”이 전화·동네·신원 중 무엇을 뜻하는지 명시

이는 긴 안전센터 문서를 추가하는 문제가 아니라, 위험이 발생하는 순간에 1~2줄과 진입 링크를 배치하는 문제다.

## 6. 권장 실행 순서

### Gate A — 일반 공개 전

1. `UX-01` 판매완료 terminal-state 프런트·API·테스트 동시 수정
2. `UX-02` 자동 GPS 제거 및 명시적 위치 CTA/거부 대안 구현
3. `UX-03` 안전한 `returnTo` 복원
4. `UX-04` DM loading/error/retry 및 draft 복구
5. `UX-05` 피드 작성 탭바 숨김·이탈 보호
6. `UX-06` 목록→지도 지역 전달·fallback 표기
7. `UX-07` 랜딩 자산과 탈퇴 사용자 표시 정비
8. `UX-13/14` 핵심 필터·카드의 시맨틱 컨트롤과 선택 상태 정비

### Gate B — 출시 후보 빌드

1. FAB/키보드/safe-area 겹침을 320px·390px, iOS·Android 내비게이션 모드별 확인
2. 탭별 스크롤·필터·지도 상태 보존
3. safe Back fallback과 Android 시스템 Back 일치
4. 오류와 empty 분리, 로그인 공급자 실패 재시도
5. 상호작용 semantics, unread 상태, hit area, 비동기 피드백 정비

### Gate C — 제품 결정 후

1. 홈 유지 vs 마켓 우선 4탭 결정
2. 게임 재화/퀘스트를 숨길지 거래 가치로 재정의할지 결정
3. root header와 생성 CTA의 공통 문법 확정

## 7. 출시 합격 시나리오

아래를 실제 API가 연결된 signed iOS/Android 빌드에서 모두 통과해야 한다.

| 여정 | 합격 조건 |
|---|---|
| 딥링크 → 로그인 | 로그아웃 상태의 DM/상품/알림 링크가 로그인·프로필 설정 후 원래 목적지에 도착 |
| 지도 첫 진입 | 새 설치에서 권한창 없음. 지역 선택만으로 탐색 가능. `내 주변`을 누른 뒤에만 권한 요청 |
| 지도 지역 연속성 | 목록에서 고른 지역·업종이 지도 전환 후 그대로 유지 |
| 판매완료 상품 | 가격·상태 변경 UI 없음. API 직접 호출로도 재개 불가 |
| DM 불안정망 | GET/POST timeout에서 과거 대화와 draft를 잃지 않고 재시도 가능 |
| 피드 작성 | 탭 오터치 불가. Back 취소 후 모든 입력 유지. 저장 후 draft 제거 |
| 탭 왕복 | 각 탭의 스크롤·필터·지도 viewport가 복구됨 |
| 하단 겹침 | 마지막 카드와 CTA가 FAB·탭바·gesture area·키보드에 가려지지 않음 |
| 접근성 | 주요 타깃 44pt/48dp, 모든 필터 키보드 조작, 선택/unread/오류를 보조기기가 인지 |
| 공개 콘텐츠 | `[DEV]`, `del_*`, UUID, 의미 불일치·중복 placeholder 이미지 0건 |

추가 실제 기기 매트릭스:

- iPhone notch/Dynamic Island + 200% 텍스트 + VoiceOver
- Android 3-button navigation / gesture navigation + TalkBack
- 320px 폭 소형 화면, 저사양 Android, 느린 4G·offline 전환
- 위치 허용/거부/다시 묻지 않음/시스템 위치 꺼짐
- 키보드 열린 작성·DM·검색 화면에서 Back 1회 동작

### 아직 결함으로 단정하지 않은 고위험 실기기 점검

다음은 정적 코드와 공개 화면만으로 합격/불합격을 확정하지 않았다. 출시 전에 별도 증거를 남겨야 한다.

- 상품·프로필·DM·만남 장소별 정확 위치 노출 범위, 저장 기간, 철회·삭제 동작
- approximate/coarse와 precise 권한 선택, one-time 권한, 앱 복귀 중 권한 철회 처리
- 위치 accuracy·timestamp가 오래되거나 부정확할 때 이를 “현재 위치”로 표현하지 않는지
- 사용자 차단·괴롭힘 신고, DM의 외부 메신저/피싱 URL/선입금 경고와 우회 패턴
- 일반 텍스트 4.5:1·비텍스트 상태 3:1 대비, 200% 확대와 reflow
- Android 구형 WebView의 safe-area fallback 및 IME/키보드 inset

## 8. 외부 기준과 이 프로젝트에 적용한 판단

| 외부 공식 자료 | 핵심 적용점 |
|---|---|
| [Android navigation principles](https://developer.android.com/guide/navigation/principles) | Back은 방문 이력의 역순이며 딥링크도 현실적인 back stack을 구성해야 함 → `returnTo`, safe Back 검증 근거 |
| [Capacitor App API](https://capacitorjs.com/docs/apis/app) | `backButton`을 구독할 때 앱이 history/종료 동작을 책임진다는 조건부 참고. 현재 의존성과 코드에서 `@capacitor/app`/구독은 확인되지 않아 현 구현의 직접 증거로 사용하지 않음 |
| [Android Navigation bar](https://developer.android.com/develop/ui/compose/components/navigation-bar) | compact 화면의 3~5개 동등하고 일관된 최상위 목적지 → 현재는 **숫자만** 기준 범위 안이며 홈/마켓 위계는 별도 결정 필요 |
| [Apple Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | 탭은 최상위 섹션이고 탭별 navigation state를 보존 → 필터·스크롤·지도 상태 복구 근거 |
| [Android runtime permissions](https://developer.android.com/training/permissions/requesting) | 사용자가 기능을 시작한 맥락에서 최소 권한 요청, 거부 후 graceful degradation → 자동 GPS 제거 근거 |
| [Apple Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy) | 권한 목적을 분명히 하고 launch-time 요청을 피함 → 위치 CTA 설명 근거 |
| [WCAG 2.2 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) / [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) / [Android Accessibility](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) | WCAG AA 최소는 24×24 CSS px 또는 충분한 간격. iOS 기본 control 44×44pt와 Android 권장 48×48dp를 앱 품질 목표로 적용하며, 44pt를 모든 iOS control의 절대 최소라고 오인하지 않음 |
| [WCAG Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | 성공·실패·검색 결과·busy 상태를 포커스 이동 없이 보조기기에 전달 → toast/색상-only 보완 근거 |
| [WCAG Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) | 색만으로 선택·상태를 전달하지 않음 → chip, 응원, unread 상태 개선 근거 |
| [Android edge-to-edge](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge) / [Capacitor SystemBars](https://capacitorjs.com/docs/apis/system-bars) | system/gesture inset에 핵심 조작이 가려지지 않아야 함 → FAB·탭바와 구형 WebView fallback 실기기 gate 근거 |
| [Android WindowInsets/IME](https://developer.android.com/develop/ui/compose/system/insets) | 키보드/IME inset은 edge-to-edge와 별도로 검증 → 작성·DM composer의 키보드 겹침 gate 근거 |
| [WCAG Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text) | 200% 확대에서도 콘텐츠와 기능이 사라지거나 잘리지 않아야 함 → 베트남어 긴 문구와 고정 높이 화면 검증 근거 |
| [Chợ Tốt 안전 구매 안내](https://trogiup.chotot.com/nguoi-mua/meo-mua-hang-an-toan/) | 직접 거래, 2인 이상 동행, COD, 선입금 제한, 증빙 보관·신고 → HCMC 거래 상세/DM의 맥락형 안전 안내 근거 |

## 9. 추적 메모

- 이 보고서는 기존 `260731` 출시 감사 두 건을 덮어쓰지 않는다. 그 문서들은 당시 커밋·배포면 판정의 이력이며, 본 문서는 `634d29a` 기준 **사용자 경험·내비게이션·화면 일관성** 보완 감사다.
- 코드 수정 후에는 프로젝트 규칙에 따라 codebase-memory를 재인덱싱해야 한다. 이번 환경에는 해당 MCP 도구가 노출되지 않아 그래프 조회·재인덱싱을 수행하지 못했다.
- 이번 작업은 보고서 작성만 수행했으며 제품 코드·운영 데이터·공개 자산은 변경하지 않았다.
