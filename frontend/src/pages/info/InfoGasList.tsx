import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronUp, Clock, Fuel, Map as MapIcon, Navigation, Phone, Plus, ZoomIn } from 'lucide-react';
import { gasApi } from '@/api/info';
import type { GasStation, TodayPrices } from '@/api/info';
// DEV_DONGTAN_PIN: 한국 실기기 카메라연출 검증용 dev 판정 — BizManage.tsx 패턴 복제.
// 실기기 검증 완료 후 제거 대상 (2026-08-07).
import { fetchAppConfig } from '@/api/appVersion';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { requireServiceLocation } from '@/lib/serviceLocation';
import { formatCurrencyVnd } from '@/lib/format';
import { swrRead, swrWrite } from '@/lib/swrCache';
import type { MapMarkerV2 } from '@/components/maps/v2/region';
import { L3_ENABLED, type DistrictBadge } from '@/components/maps/SaigonMapV5';
import { fetchPoiMapItems, type PoiMapItem } from '@/api/poi';
import { buildPoiLayer } from '@/components/maps/poiLayer';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import LocationContextBar from '@/components/info/LocationContextBar';
import ServiceGateNotice from '@/components/location/ServiceGateNotice';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { clusterByViewport } from '@/lib/clusterPoints';
import { useServiceLocation } from '@/hooks/useServiceLocation';
import StateBlock from '@/components/ui/StateBlock';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import ReportSheet, { type ReportFields } from '@/components/info/ReportSheet';
import GasStationSheet from '@/components/gas/GasStationSheet';
import sys from '@/styles/system.module.css';
import styles from './InfoGasList.module.css';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));

// DEV_DONGTAN_PIN: 한국(경기 화성 동탄역) 실기기 카메라연출(course-up 회전·flyTo·추종) 검증용 임시 핀.
// 베트남 현지 실기기 테스트가 불가해 한국 실좌표로 대체 검증한다. dev 서버에서만 목록에 append 되며,
// station_id 는 음수라 실 DB 와 충돌하지 않는다. 실기기 검증 완료 후 이 상수와 관련 분기를 전부 제거할 것
// (2026-08-07, grep -rn DEV_DONGTAN_PIN 로 전체 위치 확인).
const DEV_DONGTAN_PIN: GasStation = {
  station_id: -999001,
  brand: null,
  name: '[DEV] 동탄역',
  phone: null,
  district_code: null,
  street_name: null,
  distance_km: 0,
  opening_hours: null,
  lat: 37.19930,
  lng: 127.09704,
  price_vnd: null,
  wait_minutes: null,
  wait_confidence: null,
  wait_reported_at: null,
};

