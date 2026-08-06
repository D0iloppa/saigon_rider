import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bell, ChevronDown, ChevronLeft, Heart, MapPinned, PackageOpen, Plus, Search, X, ZoomIn } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { SearchBox } from '@/components/ui/SearchBox';
import sys from '@/styles/system.module.css';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { toast } from '@/components/ui/Toast';
import { DisplayScopeSheet } from '@/components/location/DisplayScopeSheet';
import { usePoiMarkers } from '@/components/maps/usePoiMarkers';
import type { MapMarkerV2 } from '@/components/maps/v2/region';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { adAtIndex, ADS_ENABLED, AD_LIMIT_INITIAL, nextAdLimit } from '@/lib/adPlacement';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore, NEARBY_RADIUS_KM } from '@/store/useLocationStore';
import { fetchDistricts, localizedName, type District } from '@/api/master';
import {
  addKeywordAlert,
  adHref,
  buildCategoryTree,
  fetchAds,
  fetchCategories,
  fetchKeywordAlerts,
  fetchListings,
  removeKeywordAlert,
  resolveDistrict,
  type CategoryNode,
  type KeywordAlert,
  type ListingCard as Listing,
  type ListingSort,
  type MarketAd,
} from '@/api/market';
import { PostPanel, type PanelItem } from '@/pages/map/PostPanel';
import { haversineM } from '@/lib/polyline';
import { AppImage } from '@/components/ui/AppImage';
import ListingCard from './ListingCard';
import AdCard from './AdCard';
import { formatPriceVnd } from './marketFormat';
import styles from './MarketMain.module.css';

// v3: 위치 관련 필드(locationMode/ward/coords/regionLabel/explicitLocal)를 뺐다 — 표시 범위는
// 이제 useLocationStore(앱 전역 단일 SoT)가 들고 있다(대표 지시 2026-08-06 "모든화면에서 gps기본",
// 설계도 ai-docs/260806_gps_scope_unification_design.md). 여기 남는 건 마켓 고유 필터뿐이다.
// 키를 v2→v3 로 올려 구버전 값(locationMode:'region' 등)이 되살아나지 않게 한다.
const STORAGE_KEY = 'mkt_filter_v3';
// 매물 자동 말풍선 (동네지도 NeighborhoodMapCanvas 이식, 값 동일) — bboxFilter 위도 스팬이
// AUTO_BUBBLE_MAX_LAT_SPAN 이하일 때만 동작(과도한 줌아웃에서 비활성), 뷰포트 중앙에서 정규화
// 거리 AUTO_BUBBLE_CENTER_RADIUS 이내인 매물을 선택.
const AUTO_BUBBLE_MAX_LAT_SPAN = 0.03;
const AUTO_BUBBLE_CENTER_RADIUS = 0.25;
interface SavedState {
  sort: ListingSort;
  hideSold: boolean;
  scrollTop: number;
}
/** 콜드 스타트(새 웹뷰 세션) 표식 — scrollTop·viewMode 를 세션 범위로 유지하는 데 쓴다. */
const SESSION_MARK_KEY = 'mkt_session_mark';

function readSaved(): SavedState | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s) as Partial<SavedState>;
    // 저장소를 localStorage 로 올린 대상은 **마켓 필터**뿐이다. scrollTop·viewMode 는 원래
    // "상세 갔다 돌아와도 유지"용(세션 범위)이라, 콜드 스타트에서 복원하면 앱을 켜자마자
    // 지도 뷰 + 이전 스크롤 위치로 점프하는 새 부작용이 된다 — 새 세션에서는 기본값으로 시작한다.
    const coldStart = !sessionStorage.getItem(SESSION_MARK_KEY);
    sessionStorage.setItem(SESSION_MARK_KEY, '1');
    if (coldStart) return { ...(parsed as SavedState), scrollTop: 0 };
    return parsed as SavedState;
  } catch { return null; }
}

const SORTS: ListingSort[] = ['recent', 'distance', 'price_low', 'price_high'];

/**
 * 오토바이 라이더 거래 플랫폼 — 동네 피드 (SGR-287)
 * 1열 매물 카드 (REF-02): 실이미지 썸네일 + 제목 + `동네·시간` + 가격(굵게) + ♥.
 * GPS 기반 동네(HCMC 밖이면 폴백) · 정렬 · 거래완료 숨김 · 무한스크롤 · 당겨서 새로고침.
 */
