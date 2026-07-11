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
- **핵심 컴포넌트**: `SaigonMapV2`, `ListingCard`(`pages/market/ListingCard.tsx`), `AdCard`(`pages/market/AdCard.tsx`), `StatusBar`, `BottomSheet`, `Chip`, `ScrollSentinel`
- **연결 API**: `api/market.ts` (`fetchListings`, `fetchAds` 등)

### 3.3 동네지도 (`/map`)

- **페이지**: `pages/map/NeighborhoodMap.tsx` — 상단 주석: "동네지도 v4 (SGR-287) — SaigonMapV4 풀스크린 + 하단 드래거블 시트. GPS 기준 동 자동 진입 → 전체 depth3 오버레이 → 블록 탭으로 구역 필터링." (주석은 v4 시절 남은 것, 실제 지도 컴포넌트는 `SaigonMapV5`로 전환됨 — 최근 커밋 `dd3c80b`)
- **시트 탭 3종 (SGR-315 P1, 2026-07-10)**: `listings`(매물, 주황 원형 핀)·`feed`(피드, 파랑 원형 핀)·`biz`(업체, **당근식 teardrop 핀** — 2026-07-12 리디자인 `22688c5`: 오렌지 `#ff5a1f` 물방울+흰 홀+업종 글리프, 꼭짓점 앵커, 선택 시 1.3x 확대, `MapMarkerV2.kind='biz'` 분기+상호명 라벨). **세 탭 모두 배타 렌더**(현재 코드 기준 — T3 문서의 "업체 상시 제3 레이어" 결정은 미구현 상태, 줌 게이트 동일 준수). 업체 탭 활성 시 지도 상단 카테고리 칩(DB화 15종·4그룹, 아래 참조), 업체 카드 탭→`/biz/:id`, 업체 핀 탭→**포스트 패널**(아래 참조). 검색은 제출 시점 탭으로 스코프 고정(biz 탭=업체명 `q` 검색, 그 외=매물 검색).
- **좌측 플로팅 버튼 3종 (2026-07-12, `7eff692`)**: 내 위치(GPS 측정) / ♥ **찜 업체만 보기 토글**(`favOnly` — ON 시 biz 탭 자동 전환, `fetchBizFavorites` 교집합, 칩 필터와 AND, 비로그인 토스트) / + **글쓰기 팝오버**(장소 제안=`/map/profile?openPlaceForm=1` 원샷 쿼리로 기존 시트 재사용, 후기쓰기=업체 후기 — 2026-07-12 신규 도메인 배선).
- **업체 상세 뒤로가기 상태 복원 (2026-07-12, `18794b4`)**: `/biz/:id` 이동 3곳에서 sessionStorage `sgr.map.bizReturn`(tab·칩·favOnly·postPanel/bubble UI) 스냅샷 → `useNavigationType()===POP`일 때만 1회 복원(PUSH 진입은 폐기), 선택 UI는 첫 biz fetch 완료 후 가드 복원. 뷰포트는 기존 `sgr.map.viewport`(localStorage) 메커니즘 그대로. 회귀 하네스 `tools/qm/regr-biz-return.mjs`.
- **핵심 컴포넌트**: `SaigonMapV5`(`components/maps/SaigonMapV5.tsx` — `MapMarkerV2.label`/`r`/업종 글리프 렌더, unread 빨간 점), `DraggableSheet`(`components/ride/DraggableSheet.tsx` — `floatingTopCenter` 모드로 시트 full 시 [지도보기] 필 노출, W1 2026-07-11), `ListingCard`, `AdCard`, `ProfileCard`, `AppImage`
- **연결 스토어/API**: `useLocationStore`, `useUserStore` / `api/market.ts`(`fetchListings`, `fetchAds`), `api/feed.ts`(`fetchFeed`), `api/map.ts`(`fetchDistrictCounts`), `api/biz.ts`(`fetchBizMapItems` → BFF `GET /biz/public/map` bbox·category·q, APPROVED+좌표 보유만, `latest_news`) / 위치 권한은 `native.ts`(`ensureLocationPermission`, `getLocation`) 경유

#### 포스트 패널 — `pages/map/PostPanel.tsx` (W2, 2026-07-11)

업체 핀 직접 터치 시 바텀시트를 **대체**(숨김)하는 카드 패널. 뷰포트 내 최신 소식 보유 업체를 가까운 순 가로 캐러셀로 노출 — IntersectionObserver 스냅 시 `focusPointRef` 기준 줌 유지 recenter+핀 선택 링. 카드 상단 [X](닫기→시트 복귀)와 "N명이 보는중" 칩(view-ping, Redis ZADD 멱등 30s 윈도우, 15s 폴링 — 자기 포함 카운트 여부는 제품 결정 대기). 자동 새소식 말풍선과는 상호 가드(패널 열림 중엔 자동 말풍선 비활성). 핀 unread 빨간 점(`SaigonMapV5`)은 `localStorage sgr.biz.readNews`(뉴스 `createdAt` 저장, 폴 skew 안전)로 추적 — 포스트 패널에서 카드가 포커싱되면 읽음 처리(W4).

#### 카테고리 그리드 — `/map/categories` → `pages/map/NeighborhoodCategories.tsx` (W3, 2026-07-11)

칩 [더보기] 진입점. `business_category` DB 테이블(15종·4그룹·아이콘 키·ko/en/vi 라벨, init/119) 기준 그룹 섹션 그리드. 지도 상단 칩·`NeighborhoodCategories`·업체 카드·비즈 파트너 화면(`BizApply` 등)이 동일 카테고리 소스를 공유(기존 BizApply taxonomy 이원화 선재버그 해소).

#### 관심목록 — `/map/favorites` → `pages/map/MapFavorites.tsx` (P-FE 3차, 2026-07-11)

