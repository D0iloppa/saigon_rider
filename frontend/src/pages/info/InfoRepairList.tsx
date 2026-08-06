import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, BadgeCheck, ChevronUp, Gift, Map as MapIcon, Navigation, Plus, Wrench, ZoomIn } from 'lucide-react';
import { repairApi } from '@/api/info';
import type { RepairShop } from '@/api/info';
import { StarIcon } from '@/components/ui/StarIcon';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { swrRead, swrWrite } from '@/lib/swrCache';
import type { MapMarkerV2 } from '@/components/maps/v2/region';
import { L3_ENABLED, type DistrictBadge } from '@/components/maps/SaigonMapV5';
import { fetchPoiMapItems, type PoiMapItem } from '@/api/poi';
import { buildPoiLayer } from '@/components/maps/poiLayer';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import LocationContextBar from '@/components/info/LocationContextBar';
import { clusterByViewport } from '@/lib/clusterPoints';
import { useServiceLocation } from '@/hooks/useServiceLocation';
import StateBlock from '@/components/ui/StateBlock';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import ReportSheet, { type ReportFields } from '@/components/info/ReportSheet';
import RepairShopSheet from '@/components/repair/RepairShopSheet';
import sys from '@/styles/system.module.css';
import styles from './InfoRepairList.module.css';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));

