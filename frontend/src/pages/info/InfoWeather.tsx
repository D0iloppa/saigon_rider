import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { weatherApi } from '@/api/info';
import type { WeatherData, ForecastHour } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { native } from '@/lib/native';
import styles from './InfoWeather.module.css';

const RAIN_COLOR = (pct: number) => {
  if (pct >= 80) return '#B91C1C';
  if (pct >= 60) return '#EF3B3B';
  if (pct >= 40) return '#3B82F6';
  if (pct >= 20) return '#F59E0B';
  return '#16A34A';
};

function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    native.getLocation()
      .then((pos) => setCoords({ lat: pos.lat, lng: pos.lng }))
      .catch(() => setCoords({ lat: 10.776, lng: 106.700 }));
  }, []);
  return coords;
}

export default function InfoWeather() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const coords = useGeolocation();
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifyLabel, setNotifyLabel] = useState('');
  const [notifyDone, setNotifyDone] = useState(false);

  useEffect(() => {
    if (!coords) return;
    weatherApi.get(coords.lat, coords.lng)
      .then(setData)
      .finally(() => setLoading(false));
  }, [coords]);

  const handleNotify = useCallback(async () => {
    if (!coords || !notifyLabel.trim()) return;
    await weatherApi.notifyRain(notifyLabel.trim(), coords.lat, coords.lng);
    setNotifyDone(true);
  }, [coords, notifyLabel]);

  const cur = data?.current;
  const forecast = data?.forecast?.next_24h ?? [];
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div className={styles.page}>
      <TopBar title={t('info.weather.title')} onBack={() => navigate(-1)} />

      {loading ? (
        <div className={styles.loadingWrap}>
          <div className={styles.skeleton} style={{ height: 200 }} />
        </div>
      ) : (
        <div className={styles.scroll}>
          {/* Hero */}
          <div className={styles.hero}>
            <div className={styles.heroMeta}>📍 {data?.location?.district?.toUpperCase() ?? 'DISTRICT 1'} · {timeStr}</div>
            <div className={styles.heroEmoji}>{cur?.emoji ?? '🌡'}</div>
            <div className={styles.heroTemp}>{cur?.temp_c ?? '--'}°C</div>
            <div className={styles.heroDesc}>{cur?.condition_desc ?? ''}</div>
            <div className={styles.heroSub}>
              {t('info.weather.humidity')} {cur?.humidity}% ·&nbsp;
              {t('info.weather.wind')} {cur?.wind_kmh}km/h
            </div>
          </div>

          {/* Rain alert */}
          {cur && cur.rain_prob_1h >= 50 && (
            <div className={styles.rainAlert}>
              <span>⛈</span>
              <span>{t('info.weather.rainAlert1h', { prob: cur.rain_prob_1h })}</span>
            </div>
          )}

          {/* Radar placeholder */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>🌧 {t('info.weather.radarTitle')}</div>
            <div className={styles.radarMap}>
              <div className={styles.radarRoad} style={{ width: '100%', height: 3, top: '40%', transform: 'rotate(-3deg)' }} />
              <div className={styles.radarRoad} style={{ width: 3, height: '100%', top: 0, left: '30%' }} />
              <div className={styles.radarRoad} style={{ width: 3, height: '100%', top: 0, left: '65%' }} />
              {cur && cur.rain_prob_1h >= 50 && (
                <>
                  <div className={styles.radarBlob} style={{ width: 90, height: 70, background: '#1D4ED8', top: '30%', right: '5%', filter: 'blur(16px)' }} />
                  <div className={styles.radarBlob} style={{ width: 40, height: 30, background: '#EF3B3B', top: '25%', right: '15%', filter: 'blur(8px)' }} />
                  <div className={styles.radarLabel} style={{ right: 10, bottom: 40 }}>
                    {t('info.weather.radarRainPct', { prob: cur.rain_prob_1h })}
                  </div>
                </>
              )}
              <div className={styles.radarMyPos} />
              <div className={styles.radarMyLabel}>{t('info.weather.myLocation')}</div>
              <div className={styles.radarTimeline}>
                <div className={styles.radarDot} />
                <span>{t('info.weather.forecast1h')}</span>
              </div>
            </div>
            <div className={styles.radarControls}>
              <button className={styles.radarBtn}>◀▶ {t('info.weather.radarPlay')}</button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={styles.radarBtn}>−3h</button>
                <button className={`${styles.radarBtn} ${styles.radarBtnActive}`}>{t('info.weather.radarNow')}</button>
                <button className={styles.radarBtn}>+6h</button>
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* 24h forecast */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>📅 {t('info.weather.forecastTitle')}</div>
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

          {/* Recommendation */}
          {data?.recommendation && (
            <div className={styles.recommend}>
              <div className={styles.recommendLabel}>💡 {t('info.weather.recommendation')}</div>
              <div className={styles.recommendText}>{data.recommendation}</div>
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