매물(`/market/wishlist` 데이터 재사용) | 업체(`user_favorite_business`, init/121) 통합 탭. 찜 토글 진입점은 `BizPublic.tsx`(`/biz/:id`)와 `PostPanel` 카드.

#### 동네지도 프로필 — `/map/profile` → `pages/map/NeighborhoodProfile.tsx` (실배선 완료, 2026-07-11)

이전 세션 목업(WIP)에서 실기능 배선 완료: 퀵메뉴 3종(쿠폰함 navigate·관심목록 통합 탭 연결·단골은 준비중 토스트, 포장/주문 퀵메뉴는 도메인 없어 제거), 나의 후기(평균 별점/후기 수/도움돼요 — 조회수는 소스 없어 교체, `GET /info/repair/my-reviews`), 장소 제안 바텀시트(`place_submission` init/122 제출+내 제안 상태 조회, admin 승인 큐 `/admin/place-suggestions`), 배너 카피 교체+`common.more` 미스키 버그 해소.
- **⚠ 인덱스 노이즈**: 워킹트리에 `NeighborhoodMap_bak.tsx`, `NeighborhoodMap_v3bak.tsx`, `NeighborhoodMap_bak.module.css`(git 미추적, 라우팅에 연결 안 됨)가 존재 — codebase-memory 그래프에도 `NeighborhoodMap_bak`의 함수(`inView`, `switchTab`, `renderBody` 등)가 잡히므로, 그래프 조회 결과에서 `_bak`/`v3bak` 접미사가 붙은 노드는 죽은 백업 코드로 걸러서 읽는다.

### 3.4 커뮤니티 / 피드 (`/feed`)

- **페이지**: `pages/feed/FeedList.tsx`
- **하위 라우트**: `/feed/new`(`FeedCreate.tsx`), `/feed/edit/:postId`(`FeedEdit.tsx`), `/feed/post/:postId`(`FeedDetail.tsx` — 게시글 상세+댓글 인라인, 탭바 숨김. 홈 인기글 카드에서 진입)
- **핵심 컴포넌트**: `TopBar`, `StoryAvatar`, `AppImage`, `ImageCarousel`, `LevelBadge`, `Chip`, `ProfileCard`, `ImageViewer`
- **DM 진입점**: FeedList 상단 메시지 아이콘 → `/dm`(`pages/dm/DmList.tsx`) → `/dm/:conversationId`(`DmDetail.tsx`). **탭바에는 없음** — "채팅"은 `tabbar.chat` i18n 키만 존재하고 실제 탭바 5개엔 포함 안 됨(TabBar.tsx 주석: "채팅은 nav 제외").

### 3.5 프로필 (`/profile`)

- **페이지**: `pages/profile/ProfileMain.tsx` — 3레이어 + 드래거블 시트 구조 (상세: [`frontend.md`](frontend.md) §4)
- **핵심 컴포넌트**: `StatusBar`, `SkillTree`, `ReviewSheet`, `TradeRow`, `LevelBadge`, `ImageCarousel`, `ItemSvgRenderer`
- **하위 진입점** (모두 ProfileMain에서 navigate):
  - 설정 아이콘 → `/settings` (하위: `notifications`/`language`/`account`/`blocked`/`profile`/`support`/`support/:id`/`privacy`/`terms`)
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
| 안전거래 가이드 | `/guide/safe-trade` | 홈 배너(`WorldMapV2.tsx`) | `SafeTradeGuide.tsx` |

---

## MCP로 더 깊이 파기

이 문서에서 페이지/컴포넌트 파일을 찾은 뒤, 실제 호출관계·데이터 흐름·영향범위가 필요하면:

```
# 페이지 컴포넌트의 실제 호출관계(=연결된 API/store/native 함수) 확인
mcp__codebase-memory__trace_path(project="mnt-c-DEV-saigon_rider", function_name="NeighborhoodMap", direction="outbound", depth=2)

# 특정 컴포넌트/함수를 텍스트로 찾기
mcp__codebase-memory__search_graph(project="mnt-c-DEV-saigon_rider", query="SaigonMapV5")

# 이 파일을 누가 쓰는지(영향범위) 역방향 추적
mcp__codebase-memory__trace_path(project="mnt-c-DEV-saigon_rider", function_name="fetchDistrictCounts", direction="inbound")
```

`trace_path(function_name="NeighborhoodMap", ...)`로 실제 조회하면 `fetchListings`/`fetchAds`(`api/market.ts`), `fetchFeed`(`api/feed.ts`), `fetchDistrictCounts`(`api/map.ts`), `useLocationStore`/`useUserStore`, `native.ts`의 위치 권한 함수까지 한 번에 나온다 — "동네지도가 어떤 백엔드/상태와 엮여있나"를 코드 안 뒤지고 바로 확인 가능.

**주의**: 그래프는 워킹트리 전체(미추적 백업 파일 포함)를 인덱싱하므로, `_bak`/`bak2`/`v3bak` 등 접미사가 붙은 결과는 죽은 코드로 간주하고 무시한다. 코드 변경 후에는 [`agent-guidelines.md`](../agent-guidelines.md) §9 재인덱싱 규칙에 따라 `index_repository`로 갱신해야 이 문서와 그래프가 계속 일치한다.

## 유지보수

라우트/메뉴 구조가 바뀌면(새 페이지 추가, 탭바 구성 변경, 게임허브 진입점 변경 등) 이 문서를 함께 갱신한다. SoT는 여전히 `App.tsx`(라우트)·`TabBar.tsx`/`GameHubSheet.tsx`(메뉴)이고, 이 문서는 그 둘을 사람이 빠르게 훑을 수 있게 만든 파생 인덱스다.
