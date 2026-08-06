# 서비스 규칙 (Service Rules)

기능 구현 시 위반해서는 안 되는 도메인 불변식.

---

## GPS / 위치 서비스

> **전면 개정 2026-08-06** (대표 지시: *"기본을 다 gps로 / 안잡히면 전체지역으로 / 2개로만해 / 모든화면에서 / 지도 다나오게"*).
> 종전 원칙 1·2(**GPS 자동 측정 금지**, **지도 탐색에 GPS 미사용**, 전체↔선택지역 2모드)는 **폐기**됐다.
> 폐기 사유: 위치 SoT 가 3벌로 갈려 화면마다 다른 지역을 보여줬고, GPS 를 켜도 예전에 고른 지역이 기준이었다.
> 설계도 원문: [`ai-docs/260806_gps_scope_unification_design.md`](../260806_gps_scope_unification_design.md)

### 원칙

1. **표시 범위는 `'gps'` ↔ `'all'` 2개뿐이다.** 기본값은 `'gps'`(내 현재 위치). 사용자가 동을 골라 필터하는 **지역 선택은 폐기**됐다 — 시트 3번째 옵션, 지역칩(`AreaPill`), 지도 폴리곤 탭 선택, URL `rlat/rlng` 보존 전부 제거.
2. **모든 화면이 같은 기준을 쓴다.** 마켓·동네지도·홈·주유소·정비소·날씨·침수가 단일 SoT 를 구독한다. 화면별 독자 위치 상태를 만들지 말 것(마켓의 `mkt_filter_v2` 가 그 사고였다).
3. **`'gps'` 의 "근처" = 내 좌표 반경 `NEARBY_RADIUS_KM`(3km).** 행정구역(ward/district)으로 거르지 않는다 — 구 경계에 걸친 건이 통째로 빠지던 원인이다.
4. **측위 주체는 스토어 하나.** 화면은 `ensureLocation()` 을 부르기만 한다. 세션당 실측 1회(in-flight 공유)이며, 화면이 `native.getLocation()` 을 직접 부르면 화면 수만큼 권한창이 뜬다.
5. **좌표는 persist 하지 않는다.** 모드만 기억하고 세션마다 재측위한다 — 어제 좌표로 오늘의 "근처"를 계산하면 헤더와 목록이 어긋나는 회귀가 재발한다.
6. **진입 권한 프롬프트는 프리프롬프트로 완화한다.** 권한이 **미결정(`prompt`)일 때만** 자체 확인 다이얼로그(기존 전역 `ConfirmDialog` 재사용)로 목적을 먼저 알린다. "나중에"를 고르면 시스템 창을 띄우지 않고 `'all'` 로 가며, 이후 세션에서 다시 묻지 않는다.
7. **이동 추종은 앱 전역 1개**(2026-08-06 추가, 대표 지적 "페이지이동을 하지 않으면 위치가 반영되지 않는다"). `useLocationStore.startWatching()` 을 **`App.tsx` 에서만** 호출한다 — 화면마다 걸면 워처가 중복된다. `native.watchLocation`(이벤트 기반) 을 쓰고 폴링하지 않는다.
   - **30m 거리 게이트 필수**(`WATCH_MIN_MOVE_M`). GPS 는 정지 상태에서도 수 m 씩 튀는데 그대로 스토어에 반영하면 `coords` 를 deps 로 쓰는 목록·지도 조회가 초당 몇 번씩 재발화한다. 반경이 3km 라 30m 이하 흔들림은 결과를 바꾸지 않는다.
   - 서비스 권역 밖으로 이동한 tick 은 **무시**한다(마지막 유효 위치 유지).
8. **여전히 유효한 GPS 경로**: 경로안내(`RideNav`), 제보(주유/정비/침수 신고의 `native.getLocation()`).
9. **dev 좌표 오버라이드**(`/dev/gps` 하네스 전용). `native.getLocation()`/`watchLocation()` 이 `localStorage.__dev_gps` 를 우선 반환한다. **2중 게이트** — 호스트 허용목록(localhost/127.0.0.1/saigon.doil.me) + 명시적 opt-in 키. 빌드타임 플래그(`import.meta.env.DEV`)를 쓰지 않는다: `frontend/Dockerfile` 이 `npm run build`(프로덕션 모드)라 **dev 스택에서도 `DEV` 가 false** 이기 때문.

