# 동네지도(Neighborhood Map) 논리적 모듈화 — ①범위파악 (Scope Analysis)

> 작성일: 2026-07-20
> 상태: **범위파악 완료 — 사용자 검토·의사결정 대기 (코드 미수정)**
> 경계 결정 전제: **A안(논리적 모듈화)** — 물리 서비스 분리 아님. BFF(`backend/`)는 한 서비스로 유지, 지도 도메인 코드를 API 계약으로 응집한다.

---

## 0. 핵심 전제 — ADR 부재

`mcp__codebase-memory__manage_adr(mode='get', project='mnt-c-DEV-saigon_rider')` 조회 결과 **ADR이 비어있음** (`no_adr`). `CLAUDE.md`/`frontend-page-map.md`가 "먼저 ADR부터 확인"을 안내하지만 현재 저장된 내용이 없어, 이번 분석은 `frontend-page-map.md` + `architecture.md` + 코드 그래프(`search_graph`/`query_graph`/`get_code_snippet`) + 직접 Read로 전량 재구성했다. (별건이지만 세션 마무리 시 언급 필요 — 이번 태스크 범위 밖이라 ADR을 새로 쓰지는 않음.)

---

## 1. 현행 인벤토리 (4개 도메인별)

### 1.1 POI / 장소마커

| 항목 | 내용 |
|---|---|
| 앱 조회 엔드포인트 | `GET /api/poi/public/map` — `backend/app/routers/poi.py:16-60` `get_public_map()`. bbox+category+q 필터, `published=true` + 좌표 보유만, limit 200. |
| 관리자 등록 엔드포인트 | `POST /admin-legacy/poi/bulk` — `backend/app/routers/admin_legacy.py:4453-4517` `admin_poi_bulk_upsert()`. `(source, external_ref)` 부분 유니크 인덱스 기준 upsert, **`include_in_schema=False`**(OpenAPI 문서에서 숨김 — 사람이 쓰는 폼이 아니라 "에이전트/스크립트" 전용으로 설계된 API, docstring 명시). |
| 데이터 모델 | `Poi` — `backend/app/models.py:622-645`, 테이블 `poi` (BFF DB). `photo_content_id` FK→`contents.id`(컨텐츠 규칙 **준수**, `photo_content` relationship lazy=selectin). `PoiCategory` — `models.py:608-619`, 테이블 `poi_category`(3개국어 라벨+아이콘, docstring: "BusinessCategory 미러" — 의도적 중복). Poi 자체 docstring: "BusinessProfile 미러". |
| 관리자 CRUD 상태 | **등록(upsert)만 존재, 조회/수정 UI 없음.** `admin_legacy.py`에 POI 목록 페이지·개별 수정·`poi_category` CRUD 전무 (grep 결과 `/poi/bulk` 라우트 1개뿐). |
| 프론트 컴포넌트/API | `frontend/src/api/poi.ts:29-57` `fetchPoiMapItems()` → `GET /poi/public/map`. 소비처: `NeighborhoodMap.tsx:19,609` (bbox 기준 fetch), 아이콘 매핑 `components/maps/poiCategoryIcons.ts`. |
| 2차 이식 목록 상 위치 | `ai-docs/context/current.md:172` — "2차 이식 잔여" 목록에 **POI**가 명시(legacy에서 신규 SPA로 미이식). |

### 1.2 구역(District) 지오메트리 — **3중 하드코딩 + 1 DB 소스, 서로 불일치**

