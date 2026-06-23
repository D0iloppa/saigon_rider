import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { repairApi } from '@/api/info';
import type { RepairShop } from '@/api/info';
import { StarIcon } from '@/components/ui/StarIcon';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { resolveInfoCoordsSync, parseCoordsFromQuery } from '@/lib/infoCoords';
import type { ResolvedCoords } from '@/lib/infoCoords';
import { swrRead, swrWrite } from '@/lib/swrCache';
import { distanceKm } from '@/components/maps/district-data';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import { type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import ReportSheet, { type ReportFields } from '@/components/info/ReportSheet';
import RepairShopSheet from '@/components/repair/RepairShopSheet';
import styles from './InfoRepairList.module.css';

const FETCH_RADIUS_KM = 3; // 홈 카드와 동일 반경 — 일관된 기준

export default function InfoRepairList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const incomingCoords = useMemo(() => parseCoordsFromQuery(search), [search]);

  const [shops, setShops] = useState<RepairShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 선택 동(지도 emit). 리스트는 이 동 경계 내부만 → 지도 집계배지 수와 일치.
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // 신규 정비소 제보 (현재 GPS 기준 → 대기큐 적재).
  const [showReport, setShowReport] = useState(false);

  // 반경 내 정비소 거리순 정렬 (GPS 있으면 내 위치 기준, 없으면 fetched origin 기준).
  const listShops = useMemo<RepairShop[]>(() => {
    const ranked = userGps
      ? shops.map((s) => ({ ...s, distance_km: distanceKm(userGps.lat, userGps.lng, s.lat, s.lng) }))
      : [...shops];
    return ranked.sort((a, b) => a.distance_km - b.distance_km);
  }, [shops, userGps]);

  // 지도 마커 = 선택 동 내부 정비소 (리스트와 동일 집합). depth1 집계배지 / depth2·3 개별핀.
  const repairMarkers = useMemo<MapMarkerV2[]>(
    () => listShops.map((s) => ({
      id: s.shop_id,
      lat: s.lat,
      lng: s.lng,
      label: s.name,
      onClick: () => setSelectedShop(s.shop_id),
    })),
    [listShops],
  );

  const fetchShops = useCallback((origin: { lat: number; lng: number }) => {
    const { lat, lng } = origin;
    coordsRef.current = origin;
    const cacheKey = `repair:nearby:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    const cached = swrRead<RepairShop[]>(cacheKey);
    if (cached) {
      setShops(cached);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
    }
    repairApi.getNearby(lat, lng, FETCH_RADIUS_KM)
      .then((r) => { if (!r) return; setShops(r.shops); swrWrite(cacheKey, r.shops); setError(false); })
      .catch(() => { if (!cached) setError(true); })
      .finally(() => setLoading(false));
  }, []);

  const resolveAndLoad = useCallback((coords: ResolvedCoords) => {
    fetchShops({ lat: coords.lat, lng: coords.lng });
  }, [fetchShops]);

  useEffect(() => {
    const instant = resolveInfoCoordsSync(search, (fresh) => resolveAndLoad(fresh));
    resolveAndLoad(instant);
  }, [search, resolveAndLoad]);

  // 거리 기준 = 실제 단말 GPS (URL/구역 좌표와 독립). 성공 시 내 위치 기준, 실패 시 null → 구역 centroid 폴백.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await native.ensureLocationPermission();
        const pos = await native.getLocation();
        if (alive) setUserGps({ lat: pos.lat, lng: pos.lng });
      } catch {
        if (alive) setUserGps(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleRegionSelect = useCallback((region: SelectedRegion) => {
    setSelectedRegion(region);
    fetchShops({ lat: region.lat, lng: region.lng });
  }, [fetchShops]);

  function getShopBadge(shop: RepairShop): { label: string; cls: string } | null {
    if (shop.avg_rating !== null && shop.avg_rating >= 4.5) {
      return { label: t('info.repair.rank1'), cls: styles.badgeTop };
    }
    if (shop.avg_rating !== null && shop.avg_rating < 3.5) {
      return { label: t('info.repair.warningBadge'), cls: styles.badgeWarn };
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
    } catch {
      toast.error(t('info.repair.reportError'));
      return false;
    }
  }

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.repair.title')}
        onBack={() => navigate(-1)}
        rightContent={<InfoSwitcher current="repair" />}
      />

      <div className={styles.distLabel}>
        📍 {userGps
          ? t('info.distFromGps')
          : t('info.distFromFallback', { area: selectedRegion?.name ?? '' })}
      </div>

      <div className={styles.scroll}>
        <div className={styles.mapWrap}>
          <SaigonMapV2
            height="100%"
            markers={repairMarkers}
            onRegionSelect={handleRegionSelect}
            initialGps={incomingCoords ?? undefined}
            defaultWardSlug="ben-thanh"
            locateOnMount={!incomingCoords}
          />
        </div>
        <div className={styles.sectionHeader}>
          <span>🔧 {t('info.repair.nearbyTitle')} · {listShops.length}</span>
        </div>
        {loading ? (
          <div className={styles.skeletonWrap}>
            {[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : error ? (
          <div className={styles.errorWrap}>
            <p>{t('info.repair.loadError', '정보를 불러오지 못했습니다')}</p>
            <button className={styles.retryBtn} onClick={() => fetchShops(coordsRef.current)}>
              {t('common.retry', '다시 시도')}
            </button>
          </div>
        ) : listShops.length === 0 ? (
          <div className={styles.errorWrap}>
            <p>{t('info.repair.emptyDistrict', '이 지역에 등록된 정비소가 없어요')}</p>
          </div>
        ) : (
          <div className={styles.card}>
            {listShops.map((shop) => {
              const badge = getShopBadge(shop);
              return (
                <div
                  key={shop.shop_id}
                  className={styles.repairCard}
                  onClick={() => setSelectedShop(shop.shop_id)}
                  role="button"
                  tabIndex={0}
                >
                  {/* Name + badge */}
                  <div className={styles.repairTopRow}>
                    {badge && <span className={`${styles.repairBadge} ${badge.cls}`}>{badge.label}</span>}
                    <span className={styles.repairName}>{shop.name}</span>
                  </div>

                  {/* Phone (주유소 priceRow 스타일) */}
                  {shop.phone && (
                    <div className={styles.priceRow}>
                      <span className={styles.fuelLabel}>☎ {t('info.repair.phoneLabel')}</span>
                      <span className={styles.mono}>{shop.phone}</span>
                    </div>
                  )}

                  {/* Rating (메트릭 행, 주유소 waitRow 자리) */}
                  <div className={styles.ratingRow}>
                    <div className={styles.ratingLeft}>
                      <span className={`${styles.mono} ${styles.ratingVal} ${shop.avg_rating !== null && shop.avg_rating < 3.5 ? styles.ratingDanger : ''}`}>
                        <StarIcon /> {shop.avg_rating?.toFixed(1) ?? '—'}
                      </span>
                      <span className={styles.reviewCount}>({shop.review_count} {t('info.repair.reviewCount')})</span>
                    </div>
                  </div>

                  {/* Keywords */}
                  {shop.keywords && shop.keywords.length > 0 && (
                    <div className={styles.chips}>
                      {shop.keywords.map((kw) => (
                        <span
                          key={kw.keyword}
                          className={`${styles.chip} ${kw.sentiment === 'positive' ? styles.chipPos : styles.chipNeg}`}
                        >
                          {kw.keyword}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Distance + actions (주유소와 동일: 경로/상세) */}
                  <div className={styles.distanceRow}>
                    <span className={styles.distanceText}>
                      🚶 <span className={styles.mono}>{shop.distance_km.toFixed(1)}km</span>
                    </span>
                    <div className={styles.actionBtns}>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnInfo}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ride-nav?name=${encodeURIComponent(shop.name)}&lat=${shop.lat}&lng=${shop.lng}&dist=${shop.distance_km.toFixed(1)}`);
                        }}
                      >
                        {t('info.repair.routeBtn')}
                      </button>
                      <button
                        className={styles.actionBtnNeutral}
                        onClick={(e) => { e.stopPropagation(); setSelectedShop(shop.shop_id); }}
                      >
                        {t('info.repair.detailBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Report a missing shop */}
        <button className={styles.reportCta} onClick={() => setShowReport(true)}>
          <span>➕</span>
          <span>{t('info.repair.reportShopCta')}</span>
        </button>

        {/* Review CTA */}
        <div className={styles.gpCta}>
          <span>💡</span>
          <span>{t('info.repair.reviewCta')}</span>
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
