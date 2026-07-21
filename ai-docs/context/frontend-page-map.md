# 프론트엔드 페이지-메뉴-컴포넌트 맵

> **목적**: "동네지도에 어떤 기능개선이 필요해?" 처럼 **한글 메뉴명 기준**으로 질문받았을 때, 바로 해당 라우트·페이지 파일·핵심 컴포넌트를 찾아가기 위한 진입점 색인.
>
> **먼저 ADR부터 확인**: 대부분의 질문은 이 문서 전체를 읽지 않고도 `mcp__codebase-memory__manage_adr(mode: "get", project: "mnt-c-DEV-saigon_rider")` 압축 요약 한 번으로 답이 된다(메뉴 구조·SoT 위치·알려진 갭). 이 문서는 ADR에서 다루지 않는 **서브라우트/컴포넌트 세부 나열**이 필요할 때만 펼쳐 보는 상세 참조다. 메뉴/라우트 구조를 바꾸면 ADR과 이 문서를 함께 갱신한다.
>
> **이 문서 vs codebase-memory MCP**: 이 문서는 "메뉴명 → 코드 위치"의 **얕은 정적 지도**다. 실제 호출관계·데이터 흐름(어떤 API/스토어/네이티브 함수를 부르는지, 변경 시 영향 범위)은 매번 최신 상태로 바뀌므로 여기 박제하지 않는다. 아래에서 찾은 파일/컴포넌트명을 `codebase-memory` MCP(`project: mnt-c-DEV-saigon_rider`)의 `search_graph`/`trace_path`/`get_architecture`에 넣어 **살아있는 그래프**로 조회한다 (사용법은 문서 하단 [MCP로 더 깊이 파기](#mcp로-더-깊이-파기) 참조, 상세 도구 규칙은 [`agent-guidelines.md`](../agent-guidelines.md) §9).
>
> 라우트 정의 SoT: `frontend/src/App.tsx`. 한글 라벨 SoT: `frontend/src/locales/ko/translation.json`.

---

## 1. 탭바 (하단 메인 5메뉴) — `components/layout/TabBar.tsx`

| 한글 메뉴 | 라우트 | 페이지 파일 | i18n 키 |
|---|---|---|---|
| 홈 | `/home` | `pages/home/WorldMapV2.tsx` | `tabbar.home` |
| 마켓 (= 동네마켓) | `/market` | `pages/market/MarketMain.tsx` | `tabbar.market` |
| 동네지도 | `/map` | `pages/map/NeighborhoodMap.tsx` | `tabbar.map` |
| 커뮤니티 (= 피드) | `/feed` | `pages/feed/FeedList.tsx` | `tabbar.community` |
| 프로필 | `/profile` | `pages/profile/ProfileMain.tsx` | `tabbar.profile` |

TabBar 노출 여부는 `AppShell.tsx`의 `HIDE_TABBAR_PATHS`가 제어(인증/라이딩결과/DM/마켓상세/퀘스트체크 화면 등에서 숨김).

## 2. 게임 허브 FAB (TabBar FAB → `GameHubSheet`) — 6메뉴

`components/layout/FloatingActionButton.tsx` → `components/game/GameHubSheet.tsx`(`HUBS` 배열)에서 정의.

| 한글 메뉴 | 라우트 | 페이지 파일 | 비고 |
|---|---|---|---|
| 개러지 | `/garage` | `pages/garage/Garage.tsx` | |
| 인벤토리 | `/inventory` | `pages/inventory/Inventory.tsx` | |
| 상점 | `/shop` | `pages/shop/ShopCatalog.tsx` | |
| 가챠 | `/gacha` | `pages/gacha/GachaMain.tsx` | |
| 시즌패스 | `/season` | `pages/season/SeasonPass.tsx` | **comingSoon: true** — 진입 시 안내 다이얼로그만 뜨고 실제 이동 안 함 |
| 정보 | `/info` | `pages/info/InfoHub.tsx` | |

## 3. 메뉴별 상세

### 3.1 홈 (`/home`)

- **페이지**: `pages/home/WorldMapV2.tsx` (구버전 `WorldMapV2` 이전의 `WorldMap.tsx`는 미사용 백업 — import 주석에 명시됨)
- **성격**: 원래 퀘스트/미션 중심이었으나(→ i18n `home.*`에 `startQuestBtn`/`todayMission`/`noRecommendedQuest` 등 잔존) 현재는 **마켓·커뮤니티·생활정보 대시보드**로 재편됨. `home.*` i18n 키 중 퀘스트 관련 키들은 현재 WorldMapV2에서 미사용 — 구버전 흔적.
- **핵심 하위 영역/컴포넌트**: 검색바 → `/market/search`, 내 주변 인기상품/최근 등록상품 카드 → `/market/:id`, `/market/ad/:id`, 안전거래 가이드 배너 → `/guide/safe-trade`, 정보 미니카드(날씨/침수/주유/정비) → `/info/*`, 커뮤니티 인기글 카드 → `/feed/post/:postId`(더보기는 `/feed?filter=hot`)
- **연결 API**: 마켓/피드/정보 관련 `api/market.ts`, `api/feed.ts`, `api/info*.ts` (추정 — 정확한 함수명은 MCP로 조회)

### 3.2 마켓 / 동네마켓 (`/market`)

- **페이지**: `pages/market/MarketMain.tsx`
- **하위 라우트**: `/market/search`(`MarketSearch.tsx`), `/market/ad/:id`(`AdDetail.tsx`), `/market/new`(`MarketCreate.tsx`), `/market/wishlist`(`MarketWishlist.tsx`), `/market/:id`(`MarketDetail.tsx`)
- **매물 등록 가드 변경 — 판매자 인증 (2026-07-16)**: `/market/new`는 기존 `PrivateRoute` 대신 신규 `VerifiedSellerRoute`(`components/auth/VerifiedSellerRoute.tsx`)로 래핑됨 — 로그인 상태여도 폰 미인증(`users.phone_verified_at IS NULL`) 유저는 `/auth/phone-verify`로 리다이렉트된다.
- **인증 배지 — 신뢰 신호 UI (2026-07-17)**: 홈 헤더(`WorldMapV2.tsx`)의 배지는 `user.phoneVerified` 조건부로 "휴대폰 인증" 표기. 매물 상세 판매자 정보 블록(`MarketDetail.tsx`)과 공개 프로필 카드(`components/ProfileCard.tsx` — 피드/팔로워·팔로잉 리스트/동네지도에서도 공용)에 `VerifiedBadge`(`components/ui/VerifiedBadge.tsx`) 노출. 백엔드 `SellerBrief`/`UserProfileOut`(`GET /users/{id}/profile`)의 `is_phone_verified`+`phone_masked`로 구동(마스킹은 `mask_phone()`, `backend/app/utils.py`). 배지 탭 시 마스킹 번호를 클라이언트에서 토글 표시(payload에 이미 포함, 추가 API 없음). 시각 개선(2026-07-17): 기존 텍스트 pill "✓ 인증" → **오렌지(`--brand-500`) 스칼럽 체크 아이콘 + '인증' 라벨**로 격상.
- **없음 이미지 플레이스홀더 (2026-07-17)**: 상품 등록 이미지 부재 시 로케일별 브랜드 플레이스홀더(`noItemImage()` — `assets/market/no_item_kr|vi|en.png`) 표시, 리스트 카드·상세 갤러리·다른 매물 카드에 적용.
- **핵심 컴포넌트**: `SaigonMapV2`, `ListingCard`(`pages/market/ListingCard.tsx`), `AdCard`(`pages/market/AdCard.tsx`), `StatusBar`, `BottomSheet`, `Chip`, `ScrollSentinel`
- **연결 API**: `api/market.ts` (`fetchListings`, `fetchAds` 등)

### 3.3 동네지도 (`/map`)

- **페이지**: `pages/map/NeighborhoodMap.tsx` — 상단 주석: "동네지도 v4 (SGR-287) — SaigonMapV4 풀스크린 + 하단 드래거블 시트. GPS 기준 동 자동 진입 → 전체 depth3 오버레이 → 블록 탭으로 구역 필터링." (주석은 v4 시절 남은 것, 실제 지도 컴포넌트는 `SaigonMapV5`로 전환됨 — 최근 커밋 `dd3c80b`)
- **시트 탭 3종 (SGR-315 P1, 2026-07-10; 순서/기본값 2026-07-12 변경)**: `listings`(매물, 주황 원형 핀)·`feed`(피드, 파랑 원형 핀)·`biz`(업체 — 2026-07-12 리디자인: **비선택 = 중립 회색 원형 아이콘**, **선택 시 당근식 teardrop 핀으로 승격**(오렌지 `#ff5a1f` 물방울+흰 홀+업종 글리프, 꼭짓점 앵커) + 꼭짓점 기준 **1.5x 확대**, `MapMarkerV2.kind='biz'` 분기+상호명 라벨 — `SaigonMapV5.tsx` biz 분기). **탭 노출 순서는 [업체, 피드, 매물], 기본 탭 = 업체**(2026-07-12, `NeighborhoodMap.tsx` 시트 헤더 `['biz','feed','listings']` 배열 순서). **세 탭 모두 배타 렌더**(현재 코드 기준 — T3 문서의 "업체 상시 제3 레이어" 결정은 미구현 상태, 줌 게이트 동일 준수). 업체 탭 활성 시 지도 상단 카테고리 칩(DB화 15종·4그룹, 아래 참조), 업체 카드 탭→`/biz/:id`, 업체 핀 탭→**포스트 패널**(아래 참조). 검색은 제출 시점 탭으로 스코프 고정(biz 탭=업체명 `q` 검색, 그 외=매물 검색).
- **핀 표출 줌 게이트 강화 (2026-07-12)**: 핀(매물·피드·업체 공통)이 뜨는 줌 임계값이 `L2_VBW`(블록 단계)에서 `L3_VBW`(건물 단계)로 조여짐(`SaigonMapV5.tsx` `onViewportChange`→`onDepthChange` 판정 `!l2`→`!l3`) — 이전보다 더 깊이 줌인해야 핀이 노출된다. 검색 결과 핀(`forceMarkers`)은 게이트 예외로 그대로 표시. 게이트 미통과 구간에서는 핀 데이터(`listings`/`posts`/`bizItems`)를 비우지만, 아래 ward 리스트는 별도로 유지된다.
- **지도-리스트 분리 (2026-07-12)**: 바텀시트 리스트는 더 이상 핀과 같은 뷰포트 bbox를 쓰지 않고, **지도 중심이 속한 ward(동)** 기준으로 조회한다(`SaigonMapV5`가 신규 export하는 `findWardAt(lat,lng)` — `saigon-depth1.json` 폴리곤+`regionContains`). ward가 바뀔 때만 리스트를 재조회하므로 같은 ward 안에서 지도를 팬해도 리스트는 그대로다. 핀은 기존처럼 뷰포트 bbox 소스를 유지 — 화면 안에서 핀과 리스트가 서로 다른 데이터 소스를 가리키는 구조. 지도 dot 탭 시 리스트 항목을 활성화·스크롤하던 동기화는 주석 처리로 제거됨.
- **지역선택(region 모드) 진입점 비활성화 (2026-07-12)**: `SaigonMapV5`의 `onRegionSelect` prop 배선과 리스트의 "구역 선택" 안내 가이드가 주석 처리됨(로직·핸들러 자체는 코드에 보존 — 부활 대비). ward 자동 추적 리스트가 사실상 그 역할을 대체한다.
- **좌측 플로팅 버튼 3종 (2026-07-12, `7eff692`; 위치 로직 2026-07-12 2차 배치)**: 내 위치(GPS 측정) / ♥ **찜 업체만 보기 토글**(`favOnly` — ON 시 biz 탭 자동 전환, `fetchBizFavorites` 교집합, 칩 필터와 AND, 비로그인 토스트) / + **글쓰기 팝오버**(장소 제안=`/map/profile?openPlaceForm=1` 원샷 쿼리로 기존 시트 재사용, 후기쓰기=업체 후기 — 2026-07-12 신규 도메인 배선). **위치**: 기본은 시트 상단에서 14px 띄운 위치(`sheetVisibleHeight + 14`, 드래그 연동), 포스트 패널(팝업 카드)이 열리면 카드 높이 기준(`postPanelHeight + 14`)으로 전환해 카드를 따라가고, 시트가 `full`로 풀업되면 숨김.
- **지도보기 필 재배치 (2026-07-12 2차 배치)**: 시트 안 `floatingTopCenter` 슬롯 사용을 그만두고, `NeighborhoodMap.tsx`가 시트 바깥 형제 엘리먼트로 직접 렌더하는 하단 중앙 floating 버튼으로 전환(노출 조건 `sheetSnap==='full' && !isSearching && !postPanelOpen`, 탭바 바로 위). 필이 시트 밖으로 빠지며 확보된 여백만큼 시트 `maxHeight`를 65vh→72vh로 확장, 리스트 컨테이너에 하단 패딩(`listPillPad`) 추가.
- **바텀시트 리스트 상단 ward 지역 제목 (2026-07-12 2차 배치)**: `t('map.wardTitle.{listings|feed|biz}', { area })` — `area`는 지도 중심이 속한 `centerWard.region.name`(ward 폴리곤의 베트남어 원문 지명), 탭별로 다른 문구(ko: `{{area}} 이웃들이 등록한 상품이에요` / `...의 소식이에요` / `...지역의 가게들을 만나보세요`, en/vi 3벌). 헤더의 'N건' 카운트와 별개로 리스트 최상단에 병존하며, 검색 중이거나 `centerWard`가 없으면(region 모드·커버리지 밖) 숨김.
- **업체 상세 뒤로가기 상태 복원 — 오버레이 전환으로 비활성 (2026-07-12)**: sessionStorage `sgr.map.bizReturn` 저장/복원 로직(`saveBizReturnSnapshot`/`pendingUiRestoreRef`/`readBizReturnSnapshot` 등)은 전부 주석 처리로 비활성화됨 — 상세 진입이 아래 "상세 3종 전체화면 오버레이" 방식으로 바뀌어 지도가 언마운트되지 않으므로 스냅샷 복원 자체가 불필요해졌다. 과거 세션이 남긴 키를 지우는 `sessionStorage.removeItem(BIZ_RETURN_KEY)` 정리 이펙트만 유지. 회귀 하네스 `tools/qm/regr-biz-return.mjs`는 오버레이 검증(아래 참조)으로 재작성됨.
- **동네지도 → 상세 3종(업체/매물/피드) 전체화면 오버레이 (2026-07-12 2차 배치)**: `App.tsx`에 신규 `BackgroundRoutes` 컴포넌트 — `navigate(path, { state: { backgroundLocation } })`로 진입하면 배경 `<Routes>`는 `backgroundLocation`(지도)으로 그대로 렌더되고, 실제 목적지(`/biz/:id`/`/market/:id`/`/feed/post/:postId`)는 `App.module.css` `.detailOverlay`(전체화면 absolute, z-index 30)로 그 위에 얹힌다. `NeighborhoodMap.tsx`의 지도 내 상세 진입 지점 전부(업체 말풍선·업체 카드·매물 카드 2곳(검색 결과/리스트)·포스트 패널 카드 3분기(업체/매물/피드) — `navigate()` 호출 7곳)가 `backgroundLocation` state를 싣는다. 뒤로가기는 오버레이만 닫고 지도는 언마운트되지 않아 탭·칩·찜필터·포스트패널·선택핀 상태가 그대로 유지된다. 마켓 리스트·커뮤니티 등 지도 바깥에서의 기존 상세 진입은 `backgroundLocation`을 싣지 않아 그대로 페이지 이동.
- **`SaigonMapV5` 렌더 완성도 (2026-07-12 2차 배치, 마커·LOD·콜백 시그니처는 불변)**: 도로 케이싱 2-pass(케이싱 폴리라인 전체→fill 폴리라인 전체 순서로 그려 교차점 자연 병합 — **2026-07-20 등급별 casing-fill 페어로 대체됨, 아래 참조**, `ROAD_FILL`/`ROAD_CASING` 팔레트 매핑, 골목 `#f6f6f6`은 무케이싱) / 줌 연동 도로 폭(`roadWidthK(vbw)` — `(vbw/L3_VBW)^0.4` 지수 곡선, 0.6~2.0 클램프) / 팔레트 4단 명도 위계(수면<지면(ward)<블록<건물<도로 흰 fill) / 건물 음영 duplicate(`bldgShadow`, 딥줌 게이트 `vb.w < L3_VBW*0.5`에서만) / 도로·하천 `stroke-linecap`/`stroke-linejoin: round`.
- **렌더/성능 개선 2차 (2026-07-20, 배포 완료)**: ① 라벨 디클러터링(`components/maps/v2/labelDeclutter.ts` `computeVisibleLabels` + `SaigonMapV5.tsx` 통합) — 화면중앙 거리 1차+우선순위 랭크 2차 타이브레이커 greedy 충돌회피, 라벨↔라벨·라벨↔타 마커 아이콘 AABB 모두 회피(아이콘은 항상 표시), 선택핀 상시 노출, 히스테리시스+제스처종료 1회 재계산. ② 도로 z-순서를 글로벌 2-pass→`ROAD_RANK` 등급별 casing-fill 페어(`groupRoadIdxByRank()`)로 전환, 간선 위 이면도로 침범 해소. ③ depth3 건물/도로 피처 단위 뷰포트 컬링(로드 시 bbox 사전계산, 마진 `FEATURE_CULL_MARGIN=1.0`) — DOM 노드 대폭 감소. ④ `api/poi.ts` 지도 모듈 내부 인메모리 bbox 캐시(TTL 1h, containment+50% 확장 fetch). ⑤ `frontend/nginx.conf`에 `depth*.json` `Cache-Control: max-age=3600, must-revalidate`+ETag. ⑥ 저줌 구획 재디자인(`SaigonMapV5.module.css`) — 블록 stroke를 non-scaling hairline(`#e2dac6`)+fill 명도차로, ward 경계는 반려된 `#a8916a` 대신 `#cdc2a8`.
- **렌더/성능 개선 3차 (2026-07-20, 배포 완료)**: ⑦ 검색범위(query bbox) UI크롬 인셋 — 리스트/"N건" 카운트/마커가 상단 검색바+칩(`topInsetPx`)·하단 바텀시트 **최소화 높이**(`collapsedSheetHeight`, 시트 펼침과 무관하게 고정) 안쪽의 가시영역으로 크롭돼, 크롬에 가린 마커가 카운트되던 불일치("N건인데 안 보임") 해소(`SaigonMapV5.tsx` `onViewportChange` `getQueryCropUnits`). **주의**: 크롭 bbox(`bboxFilter`/`viewportBbox`)는 fetch/카운트/리스트/마커 전용이고, 핀 확정 크로스헤어·세션복원(VIEWPORT_KEY)·중심계산은 크롭 이전 raw 기하중심(`onRawViewportChange`→`latestRawBboxRef`/`rawBboxFilter`)을 쓴다 — 두 채널 분리(비대칭 크롭이 중심을 편향시키던 회귀 수정). LOD(vb.w)·렌더 viewBox·제스처는 불변. ⑧ 업체 마커 위계 — biz 마커 `r 1.35→1.6`, POI halo opacity `0.65→0.45`, `labelDeclutter.ts` `RANK_BIZ=550`(POI 밴드 내, landmark 아래)로 업체가 POI에 묻히지 않게. (색·크기·인셋 값은 시작값, 실기 미세조정 대상.)
- **핵심 컴포넌트**: `SaigonMapV5`(`components/maps/SaigonMapV5.tsx` — `MapMarkerV2.label`/`r`/업종 글리프 렌더, unread 빨간 점), `DraggableSheet`(`components/ride/DraggableSheet.tsx`), `ListingCard`, `AdCard`, `ProfileCard`, `AppImage`
- **연결 스토어/API**: `useLocationStore`, `useUserStore` / `api/market.ts`(`fetchListings`, `fetchAds`), `api/feed.ts`(`fetchFeed`), `api/poi.ts`(`fetchPoiMapItems` → BFF `GET /api/poi/public/map`), `api/biz.ts`(`fetchBizMapItems` → BFF `GET /biz/public/map` bbox·category·q, APPROVED+좌표 보유만, `latest_news`) / 위치 권한은 `native.ts`(`ensureLocationPermission`, `getLocation`) 경유
- **(2026-07-20 정정) `fetchDistrictCounts` 관련 stale 서술 제거**: 이 문서가 과거 `api/map.ts`(`fetchDistrictCounts`)를 동네지도 연결 API로 언급했으나, 해당 함수는 애초에 프론트에 존재한 적이 없었다(파일 자체 없음, 사용처 0건). 대응 백엔드 `GET /district-counts`(구 `routers/map.py`)도 프론트 소비처가 전무해 폐기됨 — 신규 `routers/map/districts.py`에 도메인 파일 자리만 유지되고 엔드포인트 자체는 삭제. `api/map.ts`는 현재 존재하며 장소제보 함수만 담는다(아래 §3.3 프로필 항목 참조). ※ `GET /quests/district-counts`(퀘스트 도메인, `api/quests.ts fetchDistrictQuestCounts`)는 이름만 비슷한 별개 API — 영향 없음.

#### 포스트 패널 — `pages/map/PostPanel.tsx` (W2, 2026-07-11; 2026-07-12 매물/피드로 일반화)

업체 핀 직접 터치 시 바텀시트를 **대체**(숨김)하는 카드 패널. 뷰포트 내 최신 소식 보유 업체를 가까운 순 가로 캐러셀로 노출 — IntersectionObserver 스냅 시 `focusPointRef` 기준 줌 유지 recenter+핀 선택 강조. 카드 상단 [X](닫기→시트 복귀)와 "N명이 보는중" 칩(view-ping, Redis ZADD 멱등 30s 윈도우, 15s 폴링 — 자기 포함 카운트 여부는 제품 결정 대기, 업체 카드 전용). 자동 새소식 말풍선과는 상호 가드(패널 열림 중엔 자동 말풍선 비활성). 핀 unread 빨간 점(`SaigonMapV5`)은 `localStorage sgr.biz.readNews`(뉴스 `createdAt` 저장, 폴 skew 안전)로 추적 — 포스트 패널에서 카드가 포커싱되면 읽음 처리(W4).
- **매물/피드 핀 탭도 동일 패널로 일반화 (2026-07-12)**: `PanelItem = {kind:'biz'}|{kind:'listing'}|{kind:'feed'}` union으로 카드 종류를 확장 — 매물/피드 핀을 탭해도 같은 캐러셀 패널이 열리고(탭 지점 카드 선두+가까운 순), 플리킹하면 `focusPointRef`로 지도가 recenter된다. 업체와 달리 매물/피드 캐러셀은 **사용자가 지도를 직접 팬/줌**하면 새 뷰포트 기준으로 후보가 재구성된다(업체는 열림 중 후보 동결 유지, 2026-07-11 결정 그대로). 플리킹·오픈이 유발한 recenter의 bbox 커밋은 재구성 대상에서 제외해 루프를 막는다. 줌 게이트를 벗어나 핀이 사라지면 매물/피드 패널은 자동으로 닫힌다. 찜 토글·viewerCount·읽음 배지·뒤로가기 스냅샷은 여전히 업체 카드 전용. 카드 캐러셀 스케일도 확대됨(폭 ≈350px·높이 220px·썸네일 120px, 390px 화면 기준).
- **카드 탭 = 오버레이 진입 (2026-07-12 2차 배치)**: 카드 탭(`onCardTap`)은 `kind`에 따라 `/biz/:id`·`/market/:id`·`/feed/post/:postId`로 분기하며, 셋 다 `{ state: { backgroundLocation: location } }`을 실어 위 "상세 3종 전체화면 오버레이"로 진입한다(페이지 이동이 아니라 지도 위에 얹히는 레이어).

#### 카테고리 그리드 — `/map/categories` → `pages/map/NeighborhoodCategories.tsx` (W3, 2026-07-11)

칩 [더보기] 진입점. `business_category` DB 테이블(15종·4그룹·아이콘 키·ko/en/vi 라벨, init/119) 기준 그룹 섹션 그리드. 지도 상단 칩·`NeighborhoodCategories`·업체 카드·비즈 파트너 화면(`BizApply` 등)이 동일 카테고리 소스를 공유(기존 BizApply taxonomy 이원화 선재버그 해소).

#### 관심목록 — `/map/favorites` → `pages/map/MapFavorites.tsx` (P-FE 3차, 2026-07-11)

매물(`/market/wishlist` 데이터 재사용) | 업체(`user_favorite_business`, init/121) 통합 탭. 찜 토글 진입점은 `BizPublic.tsx`(`/biz/:id`)와 `PostPanel` 카드.

#### 동네지도 프로필 — `/map/profile` → `pages/map/NeighborhoodProfile.tsx` (실배선 완료, 2026-07-11)

이전 세션 목업(WIP)에서 실기능 배선 완료: 퀵메뉴 3종(쿠폰함 navigate·관심목록 통합 탭 연결·단골은 준비중 토스트, 포장/주문 퀵메뉴는 도메인 없어 제거), 나의 후기(평균 별점/후기 수/도움돼요 — 조회수는 소스 없어 교체, `GET /info/repair/my-reviews`), 장소 제안 바텀시트(`place_submission` init/122 제출+내 제안 상태 조회). **장소제보 API 경로 변경 (2026-07-20)**: `PlaceSuggestSheet.tsx`/`NeighborhoodProfile.tsx`가 쓰는 `createPlaceSuggestion`/`fetchMyPlaceSuggestions`는 `api/biz.ts`→`api/map.ts`로 이관되었고, BFF 경로도 `/api/biz/place-suggestions*`(구, `biz.py` 소속)→`/api/map/place-suggestions*`(신, `routers/map/place_suggestions.py`)로 바뀜 — 장소제보가 비즈니스 파트너 신청과 무관한 지도 도메인이라는 판단. admin 승인 큐는 레거시 Jinja `/admin-legacy/place-suggestions` 그대로 병행 유지되고, 신규로 JSON API(`/admin/api/map/place-suggestions*`)+admin-frontend SPA 화면(`/map/place-suggestions`)이 추가됨(아래 "관리자 콘솔" 항목 참조). 배너 카피 교체+`common.more` 미스키 버그 해소.
- **⚠ 인덱스 노이즈**: 워킹트리에 `NeighborhoodMap_bak.tsx`, `NeighborhoodMap_v3bak.tsx`, `NeighborhoodMap_bak.module.css`(git 미추적, 라우팅에 연결 안 됨)가 존재 — codebase-memory 그래프에도 `NeighborhoodMap_bak`의 함수(`inView`, `switchTab`, `renderBody` 등)가 잡히므로, 그래프 조회 결과에서 `_bak`/`v3bak` 접미사가 붙은 노드는 죽은 백업 코드로 걸러서 읽는다.
- **데드코드 삭제 (2026-07-20)**: `pages/home/DistrictMap.tsx`+`districtPaths.ts`(viewBox 1200×900, 구 행정구역 SVG, `<DistrictMap` 사용처·import 0건 확인됨)가 삭제됨. 동네지도가 실제로 쓰는 지오메트리는 이것과 무관한 별도 자산 — `SaigonMapV5`의 GeoJSON(`components/maps/v2/saigon-depth1.json` + `region.ts`)이다(§3.3 상단 "지도-리스트 분리" 항목 참조). 주변정보(주유소/정비소) 화면이 쓰는 `components/maps/district-data.ts`(`HCMC_DISTRICTS`, 신 SVG, 활성 사용 중)와도 별개.

#### 관리자 콘솔 — 동네지도 관리 (`admin-frontend/src/pages/map/`, 2026-07-20)

`AdminLayout.tsx` 사이드바 그룹 "동네지도" 4항목 → 신규 SPA 화면 5개(POI는 목록+편집 분리):

| 라우트(`admin-frontend`, `/admin/` 아래) | 화면 파일 | 백엔드 API |
|---|---|---|
| `/map/poi`, `/map/poi/new`, `/map/poi/:id` | `PoiListPage.tsx`, `PoiEditPage.tsx` | `GET/POST/PUT /admin/api/map/poi*` + `GET /admin/api/map/poi-categories`(`admin_api/map/poi.py`) — 단건 CRUD+게시해제. 기존 bulk 업서트(`/admin-legacy/poi/bulk`, 스크립트 전용)는 그대로 유지, 사람용 단건 CRUD가 처음 생긴 것 |
| `/map/place-suggestions` | `PlaceSuggestionListPage.tsx` | `/admin/api/map/place-suggestions*`(`admin_api/map/submissions.py`) — 승인은 상태 전환만(Poi 자동 승격 아님, 기존 `PlaceSubmission` 설계 그대로) |
| `/map/gas-submissions` | `GasSubmissionListPage.tsx` | 동일 파일 — 승인 시 `GasStation` row 실제 생성 |
| `/map/repair-submissions` | `RepairSubmissionListPage.tsx` | 동일 파일 — 승인 시 `RepairShop` row 실제 생성 |

5화면 공용 fetch 함수는 `admin-frontend/src/api/map.ts`. 전부 `verify_admin_api`(JWT 쿠키) + 감사로그(`_audit.audit()`). 레거시 Jinja(`/admin-legacy/poi`·`/place-suggestions`·`/gas-submissions`·`/repair-submissions`)는 2차 이식 완료 전까지 병행 유지. 백엔드는 `backend/app/routers/map/`(앱 조회, poi.py/districts.py/place_suggestions.py)와 `backend/app/routers/admin_api/map/`(관리자 CRUD, poi.py/submissions.py) 두 패키지로 응집됐다(둘 다 기존 `admin_api/__init__.py` 서브패키지 관례 미러) — 앱이 호출하는 조회 URL 자체는 이번 재배선으로 바뀌지 않았다.

### 3.4 커뮤니티 / 피드 (`/feed`)

- **페이지**: `pages/feed/FeedList.tsx`
- **하위 라우트**: `/feed/new`(`FeedCreate.tsx`), `/feed/edit/:postId`(`FeedEdit.tsx`), `/feed/post/:postId`(`FeedDetail.tsx` — 피드 상세+댓글 인라인, 탭바 숨김. 홈 인기글 카드·동네지도 포스트 패널(피드 카드, 오버레이로 진입)에서 진입. **레이아웃 2026-07-12 전체 재작성**: `MarketDetail` 구조 미러 — 공용 `TopBar` 대신 `StatusBar`+커스텀 뒤로가기 헤더, hero 이미지 캐러셀, sellerRow를 미러한 작성자 행, 하단 액션바(🔥응원 토글+💬댓글 수+댓글 입력+전송, 기존 별도 입력바 대체). 헤더 타이틀 i18n 기본값 '게시글'→'피드')
- **핵심 컴포넌트**: `TopBar`, `StoryAvatar`, `AppImage`, `ImageCarousel`, `LevelBadge`, `Chip`, `ProfileCard`, `ImageViewer`
- **DM 진입점**: FeedList 상단 메시지 아이콘 → `/dm`(`pages/dm/DmList.tsx`) → `/dm/:conversationId`(`DmDetail.tsx`). **탭바에는 없음** — "채팅"은 `tabbar.chat` i18n 키만 존재하고 실제 탭바 5개엔 포함 안 됨(TabBar.tsx 주석: "채팅은 nav 제외").

### 3.5 프로필 (`/profile`)

- **페이지**: `pages/profile/ProfileMain.tsx` — 3레이어 + 드래거블 시트 구조 (상세: [`frontend.md`](frontend.md) §4)
- **핵심 컴포넌트**: `StatusBar`, `SkillTree`, `ReviewSheet`, `TradeRow`, `LevelBadge`, `ImageCarousel`, `ItemSvgRenderer`
- **휴대폰 인증 CTA 카드 (2026-07-17)**: sheetBody 최상단 카드, `user.phoneVerified` 기준 분기 — 미인증 → "휴대폰 인증 필요" 표시 + 탭 시 `/auth/phone-verify` 이동, 인증완료 → "휴대폰 인증 완료" 표시(비탭).
- **하위 진입점** (모두 ProfileMain에서 navigate):
  - 설정 아이콘 → `/settings` (하위: `notifications`/`language`/`account`/`blocked`/`profile`/`support`/`support/:id`/`privacy`/`terms`). 설정 메뉴에서 **공지사항(`/notices`)·FAQ(`/faq`)** 행 2개로도 진입 (2026-07-18, `Settings.tsx` — admin 콘솔 CMS 연동 화면, 아래 §3.8)
  - 팔로워/팔로잉 카운트 → `/followers/:userId`, `/following/:userId`
  - 친구추가 아이콘 → `/friends/add`(`FriendAdd.tsx`) / `/friends/:userId`(`FriendList.tsx`)
  - 거래이력 더보기 → `/trades`(`TradeHistory.tsx`)
  - 개러지 배너 → `/garage`
  - 쿠폰함 → `/coupons/mine`(`MyCoupons.tsx`)
  - 새 글 → `/feed/new`

### 3.6 게임 허브 하위 메뉴 상세

| 메뉴 | 페이지 | 핵심 컴포넌트 |
|---|---|---|
| 개러지 | `pages/garage/Garage.tsx` | `ItemSvgRenderer`, `ItemName`, `RiderComposite`, `BikeComposite`, `BottomSheet` |
| 인벤토리 | `pages/inventory/Inventory.tsx` (+ `/inventory/equip-preview` → `EquipPreview.tsx`) | `InventoryCell`, `ItemSvgRenderer`, `ItemName` |
| 상점 | `pages/shop/ShopCatalog.tsx` (+ `/shop/item/:itemCode` → `ItemDetail.tsx`, `/shop/coupons` → `CouponShop.tsx`) | `ItemSvgRenderer`, `ItemName`, `AppImage` |
| 가챠 | `pages/gacha/GachaMain.tsx` (+ `/gacha/pull/:gachaCode` → `GachaPull.tsx`) | `PityBar`, `AlertDialog`, `GachaCardBack`, `ConfettiLayer` |
| 정보 | `pages/info/InfoHub.tsx` | `InfoMap`, 하위: `/info/weather`(`InfoWeather.tsx`), `/info/flood`(`InfoFloodMap.tsx` · `/info/flood/report` → `InfoFloodReport.tsx`), `/info/gas`(`InfoGasList.tsx`), `/info/repair`(`InfoRepairList.tsx` · `/info/repair/:shopId`, `/write`, `/reviews`) |

### 3.7 비즈니스 파트너 (`/biz`, SGR-312, 2026-07-10 구현)

- **성격**: 일반 계정에 부착되는 비즈 프로필(광고 게재 주체) — 별도 가입/로그인 없음. SoT [`spec/business-partner-260710.md`](../spec/business-partner-260710.md).
- **진입점**: 프로필 탭(`ProfileMain.tsx`) "비즈니스 파트너" 메뉴 1행 — 상태별 분기(미신청→`/biz/intro` / PENDING·REJECTED→`/biz/status` / APPROVED→`/biz/manage`). 마켓/홈 피드 `AdCard`(owner 有 시) → `/biz/:id`. 알림 딥링크 `biz&id=<profile_id>`/`bizad&id=<ad_id>` → `LinkRouter.tsx` `biz`/`bizad` 케이스.
- **라우트/페이지 파일**:

| 라우트 | 페이지 파일 | 내용 |
|---|---|---|
| `/biz/intro` | `pages/biz/BizIntro.tsx` | 파트너 안내(혜택·플로우·심사 고지) + 신청하기 CTA |
| `/biz/apply` | `pages/biz/BizApply.tsx` | 신청 폼(상호명/위치/업종/연락처/대표사진) — 제출 시 PENDING |
| `/biz/status` | `pages/biz/BizStatus.tsx` | 심사 상태 허브(PENDING 안내 / REJECTED 사유+재신청 CTA) |
| `/biz/manage` | `pages/biz/BizManage.tsx` | 내 비즈 프로필 홈 — 정보 수정, 보유 광고 목록(상태 칩), 광고 등록 CTA, 광고 섹션 실배선 |
| `/biz/ads/new` | `pages/biz/BizAdNew.tsx` | 광고 등록(소재+기간) — 제출 시 PENDING |
| `/biz/ads/:id` | `pages/biz/BizAdDetail.tsx` | 광고 상세(파트너) — 심사 상태·반려 사유·중단/재개 |
| `/biz/:id` | `pages/biz/BizPublic.tsx` | 공개 비즈프로필(무인증, APPROVED만 200) — 일반 유저가 보는 면. **소식 섹션**(2026-07-12 `b5c008b`, `GET /biz/public/:id/news` 10건 페이지네이션+더보기, 로드 시 `markBizNewsRead`로 지도 핀 unread 뱃지 정합) + **후기 섹션**(2026-07-12, `business_review` init/123 — `GET/POST /biz/public/:id/reviews` wrapper `{reviews,total,avg_rating,has_more}`, UNIQUE(profile_id,user_id) upsert, 작성 시트 `BizReviewSheet.tsx`는 동네지도 + 메뉴와 공용) |

- **핵심 헬퍼**: `adHref()` — 광고 카드 탭 시 owner 有→`/biz/:id`, 無(레거시 광고)→`/market/ad/:id` 폴백. `AdCard` 사용처(홈/마켓/동네지도) 3곳 전부 적용. `AdDetail.tsx`에 "가게 프로필 보기" 링크 추가.
- **i18n**: `biz.*` 3벌(ko/en/vi).
- **admin 3종** (Jinja 템플릿, `/admin/*`):

| 라우트 | 템플릿/화면 | 액션 |
|---|---|---|
| `/admin/biz-accounts` | 계정 심사 큐(PENDING 상단) | 승인 / 반려(사유 필수) |
| `/admin/biz-accounts/:id` | 계정 상세 | 정지(SUSPENDED, 게시중 광고 일괄 STOPPED) / 그룹(`group_id`) 지정 |
| `/admin/biz-ads` | 광고 소재 심사 큐 | 승인(소유 프로필 APPROVED 재검증) / 반려(사유 필수) |

- **연결 API**: BFF `routers/biz.py`(`POST /biz/apply`, `GET/PUT /biz/profiles/:id`, 광고 CRUD, `GET /biz/public/:id`), noti_worker `biz.profile_reviewed`/`biz.ad_reviewed` 이벤트.

### 3.8 탭바/FAB 어디에도 없는 메뉴 (진입점 주의)

| 메뉴 | 라우트 | 진입점 | 비고 |
|---|---|---|---|
| 퀘스트 | `/quests`, `/quests/:id` | 딥링크(`LinkRouter.tsx`)와 라이딩 결과 화면(`RideResultSuccess.tsx`/`RideResultFail.tsx`)의 "다른 퀘스트"/실패 버튼뿐 | **홈/탭바/게임허브 어디에서도 직접 진입 버튼이 없음** — 퀘스트 기능 자체는 살아있으나(`QuestList.tsx`, `api/quests.ts`, `QuestChecker.tsx`) 상시 노출되는 메뉴 진입점이 빠져 있음. "퀘스트 관련 기능 부재?" 질문 시 이 갭을 우선 언급할 것 |
| 라이딩 안내 | `/ride-nav` | 퀘스트 상세 등에서 진입(추정, 필요시 `trace_path`로 확인) | `RideNav.tsx` |
| 안전거래 가이드 | `/guide/safe-trade` | 홈 배너(`WorldMapV2.tsx`) | `SafeTradeGuide.tsx` — feat1 "휴대폰 인증 판매자" 문구로 정정(eKYC 미구현) |
| 판매자 인증(폰 인증) | `/auth/phone-verify` | 탭바/게임허브 직접 진입 버튼 없음 — `/market/new` 진입 시 `VerifiedSellerRoute` 가드가 미인증 유저를 리다이렉트 | `PhoneVerify.tsx` (2026-07-16) — VN 번호 입력 → SMS OTP 검증 2단계. 헤더 타이틀 "판매자 인증"(`phoneVerify.headerTitle`) + 상단 패딩 축소 (2026-07-17) |
| OAuth 팝업 결과 수신 | `/auth/oauth-result` | 사용자 직접 진입 없음 — Zalo **웹** 로그인 팝업의 BFF 콜백(`/auth/oauth/zalo/callback`, `platform=web` state)이 리다이렉트하는 종착지 | `OAuthResult.tsx` (2026-07-17, `34355f9`) — 쿼리 파싱 후 `window.opener`에 origin 검증 `postMessage` → `window.close()`; opener 없으면(팝업차단 폴백) 직접 세션 저장 후 네비게이션. 공개 라우트(PrivateRoute 밖). 네이티브 Zalo/Google/Apple은 기존 딥링크 경로 무변경 |
| 공지사항 | `/notices`, `/notices/:id` | 설정(`Settings.tsx`) "공지사항" 행 | `pages/notices/NoticeList.tsx`/`NoticeDetail.tsx` (2026-07-18, `cdf5f6f`) — admin 콘솔 공지 CMS(`/admin/cms/notices`)가 발행한 글을 `GET /notices`로 표시 |
| FAQ | `/faq` | 설정 "FAQ" 행 | `pages/faq/FaqList.tsx` (2026-07-18, `cdf5f6f`) — admin FAQ CMS 연동(`GET /faqs`), 카테고리 아코디언 |
| 정지 안내 | `/suspended` | 직접 진입 없음 — `api/client.ts` 전역 핸들러가 401/403 `detail.code`(`account_suspended`/`account_banned`)를 세션만료보다 우선 감지해 리다이렉트(세션 유지 — 해제 후 재로그인 불필요). AppShell 탭바 숨김 | `pages/auth/Suspended.tsx` (2026-07-18, `7e12794`) |
| 유저 신고 시트 | (라우트 없음 — 오버레이) | 공개 프로필 카드(`components/ProfileCard.tsx`) 헤더 신고 진입점 — 피드/팔로워·팔로잉/동네지도 공용 | 사유 선택 시트 자체 구현(공용 BottomSheet z-index 50 < ProfileCard 시트 201이라 상위 오버레이로 별도 구현), `api/profile.ts reportUser` (2026-07-18, `7e12794`) |
| DM 신고 메뉴 | (라우트 없음 — 시트) | `/dm/:conversationId`(`DmDetail.tsx`) 헤더 더보기(케밥) | 사유 시트 → `api/dm.ts reportConversation`. 같은 화면에 DM 금칙어 차단 전용 토스트(`banned_keyword` 코드 분기)도 추가됨 (2026-07-18, `7e12794`) |

---

## MCP로 더 깊이 파기

이 문서에서 페이지/컴포넌트 파일을 찾은 뒤, 실제 호출관계·데이터 흐름·영향범위가 필요하면:

```
# 페이지 컴포넌트의 실제 호출관계(=연결된 API/store/native 함수) 확인
mcp__codebase-memory__trace_path(project="mnt-c-DEV-saigon_rider", function_name="NeighborhoodMap", direction="outbound", depth=2)

# 특정 컴포넌트/함수를 텍스트로 찾기
mcp__codebase-memory__search_graph(project="mnt-c-DEV-saigon_rider", query="SaigonMapV5")

# 이 파일을 누가 쓰는지(영향범위) 역방향 추적
mcp__codebase-memory__trace_path(project="mnt-c-DEV-saigon_rider", function_name="findWardAt", direction="inbound")
```

`trace_path(function_name="NeighborhoodMap", ...)`로 실제 조회하면 `fetchListings`/`fetchAds`(`api/market.ts`), `fetchFeed`(`api/feed.ts`), `fetchPoiMapItems`(`api/poi.ts`), `fetchBizMapItems`(`api/biz.ts`), `useLocationStore`/`useUserStore`, `native.ts`의 위치 권한 함수까지 한 번에 나온다 — "동네지도가 어떤 백엔드/상태와 엮여있나"를 코드 안 뒤지고 바로 확인 가능.

**주의**: 그래프는 워킹트리 전체(미추적 백업 파일 포함)를 인덱싱하므로, `_bak`/`bak2`/`v3bak` 등 접미사가 붙은 결과는 죽은 코드로 간주하고 무시한다. 코드 변경 후에는 [`agent-guidelines.md`](../agent-guidelines.md) §9 재인덱싱 규칙에 따라 `index_repository`로 갱신해야 이 문서와 그래프가 계속 일치한다.

## 유지보수

라우트/메뉴 구조가 바뀌면(새 페이지 추가, 탭바 구성 변경, 게임허브 진입점 변경 등) 이 문서를 함께 갱신한다. SoT는 여전히 `App.tsx`(라우트)·`TabBar.tsx`/`GameHubSheet.tsx`(메뉴)이고, 이 문서는 그 둘을 사람이 빠르게 훑을 수 있게 만든 파생 인덱스다.