| 소스 | 파일 | 용도 | 현재 사용처 |
|---|---|---|---|
| ① 프론트 하드코딩 SVG (신) | `frontend/src/components/maps/district-data.ts:28-156` `HCMC_DISTRICTS`(29개, viewBox 400×280, 2025-07-01 행정개편 반영 명시) | `findNearestDistrict()`(180-194), `gpsToSvg()`(245-253), `isWithinDistrictRadius()`(222-234) 등 | `SaigonDistrictMap.tsx`(컴포넌트) 경유 → **주변정보(도메인4) 전용**: `InfoMap.tsx`, `InfoHub.tsx`, `InfoFloodMap.tsx`, `InfoFloodReport.tsx`, `InfoGasList.tsx`, `InfoRepairList.tsx`, `FloodMarker.tsx`, `FloodHotspotLayer.tsx`, `GasStationMarker.tsx`(주석 명시). **`NeighborhoodMap.tsx`/`SaigonMapV5.tsx`는 이 파일을 import하지 않는다** (grep 확인 완료). |
| ② 프론트 하드코딩 SVG (구, 미사용 추정) | `frontend/src/pages/home/DistrictMap.tsx` + `districtPaths.ts`(viewBox 1200×900, `d8` 식 구 행정구역 ID) | `DistrictMap` 컴포넌트 자체 | **⚠ 데드코드로 보임** — repo 전체에서 `<DistrictMap` JSX 사용처, `from '.../home/DistrictMap'` import 어디에도 없음(grep 확인, 결과 0건). 라우트도 없음. |
| ③ 프론트 GeoJSON (현행 동네지도가 실제 쓰는 것) | `frontend/src/components/maps/v2/saigon-depth1.json` + `v2/region.ts`(`regionContains()` ray-casting, `SelectedRegion.poly`) | ward(동) 폴리곤 | `SaigonMapV5.tsx`의 `findWardAt(lat,lng)` — **`NeighborhoodMap.tsx`(동네지도)가 실제로 쓰는 지오메트리는 이것**(frontend-page-map.md §3.3 "지도-리스트 분리" 항목 근거). |
| ④ 백엔드 PostGIS 컬럼 | `districts.boundary GEOGRAPHY(POLYGON,4326)` — `database/init/036_district_geo.sql:10` 컬럼 추가, 37번째 줄부터 구역별 `ST_GeogFromText(...)` WKT 하드코딩 UPDATE. **SQLAlchemy `District` 모델(`models.py:60-78`)에 매핑 안 됨** — raw SQL(`utils.py`)로만 접근. | `find_district_by_point(db,lat,lng)` — `backend/app/utils.py:267-282`, PostGIS `ST_Covers`로 좌표→구역 코드 역조회 | **⚠ 호출부 미확인** — 코드그래프 `query_graph`로 호출자(CALLS 엣지)를 조회했으나 0건 반환. RP/미션 지역 판정용으로 추정되나 현재 활성 호출 경로가 그래프에 안 잡힘(직접 호출 누락 가능성 — 재확인 필요, "미확인"으로 표기). |

| 그 외 backend 구역 집계 | `GET /district-counts` — `backend/app/routers/map.py:12-74` `get_district_counts()`. `tab=listings&level=district`→`District`+`MarketplaceListing` 조인, `tab=listings&level=ward`→`Ward`+`MarketplaceListing`, `tab=feed`→`District`+`FeedPost` 조인. **`District`/`Ward` 모델 자체엔 `center_lat/center_lng`만 있고 폴리곤 없음** — 이 엔드포인트는 지오메트리가 아니라 "구역별 매물/피드 개수 배지" 용도. |
| 프론트 소비처 | **없음.** `main.py:134`에 `app.include_router(map.router, prefix="/api")`로 등록되어 라이브 상태지만, `frontend/src/api/map.ts` 자체가 **존재하지 않는다**(파일 없음, grep으로 `fetchDistrictCounts` 사용처 0건 확인). `frontend-page-map.md:71`이 이 함수를 NeighborhoodMap 연결 API로 언급하지만 **현재 코드와 불일치(문서 stale)**. `showDistrictBadges` state(`NeighborhoodMap.tsx:284`)는 존재하나 이 엔드포인트에서 데이터를 받아오는 fetch 호출이 없음(게이팅 플래그로만 소비). |
| 별개의 유사 엔드포인트 | `GET /quests/district-counts` — `backend/app/routers/quests.py:346-362` `get_district_quest_counts()`, 프론트 `api/quests.ts:245-250` `fetchDistrictQuestCounts()`(퀘스트 도메인, 지도 화면과 무관하지만 같은 "district-counts" 이름 패턴). |

### 1.3 장소제보 (Place Suggestion)

| 항목 | 내용 |
|---|---|
| 앱 제출 엔드포인트 | `POST /api/biz/place-suggestions` — `backend/app/routers/biz.py:696-717` `create_place_suggestion()`. **비즈니스 파트너 라우터(`biz.py`, prefix `/biz`) 안에 위치** — 장소제보 자체는 biz 파트너 신청과 무관한데 파일이 섞여 있음. |
| 앱 조회 엔드포인트 | `GET /api/biz/place-suggestions/mine` — `biz.py:721-736` `list_my_place_suggestions()`. |
| 관리자 조회/승인/반려 | `admin_legacy.py:3572-3623` `admin_place_suggestions()`(Jinja HTML 목록), `:3627-3641` `admin_place_suggestion_confirm()`, `:3645-3661` `admin_place_suggestion_reject()`. 모두 `verify_admin_session`(구 세션) 기반, HTML 폼 액션. |
| 데이터 모델 | `PlaceSubmission` — `models.py:1210-1229`, 테이블 `place_submission`(init/122). docstring: "gas_station_submission 패턴 미러 — **승인은 상태 전환만, business_profile 자동 upsert는 이번 범위 아님**." → **승인해도 지도/Poi/BusinessProfile 어디에도 실제로 반영되지 않는 막다른 워크플로우**(아래 §2 강결합/갭 참조). |
| 카테고리 재사용 | 프론트 `PlaceSuggestSheet.tsx:8,42` — 카테고리 목록을 `fetchBizCategories()`(비즈 파트너 카테고리, `api/biz.ts`)로 가져옴. 즉 장소제보는 `PoiCategory`도 자체 카테고리도 아니라 **`BusinessCategory`를 재사용**. |
| 프론트 컴포넌트 | `frontend/src/pages/map/PlaceSuggestSheet.tsx`(전체) — 동네지도(`NeighborhoodMap.tsx:25` import) + 동네지도 프로필(`NeighborhoodProfile.tsx`) 공용 바텀시트. |
| 2차 이식 목록 상 위치 | `current.md:172` — "제보심사 3종(gas-submissions·repair-submissions·**place-suggestions**)" 미이식 명시. |

