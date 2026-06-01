import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gasApi, type TodayPrices } from '@/api/info';
import type { GasStation } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { resolveInfoCoordsSync, getDefaultLabel } from '@/lib/infoCoords';
import type { ResolvedCoords } from '@/lib/infoCoords';
import SaigonDistrictMap, { type MapMarker } from '@/components/maps/SaigonDistrictMap';
import GasStationSheet from '@/components/gas/GasStationSheet';
import { deriveBrandCode } from '@/components/gas/gas-tokens';
import type { GasMarkerData } from '@/components/maps/SaigonDistrictMap';
import styles from './InfoGasList.module.css';

const SWR_TTL_MS = 5 * 60 * 1000;

function swrRead<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - ts > SWR_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function swrWrite<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* quota — ignore */
  }
}

function pickReferenceRon95(prices: TodayPrices | null): number | null {
  if (!prices) return null;
  const brands = ['PETROLIMEX', 'MARKET_AVG', 'PVOIL'] as const;
  for (const b of brands) {
    const bucket = prices[b];
    if (bucket && typeof bucket === 'object' && 'RON95_III' in bucket) {
      const cell = (bucket as Record<string, { price: number }>).RON95_III;
      if (cell?.price) return cell.price;
    }
  }
  return null;
}

function getWaitDotCount(waitMinutes: number | null): number {
  if (waitMinutes === null) return 0;
  return Math.min(5, Math.ceil(waitMinutes / 3));
}

function getDotLevel(filledCount: number): string {
  if (filledCount <= 1) return styles.dotLevel1;
  if (filledCount === 2) return styles.dotLevel2;
  if (filledCount === 3) return styles.dotLevel3;
  if (filledCount === 4) return styles.dotLevel4;
  return styles.dotLevel5;
}

function WaitDots({ waitMinutes }: { waitMinutes: number | null }) {
  const filled = getWaitDotCount(waitMinutes);
  const levelCls = getDotLevel(filled);
  return (
    <div className={styles.waitDots}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`${styles.dot} ${i < filled ? `${styles.dotFilled} ${levelCls}` : ''}`}
        />
      ))}
    </div>
  );
}

