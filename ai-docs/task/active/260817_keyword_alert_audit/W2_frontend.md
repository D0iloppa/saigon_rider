# 키워드 알림(마켓 매물 저장검색 구독) 프론트엔드 현행 실태 감사 — W2

- 감사일: 2026-08-17
- 범위: `frontend/` 전체 grep 전수 + 관련 화면 소스 정독. 백엔드는 근거 확인 목적으로만 최소 열람(`backend/app/routers/market.py`, `database/init/112_notifications_keyword_link.sql`).
- 방법: codebase-memory MCP 미연결 세션 — grep/Glob/Read 로만 진행. 추측 금지, 코드로 확인 안 된 것은 "확인 불가"로 표기.

---

## ① 진입점 지도

`keyword` 전수 grep(프론트 전체) 결과, 매물 저장검색형 "키워드 알림" 기능이 실제로 등장하는 위치는 **`frontend/src/pages/market/MarketMain.tsx` 1개 파일**뿐이다. `MarketSearch.tsx`의 "키워드"는 완전히 다른 개념(자유 텍스트 상품 검색, `q` 파라미터)이며 알림 구독과 무관하다 — 코드 어디에도 두 기능을 잇는 링크가 없다.

| # | 기능 | 파일:라인 | 형태 |
|---|---|---|---|
| 1 | 등록(추가) | `frontend/src/pages/market/MarketMain.tsx:809-821` | 키워드 알림 바텀시트 내부 텍스트 인풋 + "추가" 버튼 |
| 2 | 등록된 목록 조회 | `frontend/src/pages/market/MarketMain.tsx:822-835` | 같은 시트 하단, flex-wrap 칩 목록 |
| 3 | 삭제 | `frontend/src/pages/market/MarketMain.tsx:826-833` | 칩 우측 `X` 아이콘 버튼(`handleRemoveKw`) |
| 4 | 시트 오픈 진입점 A | `MarketMain.tsx:511` | 헤더 우측 `Bell` 아이콘 버튼 (`openAlerts`) |
| 5 | 시트 오픈 진입점 B | `MarketMain.tsx:740-742` | 매물 0건(비필터) 빈 상태의 "키워드 알림 받기" CTA 버튼 |
| 6 | 알림 수신 표시 | `frontend/src/pages/notifications/NotificationInbox.tsx:88-89` | `type==='KEYWORD'` 이면 주황색 `Bell` 아이콘 뱃지로 구분 표시 |
| 7 | 알림 on/off 마스터 스위치 | `frontend/src/pages/settings/NotiSettings.tsx:27-31` | 설정 화면 토글(개별 키워드 관리 아님, 카테고리 전체 on/off) |
| 8 | API 클라이언트 | `frontend/src/api/market.ts:567-588` | `fetchKeywordAlerts` / `addKeywordAlert` / `removeKeywordAlert` |
| 9 | 딥링크 목적지 해석 | `frontend/src/pages/link/LinkRouter.tsx:56` | `market&id=<listingId>` → `/market/:id` |

**등록/목록/삭제 3가지 질문에 대한 확답**:
- **등록은 어디서 하나** → `MarketMain.tsx`의 키워드 알림 바텀시트(`alertOpen` 상태) 안, 단 하나뿐. 다른 화면(검색, 설정, 알림함)에는 등록 UI가 없음.
- **등록된 키워드 목록은 어디서 보나** → 같은 바텀시트 안(`alerts` state → `.alertChips`). 시트 밖(설정 화면 등)에서는 목록을 볼 수 없음 — `NotiSettings.tsx`는 토글 하나만 있고 목록을 렌더하지 않으며, 캡션(`settings.notiKeywordCaption`)으로 "키워드 등록·관리는 마켓 화면에서 할 수 있어요"라고 명시적으로 마켓 화면으로 안내한다(`ko/translation.json:691`). 즉 설계 의도 자체가 "단일 진입점"이다 — 누락이 아니라 의도된 집중.
- **삭제는 어디서 하나** → 같은 바텀시트 칩의 `X` 버튼. 다른 경로 없음.

`MarketSearch.tsx`, `NotificationInbox.tsx`에는 키워드 알림을 등록/편집하는 UI가 **없음**(확인 완료, 추측 아님).

---

## ② 현행 UI 상세 (마크업·CSS 근거)

