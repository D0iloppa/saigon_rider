import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Heart,
  LocateFixed,
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
import { DisplayScopeSheet } from '@/components/location/DisplayScopeSheet';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { toast } from '@/components/ui/Toast';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { haversineM } from '@/lib/polyline';
import { requestDeviceLocation } from '@/lib/serviceLocation';
import { useLocationStore, NEARBY_RADIUS_KM } from '@/store/useLocationStore';
import BizRichCard from './BizRichCard';
import styles from './NeighborhoodMapList.module.css';

const NeighborhoodMapCanvas = lazy(() => import('./NeighborhoodMapCanvas'));

const HCMC_BBOX = { minLat: 10.40, maxLat: 11.10, minLng: 106.40, maxLng: 107.00 };
// N-2: 이전엔 100 이었다 — fetchBizMapItems 는 has_more 로 이미 여러 페이지를 순회하는데
// maxItems=100 이 그 순회를 조기 중단시켜 101번째부터 업체가 조용히 사라졌다(c822831 의
// LIMIT 50→1000 상향과 같은 결: 절단선이 아니라 폭주 방지용 안전판으로 상향).
const BIZ_MAX_ITEMS = 1000;

/** 내 좌표 반경(km)의 외접 bbox — 'gps' 표시범위의 조회 범위. 행정동 폴리곤 대신 반경을 쓴다
 *  (대표 지시 2026-08-06, 설계도 D4: 구 경계에 걸친 곳이 누락되지 않게). */
function radiusBbox(center: { lat: number; lng: number }, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minLat: center.lat - dLat, maxLat: center.lat + dLat,
    minLng: center.lng - dLng, maxLng: center.lng + dLng,
  };
}

export default function NeighborhoodMap() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapOpen = searchParams.get('view') === 'map';
  // 카테고리는 URL 쿼리(cat)로 보존한다(P2-11) — 탭 전환으로 언마운트돼도 복귀 시 복원.
  // 표시 범위는 URL 이 아니라 useLocationStore 가 들고 있다(2026-08-06 전역 단일화).
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
  // 표시 범위는 앱 전역 단일 SoT — 'gps'(내 위치 반경) ↔ 'all'(전체). 종전의 화면 로컬
  // 지역 선택('region')과 URL 쿼리(rlat/rlng) 보존은 폐기됐다(대표 지시 2026-08-06).
  const regionMode = useLocationStore((s) => s.mode);
  const coords = useLocationStore((s) => s.coords);
  const wardName = useLocationStore((s) => s.wardName);
  const coordsSource = useLocationStore((s) => s.coordsSource);
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  const [locSheetOpen, setLocSheetOpen] = useState(false);
  // 진입 시 측위 — 스토어가 세션당 1회로 묶는다.
  useEffect(() => { void ensureLocation(); }, [ensureLocation]);
  // 헤더 라벨. 권역 밖이라 중심가로 대체된 상태면 동네명을 쓰지 않는다(설계도 §4.3).
  const scopeLabel = regionMode === 'all'
    ? t('location.allTitle')
    : coordsSource === 'fallback'
      ? t('location.fallbackTitle')
      : wardName ?? t('location.gpsTitle');

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

    // 'gps' 면 내 좌표 반경, 'all' 이면 호치민 전역. 행정동 폴리곤으로 좁히지 않는다.
    const bbox = regionMode === 'gps' && coords ? radiusBbox(coords, NEARBY_RADIUS_KM) : HCMC_BBOX;

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
      // bbox 는 반경의 외접 사각형이라 모서리가 반경보다 멀다 — 실제 거리로 한 번 더 좁힌다.
      const filtered = regionMode === 'gps' && coords
        ? items.filter((biz) => haversineM(coords.lat, coords.lng, biz.lat, biz.lng) <= NEARBY_RADIUS_KM * 1000)
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
  }, [bizCategory, reloadKey, i18n.language, regionMode, coords, userPos]);

  // 지역·카테고리를 URL 쿼리로 되쓴다(P2-11) — replace 만 사용해 히스토리 엔트리를 늘리지
  // 않는다. "지도보기" 진입(openMap)은 별도로 push 를 쓰고, 지도 쪽 뒤로가기(onExitMap)는
  // navigate(-1) 로 그 push 엔트리 하나만 소비하므로 여기서 replace 로 view 이외의 쿼리를
  // 갱신해도 그 back 동작(과거 navigate(-1) 회귀 이력 있음)에는 영향이 없다.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (bizCategory) next.set('cat', bizCategory); else next.delete('cat');
    // 지역 쿼리(rlat/rlng) 보존 폐기 — 표시 범위는 스토어가 들고 있어 URL 로 나를 필요가 없다.
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [bizCategory, searchParams, setSearchParams]);

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
          <button type="button" className={styles.locationBtn} onClick={() => setLocSheetOpen(true)}>
            <span className={styles.eyebrow}>{t('map.listFirst.myArea')}</span>
            <h1>
              {scopeLabel}
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

      {/* 표시범위 시트 — 앱 공용 2옵션 (대표 지시 2026-08-06 "2개로만해"). 종전 인라인
          3옵션 시트(마켓 스타일 재사용 + 지도 패널)를 DisplayScopeSheet 로 대체했다. */}
      <DisplayScopeSheet open={locSheetOpen} onClose={() => setLocSheetOpen(false)} />
    </div>
  );
}