### 폴백 정책 — "측위 실패"와 "권역 밖"은 다른 사건이다

| 상황 | 결과 mode | `coordsSource` | 기준 좌표 | 안내 |
|---|---|---|---|---|
| 측위 성공 & `inServiceArea` | `gps` | `device` | 실측 좌표 | 없음 |
| **측위 성공 & 서비스 권역 밖** | **`gps`** | **`fallback`** | **`BEN_THANH_FALLBACK`**(중심가) | `map.outsideArea` |
| 권한 거부(code 1) | `all` | — | 없음 | `map.listFirst.nearMeDenied` |
| 타임아웃(code 3) | `all` | — | 없음 | `map.listFirst.nearMeTimeout` |
| 측정 불가 / 위치서비스 꺼짐 | `all` | — | 없음 | `map.listFirst.nearMeUnavailable` |

- **권역 밖은 기존 동작을 유지한다** — 어디 있는지는 알고 서비스 범위 밖일 뿐이므로, 알리고 중심가로 안내한다. `'gps'` 를 유지하므로 반경 3km 필터가 그대로 걸려 목록이 비지 않는다.
- **측위 실패는 `'all'`** — 어디 있는지 모르는 상태에서 중심가로 보내면 "왜 여기냐"는 근거가 없다.
- **`BEN_THANH_FALLBACK` 을 측위 실패에까지 채우지 말 것.** 그게 모든 화면이 아무 설명 없이 Bến Thành 으로 수렴하던 직접 원인이다(2026-08-06 대표 캡처).
- 폴백 토스트는 **세션당 1회** — 화면 5개가 각자 띄우면 폭탄이 된다.
- **`coordsSource` 를 라벨에 반영할 것.** 권역 밖인데 "내 현재 위치"라고 쓰면 사용자가 결과를 오해한다.

### 단일 SoT — `useLocationStore` (전면 개정 2026-08-06)

- `store/useLocationStore.ts` — `mode: 'gps' | 'all'`, `coords`, `wardName`(**라벨 전용**), `coordsSource`, `permissionIntent`, `ensureLocation()`, `setMode()`.
- **`region` / `selectRegion` / `selectAll` / `useSelectedRegion` / `location` 스냅샷은 제거됐다.** persist 는 `version: 4` 로 올려 구버전 값(`mode:'region'`)이 되살아나지 않게 한다.
- **`wardName` 을 필터 판정에 쓰지 말 것** — 판정은 좌표 반경이다. 동 폴리곤은 중심부 37개만 커버해 그 밖에서는 라벨이 `null` 이 되는데, 이걸 판정에 쓰면 결과가 통째로 빈다.
- 정보 화면 공통 소비는 `hooks/useServiceLocation.ts`(→ `{ origin, radiusKm, label }`), 표시범위 시트는 `components/location/DisplayScopeSheet.tsx`(앱 공용 2옵션).

### 화면별 적용

| 화면 | 기본값 | 표시 범위 변경 방법 |
|---|---|---|
| 마켓(MarketMain) | GPS 반경 3km | 헤더 지역명 탭 → `DisplayScopeSheet` 2옵션 |
| 동네지도(NeighborhoodMap/Canvas) | GPS 반경 3km | 헤더 지역명 탭 → `DisplayScopeSheet` 2옵션 |
| 홈(HomePage) | GPS 반경 3km | (전용 진입점 없음 — 다른 화면에서 바꾸면 함께 반영) |
| 정보-날씨/주유/정비/침수 | GPS | `LocationContextBar` 칩 탭 → `DisplayScopeSheet` 2옵션 |
| 제보(주유/정비/침수 신고) | — | `native.getLocation()` (GPS 유지) |
| 경로안내(RideNav) | — | GPS 유지 |
| 물건 등록 | 위치 없음 | 명시적 위치 선택 시에만 좌표 저장 (`LocationPickerSheet` — 표시범위와 무관한 별개 피커) |

