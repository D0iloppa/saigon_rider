import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { floodApi } from '@/api/info';
import type { FloodReport, FloodHotspot } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { resolveInfoCoords } from '@/lib/infoCoords';
import styles from './InfoFloodMap.module.css';

function depthBadgeClass(depth: string): string {
  if (depth === 'ankle') return styles.badgeWarn;
  if (depth === 'knee') return styles.badgeDanger;
  return styles.badgeThigh;
}

function depthPinClass(depth: string): string {
  if (depth === 'ankle') return styles.pinWarn;
  if (depth === 'knee') return styles.pinDanger;
  return styles.pinThigh;
}

const MOCK_PINS = [
  { top: '15%', left: '52%', depth: 'knee', label: 'Bình Thạnh' },
  { top: '50%', left: '22%', depth: 'ankle', label: 'D4' },
  { top: '30%', right: '12%', depth: 'thigh', label: 'Thủ Đức' },
  { top: '62%', left: '58%', depth: 'ankle', label: 'Phú Nhuận' },
];

export default function InfoFloodMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();

  const [floods, setFloods] = useState<FloodReport[]>([]);
  const [hotspots, setHotspots] = useState<FloodHotspot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = () => {
    setLoading(true);
    resolveInfoCoords(search).then(({ lat, lng }) => {
      Promise.allSettled([
        floodApi.getActive(lat, lng, 5).then((r) => setFloods(r.floods)),
        floodApi.getHotspots().then((r) => setHotspots(r.hotspots)),
      ]).finally(() => setLoading(false));
    });
  };

  const depthLabel = (depth: string) => {
    const key = `info.flood.depth${depth.charAt(0).toUpperCase()}${depth.slice(1)}`;
    return t(key, depth);
  };

  const depthEmoji = (depth: string) => {
    if (depth === 'ankle') return '🟡';
    if (depth === 'knee') return '🟠';
    return '🔴';
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeFloods = floods.filter((f) => f.status === 'ACTIVE');
  const resolvedFloods = floods.filter((f) => f.status === 'RESOLVED' || f.status === 'EXPIRED');

  const refreshBtn = (
    <button className={styles.iconBtn} onClick={fetchAll}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M23 4v6h-6M1 20v-6h6"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    </button>
  );

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.flood.mapTitle')}
        onBack={() => navigate(-1)}
        rightContent={refreshBtn}
      />

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <div className={`${styles.dot} ${styles.dotDanger}`} />
          <span className={styles.statActive}>
            {t('info.flood.active', { count: activeFloods.length })}
          </span>
        </div>
        <div className={styles.statItem}>
          <div className={`${styles.dot} ${styles.dotNeutral}`} />
          <span className={styles.statResolved}>
            {t('info.flood.resolved')}
          </span>
        </div>
      </div>

      <div className={styles.scroll}>
        {/* Mock map area */}
        <div className={styles.mapArea}>
          {/* Roads */}
          <div className={`${styles.road} ${styles.road1}`} />
          <div className={`${styles.road} ${styles.road2}`} />
          <div className={`${styles.road} ${styles.road3}`} />
          <div className={`${styles.road} ${styles.roadV1}`} />
          <div className={`${styles.road} ${styles.roadV2}`} />
          <div className={`${styles.road} ${styles.roadV3}`} />

          {/* Flood zones */}
          <div className={`${styles.floodZone} ${styles.zone1}`} />
          <div className={`${styles.floodZone} ${styles.zone2}`} />
          <div className={`${styles.floodZone} ${styles.zone3}`} />

          {/* Pins */}
          {MOCK_PINS.map((pin, i) => (
            <div
              key={i}
              className={styles.pin}
              style={{ top: pin.top, left: pin.left, right: (pin as { right?: string }).right }}
            >
              <div className={`${styles.pinDot} ${depthPinClass(pin.depth)}`}>
                {depthLabel(pin.depth).charAt(0)}
              </div>
              <div className={styles.pinLabel}>{pin.label}</div>
            </div>
          ))}

          {/* My location */}
          <div className={styles.myLocation}>
            <div className={styles.myLocationDot} />
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            <div className={styles.legendTitle}>{t('info.flood.legendTitle')}</div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.legendAnkle}`} />
              <span>🟡 {t('info.flood.depthAnkle')}</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.legendKnee}`} />
              <span>🟠 {t('info.flood.depthKnee')}</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.legendThigh}`} />
              <span>🔴 {t('info.flood.depthThigh')}+</span>
            </div>
          </div>

          {/* FAB */}
          <button className={styles.fab} onClick={() => navigate('/info/flood/report')}>+</button>
        </div>

        {/* Active flood list */}
        <div className={styles.sectionHeader}>
          <span>🔴 {t('info.flood.active', { count: activeFloods.length })}</span>
        </div>

        <div className={styles.floodCard}>
          {loading ? (
            <div className={styles.skeletonWrap}>
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
            </div>
          ) : (
            <>
              {activeFloods.map((f) => (
                <div key={f.report_id} className={styles.floodItem}>
                  <div className={styles.floodItemRow}>
                    <div className={styles.floodBadgeRow}>
                      <span className={`${styles.badge} ${depthBadgeClass(f.depth_level)}`}>
                        {depthEmoji(f.depth_level)} {depthLabel(f.depth_level)}
                      </span>
                      <span className={styles.floodName}>
                        {f.district_code}{f.street_name ? ` · ${f.street_name}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className={styles.floodMeta}>
                    {f.time_ago ?? t('info.flood.justNow')} · {t('info.flood.confidence', { count: f.confidence_score })} ·{' '}
                    <span className={styles.mono}>{f.distance_km?.toFixed(1)}km</span>
                  </div>
                </div>
              ))}

              {resolvedFloods.map((f) => (
                <div key={f.report_id} className={`${styles.floodItem} ${styles.resolved}`}>
                  <div className={styles.floodBadgeRow}>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>⚪ {t('info.flood.resolvedBadge')}</span>
                    <span className={styles.floodNameResolved}>
                      {f.district_code}{f.street_name ? ` · ${f.street_name}` : ''}
                    </span>
                  </div>
                  <div className={styles.floodMetaResolved}>{t('info.flood.resolvedAgoText')}</div>
                </div>
              ))}

              {floods.length === 0 && (
                <div className={styles.emptyRow}>{t('info.flood.noFloodNearby')}</div>
              )}
            </>
          )}
        </div>

        {/* Hotspots */}
        <div className={styles.sectionHeader}>
          <span>📊 {t('info.flood.hotspotTitle')}</span>
        </div>
        <div className={styles.hotspotList}>
          {hotspots.map((h) => (
            <div key={h.hotspot_id} className={styles.hotspotRow}>
              <span className={styles.hotspotName}>
                {h.district_code}{h.street_name ? ` · ${h.street_name}` : ''}
              </span>
              <span className={`${styles.mono} ${styles.hotspotCount}`}>
                {t('info.flood.confidence', { count: h.flood_count_30d })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
