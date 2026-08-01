---
작성일: 2026-07-10
기준 커밋: 2a78539
조사 방법: codebase-memory MCP 도구가 이 세션 환경에 로드되지 않음(ToolSearch 조회 결과 없음) → grep/Read로 전량 대체. 아래 모든 항목은 문서(ai-docs) + 실제 코드 직접 확인 기반.
목적: 동네지도 화면 개편 판단을 위한 사실 스냅샷 (개선 제안 없음)
---

# 동네지도(NeighborhoodMap) 현행 스냅샷

## 1. 화면 위상

- 탭바 라우트: `/map` (한글 메뉴명 "동네지도"), 페이지 파일 `frontend/src/pages/map/NeighborhoodMap.tsx:1`. 탭바 i18n 키 `tabbar.map`.
  근거: `ai-docs/context/frontend-page-map.md:19,54-59`
- 상단 주석은 "동네지도 v4 (SGR-287) — SaigonMapV4"라고 남아 있으나 실제 지도 컴포넌트는 `SaigonMapV5`로 전환된 상태(주석 stale). `NeighborhoodMap.tsx:87-90`
- 홈(`WorldMapV2.tsx`)·마켓(`MarketMain.tsx`)과는 별도 화면. 홈에는 동네지도로의 직접 진입 링크는 없고(“내 주변” 마켓 위치 컨텍스트 연결은 홈→마켓), 마켓은 자체 지도(`SaigonMapV2`, `MarketMain.tsx`)를 별도로 갖는다 — 동네지도의 `SaigonMapV5`와는 다른 컴포넌트.
  근거: `ai-docs/context/frontend-page-map.md:44,49-51`

## 2. 화면 구성 (UI 요소)

`NeighborhoodMap.tsx` 기준:
- 풀스크린 지도(`SaigonMapV5`) + 하단 `DraggableSheet`(collapsed/mid/full 스냅) 조합. 시트는 `embedded` 모드로 지도 위에 얹힘. (`NeighborhoodMap.tsx:643-740`)
- 상단 오버레이: 검색바(`SearchBox`, readOnly 트리거 → 전체화면 검색 패널). 검색 패널은 최근검색어 칩(추가/삭제/전체삭제) 보유. (`:671-715`)
- 탭 2종: `listings`(매물) / `feed`(동네 피드). 세그먼트 버튼은 시트 헤더에 위치. (`:22, :404-448`)
- 플로팅 버튼: 지도 확대/축소(`+`/`−`), 현재 위치 `◎`(`LocateFixed`, `SaigonMapV5.tsx:862-878`). 지역 선택 시에는 필터 칩(지역명 + X, `floatingTopLeft`)이 좌상단에 뜬다. (`NeighborhoodMap.tsx:722-732`)
- 리스트 아이템: 매물은 `ListingCard`, 피드는 인라인 확장형 카드(아바타→탭 시 `ProfileCard` 모달, 캡션/해시태그/사진/공감·댓글수), 4건마다 `AdCard` 삽입(`AD_EVERY=4`). (`:389-641`)
- 로딩/에러/빈 상태: 최소 2초 로딩 유지(`MIN_LOADING_MS`), 에러 시 "다시 시도" 버튼, 빈 상태는 region/viewport 모드별 문구 분기.

## 3. 핀/마커 — 표시 객체 유형

동네지도(`SaigonMapV5` + `NeighborhoodMap`)에 표시되는 마커는 **매물(listings)과 동네 피드(feed) 2종뿐**이다. 색상: 매물 `#ff6f3c`(LISTING_COLOR), 피드 `#3b82f6`(FEED_COLOR). (`NeighborhoodMap.tsx:25-26, 312-328`)

