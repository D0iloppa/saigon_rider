import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  Fuel,
  Gift,
  Map as MapIcon,
  MapPin,
  Sun,
  Waves,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { weatherApi, floodApi, gasApi, repairApi } from '@/api/info';
import type { WeatherData, FloodReport, GasStation, RepairShop } from '@/api/info';
import { formatCurrencyVnd } from '@/lib/format';
import { useServiceLocation } from '@/hooks/useServiceLocation';
import { TopBar } from '@/components/layout/TopBar';
import InfoMap from '@/components/maps/InfoMap';
import type { MapMarker } from '@/components/maps/SaigonDistrictMap';
import { districtLabelByCode, findNearestDistrict } from '@/components/maps/district-data';
import { getDepth } from '@/components/flood/flood-tokens';
import { StarIcon } from '@/components/ui/StarIcon';
import sys from '@/styles/system.module.css';
import styles from './InfoHub.module.css';

/** OpenWeather condition → 아이콘/번역/색 — InfoWeather 의 매핑과 동일(영어 원문 노출 방지). */
const CONDITION_META: Record<string, { Icon: LucideIcon; labelKey: string; color: string }> = {
  Clear: { Icon: Sun, labelKey: 'cond_Clear', color: '#F59E0B' },
  Clouds: { Icon: Cloud, labelKey: 'cond_Clouds', color: '#8A8E9E' },
  Rain: { Icon: CloudRain, labelKey: 'cond_Rain', color: '#3B82F6' },
  Drizzle: { Icon: CloudDrizzle, labelKey: 'cond_Drizzle', color: '#60A5FA' },
  Thunderstorm: { Icon: CloudLightning, labelKey: 'cond_Thunderstorm', color: '#8B5CF6' },
  Mist: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
  Fog: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
  Haze: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
  Smoke: { Icon: CloudFog, labelKey: 'cond_Mist', color: '#8A8E9E' },
};