### 지도 렌더 (개정 2026-08-06)

- **동 경계선(Layer 1)·동 이름 라벨은 항상 그린다.** `SaigonMapV5.tsx` 의 `Layer 1 (항상): 동 경계선 + 수로` 는 `polyActive` 와 무관하다.
- **`polyActive={false}` 로 통일한다** — 이건 *선택 동 강조*(주황 테두리 + 나머지 동 `.wardDim` 감쇠 + 선택 동 외 L2/L3 레이어 숨김) 스위치다. 지역 선택이 사라져 강조할 대상이 없고, 켜두면 지도가 잘려 보인다(대표 지시 "지도 다나오게").
- **카메라는 GPS 중심**(`locateOnMount`), 내 위치 파란 점은 항상(`meDotOnMount`).
- **우측 하단 '내 위치'(◎) 버튼을 켠다**(`showLocateControl`, 2026-08-06 복원). 이걸 끄던 근거가 폐기된 원칙 2 였다. 탭하면 재측위 후 **센터링 + L3 줌인**(`focusLatLng` 가 `L3_VBW*0.9` 로 맞춘다). 화면에 FAB 가 있으면 `bottomInsetPx` 로 겹치지 않게 띄운다(마켓 = 70).
- **매물·피드 마커는 전용 teardrop 핀**(`BIZ_PIN_PATH` + 도메인 글리프)으로 그린다 — 선택 여부 무관. 종전엔 비선택이 기본 dot(`#3b82f6`)이라 **내 위치 파란 점과 구분이 안 됐다**(대표 지적 2026-08-06).
- **L2 줌 게이트는 유지한다** — 멀리서 볼 때 확대를 유도하는 장치라 존치(대표 확인 2026-08-06). 게이트 미만에서는 지도·시트 모두 비우고 확대 안내 필을 노출한다.

---

## 바텀시트 (지도 화면)

1. **시트는 사용자가 의도한 액션에만 자동 이동한다.** 지역 선택/해제, 모드 전환, 데이터 갱신 같은 "지도 탐색 중" 신호로 시트를 올리지 않는다 — 탐색 결과는 접힘 헤더(칩·건수·힌트 필)로 전달하고, 올릴지는 사용자가 결정한다.
2. 예외: **특정 아이템을 지목한 액션**(지도 핀 탭 = 이 매물 보기)은 시트를 올리되, 지도 컨텍스트(선택 핀)가 함께 보이도록 **mid까지만** 올린다. full 확장은 사용자 드래그로만.

(제정 2026-07-07 — "지역만 선택해도 시트가 자동으로 올라오는" UX 지적 반영)

---

## 찜 / 단골 역할 분리 (업체)

### 원칙

1. **찜(`user_favorite_business`) = 나중에 보려고 저장하는 개인 북마크.** 화면 `/map/favorites`(`pages/map/MapFavorites.tsx` 업체 탭). API `GET/POST/DELETE /biz/favorites`.
2. **단골(`business_follow`) = 그 가게의 소식을 받아보는 구독.** 화면 `/map/follows`(`pages/map/MapFollows.tsx`, 신규 2026-07-26). API `GET /biz/follow` + `POST/DELETE /biz/follow/{profile_id}`. 업체 대시보드(`BizDashboard.tsx`)의 "단골 N"은 이 구독자 수(`BusinessFollow` row 카운트)다.
3. **아직 없는 것**: 푸시/인앱 알림 연동은 미구현이다 — 단골을 맺어도 알림이 오지는 않고, `/map/follows` 화면에서 각 업체의 최신 소식을 모아 볼 수 있을 뿐이다(조회 시점에 `GET /biz/follow`가 `latest_news`를 함께 내려줄 뿐, 소식 등록 시점의 실시간 push는 없음).

### 왜 나눴는지 (2026-07-26)