### 1.4 주변정보 (주유소 / 정비소)

| 항목 | 내용 |
|---|---|
| 주유소 조회 | `GET /api/info/gas/nearby` — `info_gas.py:89-170` `get_nearby_gas_stations()`(v1, GP 적립 이벤트 포함, `radius_km` PostGIS `ST_DWithin`+대기시간/가격 조인). `GET /api/info/gas/stations/nearby-v2` — `info_gas.py:252-308` `get_nearby_v2()`(브랜드별 참고가 포함 v2). |
| 정비소 조회 | `GET /api/info/repair/nearby` — `info_repair.py:58-122` `get_nearby_repair_shops()`. 리뷰/평점 조인(`repair_shop_stats`, `repair_review`). |
| 사용자 제보 | `GasStationSubmission`(`models.py:1184-1207`, 테이블 `gas_station_submission`), `RepairShopSubmission`(`models.py:1311~`, 테이블 `repair_shop_submission`) — 둘 다 "confirm 시에만 canonical 테이블로 upsert" 패턴. |
| 관리자 승인/반려 | `admin_legacy.py:3387-3417` `admin_gas_submission_confirm()`(승인 시 **`GasStation` row 실제 생성** — place_submission과 달리 canonical 테이블에 반영됨), `:3421-3437` reject. `:3509-3537` `admin_repair_submission_confirm()`(패턴 동일 추정 — RepairShop 생성), `:3541-3557` reject. |
| 데이터 모델(canonical) | `GasStation`(`models.py:1161-1181`, 테이블 `gas_station`, `source_type`(OSM/USER_REPORTED), 좌표+PostGIS geom), `RepairShop`(`models.py:1289-1308`, 테이블 `repair_shop`). **admin이 직접 CRUD로 신규/수정하는 경로가 없음** — OSM 일괄 임포트(`backend/scripts/osm_import.py` `_import_gas`/`_import_repair`) 또는 사용자 제보 승인 경유만 존재. |
| 프론트 컴포넌트 | `components/gas/GasStationMarker.tsx`, `GasStationSheet.tsx`, `components/repair/RepairShopSheet.tsx`, `pages/info/InfoGasList.tsx`, `InfoRepairList.tsx` — **동네지도(`NeighborhoodMap.tsx`)가 아니라 `InfoHub`(`/info/gas`, `/info/repair`) 하위 화면**에서 소비. `SaigonDistrictMap.tsx`(§1.2 ①) 위에 마커로 렌더. |
| 2차 이식 목록 상 위치 | `current.md:172` — "제보심사 3종(gas-submissions·repair-submissions·place-suggestions)" 미이식. |

### 1.5 인접 도메인 (과제 4개엔 없지만 강결합 확인된 것)

| 도메인 | 관계 |
|---|---|
| 비즈니스 파트너(`biz.py`, SGR-312) | `BusinessProfile`/`BusinessMapItemOut`(`schemas.py:1383-1391`) — `GET /biz/public/map`으로 동네지도 "업체" 탭 핀 제공(`fetchBizMapItems`, `NeighborhoodMap.tsx:14,589`). **장소제보(`create_place_suggestion`)가 물리적으로 이 파일 안에 있고, place-suggestion 카테고리도 이 도메인의 `BusinessCategory`를 재사용** — 즉 도메인3은 사실상 "비즈니스 파트너 라우터에 얹혀사는" 상태. |

---

## 2. 강결합 지점 지도 (Coupling Map)

### (a) 백엔드 — 라우터 산개 + 교차 도메인 오염