export default function InfoHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 단일 SoT — 표시 범위/기준 좌표는 useLocationStore(앱 전역, 2026-08-06 통일).
  const { origin: coords } = useServiceLocation();

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [floods, setFloods] = useState<FloodReport[]>([]);
  const [floodUnavailable, setFloodUnavailable] = useState(false);
  const [gas, setGas] = useState<GasStation | null>(null);
  const [repair, setRepair] = useState<RepairShop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coords) return;
    const { lat, lng } = coords;
    Promise.allSettled([
      weatherApi.get(lat, lng).then(setWeather),
      floodApi.getActive(lat, lng, 5)
        .then((r) => {
          if (!r) throw new Error('flood_unavailable');
          setFloods(r.floods);
          setFloodUnavailable(false);
        })
        .catch(() => { setFloods([]); setFloodUnavailable(true); }),
      gasApi.getNearby(lat, lng, 5).then((r) => r && setGas(r.stations[0] ?? null)),
      repairApi.getNearby(lat, lng, 5).then((r) => r && setRepair(r.shops[0] ?? null)),
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

  const condMeta = weather?.current.condition ? CONDITION_META[weather.current.condition] : undefined;
  const condLabel = condMeta ? t(`info.weather.${condMeta.labelKey}`) : (weather?.current.condition_desc ?? '');
  const WeatherIcon = condMeta?.Icon ?? Cloud;

  return (
    <div className={sys.page}>
      <TopBar title={t('info.hub.title')} />

      {activeFloods.length > 0 && (
        <div className={styles.alertBanner}>
          <Waves size={15} strokeWidth={2.2} />
          <span>{t('info.hub.floodAlert', { count: activeFloods.length })}</span>
        </div>
      )}

      {/* 컨텍스트바: 위치 기준 (4화면과 동일 문법) */}
      <div className={sys.contextBar}>
        <MapPin size={15} className={sys.contextIcon} />
        <span className={sys.contextText}>{weather?.location?.district ?? t('info.hub.locationFallback')}</span>
        <span className={sys.contextSpacer} />
        <span className={styles.contextHint}>{t('info.hub.location')}</span>
      </div>

      <div className={sys.scroll}>
        {loading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`${sys.card} ${styles.navCardSkel}`}>
                <div className={sys.skelRow}>
                  <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                  <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {/* 날씨 카드 */}
            <button type="button" className={`${sys.card} ${styles.navCard}`} onClick={() => navigate('/info/weather')}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon} style={condMeta ? { color: condMeta.color } : undefined}>
                  <WeatherIcon size={16} strokeWidth={2} />
                </span>
                <span className={styles.cardTitle}>{t('info.weather.title')}</span>
                <ChevronRight size={16} className={styles.cardChevron} />
              </div>
              {weather ? (
                <>
                  <div className={styles.cardMain}>
                    <span className={`${styles.cardValue} num`}>{weather.current.temp_c}°C</span>
                    <span className={styles.cardValueSub}>{condLabel}</span>
                  </div>
                  {weather.current.rain_prob_1h >= 30 && (
                    <div className={styles.cardWarnLine}>
                      <CloudRain size={13} strokeWidth={2.2} />
                      <span>{t('info.hub.rainIn1h', { prob: weather.current.rain_prob_1h })}</span>
                    </div>
                  )}
                  <div className={styles.cardMeta}>
                    {t(`info.weather.rec_${weather.recommendation_code}`, { prob: weather.current?.rain_prob_1h ?? 0 })}
                  </div>
                </>
              ) : (
                <div className={styles.cardMeta}>{t('info.weather.unavailable')}</div>
              )}
            </button>

            {/* 침수 카드 */}
            <button
              type="button"
              className={`${sys.card} ${styles.navCard} ${activeFloods.length > 0 ? styles.navCardDanger : ''}`}
              onClick={() => navigate('/info/flood')}
            >
              <div className={styles.cardHead}>
                <span className={`${styles.cardIcon} ${activeFloods.length > 0 ? styles.cardIconDanger : ''}`}>
                  <Waves size={16} strokeWidth={2} />
                </span>
                <span className={`${styles.cardTitle} ${activeFloods.length > 0 ? styles.dangerText : ''}`}>
                  {t('info.flood.title')}{' '}
                  {floodUnavailable
                    ? `— ${t('info.flood.unavailableShort')}`
                    : activeFloods.length > 0
                    ? `— ${t('info.hub.floodActiveCount', { count: activeFloods.length })}`
                    : t('info.hub.floodNoIssue')}
                </span>
                <ChevronRight size={16} className={styles.cardChevron} />
              </div>
              {floodUnavailable ? (
                <div className={styles.cardMeta}>{t('info.flood.unavailable')}</div>
              ) : activeFloods.length > 0 ? (
                <>
                  {activeFloods.slice(0, 2).map((f) => (
                    <div key={f.report_id} className={styles.floodLine}>
                      <span
                        className={styles.floodDot}
                        style={{ background: getDepth(f.depth_level).fillColor }}
                      />
                      <span className={styles.floodPlace}>{districtLabelByCode(f.district_code)}</span>
                      <span className={styles.floodMeta}>
                        {t('info.hub.floodDepthTime', {
                          depth: depthLabel(f.depth_level),
                          time: f.time_ago ?? t('info.flood.justNow'),
                        })}
                      </span>
                    </div>
                  ))}
                  <div className={styles.cardFoot}>
                    <span className={styles.cardMeta}>
                      {t('info.hub.floodConfirmed', { count: activeFloods[0].confidence_score })}
                    </span>
                    <span className={`${styles.cardLink} ${styles.cardLinkDanger}`}>
                      {t('info.hub.floodViewMap')}
                      <ChevronRight size={12} strokeWidth={2.5} />
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.safeLine}>
                  <CheckCircle2 size={14} strokeWidth={2.2} />
                  <span>{t('info.hub.floodNone')}</span>
                </div>
              )}
            </button>

            {/* 주유소 카드 */}
            <button type="button" className={`${sys.card} ${styles.navCard}`} onClick={() => navigate('/info/gas')}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}><Fuel size={16} strokeWidth={2} /></span>
                <span className={styles.cardTitle}>{t('info.gas.title')}</span>
                <ChevronRight size={16} className={styles.cardChevron} />
              </div>
              {gas ? (
                <>
                  <div className={styles.cardMain}>
                    <span className={styles.cardName}>{gas.name ?? gas.brand ?? '—'}</span>
                    {gas.price_vnd != null && (
                      <span className={`${styles.cardValueSm} num`}>{formatCurrencyVnd(gas.price_vnd)}/L</span>
                    )}
                  </div>
                  <div className={styles.cardMeta}>
                    {gas.wait_minutes === 0
                      ? t('info.gas.noWait')
                      : gas.wait_minutes
                      ? t('info.gas.waitMin', { min: gas.wait_minutes })
                      : t('info.gas.noWaitInfo')}
                    {' · '}
                    <span className="num">{gas.distance_km.toFixed(1)}km</span>
                  </div>
                  <div className={styles.cardFoot}>
                    <span />
                    <span className={styles.cardLink}>
                      {t('info.hub.gasMoreLink')}
                      <ChevronRight size={12} strokeWidth={2.5} />
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.cardMeta}>{t('info.hub.gasUnavailable')}</div>
              )}
            </button>

            {/* 정비소 카드 */}
            <button type="button" className={`${sys.card} ${styles.navCard}`} onClick={() => navigate('/info/repair')}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}><Wrench size={16} strokeWidth={2} /></span>
                <span className={styles.cardTitle}>{t('info.repair.title')}</span>
                <ChevronRight size={16} className={styles.cardChevron} />
              </div>
              {repair ? (
                <>
                  <div className={styles.cardMain}>
                    <span className={styles.cardName}>{repair.name}</span>
                    <span className={styles.cardRating}>
                      <StarIcon size={13} />
                      <b className="num">{repair.avg_rating?.toFixed(1) ?? '—'}</b>
                      <span className={styles.cardRatingCount}>({repair.review_count})</span>
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    {repair.avg_price != null && (
                      <>
                        {t('info.hub.repairOilAvg')}{' '}
                        <span className="num">{formatCurrencyVnd(repair.avg_price)}</span>
                        {' · '}
                      </>
                    )}
                    <span className="num">{repair.distance_km.toFixed(1)}km</span>
                  </div>
                  <div className={styles.cardFoot}>
                    <span />
                    <span className={styles.cardLink}>
                      {t('info.hub.repairMoreLink')}
                      <ChevronRight size={12} strokeWidth={2.5} />
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.cardMeta}>{t('info.hub.repairUnavailable')}</div>
              )}
            </button>

            {/* 미니맵 카드 */}
            <button
              type="button"
              className={`${sys.card} ${styles.navCard}`}
              onClick={() => navigate('/info/flood')}
            >
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}><MapIcon size={16} strokeWidth={2} /></span>
                <span className={styles.cardTitle}>{t('info.hub.miniMapTitle')}</span>
                <ChevronRight size={16} className={styles.cardChevron} />
              </div>
              <div className={styles.miniMapWrap}>
                <InfoMap
                  variant="mini"
                  highlightedDistricts={userDistrictCode ? [userDistrictCode] : []}
                  dangerDistricts={dangerDistrictCodes}
                  markers={miniMapMarkers}
                />
              </div>
            </button>

            {/* RP 적립 힌트 (조용한 보조 — 리워드 골드 톤) */}
            <div className={styles.tipCard}>
              <span className={styles.tipIcon}><Gift size={15} strokeWidth={2.2} /></span>
              <span>{t('info.hub.gpTip')}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
