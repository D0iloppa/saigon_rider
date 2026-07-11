import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Heart, LocateFixed, MapPin, Plus, RotateCw, SlidersHorizontal, X } from 'lucide-react';
import SaigonMapV5 from '@/components/maps/SaigonMapV5';
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
import { BIZ_CAT_ICON_PATH } from '@/components/maps/bizCategoryIcons';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import { fetchFeed } from '@/api/feed';
import { PostPanel } from '@/pages/map/PostPanel';
import BizReviewPickerSheet from '@/pages/map/BizReviewPickerSheet';
import BizReviewSheet from '@/pages/biz/BizReviewSheet';
import { useBizViewerCount } from '@/hooks/useBizViewerCount';
import type { FeedPost } from '@/api/types';
import ListingCard from '@/pages/market/ListingCard';
import AdCard from '@/pages/market/AdCard';
import { ProfileCard } from '@/components/ProfileCard';
import { formatRelativeTime } from '@/lib/format';
import styles from './NeighborhoodMap.module.css';

type Tab = 'listings' | 'feed' | 'biz';
type BrowseMode = 'viewport' | 'region';
const AD_EVERY = 4;
const LISTING_COLOR = '#ff6f3c';
const FEED_COLOR = '#3b82f6';
// 업체 핀 (SGR-323) — teardrop 핀 브랜드 오렌지 (당근 레퍼런스). 탭 배타 구조라 매물 원형
// 핀(#ff6f3c)과 동시 노출되지 않으며, 선택링·집계배지의 #ff5a1f 와 통일한다.
const BIZ_COLOR = '#ff5a1f';
// 자동 말풍선 (2026-07-11) — 뷰포트 세로 스팬이 이 값 이하일 때만 중앙 근접 업체를 터치 없이
// 활성화한다. 세로 폰(≈2.16:1)에서 lat 스팬은 lng 스팬의 2배+ 로 복원되므로 0.03(가로 ≈1.5km,
// 동 단위 줌인)으로 잡는다. 반경은 뷰포트 스팬 대비 정규화 거리(0.5=화면 가장자리).
const AUTO_BUBBLE_MAX_LAT_SPAN = 0.03;
const AUTO_BUBBLE_CENTER_RADIUS = 0.25;
// 업체 탭 카테고리 칩 줄 높이 — 지도 확대/축소 버튼을 그 아래로 밀어내는 데 사용
const CATEGORY_CHIPS_HEIGHT = 42;
// SearchBox 높이(44px) + searchOverlay 상단 여백(10px) — 지도 확대/축소 버튼이 검색창 아래로 오도록
const SEARCH_BAR_HEIGHT = 54;
const RECENT_SEARCH_KEY = 'sr_map_recent_searches';
const RECENT_SEARCH_MAX = 8;
// 마지막 뷰포트 기억 — 재진입 시 복원용 (측정이 아닌 "기억"이라 GPS 원칙 위반 아님)
const VIEWPORT_KEY = 'sgr.map.viewport';
// BizPublic(/biz/:id) 이동 직전 지도 컨텍스트 스냅샷 — 뒤로가기(POP) 복귀 시 1회 소비
// (MarketMain mkt_filter_v2 미러). 뷰포트는 VIEWPORT_KEY 가 별도로 복원하므로 담지 않는다.
const BIZ_RETURN_KEY = 'sgr.map.bizReturn';
const LISTINGS_PAGE_SIZE = 50;
// 지도 핀은 리스트 페이지네이션과 달리 뷰포트 안의 매물이 전부 보여야 한다 —
// 1페이지(50건)만 가져오면 recent 정렬 특성상 활동이 뜸한 구역이 잘려나가 특정 방향에
// 핀이 안 보이는 문제가 생김. total을 다 채울 때까지 이어서 가져오되, 극단적으로 넓은
// 뷰포트에서 무한정 요청하지 않도록 상한만 둔다.
const MAX_MAP_LISTINGS = 300;
// 로딩 표시가 너무 짧게 반짝이고 사라지면 눈에 안 띄므로 최소 노출 시간을 보장한다.
const MIN_LOADING_MS = 2000;

