import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Bike,
  CheckCircle2,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  HelpCircle,
  Info,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { weatherApi } from '@/api/info';
import type { WeatherData, ForecastHour } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useServiceLocation, HCMC_DEFAULT_CENTER } from '@/hooks/useServiceLocation';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import LocationContextBar from '@/components/info/LocationContextBar';
import StateBlock from '@/components/ui/StateBlock';
import sys from '@/styles/system.module.css';
import styles from './InfoWeather.module.css';

/** OpenWeather condition 코드 → 아이콘/번역/색. 미등록 코드는 API 원문(condition_desc) 폴백. */
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

const RIDE_META: Record<string, { Icon: LucideIcon }> = {
  CLEAR: { Icon: Bike },
  RAIN_MED: { Icon: CloudDrizzle },
  RAIN_HIGH: { Icon: CloudLightning },
  UNCERTAIN: { Icon: HelpCircle },
};

export default function InfoWeather() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // 단일 SoT — 선택 지역은 useLocationStore(동네지도와 공유). 없으면 도시 기본 중심.
  const { region } = useServiceLocation();
  const coords = region ? { lat: region.lat, lng: region.lng } : HCMC_DEFAULT_CENTER;
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [notifyLabel, setNotifyLabel] = useState('');
  const [notifyDone, setNotifyDone] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 알림 입력이 스크롤 최하단이면 스크롤로도
  // 못 뺀다 — 키보드 높이만큼 하단 padding 을 더한다.
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setUnavailable(false);
    weatherApi.get(coords.lat, coords.lng)
      .then((weather) => {
        if (cancelled) return;
        if (!weather) throw new Error('weather_unavailable');
        setData(weather);
        setUnavailable(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords.lat, coords.lng, reloadTick]);

  const handleNotify = useCallback(async () => {
    if (!notifyLabel.trim()) return;
    await weatherApi.notifyRain(notifyLabel.trim(), coords.lat, coords.lng);
    setNotifyDone(true);
  }, [coords.lat, coords.lng, notifyLabel]);

  const cur = data?.current;
  const forecast = data?.forecast?.next_24h ?? [];
  const shortTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const basis = data?.observed_at ?? data?.fetched_at;
  const timeStr = basis ? shortTime(basis) : '—';
  const condMeta = cur?.condition ? CONDITION_META[cur.condition] : undefined;
  const condLabel = condMeta ? t(`info.weather.${condMeta.labelKey}`) : (cur?.condition_desc ?? '');
  const HeroIcon = condMeta?.Icon ?? Cloud;
  const rideCode = data?.recommendation_code ?? '';
  const RideIcon = RIDE_META[rideCode]?.Icon ?? HelpCircle;

  const hourMeta = (h: ForecastHour) => CONDITION_META[h.condition] ?? { Icon: Cloud, labelKey: '', color: '#8A8E9E' };

  return (
    <div className={sys.page}>
      <TopBar title={t('info.weather.title')} onBack={() => navigate(-1)} rightContent={<InfoSwitcher current="weather" />} />

      {/* 컨텍스트바: 전체↔선택지역 피커 (공통 컴포넌트, useLocationStore 단일 소스) */}
      <LocationContextBar />

      {loading ? (
        <div className={sys.scroll}>
          <div className={styles.heroSkel} />
          <div className={`${sys.card} ${styles.skelCard}`}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={sys.skelRow}>
                <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              </div>
            ))}
          </div>
        </div>
      ) : unavailable ? (
        <StateBlock
          icon={CloudOff}
          tone="error"
          title={t('info.weather.unavailableShort')}
          desc={t('info.weather.unavailable')}
          actionLabel={t('common.retry')}
          onAction={() => setReloadTick((v) => v + 1)}
        />
      ) : (
        <div className={sys.scroll} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
          {data?.stale && (
            <div className={styles.staleNote}>
              <Info size={14} />
              <span>{t('info.weather.staleAt', { time: data ? shortTime(data.fetched_at) : '—' })}</span>
            </div>
          )}

          {/* 현재 날씨 */}
          <div className={sys.sectionHead}>
            <span className={sys.sectionLabel}>{t('info.weather.nowLabel')}</span>
            <span className={`${sys.sectionAside} num`}>{t('info.weather.updatedAt', { time: timeStr })}</span>
          </div>
          <section className={sys.card}>
            <div className={styles.heroMain}>
              <div className={styles.heroTempWrap}>
                <span className={`${styles.heroTemp} num`}>{cur?.temp_c ?? '--'}</span>
                <span className={styles.heroUnit}>°C</span>
              </div>
              <div className={styles.heroCondCol}>
                <HeroIcon size={38} strokeWidth={1.8} style={{ color: condMeta?.color ?? 'var(--text-3)' }} />
                <span className={styles.heroCond}>{condLabel}</span>
              </div>
            </div>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <span>{t('info.weather.feels_like')}</span>
                <b className="num">{cur?.feels_like_c ?? '--'}°</b>
              </div>
              <div className={styles.heroStat}>
                <span>{t('info.weather.humidity')}</span>
                <b className="num">{cur?.humidity ?? '--'}%</b>
              </div>
              <div className={styles.heroStat}>
                <span>{t('info.weather.wind')}</span>
                <b className="num">{cur?.wind_kmh ?? '--'}km/h</b>
              </div>
            </div>
            {cur && cur.rain_prob_1h >= 50 && (
              <div className={styles.rainAlert}>
                <CloudRain size={15} />
                <span>{t('info.weather.rainAlert1h', { prob: cur.rain_prob_1h })}</span>
              </div>
            )}
          </section>

          {/* 라이딩 판단 — "지금 나가도 되나"의 답 */}
          {data?.recommendation_code && (
            <div className={styles.rideCard} data-level={rideCode}>
              <div className={styles.rideIcon}>
                <RideIcon size={18} strokeWidth={2} />
              </div>
              <div className={styles.rideBody}>
                <div className={styles.rideLabel}>{t('info.weather.recommendation')}</div>
                <div className={styles.rideText}>
                  {t(`info.weather.rec_${data.recommendation_code}`, { prob: cur?.rain_prob_1h ?? 0 })}
                </div>
              </div>
            </div>
          )}

          {/* 24h 예보 — 가로 스트립 */}
          <div className={sys.sectionHead}>
            <span className={sys.sectionLabel}>{t('info.weather.forecastTitle')}</span>
          </div>
          <div className={styles.hourStrip}>
            {forecast.map((h: ForecastHour, i: number) => {
              const meta = hourMeta(h);
              const HourIcon = meta.Icon;
              const wet = h.rain_prob >= 70;
              return (
                <div key={i} className={`${styles.hourChip} ${wet ? styles.hourChipWet : ''}`}>
                  <span className={`${styles.hourTime} num`}>{h.time}</span>
                  <HourIcon size={18} strokeWidth={1.8} style={{ color: meta.color }} />
                  <span className={`${styles.hourTemp} num`}>{Math.round(h.temp_c)}°</span>
                  <span
                    className={`${styles.hourRain} num ${wet ? styles.hourRainHigh : h.rain_prob >= 40 ? styles.hourRainMed : ''}`}
                  >
                    {h.rain_prob}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* 비 알림 구독 */}
          <div className={sys.sectionHead}>
            <span className={sys.sectionLabel}>{t('info.weather.notifyLabel')}</span>
          </div>
          <section className={sys.card}>
            <div className={styles.notifyHead}>
              <div className={styles.notifyIcon}>
                <Bell size={15} strokeWidth={2} />
              </div>
              <div className={styles.notifyCopy}>
                <div className={styles.notifyTitle}>{t('info.weather.notifyBtn')}</div>
                <div className={styles.notifyDesc}>{t('info.weather.notifyDesc')}</div>
              </div>
            </div>
            {!notifyDone ? (
              <div className={styles.notifyForm}>
                <input
                  className={styles.notifyField}
                  placeholder={t('info.weather.notifyPlaceholder')}
                  value={notifyLabel}
                  onChange={(e) => setNotifyLabel(e.target.value)}
                />
                <button className={styles.notifyBtn} onClick={handleNotify} disabled={!notifyLabel.trim()}>
                  {t('info.weather.notifyRegister')}
                </button>
              </div>
            ) : (
              <div className={styles.notifySuccess}>
                <CheckCircle2 size={15} />
                <span>{t('info.weather.notifySuccess')}</span>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