**컨테이너**: `BottomSheet`(`components/ui/BottomSheet.tsx`), `height` prop 미지정 → 기본값 `'auto'`. `BottomSheet.module.css`의 `.sheet`는 `max-height: calc(100% - 60px); overflow: hidden; display:flex; flex-direction:column`, 내부 `.scrollBody`가 `flex:1; min-height:0; overflow-y:auto`로 실제 스크롤을 담당. 즉 콘텐츠가 화면 높이 밖으로 자라면 시트 자체가 아니라 `.scrollBody` 내부가 스크롤된다.

**시트 내부 구조** (`MarketMain.tsx:805-836`, 스타일 `MarketMain.module.css:277-352`):
1. 제목 행 — `Bell` 아이콘(18px) + "키워드 알림" 텍스트, `.alertTitle`(flex, 18px/700)
2. 설명 문구 — `.alertDesc`(13px, `--text-3` 회색)
3. 입력 행 — `.alertInputRow`(flex): 텍스트 `<input>`(`.alertInput`, `maxLength=60`, placeholder "예: 헬멧, 타이어") + `Button`("추가", `disabled={!newKw.trim()}`), Enter 키로도 제출
4. 칩 목록 — `.alertChips`(`flex-wrap: wrap; gap:8px`): 각 칩은 `.alertChip`(pill, `border-radius:999px`, `background: var(--surface-2)`)에 키워드 텍스트 + 원형 `X` 삭제 버튼(`.alertChipX`, 18×18px)

**상태 표현**:
- 로딩 상태: **없음**. `openAlerts()`(`MarketMain.tsx:461-465`)가 시트를 먼저 열고 `fetchKeywordAlerts`를 그 뒤에 호출 — 응답 대기 중 스켈레톤/스피너 없이 그냥 빈 칩 영역(빈 상태 문구와 시각적으로 구분 불가한 순간이 존재).
- 빈 상태: `.alertEmpty`(13px 회색 텍스트) "등록한 키워드가 없어요" — 아이콘 없는 텍스트 한 줄뿐.
- 에러 상태: 추가/삭제 실패 시 `toast.error(t('market.alertError'))`만 뜬다(`MarketMain.tsx:476, 487`). 조회 실패는 `.catch(() => setAlerts([]))`로 **조용히 빈 목록 처리** — "매물 없음"과 "조회 실패"를 구분 못 하는, 이 파일 자체가 F-12로 이미 고쳤던 것과 동일한 패턴의 문제가 여기서는 재발해 있음(로드 실패가 "키워드 없음"으로 위장됨).
- 성공 피드백: 추가 시 토스트 없음(칩이 목록에 즉시 나타나는 것이 유일한 피드백), 삭제 시에도 토스트 없음(칩이 사라지는 것뿐).
- 중복 등록 방지: 프론트에는 클라이언트 사이드 중복 체크가 없음 — 서버가 대소문자 무시 중복이면 기존 레코드를 그대로 반환하고(`backend/app/routers/market.py:1166-1175`), 프론트는 `id` 기준으로만 dedupe(`MarketMain.tsx:473`)하므로 결과적으로 중복 칩은 안 생기지만, 사용자에게 "이미 등록된 키워드예요" 같은 안내는 없다.

**i18n**: `market.keywordAlerts/keywordAlertsDesc/keywordPlaceholder/keywordAdd/keywordEmpty/keywordRemove`, `settings.notiSectionKeyword/notiKeywordMaster/notiKeywordCaption` 모두 `ko`/`vi`/`en` 3개 로케일에 빠짐없이 존재(`frontend/src/locales/{ko,vi,en}/translation.json:162-167, 689-691` 확인). 다국어 누락 없음.

---

## ③ 다수 키워드(10~30개) 시 파손 판정

**판정: 완전 파손(레이아웃 깨짐)은 아니나, 구조적 미비로 사용성이 급격히 나빠진다.**

