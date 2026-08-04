import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Globe,
  Heart,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  RotateCw,
  Search,
  Store,
  UserRound,
} from 'lucide-react';
import {
  bizCategoryLabel,
  fetchBizCategories,
  fetchBizMapItems,
  type BizCategory,
  type BizMapItem,
} from '@/api/biz';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import { regionContains, type SelectedRegion } from '@/components/maps/v2/region';
import { wardRegionAt } from '@/components/maps/v2/wardRegions';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { RadioCircle } from '@/components/ui/RadioCircle';
import { toast } from '@/components/ui/Toast';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { haversineM } from '@/lib/polyline';
import { requestDeviceLocation, resolveUsableLocation } from '@/lib/serviceLocation';
// 지역 선택 시트 마크업/스타일은 마켓(MarketMain)의 것을 재사용 — 화면 로컬 상태로만 다룬다.
// 대표 결정(2026-07-27, ai-docs/context/frontend-page-map.md:128): 리스트뷰를
// useLocationStore(홈/정보 화면 공유 전역 SoT)에 opt-in 시키는 통합안을 검토했으나 보류·현행
// 유지로 확정됐다 — 리스트에서 지역을 고른 것만으로 정보 화면(날씨/주유소/정비소)·홈의
// 동네까지 함께 바뀌는 침습을 피하기 위함(침수지도 사고와 동일 경로). "지도보기" 전환 시
// 지역이 안 넘어가는 불일치는 인지된 트레이드오프로 남겨둔다.
import marketStyles from '@/pages/market/MarketMain.module.css';
import BizRichCard from './BizRichCard';
import styles from './NeighborhoodMapList.module.css';

const NeighborhoodMapCanvas = lazy(() => import('./NeighborhoodMapCanvas'));

const HCMC_BBOX = { minLat: 10.40, maxLat: 11.10, minLng: 106.40, maxLng: 107.00 };
// N-2: 이전엔 100 이었다 — fetchBizMapItems 는 has_more 로 이미 여러 페이지를 순회하는데
// maxItems=100 이 그 순회를 조기 중단시켜 101번째부터 업체가 조용히 사라졌다(c822831 의
// LIMIT 50→1000 상향과 같은 결: 절단선이 아니라 폭주 방지용 안전판으로 상향).
const BIZ_MAX_ITEMS = 1000;

/** 선택 동(SelectedRegion)의 폴리곤 외접 bbox — NeighborhoodMapCanvas.regionBbox 와 동일 알고리즘. */
function regionBbox(region: SelectedRegion) {
  if (region.poly.length < 3) {
    const d = 0.01;
    return { minLat: region.lat - d, maxLat: region.lat + d, minLng: region.lng - d, maxLng: region.lng + d };
  }
  const lats = region.poly.map((p) => p.lat);
  const lngs = region.poly.map((p) => p.lng);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}

