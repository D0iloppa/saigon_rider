import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { floodApi } from '@/api/info';
import type { FloodReportWithTrust, FloodHotspot, FloodRisk } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { api } from '@/api/client';
import { AppImage } from '@/components/ui/AppImage';
import { resolveInfoCoords, parseCoordsFromQuery } from '@/lib/infoCoords';
import SaigonMapV5 from '@/components/maps/SaigonMapV5';
import { regionContains, type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import { districtLabelByCode } from '@/components/maps/district-data';
import { getDepth, TRUST_TOKENS, trustFromScore } from '@/components/flood/flood-tokens';
import styles from './InfoFloodMap.module.css';

const REFRESH_INTERVAL_MS = 60_000;
const FETCH_RADIUS_KM = 30; // HCMC 전역 reports/risks 로드 (마커는 도시 전역, 리스트는 구역 필터).

type FloodEntry =
  | { ts: number; kind: 'report'; report: FloodReportWithTrust }
  | { ts: number; kind: 'risk'; risk: FloodRisk }
  | { ts: number; kind: 'hotspot'; hot: FloodHotspot };
const DAY_MS = 24 * 60 * 60 * 1000;

const isToday = (iso: string) => {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const within7d = (iso: string) => Date.now() - new Date(iso).getTime() <= 7 * DAY_MS;

export default function InfoFloodMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();

  const [reports, setReports] = useState<FloodReportWithTrust[]>([]);
  const [hotspots, setHotspots] = useState<FloodHotspot[]>([]);
  const [risks, setRisks] = useState<FloodRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // 침수 신고 (주유소 신고와 동일한 바텀시트 — 현재 GPS 기준).
  const [showReport, setShowReport] = useState(false);
  const [depth, setDepth] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = () => {
    setLoading(true);
    resolveInfoCoords(search).then(({ lat, lng }) => {
      coordsRef.current = { lat, lng };
      floodApi
        .getMapData(lat, lng, FETCH_RADIUS_KM)
        .then((r) => {
          setReports(r.reports);
          setHotspots(r.hotspots);
          setRisks(r.risks ?? []);
        })
        .finally(() => setLoading(false));
    });
  };

  useEffect(() => {
    fetchAll();
    const id = window.setInterval(() => {
      if (coordsRef.current) {
        floodApi
          .getMapData(coordsRef.current.lat, coordsRef.current.lng, FETCH_RADIUS_KM)
          .then((r) => {
            setReports(r.reports);
            setHotspots(r.hotspots);
            setRisks(r.risks ?? []);
          })
          .catch(() => undefined);
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // 메인에서 넘어온 좌표(?lat&lng) → 해당 동으로 init 포커싱. 직접 진입이면 null → GPS locate.
  const incomingCoords = useMemo(() => parseCoordsFromQuery(search), [search]);

  // 선택 동(지도 emit). 리스트는 이 동 경계 내부만, 지도 마커는 도시 전역.
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);

  // 파생 리스트(제보·예측·핫스팟)는 행마다 regionContains 판정이라 메모이즈
  // — 리포트 시트 타이핑 등 무관한 리렌더에 재계산되지 않도록.
  const { todayReports, floodEntries, markerHotspots } = useMemo(() => {
    const inSel = (lat: number, lng: number) =>
      !selectedRegion || regionContains(selectedRegion, lat, lng);

    const today = reports.filter((f) => isToday(f.reported_at));
    const listReports = reports
      .filter((f) => within7d(f.reported_at))
      .filter((f) => inSel(f.lat, f.lng))
      .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());

    const risksInSel = risks.filter((r) => inSel(r.lat, r.lng));
    const riskHotspotIds = new Set(risksInSel.map((r) => r.hotspot_id).filter((id): id is number => id != null));

    // 오늘 예측 위험이 있는 핫스팟은 위험 항목으로 대체(중복 억제).
    const hotspotsInSel = hotspots.filter(
      (h) =>
        (!selectedRegion ||
          (h.centroid_lat != null && h.centroid_lng != null && inSel(h.centroid_lat, h.centroid_lng))) &&
        !riskHotspotIds.has(h.hotspot_id),
    );

    const todayStartTs = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();
    const entries: FloodEntry[] = [
      ...listReports.map((f): FloodEntry => ({ ts: new Date(f.reported_at).getTime(), kind: 'report', report: f })),
      ...risksInSel.map((r): FloodEntry => ({ ts: todayStartTs, kind: 'risk', risk: r })),
      ...hotspotsInSel.map((h): FloodEntry => ({
        ts: h.last_flood_at ? new Date(h.last_flood_at).getTime() : 0,
        kind: 'hotspot',
        hot: h,
      })),
    ].sort((a, b) => b.ts - a.ts);

    // 지도 마커는 도시 전역(리스트는 구역 필터지만 다른 지역도 파악).
    const cityRiskHotspotIds = new Set(risks.map((r) => r.hotspot_id).filter((id): id is number => id != null));
    const markers = hotspots.filter(
      (h) => h.centroid_lat != null && h.centroid_lng != null && !cityRiskHotspotIds.has(h.hotspot_id),
    );
    return { todayReports: today, floodEntries: entries, markerHotspots: markers };
  }, [reports, risks, hotspots, selectedRegion]);

  const daysAgo = (iso?: string | null) => {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  };

  // 지도 마커(도시 전역): 상습=회색 · 예측=주황 · 제보=빨강.
  const floodMarkers = useMemo<MapMarkerV2[]>(() => [
    ...markerHotspots.map((h) => ({ id: `h-${h.hotspot_id}`, lat: h.centroid_lat as number, lng: h.centroid_lng as number, color: '#9CA3AF', r: 0.75 })),
    ...risks.map((r) => ({ id: `r-${r.risk_id}`, lat: r.lat, lng: r.lng, color: '#F59E0B', r: 1.2 })),
    ...todayReports.map((f) => ({ id: `f-${f.report_id}`, lat: f.lat, lng: f.lng, color: '#EF3B3B', r: 1.0 })),
  ], [markerHotspots, risks, todayReports]);

  const handleRegionSelect = useCallback((region: SelectedRegion) => setSelectedRegion(region), []);

  const DEPTH_CODES = ['ankle', 'knee', 'thigh', 'above'] as const;

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      const res = await api.realFetchForm<{ id: string; imgproxy_url: string }>('/contents/upload', form);
      setPhotoUrl(res.imgproxy_url);
    } catch {
      toast.error(t('info.flood.photoUploadError', '사진 업로드 실패'));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmitReport() {
    if (!depth || submitting) return;
    let c = coordsRef.current;
    if (!c) {
      const r = await resolveInfoCoords(search);
      c = { lat: r.lat, lng: r.lng };
    }
    setSubmitting(true);
    try {
      await floodApi.report({ lat: c.lat, lng: c.lng, depth_level: depth, photo_url: photoUrl ?? undefined });
      toast.success(t('info.flood.reportSuccess', '제보 완료! 감사합니다'));
      setShowReport(false);
      setDepth('');
      setPhotoUrl(null);
      fetchAll();
    } catch {
      toast.error(t('info.flood.reportError', '제보에 실패했어요'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.flood.mapTitle')}
        onBack={() => navigate(-1)}
        rightContent={<InfoSwitcher current="flood" />}
      />

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <div className={`${styles.dot} ${styles.dotDanger}`} />
          <span className={styles.statActive}>
            {t('info.flood.active', { count: todayReports.length })}
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
          <SaigonMapV5
            height="100%"
            markers={floodMarkers}
            onRegionSelect={handleRegionSelect}
            initialGps={incomingCoords ?? undefined}
            locateOnMount={!incomingCoords}
          />
        </div>

        {/* 최근 침수 (실시간 제보 + 상습 핫스팟 통합, 최신순) */}
        <div className={styles.sectionHeader}>
          <span>🔴 {t('info.flood.recentTitle', { count: floodEntries.length })}</span>
          {selectedRegion && (
            <button className={styles.filterChip} onClick={() => setSelectedRegion(null)}>
              📍 {selectedRegion.name} · {t('info.flood.showAll')}
            </button>
          )}
        </div>

        <div className={styles.floodCard}>
          {loading ? (
            <div className={styles.skeletonWrap}>
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
            </div>
          ) : floodEntries.length === 0 ? (
            <div className={styles.emptyRow}>{t('info.flood.noFloodNearby')}</div>
          ) : (
            floodEntries.map((e) => {
              if (e.kind === 'risk') {
                const r = e.risk;
                const high = r.risk_level === 'HIGH';
                return (
                  <div key={`risk-${r.risk_id}`} className={styles.floodItem}>
                    <div className={styles.floodBadgeRow}>
                      <span
                        className={styles.badge}
                        style={{ background: high ? '#FEE2E2' : '#FEF3C7', color: high ? '#B91C1C' : '#B45309' }}
                      >
                        ⚠️ {t('info.flood.riskBadge', { prob: r.rain_prob })}
                      </span>
                      <span className={styles.floodName}>
                        {districtLabelByCode(r.district_code ?? '')}{r.street_name ? ` · ${r.street_name}` : ''}
                      </span>
                    </div>
                    <div className={styles.floodMeta}>{t('info.flood.riskMeta')}</div>
                  </div>
                );
              }
              if (e.kind === 'hotspot') {
                const h = e.hot;
                const d = daysAgo(h.last_flood_at);
                return (
                  <div key={`h-${h.hotspot_id}`} className={styles.floodItem}>
                    <div className={styles.floodBadgeRow}>
                      <span className={`${styles.badge} ${styles.badgeWarn}`}>
                        🌧 {t('info.flood.hotspotBadge', { count: h.flood_count_30d })}
                      </span>
                      <span className={styles.floodName}>
                        {districtLabelByCode(h.district_code)}{h.street_name ? ` · ${h.street_name}` : ''}
                      </span>
                    </div>
                    <div className={styles.floodMeta}>
                      {d != null ? t('info.flood.hotspotLastFlood', { count: d }) : t('info.flood.hotspotBaseline')}
                    </div>
                  </div>
                );
              }
              const f = e.report;
              if (f.status !== 'ACTIVE') {
                return (
                  <div key={f.report_id} className={`${styles.floodItem} ${styles.resolved}`}>
                    <div className={styles.floodBadgeRow}>
                      <span className={`${styles.badge} ${styles.badgeNeutral}`}>⚪ {t('info.flood.resolvedBadge')}</span>
                      <span className={styles.floodNameResolved}>
                        {districtLabelByCode(f.district_code)}{f.street_name ? ` · ${f.street_name}` : ''}
                      </span>
                    </div>
                    <div className={styles.floodMetaResolved}>{t('info.flood.resolvedAgoText')}</div>
                  </div>
                );
              }
              const depth = getDepth(f.depth_level);
              const trust = TRUST_TOKENS[f.trust_level ?? trustFromScore(f.confidence_score)];
              return (
                <div key={f.report_id} className={styles.floodItem}>
                  <div className={styles.floodItemRow}>
                    <div className={styles.floodBadgeRow}>
                      <span className={styles.badge} style={{ background: depth.fillColor, color: depth.textColor }}>
                        {depth.emoji} {t(depth.labelKey, depth.code)}
                      </span>
                      <span className={styles.badge} style={{ background: trust.bgColor, color: trust.color }}>
                        {trust.icon} {t(trust.labelKey, trust.level)}
                      </span>
                      <span className={styles.floodName}>
                        {districtLabelByCode(f.district_code)}{f.street_name ? ` · ${f.street_name}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className={styles.floodMeta}>
                    {f.time_ago ?? t('info.flood.justNow')} · {t('info.flood.confidence', { count: f.confidence_score })} ·{' '}
                    <span className={styles.mono}>{f.distance_km?.toFixed(1)}km</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Report CTA (다른 info 페이지와 동일하게 하단 메뉴) */}
        <button className={styles.reportCta} onClick={() => setShowReport(true)}>
          <span>🌊</span>
          <span>{t('info.flood.reportCta', '침수 제보하기')}</span>
        </button>

      </div>

      {showReport && (
        <div className={styles.reportBackdrop} onClick={() => !submitting && setShowReport(false)}>
          <div className={styles.reportSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.reportTitle}>{t('info.flood.reportTitle')}</div>
            <div className={styles.reportDesc}>{t('info.flood.reportDesc', '현재 위치로 제보됩니다.')}</div>

            <label className={styles.reportFieldLabel}>{t('info.flood.depthQuestion')}</label>
            <select className={styles.reportSelect} value={depth} onChange={(e) => setDepth(e.target.value)}>
              <option value="" disabled>{t('info.flood.depthPlaceholder', '깊이 선택')}</option>
              {DEPTH_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(`info.flood.depth${code.charAt(0).toUpperCase()}${code.slice(1)}`, code)}
                </option>
              ))}
            </select>

            <label className={styles.reportFieldLabel}>{t('info.flood.photoOption')}</label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoSelect}
            />
            {photoUrl ? (
              <div className={styles.photoPreview}>
                <AppImage src={photoUrl} alt="" className={styles.photoThumb} />
                <button type="button" className={styles.photoRemove} onClick={() => setPhotoUrl(null)}>
                  {t('info.flood.photoRemove', '사진 제거')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.photoToggle}
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
              >
                📷 {uploadingPhoto ? t('info.flood.photoUploading', '업로드 중...') : t('info.flood.addPhoto')}
              </button>
            )}

            <div className={styles.reportActions}>
              <button className={styles.reportCancel} onClick={() => setShowReport(false)} disabled={submitting}>
                {t('common.cancel', '취소')}
              </button>
              <button className={styles.reportSubmit} onClick={handleSubmitReport} disabled={!depth || submitting}>
                {submitting ? t('info.flood.ctaSubmitting') : t('info.flood.ctaSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