1. **장소제보가 독립 라우터 없이 `biz.py`에 종속** — `create_place_suggestion`/`list_my_place_suggestions`(biz.py:696-736)는 "비즈니스 파트너" 도메인 라우터 안에 있다. 장소제보는 개념적으로 지도 도메인이지 비즈파트너 신청 플로우가 아니다. → **모듈화 시 `map` 모듈 소유 라우터로 물리 이동, `biz.py`에서 카테고리 재사용은 명시적 cross-module import(또는 공용 taxonomy 서비스)로 전환**.
2. **`get_district_counts`(map.py:12-74)가 District/Ward 지오메트리 API를 표방하면서 실제로는 `MarketplaceListing`/`FeedPost`를 조인** — 지도 모듈이 마켓·피드 테이블에 SELECT 의존을 갖는 구조. 게다가 **프론트 소비처가 없어(§1.2) 죽어있는 채로 결합만 유지**하는 상태. → 모듈화 시 (i) 폐기하거나 (ii) "구역별 도메인 카운트"를 map 모듈이 아니라 각 도메인(market/feed)이 자신의 카운트를 노출하고 map 모듈은 순수 지오메트리만 갖는 방향으로 재정의해야 함.
3. **`find_district_by_point`(utils.py:267-282)가 공용 `utils.py`에 있고 호출부가 코드그래프상 확인 안 됨** — 지도 도메인 함수가 전역 유틸에 얹혀 있어 소유권이 불명확. → map 모듈의 `repository`/`service`로 이관, 실제 호출부 존재 여부를 구현 단계에서 확인 필요(§7).
4. **주유/정비 제보 승인(admin_legacy.py:3387-3557)과 장소제보 승인(admin_legacy.py:3572-3661)이 코드 패턴은 거의 동일(PENDING→CONFIRMED/REJECTED, `review_note`, `reviewed_at`)한데 동작이 다름** — gas/repair는 canonical 테이블에 실제 upsert, place_submission은 상태만 바뀌고 아무 데도 반영 안 됨(모델 docstring이 이를 "범위 아님"이라 명시). → 사용자 관점에서 "장소 제안이 승인됐는데 지도에 안 뜬다"는 실제 갭. 모듈화 설계 시 이 3개를 동일한 `SubmissionReviewBase` 패턴으로 통일할지, 아니면 place만 다른 흐름(Poi 승격 파이프라인 신설)으로 갈지 **결정 필요**(§7).
5. **3종 제보 관리 화면이 전부 Jinja 서버렌더(`_render_page`, HTML 폼 액션)** — 새 admin SPA의 JSON API 계약이 전무. `admin_api/` 디렉터리(auth/cms/dashboard/listings/reports/support/users/audit_logs)에 map 관련 모듈이 하나도 없음(디렉터리 목록 확인). POI도 동일(`/admin-legacy/poi/bulk` 하나뿐, 심지어 조회 UI조차 없음).

### (b) 프론트 `NeighborhoodMap.tsx` (1,893줄) — 무엇을 다 떠안고 있나

`grep`으로 확인한 최상위 `useState` 40+개, `useEffect` 19개, `useCallback` 14개가 한 컴포넌트에 몰려 있다. 뒤섞인 관심사:

- **데이터 페칭 오케스트레이션**: `fetchListings`/`fetchAds`(market)/`fetchFeed`(feed)/`fetchBizMapItems`(biz)/`fetchPoiMapItems`(poi) — 5개 도메인 API를 이 컴포넌트가 직접 호출·병합·탭별 분기(줄 78, 409-416, 497, 559, 589-609, 1121 등).
- **지도 렌더 상태**: viewport bbox, 줌 게이트(L2_VBW/L3_VBW), ward 추적(`findWardAt`), region 선택(비활성화됐지만 로직 보존) — `SaigonMapV5`에는 순수 렌더만 위임했지만 **게이트 판정·bbox 커밋 로직은 이 파일에 있음**.
- **검색**: 자체 검색창 상태(`searchQuery`/`submittedQuery`/`searchResults`/`bizSearchResults`/`recentSearches`) + 탭 스코프 분기.
- **바텀시트/드래그**: `sheetSnap`/`sheetVisibleHeight`/`lockedPanelHeight`.
- **포스트 패널(캐러셀)**: `postPanelOpen`/`carouselItems`/`carouselIndex`/`postPanelHeight`.
- **찜(favorites)**: `favOnly`/`favIds`.
- **리뷰 작성 플로우**: `reviewTarget`/`reviewPickerItems`.
- **장소제안**: `placeSheet`/`placePinMode`.
- **프로필 카드**: `profileCardUserId`.
- **광고**: `ads`/`adLimit`.

→ **모듈화 시 분해 방향**: `features/map/` 하위에 (i) `hooks/useMapMarkers.ts`(listings/ads/feed/biz/poi fetch 통합, 도메인별 API는 각 `api/*.ts` 그대로 재사용), (ii) `hooks/useMapSearch.ts`, (iii) `hooks/usePostPanel.ts`, (iv) `components/MapSheet.tsx`(드래그 시트 자체), (v) `NeighborhoodMap.tsx`는 이들을 조립하는 얇은 컨테이너로 축소. **비즈/찜/리뷰는 이미 `api/biz.ts`로 분리돼 있어 map 모듈이 아니라 biz 모듈 소유로 유지**(cross-module 호출만 명확히).

### (c) 데이터가 코드에 박힌 지점 — 재정리

