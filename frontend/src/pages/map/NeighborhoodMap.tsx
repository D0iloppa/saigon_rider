import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, LocateFixed, MapPin, RotateCw, X } from 'lucide-react';
import SaigonMapV5 from '@/components/maps/SaigonMapV5';
import { regionContains, type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
import DraggableSheet, { type DraggableSheetHandle } from '@/components/ride/DraggableSheet';
import { AppImage } from '@/components/ui/AppImage';
import { SearchBox } from '@/components/ui/SearchBox';
import { shuffle, randAdBatch } from '@/lib/shuffle';
import { useLocationStore } from '@/store/useLocationStore';
import { useUserStore } from '@/store/useUserStore';
import { fetchListings, fetchAds, type ListingCard as Listing, type MarketAd } from '@/api/market';
import { fetchFeed } from '@/api/feed';
import { fetchDistrictCounts, type DistrictCount } from '@/api/map';
import type { FeedPost } from '@/api/types';
import ListingCard from '@/pages/market/ListingCard';
import AdCard from '@/pages/market/AdCard';
import { ProfileCard } from '@/components/ProfileCard';
import { formatRelativeTime } from '@/lib/format';
import styles from './NeighborhoodMap.module.css';

type Tab = 'listings' | 'feed';
type BrowseMode = 'viewport' | 'region';
const AD_EVERY = 4;
const LISTING_COLOR = '#ff6f3c';
const FEED_COLOR = '#3b82f6';
// SearchBox 높이(44px) + searchOverlay 상단 여백(10px) — 지도 확대/축소 버튼이 검색창 아래로 오도록
const SEARCH_BAR_HEIGHT = 54;
const RECENT_SEARCH_KEY = 'sr_map_recent_searches';
const RECENT_SEARCH_MAX = 8;
// 마지막 뷰포트 기억 — 재진입 시 복원용 (측정이 아닌 "기억"이라 GPS 원칙 위반 아님)
const VIEWPORT_KEY = 'sgr.map.viewport';
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
  return acc;
}