export default function InfoGasList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();

  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('map');
  const [todayPrices, setTodayPrices] = useState<TodayPrices | null>(null);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<'nearest' | 'cheapest'>('nearest');
  const [coordsSource, setCoordsSource] = useState<ResolvedCoords['source']>('default');
  const coordsRef = useRef<ResolvedCoords>({ lat: 0, lng: 0, source: 'default' });

  const displayStations = useMemo<GasStation[]>(() => {
    if (sortMode === 'cheapest') {
      return [...stations].sort((a, b) => {
        if (a.price_vnd === null) return 1;
        if (b.price_vnd === null) return -1;
        return a.price_vnd - b.price_vnd;
      });
    }
    return stations;
  }, [stations, sortMode]);

  const gasMarkers = useMemo<MapMarker[]>(
    () =>
      displayStations.map((s) => {
        const data: GasMarkerData = {
          brand_code: deriveBrandCode(s.brand),
          ref_price: s.price_vnd,
          is_24h: false,
          show_price: false,
        };
        return {
          type: 'gas',
          lat: s.lat,
          lng: s.lng,
          label: s.name ?? s.brand ?? '',
          onClick: () => setSelectedStation(s.station_id),
          data,
        };
      }),
    [displayStations],
  );

  const fetchStations = useCallback((coords: ResolvedCoords) => {
    const { lat, lng } = coords;
    coordsRef.current = coords;
    setCoordsSource(coords.source);
    const nearbyKey = `gas:nearby:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    const cachedNearby = swrRead<GasStation[]>(nearbyKey);
    if (cachedNearby) {
      setStations(cachedNearby);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
    }
    gasApi.getNearby(lat, lng, 5)
      .then((r) => { if (!r) return; setStations(r.stations); swrWrite(nearbyKey, r.stations); setError(false); })
      .catch(() => { if (!cachedNearby) setError(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const cachedPrices = swrRead<TodayPrices>('gas:today-prices');
    if (cachedPrices) setTodayPrices(cachedPrices);
    gasApi.getTodayPrices()
      .then((p) => { setTodayPrices(p); swrWrite('gas:today-prices', p); })
      .catch(() => { if (!cachedPrices) setTodayPrices(null); });

    const instant = resolveInfoCoordsSync(search, (fresh) => fetchStations(fresh));
    fetchStations(instant);
  }, [search, fetchStations]);

  const referencePrice = pickReferenceRon95(todayPrices);
  const updatedAt = todayPrices?.updated_at ?? null;

  const minPrice = stations.reduce<number | null>((min, s) => {
    if (s.price_vnd === null) return min;
    if (min === null || s.price_vnd < min) return s.price_vnd;
    return min;
  }, null);

  const filterBtn = (
    <div className={styles.iconBtn}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M3 12h18M3 18h18"/>
      </svg>
    </div>
  );

  function handleWaitReport() {
    alert(`+5 XP! ${t('info.gas.comingSoon')}`);
  }

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.gas.title')}
        onBack={() => navigate(-1)}
        rightContent={filterBtn}
      />

      {/* Official price banner — "오늘의 참고가" + 갱신 시각 */}
      <div className={styles.officialBar}>
        <span className={styles.officialLabel}>
          📊 {t('info.gas.priceBar')}
          {updatedAt && (
            <span className={styles.officialUpdated}> · {t('info.gas.priceBarUpdated', { time: updatedAt })}</span>
          )}
        </span>
        <span className={`${styles.mono} ${styles.officialPrice}`}>
          {referencePrice != null ? `${referencePrice.toLocaleString()} ₫/L` : '—'}
        </span>
      </div>

      {/* Sort bar */}
      <div className={styles.sortBar}>
        <span className={styles.sortText}>📍 {coordsSource === 'gps'
          ? t('info.distFromGps')
          : t('info.distFromFallback', { area: getDefaultLabel() })} ·</span>
        <button
          type="button"
          className={`${styles.sortChip} ${sortMode === 'nearest' ? styles.sortChipActive : ''}`}
          onClick={() => setSortMode('nearest')}
        >
          {t('info.gas.sortNearest')}
        </button>
        <button
          type="button"
          className={`${styles.sortChip} ${sortMode === 'cheapest' ? styles.sortChipActive : ''}`}
          onClick={() => setSortMode('cheapest')}
        >
          {t('info.gas.sortCheapest', '저렴한 순')}
        </button>
      </div>

      <div className={styles.viewToggle}>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${view === 'map' ? styles.viewToggleActive : ''}`}
          onClick={() => setView('map')}
        >
          {t('info.gas.viewMap')}
        </button>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${view === 'list' ? styles.viewToggleActive : ''}`}
          onClick={() => setView('list')}
        >
          {t('info.gas.viewList')}
        </button>
      </div>

      <div className={styles.scroll}>
        {view === 'map' && (
          <div className={styles.mapWrap}>
            <SaigonDistrictMap height={360} markers={gasMarkers} showLegend />
          </div>
        )}
        {view === 'list' && loading ? (
          <div className={styles.skeletonWrap}>
            {[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : view === 'list' && error ? (
          <div className={styles.errorWrap}>
            <p>{t('info.gas.loadError', '정보를 불러오지 못했습니다')}</p>
            <button className={styles.retryBtn} onClick={() => fetchStations(coordsRef.current)}>
              {t('common.retry', '다시 시도')}
            </button>
          </div>
        ) : view === 'list' ? (
          <div className={styles.card}>
            {displayStations.map((s, idx) => {
              const isCheapest = s.price_vnd !== null && s.price_vnd === minPrice;
              const isFirst = idx === 0;
              return (
                <div
                  key={s.station_id}
                  className={`${styles.gasCard} ${isCheapest ? styles.gasCardCheap : ''}`}
                  onClick={() => setSelectedStation(s.station_id)}
                  role="button"
                  tabIndex={0}
                >
                  {/* Name + badge */}
                  <div className={styles.gasTopRow}>
                    <div className={styles.gasBadgeRow}>
                      {isFirst && !isCheapest && (
                        <span className={`${styles.gasBadge} ${styles.gasBadgeRank1}`}>{t('info.gas.rank1')}</span>
                      )}
                      {isCheapest && (
                        <span className={`${styles.gasBadge} ${styles.gasBadgeCheap}`}>{t('info.gas.cheapBadge')}</span>
                      )}
                      <span className={styles.gasName}>{s.name ?? `${s.brand} · ${s.street_name}`}</span>
                    </div>
                  </div>

                  {/* Price */}
                  <div className={styles.priceRow}>
                    <span className={styles.fuelLabel}>💧 RON 95</span>
                    <span className={`${styles.mono} ${styles.price} ${isCheapest ? styles.priceCheap : ''}`}>
                      {s.price_vnd !== null ? `${s.price_vnd.toLocaleString()} ₫/L` : t('info.gas.noPriceInfo')}
                    </span>
                  </div>

                  {/* Wait */}
                  {s.wait_minutes !== null ? (
                    <div className={styles.waitRow}>
                      <div className={styles.waitLeft}>
                        <span className={styles.waitLabel}>
                          ⏱ {s.wait_minutes === 0
                            ? t('info.gas.noWait')
                            : t('info.gas.waitMin', { min: s.wait_minutes })}
                        </span>
                        <WaitDots waitMinutes={s.wait_minutes} />
                      </div>
                      {s.wait_confidence !== null && (
                        <span className={styles.waitMeta}>
                          {t('info.gas.waitConfidence', { count: s.wait_confidence })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={styles.waitRow}>
                      <span className={styles.waitLabelDim}>⏱ {t('info.gas.noWaitInfo')}</span>
                    </div>
                  )}

                  {/* Distance + actions */}
                  <div className={styles.distanceRow}>
                    <span className={styles.distanceText}>
                      🚶 <span className={styles.mono}>{s.distance_km.toFixed(1)}km</span>
                      {s.opening_hours ? ` · ${s.opening_hours}` : ''}
                    </span>
                    <div className={styles.actionBtns}>
                      <button className={`${styles.actionBtn} ${isCheapest ? styles.actionBtnCheap : styles.actionBtnInfo}`}>
                        {t('info.gas.routeBtn')}
                      </button>
                      <button className={styles.actionBtnNeutral}>{t('info.gas.callBtn')}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Wait report CTA */}
        <button className={styles.reportCta} onClick={handleWaitReport}>
          <span>⛽</span>
          <span>{t('info.gas.reportWait')}</span>
        </button>
      </div>

      {selectedStation !== null && (
        <GasStationSheet
          stationId={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
