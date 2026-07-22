import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Heart, LocateFixed, MapPin, Plus, RotateCw, SlidersHorizontal, X } from 'lucide-react';
import SaigonMapV5, { findWardAt } from '@/components/maps/SaigonMapV5';
import { regionContains, type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
import DraggableSheet, { type DraggableSheetHandle } from '@/components/ride/DraggableSheet';
import { AppImage } from '@/components/ui/AppImage';
import { SearchBox } from '@/components/ui/SearchBox';
import { shuffle, randAdBatch } from '@/lib/shuffle';
import { useLocationStore } from '@/store/useLocationStore';
import { useUserStore } from '@/store/useUserStore';
import { fetchListings, fetchAds, adHref, type ListingCard as Listing, type MarketAd } from '@/api/market';
import { fetchBizMapItems, fetchBizCategories, fetchBizFavorites, bizCategoryLabel, type BizMapItem, type BizCategory } from '@/api/biz';
import { isNewsUnread, markBizNewsRead } from '@/lib/bizNewsRead';
import { toast } from '@/components/ui/Toast';
import { BIZ_CAT_ICON_PATH, BIZ_CAT_COLOR, BIZ_CAT_COLOR_FALLBACK } from '@/components/maps/bizCategoryIcons';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import { fetchPoiMapItems, type PoiMapItem } from '@/api/poi';
import { POI_CAT_ICON_PATH, POI_CAT_ICON_FALLBACK } from '@/components/maps/poiCategoryIcons';
import { fetchFeed } from '@/api/feed';
import { PostPanel, type PanelItem } from '@/pages/map/PostPanel';
import BizReviewPickerSheet from '@/pages/map/BizReviewPickerSheet';
import BizReviewSheet from '@/pages/biz/BizReviewSheet';
import PlaceSuggestSheet from '@/pages/map/PlaceSuggestSheet';
import { useBizViewerCount } from '@/hooks/useBizViewerCount';
import type { FeedPost } from '@/api/types';
import ListingCard from '@/pages/market/ListingCard';
import AdCard from '@/pages/market/AdCard';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import { ProfileCard } from '@/components/ProfileCard';
import { formatRelativeTime } from '@/lib/format';
import styles from './NeighborhoodMap.module.css';

type Tab = 'listings' | 'feed' | 'biz';
type BrowseMode = 'viewport' | 'region';
const AD_EVERY = 4;
const LISTING_COLOR = '#ff6f3c';
const FEED_COLOR = '#3b82f6';
// 업체 핀 색 (마커 위계 역전, 2026-07-21) — 업체가 지도 주 콘텐츠이므로 카테고리 색
// 원형 마커 + 흰 글리프로 부상시킨다 (Google place marker / 당근 카테고리 핀 관례).
// 미지정/미지 카테고리는 브랜드 오렌지 폴백(기존 BIZ_COLOR 와 동일 값). ※ 색은 시작값.
const bizCatColor = (category: string | null | undefined) =>
  (category && BIZ_CAT_COLOR[category]) || BIZ_CAT_COLOR_FALLBACK;
// POI 상시 참조 레이어 색 — POI 는 "지표(landmark)" 참조용이므로 저채도 뮤트 톤으로
// 배경에 후퇴시킨다 (업체 마커 아래 위계). SaigonMapV5 라벨 디클러터의 poiTier 색 판별과
// 값이 결합돼 있으므로 함께 변경할 것. ※ 색은 시작값.
const POI_LANDMARK_COLOR = '#74847f'; // landmark — 그레이-틸 뮤트
const POI_CIVIC_COLOR = '#8b909a';    // civic — 쿨 그레이 뮤트
// 자동 말풍선 (2026-07-11) — 뷰포트 세로 스팬이 이 값 이하일 때만 중앙 근접 업체를 터치 없이
// 활성화한다. 세로 폰(≈2.16:1)에서 lat 스팬은 lng 스팬의 2배+ 로 복원되므로 0.03(가로 ≈1.5km,
// 동 단위 줌인)으로 잡는다. 반경은 뷰포트 스팬 대비 정규화 거리(0.5=화면 가장자리).
const AUTO_BUBBLE_MAX_LAT_SPAN = 0.03;
const AUTO_BUBBLE_CENTER_RADIUS = 0.25;
// 업체 탭 카테고리 칩 줄 높이 — 지도 확대/축소 버튼을 그 아래로 밀어내는 데 사용
const CATEGORY_CHIPS_HEIGHT = 42;
// SearchBox 높이(44px) + searchOverlay 상단 여백(10px) — 지도 확대/축소 버튼이 검색창 아래로 오도록
const SEARCH_BAR_HEIGHT = 54;
// 검색범위(query bbox) 상단 크롭 전용 여유값 — 실측한 검색바/칩 줄 하단 경계에 살짝 더 얹어
// 마커가 크롬 가장자리에 바짝 붙지 않게 한다.
const QUERY_TOP_INSET_PAD = 8;
const RECENT_SEARCH_KEY = 'sr_map_recent_searches';
const RECENT_SEARCH_MAX = 8;
// 마지막 뷰포트 기억 — 재진입 시 복원용 (측정이 아닌 "기억"이라 GPS 원칙 위반 아님)
const VIEWPORT_KEY = 'sgr.map.viewport';
// 콜드 앱 진입(세션 첫 마운트)은 게이트 줌으로 리셋, 세션 내 재마운트(탭 전환/뒤로가기
// 복귀)에서만 저장 뷰포트 복원 — 도일 결정 2026-07-15. 모듈 스코프 플래그는 콜드 런치 시
// JS 컨텍스트가 새로 뜨며 false 로 초기화되므로 "콜드 vs 세션 내"를 구분한다.
let mapSessionEntered = false;
// BizPublic(/biz/:id) 이동 직전 지도 컨텍스트 스냅샷 — 뒤로가기(POP) 복귀 시 1회 소비
// (MarketMain mkt_filter_v2 미러). 뷰포트는 VIEWPORT_KEY 가 별도로 복원하므로 담지 않는다.
// 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 저장/복원 비활성.
// 키 상수는 과거 세션 잔존 키 정리 이펙트가 계속 사용한다.
const BIZ_RETURN_KEY = 'sgr.map.bizReturn';
const LISTINGS_PAGE_SIZE = 50;
// 지도 핀은 리스트 페이지네이션과 달리 뷰포트 안의 매물이 전부 보여야 한다.
// 서버 total을 다 채울 때까지 조회해 bbox 결과를 조용히 절단하지 않는다.
// 로딩 표시가 너무 짧게 반짝이고 사라지면 눈에 안 띄므로 최소 노출 시간을 보장한다.
const MIN_LOADING_MS = 2000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function fetchAllListings(params: Parameters<typeof fetchListings>[0], signal: AbortSignal): Promise<Listing[]> {
  const acc: Listing[] = [];
  let page = 1;
  for (;;) {
    const res = await fetchListings({ ...params, page, size: LISTINGS_PAGE_SIZE }, signal);
    acc.push(...res.items);
    if (acc.length >= res.total || res.items.length < LISTINGS_PAGE_SIZE) break;
    page++;
  }
  // offset 페이지네이션은 정렬 동률에서 페이지 간 중복/누락이 생길 수 있다(서버에 id
  // tie-breaker 를 넣었지만 방어적으로 중복 제거 — React 중복 key/ghost 카드 차단)
  const seen = new Set<string>();
  return acc.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
}

async function fetchAllFeed(params: Parameters<typeof fetchFeed>[0], signal: AbortSignal) {
  const acc: Awaited<ReturnType<typeof fetchFeed>>['items'] = [];
  const base = typeof params === 'string'
    ? { filter: params as 'all' | 'neighborhood' | 'friends' | 'hot' }
    : (params ?? {});
  let page = 1;
  for (;;) {
    const res = await fetchFeed({ ...base, page, size: LISTINGS_PAGE_SIZE, signal });
    acc.push(...res.items);
    if (!res.hasMore) return acc;
    page++;
  }
}

type LatLngBbox = { N: number; S: number; E: number; W: number };

// region(동 선택) 모드에서 업체 bbox 조회용 — 폴리곤 외접 bbox (내부 여부는 regionContains로 재필터)
function regionBbox(r: SelectedRegion): LatLngBbox {
  if (r.poly.length < 3) {
    const d = 0.01;
    return { N: r.lat + d, S: r.lat - d, E: r.lng + d, W: r.lng - d };
  }
  const lats = r.poly.map((p) => p.lat);
  const lngs = r.poly.map((p) => p.lng);
  return { N: Math.max(...lats), S: Math.min(...lats), E: Math.max(...lngs), W: Math.min(...lngs) };
}

function loadSavedViewport(): LatLngBbox | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWPORT_KEY) ?? 'null') as Partial<LatLngBbox> | null;
    if (
      v &&
      typeof v.N === 'number' && typeof v.S === 'number' &&
      typeof v.E === 'number' && typeof v.W === 'number' &&
      Number.isFinite(v.N) && Number.isFinite(v.S) &&
      Number.isFinite(v.E) && Number.isFinite(v.W) &&
      v.N > v.S && v.E > v.W
    ) {
      return { N: v.N, S: v.S, E: v.E, W: v.W };
    }
  } catch {
    // 손상된 저장값은 무시하고 기본(전역) 진입
  }
  return null;
}

// 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성 (로직 보존)
// type BizReturnUi =
//   | { kind: 'postPanel'; bizId: string; carouselIndex: number }
//   | { kind: 'bubble'; bizId: string }
//   | { kind: 'none' };
//
// interface BizReturnSnapshot {
//   tab: Tab;
//   bizCategory: string | null;
//   favOnly: boolean;
//   ui: BizReturnUi;
//   savedAt: number;
// }
//
// function readBizReturnSnapshot(): BizReturnSnapshot | null {
//   try {
//     const s = sessionStorage.getItem(BIZ_RETURN_KEY);
//     return s ? (JSON.parse(s) as BizReturnSnapshot) : null;
//   } catch {
//     return null;
//   }
// }

// 매물/피드 캐러셀 후보 (패키지 C) — 기준 아이템 선두 + 같은 소스에서 기준 좌표 기준 가까운 순.
// 업체(openPostPanel)와 동일한 d2 정렬 패턴. 상한 없음(업체 패턴 미러 — 게이트 줌 뷰포트라 과다하지 않음).
function listingCarousel(l: Listing, source: Listing[]): PanelItem[] {
  const d2 = (x: Listing) => (x.lat! - l.lat!) ** 2 + (x.lng! - l.lng!) ** 2;
  const others = source
    .filter((x) => x.id !== l.id && x.lat != null && x.lng != null)
    .sort((a, b) => d2(a) - d2(b));
  return [l, ...others].map((listing): PanelItem => ({ kind: 'listing', listing }));
}

function feedCarousel(p: FeedPost, source: FeedPost[]): PanelItem[] {
  const d2 = (x: FeedPost) => (x.latitude! - p.latitude!) ** 2 + (x.longitude! - p.longitude!) ** 2;
  const others = source
    .filter((x) => x.id !== p.id && x.latitude != null && x.longitude != null)
    .sort((a, b) => d2(a) - d2(b));
  return [p, ...others].map((post): PanelItem => ({ kind: 'feed', post }));
}

function loadRecentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 동네지도 v4 (SGR-287) — SaigonMapV4 풀스크린 + 하단 드래거블 시트.
 * GPS 기준 동 자동 진입 → 전체 depth3 오버레이 → 블록 탭으로 구역 필터링.
 */
