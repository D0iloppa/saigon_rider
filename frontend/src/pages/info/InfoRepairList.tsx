import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { repairApi } from '@/api/info';
import type { RepairShop } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { resolveInfoCoordsSync, parseCoordsFromQuery } from '@/lib/infoCoords';
import type { ResolvedCoords } from '@/lib/infoCoords';
import { swrRead, swrWrite } from '@/lib/swrCache';
import { findNearestDistrict, districtLabelByCode, getDistrictByCode, isWithinHcmc } from '@/components/maps/district-data';
import InfoMap from '@/components/maps/InfoMap';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import ReportSheet, { type ReportFields } from '@/components/info/ReportSheet';
import RepairShopSheet from '@/components/repair/RepairShopSheet';
import type { MapMarker } from '@/components/maps/SaigonDistrictMap';
import styles from './InfoRepairList.module.css';

const FETCH_RADIUS_KM = 30; // HCMC 전역 로드 → 구역별 클러스터/필터.
const DEFAULT_DISTRICT = 'BEN_THANH';

export default function InfoRepairList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const incomingCode = useMemo(() => {
    const c = parseCoordsFromQuery(search);
    return c ? findNearestDistrict(c.lat, c.lng)?.code ?? null : null;
  }, [search]);

  const [shops, setShops] = useState<RepairShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 선택 구역(지도 탭/초기 위치). 리스트는 이 구역 소속만 → 지도 뱃지 수와 일치.
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(incomingCode);
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  // GPS 가 HCMC 안이면 거리=내 위치 기준, 밖이면 선택 구역 centroid 기준.
  const [inHcm, setInHcm] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // 신규 정비소 제보 (현재 GPS 기준 → 대기큐 적재).
  const [showReport, setShowReport] = useState(false);

  const repairMarkers = useMemo<MapMarker[]>(
    () =>
      shops.map((s) => ({
        type: 'repair',
        lat: s.lat,
        lng: s.lng,
        label: s.name,
        onClick: () => setSelectedShop(s.shop_id),
      })),
    [shops],
  );

  // 선택 구역 소속 정비소만 (지도 클러스터와 동일한 findNearestDistrict 기준) + 거리순.
  const listShops = useMemo<RepairShop[]>(() => {
    const filtered = selectedDistrict
      ? shops.filter((s) => findNearestDistrict(s.lat, s.lng)?.code === selectedDistrict)
      : shops;
    return [...filtered].sort((a, b) => a.distance_km - b.distance_km);
  }, [shops, selectedDistrict]);

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

  // 거리 기준 origin 결정: HCMC 안 → GPS, 밖 → 선택(or 기본) 구역 centroid.
  const resolveAndLoad = useCallback((coords: ResolvedCoords) => {
    // 메인에서 넘어온 좌표(incomingCode)는 구역 centroid 이므로 GPS 로 오판 금지 → 구역 기준.
    const within = coords.source === 'gps' && !incomingCode && isWithinHcmc(coords.lat, coords.lng);
    setInHcm(within);
    const district = incomingCode ?? findNearestDistrict(coords.lat, coords.lng)?.code ?? DEFAULT_DISTRICT;
    setSelectedDistrict(district);
    if (within) {
      fetchShops({ lat: coords.lat, lng: coords.lng });
    } else {
      const c = getDistrictByCode(district);
      fetchShops(c ? { lat: c.gps.lat, lng: c.gps.lng } : { lat: coords.lat, lng: coords.lng });
    }
  }, [incomingCode, fetchShops]);

  useEffect(() => {
    const instant = resolveInfoCoordsSync(search, (fresh) => resolveAndLoad(fresh));
    resolveAndLoad(instant);
  }, [search, resolveAndLoad]);

  const handleDistrictClick = useCallback((code: string, gps: { lat: number; lng: number }) => {
    setSelectedDistrict(code);
    // HCMC 밖이면 거리 기준을 새 구역 centroid 로 재조회. 안이면 GPS 거리 유지(필터만).
    if (!inHcm) fetchShops(gps);
  }, [inHcm, fetchShops]);

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
        📍 {inHcm
          ? t('info.distFromGps')
          : t('info.distFromFallback', { area: selectedDistrict ? districtLabelByCode(selectedDistrict) : '' })}
      </div>

      <div className={styles.scroll}>
        <div className={styles.mapWrap}>
          <InfoMap
            variant="fullscreen"
            markers={repairMarkers}
            focusDistrictCode={selectedDistrict}
            onDistrictClick={(d) => handleDistrictClick(d.code, d.gps)}
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
                        ⭐ {shop.avg_rating?.toFixed(1) ?? '-'}
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