export default function InfoGasList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapOpen = searchParams.get('view') === 'map';
  // 단일 SoT — 표시 범위/조회 기준 좌표는 useLocationStore(앱 전역, 2026-08-06 통일).
  const { origin, fetchRadiusKm } = useServiceLocation();
  // 경로 버튼 제어용 — 화면 로딩 시 이미 끝난 측위 결과를 읽기만 한다(대표 지시 2026-08-13 11:44).
  const { available: routeAvailable, reason: routeGateReason } = useServiceAvailability();

  /**
   * 경로 안내 불가 사유를 알린다. 버튼을 `disabled` 로 두면 onClick 이 아예 안 불려
   * **조용히 아무 일도 안 일어나고**, 상단 안내를 못 본 사용자는 오류로 받아들인다
   * (대표 지적 2026-08-13). 그래서 aria-disabled 로 잠근 티만 내고 탭은 받아 여기서 설명한다.
   * 문구·토스트는 이 화면이 제보 차단에 이미 쓰는 것과 동일한 것을 재사용한다(신규 디자인 없음).
   */
  const notifyRouteBlocked = () => {
    // 사유가 없으면 아직 확인 중이라는 뜻이다 — 기기 문제라고 단정하면 거짓 안내가 된다
    // (코드리뷰 지적 2026-08-13).
    toast.neutral(routeGateReason
      ? t(`locationGate.${routeGateReason}.title`)
      : t('locationGate.checking', '위치를 확인하고 있어요'));
  };

  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 표준유가(권역 참고가) — 전국 규제가라 주유소별이 아닌 상단 카드 1개로 노출.
  const [todayPrices, setTodayPrices] = useState<TodayPrices | null>(null);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // DEV_DONGTAN_PIN: 한국 실기기 카메라연출 검증용 — dev 서버에서만 테스트 핀 노출(fail-closed).
  // 실기기 검증 완료 후 이 state/effect 를 제거할 것 (2026-08-07).
  const [isDev, setIsDev] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchAppConfig()
      .then((cfg) => { if (!cancelled) setIsDev(cfg.isDev); })
      .catch(() => { /* fail-closed: isDev 는 false 유지 */ });
    return () => { cancelled = true; };
  }, []);

  // 신규 주유소 제보 (현재 GPS 기준 → 대기큐 적재).
  const [showReport, setShowReport] = useState(false);
  // 줌 힌트 — L3(건물/골목) 미도달 상태에서 노출. 탭하면 현재 지도 중앙을 L3 로 확대한다.
  const [showZoomHint, setShowZoomHint] = useState(true);
  const zoomInRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  // 클러스터 격자 기준이자 줌힌트의 확대 중심 — 렌더에 반영돼야 하므로 state 다.
  const [viewport, setViewport] = useState<{ N: number; S: number; E: number; W: number } | null>(null);

  // 반경 내 주유소 거리순 정렬. 'gps' 표시범위면 radiusKm 로 자르고, '전체'면 자르지 않는다.
  // 종전엔 선택 동 폴리곤(regionContains)으로 걸러 구 경계에 걸친 곳이 빠졌다(2026-08-06 폐기).
  const listStations = useMemo<GasStation[]>(() => {
    const inRange = stations.filter((s) => s.distance_km <= fetchRadiusKm);
    return [...inRange].sort((a, b) => a.distance_km - b.distance_km);
  }, [stations, fetchRadiusKm]);

  // POI 상시 참조 레이어(랜드마크·공공시설) — fetchRadiusKm 반경 bbox 로 조회 (주유소 목록과 동일 기준).
  const [poiItems, setPoiItems] = useState<PoiMapItem[]>([]);
  useEffect(() => {
    const latDelta = fetchRadiusKm / 111;
    const lngDelta = fetchRadiusKm / (111 * Math.cos(origin.lat * Math.PI / 180));
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
  // 줌아웃 시 묶어 보여줄 클러스터 — 구(district) 단위 집계에서 **뷰포트 격자 클러스터**로
  // 교체했다(대표 지적 2026-08-06: 배지 위치가 실제 지점과 어긋나고 합계도 안 맞았다).
  // 위치는 구성원 무게중심이고, 대상은 목록과 같은 집합이라 합계가 일치한다.
  const clusters = useMemo<DistrictBadge[]>(
    () => clusterByViewport(listStations, viewport),
    [listStations, viewport],
  );

  const fetchStations = useCallback((origin: { lat: number; lng: number }) => {
    const { lat, lng } = origin;
    coordsRef.current = origin;
    // 반경을 키에 포함해야 한다 — 없으면 '전체 지역'(12km)이 '내 현재 위치'(3km)
    // 캐시를 읽어 두 모드 결과가 같아진다(대표 지적 2026-08-06).
    const nearbyKey = `gas:nearby:${lat.toFixed(3)}:${lng.toFixed(3)}:r${fetchRadiusKm}`;
    const cached = swrRead<GasStation[]>(nearbyKey);
    if (cached) {
      setStations(cached);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
    }
    gasApi.getNearby(lat, lng, fetchRadiusKm)
      .then((r) => {
        if (!r) return;
        // 캐시에는 실제 응답만 기록 — DEV 핀은 캐시 기록 뒤에 append 해 새로고침 시 중복되지 않게 한다.
        swrWrite(nearbyKey, r.stations);
        setError(false);
        // DEV_DONGTAN_PIN: 한국 실기기 카메라연출 검증용 테스트 핀 — dev 서버에서만 append.
        // 실기기 검증 완료 후 이 분기를 제거할 것 (2026-08-07).
        setStations(isDev ? [...r.stations, DEV_DONGTAN_PIN] : r.stations);
      })
      .catch(() => { if (!cached) setError(true); })
      .finally(() => setLoading(false));
  }, [fetchRadiusKm, isDev]);

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
    // 제보는 좌표가 DB 에 영속되는 **기록형** — 권역 밖/부정확 좌표는 저장하지 않는다
    // (260813 정책안 §1). 폴백 좌표로 대체하면 데이터 위조가 된다.
    const gate = await requireServiceLocation();
    if (!gate.ok) {
      // 서비스 지역/측위 상태 안내는 오류가 아니라 상태다 — 톤은 neutral 로 통일한다
      // (대표 결정 2026-08-13). 경로 차단 토스트와 같은 톤이어야 한 화면에서 갈리지 않는다.
      toast.neutral(t(`locationGate.${gate.reason}.title`));
      return false;
    }
    const pos = gate.coords;
    try {
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
            {/* 지도/목록 배타 전환이 아니라 지도 펼침·접힘이다 — 아이콘도 그에 맞춘다. */}
            {mapOpen ? <ChevronUp size={15} /> : <MapIcon size={15} />}
            {mapOpen ? t('info.mapChipClose') : t('info.mapChipOpen')}
          </button>
        }
      />

      {/* 경로 안내 불가 사유를 화면 안에서 한 줄로 — 목록은 그대로 보이고 버튼만 잠긴다. */}
      <ServiceGateNotice />

      <div className={sys.scroll} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {mapOpen && (
          <div className={sys.mapBlock}>
            <Suspense fallback={<div className={sys.mapLoading}>{t('info.mapLoading')}</div>}>
              <SaigonMapV5
                height="100%"
                markers={gasMarkers}
                districtBadges={clusters}
                // 클러스터 탭 = 그 지점으로 L3 확대 (개별 dot 이 보이는 깊이까지).
                onBadgeClick={(b) => zoomInRef.current?.({ lat: b.lat, lng: b.lng })}
                // L3 상세지도 부활 게이트: NeighborhoodMapCanvas 와 동일하게 SaigonMapV5.tsx 상단
                // L3_ENABLED(현재 true) 를 미러링 — depth3 건물/도로 로드.
                lightweight={!L3_ENABLED}
                markerDepth="l2"
                // 선택 지역 유무와 무관하게 origin(선택 동 centroid 또는 도시 기본 중심)으로 즉시
                // L3 줌인 — region 미선택 시 기존 D1 전체조망 폴백이면 L3 임계값(vb.w<L3_VBW)에
                // 못 미쳐 진입 직후 상세지도·POI 가 안 보였다(대표 지시 미달 지점).
                initialGps={origin}
                // 우측 하단 '내 위치'(◎) 버튼 — 마켓·동네지도와 동일하게 노출 (2026-08-06).
                showLocateControl
                // 진입 즉시 내 위치 파란 점을 찍는다 — 종전엔 ◎ 를 눌러야만 나타났다
                // (대표 지적 2026-08-06). 카메라는 건드리지 않는 dot 전용 측위다.
                meDotOnMount
                // ward 자동선택 부작용 방지 (동네지도와 동일)
                selectRegionOnLocate={false}
                // 뷰포트 모드 — 지역선택 폴리곤 강조 끔. selectRegionOnLocate 만으로는
                // focusLatLng 의 else-if 분기가 setSelWard 를 호출해 오렌지 테두리가 남는다.
                polyActive={false}
                zoomInRef={zoomInRef}
                onBboxChange={setViewport}
                // 힌트는 L3 미도달일 때 — 데이터 게이트(markerDepth='l2')와 분리된 신호다.
                onDepthChange={(_gate, belowL3) => setShowZoomHint(belowL3)}
              />
              {showZoomHint && (
                <button
                  type="button"
                  className={sys.mapZoomHint}
                  onClick={() => {
                    // 내 위치가 아니라 **현재 지도 중앙** 기준으로 확대한다.
                    if (viewport) {
                      zoomInRef.current?.({ lat: (viewport.N + viewport.S) / 2, lng: (viewport.E + viewport.W) / 2 });
                    }
                  }}
                >
                  <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" /> {t('map.zoomGateShort', { defaultValue: '확대해서 주변 보기' })}
                </button>
              )}
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
                    <span className={`${styles.priceVal} num`}>{formatCurrencyVnd(r.price!)}</span>
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
                    aria-disabled={!routeAvailable}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!routeAvailable) { notifyRouteBlocked(); return; }
                      // DEV_DONGTAN_PIN: 이 핀일 때만 devRaw 플래그를 붙인다 — RideNav 가 is_dev AND
                      // 플래그 이중 게이트로 소비(다른 주유소는 기존 URL 그대로). 제거 대상 (2026-08-07).
                      const devFlag = s.station_id === DEV_DONGTAN_PIN.station_id ? '&devRaw=1' : '';
                      navigate(`/ride-nav?name=${encodeURIComponent(s.name ?? s.brand ?? '')}&lat=${s.lat}&lng=${s.lng}&dist=${s.distance_km.toFixed(1)}${devFlag}`);
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
