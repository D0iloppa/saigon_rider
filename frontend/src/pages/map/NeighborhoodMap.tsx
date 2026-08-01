import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Globe,
  Heart,
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
import type { SelectedRegion } from '@/components/maps/v2/region';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { RadioCircle } from '@/components/ui/RadioCircle';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { haversineM } from '@/lib/polyline';
import { requestDeviceLocation } from '@/lib/serviceLocation';
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
  const [bizCategory, setBizCategory] = useState<string | null>(null);
  const [bizCategories, setBizCategories] = useState<BizCategory[]>([]);
  const [bizItems, setBizItems] = useState<BizMapItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 진입 시 GPS 1회 — 가게 카드 거리 표기 기준점. 거부/실패 시 거리만 생략.
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  // 지역 선택 — 화면 로컬 상태(마켓의 locationMode/regionLabel 레퍼런스). 'all' = 호치민 전역.
  const [regionMode, setRegionMode] = useState<'all' | 'region'>('all');
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [locSheetOpen, setLocSheetOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<'all' | 'region'>('all');
  const [draftRegion, setDraftRegion] = useState<SelectedRegion | null>(null);

  useEffect(() => {
    if (bizCategories.length > 0) return;
    fetchBizCategories().then(setBizCategories).catch(() => setBizCategories([]));
  }, [bizCategories.length]);

  useEffect(() => {
    let cancelled = false;
    requestDeviceLocation()
      .then((pos) => {
        if (!cancelled) setUserPos({ lat: pos.lat, lng: pos.lng });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    const bbox = regionMode === 'region' && selectedRegion ? regionBbox(selectedRegion) : HCMC_BBOX;

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
      setBizItems(items);
      setTotal(items.length);
    })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bizCategory, reloadKey, i18n.language, regionMode, selectedRegion, userPos]);

  const openLocationSheet = () => {
    setDraftMode(regionMode);
    setDraftRegion(selectedRegion);
    setLocSheetOpen(true);
  };

  const applyLocation = () => {
    if (draftMode === 'all') {
      setRegionMode('all');
      setSelectedRegion(null);
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
              {regionMode === 'region' && selectedRegion ? selectedRegion.name : t('market.allAreas')}
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
              {regionMode === 'region' && selectedRegion ? selectedRegion.name : t('market.allAreas')}
            </strong>
            <p className={marketStyles.locDesc}>
              {regionMode === 'region' ? t('market.locationMetaRegion') : t('market.locationMetaAll')}
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
