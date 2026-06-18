import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gasApi } from '@/api/info';
import type { GasStation, TodayPrices } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { resolveInfoCoordsSync, parseCoordsFromQuery } from '@/lib/infoCoords';
import type { ResolvedCoords } from '@/lib/infoCoords';
import { swrRead, swrWrite } from '@/lib/swrCache';
import { isWithinHcmc, distanceKm } from '@/components/maps/district-data';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import { regionContains, type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import ReportSheet, { type ReportFields } from '@/components/info/ReportSheet';
import GasStationSheet from '@/components/gas/GasStationSheet';
import styles from './InfoGasList.module.css';

const FETCH_RADIUS_KM = 30; // HCMC 전역 로드 → 선택 동(ward) 내부로 필터.

export default function InfoGasList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const incomingCoords = useMemo(() => parseCoordsFromQuery(search), [search]);

  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 표준유가(권역 참고가) — 전국 규제가라 주유소별이 아닌 상단 카드 1개로 노출.
  const [todayPrices, setTodayPrices] = useState<TodayPrices | null>(null);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  // 선택 동(지도 emit). 리스트는 이 동 경계 내부만 표시 → 지도 집계배지 수와 일치.
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  // inHcm: fetch origin 결정용(HCMC 안=GPS, 밖=구역 centroid).
  const [inHcm, setInHcm] = useState(false);
  // 실제 GPS 좌표(있으면 HCMC 밖이어도 거리=내 위치 기준). 없으면 null → 구역 centroid 폴백.
  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // 신규 주유소 제보 (현재 GPS 기준 → 대기큐 적재).
  const [showReport, setShowReport] = useState(false);

  // 선택 구역 centroid 반경 내 주유소(소속) + 거리순.
  // 소속은 주유소좌표↔구역centroid 로만 결정(거리 origin 무관). 거리/정렬은 GPS 있으면 내 위치 기준 재계산.
  const listStations = useMemo<GasStation[]>(() => {
    const filtered = selectedRegion
      ? stations.filter((s) => regionContains(selectedRegion, s.lat, s.lng))
      : stations;
    const ranked = userGps
      ? filtered.map((s) => ({ ...s, distance_km: distanceKm(userGps.lat, userGps.lng, s.lat, s.lng) }))
      : [...filtered];
    return ranked.sort((a, b) => a.distance_km - b.distance_km);
  }, [stations, selectedRegion, userGps]);

  // 지도 마커 = 선택 동 내부 주유소 (리스트와 동일 집합). depth1 집계배지 / depth2·3 개별핀.
  const gasMarkers = useMemo<MapMarkerV2[]>(
    () => listStations.map((s) => ({
      id: s.station_id,
      lat: s.lat,
      lng: s.lng,
      label: s.name ?? s.brand ?? '',
      onClick: () => setSelectedStation(s.station_id),
    })),
    [listStations],
  );


  const fetchStations = useCallback((origin: { lat: number; lng: number }) => {
    const { lat, lng } = origin;
    coordsRef.current = origin;
    const nearbyKey = `gas:nearby:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    const cached = swrRead<GasStation[]>(nearbyKey);
    if (cached) {
      setStations(cached);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
    }
    gasApi.getNearby(lat, lng, FETCH_RADIUS_KM)
      .then((r) => { if (!r) return; setStations(r.stations); swrWrite(nearbyKey, r.stations); setError(false); })
      .catch(() => { if (!cached) setError(true); })
      .finally(() => setLoading(false));
  }, []);

  // 거리 기준 origin 결정: HCMC 안(실 GPS) → GPS, 밖/메인 진입 → 넘어온 좌표. 선택 동은 지도가 emit.
  const resolveAndLoad = useCallback((coords: ResolvedCoords) => {
    const within = coords.source === 'gps' && !incomingCoords && isWithinHcmc(coords.lat, coords.lng);
    setInHcm(within);
    fetchStations({ lat: coords.lat, lng: coords.lng });
  }, [incomingCoords, fetchStations]);

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

  // 표준유가 로드 (전국 규제가, 마운트 1회).
  useEffect(() => {
    gasApi.getTodayPrices().then(setTodayPrices).catch(() => {});
  }, []);

  // PETROLIMEX 우선, 없으면 첫 브랜드 버킷에서 RON95-III / E5 / 디젤 추출.
  const refPrices = useMemo(() => {
    if (!todayPrices) return null;
    const brand = (todayPrices.PETROLIMEX ?? Object.entries(todayPrices)
      .find(([k, v]) => k !== 'updated_at' && k !== 'updated_at_iso' && v && typeof v === 'object')?.[1]) as
      | Record<string, { price: number; effective_time: string }>
      | undefined;
    if (!brand || typeof brand !== 'object') return null;
    const rows = [
      { key: 'RON95_III', label: 'RON 95-III' },
      { key: 'E5_RON92_II', label: 'E5 RON 92' },
      { key: 'DO_005S_II', label: 'Diesel 0.05S' },
    ].map((f) => ({ label: f.label, price: brand[f.key]?.price ?? null }))
      .filter((r) => r.price != null);
    return rows.length ? { rows, updatedAt: todayPrices.updated_at ?? null } : null;
  }, [todayPrices]);

  const handleRegionSelect = useCallback((region: SelectedRegion) => {
    setSelectedRegion(region);
    // HCMC 밖이면 거리 기준을 선택 동 centroid 로 재조회. 안이면 GPS 거리 유지(필터만).
    if (!inHcm) fetchStations({ lat: region.lat, lng: region.lng });
  }, [inHcm, fetchStations]);

  async function handleSubmitReport(fields: ReportFields): Promise<boolean> {
    try {
      const pos = await native.getLocation();
      await gasApi.reportStation({ name: fields.name, lat: pos.lat, lng: pos.lng, phone: fields.phone, note: fields.note });
      toast.success(t('info.gas.reportSuccess'));
      setShowReport(false);
      return true;
    } catch {
      toast.error(t('info.gas.reportError'));
      return false;
    }
  }

  const distLabel = userGps
    ? t('info.distFromGps')
    : t('info.distFromFallback', { area: selectedRegion?.name ?? '' });

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.gas.title')}
        onBack={() => navigate(-1)}
        rightContent={<InfoSwitcher current="gas" />}
      />

      {/* Distance basis */}
      <div className={styles.sortBar}>
        <span className={styles.sortText}>📍 {distLabel}</span>
      </div>

      <div className={styles.scroll}>
        <div className={styles.mapWrap}>
          <SaigonMapV2
            height="100%"
            markers={gasMarkers}
            onRegionSelect={handleRegionSelect}
            initialGps={incomingCoords ?? undefined}
            defaultWardSlug="ben-thanh"
            locateOnMount={!incomingCoords}
          />
        </div>
        {refPrices && (
          <div className={styles.priceCard}>
            <div className={styles.priceCardHead}>
              <span className={styles.priceCardTitle}>⛽ {t('info.gas.priceBar')}</span>
              {refPrices.updatedAt && (
                <span className={styles.priceCardUpdated}>{t('info.gas.priceBarUpdated', { time: refPrices.updatedAt })}</span>
              )}
            </div>
            <div className={styles.priceRows}>
              {refPrices.rows.map((r) => (
                <div key={r.label} className={styles.priceItem}>
                  <span className={styles.priceFuel}>{r.label}</span>
                  <span className={styles.priceVal}>{r.price!.toLocaleString()}₫</span>
                </div>
              ))}
            </div>
            <div className={styles.priceDisc}>{t('info.gas.disclaimer')}</div>
          </div>
        )}

        <div className={styles.sectionHeader}>
          <span>⛽ {t('info.gas.nearbyTitle')} · {listStations.length}</span>
        </div>
        {loading ? (
          <div className={styles.skeletonWrap}>
            {[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : error ? (
          <div className={styles.errorWrap}>
            <p>{t('info.gas.loadError', '정보를 불러오지 못했습니다')}</p>
            <button className={styles.retryBtn} onClick={() => fetchStations(coordsRef.current)}>
              {t('common.retry', '다시 시도')}
            </button>
          </div>
        ) : listStations.length === 0 ? (
          <div className={styles.errorWrap}>
            <p>{t('info.gas.emptyDistrict', '이 지역에 등록된 주유소가 없어요')}</p>
          </div>
        ) : (
          <div className={styles.card}>
            {listStations.map((s, idx) => {
              const isFirst = idx === 0;
              return (
                <div
                  key={s.station_id}
                  className={styles.gasCard}
                  onClick={() => setSelectedStation(s.station_id)}
                  role="button"
                  tabIndex={0}
                >
                  {/* Name + badge */}
                  <div className={styles.gasTopRow}>
                    <div className={styles.gasBadgeRow}>
                      {isFirst && (
                        <span className={`${styles.gasBadge} ${styles.gasBadgeRank1}`}>{t('info.gas.rank1')}</span>
                      )}
                      <span className={styles.gasName}>{s.name ?? `${s.brand} · ${s.street_name}`}</span>
                    </div>
                  </div>

                  {/* Phone */}
                  {s.phone && (
                    <div className={styles.priceRow}>
                      <span className={styles.fuelLabel}>☎ {t('info.gas.phoneLabel')}</span>
                      <span className={styles.mono}>{s.phone}</span>
                    </div>
                  )}

                  {/* Distance + actions */}
                  <div className={styles.distanceRow}>
                    <span className={styles.distanceText}>
                      🚶 <span className={styles.mono}>{s.distance_km.toFixed(1)}km</span>
                      {s.opening_hours ? ` · ${s.opening_hours}` : ''}
                    </span>
                    <div className={styles.actionBtns}>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnInfo}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ride-nav?name=${encodeURIComponent(s.name ?? s.brand ?? '')}&lat=${s.lat}&lng=${s.lng}&dist=${s.distance_km.toFixed(1)}`);
                        }}
                      >
                        {t('info.gas.routeBtn')}
                      </button>
                      <button className={styles.actionBtnNeutral} onClick={(e) => e.stopPropagation()}>{t('info.gas.callBtn')}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Report a missing station */}
        <button className={styles.reportCta} onClick={() => setShowReport(true)}>
          <span>➕</span>
          <span>{t('info.gas.reportStationCta')}</span>
        </button>

      </div>

      <ReportSheet
        open={showReport}
        title={t('info.gas.reportTitle')}
        desc={t('info.gas.reportDesc')}
        namePlaceholder={t('info.gas.reportNamePlaceholder')}
        phonePlaceholder={t('info.gas.reportPhonePlaceholder')}
        notePlaceholder={t('info.gas.reportNotePlaceholder')}
        submitLabel={t('info.gas.reportSubmit')}
        submittingLabel={t('info.gas.reportSubmitting')}
        onSubmit={handleSubmitReport}
        onClose={() => setShowReport(false)}
      />

      {selectedStation !== null && (
        <GasStationSheet
          stationId={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