type LatLngBbox = { N: number; S: number; E: number; W: number };

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storedCoords = useLocationStore((s) => s.coords);
  const storedWardName = useLocationStore((s) => s.wardName);
  const setSharedCoords = useLocationStore((s) => s.setCoords);
  const setSharedWardName = useLocationStore((s) => s.setWardName);
  const user = useUserStore((s) => s.user);

  const [mode, setMode] = useState<BrowseMode>('viewport');
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [districtCounts, setDistrictCounts] = useState<DistrictCount[]>([]);
  // 도시 전체 조망(줌아웃)용 — ward보다 굵은 district 단위 집계. listings 탭에서만 쓰임
  // (feed 탭은 이미 district 단위라 별도 조회가 불필요).
  const [cityCounts, setCityCounts] = useState<DistrictCount[]>([]);
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [adLimit, setAdLimit] = useState(randAdBatch);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(0);

  const sheetRef = useRef<DraggableSheetHandle>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const locateRef = useRef<(() => void) | null>(null);
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
    if (trimmed) addRecentSearch(trimmed);
    setSearchPanelOpen(false);
  }, [addRecentSearch]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSubmittedQuery('');
  }, []);

  // 의도적으로 visualViewport를 추적하지 않는다 — 키보드가 뜨든 말든 패널 크기는 100dvh 고정,
  // 키보드는 그 위에 순수 오버레이로만 뜨게 한다(탭바 포함 화면 전체를 항상 덮어야 함).

  useEffect(() => {
    if (!submittedQuery) { setSearchResults([]); return; }
    let cancelled = false;
    setSearchLoading(true);
    fetchListings({ q: submittedQuery, hideSold: true, size: 40 })
      .then((page) => {
        if (cancelled) return;
        const items = page.items ?? [];
        setSearchResults(items);
        const points = items.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat!, lng: l.lng! }));
        if (points.length > 0) searchFitRef.current?.(points);
      })
      .catch(() => { if (!cancelled) setSearchResults([]); })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [submittedQuery]);

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
      if (modeRef.current !== 'region') setViewportBbox(bbox);
    }, 500);
  }, []);

  // polyActive=true(내 위치 필터 ON)에는 선택 ward polygon 필터를 사용하고,
  // OFF 상태에서는 현재 지도 viewport 기준으로 주변 동네까지 함께 노출한다.
  const bboxFilter = useMemo(() => (mode === 'viewport' ? viewportBbox : null), [mode, viewportBbox]);

  useEffect(() => {
    fetchAds(null).then((a) => setAds(shuffle(a))).catch(() => setAds([]));
  }, []);

  useEffect(() => { setAdLimit(randAdBatch()); }, [tab, mode, selectedRegion?.name]);

  useEffect(() => {
    fetchDistrictCounts(tab).then(setDistrictCounts).catch(() => setDistrictCounts([]));
    if (tab === 'listings') {
      fetchDistrictCounts(tab, 'district').then(setCityCounts).catch(() => setCityCounts([]));
    }
  }, [tab]);

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

  // depth2/3 마커 (선택 영역 기준) — 검색 중엔 위치 필터 무시하고 검색 결과만 표시
  const markers = useMemo<MapMarkerV2[]>(() => {
    if (isSearching) {
      return searchResults
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, color: LISTING_COLOR, onClick: () => handleMarkerClick(l.id) }));
    }
    const color = tab === 'listings' ? LISTING_COLOR : FEED_COLOR;
    if (tab === 'listings') {
      return visibleListings
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, color, onClick: () => handleMarkerClick(l.id) }));
    }
    return visiblePosts
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({ id: p.id, lat: p.latitude!, lng: p.longitude!, color, onClick: () => handleMarkerClick(p.id) }));
  }, [isSearching, searchResults, tab, visibleListings, visiblePosts]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSharedCoords({ lat: region.lat, lng: region.lng });
    setSharedWardName(region.name);
    sheetRef.current?.expand();
  }, [setSharedCoords, setSharedWardName]);

  const handleMarkerClick = (id: string) => {
    setSelectedId(id);
    if (tab === 'feed') setExpandedPostId(id);
    sheetRef.current?.expand();
    requestAnimationFrame(() => {
      itemRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const switchTab = (tb: Tab) => {
    setTab(tb);
    setExpandedPostId(null);
    setSelectedId(null);
  };

  const retryLoad = () => setReloadSeq((n) => n + 1);
  // useCallback 필수: SaigonMapV5의 onLocate prop으로 전달됨 (handleRegionSelect와 동일한 이유)
  const resetToViewport = useCallback(() => {
    setMode('viewport');
    setSelectedRegion(null);
    setSelectedId(null);
    setExpandedPostId(null);
    // 지역 필터 해제 직후엔 항상 가이드 상태에서 시작 — region 모드 중 쌓인 bbox 잔재 제거
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    sheetRef.current?.snapToMid();
  }, []);
  const switchToViewport = () => {
    resetToViewport();
  };
  const clearRegionFilter = () => {
    resetToViewport();
  };

  const visibleCount = tab === 'listings' ? visibleListings.length : visiblePosts.length;
  const totalCount = districtCounts.reduce((s, d) => s + d.count, 0);
  const headerCount = mode === 'region' ? visibleCount : (showDistrictBadges ? totalCount : visibleCount);

  const adAt = (i: number) => {
    if (ads.length === 0 || i % AD_EVERY !== 0) return null;
    const ord = Math.floor(i / AD_EVERY);
    if (ord >= adLimit) return null;
    const ad = ads[ord % ads.length];
    return <AdCard ad={ad} onClick={() => navigate(`/market/ad/${ad.id}`)} />;
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
          <span className={styles.count}>{t('map.count', { count: searchResults.length })}</span>
        ) : (
          <>
            <div className={styles.segment}>
              {(['listings', 'feed'] as Tab[]).map((tb) => (
                <button
                  key={tb}
                  type="button"
                  className={`${styles.segBtn} ${tab === tb ? styles.segActive : ''}`}
                  onClick={() => switchTab(tb)}
                >
                  {tb === 'listings' ? t('map.tabListings') : t('map.tabFeed')}
                </button>
              ))}
            </div>
            <span className={styles.count}>
              {mode === 'region'
                ? t('map.count', { count: visibleCount })
                : t('map.totalCount', { count: headerCount })}
            </span>
          </>
        )}
      </div>
    </div>
  );

  const renderBody = () => {
    if (isSearching) {
      if (searchLoading && searchResults.length === 0) {
        return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
      }
      if (searchResults.length === 0) {
        return (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{t('map.emptySearch')}</p>
          </div>
        );
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
        locateOnMount={!storedCoords && !savedViewport}
        initialViewport={savedViewport ?? undefined}
        markers={markers}
        districtBadges={districtCounts}
        cityBadges={tab === 'listings' ? cityCounts : undefined}
        onRegionSelect={handleRegionSelect}
        onBboxChange={handleBboxChange}
        onDepthChange={setShowDistrictBadges}
        locateRef={locateRef}
        searchFitRef={searchFitRef}
        forceMarkers={isSearching}
        polyActive={mode === 'region'}
        onLocate={mode === 'region' ? resetToViewport : undefined}
        selectRegionOnLocate={false}
        bottomInsetPx={sheetVisibleHeight}
        topInsetPx={SEARCH_BAR_HEIGHT}
      />

      <div className={styles.searchOverlay}>
        <SearchBox
          value={submittedQuery}
          onChange={clearSearch}
          placeholder={t('map.searchPlaceholder')}
          readOnly
          onClick={() => setSearchPanelOpen(true)}
        />
      </div>

      {loading && !isSearching && (bboxFilter || selectedRegion) && (
        <div className={styles.mapLoading}>
          <span className={styles.mapSpinner} />
          <span>{t('map.loading')}</span>
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

      <DraggableSheet
        ref={sheetRef}
        header={sheetHeader}
        embedded
        initialSnap="collapsed"
        floatingTopLeft={!isSearching && mode === 'region' && selectedRegion ? (
          <button
            type="button"
            className={styles.filterChip}
            onClick={clearRegionFilter}
          >
            <MapPin size={14} strokeWidth={2.2} />
            <span>{selectedRegion.name}</span>
            <X size={14} />
          </button>
        ) : undefined}
        maxHeight="65vh"
        midHeight="42vh"
        lockHeight
        onVisibleHeightChange={setSheetVisibleHeight}
      >
        <div className={styles.list} onScroll={handleListScroll}>{renderBody()}</div>
      </DraggableSheet>

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />
    </div>
  );
}