| 지점 | 상태 | 모듈화 시 행선지 |
|---|---|---|
| `district-data.ts`(HCMC_DISTRICTS 29개, SVG) | 주변정보(도메인4) 전용, 활성 사용 중 | 도메인4가 소유하는 static geometry로 유지하되, "동네지도"와 별개 자산임을 명확히 문서화(현재 frontend-page-map.md가 혼동 소지 있음) |
| `districtPaths.ts` + `pages/home/DistrictMap.tsx` | **데드코드로 보임**(임포터 0) | 모듈화 착수 전 삭제 여부 확인 권장(§7) — 단, 이번 범위파악에서는 삭제하지 않음(surgical 원칙) |
| `v2/saigon-depth1.json` + `v2/region.ts` | 동네지도(도메인2) 실사용 지오메트리 | `features/map/geometry/`로 이관 |
| `districts.boundary`(PostGIS, DB init SQL 하드코딩) | 호출부 미확인, RP/미션 추정 | map 모듈 repository로 소유권 이전 + 실제 호출부 확인 |

---

## 3. A(논리적 모듈화) 목표 구조 초안

### 3.1 백엔드 (`backend/app/`)

레포 관례: 현재 `routers/*.py`가 평평하게 나열되고(`poi.py`, `map.py`, `info_gas.py`, `info_repair.py`, `biz.py` 등), `admin_api/`만 유일하게 서브패키지 구조(`__init__.py`가 router들을 모아 include)를 쓴다. Engine 쪽(`ai-docs/context/architecture.md` §3.3)은 `routers/`+`services/`+`adapters/` 3분리 관례를 쓰지만 **이건 별도 서비스(Engine)의 관례이며 BFF에 그대로 이식할 근거는 약하다** — BFF는 지금까지 서비스 레이어 없이 라우터에 쿼리를 직접 쓰는 스타일이 지배적(포함된 모든 코드 스니펫이 라우터 함수 안에 SQLAlchemy `select`를 직접 작성).

**제안 — BFF 기존 관례를 최대한 따르되, 파일을 도메인별로 분리(패키지화는 최소 침습 옵션 A만 채택)**:

```
backend/app/routers/map/                 ← 신규 패키지 (기존 admin_api/ 패턴 미러)
├── __init__.py                          ← router들을 모아 main.py에 단일 include
├── poi.py                                ← 기존 routers/poi.py 이동 (get_public_map)
├── districts.py                          ← 기존 routers/map.py 이동 (get_district_counts) — 이름 충돌 회피
├── place_suggestions.py                  ← biz.py에서 create_place_suggestion/list_my_place_suggestions 이관
└── (info_gas.py, info_repair.py는 그대로 유지 — 아래 §7 결정 필요)
```

- **`info_gas.py`/`info_repair.py`를 이 패키지에 넣을지는 결정 사항**(§7) — "주변정보"가 개념적으로 지도 도메인이지만, 현재 물리적으로 `InfoHub`(게임허브 메뉴)에 속해 있고 자체 SaigonDistrictMap을 쓴다. 무리하게 합치면 오히려 결합이 늘어날 수 있음.
- **서비스 레이어는 새로 만들지 않는다** — 기존 코드가 라우터에 쿼리를 직접 쓰는 스타일이므로, Karpathy 원칙(요청 이상 기능 추가 금지)에 따라 이번 모듈화에서 `services/`/`repository/` 추상화를 강제하지 않는다. 다만 `find_district_by_point`는 `utils.py`(공용 유틸)에서 `routers/map/districts.py`(또는 신설 `routers/map/_geo.py`)로 옮겨 소유권을 명확히 한다.
- `PlaceSubmission`/`Poi`/`PoiCategory`/`GasStation*`/`RepairShop*`/`District`/`Ward` 모델은 `models.py`(단일 파일, 현재 관례)에 그대로 둔다 — 레포가 모델을 도메인별로 쪼개는 관례가 없으므로 새로 만들지 않는다.
- **`admin_api/map.py`** (또는 `admin_api/poi.py` + `admin_api/place_suggestions.py` + `admin_api/gas_repair.py`로 세분) 신설 — 기존 `admin_api/listings.py` 패턴(라우터+Pydantic 응답모델+`_audit.audit()`+`verify_admin_api`) 그대로 미러.

### 3.2 프론트 (`frontend/src/`)

레포에 아직 `features/` 디렉터리 관례가 없다(전부 `pages/`+`components/`+`api/` 평면 구조). **`features/map/`을 새로 만드는 것은 레포 전체 관례에서 벗어나는 결정**이므로, 근거를 명확히 해야 한다: 이유는 `NeighborhoodMap.tsx` 한 파일이 1,893줄로 과도하게 크고, `hooks/`가 전역 공용(`useKeyboard`, `useBizViewerCount`)과 화면전용이 섞이기 시작했기 때문. **제안**:

```
frontend/src/pages/map/                   ← 기존 유지 (라우트 진입점, 레포 관례 그대로)
├── NeighborhoodMap.tsx                   ← 컨테이너로 축소(조립만)
├── NeighborhoodMap.module.css
├── hooks/                                ← 신규 — 이 화면 전용 훅만 (전역 hooks/ 오염 방지)
│   ├── useMapMarkers.ts                  ← listings/ads/feed/biz/poi fetch 통합 오케스트레이션
│   ├── useMapSearch.ts
│   └── usePostPanelCarousel.ts
├── NeighborhoodCategories.tsx            ← 기존 유지
├── NeighborhoodProfile.tsx                ← 기존 유지
└── PlaceSuggestSheet.tsx                 ← 기존 유지(이미 잘 분리된 재사용 컴포넌트)
```

- `components/maps/`(SaigonMapV5, district-data.ts, v2/ 등)는 **그대로 유지** — 이미 지도 렌더 전용으로 잘 분리돼 있다. 새로 옮기면 오히려 "SaigonMapV5를 쓰는 다른 화면"(InfoMap 계열은 SaigonDistrictMap을 쓰므로 실제로 안 겹침, 확인됨)과의 혼선 위험만 늘어난다.
- `api/poi.ts`, `api/biz.ts`(place-suggestion 함수 포함) — **그대로 유지**, `pages/map/`이 그냥 import해서 쓰면 됨. `features/`로 강제 이동할 필요 없음(레포 관례 위반 대비 이득이 적음).
- **결론: 레포 관례상 완전한 `features/map/` 신설보다, `pages/map/hooks/`로 국지적 분해가 더 낮은 리스크로 같은 효과를 낸다.** "물리 서비스 승격 대비 경계"는 API 계약(§4)으로 충분히 확보되고, 디렉터리 이름이 `features/`냐 `pages/`냐는 그 경계에 영향 없음.

---

## 4. API 계약 초안

### 4.1 앱 조회용 API (현행 유지 + 개선)

| 엔드포인트 | 변경 |
|---|---|
| `GET /api/poi/public/map` | 유지. |
| `GET /api/biz/place-suggestions`, `.../mine` | **경로만 `POST /api/map/place-suggestions`, `GET /api/map/place-suggestions/mine`로 이동**(3.1 이관 반영). 프론트 `api/biz.ts`의 관련 함수를 `api/map.ts`(신규, 현재 존재하지 않는 이름을 재사용해도 무방 — 기존 죽은 참조와 겹치지 않게 함수명 주의)로 옮김. |
| `GET /api/info/gas/nearby`, `/stations/nearby-v2`, `GET /api/info/repair/nearby` | 유지(§7 결정 전까지 map 모듈 편입 보류). |
| `GET /district-counts` | **폐기 검토 대상** — 현재 무사용. 유지한다면 프론트 소비처를 실제로 연결하거나, 폐기해서 market/feed 의존을 끊는다(§6). |

### 4.2 관리자 CRUD API 신설 초안 (`/admin/api/map/*`)

인증은 기존 관례 그대로: `verify_admin_api`(`admin_auth.py`, JWT httpOnly 쿠키 `admin_session`) — `admin_api/listings.py` 패턴 미러.

| 도메인 | 메서드/경로 | 설명 | 권한 |
|---|---|---|---|
| POI | `GET /admin/api/map/poi?category=&q=&page=` | 목록 조회(현재 전무) | admin |
| POI | `GET /admin/api/map/poi/{id}` | 단건 조회 | admin |
| POI | `POST /admin/api/map/poi` | 단건 생성(현재 bulk만 존재) | admin |
| POI | `PUT /admin/api/map/poi/{id}` | 수정(`published`/명칭/좌표/카테고리) | admin |
| POI | `DELETE /admin/api/map/poi/{id}` 또는 `PUT .../unpublish` | 게시 해제(소프트) | admin |
| POI | `POST /admin/api/map/poi/bulk` | 기존 `/admin-legacy/poi/bulk` 승격(요청/응답 스키마 `POIBulkRequest`/`POIBulkResult` 그대로 재사용, `schemas.py:1409-1431`) | admin (또는 별도 서비스 계정 — 기존이 "에이전트/스크립트 전용"이었으므로 사람 UI 노출 여부는 §7 결정) |
| POI 카테고리 | `GET/POST/PUT /admin/api/map/poi-categories` | 현재 전무(seed만 존재) — 신규 | admin |
| 장소제보 | `GET /admin/api/map/place-suggestions?status=` | `admin_place_suggestions` JSON화 | admin |
| 장소제보 | `POST /admin/api/map/place-suggestions/{id}/confirm` | 상태 전환. **승인 시 Poi 자동 생성 여부는 §7 결정 필요** — 결정 전까지는 현행 그대로(상태만 전환) | admin |
| 장소제보 | `POST /admin/api/map/place-suggestions/{id}/reject` | `review_note` 필수 | admin |
| 주유소 제보 | `GET/POST(confirm/reject) /admin/api/map/gas-submissions` | `admin_gas_submission_confirm/reject` JSON화(canonical upsert 로직 그대로 이관) | admin |
| 정비소 제보 | `GET/POST(confirm/reject) /admin/api/map/repair-submissions` | 동일 패턴 | admin |
| District/Ward 지오메트리 | (신규, §7 결정 시) `GET/PUT /admin/api/map/districts/{code}/boundary` | **§7에서 "하드코딩→DB 이관"이 승인될 때만** 신설 | admin |