근거:
- **상한선 없음**: 프론트(`handleAddKw`, `MarketMain.tsx:467-478`)에도 백엔드(`add_keyword_alert`, `backend/app/routers/market.py:1154-1181`)에도 등록 개수 상한 체크가 전혀 없다. 30개든 100개든 그대로 쌓인다.
- **레이아웃 자체는 안 깨짐**: `.alertChips`가 `flex-wrap`이고 부모 `.scrollBody`가 `overflow-y:auto`이므로 칩이 많아지면 시트가 세로로 길어지다가 `max-height: calc(100% - 60px)` 도달 후 내부 스크롤로 전환된다. 잘림(clip)이나 겹침은 없음.
- **실질적 문제**:
  - 카운터·상한 안내 문구가 전혀 없음 — 사용자가 몇 개까지 등록했는지, 더 등록해도 되는지 알 길이 없다.
  - 입력 행(추가 폼)이 칩 목록보다 **위**에 고정되어 있지 않고 같은 스크롤 컨테이너 안에 있다 — 시트를 열자마자는 보이지만, 칩이 많아 시트가 커진 상태에서 아래로 스크롤하면 입력 행이 화면 밖으로 밀려나는 것 자체는 없음(입력행이 칩보다 DOM상 위이므로 열자마자 보임)이나, **검색/필터가 없어 특정 키워드를 찾으려면 전체를 눈으로 훑어야** 한다.
  - 삭제도 정렬 없이 등록 역순(`ORDER BY created_at DESC`, `market.py:1145`)으로만 늘어서 있어 30개 중 특정 키워드를 지우려면 스크롤하며 찾아야 한다.
  - 로딩 인디케이터 부재와 겹쳐, 키워드가 많은 사용자일수록 시트를 열었을 때 "빈 화면 → 갑자기 칩 30개가 와르르 나타나는" 체감이 더 두드러진다.

결론: "매물이 많을 때 안 깨진다"는 기술적으로는 맞지만, 상한·카운터·검색·정렬 관리 기능이 전무해 헤비 유저 구간에서 급격히 UX가 나빠지는 설계로 판정한다.

---

## ④ 알림 수신 후 동선

`database/init/112_notifications_keyword_link.sql`의 주석에 명시된 딥링크 규약(`market&id=<listing_id>`)은 실제로 프론트에서 온전히 소비된다:
- `NotificationInbox.tsx:47-56`의 `handleClick`이 `n.link` 필드를 그대로 `/link?action=${n.link}`로 이동시키고,
- `LinkRouter.tsx:56`의 `resolveAction`이 `case 'market': return id ? '/market/${id}' : '/market'`로 매물 상세로 정확히 라우팅한다.

알림함 리스트 표시(`NotificationInbox.tsx:88-89`)는 `type==='KEYWORD'`일 때 주황(`#f8602a`) 배경의 `Bell` 아이콘 뱃지(`.iconKeyword`)로 소셜 알림(파랑 `MessageCircle`)과 구분되며, 제목/본문(`n.title`/`n.body`)은 서버가 채워 보내는 그대로 렌더한다(프론트에서 별도 가공 없음). 이 경로는 정상 작동하는 것으로 판정(코드 경로 완결 확인, 실기기 push 발송까지는 이번 감사 범위 밖).

---

## ⑤ 레퍼런스 3종 대조표

| 항목 | 사이공라이더 (현행) | 당근마켓(Karrot) | Facebook Marketplace | Craigslist |
|---|---|---|---|---|
| 등록 지점 | 마켓 메인 헤더 종 아이콘 + 빈 상태 CTA, 1곳만 | 하단 탭 "나의 정보" → "나의 활동" → "키워드 알림" 전용 화면 | 검색 결과 화면의 "Notify me"(종 버튼, 필터 옆) — 검색을 실행한 그 자리에서 등록 | 검색 실행 후 "Save Search" 클릭 |
| 관리 화면 위치 | 마켓 메인 바텀시트(등록 폼+목록 동거) | 별도 전용 페이지(등록 폼과 목록이 페이지 단위로 분리) | 앱: 커머스 프로필 → Settings → Manage Notifications / Saved searches 목록 화면. 데스크톱 웹은 저장검색 알림 자체 미지원 | 로그인 계정의 "searches" 탭 — 저장된 검색어 리스트 + alert 체크박스 열 |
| 키워드/검색 개수 상한 | **없음**(확인) | **30개**로 명시 상한 | 확인 불가(공개 자료에 명시된 개수 상한 언급 없음) | 확인 불가(계정당 저장검색 개수 제한 언급 없음, 실질적으로 검색어 단위라 별건) |
| 알림 빈도/세부 제어 | 없음(on/off 마스터 토글만, `NotiSettings.tsx`) | 단순화 지향 — 방해금지 시간대 설정은 있음(상세 필터는 지원 안 함, 번개장터와 대비되는 설계 선택) | 알림 타입별(이메일/푸시/SMS) 채널 선택 가능, 저장검색 단위로 on/off 토글 | 저장검색마다 alert 체크박스로 개별 on/off, 이메일로만 발송 |
| 키워드 편집 방식 | 삭제 후 재등록만 가능(수정 없음) | 박스(칩) 형태로 추가/삭제만 — 당근도 "수정"은 없고 삭제 후 재등록 방식, 대신 전용 화면이라 관리 부담이 적음 | 저장검색 목록에서 개별 검색 열어 알림 토글, 검색 조건 자체는 재검색으로 새로 저장 | 저장검색 삭제 또는 unsubscribe 링크(이메일 내) 클릭 |
| 목록이 길어질 때 | 시트 내부 스크롤(카운터·검색 없음) | 확인 불가(공개 자료에 30개 초과 시 UI 언급 없음) — 다만 전용 화면이라 스크롤 여유는 더 큼 | 저장검색 자체가 리스트형 화면(각 항목이 카드) — 확장에 강한 구조 | 테이블형 리스트(searches 탭) — 다건에도 스캔 용이 |