- 지도·바텀시트는 **단일 데이터 소스**(동일 bbox 조회 결과)만 표시 — 지도 핀 집합과 리스트 집합이 항상 일치.
- **info 계열(주유소·정비소·침수)과의 관계 — 미연결**. 그 마커들은 별도 컴포넌트 `frontend/src/components/maps/SaigonDistrictMap.tsx`가 `InfoMap.tsx`를 통해 `InfoHub` 하위 화면(`/info/gas`, `/info/repair`, `/info/flood`, `/info/weather`)에서만 사용되며, `NeighborhoodMap.tsx`는 이 컴포넌트를 import하지 않는다. `GasStationMarker`(`m.type === 'gas'`), `FloodMarker`, `FloodHotspotLayer`도 `SaigonDistrictMap`의 children 슬롯 전용.
  근거: `frontend/src/components/gas/GasStationMarker.tsx:12`, `frontend/src/components/flood/FloodMarker.tsx:14`, `frontend/src/components/maps/InfoMap.tsx:2,41`
- current.md의 "SaigonDistrictMap 집계 배지 — 시각검증 대기"(`ai-docs/context/current.md:16`)는 동네지도가 아니라 이 info계열 지도(`SaigonDistrictMap`)에 대한 잔여 항목이다(태스크 `ai-docs/task/active/260528_map_marker_projection_task.md` 확인, 대상 파일이 `SaigonDistrictMap.tsx`).
- 광고(`AdCard`)는 지도 핀이 아니라 시트 리스트 안에 4건 간격으로 삽입되는 카드다(지도 위 마커 아님).

## 4. 줌 게이트 (2026-07-07 도입)

SoT: `ai-docs/task/active/260707_map_zoom_gate_task.md` (2차 교정 포함), 구현: `SaigonMapV5.tsx`, `NeighborhoodMap.tsx`.

- LOD 임계값(viewBox 폭 기준, `SaigonMapV5.tsx:44-48`): `L1_VBW`(도시 전체, district 배지 층위 — 현재 미사용), `L2_VBW`(3500, 블록/도로 + ward 배지 층위), `L3_VBW`(700, 건물), `MIN_VBW`(100, 최대 줌인).
- `showDistrictBadges`(게이트 판정)는 `onDepthChange`로 부모에 통지: `vb.w < L2_VBW`가 아니고, "polyActive(지역선택 모드) && 선택된 ward 없음"이 아닐 때만 게이트 통과. (`SaigonMapV5.tsx:365`)
- **게이트 미만(줌아웃)**: 매물/피드 리스트 fetch 자체를 생략(`NeighborhoodMap.tsx:248-251`). 지도에는 핀도 배지도 렌더링 안 됨(2차 교정으로 district/city 배지 props 자체를 프론트에서 전달 안 함 — `districtBadges`/`cityBadges` prop 미사용, `:653` 주석). 시트는 접힘 시 힌트 필("🔍 확대해서 주변 보기"), 펼침 시 가이드 문구 + "내 동네 보기" 버튼만 노출.
- **게이트 통과(줌인)**: 뷰포트 bbox 자동 재조회(Airbnb식) + 매물/피드 리스트·핀 동시 갱신.
- 백엔드 `/map/district-counts`(`backend/app/routers/map.py`)는 **존치하되 프론트에서 무소비** 상태(2차 교정 결정 — 필요 시 재사용 목적으로 코드만 남김).
- 뷰포트 기억: 이동/줌 멈춤 후 500ms 디바운스로 `localStorage['sgr.map.viewport']`에 bbox 저장 → 재진입 시 그 뷰포트로 복원(GPS 미측정, "기억"으로 원칙 예외 처리). (`NeighborhoodMap.tsx:31-32, 59-76, 223-230`)
- GPS 자동측정 0회 보장: `SaigonMapV5`에 `locateOnMount` prop을 전달하지 않음(주석 명시, `NeighborhoodMap.tsx:649`). 최초 진입은 전역 뷰 + 게이트 가이드로만 안내.

## 5. GPS 컨텍스트 (4종)

`ai-docs/TEST/map_test_scenarios.md:6-13` 정의:

| ctx | 상태 | 대표 좌표 |
|---|---|---|
| A | HCMC 내 | 10.7756, 106.7019 (Bến Thành) / 10.80, 106.65 |
| B | HCMC 밖 | 37.50, 127.00 (서울) / 10.03, 105.78 (Cần Thơ) |
| C | 권한 거부/측정 실패 | geolocation permission denied |
| D | 미측정(신규 세션, 저장값 없음) | — |

동작 요지(코드 확인, `SaigonMapV5.tsx runLocate:443-467`):
- A: GPS 1회 측정 → 사용자 지점 중심 Layer3 최소 줌(vbW≈630)으로 focus, 위치 스토어에 좌표 기억(`onLocated`).
- B: HCMC bbox(±0.05° 마진) 밖이면 가짜 좌표/딥줌 없이 토스트 안내 후 벤탄시장 중심으로 이동(막다른 길 방지, 좌표 저장 안 함).
- C: 실패 토스트만, 뷰포트 불변, 크래시 없음.
- D: GPS 호출 0회 — 전역 뷰 + 게이트 가이드.

## 6. 데이터 소스 (BFF API / 도메인 테이블)

`NeighborhoodMap.tsx` import 기준(`:13-14`):
- `fetchListings`/`fetchAds` — `frontend/src/api/market.ts` → BFF `GET /market/listings`(`backend/app/routers/market.py:205`, 모델 `MarketplaceListing`), `GET /market/ads`(`:149`, 모델 `MarketplaceAd`).
- `fetchFeed` — `frontend/src/api/feed.ts` → BFF `/feed`(`filter=neighborhood`), 모델 `FeedPost`.
- 매물 리스트는 뷰포트 bbox(`min_lat/max_lat/min_lng/max_lng`) 또는 ward/district 필터로 조회, `hideSold`, `sort=recent`, id tie-breaker 정렬 포함. 페이지네이션은 프론트에서 50건씩 이어 붙여 상한 300건(`MAX_MAP_LISTINGS`)까지 병합(`NeighborhoodMap.tsx:38-55`).
- 검색은 위치 필터 없이 전역 `fetchListings({ q, hideSold: true, size: 40 })` (`:196-210`).
- `/map/district-counts`(`backend/app/routers/map.py:11-75`)는 API 자체는 살아 있으나 동네지도 프론트 코드에서 호출되지 않음(4절 참조).

## 7. 비즈 인프라(SGR-312) 접점

- **직접 연결은 지도 핀이 아니라 광고(AdCard) 경로로만 존재**. `MarketplaceAd` 모델에 `owner_business_profile_id`(FK → `business_profile.id`, `backend/app/models.py:571-572`) 존재. `GET /market/ads`는 `review_status == "APPROVED"`(BP-4 승인 게이트) + `is_active` 광고만 반환(`backend/app/routers/market.py:157`).
- 프론트 `adHref()`(`frontend/src/api/market.ts:227-229`): `ownerBusinessProfileId` 있으면 `/biz/:id`(BP-6 공개 비즈프로필)로, 없으면(레거시 광고) `/market/ad/:id` 폴백.
- `NeighborhoodMap.tsx`는 `fetchAds(null)`로 전역 광고를 가져와(`:237`) 리스트 4건 간격(`adAt`, `:389-394`)으로 `AdCard` 삽입, 탭 시 `navigate(adHref(ad))` — 즉 동네지도 화면에서도 비즈 프로필로의 진입 경로가 열려 있음.
- **매물/피드 마커 자체는 business_profile과 무관** — 개인 간 중고거래(`MarketplaceListing.seller_id`는 user, business_profile 아님)이므로 지도 핀 레벨에서는 "미연결". 연결은 오직 광고 카드 단위.

## 8. 서비스 규칙 제약 (적용분, `ai-docs/context/service-rules.md`)