모든 신규 라우터는 `admin_api/map/` 서브패키지(3.1 구조 미러)로 만들고 `admin_api/__init__.py`의 `include_router` 목록에 등록.

---

## 5. 관리자 콘솔 화면 요구 초안 (`admin-frontend/`)

기존 패턴 미러(`admin-frontend/src/pages/listings/ListingListPage.tsx` + `ListingDetailPage.tsx`, `admin-frontend/src/api/listings.ts`):

```
admin-frontend/src/pages/map/
├── PoiListPage.tsx            ← 목록(검색/카테고리 필터) + 신규/수정 폼(단건)
├── PoiBulkPage.tsx             ← 기존 bulk upsert API 노출(선택 — 사람이 직접 쓸지 §7 결정)
├── PlaceSuggestionListPage.tsx ← PENDING 우선 정렬, 승인/반려(사유 필수)
├── GasSubmissionListPage.tsx
└── RepairSubmissionListPage.tsx
admin-frontend/src/api/map.ts    ← 위 5개 화면이 쓰는 fetch 함수 모음
```

- **`current.md`(2차 이식 잔여 목록)에 이미 "POI"·"제보심사 3종(gas-submissions·repair-submissions·place-suggestions)"이 올라와 있다** — 이번 모듈화 작업이 사실상 그 이식 작업과 동일 대상이다. 별개 태스크로 중복 진행하지 않도록, 이 문서를 해당 2차 이식 작업의 설계 근거로 사용할 것을 권장.
- District 지오메트리 관리 화면은 §7 결정(하드코딩 유지 vs DB 이관) 이후에만 착수.

---

## 6. 단계적 구현 개요 (②구현 단계 입력용)

| # | 작업 | 위험도 | 검증 방법 | DB 마이그레이션 |
|---|---|---|---|---|
| 1 | `biz.py`의 `create_place_suggestion`/`list_my_place_suggestions`를 신규 `routers/map/place_suggestions.py`로 이동, `main.py` include 갱신 | 낮음(경로 불변 유지 시) — 단 프론트가 `/api/biz/place-suggestions`를 호출 중이므로 **경로를 바꾸면 프론트도 동시 수정 필요** | 기존 회귀 하네스(`tools/qm/regr-map.mjs` 등)로 장소제안 제출 플로우 확인 | 불필요 |
| 2 | `admin_api/map/` 서브패키지 신설 + POI 목록/단건 CRUD + place/gas/repair 제보 JSON API(legacy 로직 이관, Jinja 응답만 JSON으로 교체) | 중간(admin_legacy 병행 운영 중 — 기존 Jinja 라우트는 손대지 않고 신규만 추가) | 신규 API에 대해 `admin-frontend` 개발 전 curl/httpie로 契約 검증 | 불필요 |
| 3 | `admin-frontend/src/pages/map/` 5개 화면 구현(§5) | 중간(신규 화면 — UI/UX 품질 판단 필요, Fable 권장) | qm-reviewer 검토 + 실제 admin 로그인 후 CRUD 왕복 테스트 | 불필요 |
| 4 | `NeighborhoodMap.tsx` 내부를 `hooks/useMapMarkers.ts` 등으로 분해(§3.2) — **순수 리팩토링, 동작 불변** | 높음(1,893줄 핵심 화면 — 회귀 위험 큼) | 리팩토링 전/후 `tools/qm/regr-map.mjs`·`regr-biz-return.mjs` 등 기존 회귀 하네스 전건 PASS 비교 | 불필요 |
| 5 | `GET /district-counts` 처리 — §7 결정에 따라 폐기 또는 프론트 재연결 | 낮음(현재 무사용이라 폐기해도 회귀 없음) | 폐기 시 `grep`으로 재확인 후 라우터 제거, 재연결 시 신규 fetch 추가 후 배지 렌더 확인 | 불필요 |
| 6 | (§7에서 "district 하드코딩→DB 이관" 승인되는 경우만) `saigon-depth1.json`/`districts.boundary`를 단일 소스로 통합 | **높음** — 동네지도 핵심 지오메트리 교체, LOD/줌게이트 로직 전체 영향 | 시각회귀 전건 + GPS 컨텍스트 4종×30케이스 명세(`TEST/map_test_scenarios.md`) 재실행 | **필요** — `districts.boundary`를 GeoJSON 소스로 갱신하거나, 반대로 `saigon-depth1.json`을 DB로 이관하는 신규 마이그레이션(§7 방향에 따라 스키마 확정 후) |
| 7 | (§7에서 "장소제보 승인 시 Poi 자동 생성" 승인되는 경우만) `PlaceSubmission` confirm 로직에 `Poi` upsert 추가 | 중간 — 기존 "범위 아님" 결정을 뒤집는 것이므로 제품 결정 우선 | 승인 플로우 E2E: 제출→승인→`GET /poi/public/map`에 노출 확인 | **불필요**(기존 테이블 재사용, 컬럼 추가 없음 — 단 category 매핑 규칙은 필요, `PlaceSubmission.category`가 `BusinessCategory` 코드이고 `Poi.category`는 `PoiCategory` 코드라 **직접 매핑 불가** — 매핑 테이블 또는 코드 변환 로직 필요) |
| 8 | `pages/home/DistrictMap.tsx`+`districtPaths.ts` 데드코드 삭제 여부 확정 후 삭제 | 낮음(임포터 0 확인됨) | 삭제 후 `npx eslint`+`tsc` 빌드 통과 확인 | 불필요 |