**출처**:
- [당근마켓 키워드 알림 설정 방법 (등록 및 삭제) - Inforble](https://inforble.com/carrot-market-keyword-notification-settings/)
- [당근마켓 키워드 알림 등록과 방해금지 시간 설정 방법](https://dailyfun.kr/412)
- [How to Manage Facebook Marketplace Saved Search Alerts | Classifindr](https://classifindr.com/guides/facebook-marketplace-manage-saved-search-alerts)
- [How to set up alerts for online marketplaces and Google - Stolen Ride](https://www.stolenride.co.uk/resources/marketplaces-and-google-alerts/)
- [craigslist | about | help | account | features | alerts](https://www.craigslist.org/about/help/account/features/alerts)
- [craigslist | about | help | account | features | searches](https://www.craigslist.org/about/help/account/features/searches/)

---

## ⑤-부가 판정: "디자인이 별로다" 지적의 구체적 원인

막연한 인상이 아니라 코드로 확인되는 결함으로 환원하면:
1. **로딩 상태 없음** — 시트를 열자마자 API 응답 전까지 빈 상태와 구분 안 되는 공백.
2. **로드 실패를 빈 상태로 위장** — `.catch(() => setAlerts([]))`(2026-07-31 F-12에서 같은 파일의 다른 부분은 이미 고쳤는데 이 기능만 재발).
3. **성공 피드백 없음** — 추가/삭제 모두 토스트 없이 칩만 나타나거나 사라짐(실패만 토스트).
4. **관리 도구 없음** — 개수 상한/카운터/검색/정렬 전무 → 다건일수록 체감 저하(③ 참조).
5. **입력과 목록이 한 시트에 뒤섞임** — 당근마켓·Facebook·Craigslist 모두 "등록"과 "관리(목록)"를 최소한 화면 내 구획(전용 페이지 또는 전용 탭)으로 분리하는데, 여기는 작은 바텀시트 하나에 타이틀·설명·입력폼·칩목록이 전부 눌려 있다.

---

## ⑥ 개선안

### A. 최소안 (바텀시트 유지, 이 시트 내부만 보강)

기존 디자인 문법(바텀시트=말단 액션)을 그대로 유지하되 결함만 고친다.

- 로딩 스켈레톤 추가 — 기존 프로젝트 관용구(`shimmer` 클래스, `.skelBar` 등 `MarketMain.tsx:688-696`에서 이미 쓰는 패턴)를 칩 자리에 재사용.
- 조회 실패 상태 분리 — F-12 패턴(`StateBlock tone="error"` + 재시도) 을 `fetchKeywordAlerts` 실패 시에도 적용 — 이미 같은 파일에 있는 `error: boolean` 관용구를 이 시트 전용 state로 추가.
- 추가/삭제 성공 토스트 — 기존 `toast.error` 옆에 `toast.success`(있는지 확인 필요 — 없으면 대표 지시 필요, **이번 감사 범위에서 `toast.ts` 자체는 열람하지 않아 success 헬퍼 존재 여부는 확인 불가**로 남김) 또는 최소한 "추가됨"류 문구.
- 개수 카운터 표시 — "12개 등록됨" 같은 텍스트를 `.alertTitle` 옆이나 `.alertDesc` 자리에 추가(상한 정책 자체는 대표 판단 필요 — 당근처럼 30개 캡을 걸지, 무제한 유지하되 카운터만 보여줄지는 임의 선택하지 않고 사용자에게 제시).

**대상 파일**: `frontend/src/pages/market/MarketMain.tsx`(`openAlerts`/`handleAddKw`/`handleRemoveKw`/JSX 805-836), `frontend/src/pages/market/MarketMain.module.css`(`.alertSheet` 블록), `frontend/src/locales/{ko,vi,en}/translation.json`(카운터/성공 문구 키 추가).

### B. 권장안 (전용 페이지로 승격)

이 저장소가 최근 같은 판단을 이미 한 번 내렸다 — 커밋 `4762726`("다른 사용자 프로필을 페이지로 — ProfileCard 바텀시트 폐기")가 정확히 "말단 액션이 아니라 그 자체로 둘러볼 콘텐츠가 있는 화면은 바텀시트가 아니라 페이지로 승격한다"는 선례다. 키워드 알림 관리도 (등록 폼 + 잠재적으로 긴 목록 + 개별 삭제 + 향후 알림 빈도 설정 여지)라는 점에서 같은 범주로 볼 수 있다.

- 신규 라우트 `/market/keyword-alerts`(가칭) — `MarketSearch.tsx`가 이미 쓰는 `TopBar`+리스트 패턴(뒤로가기, 검색창 없이 리스트만)을 그대로 재사용.
- 페이지 상단: 입력 폼(현 시트의 `.alertInputRow` 그대로 이식) — 페이지 최상단에 고정해 몇 개를 등록했든 항상 보이게.
- 본문: 칩 대신 리스트 행(`SettingsRow` 컴포넌트 재사용 가능 — `NotiSettings.tsx`가 이미 이 컴포넌트로 라벨+우측 컨트롤 패턴을 쓰고 있음) — 키워드 텍스트 + 등록일(있으면) + 삭제 버튼. 다건에서 칩 wrap보다 스캔이 쉬움.
- `MarketMain.tsx`의 `Bell` 아이콘과 빈 상태 CTA는 그대로 유지하되 `setAlertOpen(true)` 대신 `navigate('/market/keyword-alerts')`로 교체.
- `NotiSettings.tsx`의 캡션("키워드 등록·관리는 마켓 화면에서 할 수 있어요")을 이 새 라우트로 바로 연결하는 링크로 격상할 수도 있음(현재는 안내 텍스트일 뿐 탭 불가 — 이것도 최소 개선 후보).

**대상 파일**: 신규 `frontend/src/pages/market/MarketKeywordAlerts.tsx` + `.module.css`, `frontend/src/router`(라우트 등록 파일 — 이번 감사에서 정확한 경로 미확인, 구현 시 `App.tsx` 또는 `routes.tsx` 탐색 필요), `frontend/src/pages/market/MarketMain.tsx`(진입점 교체), `frontend/src/pages/settings/NotiSettings.tsx`(캡션 → 링크, 선택), i18n 3개 로케일.

---

## 요약

키워드 알림 등록·조회·삭제는 `frontend/src/pages/market/MarketMain.tsx`의 바텀시트 하나가 전부 담당하는 유일한 진입점이며(`MarketSearch.tsx`·`NotificationInbox.tsx`에는 등록 UI 없음), i18n은 3개 로케일 모두 완비돼 있다. "디자인이 별로다"는 인상은 구체적으로 로딩 상태 부재, 조회 실패를 빈 목록으로 위장(F-12 회귀), 추가/삭제 성공 피드백 부재, 그리고 등록 개수 상한·카운터·검색·정렬이 전혀 없어 다건(10~30개) 구간에서 관리가 힘들어지는 구조적 미비로 환원된다(레이아웃 자체가 깨지지는 않음 — 내부 스크롤로 흡수). 당근마켓(30개 상한 + 전용 화면), Facebook Marketplace(리스트형 저장검색 화면 + 채널별 알림 제어), Craigslist(테이블형 관리)는 공통적으로 등록과 "관리"를 화면 단위로 분리한다. 개선안은 시트 내부만 고치는 최소안(A)과, 이 저장소가 `ProfileCard→UserProfile` 전환에서 이미 채택한 "바텀시트=말단 / 페이지=탐색" 원칙을 그대로 적용해 전용 페이지로 승격하는 권장안(B) 두 갈래로 제시했다.
