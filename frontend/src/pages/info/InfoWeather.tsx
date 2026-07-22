import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { weatherApi } from '@/api/info';
import type { WeatherData, ForecastHour } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { parseCoordsFromQuery } from '@/lib/infoCoords';
import SaigonMapV5 from '@/components/maps/SaigonMapV5';
import { type SelectedRegion } from '@/components/maps/v2/region';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import styles from './InfoWeather.module.css';

const RAIN_COLOR = (pct: number) => {
  if (pct >= 80) return '#B91C1C';
  if (pct >= 60) return '#EF3B3B';
  if (pct >= 40) return '#3B82F6';
  if (pct >= 20) return '#F59E0B';
  return '#16A34A';
};

// 메인에서 넘어온 좌표(?lat&lng)가 있으면 그 지역 기준, 없으면 표시용 기본 도시.
// 지도에서 구역을 선택하면 setCoords 로 그 지역 기준 재조회.
function useGeolocation(search: string) {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(() => parseCoordsFromQuery(search) ?? { lat: 10.776, lng: 106.700 });
  useEffect(() => {
    const q = parseCoordsFromQuery(search);
    if (q) setCoords(q);
  }, [search]);
  return [coords, setCoords] as const;
}

export default function InfoWeather() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [coords, setCoords] = useGeolocation(search);
  const [regionName, setRegionName] = useState('');
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [notifyLabel, setNotifyLabel] = useState('');
  const [notifyDone, setNotifyDone] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 알림 입력이 스크롤 최하단이면 스크롤로도
  // 못 뺀다 — 키보드 높이만큼 하단 padding 을 더한다.
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    if (!coords) return;
    weatherApi.get(coords.lat, coords.lng)
      .then((weather) => {
        setData(weather);
        setUnavailable(false);
      })
      .catch(() => {
        setData(null);
        setUnavailable(true);
      })
      .finally(() => setLoading(false));
  }, [coords]);

  const handleNotify = useCallback(async () => {
    if (!coords || !notifyLabel.trim()) return;
    await weatherApi.notifyRain(notifyLabel.trim(), coords.lat, coords.lng);
    setNotifyDone(true);
  }, [coords, notifyLabel]);

  const cur = data?.current;
  const forecast = data?.forecast?.next_24h ?? [];
  const basis = data?.observed_at ?? data?.fetched_at;
  const timeStr = basis ? new Date(basis).toLocaleString() : '—';

  return (
    <div className={styles.page}>
      <TopBar title={t('info.weather.title')} onBack={() => navigate(-1)} rightContent={<InfoSwitcher current="weather" />} />

      <div className={styles.locBar}>
        📍 {regionName ? t('info.distFromFallback', { area: regionName }) : t('info.distFromGps')}
      </div>

      {loading ? (
        <div className={styles.loadingWrap}>
          <div className={styles.skeleton} style={{ height: 200 }} />
        </div>
      ) : unavailable ? (
        <div className={styles.loadingWrap}>{t('info.weather.unavailable')}</div>
      ) : (
        <div className={styles.scroll} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
          {data?.stale && (
            <div className={styles.rainAlert}>
              {t('info.weather.staleAt', { time: new Date(data.fetched_at).toLocaleString() })}
            </div>
          )}
          {/* Location map — 침수 지도와 동일 레이아웃(풀블리드) */}
          <div className={styles.mapArea}>
            {coords && (
              <SaigonMapV5
                height="100%"
                onRegionSelect={(r: SelectedRegion) => { setCoords({ lat: r.lat, lng: r.lng }); setRegionName(r.name); }}
                initialGps={coords ?? undefined}
                onLocated={setCoords}
              />
            )}
          </div>

          {/* 현재 날씨 */}
          <div className={styles.sectionHeader}>
            <span>📍 {data?.location?.district?.toUpperCase() ?? t('info.hub.locationFallback')} · {timeStr}</span>
          </div>
          <div className={styles.card}>
            <div className={styles.current}>
              <div className={styles.heroEmoji}>{cur?.emoji ?? '🌡'}</div>
              <div className={styles.heroTemp}>{cur?.temp_c ?? '--'}°C</div>
              <div className={styles.heroDesc}>{cur?.condition_desc ?? ''}</div>
              <div className={styles.heroSub}>
                {t('info.weather.humidity')} {cur?.humidity}% ·&nbsp;
                {t('info.weather.wind')} {cur?.wind_kmh}km/h
              </div>
            </div>
            {cur && cur.rain_prob_1h >= 50 && (
              <div className={styles.rainAlert}>
                <span>⛈</span>
                <span>{t('info.weather.rainAlert1h', { prob: cur.rain_prob_1h })}</span>
              </div>
            )}
          </div>

          {/* 24h forecast */}
          <div className={styles.sectionHeader}>
            <span>📅 {t('info.weather.forecastTitle')}</span>
          </div>
          <div className={styles.card}>
            <div className={styles.cardPad}>
              {forecast.map((h: ForecastHour, i: number) => {
                const isHigh = h.rain_prob >= 70;
                return (
                  <div key={i} className={`${styles.forecastRow} ${isHigh ? styles.forecastHighlight : ''}`}>
                    <span className={styles.forecastTime}>{h.time}</span>
                    <span className={styles.forecastIcon}>{h.emoji}</span>
                    <span className={styles.forecastTemp}>{h.temp_c}°</span>
                    <div className={styles.forecastBarWrap}>
                      <div
                        className={styles.forecastBar}
                        style={{ width: `${h.rain_prob}%`, background: RAIN_COLOR(h.rain_prob) }}
                      />
                    </div>
                    <span className={styles.forecastPct} style={{ color: isHigh ? RAIN_COLOR(h.rain_prob) : undefined }}>
                      {h.rain_prob}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommendation */}
          {data?.recommendation_code && (
            <div className={styles.recommend}>
              <div className={styles.recommendLabel}>💡 {t('info.weather.recommendation')}</div>
              <div className={styles.recommendText}>
                {t(`info.weather.rec_${data.recommendation_code}`, { prob: data.current?.rain_prob_1h ?? 0 })}
              </div>
            </div>
          )}

          {/* Notify subscribe */}
          <div className={styles.notifyBox}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div className={styles.notifyTitle}>{t('info.weather.notifyBtn')}</div>
              <div className={styles.notifyDesc}>{t('info.weather.notifyDesc')}</div>
            </div>
          </div>
          {!notifyDone ? (
            <div className={styles.notifyInput}>
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
            <div className={styles.notifySuccess}>{t('info.weather.notifySuccess')}</div>
          )}
        </div>
      )}
    </div>
  );
}