**정렬 원칙**: 1→2→3은 서로 독립적으로 순차 진행 가능(관리자 CRUD 신설이 가장 우선순위 높음 — 사용자 요구사항의 핵심). 4(프론트 리팩토링)는 언제든 병행 가능하나 회귀 위험이 가장 크므로 마지막에 단독 세션으로 진행 권장. 6·7은 §7 결정 없이는 착수 불가.

---

## 7. 미해결 질문 / 결정 필요 사항

1. **District/Ward 지오메트리를 어디에 둘 것인가** — 현재 3개 프론트 하드코딩(그중 1개는 데드코드로 추정) + 1개 DB 컬럼(호출부 미확인)이 서로 다른 경계·다른 정밀도로 존재한다. (a) 현행대로 프론트 정적 자산 유지(모듈 경계만 명확히) vs (b) 관리자가 폴리곤을 수정할 수 있어야 하는 요구가 실제로 있는지(현재 태스크 지시문의 "관리자가 지도 데이터를 입력·조회·수정"이 폴리곤까지 포함하는지, 아니면 POI/제보 3종만 의미하는지 확인 필요).
2. **`districts.boundary`(PostGIS)의 실제 호출부** — 코드그래프 조회로 `find_district_by_point` 호출자가 0건으로 나왔다. 죽은 함수인지, 그래프 인덱싱이 놓친 간접 호출(예: 문자열 기반 동적 호출, 다른 세션 이후 변경분 미반영)인지 재확인 필요.
3. **`GET /district-counts`(map.py) 폐기 여부** — 현재 프론트 호출자가 전무. 폐기해도 안전한지, 아니면 원래 의도(구역별 매물/피드 배지)를 살려 재연결할지.
4. **장소제보 승인 시 자동 승격 여부** — `PlaceSubmission` 승인이 현재 아무 데도 반영 안 되는 막다른 흐름이다. (a) 승인 시 `Poi`로 자동 승격(카테고리 매핑 규칙 신규 필요, §6 항목7) vs (b) 승인은 "제보자에게 알림/기록"용일 뿐이고 실제 Poi 등록은 관리자가 별도로 POI 관리 화면에서 수동 입력하는 2단계 프로세스로 남길지.
5. **주변정보(주유소/정비소)를 정말 같은 "동네지도 모듈"에 둘 것인가** — 현재 물리적으로 게임허브 메뉴(`InfoHub`, `/info/gas`, `/info/repair`)에 속하고, `SaigonDistrictMap`(구 지도 컴포넌트)을 쓰며 `NeighborhoodMap.tsx`와는 완전히 분리된 화면 계층이다. 사용자 지시문은 4개 도메인 전부를 "동네지도 기능"으로 명시했지만, 코드 실태는 이미 분리돼 있다 — 억지로 합치면 오히려 InfoHub 도메인과 결합만 늘어날 수 있다. **한 API 계약 우산(`/admin/api/map/*`) 아래 관리자 CRUD만 통합하고, 프론트 소비 화면은 그대로 분리 유지**하는 절충안을 제안하되 최종 확정 필요.
6. **`pages/home/DistrictMap.tsx` + `districtPaths.ts` 삭제 여부** — 임포터 0건으로 데드코드로 보이나, 100% 확신을 위해 git blame/최근 커밋 의도 확인 또는 팀 컨펌 권장(surgical 원칙상 이번 세션에서 임의 삭제하지 않음).
7. **POI bulk upsert(`/admin/api/map/poi/bulk`)를 사람이 쓰는 admin UI로 노출할지** — 원래 docstring이 "에이전트/스크립트가... 등록"이라 명시했다. 사람용 단건 CRUD(§4.2, §5)만 새로 만들고 bulk는 계속 스크립트 전용(OpenAPI 비노출)으로 남길지, 아니면 admin UI에도 CSV/JSON 붙여넣기 형태로 노출할지.