export default function NeighborhoodMap() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // 상세 3종(업체/매물/피드) 진입은 backgroundLocation state 로 오버레이 렌더 (App.tsx 라우트-모달)
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const storedLocation = useLocationStore((s) => s.location);
  const setSharedLocation = useLocationStore((s) => s.setLocation);
  const user = useUserStore((s) => s.user);
  const storedCoords = storedLocation && storedLocation.accountId === user?.id ? storedLocation.coords : null;

  // BizPublic 뒤로가기(POP) 복귀에서만 스냅샷을 읽는다 — 탭바 신규 진입(PUSH/REPLACE)은
  // 기본 상태로 시작. 마운트 이펙트에서 진입 종류와 무관하게 즉시 삭제해 재적용을 차단한다.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // const [returnSnapshot] = useState(() => (navigationType === 'POP' ? readBizReturnSnapshot() : null));
  const [mode, setMode] = useState<BrowseMode>('viewport');
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [bizItems, setBizItems] = useState<BizMapItem[]>([]);
  // POI 상시 참조 레이어 (Phase A-2) — 탭 배타 마커(biz/listing/feed)와 독립.
  // 이름 라벨 상시 노출·탭 동작 없음이라 selection 상태가 필요 없다.
  const [poiItems, setPoiItems] = useState<PoiMapItem[]>([]);
  const [bizCategories, setBizCategories] = useState<BizCategory[]>([]);
  const [bizCategory, setBizCategory] = useState<string | null>(null);
  const [bizLoading, setBizLoading] = useState(false);
  // 좌측 ♥ 버튼 = "찜한 업체만 보기" 토글 필터 (카테고리 칩과 AND 교집합, visibleBiz 에서 적용)
  const [favOnly, setFavOnly] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  // 좌측 + 버튼 = 글쓰기 컨텍스트 메뉴 (후기쓰기/장소 제안하기)
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // 후기쓰기 플로우 — 대상 업체(작성 시트) / 후보 목록(선택 스텝). 둘 다 지도 위 오버레이라
  // 뒤로가기 스냅샷(sgr.map.bizReturn)·시트 상태와 무관하다.
  const [reviewTarget, setReviewTarget] = useState<{ id: string; name: string } | null>(null);
  const [reviewPickerItems, setReviewPickerItems] = useState<BizMapItem[] | null>(null);
  // 장소 제안 시트 (인플레이스, 페이지 이동 없음) — 열리는 시점의 뷰포트 중심·동네명 스냅샷.
  // 핀 재배치 확정 시 coords/wardName 만 갱신되고 시트 내부 폼 상태는 유지된다.
  const [placeSheet, setPlaceSheet] = useState<{ coords: { lat: number; lng: number } | null; wardName: string | null } | null>(null);
  // 핀 재배치 모드 — 시트를 숨기고(마운트 유지 = 폼 보존) 지도 중앙 크로스헤어로 좌표 재지정
  const [placePinMode, setPlacePinMode] = useState(false);
  // 도시 전체 조망(줌아웃)용 — ward보다 굵은 district 단위 집계. listings 탭에서만 쓰임
  // (feed 탭은 이미 district 단위라 별도 조회가 불필요).
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [listingError, setListingError] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const [bizError, setBizError] = useState(false);
  const [poiError, setPoiError] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 말풍선 데이터 = BizMapItem.latestNews (business_news 실데이터, 2026-07-11).
  // 소식이 없는 업체는 소개 카피(업종·주소)로 폴백한다.
  const [selectedBiz, setSelectedBiz] = useState<BizMapItem | null>(null);
  // 매물·피드 자동 말풍선 (map-marker 일관성 ②) — selectedBiz 의 근접-자동강조를 그대로
  // 미러링한 레이어별 선택. 활성 탭·패널 닫힘 상태에서만 지도 중앙 최근접 1개를 잡는다.
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  // 포스트 패널 (W2, 당근 레퍼런스) — 핀 "직접 터치" 시 바텀시트를 대체하는 캐러셀.
  // 업체 항목은 열 때 스냅샷으로 고정(대표 결정 2026-07-11) — 캐러셀이 유발한
  // recenter→bbox→visibleBiz 재계산이 다시 순서를 흔드는 피드백 루프 방지.
  // 매물/피드 항목(패키지 C)은 반대로 지도 이동(사용자 팬/줌) 시 재구성한다 — 아래 재검색
  // 이펙트 참조. selectedBiz(자동 말풍선)와 상태를 공유하지 않는다.
  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const [carouselItems, setCarouselItems] = useState<PanelItem[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [postPanelHeight, setPostPanelHeight] = useState(0);
  // 읽음 처리 직후 같은 데이터로도 markers(badge) 재계산을 트리거 (W4)
  const [readVersion, setReadVersion] = useState(0);
  const focusPointRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  const zoomInRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  // [X]로 닫은 업체는 다음 지도 조작(새 bbox 커밋)까지 자동 말풍선 1회 억제 (대표 결정 2026-07-11)
  const suppressAutoBubbleIdRef = useRef<string | null>(null);
  // 매물·피드도 동일 — 패널 오픈이 focusPoint recenter 를 하므로 닫으면 중심이 그 아이템과
  // 일치해 근접 이펙트가 방금 닫은 말풍선을 즉시 재점화한다. biz suppressAutoBubbleIdRef 를
  // 레이어별로 미러(set: closePostPanel / check: 근접 이펙트 / clear: 새 bbox 커밋).
  const suppressAutoBubbleListingIdRef = useRef<string | null>(null);
  const suppressAutoBubbleFeedIdRef = useRef<string | null>(null);
  // 뒤로가기 복원 2단계(선택 UI) — 업체 데이터는 bbox fetch 후에야 도착하므로 보류해 두고,
  // 첫 fetch 완료 시 1회 소비한다 (MarketMain scrollRestoredRef 패턴).
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // const pendingUiRestoreRef = useRef<Exclude<BizReturnUi, { kind: 'none' }> | null>(
  //   returnSnapshot && returnSnapshot.ui.kind !== 'none' ? returnSnapshot.ui : null,
  // );
  // "fetch 가 실제로 완료됐는가" 표시 — 게이트/탭 전환의 setBizItems([]) 와 구분한다
  const bizFetchedRef = useRef(false);
  const focusedItem = postPanelOpen ? carouselItems[carouselIndex] ?? null : null;
  const focusedBiz = focusedItem?.kind === 'biz' ? focusedItem.biz : null;
  // 매물·피드 핀 선택 강조 링 (map-marker 일관성 ①) — focusedBiz 와 동일한 "포스트 패널
  // 캐러셀 포커스 아이템" 개념. 말풍선(②)은 이게 아니라 selectedListing/selectedPost 파생.
  const focusedListing = focusedItem?.kind === 'listing' ? focusedItem.listing : null;
  const focusedFeedPost = focusedItem?.kind === 'feed' ? focusedItem.post : null;
  // 매물/피드 팝업 재검색 모드 판별 (패키지 C) — 캐러셀 플리킹/팝업 오픈 recenter 가 커밋할
  // "다음 bbox" 를 표시해 두면(커밋 시점에 bbox 참조 기억, suppressAutoBubbleIdRef 패턴),
  // 재검색 이펙트가 그 bbox 에서는 "재구성(인덱스 0)" 대신 "append(새 아이템만 끝에 추가,
  // 인덱스 불변)"로 동작한다 — recenter→bbox→재구성→인덱스 점프 피드백 루프 방지.
  const suppressPanelRebuildRef = useRef(false);
  const suppressedPanelBboxRef = useRef<LatLngBbox | null>(null);
  const viewerCount = useBizViewerCount(focusedBiz?.id ?? null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [adLimit, setAdLimit] = useState(randAdBatch);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(0);
  const [sheetSnap, setSheetSnap] = useState<'full' | 'mid' | 'collapsed'>('collapsed');
  // 검색범위(query bbox) 하단 크롭 전용 — sheetVisibleHeight는 시트가 펼쳐지면(mid/full) 커지는
  // "현재" 실측값이라 그대로 못 쓴다. collapsed 스냅으로 정착할 때의 실측값(=DraggableSheet
  // peek, 헤더 행 높이 — DraggableSheet.tsx:98,105 offsetOf('collapsed')와 동일 소스)만 캡처해
  // 시트가 펼쳐져도 하단 경계를 최소화 높이로 고정한다(대표 명시 요구).
  const [collapsedSheetHeight, setCollapsedSheetHeight] = useState(0);
  useEffect(() => {
    if (sheetSnap === 'collapsed') setCollapsedSheetHeight(sheetVisibleHeight);
  }, [sheetSnap, sheetVisibleHeight]);

  const sheetRef = useRef<DraggableSheetHandle>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const locateRef = useRef<(() => void) | null>(null);
  const emitBboxRef = useRef<(() => void) | null>(null);
  const searchFitRef = useRef<((points: { lat: number; lng: number }[]) => void) | null>(null);
  const [viewportBbox, setViewportBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const [showDistrictBadges, setShowDistrictBadges] = useState(true);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // 지역선택 해제(resetToViewport) 동기 emit 창에서만 true — handleBboxChange가 디바운스·
  // mode 가드 없이 현재 뷰포트 bbox를 즉시 커밋하게 한다 (500ms 공백 동안 0건 깜빡임 방지)
  const bboxImmediateRef = useRef(false);
  // 마운트 시 1회만 읽는다 — 이후 저장은 handleBboxChange 디바운스가 담당.
  // 콜드 진입(세션 첫 마운트)은 저장 뷰포트를 무시하고 게이트 줌으로 진입한다.
  const [savedViewport] = useState<LatLngBbox | null>(() => {
    if (!mapSessionEntered) { mapSessionEntered = true; return null; }
    return loadSavedViewport();
  });

  // 검색 — 위치 필터 무시하고 전역에서 매물을 찾음(매물 탭 전용, 피드는 키워드 검색 미지원)
  // 검색은 전체화면 패널(당근 패턴)에서 입력받고, 패널을 닫으면 지도가 결과를 보여줌 — 지도 화면
  // 자체는 바텀시트를 강제로 올리는 등 검색 중 레이아웃을 바꾸지 않는다.
  // searchQuery = 패널 입력 draft, submittedQuery = 실제 검색 확정값(Enter/최근검색 탭).
  // 패널이 결과를 보여주지 않으므로 타이핑 중 라이브 검색은 무의미 — 제출 시점에만 fetch한다
  // (뒤로가기로 취소했는데 검색모드로 전환돼 버리던 문제 + 안 보이는 fetch/지도 re-fit 제거).
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Listing[]>([]);
  // 검색 스코프는 제출 시점의 탭으로 고정 (SGR-326) — 검색 중 탭 전환이 재조회·지도
  // re-fit 을 일으키지 않게 한다. biz 탭에서 제출 = 업체명 검색(T1 q), 그 외 = 매물 검색.
  const [searchScope, setSearchScope] = useState<'listings' | 'biz'>('listings');
  const [bizSearchResults, setBizSearchResults] = useState<BizMapItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const isSearching = submittedQuery.length > 0;

  // 패널이 열리는 "그 순간"의 .root 높이를 한 번만 캡처해 고정한다 — 이후 키보드가 뜨면서
  // 100dvh가 줄어들어도(WKWebView가 interactive-widget=resizes-visual을 지원 안 할 수 있음)
  // 패널 자체는 이 픽셀값 그대로 유지되고, 키보드는 그 위에 순수 오버레이로만 뜬다.
  const rootRef = useRef<HTMLDivElement>(null);
  const [lockedPanelHeight, setLockedPanelHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (searchPanelOpen) setLockedPanelHeight(rootRef.current?.clientHeight ?? null);
  }, [searchPanelOpen]);

  // 검색범위(query bbox) 상단 크롭 전용 — searchOverlay/chipsOverlay는 상태바 높이(플랫폼별로
  // 다름, --status-bar-height)만큼 아래에서 시작하는데, 상수(SEARCH_BAR_HEIGHT/
  // CATEGORY_CHIPS_HEIGHT)는 그 상태바 여백을 포함하지 않아 실제 칩 줄 하단보다 위에서
  // 크롭돼 칩에 가린 마커가 검색범위에 잡히는 버그가 있었다. .root 기준 실측 좌표로 잡아
  // 플랫폼과 무관하게 항상 정확한 값을 쓴다. topInsetPx(라벨 디클러터 중앙 보정·줌 컨트롤
  // 배치용, SaigonMapV5 참조)와는 별개 채널 — 저 값은 그대로 둔다.
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const chipsOverlayRef = useRef<HTMLDivElement>(null);
  const [queryTopInsetPx, setQueryTopInsetPx] = useState(SEARCH_BAR_HEIGHT);
  useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      const bottomEl = tab === 'biz' && !isSearching ? chipsOverlayRef.current : searchOverlayRef.current;
      if (!root || !bottomEl) return;
      const bottom = bottomEl.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
      setQueryTopInsetPx(Math.max(0, bottom + QUERY_TOP_INSET_PAD));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (searchOverlayRef.current) ro.observe(searchOverlayRef.current);
    if (chipsOverlayRef.current) ro.observe(chipsOverlayRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [tab, isSearching]);

  // 시트 드래그 매 프레임 visible height — React setState 대신 CSS 변수만 기록(프레임당 DOM 1회,
  // 리렌더 0회). mapTools 의 bottom 이 이 변수를 따라가고, React 상태(sheetVisibleHeight)는
  // onVisibleHeightSettle 로 스냅 정착 시에만 커밋된다 → bottomInsetPx(지도 viewBox 클램프)도
  // 정착 시 1회만 갱신 (드래그 중 매 프레임 지도 전체 리페인트 방지).
  // 변수는 화면 루트가 아니라 유일 소비자인 mapTools 요소에 직접 기록한다 — 루트에 쓰면 커스텀
  // 프로퍼티 무효화가 SVG 지도 전체 서브트리 스타일 리캘크를 유발해(계측 +25ms/frame) 역효과.
  const sheetVisibleHLiveRef = useRef(0);
  const mapToolsRef = useRef<HTMLDivElement | null>(null);
  // 콜백 ref — mapTools 는 isSearching 등으로 언마운트/재마운트되므로, 재마운트 시점에 최신
  // 라이브 값으로 변수를 1회 시드해 stale(기본값 0px) 위치로 그려지는 프레임을 막는다.
  const setMapToolsRef = useCallback((el: HTMLDivElement | null) => {
    mapToolsRef.current = el;
    el?.style.setProperty('--sheet-visible-h', `${sheetVisibleHLiveRef.current}px`);
  }, []);
  // 줌힌트 필(우측 floating)도 mapTools 와 동일한 변수 추적 대상 — 소비자 2곳에 각각 기록
  const zoomPillRef = useRef<HTMLButtonElement | null>(null);
  const setZoomPillRef = useCallback((el: HTMLButtonElement | null) => {
    zoomPillRef.current = el;
    el?.style.setProperty('--sheet-visible-h', `${sheetVisibleHLiveRef.current}px`);
  }, []);
  const handleSheetVisibleHeightLive = useCallback((h: number) => {
    sheetVisibleHLiveRef.current = h;
    mapToolsRef.current?.style.setProperty('--sheet-visible-h', `${h}px`);
    zoomPillRef.current?.style.setProperty('--sheet-visible-h', `${h}px`);
  }, []);

  const addRecentSearch = useCallback((keyword: string) => {
    setRecentSearches((prev) => {
      const next = [keyword, ...prev.filter((k) => k !== keyword)].slice(0, RECENT_SEARCH_MAX);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((keyword: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((k) => k !== keyword);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCH_KEY);
  }, []);

  // 뒤로가기 = 검색 취소: 패널을 닫고 draft를 확정값으로 되돌린다(타이핑만 하고 나가도 흔적 없음)
  const closeSearchPanel = useCallback(() => {
    setSearchPanelOpen(false);
    setSearchQuery(submittedQuery);
  }, [submittedQuery]);

  const submitSearch = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    setSearchQuery(trimmed);
    setSubmittedQuery(trimmed);
    setSearchScope(tab === 'biz' ? 'biz' : 'listings');
    if (trimmed) addRecentSearch(trimmed);
    setSearchPanelOpen(false);
    setPostPanelOpen(false); // 검색 확정 = 새 탐색 컨텍스트 — 포스트 패널 해제 (W2)
  }, [addRecentSearch, tab]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSubmittedQuery('');
    // 검색 해제 = 검색 결과 핀(forceMarkers) 소멸 — 그 핀으로 연 매물/피드 팝업도 함께 닫는다
    // (게이트 미통과 줌아웃에서는 뷰포트 핀이 없어 고아 팝업이 잔존, 패키지 C 리뷰 MINOR).
    // 업체 팝업은 기존 동작 유지(열림 중 후보 동결 — 검색 해제와 무관하게 잔존).
    if (focusedItem && focusedItem.kind !== 'biz') {
      suppressPanelRebuildRef.current = false;
      setPostPanelOpen(false);
      setCarouselItems([]);
      setCarouselIndex(0);
    }
  }, [focusedItem]);

  // 의도적으로 visualViewport를 추적하지 않는다 — 키보드가 뜨든 말든 패널 크기는 100dvh 고정,
  // 키보드는 그 위에 순수 오버레이로만 뜨게 한다(탭바 포함 화면 전체를 항상 덮어야 함).

  useEffect(() => {
    if (!submittedQuery) {
      setSearchResults([]); setBizSearchResults([]); setSearchError(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(false);
    const req = searchScope === 'biz'
      // 업체명 전역 검색 (SGR-326) — T1 API가 bbox 필수라 전 범위를 넘긴다 (상한 200건)
      ? fetchBizMapItems({ minLat: -90, maxLat: 90, minLng: -180, maxLng: 180, q: submittedQuery, signal: controller.signal })
          .then((items) => {
            if (cancelled) return;
            setSearchError(false);
            setBizSearchResults(items);
            const points = items.map((b) => ({ lat: b.lat, lng: b.lng }));
            if (points.length > 0) searchFitRef.current?.(points);
          })
      : fetchListings({ q: submittedQuery, hideSold: true, size: 40 }, controller.signal)
          .then((page) => {
            if (cancelled) return;
            setSearchError(false);
            const items = page.items ?? [];
            setSearchResults(items);
            const points = items.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat!, lng: l.lng! }));
            if (points.length > 0) searchFitRef.current?.(points);
          });
    req
      .catch((error) => {
        if (!cancelled && !isAbortError(error)) {
          setSearchError(true);
          setSearchResults([]);
          setBizSearchResults([]);
        }
      })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [submittedQuery, searchScope, reloadSeq]);

  // region 모드에서는 bbox emit을 소비하지 않는다 — 시트 높이 변화·팬 등으로 들어온 bbox가
  // handleRegionSelect가 비워둔 viewportBbox를 몰래 되살려, 이후 뷰포트 모드 전환 시
  // 가이드(빈 상태) 대신 필터 결과가 바로 뜨는 문제가 있었음. ref로 최신 mode를 읽는다.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // 줌 게이트 판정을 fetch 이펙트에서 ref로 읽는다 — state를 deps에 넣으면 게이트를
  // 넘는 순간(배지 플래그가 먼저 뒤집히고 bbox 커밋은 500ms 뒤) 낡은 광역 bbox로
  // 즉시 한 번 fetch가 나가는 낭비가 생김. bbox 커밋 시점에만 최신 게이트를 확인한다.
  const showDistrictBadgesRef = useRef(showDistrictBadges);
  showDistrictBadgesRef.current = showDistrictBadges;

  // 크롭 이전(raw) bbox — SaigonMapV5.onRawViewportChange 가 onBboxChange(크롭된 fetch/카운트/
  // 리스트/마커용)와 같은 tick에 "먼저" emit한다(SaigonMapV5.tsx 순서 보장). (N+S)/2가 실제
  // 컨테이너 기하 중심과 일치하는 유일한 채널 — 핀 재배치 확정(latestBboxCenter)·뷰포트
  // 저장(VIEWPORT_KEY)·커밋된 중심(viewportRawBbox)이 모두 이 값을 쓴다. 크롭 bbox(bboxFilter)는
  // 여전히 fetch/카운트/리스트/마커 전용으로 남는다 — 이 raw 채널과 절대 섞지 않는다.
  const latestRawBboxRef = useRef<LatLngBbox | null>(null);
  const handleRawBboxChange = useCallback((bbox: LatLngBbox) => {
    latestRawBboxRef.current = bbox;
  }, []);

  // 커밋된(디바운스 정착) raw bbox — viewportCenter/centerWard/줌인 타겟처럼 "지금 당장"이
  // 아니라 이동이 멎은 시점의 중심이 필요한 소비자용. viewportBbox(크롭)와 동일한 커밋
  // 타이밍(즉시/500ms 디바운스)으로 커밋하되 소스만 raw.
  const [viewportRawBbox, setViewportRawBbox] = useState<LatLngBbox | null>(null);

  const handleBboxChange = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    if (bboxImmediateRef.current) {
      // 지역선택 해제 직후 동기 emit — 호출자(resetToViewport)가 viewport 전환을 이미
      // 확정했으므로 modeRef 가드(아직 'region')를 우회해 즉시 커밋한다. 디바운스 경로와
      // 동일하게 뷰포트 저장·말풍선 억제 해제까지 수행.
      // VIEWPORT_KEY는 raw bbox로 저장 — 크롭 bbox를 저장하면 재진입 복원 시 중심이 밀린다.
      try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(latestRawBboxRef.current ?? bbox)); } catch { /* quota 등 저장 실패 무시 */ }
      suppressAutoBubbleIdRef.current = null;
      suppressAutoBubbleListingIdRef.current = null;
      suppressAutoBubbleFeedIdRef.current = null;
      if (suppressPanelRebuildRef.current) {
        suppressPanelRebuildRef.current = false;
        suppressedPanelBboxRef.current = bbox;
      }
      setViewportBbox(bbox);
      setViewportRawBbox(latestRawBboxRef.current);
      return;
    }
    clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => {
      // 뷰포트 기억: 이동/줌이 멎은 시점의 뷰포트를 저장 → 재진입 시 복원 (raw bbox — 위와 동일 이유)
      try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(latestRawBboxRef.current ?? bbox)); } catch { /* quota 등 저장 실패 무시 */ }
      suppressAutoBubbleIdRef.current = null; // 새 조작 = 억제 해제
      suppressAutoBubbleListingIdRef.current = null;
      suppressAutoBubbleFeedIdRef.current = null;
      if (modeRef.current !== 'region') {
        // 캐러셀 recenter 가 유발한 커밋 — 이 bbox 는 매물/피드 후보 append 모드 (패키지 C)
        if (suppressPanelRebuildRef.current) {
          suppressPanelRebuildRef.current = false;
          suppressedPanelBboxRef.current = bbox;
        }
        setViewportBbox(bbox);
        setViewportRawBbox(latestRawBboxRef.current);
      }
    }, 500);
  }, []);

  // polyActive=true(내 위치 필터 ON)에는 선택 ward polygon 필터를 사용하고,
  // OFF 상태에서는 현재 지도 viewport 기준으로 주변 동네까지 함께 노출한다.
  const bboxFilter = useMemo(() => (mode === 'viewport' ? viewportBbox : null), [mode, viewportBbox]);
  // raw bbox 쪽 viewport 모드 게이트 — bboxFilter(크롭, fetch/카운트/리스트/마커 전용)와 동일한
  // mode 조건이지만 소스는 viewportRawBbox(raw, 중심 계산 전용).
  const rawBboxFilter = useMemo(() => (mode === 'viewport' ? viewportRawBbox : null), [mode, viewportRawBbox]);

  // 커밋된 뷰포트의 중심 — ward 판별·핀 fetch 이펙트·줌인 타겟이 공용한다. raw bbox 기준
  // (bboxFilter는 크롭돼 있어 (N+S)/2가 실제 컨테이너 중심과 어긋난다 — 회귀 수정).
  const viewportCenter = useMemo(
    () => (rawBboxFilter ? { lat: (rawBboxFilter.N + rawBboxFilter.S) / 2, lng: (rawBboxFilter.E + rawBboxFilter.W) / 2 } : null),
    [rawBboxFilter],
  );
  // 지도 중심이 속한 ward (viewport 모드 전용 — region 모드는 bboxFilter=null 이라 자동 null).
  // 접힘 헤더 뱃지·리스트 상단 제목의 지역명 라벨로만 쓰인다. 커버리지 밖이면 null.
  const centerWard = useMemo(
    () => (viewportCenter ? findWardAt(viewportCenter.lat, viewportCenter.lng) : null),
    [viewportCenter],
  );

  useEffect(() => {
    fetchAds(null).then((a) => setAds(shuffle(a))).catch(() => setAds([]));
  }, []);

  // 업체 카테고리 (DB화, W3-FE) — 마운트 시 1회 fetch. 실패 시 빈 배열(칩 행에 '전체'와
  // [더보기]만 남아도 동작).
  useEffect(() => {
    fetchBizCategories().then(setBizCategories).catch(() => setBizCategories([]));
  }, []);

  // sessionStorage 잔존 스냅샷 키 정리 (1회) — 과거 세션에서 저장된 키가 남아있으면 제거.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 복원 분기 비활성
  useEffect(() => {
    sessionStorage.removeItem(BIZ_RETURN_KEY);
    // if (returnSnapshot?.favOnly) {
    //   fetchBizFavorites()
    //     .then((favs) => setFavIds(new Set(favs.map((f) => f.id))))
    //     .catch(() => setFavIds(new Set()));
    // }
  }, []);

  // 카테고리 페이지(/map/categories)에서 넘어온 ?category= 1회 소비 — MarketMain
  // ?lat=&lng= 패턴 미러: 소비 즉시 제거해 리로드/뒤로가기 시 재적용되지 않게 한다.
  useEffect(() => {
    const cat = searchParams.get('category');
    if (!cat) return;
    setTab('biz');
    setBizCategory(cat);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => { setAdLimit(randAdBatch()); }, [tab, mode, selectedRegion?.name]);

  // 매물·피드 조회 — 지도 핀과 바텀시트 리스트가 같은 데이터를 공유한다 (visible* 파생,
  // 핀 개수 = 헤더 건수 정합. ward 별도 리스트 조회는 불일치 문제로 제거, 2026-07-14).
  useEffect(() => {
    if (isSearching) return;
    // 줌 게이트: 구 집계 배지가 뜨는 줌아웃 상태에서는 핀 fetch 자체를 생략한다
    // (배지용 district-counts는 별도 이펙트로 유지). 게이트를 넘는 줌인은 반드시
    // 새 bbox 커밋(bboxFilter 변경)을 동반하므로 그때 이 이펙트가 다시 돌아 fetch한다.
    if (modeRef.current === 'viewport' && showDistrictBadgesRef.current) {
      setLoading(false);
      setListingError(false);
      setFeedError(false);
      setListings([]); setPosts([]);
      return;
    }
    const center = viewportCenter
      ?? (selectedRegion ? { lat: selectedRegion.lat, lng: selectedRegion.lng } : null);
    if (!center) return;
    const size = bboxFilter ? 50 : 40;
    let cancelled = false;
    const controller = new AbortController();
    const startedAt = Date.now();
    setLoading(true);
    setListingError(false);
    setFeedError(false);
    Promise.allSettled([
      fetchAllListings({
        lat: center.lat,
        lng: center.lng,
        sort: 'recent',
        hideSold: true,
        ...(bboxFilter
          ? { minLat: bboxFilter.S, maxLat: bboxFilter.N, minLng: bboxFilter.W, maxLng: bboxFilter.E }
          : {}),
      }, controller.signal),
      bboxFilter
        ? fetchAllFeed({
            filter: 'neighborhood',
            minLat: bboxFilter.S,
            maxLat: bboxFilter.N,
            minLng: bboxFilter.W,
            maxLng: bboxFilter.E,
          }, controller.signal)
        : fetchAllFeed({ filter: 'neighborhood', lat: center.lat, lng: center.lng, size }, controller.signal),
    ]).then(([lp, fp]) => {
      if (cancelled) return;
      const listingsOk = lp.status === 'fulfilled';
      const feedOk = fp.status === 'fulfilled';
      setListings(listingsOk ? lp.value ?? [] : []);
      setPosts(feedOk ? fp.value ?? [] : []);
      setListingError(!listingsOk && (lp.reason as { name?: string } | undefined)?.name !== 'AbortError');
      setFeedError(!feedOk && (fp.reason as { name?: string } | undefined)?.name !== 'AbortError');
    }).finally(() => {
      if (cancelled) return;
      const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remaining > 0) setTimeout(() => { if (!cancelled) setLoading(false); }, remaining);
      else setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [bboxFilter, viewportCenter, reloadSeq, selectedRegion, isSearching, tab]);

  // 업체 핀 레이어 (SGR-323, G-1) — biz 탭에서만 노출되는 레이어. 매물·피드와 동일한
  // 줌 게이트를 지키며(결정사항 2), region 모드에서는 폴리곤 외접 bbox로 조회한다.
  useEffect(() => {
    if (isSearching) return;
    if (tab !== 'biz') { setBizItems([]); setBizError(false); return; }
    if (modeRef.current === 'viewport' && showDistrictBadgesRef.current) {
      setBizItems([]);
      setBizError(false);
      return;
    }
    const bbox = bboxFilter ?? (selectedRegion ? regionBbox(selectedRegion) : null);
    if (!bbox) { setBizItems([]); setBizError(false); return; }
    let cancelled = false;
    const controller = new AbortController();
    setBizLoading(true);
    setBizError(false);
    fetchBizMapItems({
      minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
      category: bizCategory ?? undefined,
      signal: controller.signal,
    })
      .then((items) => { if (!cancelled) { bizFetchedRef.current = true; setBizError(false); setBizItems(items); } })
      .catch((error) => {
        if (!cancelled && !isAbortError(error)) {
          bizFetchedRef.current = true;
          setBizError(true);
          setBizItems([]);
        }
      })
      .finally(() => { if (!cancelled) setBizLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [bboxFilter, reloadSeq, selectedRegion, isSearching, bizCategory, tab]);

  // POI 상시 참조 레이어 (Phase A-2) — biz 핀 조회 이펙트 미러, 단 tab 조건 없이 항상 조회한다.
  useEffect(() => {
    if (isSearching) return;
    if (modeRef.current === 'viewport' && showDistrictBadgesRef.current) {
      setPoiItems([]);
      setPoiError(false);
      return;
    }
    const bbox = bboxFilter ?? (selectedRegion ? regionBbox(selectedRegion) : null);
    if (!bbox) { setPoiItems([]); setPoiError(false); return; }
    let cancelled = false;
    const controller = new AbortController();
    setPoiError(false);
    fetchPoiMapItems({ minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E, signal: controller.signal })
      .then((items) => { if (!cancelled) { setPoiError(false); setPoiItems(items); } })
      .catch((error) => {
        if (!cancelled && !isAbortError(error)) {
          setPoiError(true);
          setPoiItems([]);
        }
      });
    return () => { cancelled = true; controller.abort(); };
  }, [bboxFilter, reloadSeq, selectedRegion, isSearching, tab]);

  const visibleListings = useMemo(() => {
    if (bboxFilter) {
      return listings.filter((l) =>
        l.lat != null && l.lng != null &&
        l.lat >= bboxFilter.S && l.lat <= bboxFilter.N &&
        l.lng >= bboxFilter.W && l.lng <= bboxFilter.E,
      );
    }
    if (!selectedRegion) return listings;
    return listings.filter((l) => l.lat != null && l.lng != null && regionContains(selectedRegion, l.lat!, l.lng!));
  }, [bboxFilter, listings, selectedRegion]);

  const visiblePosts = useMemo(() => {
    if (bboxFilter) {
      return posts.filter((p) =>
        p.latitude != null && p.longitude != null &&
        p.latitude >= bboxFilter.S && p.latitude <= bboxFilter.N &&
        p.longitude >= bboxFilter.W && p.longitude <= bboxFilter.E,
      );
    }
    if (!selectedRegion) return posts;
    return posts.filter((p) => p.latitude != null && p.longitude != null && regionContains(selectedRegion, p.latitude!, p.longitude!));
  }, [bboxFilter, posts, selectedRegion]);

  const visibleBiz = useMemo(() => {
    const base = bboxFilter
      ? bizItems.filter((b) =>
          b.lat >= bboxFilter.S && b.lat <= bboxFilter.N &&
          b.lng >= bboxFilter.W && b.lng <= bboxFilter.E,
        )
      : selectedRegion
        ? bizItems.filter((b) => regionContains(selectedRegion, b.lat, b.lng))
        : bizItems;
    // ♥ 찜 필터 — 카테고리 칩(서버 조회 시점 필터)과 AND 교집합
    return favOnly ? base.filter((b) => favIds.has(b.id)) : base;
  }, [bboxFilter, bizItems, selectedRegion, favOnly, favIds]);

  // depth2/3 마커 (선택 영역 기준) — 검색 중엔 위치 필터 무시하고 검색 결과만 표시.
  // 핀 레이어 배열 구조 (SGR-323): listing/feed/biz 모두 탭 배타 — biz 핀도 biz 탭에서만 노출.
  // 향후 info 계열 흡수 시 레이어 추가로 확장한다 (결정사항 1).
  const markers = useMemo<MapMarkerV2[]>(() => {
    // 캐러셀(포스트 패널) 열림 중 eager injection — 플리킹 recenter 대상이 직전 커밋 bbox 의
    // fetch 결과 밖이면 디바운스+RTT 후에야 핀이 뜨므로, 캐러셀 아이템을 동일 매핑으로 즉시
    // 합류시킨다. 기존 visible 파생 마커 우선, 캐러셀 파생은 id 부재분만 추가 (이중 핀 방지).
    const withCarouselMarkers = (base: MapMarkerV2[]): MapMarkerV2[] => {
      if (!postPanelOpen || carouselItems.length === 0) return base;
      const seen = new Set(base.map((m) => m.id));
      const extra: MapMarkerV2[] = [];
      for (const it of carouselItems) {
        if (it.kind === 'listing') {
          const l = it.listing;
          if (l.lat == null || l.lng == null || seen.has(l.id)) continue;
          seen.add(l.id);
          extra.push({ id: l.id, lat: l.lat, lng: l.lng, kind: 'listing', color: LISTING_COLOR, selected: focusedListing?.id === l.id, onClick: () => openListingPanel(l) });
        } else if (it.kind === 'feed') {
          const p = it.post;
          if (p.latitude == null || p.longitude == null || seen.has(p.id)) continue;
          seen.add(p.id);
          extra.push({ id: p.id, lat: p.latitude, lng: p.longitude, kind: 'feed', color: FEED_COLOR, selected: focusedFeedPost?.id === p.id, onClick: () => openFeedPanel(p) });
        } else {
          const b = it.biz;
          const id = `biz:${b.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          extra.push({
            id, lat: b.lat, lng: b.lng, kind: 'biz', color: bizCatColor(b.category), r: 1.6, label: b.name,
            icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
            selected: focusedBiz?.id === b.id,
            badge: isNewsUnread(b.id, b.latestNews?.createdAt),
            onClick: () => handleBizMarkerClick(b),
          });
        }
      }
      return extra.length > 0 ? [...base, ...extra] : base;
    };
    // POI 상시 참조 레이어 (Phase A-2) — 매물/피드/업체 탭 배타 구조와 무관하게 항상 표시.
    // 이름 라벨은 현재 언어(name_ko/vi/en) 우선, 없으면 name_ko 폴백.
    // 마커 위계 역전 (2026-07-21): POI 는 위치 파악용 "지표"일 뿐 사용자가 찾는 대상이 아니다 —
    // 작게(r 1.0 < biz 1.6)·저채도 뮤트 색으로 배경에 후퇴시키고, 배열 앞쪽(z-order 아래)에 깐다.
    // ※ r/색은 시작값, 실기 조정 대상.
    const poiMarkers: MapMarkerV2[] = poiItems.map((p) => ({
      id: `poi:${p.id}`,
      lat: p.lat,
      lng: p.lng,
      kind: 'poi',
      r: 1.0,
      color: p.category === 'landmark' ? POI_LANDMARK_COLOR : POI_CIVIC_COLOR,
      icon: POI_CAT_ICON_PATH[p.category as 'landmark' | 'civic'] ?? POI_CAT_ICON_FALLBACK,
      label: (i18n.language === 'vi' ? p.nameVi : i18n.language === 'en' ? p.nameEn : p.nameKo) || p.nameKo,
    }));
    // z-order: POI(배경 지표)를 배열 앞에 깔아 업체/콘텐츠 마커가 항상 위에 그려지게 한다.
    if (isSearching) {
      if (searchScope === 'biz') {
        return [...poiMarkers, ...withCarouselMarkers(bizSearchResults.map((b) => ({
          id: `biz:${b.id}`, lat: b.lat, lng: b.lng, kind: 'biz', color: bizCatColor(b.category), r: 1.6, label: b.name,
          icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
          selected: focusedBiz?.id === b.id,
          badge: isNewsUnread(b.id, b.latestNews?.createdAt),
          onClick: () => handleBizMarkerClick(b),
        })))];
      }
      return [...poiMarkers, ...withCarouselMarkers(searchResults
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, kind: 'listing', color: LISTING_COLOR, selected: focusedListing?.id === l.id, onClick: () => openListingPanel(l) })))];
    }
    const layers: MapMarkerV2[][] = [
      tab === 'listings'
        ? visibleListings
            .filter((l) => l.lat != null && l.lng != null)
            .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, kind: 'listing', color: LISTING_COLOR, selected: focusedListing?.id === l.id, onClick: () => openListingPanel(l) }))
        : tab === 'feed'
          ? visiblePosts
              .filter((p) => p.latitude != null && p.longitude != null)
              .map((p) => ({ id: p.id, lat: p.latitude!, lng: p.longitude!, kind: 'feed', color: FEED_COLOR, selected: focusedFeedPost?.id === p.id, onClick: () => openFeedPanel(p) }))
          // 업체 핀 — 색+라벨(상호명)+업종 글리프 (당근 IN-1 변형). biz 탭에서만 노출.
          : visibleBiz.map((b) => ({
              id: `biz:${b.id}`,
              lat: b.lat,
              lng: b.lng,
              kind: 'biz',
              color: bizCatColor(b.category),
              r: 1.6,
              label: b.name,
              icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
              selected: focusedBiz?.id === b.id,
              badge: isNewsUnread(b.id, b.latestNews?.createdAt),
              onClick: () => handleBizMarkerClick(b),
            })),
    ];
    return [...poiMarkers, ...withCarouselMarkers(layers.flat())];
  }, [isSearching, searchScope, searchResults, bizSearchResults, tab, visibleListings, visiblePosts, visibleBiz, focusedBiz, focusedListing, focusedFeedPost, readVersion, postPanelOpen, carouselItems, poiItems, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  // useCallback 필수: SaigonMapV5의 onRegionSelect prop으로 전달되는데, 매 렌더마다
  // 새 함수를 넘기면 내부 focusLatLng/runLocate가 재생성되어 locateOnMount 이펙트가
  // 반복 재실행되며 GPS를 계속 재측정하는 루프가 발생함(관찰: 마운트 후 3초간 24회 호출).
  // 지역선택 기능 비활성 (2026-07-12): ward 자동 추적 리스트로 대체되어 진입점 주석 처리
  // (SaigonMapV5 onRegionSelect 배선 주석 참조 — 핸들러·region 분기 로직은 부활 대비 보존)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRegionSelect = useCallback((region: SelectedRegion) => {
    setMode('region');
    setSelectedRegion(region);
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    setSelectedId(null);
    setExpandedPostId(null);
    setSelectedBiz(null);
    setPostPanelOpen(false);
    if (user) {
      setSharedLocation({
        coords: { lat: region.lat, lng: region.lng },
        wardId: null,
        wardName: region.name,
        source: 'manual',
        measuredAt: Date.now(),
        accountId: user.id,
      });
    }
    // 시트 자동 올림 없음 — 지역 선택은 "지도 탐색 중" 신호지 리스트를 보겠다는 의도가
    // 아니다(UX 원칙: 시트는 사용자 의도로만 이동). 선택 결과는 접힘 헤더 칩/건수로 보인다.
  }, [setSharedLocation, user]);

  const handleLocated = useCallback((coords: { lat: number; lng: number }) => {
    if (!user) return;
    const ward = findWardAt(coords.lat, coords.lng);
    setSharedLocation({
      coords,
      wardId: null,
      wardName: ward?.region.name ?? null,
      source: 'gps',
      measuredAt: Date.now(),
      accountId: user.id,
    });
  }, [setSharedLocation, user]);

  // scrollIntoView는 리스트 내부만이 아니라 모든 스크롤 가능 조상(AppShell 콘텐츠
  // 컨테이너 포함)을 함께 스크롤해 검색 오버레이를 화면 밖으로 밀어내므로,
  // 리스트 컨테이너 스크롤만 직접 계산해 이동시킨다.
  const scrollItemIntoList = (id: string) => {
    const list = listRef.current;
    const item = itemRefs.current[id];
    if (!list || !item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const offset = (itemRect.top - listRect.top) - (listRect.height / 2 - itemRect.height / 2);
    list.scrollTo({ top: list.scrollTop + offset, behavior: 'smooth' });
  };

  // 매물/피드 핀 탭 (패키지 C) — 업체 PostPanel 패턴 미러: 탭 아이템 선두 + 같은 소스(검색
  // 중이면 검색 결과, 아니면 뷰포트 visible)에서 탭 지점 기준 가까운 순 캐러셀. 바텀시트
  // 리스트와는 동기화하지 않는다 (지도-리스트 분리, 2026-07-12 — selectedId 미설정).
  const openItemPanel = (items: PanelItem[], pos: { lat: number; lng: number }) => {
    setCarouselItems(items);
    setCarouselIndex(0);
    setPostPanelOpen(true);
    setSelectedBiz(null);
    setSelectedListing(null);
    setSelectedPost(null);
    suppressPanelRebuildRef.current = true; // 오픈 recenter 의 bbox 커밋은 append 모드 (재구성 아님)
    focusPointRef.current?.({ lat: pos.lat, lng: pos.lng });
  };

  const openListingPanel = (l: Listing) => {
    if (l.lat == null || l.lng == null) return;
    const source = isSearching && searchScope === 'listings' ? searchResults : visibleListings;
    openItemPanel(listingCarousel(l, source), { lat: l.lat, lng: l.lng });
  };

  const openFeedPanel = (p: FeedPost) => {
    if (p.latitude == null || p.longitude == null) return;
    // 피드는 키워드 검색 미지원 — 소스는 항상 뷰포트 visible
    openItemPanel(feedCarousel(p, visiblePosts), { lat: p.latitude, lng: p.longitude });
  };

  // 업체 핀 "직접 터치" (W2) — 시트 스냅 대신 포스트 패널을 연다. 캐러셀 후보 = 같은
  // 소스(검색 중이면 검색 결과, 아니면 뷰포트 업체) 중 최신 소식 보유 업체를 탭한 업체
  // 기준 가까운 순으로. 탭한 업체 자신은 소식이 없어도 항상 선두(폴백 카피 카드).
  // 포스트 패널에서 포커싱된 업체의 최신 소식을 읽음 처리 (W4) — readVersion 이 markers 재계산을 트리거.
  const markBizAsRead = (biz: BizMapItem) => {
    if (biz.latestNews) {
      markBizNewsRead(biz.id, biz.latestNews.createdAt);
      setReadVersion((v) => v + 1);
    }
  };

  const openPostPanel = (biz: BizMapItem) => {
    const source = isSearching && searchScope === 'biz' ? bizSearchResults : visibleBiz;
    const d2 = (b: BizMapItem) => (b.lat - biz.lat) ** 2 + (b.lng - biz.lng) ** 2;
    const others = source.filter((b) => b.id !== biz.id && b.latestNews).sort((a, b) => d2(a) - d2(b));
    setCarouselItems([biz, ...others].map((b): PanelItem => ({ kind: 'biz', biz: b })));
    setCarouselIndex(0);
    setPostPanelOpen(true);
    setSelectedBiz(null); // 자동 말풍선 상태와 분리 — 패널과 말풍선 이중 노출 방지
    setSelectedListing(null); // openItemPanel 과 대칭 — 레이어 전환 시 잔존 말풍선 방지
    setSelectedPost(null);
    setSelectedId(biz.id);
    focusPointRef.current?.({ lat: biz.lat, lng: biz.lng });
    markBizAsRead(biz);
  };

  const closePostPanel = () => {
    // 닫은 시점의 포커싱 아이템 = 지도 중앙 아이템 — 자동 말풍선이 즉시 재점화하지 않게 억제.
    // biz 와 동일하게 각 레이어 ref 를 무조건 재설정한다(닫힌 레이어는 그 id, 나머지는 null).
    suppressAutoBubbleIdRef.current = focusedBiz?.id ?? null;
    suppressAutoBubbleListingIdRef.current = focusedListing?.id ?? null;
    suppressAutoBubbleFeedIdRef.current = focusedFeedPost?.id ?? null;
    suppressPanelRebuildRef.current = false; // 소비되지 않은 재검색 억제 플래그 정리
    setPostPanelOpen(false);
    setCarouselItems([]);
    setCarouselIndex(0);
    setSelectedId(null);
  };

  // 캐러셀 스냅 → 그 업체 핀으로 지도 recenter(줌 유지) + 하이라이트 (터치와 동일 효과)
  // useCallback: PostPanel 의 IntersectionObserver 이펙트 deps 로 들어가므로, 매 렌더
  // (viewerCount 15s tick 포함) 새 참조가 되면 observer 가 불필요하게 재연결된다 (리뷰 P3).
  const handleCarouselIndex = useCallback((i: number) => {
    setCarouselIndex(i);
    const it = carouselItems[i];
    if (!it) return;
    if (it.kind === 'biz') {
      setSelectedId(it.biz.id);
      focusPointRef.current?.({ lat: it.biz.lat, lng: it.biz.lng });
      markBizAsRead(it.biz);
      return;
    }
    // 매물/피드 — 플리킹 recenter 가 커밋할 다음 bbox 는 append 모드 (패키지 C): 새 영역
    // 아이템을 끝에 덧붙이되 순서·인덱스는 불변 — 인덱스 점프 피드백 루프 방지
    const pos = it.kind === 'listing'
      ? { lat: it.listing.lat, lng: it.listing.lng }
      : { lat: it.post.latitude, lng: it.post.longitude };
    if (pos.lat != null && pos.lng != null) {
      suppressPanelRebuildRef.current = true;
      focusPointRef.current?.({ lat: pos.lat, lng: pos.lng });
    }
  }, [carouselItems]);

  const handleBizMarkerClick = (biz: BizMapItem) => {
    setTab('biz');
    setExpandedPostId(null);
    openPostPanel(biz);
  };

  // BizPublic(/biz/:id) 이동 직전 지도 컨텍스트 스냅샷 (MarketMain saveScroll 미러) —
  // 탭·카테고리 칩·찜 필터와 "열려 있던 UI"(포스트 패널 or 자동 말풍선)를 저장한다.
  // panelBiz = 포스트 패널에서 실제 탭한 카드(포커스 카드와 다를 수 있음).
  // useCallback 필수: bizNewsOverlay useMemo 가 이 함수를 캡처하므로, deps 없이 넘기면
  // selectedBiz 가 안 바뀐 채 칩/찜 상태만 바뀌었을 때 낡은 값이 저장된다.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // const saveBizReturnSnapshot = useCallback((panelBiz?: BizMapItem) => {
  //   const focused = panelBiz ?? focusedBiz;
  //   const ui: BizReturnUi = postPanelOpen && focused
  //     ? { kind: 'postPanel', bizId: focused.id, carouselIndex }
  //     : selectedBiz
  //       ? { kind: 'bubble', bizId: selectedBiz.id }
  //       : { kind: 'none' };
  //   const snap: BizReturnSnapshot = { tab, bizCategory, favOnly, ui, savedAt: Date.now() };
  //   try { sessionStorage.setItem(BIZ_RETURN_KEY, JSON.stringify(snap)); } catch { /* 저장 실패 시 복원만 포기 */ }
  // }, [tab, bizCategory, favOnly, postPanelOpen, focusedBiz, carouselIndex, selectedBiz]);

  // 자동 말풍선 (2026-07-11) — 제스처가 멎어 커밋된 뷰포트(bboxFilter, 500ms 디바운스)가
  // 충분히 줌인 상태면 중앙 부근 최근접 업체 1곳을 터치 없이 활성화하고, 중앙에서 벗어나면
  // 해제한다(다른 핀이 오면 갈아탐). 임계 미만 줌에서는 완전 비활성 — 핀 탭 선택을 보존.
  // selectedBiz 는 ref 로 읽는다: deps 에 넣으면 핀 탭 직후 이 이펙트가 되돌아 선택을 지운다.
  // 시트는 움직이지 않는다 — 자동 활성화는 사용자 의도가 아니다(바텀시트 원칙). 하이라이트·스크롤만.
  const selectedBizRef = useRef(selectedBiz);
  useEffect(() => { selectedBizRef.current = selectedBiz; }, [selectedBiz]);
  useEffect(() => {
    // postPanelOpen 가드: 캐러셀 recenter 가 커밋한 bbox 로 이 이펙트가 재점화해
    // 패널과 말풍선이 같은 업체에 이중 노출되는 것을 차단 (분석 리스크 #2)
    if (tab !== 'biz' || isSearching || !bboxFilter || postPanelOpen) return;
    const latSpan = bboxFilter.N - bboxFilter.S;
    if (latSpan > AUTO_BUBBLE_MAX_LAT_SPAN) return;
    const lngSpan = bboxFilter.E - bboxFilter.W;
    const cLat = (bboxFilter.N + bboxFilter.S) / 2;
    const cLng = (bboxFilter.E + bboxFilter.W) / 2;
    let best: BizMapItem | null = null;
    let bestD = Infinity;
    for (const b of visibleBiz) {
      const d = Math.hypot((b.lat - cLat) / latSpan, (b.lng - cLng) / lngSpan);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best && bestD <= AUTO_BUBBLE_CENTER_RADIUS) {
      if (best.id === suppressAutoBubbleIdRef.current) return; // [X]로 닫은 업체 — 다음 조작까지 억제
      if (selectedBizRef.current?.id !== best.id) {
        const target = best;
        setSelectedBiz(target);
        setSelectedId(target.id);
        requestAnimationFrame(() => scrollItemIntoList(target.id));
      }
    } else if (selectedBizRef.current) {
      setSelectedBiz(null);
      setSelectedId(null);
    }
  }, [bboxFilter, visibleBiz, tab, isSearching, postPanelOpen]);

  // 매물 자동 말풍선 (②) — 위 selectedBiz 이펙트의 근접 판정 로직 복제(데이터는 Listing).
  // 동일 가드: 활성 탭·비검색·뷰포트 모드(bboxFilter)·패널 닫힘·게이트 줌 스팬. 카메라 이동
  // 없음(순수 선택 + 리스트 스크롤). biz 와 동일하게 [X]로 닫은 아이템은 다음 bbox 커밋까지
  // 억제(suppressAutoBubbleListingIdRef) — 패널 오픈 recenter 로 중심이 닫힌 아이템과 일치해
  // 즉시 재점화하는 것을 막는다.
  const selectedListingRef = useRef(selectedListing);
  useEffect(() => { selectedListingRef.current = selectedListing; }, [selectedListing]);
  useEffect(() => {
    if (tab !== 'listings' || isSearching || !bboxFilter || postPanelOpen) return;
    const latSpan = bboxFilter.N - bboxFilter.S;
    if (latSpan > AUTO_BUBBLE_MAX_LAT_SPAN) return;
    const lngSpan = bboxFilter.E - bboxFilter.W;
    const cLat = (bboxFilter.N + bboxFilter.S) / 2;
    const cLng = (bboxFilter.E + bboxFilter.W) / 2;
    let best: Listing | null = null;
    let bestD = Infinity;
    for (const l of visibleListings) {
      if (l.lat == null || l.lng == null) continue;
      const d = Math.hypot((l.lat - cLat) / latSpan, (l.lng - cLng) / lngSpan);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (best && bestD <= AUTO_BUBBLE_CENTER_RADIUS) {
      if (best.id === suppressAutoBubbleListingIdRef.current) return; // [X]로 닫은 매물 — 다음 조작까지 억제
      if (selectedListingRef.current?.id !== best.id) {
        const target = best;
        setSelectedListing(target);
        setSelectedId(target.id);
        requestAnimationFrame(() => scrollItemIntoList(target.id));
      }
    } else if (selectedListingRef.current) {
      setSelectedListing(null);
      setSelectedId(null);
    }
  }, [bboxFilter, visibleListings, tab, isSearching, postPanelOpen]);

  // 피드 자동 말풍선 (②) — 매물 이펙트와 동일 구조(데이터는 FeedPost, 좌표 latitude/longitude).
  const selectedPostRef = useRef(selectedPost);
  useEffect(() => { selectedPostRef.current = selectedPost; }, [selectedPost]);
  useEffect(() => {
    if (tab !== 'feed' || isSearching || !bboxFilter || postPanelOpen) return;
    const latSpan = bboxFilter.N - bboxFilter.S;
    if (latSpan > AUTO_BUBBLE_MAX_LAT_SPAN) return;
    const lngSpan = bboxFilter.E - bboxFilter.W;
    const cLat = (bboxFilter.N + bboxFilter.S) / 2;
    const cLng = (bboxFilter.E + bboxFilter.W) / 2;
    let best: FeedPost | null = null;
    let bestD = Infinity;
    for (const p of visiblePosts) {
      if (p.latitude == null || p.longitude == null) continue;
      const d = Math.hypot((p.latitude - cLat) / latSpan, (p.longitude - cLng) / lngSpan);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && bestD <= AUTO_BUBBLE_CENTER_RADIUS) {
      if (best.id === suppressAutoBubbleFeedIdRef.current) return; // [X]로 닫은 피드 — 다음 조작까지 억제
      if (selectedPostRef.current?.id !== best.id) {
        const target = best;
        setSelectedPost(target);
        setSelectedId(target.id);
        requestAnimationFrame(() => scrollItemIntoList(target.id));
      }
    } else if (selectedPostRef.current) {
      setSelectedPost(null);
      setSelectedId(null);
    }
  }, [bboxFilter, visiblePosts, tab, isSearching, postPanelOpen]);

  // 뒤로가기 복원 2단계 (선택 UI) — 업체 fetch 가 실제 완료된 뒤 1회만 소비한다. 대상이
  // 결과에 없으면(뷰포트 밖·삭제) 조용히 스킵. 반드시 자동 말풍선 이펙트 "뒤"에 선언:
  // 같은 커밋에서 둘이 함께 돌 때(이펙트는 선언 순서로 실행) 복원 setState 가 마지막에
  // 적용되고, 다음 커밋에서 selectedBizRef 동기화 → 자동 말풍선 deps 불변이라 안 덮어쓴다.
  // 오버레이 전환 (2026-07-12): 지도 언마운트가 없어져 스냅샷 복원 불필요 — 비활성
  // useEffect(() => {
  //   const pending = pendingUiRestoreRef.current;
  //   if (!pending || !bizFetchedRef.current) return;
  //   pendingUiRestoreRef.current = null; // 첫 fetch 완료 시점에 무조건 소비 — 한참 뒤 팬 이동에서 재점화 방지
  //   const target = bizItems.find((b) => b.id === pending.bizId);
  //   if (!target) return;
  //   if (pending.kind === 'postPanel') {
  //     // 캐러셀은 최신 fetch 로 재구성(대상 카드 선두) — 원래 인덱스의 이웃 순서는 재현 불가
  //     openPostPanel(target);
  //   } else {
  //     setSelectedBiz(target);
  //     setSelectedId(target.id);
  //   }
  // }, [bizItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // 지도 이동 재검색 (패키지 C) — 매물/피드 팝업이 열린 채 새 bbox 가 커밋되면 새 뷰포트
  // 데이터로 캐러셀 후보를 갱신한다. 두 모드:
  //  · 사용자 직접 팬/줌: 재구성 — 현재 포커스 아이템 선두 유지 + 가까운 순 이웃, 인덱스 0.
  //  · 플리킹/오픈 recenter 가 커밋한 bbox(suppressedPanelBboxRef 참조 비교): append —
  //    기존에 없는 새 아이템만 포커스 위치 기준 가까운 순으로 배열 "끝에" 덧붙인다. 기존
  //    카드 순서·인덱스 불변 → 인덱스 점프가 없어 recenter 재발화(피드백 루프)가 원천
  //    차단되고, 끝 카드에서 계속 플리킹으로 새 영역 아이템에 도달할 수 있다.
  // 업체 팝업은 열림 중 후보 동결 유지(대표 결정 2026-07-11) — biz kind 는 제외. 포커스
  // 아이템은 ref 로 읽는다 — deps 에 넣으면 setCarouselItems 가 이펙트를 되돌려 루프가 된다.
  const focusedItemRef = useRef(focusedItem);
  useEffect(() => { focusedItemRef.current = focusedItem; }, [focusedItem]);
  useEffect(() => {
    const focused = focusedItemRef.current;
    if (!focused || focused.kind === 'biz' || isSearching || !bboxFilter) return;
    if (bboxFilter === suppressedPanelBboxRef.current) {
      // append 모드 — kind+id 중복 제거 후 새 아이템만 포커스 기준 가까운 순으로 끝에 추가
      // (전부 중복이면 prev 그대로 반환해 불필요한 재렌더·이펙트 재실행을 막는다)
      setCarouselItems((prev) => {
        const seen = new Set(prev.map((it) => (it.kind === 'listing' ? `listing:${it.listing.id}` : it.kind === 'feed' ? `feed:${it.post.id}` : `biz:${it.biz.id}`)));
        let fresh: PanelItem[];
        if (focused.kind === 'listing') {
          const l = focused.listing;
          const d2 = (x: Listing) => (x.lat! - l.lat!) ** 2 + (x.lng! - l.lng!) ** 2;
          fresh = visibleListings
            .filter((x) => x.lat != null && x.lng != null && !seen.has(`listing:${x.id}`))
            .sort((a, b) => d2(a) - d2(b))
            .map((listing): PanelItem => ({ kind: 'listing', listing }));
        } else {
          const p = focused.post;
          const d2 = (x: FeedPost) => (x.latitude! - p.latitude!) ** 2 + (x.longitude! - p.longitude!) ** 2;
          fresh = visiblePosts
            .filter((x) => x.latitude != null && x.longitude != null && !seen.has(`feed:${x.id}`))
            .sort((a, b) => d2(a) - d2(b))
            .map((post): PanelItem => ({ kind: 'feed', post }));
        }
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      return;
    }
    setCarouselItems(focused.kind === 'listing'
      ? listingCarousel(focused.listing, visibleListings)
      : feedCarousel(focused.post, visiblePosts));
    setCarouselIndex(0);
  }, [bboxFilter, visibleListings, visiblePosts, isSearching]);

  // 줌 게이트 이탈 (패키지 C 판단) — 매물/피드 핀이 소멸하는 줌아웃(구 집계 배지 상태)에서는
  // 팝업도 닫는다: 핀 없는 지도 위 고아 팝업 방지. 업체 팝업은 기존 동결 동작 그대로 유지.
  useEffect(() => {
    const focused = focusedItemRef.current;
    if (showDistrictBadges && focused && focused.kind !== 'biz') closePostPanel();
    // 업체 말풍선(selectedBiz)도 핀과 함께 정리 — 자동 말풍선 이펙트는 게이트 밖 스팬에서
    // 조기 return(AUTO_BUBBLE_MAX_LAT_SPAN 초과)이라 스스로 해제하지 못해, 핀 없는 지도에
    // 말풍선만 고아로 남는다. 다시 게이트 안으로 줌인하면 기존 조건대로 자연 재점화.
    if (showDistrictBadges && selectedBizRef.current) {
      setSelectedBiz(null);
      setSelectedId(null);
    }
    // 매물·피드 말풍선(②)도 동일 이유로 게이트 밖에서 정리 — 근접 이펙트가 스팬 초과로 조기 return
    if (showDistrictBadges && selectedListingRef.current) { setSelectedListing(null); setSelectedId(null); }
    if (showDistrictBadges && selectedPostRef.current) { setSelectedPost(null); setSelectedId(null); }
  }, [showDistrictBadges]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (tb: Tab) => {
    setTab(tb);
    setExpandedPostId(null);
    setSelectedId(null);
    if (tb !== 'biz') setSelectedBiz(null);
    if (tb !== 'listings') setSelectedListing(null);
    if (tb !== 'feed') setSelectedPost(null);
    setPostPanelOpen(false);
  };

  // ♥ 토글 — ON 시 업체 탭이 아니면 업체 탭으로 전환한다(찜 필터는 업체 레이어 전용이라
  // 매물/피드 탭에 켜둬도 아무 효과가 없어 혼란스러움 — 결정: 탭 배타 구조 위에서 자동 전환).
  const toggleFavOnly = () => {
    if (!user) {
      toast.info(t('map.favoriteFilterLoginRequired'));
      return;
    }
    if (favOnly) {
      setFavOnly(false);
      return;
    }
    setFavOnly(true);
    if (tab !== 'biz') switchTab('biz');
    fetchBizFavorites()
      .then((favs) => setFavIds(new Set(favs.map((f) => f.id))))
      .catch(() => setFavIds(new Set()));
  };

  // + 메뉴 "후기쓰기" (업체 후기 실배선, 대표 결정) — 지도에서 선택/포커스된 업체가 있으면
  // 그 업체로 바로 작성 시트, 없으면 현재 뷰포트 업체 중 선택 스텝. 업체 탭이 아니면
  // bizItems 가 비어 있으므로 같은 bbox·게이트 규칙으로 1회 조회한다 (biz fetch 이펙트 미러).
  const handleWriteReview = async () => {
    setAddMenuOpen(false);
    if (!user) {
      toast.info(t('biz.review.loginRequired'));
      return;
    }
    const target = focusedBiz ?? selectedBiz;
    if (target) {
      setReviewTarget({ id: target.id, name: target.name });
      return;
    }
    let candidates = visibleBiz;
    if (candidates.length === 0) {
      const gateBlocked = mode === 'viewport' && showDistrictBadges;
      const bbox = gateBlocked ? null : bboxFilter ?? (selectedRegion ? regionBbox(selectedRegion) : null);
      if (bbox) {
        const fetched = await fetchBizMapItems({
          minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
        }).catch(() => [] as BizMapItem[]);
        candidates = selectedRegion
          ? fetched.filter((b) => regionContains(selectedRegion, b.lat, b.lng))
          : fetched;
      }
    }
    if (candidates.length === 0) {
      toast.info(t('map.addMenu.noBizNearby'));
      return;
    }
    setReviewPickerItems(candidates);
  };

  // 디바운스 미커밋 시(팬 직후 등) 폴백 — 마지막 emit raw bbox 의 중심(실제 컨테이너 기하중심).
  const latestBboxCenter = () => {
    const b = latestRawBboxRef.current;
    return b ? { lat: (b.N + b.S) / 2, lng: (b.E + b.W) / 2 } : null;
  };

  const handleSuggestPlace = () => {
    setAddMenuOpen(false);
    // 페이지 이동 없이 지도 위에서 시트 오픈 — 열리는 시점의 뷰포트 중심을 좌표 초기값으로
    const c = viewportCenter ?? latestBboxCenter();
    setPlaceSheet({ coords: c, wardName: c ? findWardAt(c.lat, c.lng)?.region.name ?? null : null });
  };

  // 핀 재배치 확정 — 그 시점 지도 중심(latestRawBboxRef: 디바운스 커밋 대기 없이 최신 raw)을 반영하고
  // 시트 복귀. 폼 값은 시트가 hidden 마운트로 보존한다.
  const confirmPlacePin = () => {
    const c = latestBboxCenter();
    if (c) setPlaceSheet((s) => (s ? { coords: c, wardName: findWardAt(c.lat, c.lng)?.region.name ?? null } : s));
    setPlacePinMode(false);
  };

  const retryLoad = () => setReloadSeq((n) => n + 1);
  // useCallback 필수: SaigonMapV5의 onLocate prop으로 전달됨 (handleRegionSelect와 동일한 이유)
  const resetToViewport = useCallback(() => {
    setMode('viewport');
    setSelectedRegion(null);
    setSelectedId(null);
    setExpandedPostId(null);
    setSelectedBiz(null);
    setSelectedListing(null);
    setSelectedPost(null);
    setPostPanelOpen(false);
    // 아이템(listings/posts/bizItems)은 비우지 않는다 — 드래그 재검색과 동일하게 "기존 표시
    // 유지, fetch 완료 시 교체". 아래 즉시 커밋되는 bboxFilter가 visible*에서 뷰포트 밖
    // 잔재를 걸러내므로 헤더 건수·핀이 항상 같은 집합을 가리킨다 (시나리오 4.3 재발 없음).
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    // 현재 뷰포트 bbox를 디바운스 없이 즉시 커밋(emit은 동기 호출) — 500ms 공백 동안
    // 0건 카운트·가이드 화면이 플래시하던 문제 방지. 게이트 미만 줌이면 SaigonMapV5의
    // polyActive 해제 이펙트가 depth를 재발행해 가이드로 정합.
    bboxImmediateRef.current = true;
    emitBboxRef.current?.();
    bboxImmediateRef.current = false;
    // 시트 자동 이동 없음 — 해제 역시 지도 컨텍스트 복귀 액션 (UX 원칙 동일)
  }, []);
  const switchToViewport = () => {
    resetToViewport();
  };
  const clearRegionFilter = () => {
    resetToViewport();
  };

  // 바텀시트 리스트 소스 — 지도 핀(markers)과 동일한 visible*(뷰포트 bbox / 선택 동 클리핑).
  // 헤더 "지역명 · N건"의 N = 핀 개수. (ward 별도 소스는 핀-리스트 불일치로 제거, 2026-07-14)
  const listListings = visibleListings;
  const listPosts = visiblePosts;
  const listBiz = visibleBiz; // ♥ 찜 필터는 visibleBiz 에서 이미 적용됨
  const listLoading = loading;
  const listBizLoading = bizLoading;
  const listError = tab === 'listings' ? listingError : feedError;

  const visibleCount = tab === 'listings' ? listListings.length : tab === 'feed' ? listPosts.length : listBiz.length;

  const bizCatLabel = (c: string | null) => {
    if (!c) return '';
    const cat = bizCategories.find((x) => x.code === c);
    return cat ? bizCategoryLabel(cat, i18n.language) : c;
  };

  // 업체 새소식 말풍선 — 지도 앵커 오버레이로 핀(lat/lng)에 고정되어 팬/줌을 따라간다 (SGR-325).
  // SaigonMapV5 는 memo — 객체 prop 은 useMemo 로 참조를 고정한다(기존 계약). key: 다른 핀 탭 시 pop 재생.
  const bizNewsOverlay = useMemo(() => {
    if (!selectedBiz) return undefined;
    return {
      lat: selectedBiz.lat,
      lng: selectedBiz.lng,
      node: (
        <button key={selectedBiz.id} type="button" className={styles.bizNewsBubble} onClick={() => handleBizMarkerClick(selectedBiz)}>
          {/* eyebrow 는 실소식이 있을 때만 — 소식 없는 업체에 "새소식·방금 전"을 붙이지 않는다(정직화) */}
          {selectedBiz.latestNews && (
            <span className={styles.bizNewsEyebrow}>{t('map.bizNews.label')} <span>{formatRelativeTime(selectedBiz.latestNews.createdAt)}</span></span>
          )}
          <strong>{selectedBiz.name}</strong>
          <span className={styles.bizNewsCopy}>
            {selectedBiz.latestNews
              ? selectedBiz.latestNews.title
              : <>{selectedBiz.category ? t('map.bizNews.categoryCopy', { category: bizCatLabel(selectedBiz.category) }) : ''}{selectedBiz.address ?? t('map.bizNews.fallbackCopy')}</>}
          </span>
        </button>
      ),
    };
  }, [selectedBiz, navigate, t, location]); // eslint-disable-line react-hooks/exhaustive-deps

  // 매물 말풍선 — .bizNewsBubble 베이스 + 리치 modifier(썸네일 행). 썸네일 <AppImage> (imgproxy
   // 변환·content_id 규약은 AppImage 내부 처리). 제목 + 가격(formatPriceVnd). 지도 위 컴팩트 미리보기.
  const listingOverlay = useMemo(() => {
    if (!selectedListing || selectedListing.lat == null || selectedListing.lng == null) return undefined;
    const l = selectedListing;
    return {
      lat: selectedListing.lat,
      lng: selectedListing.lng,
      node: (
        <button key={l.id} type="button" className={`${styles.bizNewsBubble} ${styles.richBubble}`} onClick={() => openListingPanel(l)}>
          {l.thumbnailUrl && (
            <AppImage src={l.thumbnailUrl} alt="" className={styles.richThumb} />
          )}
          <span className={styles.richText}>
            <strong>{l.title}</strong>
            <span className={styles.bizNewsCopy}>{formatPriceVnd(l.priceVnd, t)}</span>
          </span>
        </button>
      ),
    };
  }, [selectedListing, navigate, t, location]); // eslint-disable-line react-hooks/exhaustive-deps

  // 피드 말풍선 — .bizNewsBubble 베이스 + 리치 modifier. [아바타+닉네임] 헤더 / 캡션 1줄 / 작은
   // 사진 썸네일(있을 때만). 아바타·썸네일 모두 <AppImage>. 지도 위 컴팩트 미리보기.
  const feedOverlay = useMemo(() => {
    if (!selectedPost || selectedPost.latitude == null || selectedPost.longitude == null || !selectedPost.caption) return undefined;
    const p = selectedPost;
    const photo = p.photoUrl ?? p.photoUrls[0];
    return {
      lat: selectedPost.latitude,
      lng: selectedPost.longitude,
      node: (
        <button key={p.id} type="button" className={`${styles.bizNewsBubble} ${styles.richBubble}`} onClick={() => openFeedPanel(p)}>
          {photo && (
            <AppImage src={photo} alt="" className={styles.richThumb} />
          )}
          <span className={styles.richText}>
            <span className={styles.feedBubbleHead}>
              <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.feedBubbleAvatar} variant="circle" />
              <span className={styles.feedBubbleName}>{p.userNickname ?? '—'}</span>
            </span>
            <span className={styles.bizNewsCopy}>{p.caption}</span>
          </span>
        </button>
      ),
    };
  }, [selectedPost, navigate, location]); // eslint-disable-line react-hooks/exhaustive-deps

  // 업체 카드 — 업체 탭 리스트·업체 검색 결과 공용 (탭 시 /biz/:id)
  const renderBizCard = (b: BizMapItem) => (
    <div
      key={b.id}
      ref={(el) => { itemRefs.current[b.id] = el; }}
      className={b.id === selectedId ? styles.selected : undefined}
    >
      <button type="button" className={styles.bizCard} onClick={() => navigate(`/biz/${b.id}`, { state: { backgroundLocation: location } })}>
        <AppImage src={b.photoUrl ?? undefined} alt="" className={styles.bizThumb} />
        <div className={styles.bizBody}>
          <span className={styles.bizName}>{b.name}</span>
          <span className={styles.bizMeta}>
            {b.category && <span className={styles.bizCat}><BizCatIcon category={b.category} size={12} />{bizCatLabel(b.category)}</span>}
            {b.address && <span className={styles.bizAddr}>{b.address}</span>}
          </span>
        </div>
      </button>
    </div>
  );

  const adAt = (i: number) => {
    if (ads.length === 0 || i % AD_EVERY !== 0) return null;
    const ord = Math.floor(i / AD_EVERY);
    if (ord >= adLimit) return null;
    const ad = ads[ord % ads.length];
    return <AdCard ad={ad} onClick={() => navigate(adHref(ad))} />;
  };

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setAdLimit((prev) => prev + randAdBatch());
    }
  };

  const sheetHeader = (
    <div className={styles.sheetHead}>
      <div className={styles.sheetTop}>
        {isSearching ? (
          <span className={styles.count}>
            {t('map.count', { count: searchScope === 'biz' ? bizSearchResults.length : searchResults.length })}
          </span>
        ) : (
          <>
            <div className={styles.segment}>
              {(['listings', 'feed', 'biz'] as Tab[]).map((tb) => (
                <button
                  key={tb}
                  type="button"
                  className={`${styles.segBtn} ${tab === tb ? styles.segActive : ''}`}
                  onClick={() => switchTab(tb)}
                >
                  {tb === 'listings' ? t('map.tabListings') : tb === 'feed' ? t('map.tabFeed') : t('map.tabBiz')}
                </button>
              ))}
            </div>
            {(tab === 'biz' ? listBizLoading : listLoading) && (bboxFilter || selectedRegion) ? (
              // 로딩은 리스트의 상태 — 지도 오버레이(토스트와 겹침)가 아니라 결과가
              // 도착할 자리(헤더 건수 위치)에 표시. 접힘/펼침 모두 보임.
              // 반드시 "현재 탭"의 리스트 fetch 만 본다 — 매물·피드 fetch(loading)는
              // 업체 탭에서도 돌기 때문에, 탭 무구분이면 업체 탭에서 지도를 움직일 때마다
              // 무관한 '불러오는 중'이 떴다 (2026-07-12 사용자 지적).
              <span className={styles.headLoading}>
                <span className={styles.mapSpinner} />
                {t('map.loading')}
              </span>
            ) : sheetSnap === 'collapsed' && centerWard ? (
              // 접힌 시트에선 리스트 ward 제목이 안 보이므로 현재 지역명을 여기서 표출
              // (mid/full 로 올라가면 wardTitle 이 역할 인계). 순수 정보 표시자 — 클릭 없음.
              <span className={styles.wardChip}>
                <MapPin size={12} fill="currentColor" />
                {centerWard.region.name}
                <span className={styles.wardChipCount}>· {t('map.count', { count: visibleCount })}</span>
              </span>
            ) : (
              <span className={styles.count}>{t('map.count', { count: visibleCount })}</span>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderBody = () => {
    if (isSearching) {
      const searchCount = searchScope === 'biz' ? bizSearchResults.length : searchResults.length;
      if (searchLoading && searchCount === 0) {
        return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
      }
      if (searchError) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('map.loadError')}</p>
            <button type="button" className={styles.emptyAction} onClick={retryLoad}>
              <RotateCw size={15} />
              <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
            </button>
          </div>
        );
      }
      if (searchCount === 0) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('map.emptySearch')}</p>
          </div>
        );
      }
      if (searchScope === 'biz') {
        return bizSearchResults.map(renderBizCard);
      }
      return searchResults.map((l, i) => (
        <Fragment key={l.id}>
          <div
            ref={(el) => { itemRefs.current[l.id] = el; }}
            className={l.id === selectedId ? styles.selected : undefined}
          >
            <ListingCard listing={l} onClick={() => navigate(`/market/${l.id}`, { state: { backgroundLocation: location } })} />
          </div>
          {adAt(i)}
        </Fragment>
      ));
    }
    // 줌 게이트(줌아웃)에서는 핀 fetch 가 생략돼 리스트도 함께 빈다 — 아래 탭별 빈 상태가
    // 노출되고, 줌인 유도는 지도 우측 zoomGateShort 힌트 필이 담당.
    // 지역선택 기능 비활성 (2026-07-12): ward 자동 추적 리스트로 대체되어 진입점 주석 처리
    // (동 탭 안내 가이드 — bbox 미커밋 시엔 아래 탭별 빈 상태가 대신 노출된다)
    // if (mode === 'viewport' && !bboxFilter) {
    //   return (
    //     <div className={styles.guideWrap}>
    //       <p className={styles.guide}>
    //         {t('map.selectArea')}
    //       </p>
    //       <button type="button" className={styles.guideAction} onClick={() => locateRef.current?.()}>
    //         <LocateFixed size={15} />
    //         <span>{t('map.locateMe')}</span>
    //       </button>
    //     </div>
    //   );
    // }
    if (tab === 'biz') {
      if (listBizLoading && listBiz.length === 0) {
        return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
      }
      if (bizError) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('map.loadError')}</p>
            <button type="button" className={styles.emptyAction} onClick={retryLoad}>
              <RotateCw size={15} />
              <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
            </button>
          </div>
        );
      }
      if (listBiz.length === 0) {
        // 찜 필터로 인한 0건은 "이 동네에 업체가 없다"가 아니라 "찜한 업체가 없다" — 관심목록
        // 화면(map.favorites.emptyBiz)과 동일 문구로 정직화
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{favOnly ? t('map.favorites.emptyBiz') : t('map.emptyBiz')}</p>
            {!favOnly && <p className={styles.emptyBody}>{t('map.emptyBizHint')}</p>}
          </div>
        );
      }
      return listBiz.map(renderBizCard);
    }
    const hasData = tab === 'listings' ? listings.length > 0 : posts.length > 0;
    if (listLoading && !hasData) {
      return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
    }
    if (listError) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            {t('map.loadError')}
          </p>
          <p className={styles.emptyBody}>
            {t('map.loadErrorDesc')}
          </p>
          <button type="button" className={styles.emptyAction} onClick={retryLoad}>
            <RotateCw size={15} />
            <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
          </button>
        </div>
      );
    }
    const emptyMsg = tab === 'listings'
      ? t('map.emptyListings')
      : t('map.emptyFeed');

    if (tab === 'listings') {
      return listListings.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{emptyMsg}</p>
          <p className={styles.emptyBody}>
            {mode === 'region' ? t('map.emptyWardHint') : t('map.emptyViewportHint')}
          </p>
          {mode === 'region' ? (
            <button type="button" className={styles.emptyAction} onClick={switchToViewport}>
              {t('map.scopeViewport')}
            </button>
          ) : (
            <button type="button" className={styles.emptyGhost} onClick={() => locateRef.current?.()}>
              {t('map.locateMe')}
            </button>
          )}
        </div>
      ) : (
        listListings.map((l, i) => (
          <Fragment key={l.id}>
            <div
              ref={(el) => { itemRefs.current[l.id] = el; }}
              className={l.id === selectedId ? styles.selected : undefined}
            >
              <ListingCard listing={l} onClick={() => navigate(`/market/${l.id}`, { state: { backgroundLocation: location } })} />
            </div>
            {adAt(i)}
          </Fragment>
        ))
      );
    }

    return listPosts.length === 0 ? (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>{emptyMsg}</p>
        <p className={styles.emptyBody}>
          {mode === 'region' ? t('map.emptyWardHint') : t('map.emptyViewportHint')}
        </p>
        {mode === 'region' ? (
          <button type="button" className={styles.emptyAction} onClick={switchToViewport}>
            {t('map.scopeViewport')}
          </button>
        ) : (
          <button type="button" className={styles.emptyGhost} onClick={() => locateRef.current?.()}>
            {t('map.locateMe')}
          </button>
        )}
      </div>
    ) : (
      listPosts.map((p, i) => {
        const isExpanded = expandedPostId === p.id;
        return (
          <Fragment key={p.id}>
            <div
              ref={(el) => { itemRefs.current[p.id] = el; }}
              className={`${styles.feedCard} ${p.id === selectedId ? styles.selected : ''}`}
            >
              <div
                className={styles.feedRow}
                role="button"
                tabIndex={0}
                onClick={() => setExpandedPostId(isExpanded ? null : p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedPostId(isExpanded ? null : p.id);
                  }
                }}
              >
                <button
                  type="button"
                  className={styles.feedAvatarBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (user && p.userId === user.id) navigate('/profile');
                    else setProfileCardUserId(p.userId);
                  }}
                >
                  <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.feedAvatar} variant="circle" />
                </button>
                <div className={styles.feedBody}>
                  <span className={styles.feedName}>{p.userNickname ?? '—'}</span>
                  {p.caption && <p className={styles.feedCaption}>{p.caption}</p>}
                </div>
                {p.photoUrl && !isExpanded && (
                  <div className={styles.feedThumbWrap}>
                    <AppImage src={p.photoUrl} alt="" className={styles.feedThumbImg} />
                  </div>
                )}
                <span className={styles.feedChevron}>{isExpanded ? '▲' : '▽'}</span>
              </div>
              {isExpanded && (
                <div className={styles.feedExpanded}>
                  {p.photoUrl && (
                    <div className={styles.feedExpandedImgWrap}>
                      <AppImage src={p.photoUrl} alt="" />
                    </div>
                  )}
                  {p.caption && <p className={styles.feedExpandedCaption}>{p.caption}</p>}
                  {p.hashtags.length > 0 && (
                    <div className={styles.feedHashtags}>
                      {p.hashtags.map((tag) => (
                        <span key={tag} className={styles.feedHashtag}>#{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className={styles.feedMeta}>
                    <span>🔥 {p.cheerCount}</span>
                    <span>💬 {p.commentCount}</span>
                    <span className={styles.feedTime}>{formatRelativeTime(p.createdAt)}</span>
                  </div>
                </div>
              )}
            </div>
            {adAt(i)}
          </Fragment>
        );
      })
    );
  };

  // 지도보기 필 노출 조건 (당근 레퍼런스 하단 floating) — 검색/포스트패널 중엔 숨김
  const showMapViewPill = sheetSnap === 'full' && !isSearching && !postPanelOpen;
  // 리스트 상단 지역 제목 (당근 '이웃들이 찾는 ○○' 스타일) — centerWard 는 viewport 모드·
  // 커버리지 안에서만 값을 가진다(그 외 자동 null) — 검색 중엔 별도로 숨긴다.
  const wardTitleKey = tab === 'listings' ? 'map.wardTitle.listings' : tab === 'feed' ? 'map.wardTitle.feed' : 'map.wardTitle.biz';

  return (
    <div className={styles.root} ref={rootRef}>
      <SaigonMapV5
        className={styles.map}
        height="100%"
        initialGps={storedCoords ?? undefined}
        // locateOnMount 미사용 — 진입 시 GPS 자동 측정 금지(service-rules 원칙 1·2).
        // 최초 방문은 전역 배지 + 줌 게이트 가이드([내 동네 보기] = 명시적 GPS)로 안내
        initialViewport={savedViewport ?? undefined}
        markers={markers}
        anchorOverlay={postPanelOpen ? undefined : tab === 'biz' ? bizNewsOverlay : tab === 'listings' ? listingOverlay : feedOverlay}
        // 배지(집계) 미사용 — 지도와 시트는 동일 데이터 소스(bbox 조회 결과)만 표시.
        // 게이트 줌 진입 전에는 지도·시트 모두 비우고 가이드로 안내 (기획 260707)
        // 지역선택 기능 비활성 (2026-07-12): ward 자동 추적 리스트로 대체되어 진입점 주석 처리
        // onRegionSelect={handleRegionSelect}
        onMapTap={() => { setSelectedBiz(null); setSelectedListing(null); setSelectedPost(null); }}
        onBboxChange={handleBboxChange}
        onRawViewportChange={handleRawBboxChange}
        onDepthChange={setShowDistrictBadges}
        onLocated={handleLocated}
        emitBboxRef={emitBboxRef}
        outsideAreaMessage={t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' })}
        locateRef={locateRef}
        searchFitRef={searchFitRef}
        forceMarkers={isSearching}
        polyActive={mode === 'region'}
        onLocate={mode === 'region' ? resetToViewport : undefined}
        selectRegionOnLocate={false}
        focusPointRef={focusPointRef}
        zoomInRef={zoomInRef}
        bottomInsetPx={postPanelOpen ? postPanelHeight : sheetVisibleHeight}
        topInsetPx={tab === 'biz' && !isSearching ? SEARCH_BAR_HEIGHT + CATEGORY_CHIPS_HEIGHT : SEARCH_BAR_HEIGHT}
        queryTopInsetPx={queryTopInsetPx}
        queryBottomInsetPx={collapsedSheetHeight}
        showLocateControl={false}
      />

      {poiError && !isSearching && (
        <button
          type="button"
          className={styles.emptyAction}
          onClick={retryLoad}
          style={{ position: 'absolute', top: 70, right: 12, zIndex: 4 }}
        >
          <RotateCw size={15} />
          <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
        </button>
      )}

      <div className={styles.searchOverlay} ref={searchOverlayRef}>
        <SearchBox
          value={submittedQuery}
          onChange={clearSearch}
          placeholder={t('map.searchPlaceholder')}
          readOnly
          onClick={() => setSearchPanelOpen(true)}
        />
        <button
          type="button"
          className={styles.mapProfileButton}
          onClick={() => navigate('/map/profile')}
          aria-label={t('map.neighborhoodProfile.title')}
        >
          {user?.avatarUrl ? <AppImage src={user.avatarUrl} alt="" className={styles.mapProfileAvatar} variant="circle" /> : <span>{(user?.nickname || t('map.neighborhoodProfile.defaultNickname')).charAt(0).toUpperCase()}</span>}
        </button>
      </div>

      {/* backdrop 이 mapTools 보다 DOM 상 먼저(z-index 동률 시 이후 요소가 위) 와야
          ♥/+ 버튼 자체(재탭 포함)는 계속 눌리고, 그 외 바깥 탭만 메뉴를 닫는다. */}
      {addMenuOpen && <div className={styles.addMenuBackdrop} onClick={() => setAddMenuOpen(false)} />}

      {/* 지도 전용 도구. 내 위치는 기존 GPS 동작 그대로, ♥/+ 는 실배선(찜 필터·글쓰기 메뉴).
          시트 상단 바로 위(12~16px 여백)로 밀착 — --sheet-visible-h CSS 변수를 그대로 따라가며
          드래그에도 연동된다(리렌더 없이 프레임당 변수 1회 갱신). full 스냅에서는 시트가
          검색바/칩 아래까지 올라오므로 겹치지 않게 숨긴다. */}
      {!isSearching && !placePinMode && (
        <div
          ref={setMapToolsRef}
          className={styles.mapTools}
          style={
            postPanelOpen && postPanelHeight > 0
              ? { bottom: postPanelHeight + 14 }
              : sheetSnap === 'full'
                ? { display: 'none' }
                : { bottom: 'calc(var(--sheet-visible-h, 0px) + 14px)' }
          }
        >
          <button type="button" className={styles.mapToolButton} onClick={() => locateRef.current?.()} aria-label={t('map.locateMe')}>
            <LocateFixed size={18} strokeWidth={2.3} />
          </button>
          <button
            type="button"
            className={`${styles.mapToolButton} ${favOnly ? styles.mapToolButtonActive : ''}`}
            onClick={toggleFavOnly}
            aria-label={t('map.favoriteFilterLabel')}
            aria-pressed={favOnly}
          >
            <Heart size={17} strokeWidth={2.2} fill={favOnly ? 'currentColor' : 'none'} />
          </button>
          <div className={styles.addWrap}>
            <button
              type="button"
              className={`${styles.mapToolButton} ${addMenuOpen ? styles.mapToolButtonActive : ''}`}
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-label={t('map.addMenu.label')}
              aria-expanded={addMenuOpen}
            >
              <Plus size={18} strokeWidth={2.3} className={`${styles.addIcon} ${addMenuOpen ? styles.addIconOpen : ''}`} />
            </button>
            {addMenuOpen && (
              <div className={styles.addMenu}>
                <button type="button" className={styles.addMenuItem} onClick={handleWriteReview}>
                  {t('map.addMenu.writeReview')}
                </button>
                <button type="button" className={styles.addMenuItem} onClick={handleSuggestPlace}>
                  {t('map.addMenu.suggestPlace')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 줌 게이트 힌트 필 — mapTools 와 세트로 시트를 따라가는 지도 우측 floating.
          숨김 규칙(검색·full 스냅·포스트패널)은 mapTools 와 동일 + 게이트 미통과일 때만 노출.
          탭 = 현재 뷰포트 중심으로 순수 확대(zoomInRef). */}
      {!isSearching && !placePinMode && mode === 'viewport' && showDistrictBadges && (
        <button
          type="button"
          ref={setZoomPillRef}
          className={styles.zoomHintPill}
          style={
            postPanelOpen && postPanelHeight > 0
              ? { bottom: postPanelHeight + 14 }
              : sheetSnap === 'full'
                ? { display: 'none' }
                : { bottom: 'calc(var(--sheet-visible-h, 0px) + 14px)' }
          }
          onClick={() => (viewportCenter ? zoomInRef.current?.(viewportCenter) : locateRef.current?.())}
        >
          🔍 {t('map.zoomGateShort', { defaultValue: '확대해서 주변 보기' })}
        </button>
      )}

      {/* 업체 카테고리 칩 (SGR-324, W3-FE DB화) — 업체 탭 전용, 검색바 아래 가로 스크롤 (당근 IN-1) */}
      {tab === 'biz' && !isSearching && (
        <div className={styles.chipsOverlay} ref={chipsOverlayRef}>
          {[null, ...bizCategories.map((c) => c.code)].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              className={`${styles.catChip} ${bizCategory === c ? styles.catChipActive : ''}`}
              onClick={() => setBizCategory(c)}
            >
              {c && <BizCatIcon category={c} size={13} />}
              {c ? bizCatLabel(c) : t('map.bizCategoryAll')}
            </button>
          ))}
          <button type="button" className={styles.catChip} onClick={() => navigate('/map/categories')}>
            <SlidersHorizontal size={13} />
            {t('map.moreCategories')}
          </button>
        </div>
      )}

      {searchPanelOpen && (
        <div className={styles.searchPanel} style={lockedPanelHeight != null ? { height: lockedPanelHeight } : undefined}>
          <div className={styles.searchPanelHeader}>
            <button type="button" className={styles.searchPanelBack} onClick={closeSearchPanel} aria-label={t('common.back', { defaultValue: '뒤로' })}>
              <ChevronLeft size={24} strokeWidth={2.2} />
            </button>
            <SearchBox
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('map.searchPlaceholder')}
              autoFocus
              onSubmit={submitSearch}
              className={styles.searchPanelBox}
            />
          </div>
          {recentSearches.length > 0 && (
            <div className={styles.searchPanelBody}>
              <div className={styles.searchPanelSectionHead}>
                <span>{t('map.recentSearches')}</span>
                <button type="button" onClick={clearRecentSearches}>{t('map.clearAll')}</button>
              </div>
              <div className={styles.recentChips}>
                {recentSearches.map((kw) => (
                  <span key={kw} className={styles.recentChip}>
                    <button type="button" onClick={() => submitSearch(kw)}>{kw}</button>
                    <button type="button" onClick={() => removeRecentSearch(kw)} aria-label={t('common.clear', { defaultValue: '지우기' })}>
                      <X size={12} strokeWidth={2.4} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 포스트 패널이 시트를 "대체" — unmount 하면 snap/스크롤 상태가 날아가므로 display 숨김 (W2 분석 판정).
          핀 재배치 모드도 동일하게 숨겨 하단 확인/취소 바와 겹치지 않게 한다. */}
      <div style={{ display: postPanelOpen || placePinMode ? 'none' : undefined }}>
      <DraggableSheet
        ref={sheetRef}
        header={sheetHeader}
        embedded
        initialSnap="collapsed"
        floatingTopLeft={!isSearching && selectedRegion ? (
          <button
            type="button"
            className={styles.areaPill}
            onClick={clearRegionFilter}
            aria-label={t('map.clearRegion')}
          >
            <span className={styles.areaPillIcon}>
              <MapPin size={13} fill="currentColor" />
            </span>
            <span>{selectedRegion.name}</span>
            <span className={styles.areaPillClose}><X size={15} strokeWidth={2.4} /></span>
          </button>
        ) : undefined}
        // 지도보기 필을 시트 바깥 하단 floating 버튼으로 이동(아래 참조) — 위쪽에 확보된
        // 여백만큼 maxHeight 를 65vh → 72vh 로 확장했으나, 72vh는 px 기반 상단 고정 영역
        // (status-bar + 검색바 + 카테고리 칩 행)과 기기에 따라 겹쳤다(SGR-full-snap-overlap).
        // DraggableSheet.resolveLength 가 calc() 문자열을 파싱하지 못해(vh/px suffix만 지원)
        // calc(100dvh - ...) 로 상단 고정 영역 기준 clamp 하는 방식은 적용 불가 — 공유 컴포넌트
        // (RideNav 등 다른 소비자도 사용) 파싱 로직을 건드리는 대신 vh 값을 69vh로 하향해
        // 칩 행 하단과 최소 8px 이상 여백을 확보한다.
        maxHeight="69vh"
        midHeight="42vh"
        lockHeight
        onVisibleHeightChange={handleSheetVisibleHeightLive}
        onVisibleHeightSettle={setSheetVisibleHeight}
        onSnapChange={setSheetSnap}
      >
        <div ref={listRef} className={`${styles.list} ${showMapViewPill ? styles.listPillPad : ''}`} onScroll={handleListScroll}>
          {!isSearching && centerWard && (
            <p className={styles.wardTitle}>{t(wardTitleKey, { area: centerWard.region.name })}</p>
          )}
          {renderBody()}
        </div>
      </DraggableSheet>
      </div>

      {/* 지도보기 필 — 시트 full 스냅일 때 탭바 바로 위 하단 중앙 floating (당근 레퍼런스) */}
      {showMapViewPill && (
        <button
          type="button"
          className={styles.mapViewPill}
          onClick={() => sheetRef.current?.collapse()}
        >
          <MapPin size={14} /> {t('map.viewMap')}
        </button>
      )}

      {postPanelOpen && carouselItems.length > 0 && (
        <PostPanel
          items={carouselItems}
          index={carouselIndex}
          viewerCount={viewerCount}
          catLabel={bizCatLabel}
          onIndexChange={handleCarouselIndex}
          onCardTap={(it) => {
            // 오버레이 진입 — 지도를 유지한 채 상세를 얹는다 (App.tsx 라우트-모달)
            const state = { backgroundLocation: location };
            if (it.kind === 'biz') navigate(`/biz/${it.biz.id}`, { state });
            else if (it.kind === 'listing') navigate(`/market/${it.listing.id}`, { state });
            else navigate(`/feed/post/${it.post.id}`, { state }); // 피드 상세 (WorldMapV2 커뮤니티 카드와 동일 경로)
          }}
          onClose={closePostPanel}
          onHeightChange={setPostPanelHeight}
        />
      )}

      {reviewPickerItems && (
        <BizReviewPickerSheet
          items={reviewPickerItems}
          catLabel={bizCatLabel}
          onPick={(b) => {
            setReviewPickerItems(null);
            setReviewTarget({ id: b.id, name: b.name });
          }}
          onClose={() => setReviewPickerItems(null)}
        />
      )}

      {reviewTarget && (
        <BizReviewSheet
          profileId={reviewTarget.id}
          profileName={reviewTarget.name}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {/* 장소 제안 시트 (인플레이스) — 핀 재배치 모드 동안 hidden 으로 마운트 유지 = 폼 값 보존 */}
      {placeSheet && (
        <PlaceSuggestSheet
          coords={placeSheet.coords}
          wardName={placeSheet.wardName}
          hidden={placePinMode}
          onPickLocation={() => setPlacePinMode(true)}
          onClose={() => setPlaceSheet(null)}
        />
      )}

      {/* 핀 재배치 모드 — 지도 중앙 고정 크로스헤어 + 하단 확인/취소 바. 지도 팬으로 좌표 재지정.
          onBboxChange(크롭 bbox)는 상/하 UI크롬 인셋만큼 비대칭 크롭돼 있어 더 이상 컨테이너
          기하 중심과 일치하지 않는다 — confirmPlacePin은 반드시 onRawViewportChange(raw, 크롭
          이전) 기반 latestRawBboxRef 중심을 써야 크로스헤어(컨테이너 정중앙 50%/50%)와 시각적으로
          일치한다. */}
      {placePinMode && (
        <>
          <div className={styles.pinCrosshair} aria-hidden>
            <MapPin size={40} strokeWidth={2} fill="var(--brand-500)" color="#fff" />
          </div>
          <div className={styles.pinBar}>
            <p className={styles.pinHint}>{t('map.neighborhoodProfile.placeForm.pinHint')}</p>
            <div className={styles.pinBarActions}>
              <button type="button" className={styles.pinCancel} onClick={() => setPlacePinMode(false)}>
                {t('map.neighborhoodProfile.placeForm.pinCancel')}
              </button>
              <button type="button" className={styles.pinConfirm} onClick={confirmPlacePin}>
                {t('map.neighborhoodProfile.placeForm.pinConfirm')}
              </button>
            </div>
          </div>
        </>
      )}

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />
    </div>
  );
}
