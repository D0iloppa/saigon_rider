import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bell, ChevronDown, Globe, Heart, List, LocateFixed, Map as MapIcon, MapPinned, PackageOpen, Plus, Search, X } from 'lucide-react';
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
import type { SelectedRegion, MapMarkerV2 } from '@/components/maps/v2/region';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { resolveUsableLocation } from '@/lib/serviceLocation';
import { adAtIndex, ADS_ENABLED, AD_LIMIT_INITIAL, nextAdLimit } from '@/lib/adPlacement';
import { useUserStore } from '@/store/useUserStore';
import { useServiceLocation } from '@/hooks/useServiceLocation';
import { fetchDistricts, localizedName, type District } from '@/api/master';
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
import ListingCard from './ListingCard';
import AdCard from './AdCard';
import styles from './MarketMain.module.css';

const STORAGE_KEY = 'mkt_filter_v2';
interface SavedState {
  sort: ListingSort;
  hideSold: boolean;
  locationMode: 'all' | 'gps' | 'region';
  district: District | null;
  coords: { lat: number; lng: number } | null;
  regionLabel: string | null;
  /** 마켓 자체 위치 시트/URL 쿼리에서 명시적으로 고른 지역인지 — true면 전역 스토어 동기화보다 우선. */
  explicitLocal: boolean;
  /** 리스트/지도 뷰 토글 — 상세 갔다 돌아와도 유지 (SGR 마켓 지도, 대표 지시). */
  viewMode: 'list' | 'map';
  scrollTop: number;
}
function readSaved(): SavedState | null {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as SavedState) : null;
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
  const [district, setDistrict] = useState<District | null>(savedState?.district ?? null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(savedState?.coords ?? null);
  const [locationMode, setLocationMode] = useState<'all' | 'gps' | 'region'>(savedState?.locationMode ?? 'all');
  const [explicitLocal, setExplicitLocal] = useState<boolean>(savedState?.explicitLocal ?? false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>(savedState?.viewMode ?? 'list');
  const [mapListings, setMapListings] = useState<Listing[]>([]);
  const [mapError, setMapError] = useState(false);
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [allDistricts, setAllDistricts] = useState<District[]>([]);
  const [locMapOpen, setLocMapOpen] = useState(false);
  const [regionLabel, setRegionLabel] = useState<string | null>(savedState?.regionLabel ?? null);
  const [draftLocationMode, setDraftLocationMode] = useState<'all' | 'gps' | 'region'>('all');
  const [draftDistrict, setDraftDistrict] = useState<District | null>(null);
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [draftRegionLabel, setDraftRegionLabel] = useState<string | null>(null);
  const [adLimit, setAdLimit] = useState(AD_LIMIT_INITIAL); // 스크롤 시 결정적 증가
  // 제휴 광고(지역 타게팅) — 동네/언어 확정 후 로드. 서버가 이미 가중 로테이션한 시퀀스이므로
  // 순서 그대로 사용(재정렬 금지). 피드 중간 삽입용.
  useEffect(() => {
    fetchAds(district?.id ?? null).then(setAds).catch(() => setAds([]));
    setAdLimit(AD_LIMIT_INITIAL);
  }, [district?.id, i18n.language]);

  // GPS 자동 실행 없음 — 사용자가 시트에서 명시적으로 선택한 경우에만 위치 반영.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const districts = await fetchDistricts().catch(() => [] as District[]);
      if (cancelled) return;
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
    if (allDistricts.length === 0) return;
    if (!globalRegion) return; // 전역도 '전체'면 로컬 기본값(all) 유지
    const d = resolveDistrict(globalRegion.lat, globalRegion.lng, allDistricts);
    setCoords({ lat: globalRegion.lat, lng: globalRegion.lng });
    setDistrict(d ?? null);
    setLocationMode('region');
    setRegionLabel(d ? null : globalRegion.name);
  }, [explicitLocal, searchParams, allDistricts, globalRegion]);

  // 홈 "내 주변 인기 상품 → 더보기"에서 ?lat=&lng= 로 진입 시: 신규 GPS 재측정 없이
  // 홈이 이미 보유한 좌표로 gps 모드에 즉시 반영 (savedState 복원보다 우선).
  useEffect(() => {
    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');
    if (latStr == null || lngStr == null) return;
    if (allDistricts.length === 0) return; // 구 해석 가능해진 뒤 1회 소비
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const d = resolveDistrict(lat, lng, allDistricts)
        ?? resolveDistrict(10.7748, 106.6879, allDistricts);
      setCoords({ lat, lng });
      setDistrict(d ?? null);
      setLocationMode('gps');
      setRegionLabel(null);
      setSort('distance');
      setExplicitLocal(true); // URL 쿼리로 받은 위치도 이후 전역 스토어 동기화보다 우선
    }
    // 소비 즉시 쿼리 제거 — 잔존 시 리로드/리마운트마다 수동 지역 선택을 덮어씀 (회귀 xreg-C1)
    setSearchParams({}, { replace: true });
  }, [searchParams, allDistricts, setSearchParams]);

  const handlePickGPS = async () => {
    try {
      const location = await resolveUsableLocation();
      const d = resolveDistrict(location.coords.lat, location.coords.lng, allDistricts);
      if (location.source === 'fallback') {
        toast.neutral(t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' }));
      }
      setCoords(location.coords);
      setDistrict(d ?? null);
      setLocationMode('gps');
      setRegionLabel(null);
      setExplicitLocal(true);
      setLocMapOpen(false);
    } catch {
      toast.error(t('market.locationError', { defaultValue: '위치를 가져올 수 없어요' }));
    }
  };

  const handleDraftRegion = (region: SelectedRegion) => {
    const nextCoords = { lat: region.lat, lng: region.lng };
    const matched = resolveDistrict(nextCoords.lat, nextCoords.lng, allDistricts);
    setDraftLocationMode('region');
    setDraftDistrict(matched ?? null);
    setDraftRegionLabel(matched ? null : region.name);
    setDraftCoords(nextCoords);
  };

  const handleApplyLocation = async () => {
    if (draftLocationMode === 'all') {
      setDistrict(null);
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
    setDistrict(draftDistrict);
    setCoords(draftCoords);
    setRegionLabel(draftRegionLabel);
    setLocationMode('region');
    setExplicitLocal(true);
    setLocMapOpen(false);
  };

  const openLocationSheet = () => {
    setDraftLocationMode(locationMode);
    setDraftDistrict(district);
    setDraftCoords(coords);
    setDraftRegionLabel(regionLabel);
    setLocMapOpen(true);
  };

  const currentRegionName = district ? localizedName(district) : regionLabel;
  const currentLocationTitle = locationMode === 'all'
    ? t('market.allAreas')
    : currentRegionName ?? t('market.currentLocation');
  const currentLocationMeta = locationMode === 'all'
    ? t('market.locationMetaAll')
    : locationMode === 'gps'
      ? t('market.locationMetaGps')
      : t('market.locationMetaRegion');
  const draftRegionName = draftDistrict ? localizedName(draftDistrict) : draftRegionLabel;
  const canApplyLocation = draftLocationMode === 'all' || draftLocationMode === 'gps' || !!draftCoords;

  const fetchPage = useCallback(
    (page: number) =>
      fetchListings({
        sort, hideSold,
        lat: coords?.lat, lng: coords?.lng,
        wardId: null,
        districtId: district?.id ?? null,
        viewerId: userId, page, size: 20,
      }),
    [sort, hideSold, coords, district?.id, userId],
  );

  const { items: listings, isLoading, isLoadingMore, hasMore, error: listError, sentinelRef, reset } =
    useInfiniteScroll<Listing>(fetchPage, 20, [sort, hideSold, coords, district?.id, userId]);

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(async () => reset(), [reset]),
  );

  // 지도 뷰 마커 조회 — 현재 필터(거래완료 숨기기·지역) + 뷰포트 bbox. 뷰포트 이동마다 무제한
  // 호출되지 않도록 400ms 디바운스(onBboxChange, SaigonMapV5→MarketMain). 정렬은 지도에서
  // 의미가 약해(bbox 기준 조회) 여전히 넘기되 UI 컨트롤만 숨김(요구사항 6).
  const mapReqSeqRef = useRef(0);
  const fetchMapBbox = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    const seq = ++mapReqSeqRef.current;
    fetchListings({
      sort, hideSold,
      minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E,
      districtId: district?.id ?? null,
      viewerId: userId, page: 1, size: 50,
    }).then((res) => {
      if (seq !== mapReqSeqRef.current) return;
      setMapListings(res.items);
      setMapError(false);
    }).catch(() => {
      if (seq !== mapReqSeqRef.current) return;
      setMapError(true);
    });
  }, [sort, hideSold, district?.id, userId]);

  const bboxTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleMapBboxChange = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => fetchMapBbox(bbox), 400);
  }, [fetchMapBbox]);
  useEffect(() => () => clearTimeout(bboxTimerRef.current), []);

  // 좌표 없는 매물 안내(요구사항 7) — 별도 조회 없이 이미 로드된 리스트 피드(동일 필터,
  // bbox 미적용)에서 좌표 누락분을 근사치로 센다. 리스트가 무한스크롤로 일부만 로드된
  // 상태일 수 있어 정확한 전체 합계는 아니지만, 추가 API 호출 없이 "최소 안내" 요건을 충족.
  const noCoordsCount = useMemo(
    () => listings.filter((l) => l.lat == null || l.lng == null).length,
    [listings],
  );

  // 필터 상태 변경 시 sessionStorage에 저장 (scrollTop은 0으로 리셋 — 새 필터는 처음부터)
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        sort, hideSold, locationMode, district, coords, regionLabel, explicitLocal, viewMode, scrollTop: 0,
      }));
    } catch { /* ignore */ }
  }, [sort, hideSold, locationMode, district, coords, regionLabel, explicitLocal, viewMode]);

  // 상세 이동 전 현재 스크롤 위치 저장
  const saveScroll = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        sort, hideSold, locationMode, district, coords, regionLabel, explicitLocal, viewMode,
        scrollTop: containerRef.current?.scrollTop ?? 0,
      }));
    } catch { /* ignore */ }
  }, [sort, hideSold, locationMode, district, coords, regionLabel, explicitLocal, viewMode, containerRef]);

  // 초기 로딩 완료 후 저장된 스크롤 위치 복원
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    const savedTop = savedState?.scrollTop ?? 0;
    if (!isLoading && !scrollRestoredRef.current && savedTop > 0) {
      scrollRestoredRef.current = true;
      containerRef.current?.scrollTo({ top: savedTop, behavior: 'instant' });
    }
  }, [isLoading, savedState?.scrollTop, containerRef]);

  // 지도 마커 — 탭 시 리스트 아이템과 동일한 상세 진입 동작(saveScroll + 동일 경로).
  const mapMarkers = useMemo<MapMarkerV2[]>(
    () => mapListings
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({
        id: l.id,
        lat: l.lat as number,
        lng: l.lng as number,
        kind: 'listing',
        label: l.title,
        onClick: () => { saveScroll(); navigate(`/market/${l.id}`); },
      })),
    [mapListings, saveScroll, navigate],
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

        {/* Sort (bottom sheet) + hide-sold toggle + list/map view toggle */}
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
            <Chip
              as="button"
              variant={viewMode === 'map' ? 'dark' : 'surface'}
              aria-pressed={viewMode === 'map'}
              onClick={() => setViewMode((v) => (v === 'map' ? 'list' : 'map'))}
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {viewMode === 'map'
                ? <><List size={14} strokeWidth={2.2} />{t('market.viewList', { defaultValue: '목록' })}</>
                : <><MapIcon size={14} strokeWidth={2.2} />{t('market.viewMap', { defaultValue: '지도' })}</>}
            </Chip>
          </div>
        </div>
      </div>

      {viewMode === 'map' ? (
        <div className={styles.mapArea}>
          <Suspense fallback={<div className={styles.mapLoading}>{t('common.loading', { defaultValue: '로딩 중...' })}</div>}>
            <SaigonMapV5
              height="100%"
              initialGps={coords ?? undefined}
              // 선택된 지역이 있으면(locationMode !== 'all') GPS 자동 locate 를 켜지 않는다 —
              // 켜면 마운트 후 비동기 GPS 완료가 selWard/카메라를 다른 동으로 덮어써
              // 선택 경계와 어긋난다(동네지도 회귀 aa2f214 재발 방지, 2026-08-03 발견 사유와 동일).
              locateOnMount={locationMode === 'all'}
              markers={mapMarkers}
              onBboxChange={handleMapBboxChange}
              outsideAreaFallback
              outsideAreaMessage={t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' })}
            />
          </Suspense>
          {mapError && (
            <div className={styles.mapNotice}>{t('market.loadError', { defaultValue: '매물을 불러오지 못했어요' })}</div>
          )}
          {!mapError && noCoordsCount > 0 && (
            <div className={styles.mapNotice}>
              {t('market.mapNoCoords', { count: noCoordsCount, defaultValue: '지도에 표시할 수 없는 매물 {{count}}건' })}
            </div>
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
