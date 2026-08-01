# 서비스 규칙 (Service Rules)

기능 구현 시 위반해서는 안 되는 도메인 불변식.

---

## GPS / 위치 서비스

### 원칙

1. **GPS는 강제하지 않는다.** 앱 진입·화면 이동 시 GPS를 자동 측정하지 않는다.
2. **지도 탐색에는 GPS를 쓰지 않는다 (개정 2026-07-25).** 지도/정보 화면의 위치 컨텍스트는 **전체(all) ↔ 사용자가 고른 지역(region)** 2모드뿐이다. "현재 위치로 이동"(◎) 기능은 지도 화면들에서 제거됐다. GPS 측정이 남는 곳은 **경로안내(RideNav)** 와 **제보(주유/정비/침수 신고의 `native.getLocation()`)** 뿐이다.
3. 지역 선택은 **동네지도에서 동 폴리곤을 탭**(SaigonMapV5 `onRegionSelect`)하거나, **정보 화면의 지역 피커**(`LocationContextBar`)로만 이뤄진다 — GPS 불필요.

### 단일 SoT — `useLocationStore` (개정 2026-07-25)

- **위치 컨텍스트의 단일 기준은 `store/useLocationStore.ts`** (`mode: 'all' | 'region'`, `region: SelectedRegion | null`). **동네지도(`NeighborhoodMapCanvas`)가 기준(canonical)** 이며, 정보 3화면(날씨/주유/정비)이 같은 스토어를 소비한다(침수는 별도 제외 — 개정 2026-07-25). 이 스토어는 전역 싱글톤이므로 **새 화면이 이곳에 쓰기를 추가하면 다른 화면으로 위치 상태가 침습될 수 있음**에 주의. 종전 파편화(`lib/infoCoords.ts` URL쿼리, `InfoWeather` 로컬 state 등)는 제거됐다.
- 한 화면에서 고른 지역이 **화면 간·재진입에서 그대로 유지**된다(스토어 persist). 정보 화면 공통 소비는 `hooks/useServiceLocation.ts`(→ `{ region, origin }`), 공통 컨텍스트바는 `components/info/LocationContextBar.tsx`.
- `useLocationStore.location`(스냅샷)은 홈(`WorldMapV2`)·프로필(`NeighborhoodProfile`)의 지도 센터링용 **읽기 전용 파생값** — `selectRegion` 시 함께 갱신되는 투영이지 별도 SoT가 아니다.

### 기본 상태 (아무것도 선택 안 했을 때)

- **위치 미선택** = 전체 지역(`mode: 'all'`) 노출. 필터 없음. 정보 화면은 도시 기본 중심(`HCMC_DEFAULT_CENTER`) 기준 조회.
- 마켓: 전체 매물 표출 (`wardId=null, districtId=null`). ※ 마켓(MarketMain)은 독자 위치 상태 유지 — 이번 단일화 범위 밖.
- 지도: **게이트 줌(동/구 단위) 진입 전에는 데이터를 표시하지 않는다** — 지도(핀·배지)와 바텀시트(리스트)는 항상 동일한 bbox 조회 결과만 표시(단일 데이터 소스). 게이트 미만에서는 양쪽 모두 비우고 "조회할 지역으로 확대" 가이드를 제공한다. (개정 2026-07-07 — 종전 "구별 카운트 배지만 표시"는 배지≠리스트 소스 불일치·전역 노이즈 문제로 폐기)

### 화면별 적용

| 화면 | 기본값 | 위치 선택 방법 |
|---|---|---|
| 마켓(MarketMain) | 전체 지역 | 헤더 지역명 탭 → 시트에서 선택 또는 현재 위치 (※ 독자 상태) |
| 동네지도(NeighborhoodMapCanvas) | 전체(미선택) | 지도에서 동 폴리곤 탭 → `useLocationStore` (◎ GPS 버튼 제거) |
| 정보-날씨/주유/정비 | 전체 | `LocationContextBar` 지역 피커 |
| 정보-침수(InfoFloodMap) | 전체 | 지도 뷰포트(bbox) 기준으로 필터 (팬/줌 시 갱신; 개정 2026-07-25) |
| 제보(주유/정비/침수 신고) | — | `native.getLocation()` (GPS 유지) |
| 경로안내(RideNav) | — | GPS 유지 |
| 물건 등록 | 위치 없음 | 명시적 위치 선택 시에만 좌표 저장 |

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
4. **프론트는 서버 순서를 소비만 한다.** `frontend/src/lib/adPlacement.ts`(공용, `AD_EVERY=6`)는 서버가 반환한 순서를 화면별 위치 기준으로 순환 배치할 뿐, **재가중·재정렬·shuffle을 하지 않는다.** MarketMain·NeighborhoodMap(Canvas)·WorldMapV2 3개 화면이 이 모듈을 공유한다.
5. **과금**: `monthly_price_vnd`는 구독 표시가일 뿐 **자동 결제 엔진은 미구현** → 초기엔 오프라인 정산(관리자 입금 확인 후 게시) 전제. tier/ad_fee/price는 공개 응답(`MarketplaceAdOut`)에 미노출.

(제정 2026-07-23 · 개정 2026-07-25 — 유료 tier 도메인(`ad_tiers`) + 월정액(일반 199k/프리미엄 499k) + 상시 게시(선택 종료일) 모델로 정리. 노출 weight = tier `exposure_weight` × `ad_fee`.)