async function fetchAllListings(params: Parameters<typeof fetchListings>[0]): Promise<Listing[]> {
  const acc: Listing[] = [];
  let page = 1;
  for (;;) {
    const res = await fetchListings({ ...params, page, size: LISTINGS_PAGE_SIZE });
    acc.push(...res.items);
    if (acc.length >= res.total || res.items.length < LISTINGS_PAGE_SIZE || acc.length >= MAX_MAP_LISTINGS) break;
    page++;
  }
  // offset 페이지네이션은 정렬 동률에서 페이지 간 중복/누락이 생길 수 있다(서버에 id
  // tie-breaker 를 넣었지만 방어적으로 중복 제거 — React 중복 key/ghost 카드 차단)
  const seen = new Set<string>();
  return acc.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
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

type BizReturnUi =
  | { kind: 'postPanel'; bizId: string; carouselIndex: number }
  | { kind: 'bubble'; bizId: string }
  | { kind: 'none' };

interface BizReturnSnapshot {
  tab: Tab;
  bizCategory: string | null;
  favOnly: boolean;
  ui: BizReturnUi;
  savedAt: number;
}

function readBizReturnSnapshot(): BizReturnSnapshot | null {
  try {
    const s = sessionStorage.getItem(BIZ_RETURN_KEY);
    return s ? (JSON.parse(s) as BizReturnSnapshot) : null;
  } catch {
    return null;
  }
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
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const storedCoords = useLocationStore((s) => s.coords);
  const setSharedCoords = useLocationStore((s) => s.setCoords);
  const setSharedWardName = useLocationStore((s) => s.setWardName);
  const user = useUserStore((s) => s.user);

  // BizPublic 뒤로가기(POP) 복귀에서만 스냅샷을 읽는다 — 탭바 신규 진입(PUSH/REPLACE)은
  // 기본 상태로 시작. 마운트 이펙트에서 진입 종류와 무관하게 즉시 삭제해 재적용을 차단한다.
  const [returnSnapshot] = useState(() => (navigationType === 'POP' ? readBizReturnSnapshot() : null));
  const [mode, setMode] = useState<BrowseMode>('viewport');
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [tab, setTab] = useState<Tab>(returnSnapshot?.tab ?? 'listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [bizItems, setBizItems] = useState<BizMapItem[]>([]);
  const [bizCategories, setBizCategories] = useState<BizCategory[]>([]);
  const [bizCategory, setBizCategory] = useState<string | null>(returnSnapshot?.bizCategory ?? null);
  const [bizLoading, setBizLoading] = useState(false);
  // 좌측 ♥ 버튼 = "찜한 업체만 보기" 토글 필터 (카테고리 칩과 AND 교집합, visibleBiz 에서 적용)
  const [favOnly, setFavOnly] = useState(returnSnapshot?.favOnly ?? false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  // 좌측 + 버튼 = 글쓰기 컨텍스트 메뉴 (후기쓰기/장소 제안하기)
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // 후기쓰기 플로우 — 대상 업체(작성 시트) / 후보 목록(선택 스텝). 둘 다 지도 위 오버레이라
  // 뒤로가기 스냅샷(sgr.map.bizReturn)·시트 상태와 무관하다.
  const [reviewTarget, setReviewTarget] = useState<{ id: string; name: string } | null>(null);
  const [reviewPickerItems, setReviewPickerItems] = useState<BizMapItem[] | null>(null);
  // 도시 전체 조망(줌아웃)용 — ward보다 굵은 district 단위 집계. listings 탭에서만 쓰임
  // (feed 탭은 이미 district 단위라 별도 조회가 불필요).
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 말풍선 데이터 = BizMapItem.latestNews (business_news 실데이터, 2026-07-11).
  // 소식이 없는 업체는 소개 카피(업종·주소)로 폴백한다.
  const [selectedBiz, setSelectedBiz] = useState<BizMapItem | null>(null);
  // 포스트 패널 (W2, 당근 레퍼런스) — 핀 "직접 터치" 시 바텀시트를 대체하는 캐러셀.
  // 항목은 열 때 스냅샷으로 고정 — 캐러셀이 유발한 recenter→bbox→visibleBiz 재계산이
  // 다시 순서를 흔드는 피드백 루프 방지. selectedBiz(자동 말풍선)와 상태를 공유하지 않는다.
  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const [carouselItems, setCarouselItems] = useState<BizMapItem[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [postPanelHeight, setPostPanelHeight] = useState(0);
  // 읽음 처리 직후 같은 데이터로도 markers(badge) 재계산을 트리거 (W4)
  const [readVersion, setReadVersion] = useState(0);
  const focusPointRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  // [X]로 닫은 업체는 다음 지도 조작(새 bbox 커밋)까지 자동 말풍선 1회 억제 (대표 결정 2026-07-11)
  const suppressAutoBubbleIdRef = useRef<string | null>(null);
  // 뒤로가기 복원 2단계(선택 UI) — 업체 데이터는 bbox fetch 후에야 도착하므로 보류해 두고,
  // 첫 fetch 완료 시 1회 소비한다 (MarketMain scrollRestoredRef 패턴).
  const pendingUiRestoreRef = useRef<Exclude<BizReturnUi, { kind: 'none' }> | null>(
    returnSnapshot && returnSnapshot.ui.kind !== 'none' ? returnSnapshot.ui : null,
  );
  // "fetch 가 실제로 완료됐는가" 표시 — 게이트/탭 전환의 setBizItems([]) 와 구분한다
  const bizFetchedRef = useRef(false);
  const focusedBiz = postPanelOpen ? carouselItems[carouselIndex] ?? null : null;
  const viewerCount = useBizViewerCount(focusedBiz?.id ?? null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [adLimit, setAdLimit] = useState(randAdBatch);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(0);
  const [sheetSnap, setSheetSnap] = useState<'full' | 'mid' | 'collapsed'>('collapsed');

  const sheetRef = useRef<DraggableSheetHandle>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const locateRef = useRef<(() => void) | null>(null);
  const emitBboxRef = useRef<(() => void) | null>(null);
  const searchFitRef = useRef<((points: { lat: number; lng: number }[]) => void) | null>(null);
  const [viewportBbox, setViewportBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const [showDistrictBadges, setShowDistrictBadges] = useState(true);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // 마운트 시 1회만 읽는다 — 이후 저장은 handleBboxChange 디바운스가 담당
  const [savedViewport] = useState(loadSavedViewport);

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
  }, []);

  // 의도적으로 visualViewport를 추적하지 않는다 — 키보드가 뜨든 말든 패널 크기는 100dvh 고정,
  // 키보드는 그 위에 순수 오버레이로만 뜨게 한다(탭바 포함 화면 전체를 항상 덮어야 함).

  useEffect(() => {
    if (!submittedQuery) { setSearchResults([]); setBizSearchResults([]); return; }
    let cancelled = false;
    setSearchLoading(true);
    const req = searchScope === 'biz'
      // 업체명 전역 검색 (SGR-326) — T1 API가 bbox 필수라 전 범위를 넘긴다 (상한 200건)
      ? fetchBizMapItems({ minLat: -90, maxLat: 90, minLng: -180, maxLng: 180, q: submittedQuery })
          .then((items) => {
            if (cancelled) return;
            setBizSearchResults(items);
            const points = items.map((b) => ({ lat: b.lat, lng: b.lng }));
            if (points.length > 0) searchFitRef.current?.(points);
          })
      : fetchListings({ q: submittedQuery, hideSold: true, size: 40 })
          .then((page) => {
            if (cancelled) return;
            const items = page.items ?? [];
            setSearchResults(items);
            const points = items.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat!, lng: l.lng! }));
            if (points.length > 0) searchFitRef.current?.(points);
          });
    req
      .catch(() => { if (!cancelled) { setSearchResults([]); setBizSearchResults([]); } })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [submittedQuery, searchScope]);

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

  const handleBboxChange = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => {
      // 뷰포트 기억: 이동/줌이 멎은 시점의 뷰포트를 저장 → 재진입 시 복원
      try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(bbox)); } catch { /* quota 등 저장 실패 무시 */ }
      suppressAutoBubbleIdRef.current = null; // 새 조작 = 억제 해제
      if (modeRef.current !== 'region') setViewportBbox(bbox);
    }, 500);
  }, []);

  // polyActive=true(내 위치 필터 ON)에는 선택 ward polygon 필터를 사용하고,
  // OFF 상태에서는 현재 지도 viewport 기준으로 주변 동네까지 함께 노출한다.
  const bboxFilter = useMemo(() => (mode === 'viewport' ? viewportBbox : null), [mode, viewportBbox]);

  useEffect(() => {
    fetchAds(null).then((a) => setAds(shuffle(a))).catch(() => setAds([]));
  }, []);

  // 업체 카테고리 (DB화, W3-FE) — 마운트 시 1회 fetch. 실패 시 빈 배열(칩 행에 '전체'와
  // [더보기]만 남아도 동작).
  useEffect(() => {
    fetchBizCategories().then(setBizCategories).catch(() => setBizCategories([]));
  }, []);

  // 복귀 스냅샷은 진입 즉시 삭제(1회 소비) — 소비 여부(POP/PUSH)와 무관하게 지워 이후
  // 진입에 재적용되지 않게 한다. favOnly 복원 시 찜 목록도 재조회해야 필터가 실제로
  // 동작한다 (toggleFavOnly ON 과 동일 경로·동일 실패 폴백). returnSnapshot 은 마운트 후
  // 불변이므로 이 이펙트는 1회만 돈다.
  useEffect(() => {
    sessionStorage.removeItem(BIZ_RETURN_KEY);
    if (returnSnapshot?.favOnly) {
      fetchBizFavorites()
        .then((favs) => setFavIds(new Set(favs.map((f) => f.id))))
        .catch(() => setFavIds(new Set()));
    }
  }, [returnSnapshot]);

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

  // 매물·피드 조회 — ward 선택 시 또는 뷰포트가 크게 넓어질 때 (검색 중엔 검색 결과만 사용)
  useEffect(() => {
    if (isSearching) return;
    // 줌 게이트: 구 집계 배지가 뜨는 줌아웃 상태에서는 리스트 fetch 자체를 생략한다
    // (배지용 district-counts는 별도 이펙트로 유지). 게이트를 넘는 줌인은 반드시
    // 새 bbox 커밋(bboxFilter 변경)을 동반하므로 그때 이 이펙트가 다시 돌아 fetch한다.
    if (modeRef.current === 'viewport' && showDistrictBadgesRef.current) {
      setLoading(false);
      return;
    }
    const center = bboxFilter
      ? { lat: (bboxFilter.N + bboxFilter.S) / 2, lng: (bboxFilter.E + bboxFilter.W) / 2 }
      : selectedRegion ? { lat: selectedRegion.lat, lng: selectedRegion.lng } : null;
    if (!center) return;
    const size = bboxFilter ? 50 : 40;
    let cancelled = false;
    const startedAt = Date.now();
    setLoading(true);
    setLoadError(false);
    Promise.allSettled([
      fetchAllListings({
        lat: center.lat,
        lng: center.lng,
        sort: 'recent',
        hideSold: true,
        ...(bboxFilter
          ? { minLat: bboxFilter.S, maxLat: bboxFilter.N, minLng: bboxFilter.W, maxLng: bboxFilter.E }
          : {}),
      }),
      fetchFeed({ filter: 'neighborhood', lat: center.lat, lng: center.lng, size }),
    ]).then(([lp, fp]) => {
      if (cancelled) return;
      const listingsOk = lp.status === 'fulfilled';
      const feedOk = fp.status === 'fulfilled';
      setListings(listingsOk ? lp.value ?? [] : []);
      setPosts(feedOk ? fp.value.items ?? [] : []);
      setLoadError(!listingsOk && !feedOk);
    }).finally(() => {
      if (cancelled) return;
      const remaining = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remaining > 0) setTimeout(() => { if (!cancelled) setLoading(false); }, remaining);
      else setLoading(false);
    });
    return () => { cancelled = true; };
  }, [bboxFilter, reloadSeq, selectedRegion, isSearching]);

  // 업체 핀 레이어 (SGR-323, G-1) — biz 탭에서만 노출되는 레이어. 매물·피드와 동일한
  // 줌 게이트를 지키며(결정사항 2), region 모드에서는 폴리곤 외접 bbox로 조회한다.
  useEffect(() => {
    if (isSearching) return;
    if (tab !== 'biz') { setBizItems([]); return; }
    if (modeRef.current === 'viewport' && showDistrictBadgesRef.current) {
      setBizItems([]);
      return;
    }
    const bbox = bboxFilter ?? (selectedRegion ? regionBbox(selectedRegion) : null);
    if (!bbox) { setBizItems([]); return; }
    let cancelled = false;
    setBizLoading(true);
    fetchBizMapItems({
      minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
      category: bizCategory ?? undefined,
    })
      .then((items) => { if (!cancelled) { bizFetchedRef.current = true; setBizItems(items); } })
      .catch(() => { if (!cancelled) { bizFetchedRef.current = true; setBizItems([]); } })
      .finally(() => { if (!cancelled) setBizLoading(false); });
    return () => { cancelled = true; };
  }, [bboxFilter, reloadSeq, selectedRegion, isSearching, bizCategory, tab]);

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
    if (isSearching) {
      if (searchScope === 'biz') {
        return bizSearchResults.map((b) => ({
          id: `biz:${b.id}`, lat: b.lat, lng: b.lng, kind: 'biz', color: BIZ_COLOR, r: 1.35, label: b.name,
          icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
          selected: focusedBiz?.id === b.id,
          badge: isNewsUnread(b.id, b.latestNews?.createdAt),
          onClick: () => handleBizMarkerClick(b),
        }));
      }
      return searchResults
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, color: LISTING_COLOR, onClick: () => handleMarkerClick(l.id) }));
    }
    const layers: MapMarkerV2[][] = [
      tab === 'listings'
        ? visibleListings
            .filter((l) => l.lat != null && l.lng != null)
            .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, color: LISTING_COLOR, onClick: () => handleMarkerClick(l.id) }))
        : tab === 'feed'
          ? visiblePosts
              .filter((p) => p.latitude != null && p.longitude != null)
              .map((p) => ({ id: p.id, lat: p.latitude!, lng: p.longitude!, color: FEED_COLOR, onClick: () => handleMarkerClick(p.id) }))
          // 업체 핀 — 색+라벨(상호명)+업종 글리프 (당근 IN-1 변형). biz 탭에서만 노출.
          : visibleBiz.map((b) => ({
              id: `biz:${b.id}`,
              lat: b.lat,
              lng: b.lng,
              kind: 'biz',
              color: BIZ_COLOR,
              r: 1.35,
              label: b.name,
              icon: b.category ? BIZ_CAT_ICON_PATH[b.category] : undefined,
              selected: focusedBiz?.id === b.id,
              badge: isNewsUnread(b.id, b.latestNews?.createdAt),
              onClick: () => handleBizMarkerClick(b),
            })),
    ];
    return layers.flat();
  }, [isSearching, searchScope, searchResults, bizSearchResults, tab, visibleListings, visiblePosts, visibleBiz, focusedBiz, readVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // useCallback 필수: SaigonMapV5의 onRegionSelect prop으로 전달되는데, 매 렌더마다
  // 새 함수를 넘기면 내부 focusLatLng/runLocate가 재생성되어 locateOnMount 이펙트가
  // 반복 재실행되며 GPS를 계속 재측정하는 루프가 발생함(관찰: 마운트 후 3초간 24회 호출).
  const handleRegionSelect = useCallback((region: SelectedRegion) => {
    setMode('region');
    setSelectedRegion(region);
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    setSelectedId(null);
    setExpandedPostId(null);
    setSelectedBiz(null);
    setPostPanelOpen(false);
    setSharedCoords({ lat: region.lat, lng: region.lng });
    setSharedWardName(region.name);
    // 시트 자동 올림 없음 — 지역 선택은 "지도 탐색 중" 신호지 리스트를 보겠다는 의도가
    // 아니다(UX 원칙: 시트는 사용자 의도로만 이동). 선택 결과는 접힘 헤더 칩/건수로 보인다.
  }, [setSharedCoords, setSharedWardName]);

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

  const handleMarkerClick = (id: string) => {
    setSelectedId(id);
    if (tab === 'feed') setExpandedPostId(id);
    // 핀 탭 = "이 매물을 보겠다"는 명시적 의도 — 시트를 올리되 지도(선택 핀)가 함께
    // 보이도록 mid 까지만 (full 확장은 지도 컨텍스트를 잃음)
    sheetRef.current?.snapToMid();
    requestAnimationFrame(() => {
      scrollItemIntoList(id);
    });
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
    setCarouselItems([biz, ...others]);
    setCarouselIndex(0);
    setPostPanelOpen(true);
    setSelectedBiz(null); // 자동 말풍선 상태와 분리 — 패널과 말풍선 이중 노출 방지
    setSelectedId(biz.id);
    focusPointRef.current?.({ lat: biz.lat, lng: biz.lng });
    markBizAsRead(biz);
  };

  const closePostPanel = () => {
    // 닫은 시점의 포커싱 업체 = 지도 중앙 업체 — 자동 말풍선이 즉시 재점화하지 않게 억제
    suppressAutoBubbleIdRef.current = focusedBiz?.id ?? null;
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
    const b = carouselItems[i];
    if (b) {
      setSelectedId(b.id);
      focusPointRef.current?.({ lat: b.lat, lng: b.lng });
      markBizAsRead(b);
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
  const saveBizReturnSnapshot = useCallback((panelBiz?: BizMapItem) => {
    const focused = panelBiz ?? focusedBiz;
    const ui: BizReturnUi = postPanelOpen && focused
      ? { kind: 'postPanel', bizId: focused.id, carouselIndex }
      : selectedBiz
        ? { kind: 'bubble', bizId: selectedBiz.id }
        : { kind: 'none' };
    const snap: BizReturnSnapshot = { tab, bizCategory, favOnly, ui, savedAt: Date.now() };
    try { sessionStorage.setItem(BIZ_RETURN_KEY, JSON.stringify(snap)); } catch { /* 저장 실패 시 복원만 포기 */ }
  }, [tab, bizCategory, favOnly, postPanelOpen, focusedBiz, carouselIndex, selectedBiz]);

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

  // 뒤로가기 복원 2단계 (선택 UI) — 업체 fetch 가 실제 완료된 뒤 1회만 소비한다. 대상이
  // 결과에 없으면(뷰포트 밖·삭제) 조용히 스킵. 반드시 자동 말풍선 이펙트 "뒤"에 선언:
  // 같은 커밋에서 둘이 함께 돌 때(이펙트는 선언 순서로 실행) 복원 setState 가 마지막에
  // 적용되고, 다음 커밋에서 selectedBizRef 동기화 → 자동 말풍선 deps 불변이라 안 덮어쓴다.
  useEffect(() => {
    const pending = pendingUiRestoreRef.current;
    if (!pending || !bizFetchedRef.current) return;
    pendingUiRestoreRef.current = null; // 첫 fetch 완료 시점에 무조건 소비 — 한참 뒤 팬 이동에서 재점화 방지
    const target = bizItems.find((b) => b.id === pending.bizId);
    if (!target) return;
    if (pending.kind === 'postPanel') {
      // 캐러셀은 최신 fetch 로 재구성(대상 카드 선두) — 원래 인덱스의 이웃 순서는 재현 불가
      openPostPanel(target);
    } else {
      setSelectedBiz(target);
      setSelectedId(target.id);
    }
  }, [bizItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTab = (tb: Tab) => {
    setTab(tb);
    setExpandedPostId(null);
    setSelectedId(null);
    if (tb !== 'biz') setSelectedBiz(null);
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

  const handleSuggestPlace = () => {
    setAddMenuOpen(false);
    // NeighborhoodProfile 의 기존 장소 제안 시트를 재사용 — 쿼리 파라미터로 자동 오픈
    // (?category= 소비 패턴 미러, 새 폼을 만들지 않는다)
    navigate('/map/profile?openPlaceForm=1');
  };

  const retryLoad = () => setReloadSeq((n) => n + 1);
  // useCallback 필수: SaigonMapV5의 onLocate prop으로 전달됨 (handleRegionSelect와 동일한 이유)
  const resetToViewport = useCallback(() => {
    setMode('viewport');
    setSelectedRegion(null);
    setSelectedId(null);
    setExpandedPostId(null);
    setSelectedBiz(null);
    setPostPanelOpen(false);
    // region 모드 중 쌓인 리스트/핀/카운트 잔재 제거 — 해제 후 "가이드+stale 헤더+stale 핀"
    // 3중 불일치 방지 (시나리오 4.3)
    setListings([]);
    setPosts([]);
    setBizItems([]);
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    // 현재 뷰포트 기준 bbox 재발행 → 게이트 이상이면 재조회, 미만이면 가이드로 정합
    emitBboxRef.current?.();
    // 시트 자동 이동 없음 — 해제 역시 지도 컨텍스트 복귀 액션 (UX 원칙 동일)
  }, []);
  const switchToViewport = () => {
    resetToViewport();
  };
  const clearRegionFilter = () => {
    resetToViewport();
  };

  const visibleCount = tab === 'listings' ? visibleListings.length : tab === 'feed' ? visiblePosts.length : visibleBiz.length;

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
        <button key={selectedBiz.id} type="button" className={styles.bizNewsBubble} onClick={() => { saveBizReturnSnapshot(); navigate(`/biz/${selectedBiz.id}`); }}>
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
  }, [selectedBiz, navigate, t, saveBizReturnSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // 업체 카드 — 업체 탭 리스트·업체 검색 결과 공용 (탭 시 /biz/:id)
  const renderBizCard = (b: BizMapItem) => (
    <div
      key={b.id}
      ref={(el) => { itemRefs.current[b.id] = el; }}
      className={b.id === selectedId ? styles.selected : undefined}
    >
      <button type="button" className={styles.bizCard} onClick={() => { saveBizReturnSnapshot(); navigate(`/biz/${b.id}`); }}>
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
            {loading && (bboxFilter || selectedRegion) ? (
              // 로딩은 리스트의 상태 — 지도 오버레이(토스트와 겹침)가 아니라 결과가
              // 도착할 자리(헤더 건수 위치)에 표시. 접힘/펼침 모두 보임
              <span className={styles.headLoading}>
                <span className={styles.mapSpinner} />
                {t('map.loading')}
              </span>
            ) : mode === 'viewport' && showDistrictBadges && sheetSnap === 'collapsed' ? (
              // 게이트 힌트 필은 접힘 전용 — 펼치면 본문 가이드가 안내를 담당(중복 버튼 방지)
              <button
                type="button"
                className={styles.zoomHintPill}
                // DraggableSheet 헤더의 onPointerDown 드래그 캡처가 클릭을 삼키므로 전파 차단
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => locateRef.current?.()}
              >
                🔍 {t('map.zoomGateShort', { defaultValue: '확대해서 주변 보기' })}
              </button>
            ) : mode === 'viewport' && showDistrictBadges ? null : (
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
            <ListingCard listing={l} onClick={() => navigate(`/market/${l.id}`)} />
          </div>
          {adAt(i)}
        </Fragment>
      ));
    }
    // 줌 게이트: 줌아웃(구 집계 배지) 상태에서는 리스트 대신 확대 가이드 — 매물/피드 공통
    if (mode === 'viewport' && showDistrictBadges) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{t('map.zoomGateHint')}</p>
          <button type="button" className={styles.emptyAction} onClick={() => locateRef.current?.()}>
            {t('map.zoomGateMyArea')}
          </button>
        </div>
      );
    }
    if (mode === 'viewport' && !bboxFilter) {
      return (
        <div className={styles.guideWrap}>
          <p className={styles.guide}>
            {t('map.selectArea')}
          </p>
          <button type="button" className={styles.guideAction} onClick={() => locateRef.current?.()}>
            <LocateFixed size={15} />
            <span>{t('map.locateMe')}</span>
          </button>
        </div>
      );
    }
    if (tab === 'biz') {
      if (bizLoading && visibleBiz.length === 0) {
        return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
      }
      if (visibleBiz.length === 0) {
        // 찜 필터로 인한 0건은 "이 동네에 업체가 없다"가 아니라 "찜한 업체가 없다" — 관심목록
        // 화면(map.favorites.emptyBiz)과 동일 문구로 정직화
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{favOnly ? t('map.favorites.emptyBiz') : t('map.emptyBiz')}</p>
            {!favOnly && <p className={styles.emptyBody}>{t('map.emptyBizHint')}</p>}
          </div>
        );
      }
      return visibleBiz.map(renderBizCard);
    }
    const hasData = tab === 'listings' ? listings.length > 0 : posts.length > 0;
    if (loading && !hasData) {
      return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
    }
    if (loadError) {
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
      return visibleListings.length === 0 ? (
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
        visibleListings.map((l, i) => (
          <Fragment key={l.id}>
            <div
              ref={(el) => { itemRefs.current[l.id] = el; }}
              className={l.id === selectedId ? styles.selected : undefined}
            >
              <ListingCard listing={l} onClick={() => navigate(`/market/${l.id}`)} />
            </div>
            {adAt(i)}
          </Fragment>
        ))
      );
    }

    return visiblePosts.length === 0 ? (
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
      visiblePosts.map((p, i) => {
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
        anchorOverlay={postPanelOpen ? undefined : bizNewsOverlay}
        // 배지(집계) 미사용 — 지도와 시트는 동일 데이터 소스(bbox 조회 결과)만 표시.
        // 게이트 줌 진입 전에는 지도·시트 모두 비우고 가이드로 안내 (기획 260707)
        onRegionSelect={handleRegionSelect}
        onMapTap={() => setSelectedBiz(null)}
        onBboxChange={handleBboxChange}
        onDepthChange={setShowDistrictBadges}
        onLocated={setSharedCoords}
        emitBboxRef={emitBboxRef}
        outsideAreaMessage={t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' })}
        locateRef={locateRef}
        searchFitRef={searchFitRef}
        forceMarkers={isSearching}
        polyActive={mode === 'region'}
        onLocate={mode === 'region' ? resetToViewport : undefined}
        selectRegionOnLocate={false}
        focusPointRef={focusPointRef}
        bottomInsetPx={postPanelOpen ? postPanelHeight : sheetVisibleHeight}
        topInsetPx={tab === 'biz' && !isSearching ? SEARCH_BAR_HEIGHT + CATEGORY_CHIPS_HEIGHT : SEARCH_BAR_HEIGHT}
        showLocateControl={false}
      />

      <div className={styles.searchOverlay}>
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

      {/* 지도 전용 도구. 내 위치는 기존 GPS 동작 그대로, ♥/+ 는 실배선(찜 필터·글쓰기 메뉴). */}
      {!isSearching && (
        <div className={styles.mapTools}>
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
              className={styles.mapToolButton}
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-label={t('map.addMenu.label')}
              aria-expanded={addMenuOpen}
            >
              <Plus size={18} strokeWidth={2.3} />
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

      {/* 업체 카테고리 칩 (SGR-324, W3-FE DB화) — 업체 탭 전용, 검색바 아래 가로 스크롤 (당근 IN-1) */}
      {tab === 'biz' && !isSearching && (
        <div className={styles.chipsOverlay}>
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

      {/* 포스트 패널이 시트를 "대체" — unmount 하면 snap/스크롤 상태가 날아가므로 display 숨김 (W2 분석 판정) */}
      <div style={{ display: postPanelOpen ? 'none' : undefined }}>
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
        floatingTopCenter={sheetSnap === 'full' ? (
          <button
            type="button"
            className={styles.mapViewPill}
            onClick={() => sheetRef.current?.collapse()}
          >
            <MapPin size={14} /> {t('map.viewMap')}
          </button>
        ) : undefined}
        maxHeight="65vh"
        midHeight="42vh"
        lockHeight
        onVisibleHeightChange={setSheetVisibleHeight}
        onSnapChange={setSheetSnap}
      >
        <div ref={listRef} className={styles.list} onScroll={handleListScroll}>{renderBody()}</div>
      </DraggableSheet>
      </div>

      {postPanelOpen && carouselItems.length > 0 && (
        <PostPanel
          items={carouselItems}
          index={carouselIndex}
          viewerCount={viewerCount}
          catLabel={bizCatLabel}
          onIndexChange={handleCarouselIndex}
          onCardTap={(b) => { saveBizReturnSnapshot(b); navigate(`/biz/${b.id}`); }}
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

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />
    </div>
  );
}
