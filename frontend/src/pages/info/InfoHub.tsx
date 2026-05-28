import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { weatherApi, floodApi, gasApi, repairApi } from '@/api/info';
import type { WeatherData, FloodReport, GasStation, RepairShop } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import SaigonDistrictMap, { type MapMarker } from '@/components/maps/SaigonDistrictMap';
import { findNearestDistrict } from '@/components/maps/district-data';
import styles from './InfoHub.module.css';

function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords({ lat: 10.776, lng: 106.700 }),
    );
  }, []);
  return coords;
}

export default function InfoHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const coords = useGeolocation();

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [floods, setFloods] = useState<FloodReport[]>([]);
  const [gas, setGas] = useState<GasStation | null>(null);
  const [repair, setRepair] = useState<RepairShop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coords) return;
    const { lat, lng } = coords;
    Promise.allSettled([
      weatherApi.get(lat, lng).then(setWeather),
      floodApi.getActive(lat, lng, 5).then((r) => setFloods(r.floods)),
      gasApi.getNearby(lat, lng, 5).then((r) => setGas(r.stations[0] ?? null)),
      repairApi.getNearby(lat, lng, 5).then((r) => setRepair(r.shops[0] ?? null)),
    ]).finally(() => setLoading(false));
  }, [coords]);

  const activeFloods = floods.filter((f) => f.status === 'ACTIVE');

  const userDistrictCode = useMemo(
    () => (coords ? findNearestDistrict(coords.lat, coords.lng)?.code : undefined),
    [coords],
  );
  const dangerDistrictCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const f of activeFloods) {
      const w = findNearestDistrict(f.lat, f.lng);
      if (w) codes.add(w.code);
    }
    return Array.from(codes);
  }, [activeFloods]);
  const miniMapMarkers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (coords) out.push({ type: 'me', lat: coords.lat, lng: coords.lng });
    for (const f of activeFloods.slice(0, 3)) {
      out.push({ type: 'flood', lat: f.lat, lng: f.lng });
    }
    return out;
  }, [coords, activeFloods]);

  const depthLabel = (depth: string) =>
    t(`info.flood.depth${depth.charAt(0).toUpperCase()}${depth.slice(1)}`, depth);

  return (
    <div className={styles.page}>
      <TopBar title={t('info.hub.title')} />

      {activeFloods.length > 0 && (
        <div className={styles.alertBanner}>
          <span>🌊</span>
          <span>{t('info.hub.floodAlert', { count: activeFloods.length })}</span>
        </div>
      )}

      <div className={styles.scroll}>
        <div className={styles.locationRow}>
          <span className={styles.locationPin}>📍</span>
          <span className={styles.locationText}>{weather?.location?.district ?? 'District 1'}</span>
          <span className={styles.locationSub}>{t('info.hub.location')}</span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            {[0,1,2,3].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : (
          <>
            {/* Weather card */}
            <button className={styles.infoCard} onClick={() => navigate('/info/weather')}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>🌤</span>
                <span className={styles.cardTitle}>{t('info.weather.title')}</span>
              </div>
              {weather ? (
                <>
                  <div className={styles.cardBig}>
                    {weather.current.emoji} {weather.current.temp_c}°C — {weather.current.condition_desc}
                  </div>
                  {weather.current.rain_prob_1h >= 30 && (
                    <div className={styles.cardLine}>
                      <span className={styles.infoBlue}>
                        {t('info.hub.rainIn1h', { prob: weather.current.rain_prob_1h })}
                      </span>
                    </div>
                  )}
                  <div className={styles.cardFooter}>
                    <span className={styles.cardMeta}>{weather.recommendation}</span>
                  </div>
                </>
              ) : (
                <div className={styles.cardLine}>{t('info.hub.weatherLoading')}</div>
              )}
            </button>

            {/* Flood card */}
            <button
              className={`${styles.infoCard} ${activeFloods.length > 0 ? styles.dangerCard : ''}`}
              onClick={() => navigate('/info/flood')}
            >
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>🌊</span>
                <span className={`${styles.cardTitle} ${activeFloods.length > 0 ? styles.dangerText : ''}`}>
                  {t('info.flood.title')}{' '}
                  {activeFloods.length > 0
                    ? `— ${t('info.hub.floodActiveCount', { count: activeFloods.length })}`
                    : t('info.hub.floodNoIssue')}
                </span>
              </div>
              {activeFloods.length > 0 ? (
                <>
                  {activeFloods.slice(0, 2).map((f) => (
                    <div key={f.report_id} className={styles.cardLine}>
                      <span className={styles.dangerText}>🔴 {f.district_code}</span>
                      {' '}— {t('info.hub.floodDepthTime', {
                        depth: depthLabel(f.depth_level),
                        time: f.time_ago ?? t('info.flood.justNow'),
                      })}
                    </div>
                  ))}
                  <div className={styles.cardFooter}>
                    <span className={styles.cardMeta}>
                      {t('info.hub.floodConfirmed', { count: activeFloods[0].confidence_score })}
                    </span>
                    <span className={styles.dangerLink}>{t('info.hub.floodViewMap')}</span>
                  </div>
                </>
              ) : (
                <div className={styles.cardLine}>{t('info.hub.floodNone')}</div>
              )}
            </button>

            {/* Gas station card */}
            <button className={styles.infoCard} onClick={() => navigate('/info/gas')}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>⛽</span>
                <span className={styles.cardTitle}>{t('info.gas.title')}</span>
              </div>
              {gas ? (
                <>
                  <div className={styles.cardBig}>
                    💰 {gas.name} — <span className={styles.mono}>{gas.price_vnd?.toLocaleString()}₫/L</span>
                  </div>
                  <div className={styles.cardLine}>
                    {gas.wait_minutes === 0
                      ? t('info.gas.noWait')
                      : gas.wait_minutes
                      ? t('info.gas.waitMin', { min: gas.wait_minutes })
                      : t('info.gas.noWaitInfo')}
                    {' · '}<span className={styles.mono}>{gas.distance_km.toFixed(1)}km</span>
                  </div>
                  <div className={styles.cardFooter}>
                    <span className={styles.safeLink}>{t('info.hub.gasMoreLink')}</span>
                  </div>
                </>
              ) : (
                <div className={styles.cardLine}>{t('info.hub.gasLoading')}</div>
              )}
            </button>

            {/* Repair shop card */}
            <button className={styles.infoCard} onClick={() => navigate('/info/repair')}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>🔧</span>
                <span className={styles.cardTitle}>{t('info.repair.title')}</span>
              </div>
              {repair ? (
                <>
                  <div className={styles.cardBig}>
                    {repair.name} — ⭐ <span className={styles.mono}>{repair.avg_rating?.toFixed(1)}</span>
                    {' '}({repair.review_count})
                  </div>
                  <div className={styles.cardLine}>
                    {t('info.hub.repairOilAvg')} <span className={styles.mono}>{repair.avg_price?.toLocaleString()}₫</span>
                    {' · '}<span className={styles.mono}>{repair.distance_km.toFixed(1)}km</span>
                  </div>
                  <div className={styles.cardFooter}>
                    <span className={styles.infoLink}>{t('info.hub.repairMoreLink')}</span>
                  </div>
                </>
              ) : (
                <div className={styles.cardLine}>{t('info.hub.repairLoading')}</div>
              )}
            </button>

            <button
              type="button"
              className={styles.miniMapCard}
              onClick={() => navigate('/info/flood')}
            >
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>🗺</span>
                <span className={styles.cardTitle}>{t('info.hub.miniMapTitle')}</span>
              </div>
              <div className={styles.miniMapWrap}>
                <SaigonDistrictMap
                  height={140}
                  showLabels={false}
                  showLegend={false}
                  highlightedDistricts={userDistrictCode ? [userDistrictCode] : []}
                  dangerDistricts={dangerDistrictCodes}
                  markers={miniMapMarkers}
                  interactive={false}
                />
              </div>
            </button>

            <div className={styles.gpTip}>
              <span>💡</span>
              <span>{t('info.hub.gpTip')}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
