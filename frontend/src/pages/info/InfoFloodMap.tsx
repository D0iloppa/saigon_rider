import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { floodApi } from '@/api/info';
import type { FloodReportWithTrust, FloodHotspot } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { resolveInfoCoords } from '@/lib/infoCoords';
import SaigonDistrictMap from '@/components/maps/SaigonDistrictMap';
import { findNearestDistrict } from '@/components/maps/district-data';
import FloodHotspotLayer from '@/components/flood/FloodHotspotLayer';
import FloodMarker from '@/components/flood/FloodMarker';
import FloodDetailSheet from '@/components/flood/FloodDetailSheet';
import { getDepth, TRUST_TOKENS, trustFromScore } from '@/components/flood/flood-tokens';
import styles from './InfoFloodMap.module.css';

const REFRESH_INTERVAL_MS = 60_000;

export default function InfoFloodMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();

  const [reports, setReports] = useState<FloodReportWithTrust[]>([]);
  const [hotspots, setHotspots] = useState<FloodHotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FloodReportWithTrust | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const fetchAll = () => {
    setLoading(true);
    resolveInfoCoords(search).then(({ lat, lng }) => {
      coordsRef.current = { lat, lng };
      floodApi
        .getMapData(lat, lng, 5)
        .then((r) => {
          setReports(r.reports);
          setHotspots(r.hotspots);
        })
        .finally(() => setLoading(false));
    });
  };

  useEffect(() => {
    fetchAll();
    const id = window.setInterval(() => {
      if (coordsRef.current) {
        floodApi
          .getMapData(coordsRef.current.lat, coordsRef.current.lng, 5)
          .then((r) => {
            setReports(r.reports);
            setHotspots(r.hotspots);
          })
          .catch(() => undefined);
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeFloods = reports.filter((f) => f.status === 'ACTIVE');
  const resolvedFloods = reports.filter((f) => f.status === 'RESOLVED' || f.status === 'EXPIRED');

  const dangerDistrictCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const f of activeFloods) {
      const w = findNearestDistrict(f.lat, f.lng);
      if (w) codes.add(w.code);
    }
    return Array.from(codes);
  }, [activeFloods]);

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
        {/* District map */}
        <div className={styles.mapArea}>
          <SaigonDistrictMap
            dangerDistricts={dangerDistrictCodes}
            showLabels
            showLegend
            height="100%"
          >
            <FloodHotspotLayer hotspots={hotspots} />
            {activeFloods.map((f) => (
              <FloodMarker
                key={f.report_id}
                lat={f.lat}
                lng={f.lng}
                depth={f.depth_level}
                trustLevel={f.trust_level ?? trustFromScore(f.confidence_score)}
                minutesAgo={
                  f.minutes_ago ??
                  Math.max(0, Math.floor((Date.now() - new Date(f.reported_at).getTime()) / 60000))
                }
                hasPhoto={!!f.photo_url}
                onClick={() => setSelected(f)}
              />
            ))}
          </SaigonDistrictMap>
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
              {activeFloods.map((f) => {
                const depth = getDepth(f.depth_level);
                const trust = TRUST_TOKENS[f.trust_level ?? trustFromScore(f.confidence_score)];
                return (
                  <div key={f.report_id} className={styles.floodItem}>
                    <div className={styles.floodItemRow}>
                      <div className={styles.floodBadgeRow}>
                        <span
                          className={styles.badge}
                          style={{ background: depth.fillColor, color: depth.textColor }}
                        >
                          {depth.emoji} {t(depth.labelKey, depth.code)}
                        </span>
                        <span
                          className={styles.badge}
                          style={{ background: trust.bgColor, color: trust.color }}
                        >
                          {trust.icon} {t(trust.labelKey, trust.level)}
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
                );
              })}

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

              {reports.length === 0 && (
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

      <FloodDetailSheet
        report={selected}
        onClose={() => setSelected(null)}
        onConfirmed={fetchAll}
      />
    </div>
  );
}
