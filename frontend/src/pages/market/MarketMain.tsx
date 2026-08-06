import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bell, ChevronDown, ChevronLeft, Globe, Heart, LocateFixed, Map as MapIcon, MapPinned, PackageOpen, Plus, Search, X, ZoomIn } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { RadioCircle } from '@/components/ui/RadioCircle';
import sys from '@/styles/system.module.css';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { toast } from '@/components/ui/Toast';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import { AreaPill } from '@/components/maps/AreaPill';
import { usePoiMarkers } from '@/components/maps/usePoiMarkers';
import type { SelectedRegion, MapMarkerV2 } from '@/components/maps/v2/region';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { resolveUsableLocation } from '@/lib/serviceLocation';
import { adAtIndex, ADS_ENABLED, AD_LIMIT_INITIAL, nextAdLimit } from '@/lib/adPlacement';
import { useUserStore } from '@/store/useUserStore';
import { useServiceLocation } from '@/hooks/useServiceLocation';
import { fetchDistricts, fetchWards, localizedName, resolveWardByCoords, type District, type Ward } from '@/api/master';
import {
  addKeywordAlert,
  adHref,
  fetchAds,
  fetchKeywordAlerts,
  fetchListings,
  removeKeywordAlert,
  resolveDistrict,
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

const STORAGE_KEY = 'mkt_filter_v2';
// 저장소는 localStorage — 표시 범위(locationMode) 선택이 앱 재시작 후에도 유지돼야 한다
// (대표 지적 2026-08-05: "설정을 바꿔서 다시 들어가면 초기화됨"). 종전 sessionStorage 는 웹뷰
// 세션과 함께 사라져 앱을 껐다 켜면 '전체 지역'으로 되돌아갔다 — 동네지도·정보 화면은
// useLocationStore(zustand persist=localStorage)라 유지되는데 마켓만 초기화되는 비대칭이었다.
// (마켓 독자 상태 유지는 그대로 — 전역 스토어 통합은 2026-07-27 대표 결정으로 보류 상태.)
// 매물 자동 말풍선 (동네지도 NeighborhoodMapCanvas 이식, 값 동일) — bboxFilter 위도 스팬이
// AUTO_BUBBLE_MAX_LAT_SPAN 이하일 때만 동작(과도한 줌아웃에서 비활성), 뷰포트 중앙에서 정규화
// 거리 AUTO_BUBBLE_CENTER_RADIUS 이내인 매물을 선택.
const AUTO_BUBBLE_MAX_LAT_SPAN = 0.03;
const AUTO_BUBBLE_CENTER_RADIUS = 0.25;
interface SavedState {
  sort: ListingSort;
  hideSold: boolean;
  locationMode: 'all' | 'gps' | 'region';
  ward: Ward | null;
  coords: { lat: number; lng: number } | null;
  regionLabel: string | null;
  /** 마켓 자체 위치 시트/URL 쿼리에서 명시적으로 고른 지역인지 — true면 전역 스토어 동기화보다 우선. */
  explicitLocal: boolean;
  /** 리스트/지도 뷰 토글 — 상세 갔다 돌아와도 유지 (SGR 마켓 지도, 대표 지시). */
  viewMode: 'list' | 'map';
  scrollTop: number;
}
/** 콜드 스타트(새 웹뷰 세션) 표식 — scrollTop·viewMode 를 세션 범위로 유지하는 데 쓴다. */
const SESSION_MARK_KEY = 'mkt_session_mark';

/** district→ward 전환(2026-08) 이전 구버전 세션값(shape: {district, ...})이 남아있을 수 있다 —
 * 필수 필드(ward 키 자체, id 타입) 검증해 구스키마면 폐기하고 기본값으로 폴백한다. */
function readSaved(): SavedState | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s) as Partial<SavedState> & { district?: unknown };
    if (parsed.district !== undefined) return null; // 구스키마(district 필드) — 폐기
    if (parsed.ward != null && typeof (parsed.ward as Ward).id !== 'number') return null;
    // 저장소를 localStorage 로 올린 대상은 **필터·표시 범위**뿐이다. scrollTop·viewMode 는 원래
    // "상세 갔다 돌아와도 유지"용(세션 범위)이라, 콜드 스타트에서 복원하면 앱을 켜자마자
    // 지도 뷰 + 이전 스크롤 위치로 점프하는 새 부작용이 된다 — 새 세션에서는 기본값으로 시작한다.
    const coldStart = !sessionStorage.getItem(SESSION_MARK_KEY);
    sessionStorage.setItem(SESSION_MARK_KEY, '1');
    if (coldStart) return { ...(parsed as SavedState), viewMode: 'list', scrollTop: 0 };
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
  const userId = useUserStore((s) => s.user?.id);
  // 전역 위치 스토어(useLocationStore) — 동네지도/정보 화면과 공유되는 지역 선택 SoT.
  const { region: globalRegion } = useServiceLocation();

  const [savedState] = useState<SavedState | null>(readSaved);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alerts, setAlerts] = useState<KeywordAlert[]>([]);
  const [newKw, setNewKw] = useState('');
  const [sort, setSort] = useState<ListingSort>(savedState?.sort ?? 'recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [hideSold, setHideSold] = useState(savedState?.hideSold ?? false);
  const [ward, setWard] = useState<Ward | null>(savedState?.ward ?? null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(savedState?.coords ?? null);
  const [locationMode, setLocationMode] = useState<'all' | 'gps' | 'region'>(savedState?.locationMode ?? 'all');
  const [explicitLocal, setExplicitLocal] = useState<boolean>(savedState?.explicitLocal ?? false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>(savedState?.viewMode ?? 'list');
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
  const [allWards, setAllWards] = useState<Ward[]>([]);
  const [allDistricts, setAllDistricts] = useState<District[]>([]);
  const [locMapOpen, setLocMapOpen] = useState(false);
  const [regionLabel, setRegionLabel] = useState<string | null>(savedState?.regionLabel ?? null);
  const [draftLocationMode, setDraftLocationMode] = useState<'all' | 'gps' | 'region'>('all');
  const [draftWard, setDraftWard] = useState<Ward | null>(null);
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [draftRegionLabel, setDraftRegionLabel] = useState<string | null>(null);
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

  // GPS 자동 실행 없음 — 사용자가 시트에서 명시적으로 선택한 경우에만 위치 반영.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [wards, districts] = await Promise.all([
        fetchWards().catch(() => [] as Ward[]),
        fetchDistricts().catch(() => [] as District[]),
      ]);
      if (cancelled) return;
      setAllWards(wards);
      setAllDistricts(districts);
    })();
    return () => { cancelled = true; };
  }, []);

  // 지역 소스 우선순위: URL 쿼리(?lat&lng, 홈 진입) > 마켓 세션 선택(explicitLocal) >
  // 전역 위치 스토어(useLocationStore, 동네지도와 공유) > 전체.
  // explicitLocal 이 아직 없을 때만(마켓에서 직접 고른 적 없을 때만) 전역 스토어 기준을 반영한다.
  useEffect(() => {
    if (explicitLocal) return;
    if (searchParams.get('lat') != null) return; // 아래 쿼리 처리 이펙트가 우선 소비
    if (allWards.length === 0) return;
    if (!globalRegion) return; // 전역도 '전체'면 로컬 기본값(all) 유지
    const w = resolveWardByCoords(globalRegion.lat, globalRegion.lng, allWards);
    setCoords({ lat: globalRegion.lat, lng: globalRegion.lng });
    setWard(w ?? null);
    setLocationMode('region');
    setRegionLabel(w ? null : globalRegion.name);
  }, [explicitLocal, searchParams, allWards, globalRegion]);

  // 홈 "내 주변 인기 상품 → 더보기"에서 ?lat=&lng= 로 진입 시: 신규 GPS 재측정 없이
  // 홈이 이미 보유한 좌표로 gps 모드에 즉시 반영 (savedState 복원보다 우선).
  useEffect(() => {
    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');
    if (latStr == null || lngStr == null) return;
    if (allWards.length === 0) return; // 동 해석 가능해진 뒤 1회 소비
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const w = resolveWardByCoords(lat, lng, allWards)
        ?? resolveWardByCoords(10.7748, 106.6879, allWards);
      setCoords({ lat, lng });
      setWard(w ?? null);
      setLocationMode('gps');
      setRegionLabel(null);
      setSort('distance');
      setExplicitLocal(true); // URL 쿼리로 받은 위치도 이후 전역 스토어 동기화보다 우선
    }
    // 소비 즉시 쿼리 제거 — 잔존 시 리로드/리마운트마다 수동 지역 선택을 덮어씀 (회귀 xreg-C1)
    setSearchParams({}, { replace: true });
  }, [searchParams, allWards, setSearchParams]);

  const handlePickGPS = async () => {
    try {
      const location = await resolveUsableLocation();
      const w = resolveWardByCoords(location.coords.lat, location.coords.lng, allWards);
      if (location.source === 'fallback') {
        toast.neutral(t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' }));
      }
      setCoords(location.coords);
      setWard(w ?? null);
      setLocationMode('gps');
      setRegionLabel(null);
      setExplicitLocal(true);
      setLocMapOpen(false);
    } catch (err) {
      const code = (err as { code?: number } | null)?.code;
      if (code === 1) {
        // PERMISSION_DENIED
        toast.warning(t('map.listFirst.nearMeDenied'));
      } else if (code === 3) {
        // TIMEOUT
        toast.warning(t('map.listFirst.nearMeTimeout'));
      } else {
        // POSITION_UNAVAILABLE 등 — 위치 서비스 꺼짐 포함
        toast.warning(t('map.listFirst.nearMeUnavailable'));
      }
    }
  };

  const handleDraftRegion = (region: SelectedRegion) => {
    const nextCoords = { lat: region.lat, lng: region.lng };
    const matched = resolveWardByCoords(nextCoords.lat, nextCoords.lng, allWards);
    setDraftLocationMode('region');
    setDraftWard(matched ?? null);
    setDraftRegionLabel(matched ? null : region.name);
    setDraftCoords(nextCoords);
  };

  const handleApplyLocation = async () => {
    if (draftLocationMode === 'all') {
      setWard(null);
      setCoords(null);
      setRegionLabel(null);
      setLocationMode('all');
      setExplicitLocal(true);
      setLocMapOpen(false);
      return;
    }
    if (draftLocationMode === 'gps') {
      await handlePickGPS();
      return;
    }
    setWard(draftWard);
    setCoords(draftCoords);
    setRegionLabel(draftRegionLabel);
    setLocationMode('region');
    setExplicitLocal(true);
    setLocMapOpen(false);
  };

  // 지역 필터 chip ✕ — 시트의 '전체 지역' 적용(handleApplyLocation 의 draftLocationMode==='all'
  // 분기)과 동일한 해제 흐름. explicitLocal=true 로 전역 스토어 동기화보다 우선시키고,
  // 저장(localStorage)은 기존 필터 저장 이펙트가 그대로 처리한다.
  const clearRegionFilter = useCallback(() => {
    setWard(null);
    setCoords(null);
    setRegionLabel(null);
    setLocationMode('all');
    setExplicitLocal(true);
  }, []);

  const openLocationSheet = () => {
    setDraftLocationMode(locationMode);
    setDraftWard(ward);
    setDraftCoords(coords);
    setDraftRegionLabel(regionLabel);
    setLocMapOpen(true);
  };

  const currentRegionName = ward ? localizedName(ward) : regionLabel;
  const currentLocationTitle = locationMode === 'all'
    ? t('market.allAreas')
    : currentRegionName ?? t('market.currentLocation');
  const currentLocationMeta = locationMode === 'all'
    ? t('market.locationMetaAll')
    : locationMode === 'gps'
      ? t('market.locationMetaGps')
      : t('market.locationMetaRegion');
  const draftRegionName = draftWard ? localizedName(draftWard) : draftRegionLabel;
  const canApplyLocation = draftLocationMode === 'all' || draftLocationMode === 'gps' || !!draftCoords;

  const fetchPage = useCallback(
    (page: number) =>
      fetchListings({
        sort, hideSold,
        lat: coords?.lat, lng: coords?.lng,
        wardId: ward?.id ?? null,
        viewerId: userId, page, size: 20,
      }),
    [sort, hideSold, coords, ward?.id, userId],
  );

  const { items: listings, isLoading, isLoadingMore, hasMore, error: listError, sentinelRef, reset } =
    useInfiniteScroll<Listing>(fetchPage, 20, [sort, hideSold, coords, ward?.id, userId]);

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
    fetchListings({
      sort, hideSold,
      minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
      wardId: ward?.id ?? null,
      viewerId: userId, page: 1, size: 50,
    }).then((res) => {
      if (seq !== mapReqSeqRef.current) return;
      setMapListings(res.items);
      setMapError(false);
    }).catch(() => {
      if (seq !== mapReqSeqRef.current) return;
      setMapError(true);
    });
  }, [sort, hideSold, ward?.id, userId]);

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
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sort, hideSold, locationMode, ward, coords, regionLabel, explicitLocal, viewMode, scrollTop: 0,
      }));
    } catch { /* ignore */ }
  }, [sort, hideSold, locationMode, ward, coords, regionLabel, explicitLocal, viewMode]);

  // 상세 이동 전 현재 스크롤 위치 저장
  const saveScroll = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sort, hideSold, locationMode, ward, coords, regionLabel, explicitLocal, viewMode,
        scrollTop: containerRef.current?.scrollTop ?? 0,
      }));
    } catch { /* ignore */ }
  }, [sort, hideSold, locationMode, ward, coords, regionLabel, explicitLocal, viewMode, containerRef]);

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
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button className={styles.locationBtn} onClick={openLocationSheet}>
            <h1 className={styles.title}>
              {currentLocationTitle}
              <span className={styles.caret}><ChevronDown size={20} strokeWidth={2.4} /></span>
            </h1>
            <p className={styles.tagline}>{t('market.tagline', { defaultValue: '내 근처 라이더 장터' })}</p>
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

      {viewMode === 'map' ? (
        <div className={styles.mapArea}>
          {/* 지도→리스트 복귀 — 동네지도(NeighborhoodMapCanvas)의 상단 뒤로가기 버튼과 동일한 동선 */}
          <button type="button" className={styles.mapBackBtn} onClick={() => setViewMode('list')} aria-label={t('market.viewList', { defaultValue: '목록' })}>
            <ChevronLeft size={22} strokeWidth={2.4} />
          </button>
          <Suspense fallback={<div className={styles.mapLoading}>{t('common.loading', { defaultValue: '로딩 중...' })}</div>}>
            <SaigonMapV5
              height="100%"
              initialGps={coords ?? undefined}
              // 선택된 지역이 있으면(locationMode !== 'all') GPS 자동 locate 를 켜지 않는다 —
              // 켜면 마운트 후 비동기 GPS 완료가 selWard/카메라를 다른 동으로 덮어써
              // 선택 경계와 어긋난다(동네지도 회귀 aa2f214 재발 방지, 2026-08-03 발견 사유와 동일).
              locateOnMount={locationMode === 'all'}
              // 자동 locate 를 끈 모드(region/gps)에서도 내 위치 파란 점은 찍는다 — dot 전용
              // 조용한 측위라 카메라·선택 경계에 영향이 없다 (대표 지적 2026-08-04:
              // "동네지도엔 내 위치가 찍히는데 마켓지도엔 안 찍힌다").
              meDotOnMount={locationMode !== 'all'}
              // 선택 동 폴리곤 강조(주황 경계 + 외부지역 마스크) — 특정 동으로 범위가
              // 좁혀진 때만 켠다(대표 지시 2026-08-03: "다른 지역은 노출시키지 않으니
              // 그 지역만 테두리를 쳐주는 게 맞다"). '전체 지역'은 여러 동을 함께 보여주므로
              // 특정 테두리가 의미 없어 끈다. gps 모드도 결과적으로 한 동으로 필터되므로
              // region 과 동일 취급한다.
              // 직전엔 false 하드코딩이었다 — 동네지도가 selWard 미세팅으로 경계를 못 그리던
              // 것에 맞춰 '경계 없음'으로 하향 통일했었으나, 동네지도 쪽 근본원인
              // (SaigonMapV5 activeRegionAt 신설)을 고쳐 '경계 있음'으로 상향 통일했다.
              polyActive={locationMode !== 'all'}
              activeRegionAt={locationMode !== 'all' ? coords : null}
              markers={mapMarkers}
              anchorOverlay={postPanelOpen ? undefined : listingOverlay}
              onBboxChange={handleMapBboxChange}
              // L2 줌 게이트 (동네지도와 통일, 대표 지적 2026-08-04) — 게이트 밖에서는
              // 핀/말풍선/패널 정리 + fetch 차단 + 확대 안내 필 노출.
              onDepthChange={setShowDistrictBadges}
              // 게이트 임계도 동네지도와 정합 — 동네지도는 markerDepth='l2'(L2 진입 시 핀 허용)라,
              // 기본값 'l3' 를 그대로 두면 L2~L3 구간에서 동네지도는 핀을 보여주는데 마켓만
              // 게이트가 닫혀 화면이 비는 불일치가 생긴다.
              markerDepth="l2"
              zoomInRef={zoomInRef}
              focusPointRef={focusPointRef}
              bottomInsetPx={postPanelOpen ? postPanelHeight : 0}
              outsideAreaFallback
              outsideAreaMessage={t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' })}
              // 현재 위치로(◎) 버튼 제거 (service-rules GPS 원칙 2, 2026-07-25 개정) — 동네지도와
              // 동일하게 SaigonMapV5 내장 버튼을 끈다(컴포넌트 자체는 다른 화면에서 계속 사용).
              showLocateControl={false}
            />
          </Suspense>
          {/* 지역 필터 chip — 동네지도와 같은 AreaPill 공용 컴포넌트(대표 지적 2026-08-04).
              동네지도는 시트 floatingTopLeft 슬롯(시트가 포스트 패널 오픈 시 display:none 이라
              chip 도 함께 숨음)에 띄우므로, 시트가 없는 마켓도 postPanelOpen 이면 숨겨 동작을
              맞춘다. 라벨은 헤더와 동일 규칙(ward 명 → regionLabel → '내 현재 위치' 폴백). */}
          {locationMode !== 'all' && !postPanelOpen && (
            <div className={styles.areaPillWrap}>
              <AreaPill
                name={currentRegionName ?? t('market.currentLocation')}
                onClear={clearRegionFilter}
              />
            </div>
          )}
          {/* 줌 게이트 힌트 필 — 동네지도 zoomHintPill 과 같은 문구/동작(탭 = 뷰포트 중심 확대).
              게이트 밖에서 핀이 비는 이유를 사용자에게 알린다. */}
          {showDistrictBadges && (
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

      {/* 글쓰기 FAB */}
      <button className={styles.writeFab} type="button" onClick={() => navigate('/market/new')} aria-label={t('market.create', { defaultValue: '매물 등록' })}>
        <Plus size={26} strokeWidth={2.4} />
      </button>

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

      {/* 지역 선택 시트 */}
      <BottomSheet open={locMapOpen} onClose={() => setLocMapOpen(false)}>
        <div className={styles.locSheet}>
          <div className={styles.locHeader}>
            <span className={styles.locEyebrow}>{t('market.locationScope')}</span>
            <strong className={styles.locCurrent}>{currentLocationTitle}</strong>
            <p className={styles.locDesc}>{currentLocationMeta}</p>
          </div>

          <button
            className={`${styles.locCard} ${draftLocationMode === 'all' ? styles.locCardActive : ''}`}
            onClick={() => setDraftLocationMode('all')}
          >
            <span className={styles.locCardIcon}><Globe size={20} strokeWidth={2} /></span>
            <span className={styles.locCardBody}>
              <strong className={styles.locCardTitle}>{t('market.allAreas')}</strong>
              <span className={styles.locCardText}>{t('market.locationMetaAll')}</span>
            </span>
            <span className={styles.locCardCheck}><RadioCircle checked={draftLocationMode === 'all'} /></span>
          </button>

          <button
            className={`${styles.locCard} ${draftLocationMode === 'gps' ? styles.locCardActive : ''}`}
            onClick={() => setDraftLocationMode('gps')}
          >
            <span className={styles.locCardIcon}><LocateFixed size={20} strokeWidth={2} /></span>
            <span className={styles.locCardBody}>
              <strong className={styles.locCardTitle}>{t('market.currentLocation')}</strong>
              <span className={styles.locCardText}>{t('market.locationMetaGps')}</span>
            </span>
            <span className={styles.locCardCheck}><RadioCircle checked={draftLocationMode === 'gps'} /></span>
          </button>

          <button
            className={`${styles.locCard} ${draftLocationMode === 'region' ? styles.locCardActive : ''}`}
            onClick={() => setDraftLocationMode('region')}
          >
            <span className={styles.locCardIcon}><MapIcon size={20} strokeWidth={2} /></span>
            <span className={styles.locCardBody}>
              <strong className={styles.locCardTitle}>{t('market.selectArea')}</strong>
              <span className={styles.locCardText}>
                {draftRegionName ?? t('market.locationMetaPick')}
              </span>
            </span>
            <span className={styles.locCardCheck}><RadioCircle checked={draftLocationMode === 'region'} /></span>
          </button>

          {draftLocationMode === 'region' && (
            <div className={styles.locMapPanel}>
              <div className={styles.locMapCaption}>
                <MapPinned size={16} />
                <span>{draftRegionName ?? t('market.pickAreaOnMap')}</span>
              </div>
              <div className={styles.locMapInner}>
              <SaigonMapV2
                height={280}
                initialGps={draftCoords ?? coords ?? undefined}
                onRegionSelect={handleDraftRegion}
              />
            </div>
            </div>
          )}

          <div className={styles.locActions}>
            <Button variant="ghost" size="md" fullWidth={false} onClick={() => setLocMapOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="md" fullWidth={false} onClick={() => void handleApplyLocation()} disabled={!canApplyLocation}>
              {t('market.applyLocation')}
            </Button>
          </div>
        </div>
      </BottomSheet>

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