export default function MarketMain() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const user = useUserStore((s) => s.user);
  const userId = user?.id;
  // 표시 범위는 앱 전역 단일 SoT — 마켓 독자 상태를 두지 않는다(대표 지시 2026-08-06
  // "모든화면에서 gps기본"). 마켓만 다른 지역을 보여주던 비대칭이 여기서 사라진다.
  const locationMode = useLocationStore((s) => s.mode);
  const coords = useLocationStore((s) => s.coords);
  const wardName = useLocationStore((s) => s.wardName);
  const coordsSource = useLocationStore((s) => s.coordsSource);
  const ensureLocation = useLocationStore((s) => s.ensureLocation);

  const [savedState] = useState<SavedState | null>(readSaved);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alerts, setAlerts] = useState<KeywordAlert[]>([]);
  const [newKw, setNewKw] = useState('');
  const [sort, setSort] = useState<ListingSort>(savedState?.sort ?? 'recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [hideSold, setHideSold] = useState(savedState?.hideSold ?? false);
  // 뷰 모드는 **URL 쿼리**로 둔다(동네지도 `?view=map` 과 동일). 탭으로 새로 들어오면 쿼리가
  // 없어 항상 리스트로 시작하고(대표 지시 2026-08-06), 상세로 갔다가 back 하면 쿼리가 남아
  // 지도 상태가 그대로 복원된다 — 종전 localStorage 방식은 탭 재진입에도 지도로 열렸다.
  const viewMode: 'list' | 'map' = searchParams.get('view') === 'map' ? 'map' : 'list';
  const setViewMode = useCallback((mode: 'list' | 'map') => {
    const next = new URLSearchParams(searchParams);
    if (mode === 'map') next.set('view', 'map'); else next.delete('view');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const [mapListings, setMapListings] = useState<Listing[]>([]);
  const [mapError, setMapError] = useState(false);
  // 지도 마커 탭 → 하단 캐러셀(PostPanel, 동네지도 포스트 패널과 동일 컴포넌트/동작 재사용).
  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const [carouselItems, setCarouselItems] = useState<PanelItem[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [postPanelHeight, setPostPanelHeight] = useState(0);
  const focusPointRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  // L2 줌 게이트 (동네지도 showDistrictBadges 미러, 대표 지적 2026-08-04) — true 면 상세
  // 레이어가 꺼지는 줌아웃 상태. 이때 매물 핀·말풍선·패널을 비우고 bbox fetch 를 막는다.
  // 직전엔 onDepthChange 를 안 받아 줌아웃해도 매물 핀/말풍선만 고아로 남았다.
  // onDepthChange 는 순수 줌 깊이 신호다(2026-08-04) — region 선택 중에도 줌아웃하면
  // true 가 와서 게이트가 닫힌다(locationMode 분기 불필요).
  const [showDistrictBadges, setShowDistrictBadges] = useState(true);
  // 힌트 필은 데이터 게이트와 분리된 신호를 쓴다 — L2 에서 핀은 이미 보이지만 힌트는 L3 까지
  // 유도해야 하므로 L2 구간에서도 떠야 한다(대표 지적 2026-08-06).
  const [showZoomHint, setShowZoomHint] = useState(true);
  const showDistrictBadgesRef = useRef(showDistrictBadges);
  showDistrictBadgesRef.current = showDistrictBadges;
  // 줌 게이트 힌트 필 탭 = 현재 뷰포트 중심 순수 확대 (동네지도 zoomHintPill 과 동일 동선)
  const zoomInRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  // 매물 자동 말풍선 (동네지도 이식) — 근접 자동선택된 매물. 캐러셀(postPanelOpen)과 배타.
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  // [X]로 닫은 매물이 패널 오픈 recenter 로 커밋된 bbox 때문에 즉시 재점화되는 것을 막는 억제 ref
  // (다음 bbox 커밋까지 유지). deps 에 넣지 않고 ref 로 읽어 이펙트 재실행을 유발하지 않는다.
  const suppressAutoBubbleListingIdRef = useRef<string | null>(null);
  // 정착된(디바운스 완료) bbox — 자동 말풍선의 줌 스팬 판정·중앙 거리 계산용
  const [bboxFilter, setBboxFilter] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [allDistricts, setAllDistricts] = useState<District[]>([]);
  // 지도 상단 카테고리 칩 — **대분류(depth 0)만**. 목록은 DB(fetchCategories)에서 오며
  // 하드코딩하지 않는다(대표 지시 2026-08-06). '전체'(null)가 기본값이다.
  const [topCategories, setTopCategories] = useState<CategoryNode[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [locMapOpen, setLocMapOpen] = useState(false);
  const [adLimit, setAdLimit] = useState(AD_LIMIT_INITIAL); // 스크롤 시 결정적 증가
  // 제휴 광고(지역 타게팅) 대상 district — /market/ads 는 아직 district_id 만 지원(백엔드 미변경
  // 범위). ward.district 는 현재 데이터에 채워져 있지 않아(마스터 데이터 미완성) 좌표로 별도 해석.
  const adDistrictId = useMemo(
    () => (coords ? resolveDistrict(coords.lat, coords.lng, allDistricts)?.id ?? null : null),
    [coords, allDistricts],
  );
  // 제휴 광고 — 동네/언어 확정 후 로드. 서버가 이미 가중 로테이션한 시퀀스이므로 순서 그대로
  // 사용(재정렬 금지). 피드 중간 삽입용.
  useEffect(() => {
    fetchAds(adDistrictId).then(setAds).catch(() => setAds([]));
    setAdLimit(AD_LIMIT_INITIAL);
  }, [adDistrictId, i18n.language]);

  // 제휴 광고 타게팅용 구 목록 — 위치 판정에는 쓰지 않는다(판정은 스토어 좌표 + 반경).
  useEffect(() => {
    let cancelled = false;
    fetchDistricts()
      .then((districts) => { if (!cancelled) setAllDistricts(districts); })
      .catch(() => { if (!cancelled) setAllDistricts([]); });
    return () => { cancelled = true; };
  }, []);

  // 카테고리 트리 — 칩에는 대분류만 쓴다(자식은 검색 화면의 카테고리 시트가 다룬다).
  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((flat) => { if (!cancelled) setTopCategories(buildCategoryTree(flat)); })
      .catch(() => { if (!cancelled) setTopCategories([]); });
    return () => { cancelled = true; };
  }, []);

  // 진입 시 측위 — 표시 범위 기본값이 GPS 다(대표 지시 2026-08-06 "기본을 다 gps로").
  // 실측은 스토어가 세션당 1회로 묶으므로, 화면 이동마다 권한창이 다시 뜨지 않는다.
  useEffect(() => { void ensureLocation(); }, [ensureLocation]);

  // 홈 "내 주변 인기 상품 → 더보기"에서 넘어오면 거리순으로 맞춰준다. 좌표는 스토어가 이미
  // 들고 있으므로 URL 로 실어 나르지 않는다 — 쿼리 잔존이 선택을 덮어쓰던 회귀(xreg-C1)도 함께 사라진다.
  useEffect(() => {
    if (searchParams.get('near') == null) return;
    setSort('distance');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // 표시 중인 지역 라벨. 권역 밖이라 중심가로 대체된 상태면 동네명을 쓰지 않는다 —
  // 폴백(권역 밖)이어도 그 좌표의 동 이름을 쓴다 — 총칭보다 위치를 가늠하기 쉽다.
  const currentRegionName = wardName;
  const currentLocationTitle = locationMode === 'all'
    ? t('location.allTitle')
    : currentRegionName ?? (coordsSource === 'fallback' ? t('location.fallbackTitle') : t('location.gpsTitle'));

  // 'gps' 면 반경 필터, 'all' 이면 전역 조회. 행정구역(wardId)으로 거르지 않는다 —
  // 구 경계에 걸친 매물이 통째로 빠지던 원인이었다(설계도 D4).
  // 'gps' 인데 좌표가 아직 없으면(최초 측위 진행 중) 조회를 미룬다 — 그대로 부르면
  // lat/lng 가 없어 radius_km 도 빠지고, "내 현재 위치" 헤더 아래 **도시 전역 목록**이
  // 잠깐 떴다가 교체된다(2026-08-06 리뷰 지적).
  const listReady = !(locationMode === 'gps' && !coords);

  const fetchPage = useCallback(
    (page: number) =>
      listReady
        ? fetchListings({
            sort, hideSold,
            lat: coords?.lat, lng: coords?.lng,
            radiusKm: locationMode === 'gps' ? NEARBY_RADIUS_KM : null,
            categoryId,
            viewerId: userId, page, size: 20,
          })
        : Promise.resolve({ items: [], total: 0, page, size: 20 }),
    [listReady, sort, hideSold, coords, locationMode, categoryId, userId],
  );

  const { items: listings, isLoading, isLoadingMore, hasMore, error: listError, sentinelRef, reset } =
    useInfiniteScroll<Listing>(fetchPage, 20, [listReady, sort, hideSold, coords, locationMode, categoryId, userId]);

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(async () => reset(), [reset]),
  );

  // 지도 뷰 마커 조회 — 현재 필터(거래완료 숨기기·지역) + 뷰포트 bbox. 뷰포트 이동마다 무제한
  // 호출되지 않도록 400ms 디바운스(onBboxChange, SaigonMapV5→MarketMain). 정렬은 지도에서
  // 의미가 약해(bbox 기준 조회) 여전히 넘기되 UI 컨트롤만 숨김(요구사항 6).
  const mapReqSeqRef = useRef(0);
  const fetchMapBbox = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    // 줌 게이트 밖 — 동네지도 biz fetch 게이트와 동일하게 조회를 막고 핀을 비운다
    // (게이트 밖 광역 bbox 로 서버를 계속 때리는 것 방지). ref 로 읽어 디바운스 시점의
    // 최신 게이트 상태를 반영한다.
    if (showDistrictBadgesRef.current) {
      mapReqSeqRef.current += 1; // 게이트 직전 발사된 in-flight 응답이 빈 핀을 덮어쓰지 않게 무효화
      setMapListings([]);
      setMapError(false);
      return;
    }
    const seq = ++mapReqSeqRef.current;
    // 지도는 뷰포트(bbox) 기준으로만 조회한다 — 화면에 보이는 영역이 곧 범위라 반경/행정구역
    // 필터를 겹쳐 걸면 보이는 곳에 핀이 안 뜨는 불일치가 생긴다.
    fetchListings({
      sort, hideSold,
      minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
      categoryId,
      viewerId: userId, page: 1, size: 50,
    }).then((res) => {
      if (seq !== mapReqSeqRef.current) return;
      setMapListings(res.items);
      setMapError(false);
    }).catch(() => {
      if (seq !== mapReqSeqRef.current) return;
      setMapError(true);
    });
  }, [sort, hideSold, categoryId, userId]);

  // 필터(카테고리·정렬·거래완료 숨김)가 바뀌면 마지막 bbox 로 지도를 다시 조회한다.
  // 종전엔 지도 조회가 **bbox 변경 때만** 돌아서, 칩을 눌러도 핀이 그대로였다
  // (목록만 바뀌어 지도·목록이 어긋났다 — 대표 지적 2026-08-06 카테고리 칩 도입 중 발견).
  // ⚠️ 알려진 한계 — **콜드 스타트 딥링크** `/market?view=map`(브라우저 새로고침·외부 링크)로
  // 들어오면 지도가 도시 전체 조망으로 시작해 줌 게이트가 닫히고 매물이 뜨지 않는다.
  // initialGps 도 locateOnMount 도 마운트 시점 경로라 이 순서에서는 포커스가 걸리지 않는다.
  // 앱 내 경로는 모두 정상이다 — 리스트에서 [지도보기](좌표 확정 후 마운트), 지도→상세→뒤로가기
  // (마커 유지 실측 확인). 보정용 이펙트를 시도했으나 효과가 없어(줌 힌트가 그대로 남음)
  // 코드를 남기지 않고 한계로 기록한다. 재시도 시 SaigonMapV5 의 마운트 포커스 경로부터 볼 것.


  // 필터 값 자체가 바뀐 경우에만 재조회한다 — bbox 변경/마운트로는 돌지 않아야 한다
  // (마운트에 돌면 onBboxChange 조회와 중복되고, 줌 게이트가 닫힌 순간이면 핀을 지운다).
  const filterSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = `${categoryId}|${sort}|${hideSold}`;
    const prev = filterSigRef.current;
    filterSigRef.current = sig;
    if (prev === null || prev === sig) return; // 최초 등록이거나 변화 없음
    if (viewMode !== 'map' || !bboxFilter) return;
    fetchMapBbox(bboxFilter);
  }, [categoryId, sort, hideSold, viewMode, bboxFilter, fetchMapBbox]);

  const bboxTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleMapBboxChange = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => {
      setBboxFilter(bbox);
      suppressAutoBubbleListingIdRef.current = null; // 새 조작 = 억제 해제
      fetchMapBbox(bbox);
    }, 400);
  }, [fetchMapBbox]);
  useEffect(() => () => clearTimeout(bboxTimerRef.current), []);

  // 필터 상태 변경 시 localStorage에 저장 (scrollTop은 0으로 리셋 — 새 필터는 처음부터)
  // 표시 범위는 여기 저장하지 않는다 — useLocationStore 가 자체 persist 한다.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sort, hideSold, scrollTop: 0 }));
    } catch { /* ignore */ }
  }, [sort, hideSold]);

  // 상세 이동 전 현재 스크롤 위치 저장
  const saveScroll = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sort, hideSold, scrollTop: containerRef.current?.scrollTop ?? 0,
      }));
    } catch { /* ignore */ }
  }, [sort, hideSold, containerRef]);

  // 초기 로딩 완료 후 저장된 스크롤 위치 복원
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    const savedTop = savedState?.scrollTop ?? 0;
    if (!isLoading && !scrollRestoredRef.current && savedTop > 0) {
      scrollRestoredRef.current = true;
      containerRef.current?.scrollTo({ top: savedTop, behavior: 'instant' });
    }
  }, [isLoading, savedState?.scrollTop, containerRef]);

  // 지도 마커 탭 → 하단 캐러셀(PostPanel) 오픈 — 동네지도 openPostPanel 미러(SGR-325/W2).
  // 캐러셀 카드 탭이 실제 상세 진입(saveScroll + 동일 경로)을 수행한다.
  const focusedListing = postPanelOpen ? carouselItems[carouselIndex] : null;
  const focusedListingId = focusedListing?.kind === 'listing' ? focusedListing.listing.id : null;

  const openListingPanel = useCallback((l: Listing) => {
    const others = mapListings
      .filter((x) => x.id !== l.id && x.lat != null && x.lng != null)
      .sort((a, b) =>
        haversineM(l.lat as number, l.lng as number, a.lat as number, a.lng as number) -
        haversineM(l.lat as number, l.lng as number, b.lat as number, b.lng as number));
    setCarouselItems([l, ...others].map((x): PanelItem => ({ kind: 'listing', listing: x })));
    setCarouselIndex(0);
    setPostPanelOpen(true);
    setSelectedListing(null); // 자동 말풍선 상태와 분리 — 패널과 말풍선 이중 노출 방지
    focusPointRef.current?.({ lat: l.lat as number, lng: l.lng as number });
  }, [mapListings]);

  // 캐러셀 스냅 → 그 매물 핀으로 지도 recenter(줌 유지) + 마커 하이라이트 (동네지도 handleCarouselIndex 미러)
  const handleCarouselIndex = useCallback((i: number) => {
    setCarouselIndex(i);
    const it = carouselItems[i];
    if (it?.kind !== 'listing') return;
    focusPointRef.current?.({ lat: it.listing.lat as number, lng: it.listing.lng as number });
  }, [carouselItems]);

  const closePostPanel = useCallback(() => {
    // 닫은 시점의 포커싱 아이템 = 지도 중앙 아이템 — 자동 말풍선이 즉시 재점화하지 않게 억제.
    suppressAutoBubbleListingIdRef.current = focusedListingId;
    setPostPanelOpen(false);
    setCarouselItems([]);
    setCarouselIndex(0);
  }, [focusedListingId]);

  // 줌 게이트 이탈 — 핀이 소멸하는 줌아웃에서 말풍선·캐러셀도 정리(동네지도 동일 이펙트 미러).
  // 자동 말풍선은 아래 이펙트가 스팬 초과 시 스스로 해제하지만(2026-08-04), 캐러셀 정리와
  // 게이트-스팬 임계 불일치 대비 안전망으로 여기서도 함께 정리한다.
  useEffect(() => {
    if (!showDistrictBadges) return;
    setSelectedListing(null);
    if (postPanelOpen) closePostPanel();
  }, [showDistrictBadges]); // eslint-disable-line react-hooks/exhaustive-deps

  // 매물 자동 말풍선 (동네지도 이식) — 정착된 bboxFilter 의 위도 스팬이 임계 이하일 때만 동작,
  // 뷰포트 중앙에 가장 가까운 매물을 정규화 거리로 골라 반경 이내면 선택(카메라 이동 없음).
  const selectedListingRef = useRef(selectedListing);
  useEffect(() => { selectedListingRef.current = selectedListing; }, [selectedListing]);
  useEffect(() => {
    if (postPanelOpen || !bboxFilter) return;
    const latSpan = bboxFilter.N - bboxFilter.S;
    if (latSpan > AUTO_BUBBLE_MAX_LAT_SPAN) {
      // 임계 초과 줌아웃 — 기존 선택을 스스로 해제하고 비활성. 조기 return 만 하면 핀 없는
      // 지도에 말풍선만 고아로 남아, 게이트 정리 이펙트(showDistrictBadges)에 의존하게 된다.
      if (selectedListingRef.current) setSelectedListing(null);
      return;
    }
    const lngSpan = bboxFilter.E - bboxFilter.W;
    const cLat = (bboxFilter.N + bboxFilter.S) / 2;
    const cLng = (bboxFilter.E + bboxFilter.W) / 2;
    let best: Listing | null = null;
    let bestD = Infinity;
    for (const l of mapListings) {
      if (l.lat == null || l.lng == null) continue;
      const d = Math.hypot((l.lat - cLat) / latSpan, (l.lng - cLng) / lngSpan);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (best && bestD <= AUTO_BUBBLE_CENTER_RADIUS) {
      if (best.id === suppressAutoBubbleListingIdRef.current) return; // [X]로 닫은 매물 — 다음 조작까지 억제
      if (selectedListingRef.current?.id !== best.id) setSelectedListing(best);
    } else if (selectedListingRef.current) {
      setSelectedListing(null);
    }
  }, [bboxFilter, mapListings, postPanelOpen]);

  // 매물 말풍선 — 썸네일 <AppImage> + 제목 + 가격(formatPriceVnd). 탭하면 캐러셀 오픈.
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
  }, [selectedListing, openListingPanel, t]);

  // POI 상시 참조 레이어 — 동네지도와 동일한 조회/레이어 규칙(usePoiMarkers 공용 훅, 대표 지적
  // 2026-08-05: "마켓지도에도 동네지도처럼 POI 를 보여달라"). 줌 게이트 밖에서는 매물 핀과 마찬가지로
  // 비운다(넓은 bbox 대량 조회 방지 + 게이트 안내 화면을 POI 로 어지럽히지 않기).
  const poiMarkers = usePoiMarkers(showDistrictBadges ? null : bboxFilter, i18n.language);

  const mapMarkers = useMemo<MapMarkerV2[]>(
    () => [
      // POI 먼저 = 매물 핀이 그 위에 그려진다(동네지도 marker 배열 순서와 동일)
      ...poiMarkers,
      ...mapListings
        .filter((l) => l.lat != null && l.lng != null)
        .map((l): MapMarkerV2 => ({
          id: l.id,
          lat: l.lat as number,
          lng: l.lng as number,
          kind: 'listing',
          label: l.title,
          selected: focusedListingId === l.id,
          onClick: () => openListingPanel(l),
        })),
    ],
    [poiMarkers, mapListings, focusedListingId, openListingPanel],
  );

  const openAlerts = () => {
    setAlertOpen(true);
    if (userId) fetchKeywordAlerts(userId).then(setAlerts).catch(() => setAlerts([]));
  };

  const handleAddKw = async () => {
    const kw = newKw.trim();
    if (!kw || !userId) return;
    try {
      const a = await addKeywordAlert(userId, kw);
      setAlerts((prev) => (prev.some((x) => x.id === a.id) ? prev : [a, ...prev]));
      setNewKw('');
    } catch {
      toast.error(t('market.alertError', { defaultValue: '알림 처리 실패' }));
    }
  };

  const handleRemoveKw = async (id: string) => {
    if (!userId) return;
    try {
      await removeKeywordAlert(id, userId);
      setAlerts((prev) => prev.filter((x) => x.id !== id));
    } catch {
      toast.error(t('market.alertError', { defaultValue: '알림 처리 실패' }));
    }
  };

  return (
    <div className={styles.root}>
      {/* Header — 지도 뷰에서는 렌더하지 않는다. 지도 상단은 동네지도와 동일하게
          [◀ + 검색바 + 아바타] 오버레이만 띄운다(대표 지시 2026-08-06 "동네지도 기준으로 통일").
          알림·찜·거래완료 숨기기·지역명(표시범위 시트)은 리스트 뷰 전용으로 남는다. */}
      {viewMode === 'list' && (
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button className={styles.locationBtn} onClick={() => setLocMapOpen(true)}>
            {/* eyebrow → 제목 순서 — 동네지도와 동일한 헤더 구성(대표 지시 2026-08-06). */}
            <span className={styles.tagline}>{t('market.tagline', { defaultValue: '내 근처 라이더 장터' })}</span>
            <h1 className={styles.title}>
              {currentLocationTitle}
              <span className={styles.caret}><ChevronDown size={20} strokeWidth={2.4} /></span>
            </h1>
          </button>
          <div className={styles.headerActions}>
            <button className={styles.wishlistBtn} onClick={() => navigate('/market/search')} aria-label={t('market.search', { defaultValue: '검색' })}>
              <Search size={23} strokeWidth={2} />
            </button>
            <button className={styles.wishlistBtn} onClick={openAlerts} aria-label={t('market.keywordAlerts', { defaultValue: '키워드 알림' })}>
              <Bell size={23} strokeWidth={2} />
            </button>
            <button className={styles.wishlistBtn} onClick={() => navigate('/market/wishlist')} aria-label={t('market.wishlist', { defaultValue: '찜' })}>
              <Heart size={24} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* 카테고리 칩 — 지도 뷰의 오버레이 칩과 같은 소스(대분류·DB). 동네지도 헤더의
            칩 행과 같은 위계로 리스트 뷰에도 둔다(대표 지시 2026-08-06). */}
        <div className={styles.listChipsRow}>
          {[null, ...topCategories].map((c) => {
            const id = c?.id ?? null;
            return (
              <button
                key={id ?? 'all'}
                type="button"
                className={`${styles.listChip} ${categoryId === id ? styles.listChipActive : ''}`}
                onClick={() => setCategoryId(id)}
              >
                {c ? localizedName(c) : t('market.categoryAll', { defaultValue: '전체' })}
              </button>
            );
          })}
        </div>

        {/* Sort (bottom sheet) + hide-sold toggle — 지도 진입은 하단 플로팅 지도보기 버튼(동네지도와 통일) */}
        <div className={styles.controlRow}>
          {/* 정렬은 지도 모드에서 의미가 약함(bbox 기준 조회) — 리스트 모드에서만 노출 */}
          {viewMode === 'list' && (
            <button className={styles.sortSelect} onClick={() => setSortOpen(true)}>
              {t(`market.sort_${sort}`)}
              <ChevronDown size={16} strokeWidth={2.2} />
            </button>
          )}
          <div className={styles.controlRowRight}>
            <Chip
              as="button"
              variant={hideSold ? 'dark' : 'surface'}
              aria-pressed={hideSold}
              onClick={() => setHideSold((v) => !v)}
              style={{ cursor: 'pointer' }}
            >
              {t('market.hideSold', { defaultValue: '거래완료 숨기기' })}
            </Chip>
          </div>
        </div>
      </div>
      )}

      {viewMode === 'map' ? (
        <div className={styles.mapArea}>
          {/* 상단 오버레이 — 동네지도(NeighborhoodMapCanvas)의 searchOverlay 와 같은 구성·위치.
              ◀ 는 리스트 복귀, 검색바는 마켓 검색으로, 아바타는 프로필로 보낸다. */}
          <div className={styles.mapSearchOverlay}>
            <button
              type="button"
              className={styles.mapSearchBack}
              onClick={() => setViewMode('list')}
              aria-label={t('market.viewList', { defaultValue: '목록' })}
            >
              <ChevronLeft size={22} strokeWidth={2.4} />
            </button>
            <SearchBox
              value=""
              onChange={() => {}}
              placeholder={t('market.searchPlaceholder', { defaultValue: '상품명, 키워드, 카테고리 검색' })}
              readOnly
              onClick={() => navigate('/market/search')}
            />
            <button
              type="button"
              className={styles.mapProfileButton}
              onClick={() => navigate('/profile')}
              aria-label={t('tabbar.profile', { defaultValue: '프로필' })}
            >
              {user?.avatarUrl
                ? <AppImage src={user.avatarUrl} alt="" className={styles.mapProfileAvatar} variant="circle" />
                : <span>{(user?.nickname || 'U').charAt(0).toUpperCase()}</span>}
            </button>
          </div>

          {/* 카테고리 칩 — 동네지도 chipsOverlay 와 같은 위치·모양. 대분류만, '전체' 기본. */}
          <div className={styles.mapChipsOverlay}>
            {[null, ...topCategories].map((c) => {
              const id = c?.id ?? null;
              return (
                <button
                  key={id ?? 'all'}
                  type="button"
                  className={`${styles.mapCatChip} ${categoryId === id ? styles.mapCatChipActive : ''}`}
                  onClick={() => setCategoryId(id)}
                >
                  {c ? localizedName(c) : t('market.categoryAll', { defaultValue: '전체' })}
                </button>
              );
            })}
          </div>

          <Suspense fallback={<div className={styles.mapLoading}>{t('common.loading', { defaultValue: '로딩 중...' })}</div>}>
            <SaigonMapV5
              height="100%"
              initialGps={coords ?? undefined}
              // 카메라를 내 위치 중심으로 잡는다 (대표 지시 2026-08-06 "지도 다나오게").
              // 지역 선택이 사라져 카메라와 선택 경계가 어긋날 여지 자체가 없어졌다.
              locateOnMount
              meDotOnMount
              // 폴리곤 강조(주황 경계 + 외부지역 마스크) 제거 — 대표 지시 2026-08-06.
              // 특정 동으로 화면을 가두지 않고 지도를 그대로 보여준다.
              polyActive={false}
              activeRegionAt={null}
              markers={mapMarkers}
              anchorOverlay={postPanelOpen ? undefined : listingOverlay}
              onBboxChange={handleMapBboxChange}
              // L2 줌 게이트 (동네지도와 통일, 대표 지적 2026-08-04) — 게이트 밖에서는
              // 핀/말풍선/패널 정리 + fetch 차단 + 확대 안내 필 노출.
              onDepthChange={(gate, belowL3) => { setShowDistrictBadges(gate); setShowZoomHint(belowL3); }}
              // 게이트 임계도 동네지도와 정합 — 동네지도는 markerDepth='l2'(L2 진입 시 핀 허용)라,
              // 기본값 'l3' 를 그대로 두면 L2~L3 구간에서 동네지도는 핀을 보여주는데 마켓만
              // 게이트가 닫혀 화면이 비는 불일치가 생긴다.
              markerDepth="l2"
              zoomInRef={zoomInRef}
              focusPointRef={focusPointRef}
              // 내 위치(◎) 버튼이 글쓰기 FAB(52px + bottom 18px) 뒤에 가리지 않도록 띄운다.
              // SaigonMapV5 는 bottomInsetPx+16 을 bottom 으로 쓴다 → 70+16=86px (FAB 상단 위).
              bottomInsetPx={postPanelOpen ? postPanelHeight : 70}
              outsideAreaFallback
              outsideAreaMessage={t('map.outsideArea', { defaultValue: '서비스 지역 밖이라 중심가 기준으로 보여드려요' })}
              // 우측 하단 '내 위치' 버튼 — 2026-08-06 복원. 이걸 끄던 근거(service-rules GPS
              // 원칙 2 "지도 탐색에 GPS 미사용")가 대표 지시로 폐기됐다.
              showLocateControl
            />
          </Suspense>
          {/* 지역 필터 chip(AreaPill) 제거 — 대표 지시 2026-08-06. 지역 선택 자체가 없어져
              해제할 필터가 없다. */}
          {/* 줌 게이트 힌트 필 — 동네지도 zoomHintPill 과 같은 문구/동작(탭 = 뷰포트 중심 확대).
              게이트 밖에서 핀이 비는 이유를 사용자에게 알린다. */}
          {/* 캐러셀이 열려 있으면 숨긴다 — 패널 위 'n명이 보는중'·✕ 행과 같은 자리다. */}
          {showZoomHint && !postPanelOpen && (
            <button
              type="button"
              className={styles.zoomHintPill}
              onClick={() => {
                if (!bboxFilter) return;
                zoomInRef.current?.({ lat: (bboxFilter.N + bboxFilter.S) / 2, lng: (bboxFilter.E + bboxFilter.W) / 2 });
              }}
            >
              <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" /> {t('map.zoomGateShort', { defaultValue: '확대해서 주변 보기' })}
            </button>
          )}
          {mapError && (
            <div className={styles.mapNotice}>{t('market.loadError', { defaultValue: '매물을 불러오지 못했어요' })}</div>
          )}
          {postPanelOpen && carouselItems.length > 0 && (
            <PostPanel
              items={carouselItems}
              index={carouselIndex}
              onIndexChange={handleCarouselIndex}
              onCardTap={(it) => {
                if (it.kind !== 'listing') return;
                saveScroll();
                navigate(`/market/${it.listing.id}`);
              }}
              onClose={closePostPanel}
              onHeightChange={setPostPanelHeight}
            />
          )}
        </div>
      ) : (
      <div
        className={styles.listArea}
        ref={containerRef as React.RefObject<HTMLDivElement>}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) setAdLimit(nextAdLimit);
        }}
      >
        <div className={styles.listContent} style={contentStyle}>
          <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className={styles.skelCard}>
                <div className={`shimmer ${styles.skelThumb}`} />
                <div className={styles.skelBody}>
                  <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                  <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
                </div>
              </div>
            ))
          ) : listings.length === 0 && listError ? (
            // F-12: 조회 실패를 "매물 없음"으로 위장하지 않고 구분해 재시도를 제공
            <div className={styles.emptyWrap}>
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('market.loadError', { defaultValue: '매물을 불러오지 못했어요' })}
                actionLabel={t('common.retry')}
                onAction={reset}
              />
            </div>
          ) : listings.length === 0 ? (
            <>
              {/* 빈 상태: 광고 1개 고정 노출 (스크롤 확장 없음) — 광고 노출 시기상조로 숨김(ADS_ENABLED) */}
              {ADS_ENABLED && ads.slice(0, 1).map((ad) => (
                <AdCard key={ad.id} ad={ad} onClick={() => { saveScroll(); navigate(adHref(ad)); }} />
              ))}
              <div className={styles.emptyWrap}>
                <StateBlock
                  icon={PackageOpen}
                  title={t('market.emptyTitle', { defaultValue: '근처에 매물이 없어요' })}
                  desc={t('market.emptySub', { defaultValue: '첫 매물을 등록해보세요' })}
                />
              </div>
            </>
          ) : (
            <>
              {listings.map((l, i) => {
                const slot = adAtIndex(i, ads, adLimit);
                return (
                  <Fragment key={l.id}>
                    <ListingCard listing={l} onClick={() => { saveScroll(); navigate(`/market/${l.id}`); }} />
                    {slot && <AdCard key={`${slot.ad.id}-${slot.ord}`} ad={slot.ad} onClick={() => { saveScroll(); navigate(adHref(slot.ad)); }} />}
                  </Fragment>
                );
              })}
              <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
            </>
          )}
        </div>
      </div>
      )}

      {/* 지도보기 — 동네지도(NeighborhoodMapList) 하단 플로팅 필과 동일 위치·모양·문구 */}
      {viewMode === 'list' && (
        <button type="button" className={styles.mapPill} onClick={() => setViewMode('map')}>
          <MapPinned size={17} />
          {t('map.viewMap')}
        </button>
      )}

      {/* 글쓰기 FAB — 카드 캐러셀(PostPanel)이 열려 있으면 숨긴다. 캐러셀 우하단의 가격·찜
          영역을 FAB 이 가린다(대표 지적 2026-08-06). 캐러셀을 닫으면 다시 나온다. */}
      {!postPanelOpen && (
        <button className={styles.writeFab} type="button" onClick={() => navigate('/market/new')} aria-label={t('market.create', { defaultValue: '매물 등록' })}>
          <Plus size={26} strokeWidth={2.4} />
        </button>
      )}

      {/* 정렬 시트 */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)}>
        <div className={styles.sortSheet}>
          <h2 className={styles.sortSheetTitle}>{t('market.sortTitle', { defaultValue: '정렬' })}</h2>
          {SORTS.map((s) => (
            <button
              key={s}
              className={`${styles.sortOption} ${sort === s ? styles.sortOptionActive : ''}`}
              onClick={() => {
                setSort(s);
                setSortOpen(false);
              }}
            >
              {t(`market.sort_${s}`)}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 표시범위 시트 — 앱 공용 2옵션(대표 지시 2026-08-06 "2개로만해"). 종전 인라인 3옵션
          시트(전체/현재위치/지역선택 + 지도 패널)를 DisplayScopeSheet 로 대체했다. */}
      <DisplayScopeSheet open={locMapOpen} onClose={() => setLocMapOpen(false)} />

      {/* 키워드 알림 관리 시트 */}
      <BottomSheet open={alertOpen} onClose={() => setAlertOpen(false)}>
        <div className={styles.alertSheet}>
          <h2 className={styles.alertTitle}><Bell size={18} strokeWidth={2.2} /> {t('market.keywordAlerts', { defaultValue: '키워드 알림' })}</h2>
          <p className={styles.alertDesc}>{t('market.keywordAlertsDesc', { defaultValue: '키워드와 맞는 매물이 올라오면 알려드려요' })}</p>
          <div className={styles.alertInputRow}>
            <input
              className={styles.alertInput}
              value={newKw}
              onChange={(e) => setNewKw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKw()}
              placeholder={t('market.keywordPlaceholder', { defaultValue: '예: 헬멧, 타이어' })}
              maxLength={60}
            />
            <Button onClick={handleAddKw} fullWidth={false} disabled={!newKw.trim()}>
              {t('market.keywordAdd', { defaultValue: '추가' })}
            </Button>
          </div>
          <div className={styles.alertChips}>
            {alerts.length === 0 ? (
              <p className={styles.alertEmpty}>{t('market.keywordEmpty', { defaultValue: '등록한 키워드가 없어요' })}</p>
            ) : (
              alerts.map((a) => (
                <span key={a.id} className={styles.alertChip}>
                  {a.keyword}
                  <button className={styles.alertChipX} onClick={() => handleRemoveKw(a.id)} aria-label={t('market.keywordRemove', { defaultValue: '삭제' })}>
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
