import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Clock, Fuel, List, Map as MapIcon, Navigation, Phone, Plus } from 'lucide-react';
import { gasApi } from '@/api/info';
import type { GasStation, TodayPrices } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { swrRead, swrWrite } from '@/lib/swrCache';
import { findNearestDistrict } from '@/components/maps/district-data';
import { regionContains, type MapMarkerV2 } from '@/components/maps/v2/region';
import { L3_ENABLED, type DistrictBadge } from '@/components/maps/SaigonMapV5';
import { fetchPoiMapItems, type PoiMapItem } from '@/api/poi';
import { buildPoiLayer } from '@/components/maps/poiLayer';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import LocationContextBar from '@/components/info/LocationContextBar';
import { useServiceLocation } from '@/hooks/useServiceLocation';
import StateBlock from '@/components/ui/StateBlock';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import ReportSheet, { type ReportFields } from '@/components/info/ReportSheet';
import GasStationSheet from '@/components/gas/GasStationSheet';
import sys from '@/styles/system.module.css';
import styles from './InfoGasList.module.css';

const FETCH_RADIUS_KM = 3; // 홈 카드와 동일 반경 — 일관된 기준
const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));

export default function InfoGasList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapOpen = searchParams.get('view') === 'map';
  // 단일 SoT — 선택 지역/조회 기준 좌표는 useLocationStore(동네지도와 공유).
  const { region, origin } = useServiceLocation();

  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 표준유가(권역 참고가) — 전국 규제가라 주유소별이 아닌 상단 카드 1개로 노출.
  const [todayPrices, setTodayPrices] = useState<TodayPrices | null>(null);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // 신규 주유소 제보 (현재 GPS 기준 → 대기큐 적재).
  const [showReport, setShowReport] = useState(false);

  // 반경 내 주유소 거리순 정렬 (GPS 있으면 내 위치 기준, 없으면 fetched origin 기준).
  // 선택 지역이 있으면 그 동 경계 내부만 (지도 집계배지와 동일 집합), 없으면 전체.
  const listStations = useMemo<GasStation[]>(() => {
    const inRegion = region ? stations.filter((s) => regionContains(region, s.lat, s.lng)) : stations;
    return [...inRegion].sort((a, b) => a.distance_km - b.distance_km);
  }, [stations, region]);

  // POI 상시 참조 레이어(랜드마크·공공시설) — FETCH_RADIUS_KM 반경 bbox 로 조회 (주유소 목록과 동일 기준).
  const [poiItems, setPoiItems] = useState<PoiMapItem[]>([]);
  useEffect(() => {
    const latDelta = FETCH_RADIUS_KM / 111;
    const lngDelta = FETCH_RADIUS_KM / (111 * Math.cos(origin.lat * Math.PI / 180));
    const controller = new AbortController();
    fetchPoiMapItems({
      minLat: origin.lat - latDelta, maxLat: origin.lat + latDelta,
      minLng: origin.lng - lngDelta, maxLng: origin.lng + lngDelta,
      signal: controller.signal,
    })
      .then(setPoiItems)
      .catch(() => undefined);
    return () => controller.abort();
  }, [origin]);

  // 지도 마커 = 선택 동 내부 주유소 (리스트와 동일 집합). depth1 집계배지 / depth2·3 개별핀.
  // POI 는 배열 앞쪽(z-order 아래)에 깐다.
  const gasMarkers = useMemo<MapMarkerV2[]>(
    () => [
      ...buildPoiLayer(poiItems, i18n.language),
      ...listStations.map((s) => ({
        id: s.station_id,
        lat: s.lat,
        lng: s.lng,
        label: s.name ?? s.brand ?? '',
        onClick: () => setSelectedStation(s.station_id),
      })),
    ],
    [listStations, poiItems, i18n.language],
  );

  // 도시 전경(줌아웃)에서 개별 핀이 숨는 구간용 구별 집계 배지.
  const districtBadges = useMemo<DistrictBadge[]>(() => {
    const byCode = new Map<string, DistrictBadge>();
    listStations.forEach((s) => {
      const d = findNearestDistrict(s.lat, s.lng);
      if (!d) return;
      const cur = byCode.get(d.code);
      if (cur) cur.count += 1;
      else byCode.set(d.code, { lat: d.gps.lat, lng: d.gps.lng, count: 1 });
    });
    return [...byCode.values()];
  }, [listStations]);

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

  // 조회 기준 좌표(전체=도시 중심, 선택지역=동 centroid)가 바뀌면 재조회.
  useEffect(() => {
    fetchStations(origin);
  }, [origin, fetchStations]);

  // 표준유가 로드 (전국 규제가, 마운트 1회).
  useEffect(() => {
    gasApi.getTodayPrices().then(setTodayPrices).catch(() => {});
  }, []);

  // PETROLIMEX 우선, 없으면 첫 브랜드 버킷에서 RON95-III / E5 / 디젤 추출.
  const refPrices = useMemo(() => {
    if (!todayPrices) return null;
    const brand = (todayPrices.PETROLIMEX ?? Object.entries(todayPrices)
      .find(([k, v]) => k !== 'updated_at' && k !== 'updated_at_iso' && v && typeof v === 'object')?.[1]) as
      | Record<string, { price: number; effective_time: string }>
      | undefined;
    if (!brand || typeof brand !== 'object') return null;
    const rows = [
      { key: 'RON95_III', label: 'RON 95-III' },
      { key: 'E5_RON92_II', label: 'E5 RON 92' },
      { key: 'DO_005S_II', label: 'Diesel 0.05S' },
    ].map((f) => ({ label: f.label, price: brand[f.key]?.price ?? null }))
      .filter((r) => r.price != null);
    return rows.length ? { rows, updatedAt: todayPrices.updated_at ?? null } : null;
  }, [todayPrices]);

  async function handleSubmitReport(fields: ReportFields): Promise<boolean> {
    try {
      const pos = await native.getLocation();
      await gasApi.reportStation({ name: fields.name, lat: pos.lat, lng: pos.lng, phone: fields.phone, note: fields.note });
      toast.success(t('info.gas.reportSuccess'));
      setShowReport(false);
      return true;
    } catch (err) {
      toast.error(extractDetail(err, t('info.gas.reportError')));
      return false;
    }
  }

  const toggleMap = () => {
    // 예전엔 mapOpen 일 때 navigate(-1)(히스토리 뒤로가기)로 목록에 복귀했다 — "리스트로
    // 진입 → [지도] 누르면 push" 를 전제한 구현이다. 홈 4지표 카드가 `&view=map` 을 붙여
    // 지도 상태로 직접 진입하게 되면서 이 화면 안에 되돌아갈 목록 항목이 없어 [목록] 버튼이
    // 홈으로 튀는 버그가 됐다. 뒤로가기 대신 쿼리를 직접 지운다 — 목록에서 [지도]로 들어온
    // 경우의 "Back 은 지도→목록 먼저 복귀"(view=map 이 push 로 쌓임)는 그대로 유지된다.
    const next = new URLSearchParams(searchParams);
    if (mapOpen) next.delete('view');
    else next.set('view', 'map');
    setSearchParams(next);
  };

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(() => fetchStations(coordsRef.current), [fetchStations]),
  );

  return (
    <div className={sys.page}>
      <TopBar
        title={t('info.gas.title')}
        onBack={() => navigate(-1)}
        rightContent={<InfoSwitcher current="gas" />}
      />

      {/* 컨텍스트바: 전체↔선택지역 피커 + 지도 토글 (공통 컴포넌트) */}
      <LocationContextBar
        trailing={
          <button type="button" className={`${sys.chipBtn} ${mapOpen ? sys.chipBtnActive : ''}`} onClick={toggleMap}>
            {mapOpen ? <List size={15} /> : <MapIcon size={15} />}
            {mapOpen ? t('info.mapChipClose') : t('info.mapChipOpen')}
          </button>
        }
      />

      <div className={sys.scroll} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {mapOpen && (
          <div className={sys.mapBlock}>
            <Suspense fallback={<div className={sys.mapLoading}>{t('info.mapLoading')}</div>}>
              <SaigonMapV5
                height="100%"
                markers={gasMarkers}
                districtBadges={districtBadges}
                // L3 상세지도 부활 게이트: NeighborhoodMapCanvas 와 동일하게 SaigonMapV5.tsx 상단
                // L3_ENABLED(현재 true) 를 미러링 — depth3 건물/도로 로드.
                lightweight={!L3_ENABLED}
                markerDepth="l2"
                // 선택 지역 유무와 무관하게 origin(선택 동 centroid 또는 도시 기본 중심)으로 즉시
                // L3 줌인 — region 미선택 시 기존 D1 전체조망 폴백이면 L3 임계값(vb.w<L3_VBW)에
                // 못 미쳐 진입 직후 상세지도·POI 가 안 보였다(대표 지시 미달 지점).
                initialGps={origin}
                showLocateControl={false}
                // ward 자동선택 부작용 방지 (동네지도와 동일)
                selectRegionOnLocate={false}
                // 뷰포트 모드 — 지역선택 폴리곤 강조 끔. selectRegionOnLocate 만으로는
                // focusLatLng 의 else-if 분기가 setSelWard 를 호출해 오렌지 테두리가 남는다.
                polyActive={false}
              />
            </Suspense>
          </div>
        )}

        {/* 오늘의 참고가 (정부 공시) */}
        {refPrices && (
          <>
            <div className={sys.sectionHead}>
              <span className={sys.sectionLabel}>{t('info.gas.priceBar')}</span>
              {refPrices.updatedAt && (
                <span className={`${sys.sectionAside} num`}>
                  {t('info.gas.priceBarUpdated', { time: refPrices.updatedAt })}
                </span>
              )}
            </div>
            <section className={`${sys.card} ${styles.priceCard}`}>
              <div className={styles.priceRows}>
                {refPrices.rows.map((r, i) => (
                  <div key={r.label} className={`${styles.priceItem} ${i === 0 ? styles.priceItemMain : ''}`}>
                    <span className={styles.priceFuel}>{r.label}</span>
                    <span className={`${styles.priceVal} num`}>{r.price!.toLocaleString()}₫</span>
                  </div>
                ))}
              </div>
              <div className={styles.priceDisc}>{t('info.gas.disclaimer')}</div>
            </section>
          </>
        )}

        <div className={sys.sectionHead}>
          <span className={sys.sectionLabel}>{t('info.gas.nearbyTitle')}</span>
          <span className={`${sys.sectionAside} num`}>{listStations.length}</span>
        </div>

        {loading ? (
          <div className={sys.card}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={sys.skelRow}>
                <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className={sys.card}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('info.gas.loadError', '정보를 불러오지 못했습니다')}
              actionLabel={t('common.retry', '다시 시도')}
              onAction={() => fetchStations(coordsRef.current)}
            />
          </div>
        ) : listStations.length === 0 ? (
          <div className={sys.card}>
            <StateBlock icon={Fuel} title={t('info.gas.emptyDistrict', '이 지역에 등록된 주유소가 없어요')} />
          </div>
        ) : (
          <div className={sys.card}>
            {listStations.map((s) => (
              <div
                key={s.station_id}
                className={sys.row}
                onClick={() => setSelectedStation(s.station_id)}
                role="button"
                tabIndex={0}
              >
                <div className={sys.rowTop}>
                  <span className={sys.rowTitle}>{s.name ?? `${s.brand} · ${s.street_name}`}</span>
                  <span className={`${sys.rowDist} num`}>{s.distance_km.toFixed(1)}km</span>
                </div>
                {(s.opening_hours || s.wait_minutes != null) && (
                  <div className={sys.rowMeta}>
                    {s.opening_hours && (
                      <span>
                        <Clock size={11} className={sys.rowMetaIcon} />
                        <span className="num">{s.opening_hours}</span>
                      </span>
                    )}
                    {s.opening_hours && s.wait_minutes != null && <span className={sys.metaDot}>·</span>}
                    {s.wait_minutes != null && (
                      <span>
                        {s.wait_minutes <= 0 ? t('info.gas.noWait') : t('info.gas.waitMin', { min: s.wait_minutes })}
                      </span>
                    )}
                  </div>
                )}
                <div className={sys.rowFoot}>
                  <button
                    className={`${sys.actionChip} ${sys.actionPrimary}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/ride-nav?name=${encodeURIComponent(s.name ?? s.brand ?? '')}&lat=${s.lat}&lng=${s.lng}&dist=${s.distance_km.toFixed(1)}`);
                    }}
                  >
                    <Navigation size={13} strokeWidth={2.2} />
                    {t('info.gas.routeBtn')}
                  </button>
                  {s.phone && (
                    <button
                      className={`${sys.actionChip} ${sys.actionNeutral}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        native.openUrl(`tel:${s.phone}`);
                      }}
                    >
                      <Phone size={13} strokeWidth={2.2} />
                      {t('info.gas.callBtn')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 누락 주유소 제보 (조용한 보조 CTA) */}
        <button className={sys.quietCta} onClick={() => setShowReport(true)}>
          <span className={sys.quietCtaIcon}><Plus size={15} strokeWidth={2.2} /></span>
          <span>{t('info.gas.reportStationCta')}</span>
        </button>
        </div>
      </div>

      <ReportSheet
        open={showReport}
        title={t('info.gas.reportTitle')}
        desc={t('info.gas.reportDesc')}
        namePlaceholder={t('info.gas.reportNamePlaceholder')}
        phonePlaceholder={t('info.gas.reportPhonePlaceholder')}
        notePlaceholder={t('info.gas.reportNotePlaceholder')}
        submitLabel={t('info.gas.reportSubmit')}
        submittingLabel={t('info.gas.reportSubmitting')}
        onSubmit={handleSubmitReport}
        onClose={() => setShowReport(false)}
      />

      {selectedStation !== null && (
        <GasStationSheet
          stationId={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