2026-07-26 이전에는 두 기능이 실질적으로 동일했다 — 단골은 목록 조회 API 자체가 없었고(동네지도 프로필의 "단골 업체" 진입점이 "준비 중" 토스트만 띄웠다), 소식 알림·구독 연동도 전무했다. 대표가 "찜과 단골의 차이가 뭐냐, 결국 같은 즐겨찾기 아니냐"고 지적했고, 조사 결과 이 지적이 맞았다(기능 차이 없음 확인). 대응으로 **단골을 "소식 구독"으로 완성**해 역할을 분리했다 — 단골 전용 목록 화면(`/map/follows`)에 최신 소식 미리보기를 붙여, 찜(북마크)과 단골(소식 구독)이 서로 다른 사용자 의도를 표현하도록 만들었다. **이 이력을 남기는 이유**: 이후 세션이 같은 의문("왜 굳이 나눴나")으로 되돌아가지 않게 하기 위함 — 답은 "지금은 실질적 차이가 있다(소식 구독 여부)"이다.

---

## 광고 노출

1. **노출 순서 결정 SoT = 백엔드.** `backend/app/services/ad_exposure.py`(`build_exposure_sequence`)가 각 광고의 **weight = tier `exposure_weight` × `ad_fee`**(두 값 모두 최소 1로 clamp)로 **결정적 smooth weighted round-robin 시퀀스**를 만든다. `GET /market/ads`는 `AdsApplication.public_ads(상시 노출 광고)` → 이 시퀀스를 반환한다(`MAX_SEQUENCE_LENGTH=120` 캡).
2. **유료 tier 카탈로그 = `ad_tiers`** (`name`·`exposure_weight`·`monthly_price_vnd`·`display_order`). 광고주가 등록 시 tier를 **직접 선택**하고(`marketplace_ads.tier_id`, 가격은 `monthly_price_snapshot_vnd`로 스냅샷), tier의 `exposure_weight`가 노출 가중을 주도한다. 현재 카탈로그(`database/init/149_ads_tiers.sql`+`150_ad_tier_prices.sql`): **프리미엄(weight 3 · 499,000 VND/월) / 일반(weight 1 · 199,000 VND/월)**. `ad_fee`는 기본 0(→1 중립)이라 평시엔 tier가 노출을 지배하고, 필요 시 추가 가중 계수로만 작동한다.
3. **게시 라이프사이클 = 상시 게시 기본.** 등록(이미지+문구+tier 선택) → 심사(`review_status` PENDING→APPROVED) → **승인 즉시 상시 게시**(`starts_at` 미설정). `ends_at`은 **선택적**(이벤트성 광고의 자동 종료일)이며 미설정 시 무기한. 노출 게이트(`launching_ad_conditions`) = `APPROVED + is_active + 기간유효`(starts/ends NULL이면 상시). 광고주는 `BizManage`에서 `stop`/`resume`로 중단/재개한다. (구: start~end 범위 필수 입력 → 폐기, 월 구독형이라 상시가 기본)
4. **프론트는 서버 순서를 소비만 한다.** `frontend/src/lib/adPlacement.ts`(공용, `AD_EVERY=6`)는 서버가 반환한 순서를 화면별 위치 기준으로 순환 배치할 뿐, **재가중·재정렬·shuffle을 하지 않는다.** MarketMain·NeighborhoodMap(Canvas)·HomePage 3개 화면이 이 모듈을 공유한다.
5. **과금**: `monthly_price_vnd`는 구독 표시가일 뿐 **자동 결제 엔진은 미구현** → 초기엔 오프라인 정산(관리자 입금 확인 후 게시) 전제. tier/ad_fee/price는 공개 응답(`MarketplaceAdOut`)에 미노출.

(제정 2026-07-23 · 개정 2026-07-25 — 유료 tier 도메인(`ad_tiers`) + 월정액(일반 199k/프리미엄 499k) + 상시 게시(선택 종료일) 모델로 정리. 노출 weight = tier `exposure_weight` × `ad_fee`.)