export default function InfoRepairList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapOpen = searchParams.get('view') === 'map';
  // 단일 SoT — 표시 범위/조회 기준 좌표는 useLocationStore(앱 전역, 2026-08-06 통일).
  const { origin, fetchRadiusKm } = useServiceLocation();

  const [shops, setShops] = useState<RepairShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // 신규 정비소 제보 (현재 GPS 기준 → 대기큐 적재).
  const [showReport, setShowReport] = useState(false);
  // 줌 힌트 — L3(건물/골목) 미도달 상태에서 노출. 탭하면 현재 지도 중앙을 L3 로 확대한다.
  const [showZoomHint, setShowZoomHint] = useState(true);
  const zoomInRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  // 클러스터 격자 기준이자 줌힌트의 확대 중심 — 렌더에 반영돼야 하므로 state 다.
  const [viewport, setViewport] = useState<{ N: number; S: number; E: number; W: number } | null>(null);

  // 반경 내 정비소 거리순 정렬. 'gps' 표시범위면 radiusKm 로 자르고, '전체'면 자르지 않는다.
  // 종전엔 선택 동 폴리곤(regionContains)으로 걸러 구 경계에 걸친 곳이 빠졌다(2026-08-06 폐기).
  const listShops = useMemo<RepairShop[]>(() => {
    const inRange = shops.filter((s) => s.distance_km <= fetchRadiusKm);
    return [...inRange].sort((a, b) => a.distance_km - b.distance_km);
  }, [shops, fetchRadiusKm]);

  // POI 상시 참조 레이어(랜드마크·공공시설) — fetchRadiusKm 반경 bbox 로 조회 (정비소 목록과 동일 기준).
  const [poiItems, setPoiItems] = useState<PoiMapItem[]>([]);
  useEffect(() => {
    const latDelta = fetchRadiusKm / 111;
    const lngDelta = fetchRadiusKm / (111 * Math.cos(origin.lat * Math.PI / 180));
    const controller = new AbortController();
    fetchPoiMapItems({
      minLat: origin.lat - latDelta, maxLat: origin.lat + latDelta,
      minLng: origin.lng - lngDelta, maxLng: origin.lng + lngDelta,
      signal: controller.signal,
    })
      .then(setPoiItems)
      .catch(() => undefined);
    return () => controller.abort();
  }, [origin]);

  // 지도 마커 = 선택 동 내부 정비소 (리스트와 동일 집합). depth1 집계배지 / depth2·3 개별핀.
  // POI 는 배열 앞쪽(z-order 아래)에 깐다.
  const repairMarkers = useMemo<MapMarkerV2[]>(
    () => [
      ...buildPoiLayer(poiItems, i18n.language),
      ...listShops.map((s) => ({
        id: s.shop_id,
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        onClick: () => setSelectedShop(s.shop_id),
      })),
    ],
    [listShops, poiItems, i18n.language],
  );

  // 도시 전경(줌아웃)에서 개별 핀이 숨는 구간용 구별 집계 배지.
  // 줌아웃 시 묶어 보여줄 클러스터 — 구(district) 단위 집계에서 **뷰포트 격자 클러스터**로
  // 교체했다(대표 지적 2026-08-06: 배지 위치가 실제 지점과 어긋나고 합계도 안 맞았다).
  // 위치는 구성원 무게중심이고, 대상은 목록과 같은 집합이라 합계가 일치한다.
  const clusters = useMemo<DistrictBadge[]>(
    () => clusterByViewport(listShops, viewport),
    [listShops, viewport],
  );

  const fetchShops = useCallback((origin: { lat: number; lng: number }) => {
    const { lat, lng } = origin;
    coordsRef.current = origin;
    // 반경을 키에 포함해야 한다 — 없으면 '전체 지역'(12km)이 '내 현재 위치'(3km)
    // 캐시를 읽어 두 모드 결과가 같아진다(대표 지적 2026-08-06).
    const cacheKey = `repair:nearby:${lat.toFixed(3)}:${lng.toFixed(3)}:r${fetchRadiusKm}`;
    const cached = swrRead<RepairShop[]>(cacheKey);
    if (cached) {
      setShops(cached);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
    }
    repairApi.getNearby(lat, lng, fetchRadiusKm)
      .then((r) => { if (!r) return; setShops(r.shops); swrWrite(cacheKey, r.shops); setError(false); })
      .catch(() => { if (!cached) setError(true); })
      .finally(() => setLoading(false));
  }, [fetchRadiusKm]);

  // 조회 기준 좌표(전체=도시 중심, 선택지역=동 centroid)가 바뀌면 재조회.
  useEffect(() => {
    fetchShops(origin);
  }, [origin, fetchShops]);

  // 평점 배지: 리뷰가 실제로 있는 곳만 판정 (0리뷰 = 판정 유보).
  function getShopBadge(shop: RepairShop): { label: string; cls: string } | null {
    if (shop.review_count <= 0 || shop.avg_rating === null) return null;
    if (shop.avg_rating >= 4.5) {
      return { label: t('info.repair.topRated'), cls: sys.badgeGold };
    }
    if (shop.avg_rating < 3.5) {
      return { label: t('info.repair.warningBadge'), cls: sys.badgeDanger };
    }
    return null;
  }

  async function handleSubmitReport(fields: ReportFields): Promise<boolean> {
    try {
      const pos = await native.getLocation();
      await repairApi.reportShop({ name: fields.name, lat: pos.lat, lng: pos.lng, phone: fields.phone, note: fields.note });
      toast.success(t('info.repair.reportSuccess'));
      setShowReport(false);
      return true;
    } catch (err) {
      toast.error(extractDetail(err, t('info.repair.reportError')));
      return false;
    }
  }

  const toggleMap = () => {
    // 예전엔 mapOpen 일 때 navigate(-1)(히스토리 뒤로가기)로 목록에 복귀했다 — "리스트로
    // 진입 → [지도] 누르면 push" 를 전제한 구현이다. 홈 4지표 카드가 `&view=map` 을 붙여
    // 지도 상태로 직접 진입하게 되면서 이 화면 안에 되돌아갈 목록 항목이 없어 [목록] 버튼이
    // 홈으로 튀는 버그가 됐다. 뒤로가기 대신 쿼리를 직접 지운다 — 목록에서 [지도]로 들어온
    // 경우의 "Back 은 지도→목록 먼저 복귀"(view=map 이 push 로 쌓임)는 그대로 유지된다.
    const next = new URLSearchParams(searchParams);
    if (mapOpen) next.delete('view');
    else next.set('view', 'map');
    setSearchParams(next);
  };

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(() => fetchShops(coordsRef.current), [fetchShops]),
  );

  return (
    <div className={sys.page}>
      <TopBar
        title={t('info.repair.title')}
        onBack={() => navigate(-1)}
        rightContent={<InfoSwitcher current="repair" />}
      />

      {/* 컨텍스트바: 전체↔선택지역 피커 + 지도 토글 (공통 컴포넌트) */}
      <LocationContextBar
        trailing={
          <button type="button" className={`${sys.chipBtn} ${mapOpen ? sys.chipBtnActive : ''}`} onClick={toggleMap}>
            {/* 지도/목록 배타 전환이 아니라 지도 펼침·접힘이다 — 아이콘도 그에 맞춘다. */}
            {mapOpen ? <ChevronUp size={15} /> : <MapIcon size={15} />}
            {mapOpen ? t('info.mapChipClose') : t('info.mapChipOpen')}
          </button>
        }
      />

      <div className={sys.scroll} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {mapOpen && (
          <div className={sys.mapBlock}>
            <Suspense fallback={<div className={sys.mapLoading}>{t('info.mapLoading')}</div>}>
              <SaigonMapV5
                height="100%"
                markers={repairMarkers}
                districtBadges={clusters}
                // 클러스터 탭 = 그 지점으로 L3 확대 (개별 dot 이 보이는 깊이까지).
                onBadgeClick={(b) => zoomInRef.current?.({ lat: b.lat, lng: b.lng })}
                // L3 상세지도 부활 게이트: NeighborhoodMapCanvas 와 동일하게 SaigonMapV5.tsx 상단
                // L3_ENABLED(현재 true) 를 미러링 — depth3 건물/도로 로드.
                lightweight={!L3_ENABLED}
                markerDepth="l2"
                // 선택 지역 유무와 무관하게 origin(선택 동 centroid 또는 도시 기본 중심)으로 즉시
                // L3 줌인 — region 미선택 시 기존 D1 전체조망 폴백이면 L3 임계값(vb.w<L3_VBW)에
                // 못 미쳐 진입 직후 상세지도·POI 가 안 보였다(대표 지시 미달 지점).
                initialGps={origin}
                // 우측 하단 '내 위치'(◎) 버튼 — 마켓·동네지도와 동일하게 노출 (2026-08-06).
                showLocateControl
                // 진입 즉시 내 위치 파란 점을 찍는다 — 종전엔 ◎ 를 눌러야만 나타났다
                // (대표 지적 2026-08-06). 카메라는 건드리지 않는 dot 전용 측위다.
                meDotOnMount
                // ward 자동선택 부작용 방지 (동네지도와 동일)
                selectRegionOnLocate={false}
                // 뷰포트 모드 — 지역선택 폴리곤 강조 끔. selectRegionOnLocate 만으로는
                // focusLatLng 의 else-if 분기가 setSelWard 를 호출해 오렌지 테두리가 남는다.
                polyActive={false}
                zoomInRef={zoomInRef}
                onBboxChange={setViewport}
                // 힌트는 L3 미도달일 때 — 데이터 게이트(markerDepth='l2')와 분리된 신호다.
                onDepthChange={(_gate, belowL3) => setShowZoomHint(belowL3)}
              />
              {showZoomHint && (
                <button
                  type="button"
                  className={sys.mapZoomHint}
                  onClick={() => {
                    // 내 위치가 아니라 **현재 지도 중앙** 기준으로 확대한다.
                    if (viewport) {
                      zoomInRef.current?.({ lat: (viewport.N + viewport.S) / 2, lng: (viewport.E + viewport.W) / 2 });
                    }
                  }}
                >
                  <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" /> {t('map.zoomGateShort', { defaultValue: '확대해서 주변 보기' })}
                </button>
              )}
            </Suspense>
          </div>
        )}

        <div className={sys.sectionHead}>
          <span className={sys.sectionLabel}>{t('info.repair.nearbyTitle')}</span>
          <span className={`${sys.sectionAside} num`}>{listShops.length}</span>
        </div>

        {loading ? (
          <div className={sys.card}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={sys.skelRow}>
                <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className={sys.card}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('info.repair.loadError', '정보를 불러오지 못했습니다')}
              actionLabel={t('common.retry', '다시 시도')}
              onAction={() => fetchShops(coordsRef.current)}
            />
          </div>
        ) : listShops.length === 0 ? (
          <div className={sys.card}>
            <StateBlock icon={Wrench} title={t('info.repair.emptyDistrict', '이 지역에 등록된 정비소가 없어요')} />
          </div>
        ) : (
          <div className={sys.card}>
            {listShops.map((shop) => {
              const badge = getShopBadge(shop);
              return (
                <div
                  key={shop.shop_id}
                  className={sys.row}
                  onClick={() => setSelectedShop(shop.shop_id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={sys.rowTop}>
                    <span className={sys.rowTitle}>
                      {shop.name}
                      {shop.is_verified && <BadgeCheck size={14} className={sys.rowTitleIcon} />}
                    </span>
                    <span className={`${sys.rowDist} num`}>{shop.distance_km.toFixed(1)}km</span>
                  </div>

                  <div className={sys.rowMeta}>
                    {shop.review_count > 0 && shop.avg_rating !== null ? (
                      <span className={styles.rating}>
                        <StarIcon size={12} />
                        <b className="num">{shop.avg_rating.toFixed(1)}</b>
                        <span className={styles.ratingCount}>
                          · {t('info.repair.reviewCount')} <span className="num">{shop.review_count}</span>
                        </span>
                      </span>
                    ) : (
                      <span>{t('info.repair.noRating')}</span>
                    )}
                    {badge && <span className={`${sys.miniBadge} ${badge.cls}`}>{badge.label}</span>}
                  </div>

                  {shop.keywords && shop.keywords.length > 0 && (
                    <div className={styles.chips}>
                      {shop.keywords.slice(0, 3).map((kw) => (
                        <span
                          key={kw.keyword}
                          className={`${styles.chip} ${kw.sentiment === 'positive' ? styles.chipPos : styles.chipNeg}`}
                        >
                          {kw.keyword}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={sys.rowFoot}>
                    <button
                      className={`${sys.actionChip} ${sys.actionPrimary}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/ride-nav?name=${encodeURIComponent(shop.name)}&lat=${shop.lat}&lng=${shop.lng}&dist=${shop.distance_km.toFixed(1)}`);
                      }}
                    >
                      <Navigation size={13} strokeWidth={2.2} />
                      {t('info.repair.routeBtn')}
                    </button>
                    <button
                      className={`${sys.actionChip} ${sys.actionNeutral}`}
                      onClick={(e) => { e.stopPropagation(); setSelectedShop(shop.shop_id); }}
                    >
                      {t('info.repair.detailBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 누락 정비소 제보 (조용한 보조 CTA) */}
        <button className={sys.quietCta} onClick={() => setShowReport(true)}>
          <span className={sys.quietCtaIcon}><Plus size={15} strokeWidth={2.2} /></span>
          <span>{t('info.repair.reportShopCta')}</span>
        </button>

        {/* 리뷰 리워드 힌트 */}
        <div className={`${sys.quietCta} ${styles.rewardHint}`}>
          <span className={`${sys.quietCtaIcon} ${sys.quietCtaIconGold}`}><Gift size={15} strokeWidth={2.2} /></span>
          <span>{t('info.repair.reviewCta')}</span>
        </div>
        </div>
      </div>

      <ReportSheet
        open={showReport}
        title={t('info.repair.reportTitle')}
        desc={t('info.repair.reportDesc')}
        namePlaceholder={t('info.repair.reportNamePlaceholder')}
        phonePlaceholder={t('info.repair.reportPhonePlaceholder')}
        notePlaceholder={t('info.repair.reportNotePlaceholder')}
        submitLabel={t('info.repair.reportSubmit')}
        submittingLabel={t('info.repair.reportSubmitting')}
        onSubmit={handleSubmitReport}
        onClose={() => setShowReport(false)}
      />

      {selectedShop !== null && (
        <RepairShopSheet
          shopId={selectedShop}
          onClose={() => setSelectedShop(null)}
        />
      )}
    </div>
  );
}