export default function NeighborhoodMap() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapOpen = searchParams.get('view') === 'map';
  // 지역·카테고리는 URL 쿼리(cat/rlat/rlng)로 보존한다(P2-11) — 탭 전환으로 이 컴포넌트가
  // 언마운트돼도 복귀 시 그대로 복원된다. wardRegionAt 로 좌표에서 동(ward) polygon 을
  // 재구성한다(대표 결정 — useLocationStore 전역화는 금지, 화면 로컬/URL 로만 다룬다).
  const [bizCategory, setBizCategory] = useState<string | null>(() => searchParams.get('cat'));
  const [bizCategories, setBizCategories] = useState<BizCategory[]>([]);
  const [bizItems, setBizItems] = useState<BizMapItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // GPS 는 "내 주변순" 토글을 사용자가 직접 눌렀을 때만 요청한다(P1-3 — 진입 시 자동 요청 금지,
  // service-rules.md:11-12). 꺼져 있으면 가게 카드 거리 표기만 생략된다. URL 에는 싣지 않는다 —
  // 복귀 시 저장된 좌표로 자동 재요청/재계산되면 "진입만으로 GPS 요청" 회귀와 동치가 된다.
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [nearMeLoading, setNearMeLoading] = useState(false);
  // 지역 선택 — 화면 로컬 상태(마켓의 locationMode/regionLabel 레퍼런스). 'all' = 호치민 전역.
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(() => {
    const rlat = Number(searchParams.get('rlat'));
    const rlng = Number(searchParams.get('rlng'));
    if (!Number.isFinite(rlat) || !Number.isFinite(rlng)) return null;
    return wardRegionAt(rlat, rlng);
  });
  // 마켓(MarketMain.locationMode)과 동일한 3옵션 — 'all' | 'gps' | 'region' (대표 지시 2026-08-03:
  // 동네지도에만 '내 현재 위치'가 없어 마켓과 통일성이 없다). 'gps' 는 GPS 좌표가 속한 동을
  // 찾아 그 동으로 좁히는 것 — 마켓과 같은 행정동 매칭이라 이후 필터 경로는 'region' 과 동일하다.
  const [regionMode, setRegionMode] = useState<'all' | 'gps' | 'region'>(() => (selectedRegion ? 'region' : 'all'));
  // 한 동으로 범위가 좁혀진 상태 — 'gps'/'region' 둘 다 selectedRegion 을 보유하므로 필터·bbox·
  // 라벨 경로가 동일하다('all' 만 호치민 전역).
  const regionScoped = regionMode !== 'all';
  const [locSheetOpen, setLocSheetOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<'all' | 'gps' | 'region'>('all');
  const [draftRegion, setDraftRegion] = useState<SelectedRegion | null>(null);

  useEffect(() => {
    if (bizCategories.length > 0) return;
    fetchBizCategories().then(setBizCategories).catch(() => setBizCategories([]));
  }, [bizCategories.length]);

  const toggleNearMe = useCallback(() => {
    if (userPos) {
      // 이미 켜져 있으면 끄기만 한다 — 재요청 없음.
      setUserPos(null);
      return;
    }
    setNearMeLoading(true);
    // 요청 전에 목적을 먼저 알린다(P1-3 — 맥락 없는 권한 프롬프트 금지).
    toast.neutral(t('map.listFirst.nearMeRationale'));
    requestDeviceLocation()
      .then((pos) => setUserPos({ lat: pos.lat, lng: pos.lng }))
      .catch((err: unknown) => {
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
      })
      .finally(() => setNearMeLoading(false));
  }, [userPos, t]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    const bbox = regionScoped && selectedRegion ? regionBbox(selectedRegion) : HCMC_BBOX;

    fetchBizMapItems({
      ...bbox,
      category: bizCategory ?? undefined,
      // S-5: "우리 동네" 리스트는 거리순이어야 한다 — userPos 가 있으면 넘겨 백엔드가
      // 가까운 순으로 정렬(없으면 백엔드가 id.asc() 폴백, 위치 거부/실패 시에도 결정론 유지).
      lat: userPos?.lat,
      lng: userPos?.lng,
      signal: controller.signal,
      maxItems: BIZ_MAX_ITEMS,
    }).then((items) => {
      // bbox 는 selectedRegion 폴리곤의 외접 사각형(regionBbox)이라 실제 동 경계보다 넓다 —
      // 이웃 동 업체가 섞여 "동네 가게"에 다른 동 업체가 나오는 걸 막기 위해 폴리곤 정확
      // 매칭으로 한 번 더 좁힌다(regionContains 는 wardRegionAt 이미 쓰는 동일 함수).
      const filtered =
        regionScoped && selectedRegion
          ? items.filter((biz) => regionContains(selectedRegion, biz.lat, biz.lng))
          : items;
      setBizItems(filtered);
      setTotal(filtered.length);
    })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bizCategory, reloadKey, i18n.language, regionMode, selectedRegion, userPos]);

  // 지역·카테고리를 URL 쿼리로 되쓴다(P2-11) — replace 만 사용해 히스토리 엔트리를 늘리지
  // 않는다. "지도보기" 진입(openMap)은 별도로 push 를 쓰고, 지도 쪽 뒤로가기(onExitMap)는
  // navigate(-1) 로 그 push 엔트리 하나만 소비하므로 여기서 replace 로 view 이외의 쿼리를
  // 갱신해도 그 back 동작(과거 navigate(-1) 회귀 이력 있음)에는 영향이 없다.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (bizCategory) next.set('cat', bizCategory); else next.delete('cat');
    if (regionScoped && selectedRegion) {
      next.set('rlat', String(selectedRegion.lat));
      next.set('rlng', String(selectedRegion.lng));
    } else {
      next.delete('rlat');
      next.delete('rlng');
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [bizCategory, regionMode, selectedRegion, searchParams, setSearchParams]);

  const openLocationSheet = () => {
    setDraftMode(regionMode);
    setDraftRegion(selectedRegion);
    setLocSheetOpen(true);
  };

  // '내 현재 위치' — 마켓(handlePickGPS)과 동일 경로: resolveUsableLocation 으로 좌표를 얻어
  // 그 좌표가 속한 동을 찾아 필터 범위로 삼는다(행정동 매칭). 이후 필터 로직은 'region' 과 동일.
  const applyGpsLocation = async () => {
    try {
      const loc = await resolveUsableLocation();
      if (loc.source === 'fallback') {
        toast.neutral(t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' }));
      }
      const region = wardRegionAt(loc.coords.lat, loc.coords.lng);
      if (!region) {
        toast.warning(t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' }));
        return;
      }
      setUserPos(loc.coords);
      setRegionMode('gps');
      setSelectedRegion(region);
      setLocSheetOpen(false);
    } catch (err: unknown) {
      const code = (err as { code?: number } | null)?.code;
      if (code === 1) {
        toast.warning(t('map.listFirst.nearMeDenied'));
      } else if (code === 3) {
        toast.warning(t('map.listFirst.nearMeTimeout'));
      } else {
        toast.warning(t('map.listFirst.nearMeUnavailable'));
      }
    }
  };

  const applyLocation = () => {
    if (draftMode === 'all') {
      setRegionMode('all');
      setSelectedRegion(null);
    } else if (draftMode === 'gps') {
      void applyGpsLocation();
      return;
    } else if (draftRegion) {
      setRegionMode('region');
      setSelectedRegion(draftRegion);
    }
    setLocSheetOpen(false);
  };

  const selectBizCategory = (category: string | null) => {
    if (category === bizCategory) return;
    setLoading(true);
    setBizItems([]);
    setTotal(0);
    setBizCategory(category);
  };

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(() => setReloadKey((value) => value + 1), []),
  );

  const detailState = { backgroundLocation: location };
  const openMap = () => {
    const next = new URLSearchParams(searchParams);
    next.set('view', 'map');
    setSearchParams(next);
  };

  if (mapOpen) {
    return (
      <Suspense fallback={<div className={styles.mapLoading}>{t('map.listFirst.loadingMap')}</div>}>
        <NeighborhoodMapCanvas
          initialBizCategory={bizCategory}
          initialRegion={regionScoped ? selectedRegion : null}
          lightweight
          onExitMap={() => navigate(-1)}
        />
      </Suspense>
    );
  }

  const itemCount = bizItems.length;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <button type="button" className={styles.locationBtn} onClick={openLocationSheet}>
            <span className={styles.eyebrow}>{t('map.listFirst.myArea')}</span>
            <h1>
              {regionScoped && selectedRegion ? selectedRegion.name : t('market.allAreas')}
              <span className={styles.caret}><ChevronDown size={20} strokeWidth={2.4} /></span>
            </h1>
          </button>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => navigate('/map/search')} aria-label={t('map.listFirst.search')}>
              <Search size={23} strokeWidth={2} />
            </button>
            <button type="button" onClick={() => navigate('/map/favorites')} aria-label={t('map.listFirst.saved')}>
              <Heart size={24} strokeWidth={2} />
            </button>
            <button type="button" onClick={() => navigate('/map/profile')} aria-label={t('map.neighborhoodProfile.title')}>
              <UserRound size={23} strokeWidth={2} />
            </button>
          </div>
        </div>

        {bizCategories.length > 0 && (
          <div className={styles.categoryRail}>
            <button
              type="button"
              className={bizCategory == null ? styles.categoryActive : undefined}
              onClick={() => selectBizCategory(null)}
            >
              {t('map.bizCategoryAll')}
            </button>
            {bizCategories.map((category) => (
              <button
                key={category.code}
                type="button"
                className={bizCategory === category.code ? styles.categoryActive : undefined}
                onClick={() => selectBizCategory(category.code)}
              >
                <BizCatIcon category={category.code} size={14} />
                {bizCategoryLabel(category, i18n.language)}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className={styles.content} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        <div className={styles.resultHead}>
          <strong>{t('map.listFirst.section.biz')}</strong>
          {!loading && !error && <span>{t('map.count', { count: total })}</span>}
          <button
            type="button"
            className={`${styles.nearMeToggle} ${userPos ? styles.nearMeActive : ''}`}
            onClick={toggleNearMe}
            disabled={nearMeLoading}
            aria-pressed={!!userPos}
          >
            <LocateFixed size={13} strokeWidth={2.4} />
            {t('map.listFirst.nearMe')}
          </button>
        </div>

        {loading && itemCount === 0 ? (
          <div className={styles.skeletons} aria-label={t('map.loading')}>
            {[0, 1, 2].map((item) => (
              <div key={item} className={styles.skeletonBiz}>
                <div className={styles.skeletonBizName} />
                <div className={styles.skeletonBizMeta} />
                <div className={styles.skeletonBizRail} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className={styles.state}>
            <span className={styles.stateIcon}><RotateCw size={24} /></span>
            <strong>{t('map.loadError')}</strong>
            <p>{t('map.loadErrorDesc')}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
              {t('common.retry')}
            </button>
          </div>
        ) : itemCount === 0 ? (
          <div className={styles.state}>
            <span className={styles.stateIcon}>
              <Store size={24} />
            </span>
            <strong>{t('map.listFirst.empty.biz')}</strong>
            <p>{t('map.listFirst.emptyHint')}</p>
          </div>
        ) : (
          <div className={styles.bizList}>
            {bizItems.map((biz) => {
              const category = bizCategories.find((item) => item.code === biz.category);
              const distM = userPos ? haversineM(userPos.lat, userPos.lng, biz.lat, biz.lng) : null;
              return (
                <BizRichCard
                  key={biz.id}
                  biz={biz}
                  categoryLabel={category ? bizCategoryLabel(category, i18n.language) : undefined}
                  distanceM={distM}
                  onClick={() => navigate(`/biz/${biz.id}`, { state: detailState })}
                />
              );
            })}
          </div>
        )}

        {!loading && !error && bizItems.length >= BIZ_MAX_ITEMS && (
          <p className={styles.bizLimitNote}>{t('map.listFirst.bizLimit')}</p>
        )}
        </div>
      </main>

      <button type="button" className={styles.mapPill} onClick={openMap}>
        <MapPinned size={17} />
        {t('map.viewMap')}
      </button>

      {/* 지역 선택 시트 — 마켓(MarketMain)의 지역 선택 UI 레퍼런스, 스타일은 그대로 재사용 */}
      <BottomSheet open={locSheetOpen} onClose={() => setLocSheetOpen(false)}>
        <div className={marketStyles.locSheet}>
          <div className={marketStyles.locHeader}>
            <span className={marketStyles.locEyebrow}>{t('market.locationScope')}</span>
            <strong className={marketStyles.locCurrent}>
              {regionScoped && selectedRegion ? selectedRegion.name : t('market.allAreas')}
            </strong>
            <p className={marketStyles.locDesc}>
              {regionMode === 'all' ? t('market.locationMetaAll') : regionMode === 'gps' ? t('market.locationMetaGps') : t('market.locationMetaRegion')}
            </p>
          </div>

          <button
            className={`${marketStyles.locCard} ${draftMode === 'all' ? marketStyles.locCardActive : ''}`}
            onClick={() => setDraftMode('all')}
          >
            <span className={marketStyles.locCardIcon}><Globe size={20} strokeWidth={2} /></span>
            <span className={marketStyles.locCardBody}>
              <strong className={marketStyles.locCardTitle}>{t('market.allAreas')}</strong>
              <span className={marketStyles.locCardText}>{t('market.locationMetaAll')}</span>
            </span>
            <span className={marketStyles.locCardCheck}><RadioCircle checked={draftMode === 'all'} /></span>
          </button>

          {/* '내 현재 위치' — 마켓 시트와 동일한 두 번째 옵션 (아이콘·문구·순서 일치) */}
          <button
            className={`${marketStyles.locCard} ${draftMode === 'gps' ? marketStyles.locCardActive : ''}`}
            onClick={() => setDraftMode('gps')}
          >
            <span className={marketStyles.locCardIcon}><LocateFixed size={20} strokeWidth={2} /></span>
            <span className={marketStyles.locCardBody}>
              <strong className={marketStyles.locCardTitle}>{t('market.currentLocation')}</strong>
              <span className={marketStyles.locCardText}>{t('market.locationMetaGps')}</span>
            </span>
            <span className={marketStyles.locCardCheck}><RadioCircle checked={draftMode === 'gps'} /></span>
          </button>

          <button
            className={`${marketStyles.locCard} ${draftMode === 'region' ? marketStyles.locCardActive : ''}`}
            onClick={() => setDraftMode('region')}
          >
            <span className={marketStyles.locCardIcon}><MapIcon size={20} strokeWidth={2} /></span>
            <span className={marketStyles.locCardBody}>
              <strong className={marketStyles.locCardTitle}>{t('market.selectArea')}</strong>
              <span className={marketStyles.locCardText}>
                {draftRegion?.name ?? t('market.locationMetaPick')}
              </span>
            </span>
            <span className={marketStyles.locCardCheck}><RadioCircle checked={draftMode === 'region'} /></span>
          </button>

          {draftMode === 'region' && (
            <div className={marketStyles.locMapPanel}>
              <div className={marketStyles.locMapCaption}>
                <MapPinned size={16} />
                <span>{draftRegion?.name ?? t('market.pickAreaOnMap')}</span>
              </div>
              <div className={marketStyles.locMapInner}>
                <SaigonMapV2
                  height={280}
                  initialGps={draftRegion ? { lat: draftRegion.lat, lng: draftRegion.lng } : (selectedRegion ? { lat: selectedRegion.lat, lng: selectedRegion.lng } : undefined)}
                  onRegionSelect={setDraftRegion}
                />
              </div>
            </div>
          )}

          <div className={marketStyles.locActions}>
            <Button variant="ghost" size="md" fullWidth={false} onClick={() => setLocSheetOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="md" fullWidth={false} onClick={applyLocation} disabled={draftMode === 'region' && !draftRegion}>
              {t('market.applyLocation')}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
