import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gasApi } from '@/api/info';
import type { GasStation } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { resolveInfoCoordsSync, parseCoordsFromQuery } from '@/lib/infoCoords';
import type { ResolvedCoords } from '@/lib/infoCoords';
import { findNearestDistrict, districtLabelByCode, getDistrictByCode, isWithinHcmc } from '@/components/maps/district-data';
import InfoMap from '@/components/maps/InfoMap';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import GasStationSheet from '@/components/gas/GasStationSheet';
import { deriveBrandCode } from '@/components/gas/gas-tokens';
import type { MapMarker, GasMarkerData } from '@/components/maps/SaigonDistrictMap';
import styles from './InfoGasList.module.css';

const SWR_TTL_MS = 5 * 60 * 1000;
const FETCH_RADIUS_KM = 30; // HCMC 전역 로드 → 구역별 클러스터/필터.
const DEFAULT_DISTRICT = 'BEN_THANH';

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
  const incomingCode = useMemo(() => {
    const c = parseCoordsFromQuery(search);
    return c ? findNearestDistrict(c.lat, c.lng)?.code ?? null : null;
  }, [search]);

  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  // 선택 구역(지도 탭/초기 위치). 리스트는 이 구역 소속만 표시 → 지도 뱃지 수와 일치.
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(incomingCode);
  // GPS 가 HCMC 안이면 거리=내 위치 기준, 밖이면 선택 구역 centroid 기준.
  const [inHcm, setInHcm] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // 신규 주유소 제보 (현재 GPS 기준 → 대기큐 적재).
  const [showReport, setShowReport] = useState(false);
  const [reportName, setReportName] = useState('');
  const [reportPhone, setReportPhone] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const gasMarkers = useMemo<MapMarker[]>(
    () =>
      stations.map((s) => {
        const data: GasMarkerData = {
          brand_code: deriveBrandCode(s.brand),
          ref_price: null,
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
    [stations],
  );

  // 선택 구역 소속 주유소만 (지도 클러스터와 동일한 findNearestDistrict 기준) + 거리순.
  const listStations = useMemo<GasStation[]>(() => {
    const filtered = selectedDistrict
      ? stations.filter((s) => findNearestDistrict(s.lat, s.lng)?.code === selectedDistrict)
      : stations;
    return [...filtered].sort((a, b) => a.distance_km - b.distance_km);
  }, [stations, selectedDistrict]);

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

  // 거리 기준 origin 결정: HCMC 안 → GPS, 밖 → 선택(or 기본) 구역 centroid.
  const resolveAndLoad = useCallback((coords: ResolvedCoords) => {
    const within = coords.source === 'gps' && isWithinHcmc(coords.lat, coords.lng);
    setInHcm(within);
    const district = incomingCode ?? findNearestDistrict(coords.lat, coords.lng)?.code ?? DEFAULT_DISTRICT;
    setSelectedDistrict(district);
    if (within) {
      fetchStations({ lat: coords.lat, lng: coords.lng });
    } else {
      const c = getDistrictByCode(district);
      fetchStations(c ? { lat: c.gps.lat, lng: c.gps.lng } : { lat: coords.lat, lng: coords.lng });
    }
  }, [incomingCode, fetchStations]);

  useEffect(() => {
    const instant = resolveInfoCoordsSync(search, (fresh) => resolveAndLoad(fresh));
    resolveAndLoad(instant);
  }, [search, resolveAndLoad]);

  const handleDistrictClick = useCallback((code: string, gps: { lat: number; lng: number }) => {
    setSelectedDistrict(code);
    // HCMC 밖이면 거리 기준을 새 구역 centroid 로 재조회. 안이면 GPS 거리 유지(필터만).
    if (!inHcm) fetchStations(gps);
  }, [inHcm, fetchStations]);

  function handleWaitReport() {
    alert(`+5 XP! ${t('info.gas.comingSoon')}`);
  }

  async function handleSubmitReport() {
    if (!reportName.trim() || submitting) return;
    setSubmitting(true);
    try {
      const pos = await native.getLocation();
      await gasApi.reportStation({
        name: reportName.trim(),
        lat: pos.lat,
        lng: pos.lng,
        phone: reportPhone.trim() || undefined,
        note: reportNote.trim() || undefined,
      });
      toast.success(t('info.gas.reportSuccess'));
      setShowReport(false);
      setReportName('');
      setReportPhone('');
      setReportNote('');
    } catch {
      toast.error(t('info.gas.reportError'));
    } finally {
      setSubmitting(false);
    }
  }

  const distLabel = inHcm
    ? t('info.distFromGps')
    : t('info.distFromFallback', { area: selectedDistrict ? districtLabelByCode(selectedDistrict) : '' });

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
          <InfoMap
            variant="fullscreen"
            markers={gasMarkers}
            focusDistrictCode={selectedDistrict}
            onDistrictClick={(d) => handleDistrictClick(d.code, d.gps)}
          />
        </div>
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

        {/* Wait report CTA */}
        <button className={styles.reportCta} onClick={handleWaitReport}>
          <span>⛽</span>
          <span>{t('info.gas.reportWait')}</span>
        </button>
      </div>

      {showReport && (
        <div className={styles.reportBackdrop} onClick={() => !submitting && setShowReport(false)}>
          <div className={styles.reportSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.reportTitle}>{t('info.gas.reportTitle')}</div>
            <div className={styles.reportDesc}>{t('info.gas.reportDesc')}</div>
            <input
              className={styles.reportField}
              placeholder={t('info.gas.reportNamePlaceholder')}
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
            />
            <input
              className={styles.reportField}
              placeholder={t('info.gas.reportPhonePlaceholder')}
              value={reportPhone}
              onChange={(e) => setReportPhone(e.target.value)}
            />
            <input
              className={styles.reportField}
              placeholder={t('info.gas.reportNotePlaceholder')}
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
            />
            <div className={styles.reportActions}>
              <button className={styles.reportCancel} onClick={() => setShowReport(false)} disabled={submitting}>
                {t('common.cancel', '취소')}
              </button>
              <button className={styles.reportSubmit} onClick={handleSubmitReport} disabled={!reportName.trim() || submitting}>
                {submitting ? t('info.gas.reportSubmitting') : t('info.gas.reportSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedStation !== null && (
        <GasStationSheet
          stationId={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