- 원칙 1·2: 화면 진입/이동 시 GPS 자동 측정 금지, 사용자가 명시적으로 "현재 위치"를 선택한 시점에만 측정 — 동네지도는 `locateOnMount` 미사용으로 준수(4절).
- 기본 상태: 위치 미선택 = 전체 지역 노출(마켓 기준)이나, **지도는 게이트 줌 진입 전 데이터 자체를 표시하지 않음**(2026-07-07 개정 — 종전 "구별 카운트 배지만 표시" 정책은 배지≠리스트 소스 불일치 문제로 폐기).
- 화면별 표(service-rules.md): 지도(NeighborhoodMap) 기본값 = 미선택, 위치 선택 방법 = 지도에서 동네 탭 또는 `◎`(현재 위치) 버튼.
- 바텀시트 원칙: 시트는 사용자 의도 액션에만 자동 이동(지역선택/모드전환/데이터갱신으로는 안 올라감). 예외: 지도 핀 탭(특정 매물 지목) 시에만 mid까지 올림 — `handleMarkerClick`(`NeighborhoodMap.tsx:346-355`), `handleRegionSelect`(`:333-344`, 시트 자동 이동 없음 명시)에서 확인.

## 9. 알려진 미해결/보류 항목

- **`SaigonMapV5` 관련 인덱스 노이즈**: 워킹트리에 `NeighborhoodMap_bak.tsx`, `NeighborhoodMap_v3bak.tsx`, `NeighborhoodMap_bak.module.css`(git 미추적)가 존재 — 죽은 백업 파일. (`ai-docs/context/frontend-page-map.md:59`)
- **페이지 상단 주석 stale**: "SaigonMapV4" 언급이 실제 `SaigonMapV5` 전환 이후에도 남아 있음(`NeighborhoodMap.tsx:88`).
- **`SaigonDistrictMap`(info계열 지도) 집계 배지 — 시각검증 대기**: 동네지도가 아니라 info 서브페이지(주유/정비/침수) 몫의 잔여 항목(current.md:16, 태스크 260528). 동네지도 자체의 시각검증 대기 항목은 별도로 발견되지 않음 — 2026-07-07 회귀 스윕에서 FAIL 9건 전건 수정·7/7 PASS 처리됨(current.md 최상단 요약).
- **info 4페이지의 `locateOnMount`(진입 시 GPS 자동측정) 원칙 긴장**: 동네지도는 2026-07-07 위반으로 제거됐으나, info 페이지들은 위치 기반 정보 화면 특성상 유지 중 — "의도인지 제품 결정 필요"로 current.md에 대기 상태 기록(`ai-docs/context/current.md:120`). 동네지도와는 무관하지만 GPS 원칙 일관성 관점에서 인접 이슈로 남아 있음.
- **마켓 지도(`SaigonMapV2`, `MarketMain.tsx`)와의 관계**: 별도 컴포넌트/화면이라 동네지도 개편과 별개로 존재. 유가 후속(Feature #50, WorldMap 유가위젯)·정보 리팩터 등은 project_todo.md 유지 10건 중 하나(238/236/270)로 남아 있으나 동네지도 자체 항목은 아님.
- **AdCard 탭 경로 검증**: `adHref()` owner 유무 분기는 코드 확인됐으나(BP-6 커밋 `c604557`), 동네지도 화면에서의 실제 브라우저 시각검증 여부는 이번 조사 범위에서 별도 확인하지 못함(코드 레벨만 확인).

## 확인 못 한 것 (조사 한계)

- codebase-memory MCP 부재로 실제 호출관계 그래프(`trace_path`)를 통한 교차검증은 하지 못함 — 전량 grep/Read 정적 분석.
- `/biz/:id` 공개 프로필 화면 자체의 구현 상세(BP-6)는 이번 스냅샷 범위 밖(참조만).
- 동네지도 화면의 실제 브라우저 스크린샷/시각 상태는 확인하지 않음(코드 레벨 스냅샷).
- `frontend/src/components/maps/v2/region.ts`(regionContains, SelectedRegion 타입) 등 지역 폴리곤 판정 로직의 세부 구현은 얕게만 확인(import 목록 수준).
