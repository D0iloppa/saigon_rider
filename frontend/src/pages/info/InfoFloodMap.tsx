import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Camera, Check, Clock3, CloudRain, Droplets, History, Megaphone, ShieldCheck, type LucideIcon, Users, ZoomIn } from 'lucide-react';
import { floodApi } from '@/api/info';
import type { FloodMapData, FloodReportWithTrust, FloodHotspot, FloodRisk, FloodTrustLevel } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { AppImage } from '@/components/ui/AppImage';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useServiceLocation } from '@/hooks/useServiceLocation';
import { useLocationStore } from '@/store/useLocationStore';
import { L3_ENABLED, type DistrictBadge } from '@/components/maps/SaigonMapV5';
import type { MapMarkerV2 } from '@/components/maps/v2/region';
import { fetchPoiMapItems, type PoiMapItem } from '@/api/poi';
import { buildPoiLayer } from '@/components/maps/poiLayer';
import InfoSwitcher from '@/components/info/InfoSwitcher';
import StateBlock from '@/components/ui/StateBlock';
import { districtLabelByCode } from '@/components/maps/district-data';
import { getDepth, TRUST_TOKENS, trustFromScore } from '@/components/flood/flood-tokens';
import depth1 from '@/components/maps/v2/saigon-depth1.json';
import sys from '@/styles/system.module.css';
import styles from './InfoFloodMap.module.css';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));
const REFRESH_INTERVAL_MS = 60_000;
const FETCH_RADIUS_KM = 30; // HCMC 전역 reports/risks 로드 — 마커도 리스트도 도시 전역 기준.
// 2026-07-31: 하단 리스트의 지도 뷰포트 bbox 필터를 제거했다. 진입 시 L3 상세지도로 줌인하게
// 되면서(initialGps) 뷰포트가 ~1km 로 좁아져 침수 지점이 전부 밖으로 밀려 리스트가 0건이 됐고,
// 상단 칩("위험 예보 N", 도시 전역 기준)과 내용이 모순되게 보였다. viewportBbox 자체는 POI
// 조회 범위로 계속 쓴다.
// district-data.ts 의 구 중심좌표(레거시, 지도 렌더링 폴리곤과 별개 데이터셋)는 depth1.json 이 실제로
// 그리는 영역보다 넓은 행정구역까지 커버해(예: Thủ Đức) 배지가 폴리곤 밖 허공에 뜨는 문제가 있었다.
// depth1.json 자체의 ward gps(렌더링 폴리곤과 항상 일치)로 위치를 잡고, 백엔드가 실좌표 기준으로
// 계산해 내려주는 ward_slug 로 그루핑한다 — 매칭 폴리곤이 없으면(서비스 지역 밖) 배지 자체를 생략.
const WARD_GPS_BY_SLUG = new Map<string, { lat: number; lng: number }>(
  depth1.wards.map((w) => [w.slug as string, w.gps as { lat: number; lng: number }]),
);

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

const TRUST_ICONS: Record<FloodTrustLevel, LucideIcon> = {
  PENDING: Clock3,
  CONFIRMED: Users,
  VERIFIED: ShieldCheck,
};

// 1분 내 재조회 방지 — localStorage TTL 캐시(REFRESH_INTERVAL_MS 와 동일 주기라 자동 갱신 틱은
// 캐시 만료 후 자연스럽게 네트워크로 폴백, 화면 재진입 등 중복 호출만 걸러낸다).
const floodCacheKey = (lat: number, lng: number) => `flood:map-data:${lat.toFixed(2)}:${lng.toFixed(2)}`;
function readFloodCache(lat: number, lng: number): FloodMapData | null {
  try {
    const raw = localStorage.getItem(floodCacheKey(lat, lng));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: FloodMapData };
    return Date.now() - ts <= REFRESH_INTERVAL_MS ? data : null;
  } catch {
    return null;
  }
}
function writeFloodCache(lat: number, lng: number, data: FloodMapData): void {
  try {
    localStorage.setItem(floodCacheKey(lat, lng), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // 용량 초과 등 — 캐싱 실패는 무시(다음 호출은 네트워크로 폴백)
  }
}

export default function InfoFloodMap() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // origin(조회 기준 좌표)만 읽는다 — 침수지도는 전역 위치 store 에 쓰지 않는다(다른 화면 침습 방지).
  const { origin } = useServiceLocation();
  // 진입 시 측위 — 침수지도는 LocationContextBar 가 없어(뷰포트 기준 필터) 스스로 불러야
  // 한다. 스토어가 세션당 1회로 묶으므로 다른 화면을 거쳐 왔으면 재측위하지 않는다.
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  useEffect(() => { void ensureLocation(); }, [ensureLocation]);

  // 줌 힌트 — L3(건물/골목) 미도달 상태에서 노출. 탭하면 현재 지도 중앙을 L3 로 확대한다.
  const [showZoomHint, setShowZoomHint] = useState(true);
  const zoomInRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  const [reports, setReports] = useState<FloodReportWithTrust[]>([]);
  const [hotspots, setHotspots] = useState<FloodHotspot[]>([]);
  const [risks, setRisks] = useState<FloodRisk[]>([]);
  // 현황 칩 단일 선택 토글 필터 — null 이면 전체.
  const [floodFilter, setFloodFilter] = useState<'report' | 'risk' | 'hotspot' | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [reportCoords, setReportCoords] = useState<{ lat: number; lng: number } | null>(null);
  // 지도 뷰포트 bbox — 이제 POI 조회 범위 전용(하단 리스트 필터로는 쓰지 않는다, 위 주석 참조).
  const [viewportBbox, setViewportBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const handleBboxChange = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    setViewportBbox(bbox);
  }, []);
  // POI 상시 참조 레이어(랜드마크·공공시설) — 뷰포트 bbox 기준 조회.
  const [poiItems, setPoiItems] = useState<PoiMapItem[]>([]);
  useEffect(() => {
    if (!viewportBbox) return;
    const controller = new AbortController();
    fetchPoiMapItems({
      minLat: viewportBbox.S, maxLat: viewportBbox.N, minLng: viewportBbox.W, maxLng: viewportBbox.E,
      signal: controller.signal,
    })
      .then(setPoiItems)
      .catch(() => undefined);
    return () => controller.abort();
  }, [viewportBbox]);

  // 침수 신고 (주유소 신고와 동일한 바텀시트 — 현재 GPS 기준).
  const [showReport, setShowReport] = useState(false);
  const [locatingReport, setLocatingReport] = useState(false);
  const [depth, setDepth] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 하단에 고정된 이 시트를 그대로 덮는다 —
  // 시트 자신의 padding-bottom 을 키보드 높이만큼 늘려 여백을 확보한다.
  // (ai-docs/context/keyboard-ux.md 케이스 2)
  const isIosNative = native.platform === 'ios';

  const applyMapData = (r: FloodMapData) => {
    setReports(r.reports);
    setHotspots(r.hotspots);
    setRisks(r.risks ?? []);
  };

  const fetchAll = useCallback(() => {
    coordsRef.current = origin;
    const cached = readFloodCache(origin.lat, origin.lng);
    if (cached) {
      applyMapData(cached);
      setLoading(false);
      setLoadError(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    floodApi
      .getMapData(origin.lat, origin.lng, FETCH_RADIUS_KM)
      .then((r) => {
        applyMapData(r);
        writeFloodCache(origin.lat, origin.lng, r);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [origin]);

  useEffect(() => {
    setReportCoords(null);
    fetchAll();
    const id = window.setInterval(() => {
      const c = coordsRef.current;
      if (c) {
        floodApi
          .getMapData(c.lat, c.lng, FETCH_RADIUS_KM)
          .then((r) => {
            applyMapData(r);
            writeFloodCache(c.lat, c.lng, r);
          })
          .catch(() => undefined);
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchAll]);

  // 파생 리스트(제보·예측·핫스팟) 메모이즈 — 리포트 시트 타이핑 등 무관한 리렌더에
  // 재계산되지 않도록. 뷰포트 무관(도시 전역)이라 viewportBbox 는 deps 에 없다.
  const { todayReports, floodEntries, allHotspots, unriskedHotspots } = useMemo(() => {
    const today = reports.filter((f) => isToday(f.reported_at));
    const listReports = reports
      .filter((f) => within7d(f.reported_at))
      .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());

    const risksInSel = risks;
    const riskHotspotIds = new Set(risksInSel.map((r) => r.hotspot_id).filter((id): id is number => id != null));

    // 좌표 있는 핫스팟 전체(위험예보 유무 무관) — 칩 카운트·hotspot 필터 활성 시 리스트/마커/배지 기준.
    const hotspotsWithGps = hotspots.filter((h) => h.centroid_lat != null && h.centroid_lng != null);
    // 오늘 위험예보가 있는 핫스팟은 리스트/마커/배지에서 제외(중복 억제) — "전체" 모드 기준.
    // 우기에는 강수확률 예보 잡이 전 구역을 100% 로 판정해 상습 핫스팟 전부가 위험예보를 갖게
    // 되고, 이 억제를 hotspotCount(칩 숫자)에도 적용하면 '상습 구역' 칩이 상시 0 이 돼 버려
    // 칩 3개 중 하나가 영구히 죽는 문제가 있었다. 그래서 칩 카운트는 allHotspots 기준(항상 전체),
    // 억제는 리스트/마커/배지에서만 유지한다(예보와 좌표가 완전히 동일해 마커·배지 중복이
    // 실질적으로 관측 가능한 차이를 만들지 않는 지점이라 그렇다).
    const hotspotsInSel = hotspotsWithGps.filter((h) => !riskHotspotIds.has(h.hotspot_id));

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

    return { todayReports: today, floodEntries: entries, allHotspots: hotspotsWithGps, unriskedHotspots: hotspotsInSel };
  }, [reports, risks, hotspots]);

  // 제공자(OpenWeather) 조회 실패로 보존된 stale 예보 존재 여부 — "안전"과 구분 렌더용.
  // floodFilter 가 'report'/'hotspot' 로 좁혀진 화면에는 적용하지 않는다 — risk 와 무관한
  // 필터에서 stale risk 하나 때문에 "조회 실패"로 보이면 빈 상태(정상)를 장애로 오인하게 된다.
  const hasStaleRisk = useMemo(
    () => (floodFilter === null || floodFilter === 'risk') && risks.some((r) => r.is_stale),
    [risks, floodFilter],
  );

  // 한 번도 예측이 성공한 적 없는 구역(보존할 이전 snapshot 자체가 없음) 존재 여부 — F-11
  // 잔여 갭. `never_confirmed` 는 additive 필드라 구필드만 내려주는 캐시·구버전 응답에는
  // 없을 수 있다 — 그 경우 `undefined` 는 falsy 라 기존 동작(안전/무필터 렌더)이 유지된다.
  const hasUnconfirmedRisk = useMemo(
    () => (floodFilter === null || floodFilter === 'risk') && hotspots.some((h) => h.never_confirmed === true),
    [hotspots, floodFilter],
  );

  const daysAgo = (iso?: string | null) => {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  };

  // hotspot 필터 활성 시에만 억제 없이 allHotspots 를 쓴다(사용자 결정 — 칩·필터는 전체 상습을
  // 기준으로 세되, "전체" 모드(필터 없음)의 리스트/마커/배지는 오늘 위험예보와의 중복 억제를 유지).
  const hotspotsForMarkersAndBadges = floodFilter === 'hotspot' ? allHotspots : unriskedHotspots;

  // 지도 마커(도시 전역): 상습=회색 · 예측=주황 · 제보=빨강. POI 는 배열 앞쪽(z-order 아래)에 깐다.
  const floodMarkers = useMemo<MapMarkerV2[]>(() => [
    ...buildPoiLayer(poiItems, i18n.language),
    ...(floodFilter === null || floodFilter === 'hotspot'
      ? hotspotsForMarkersAndBadges.map((h) => ({ id: `h-${h.hotspot_id}`, lat: h.centroid_lat as number, lng: h.centroid_lng as number, color: '#9CA3AF', r: 0.75 }))
      : []),
    ...(floodFilter === null || floodFilter === 'risk'
      ? risks.map((r) => ({ id: `r-${r.risk_id}`, lat: r.lat, lng: r.lng, color: '#F59E0B', r: 1.2 }))
      : []),
    ...(floodFilter === null || floodFilter === 'report'
      ? todayReports.map((f) => ({ id: `f-${f.report_id}`, lat: f.lat, lng: f.lng, color: '#EF3B3B', r: 1.0 }))
      : []),
  ], [poiItems, i18n.language, hotspotsForMarkersAndBadges, risks, todayReports, floodFilter]);

  // 줌아웃(도시 전경)에서는 개별 핀이 숨으므로 ward 단위 집계 배지로 "어디가 잠겼나"를 보여준다.
  // 백엔드가 실좌표로 계산한 ward_slug 로 그루핑 — 매칭 폴리곤 없는(서비스 지역 밖) 항목은 제외.
  const districtBadges = useMemo<DistrictBadge[]>(() => {
    const bySlug = new Map<string, number>();
    const add = (slug: string | null | undefined) => {
      if (!slug) return;
      bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1);
    };
    if (floodFilter === null || floodFilter === 'report') todayReports.forEach((f) => add(f.ward_slug));
    if (floodFilter === null || floodFilter === 'risk') risks.forEach((r) => add(r.ward_slug));
    if (floodFilter === null || floodFilter === 'hotspot') hotspotsForMarkersAndBadges.forEach((h) => add(h.ward_slug));
    const badges: DistrictBadge[] = [];
    bySlug.forEach((count, slug) => {
      const gps = WARD_GPS_BY_SLUG.get(slug);
      if (gps) badges.push({ lat: gps.lat, lng: gps.lng, count });
    });
    return badges;
  }, [todayReports, risks, hotspotsForMarkersAndBadges, floodFilter]);

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
    const c = reportCoords;
    if (!c) return;
    setSubmitting(true);
    try {
      await floodApi.report({ lat: c.lat, lng: c.lng, depth_level: depth, photo_url: photoUrl ?? undefined });
      toast.success(t('info.flood.reportSuccess', '제보 완료! 감사합니다'));
      setShowReport(false);
      setDepth('');
      setPhotoUrl(null);
      fetchAll();
    } catch (err) {
      toast.error(extractDetail(err, t('info.flood.reportError', '제보에 실패했어요')));
    } finally {
      setSubmitting(false);
    }
  }

  async function openReport() {
    if (reportCoords) {
      setShowReport(true);
      return;
    }
    setLocatingReport(true);
    try {
      await native.ensureLocationPermission();
      const coords = await native.getLocation();
      coordsRef.current = coords;
      setReportCoords(coords);
      setShowReport(true);
    } catch {
      toast.error(t('info.flood.locationError'));
    } finally {
      setLocatingReport(false);
    }
  }

  const activeCount = todayReports.length;
  const riskCount = risks.length;
  // 칩 카운트는 필터·중복억제와 무관하게 항상 전체 상습 지점 수 기준(위 useMemo 주석 참조).
  const hotspotCount = allHotspots.length;

  const toggleFloodFilter = (kind: 'report' | 'risk' | 'hotspot') => {
    setFloodFilter((prev) => (prev === kind ? null : kind));
  };

  // hotspot 필터 활성 시엔 억제 없는 allHotspots 기준으로 리스트를 다시 구성(전체 모드의
  // floodEntries 는 unriskedHotspots 로 만들어져 있어 그대로 kind 필터링만 하면 억제된 채로 남는다).
  const filteredFloodEntries = useMemo(() => {
    if (floodFilter === 'hotspot') {
      return allHotspots
        .map((h): FloodEntry => ({
          ts: h.last_flood_at ? new Date(h.last_flood_at).getTime() : 0,
          kind: 'hotspot',
          hot: h,
        }))
        .sort((a, b) => b.ts - a.ts);
    }
    return floodFilter === null ? floodEntries : floodEntries.filter((e) => e.kind === floodFilter);
  }, [floodEntries, floodFilter, allHotspots]);

  return (
    <div className={sys.page}>
      <TopBar
        title={t('info.flood.mapTitle')}
        onBack={() => navigate(-1)}
        rightContent={<InfoSwitcher current="flood" />}
      />

      {/* 현황 스트립 — 수치이자 지도 마커색 범례 */}
      <div className={styles.statStrip}>
        <button
          type="button"
          className={`${styles.statChip} ${activeCount === 0 ? styles.statDim : styles.statHot} ${floodFilter === 'report' ? styles.statActive : ''}`}
          disabled={activeCount === 0}
          aria-pressed={floodFilter === 'report'}
          onClick={() => toggleFloodFilter('report')}
        >
          <i className={styles.statDotDanger} />
          {t('info.flood.statReports')} <b className="num">{activeCount}</b>
        </button>
        <button
          type="button"
          className={`${styles.statChip} ${riskCount === 0 ? styles.statDim : ''} ${floodFilter === 'risk' ? styles.statActive : ''}`}
          disabled={riskCount === 0}
          aria-pressed={floodFilter === 'risk'}
          onClick={() => toggleFloodFilter('risk')}
        >
          <i className={styles.statDotWarn} />
          {t('info.flood.statRisks')} <b className="num">{riskCount}</b>
        </button>
        <button
          type="button"
          className={`${styles.statChip} ${hotspotCount === 0 ? styles.statDim : ''} ${floodFilter === 'hotspot' ? styles.statActive : ''}`}
          disabled={hotspotCount === 0}
          aria-pressed={floodFilter === 'hotspot'}
          onClick={() => toggleFloodFilter('hotspot')}
        >
          <i className={styles.statDotNeutral} />
          {t('info.flood.statHotspots')} <b className="num">{hotspotCount}</b>
        </button>
      </div>

      <div className={sys.scroll}>
        {/* District map */}
        <div className={sys.mapBlock}>
          <Suspense fallback={<div className={sys.mapLoading}>{t('info.mapLoading')}</div>}>
            <SaigonMapV5
              height="100%"
              markers={floodMarkers}
              districtBadges={districtBadges}
              // L3 상세지도 부활 게이트: NeighborhoodMapCanvas 와 동일하게 SaigonMapV5.tsx 상단
              // L3_ENABLED(현재 true) 를 미러링 — depth3 건물/도로 로드.
              lightweight={!L3_ENABLED}
              markerDepth="l2"
              onBboxChange={handleBboxChange}
              // 선택 지역 유무와 무관하게 origin(선택 동 centroid 또는 도시 기본 중심)으로 즉시
              // L3 줌인 — region 미선택 시 기존 D1 전체조망 폴백이면 L3 임계값(vb.w<L3_VBW)에
              // 못 미쳐 진입 직후 상세지도·POI 가 안 보였다(대표 지시 미달 지점).
              initialGps={origin}
              // 우측 하단 '내 위치'(◎) 버튼 + 진입 즉시 내 위치 점 — 주유소·정비소와 동일하게
              // 노출한다(대표 지적 2026-08-06). meDot 은 카메라를 건드리지 않는 표시 전용이다.
              showLocateControl
              meDotOnMount
              // ward 자동선택 부작용 방지 (동네지도와 동일)
              selectRegionOnLocate={false}
              // 뷰포트 모드 — 지역선택 폴리곤 강조를 끈다. `initialGps` 포커스는
              // selectRegion 여부와 무관하게 `setSelWard` 를 호출하므로(SaigonMapV5
              // focusLatLng 의 else-if 분기) `selectRegionOnLocate` 만으로는 오렌지
              // 테두리가 남는다. 강조 렌더 조건이 `polyActive && selWard !== null` 이라
              // 여기서 polyActive 를 끊는다. 동네지도는 `polyActive={mode === 'region'}`.
              polyActive={false}
              zoomInRef={zoomInRef}
              // 힌트는 L3 미도달일 때 — 데이터 게이트(markerDepth='l2')와 분리된 신호다.
              onDepthChange={(_gate, belowL3) => setShowZoomHint(belowL3)}
            />
            {showZoomHint && (
              <button
                type="button"
                className={sys.mapZoomHint}
                onClick={() => {
                  // 내 위치가 아니라 **현재 지도 중앙** 기준으로 확대한다.
                  // 이미 있는 뷰포트 state 를 재사용한다(중복 ref 를 만들지 않는다).
                  if (viewportBbox) {
                    zoomInRef.current?.({
                      lat: (viewportBbox.N + viewportBbox.S) / 2,
                      lng: (viewportBbox.E + viewportBbox.W) / 2,
                    });
                  }
                }}
              >
                <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" /> {t('map.zoomGateShort', { defaultValue: '확대해서 주변 보기' })}
              </button>
            )}
          </Suspense>
        </div>

        {/* 제보 CTA — 목격 즉시 누를 수 있게 지도 바로 아래 */}
        <button className={styles.reportCta} onClick={openReport} disabled={locatingReport}>
          <Megaphone size={16} strokeWidth={2} />
          <span>{locatingReport ? t('info.flood.locationLocating') : t('info.flood.reportCta', '침수 제보하기')}</span>
        </button>

        {/* 최근 침수 (실시간 제보 + 예측 + 상습 핫스팟 통합, 최신순) */}
        <div className={sys.sectionHead}>
          <span className={sys.sectionLabel}>{t('info.flood.recentLabel')}</span>
          <span className={`${sys.sectionAside} num`}>{filteredFloodEntries.length}</span>
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
        ) : loadError ? (
          <div className={sys.card}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('info.flood.loadError')}
              actionLabel={t('common.retry')}
              onAction={fetchAll}
            />
          </div>
        ) : filteredFloodEntries.length === 0 && (hasStaleRisk || hasUnconfirmedRisk) ? (
          // 예보 데이터는 있으나 전부 provider 장애로 갱신 실패한 stale 상태 — 초록 "안전"과
          // 절대 혼동되면 안 되므로 중립 tone 으로 분리 렌더.
          <div className={sys.card}>
            <StateBlock
              icon={AlertCircle}
              tone="neutral"
              title={t('info.flood.unavailableTitle')}
              desc={t('info.flood.unavailable')}
            />
          </div>
        ) : filteredFloodEntries.length === 0 ? (
          <div className={sys.card}>
            <StateBlock icon={ShieldCheck} tone="safe" title={t('info.flood.noFloodNearby')} desc={t('info.flood.safeDesc')} />
          </div>
        ) : (
          <div className={sys.card}>
            {filteredFloodEntries.map((e) => {
              if (e.kind === 'risk') {
                const r = e.risk;
                // stale(제공자 조회 실패로 보존된 이전 snapshot)은 "안전"으로도, 방금 갱신된
                // 위험 예보로도 보이면 안 되므로 중립 톤 + 별도 문구로 분리 렌더.
                if (r.is_stale) {
                  return (
                    <div key={`risk-${r.risk_id}`} className={styles.entryRow}>
                      <div className={`${styles.entryIcon} ${styles.entryIconNeutral}`}>
                        <AlertCircle size={15} strokeWidth={2} />
                      </div>
                      <div className={styles.entryBody}>
                        <div className={styles.entryTitle}>
                          {districtLabelByCode(r.district_code ?? '')}{r.street_name ? ` · ${r.street_name}` : ''}
                        </div>
                        <div className={styles.entryMeta}>
                          <span>{t('info.flood.riskStaleBadge')}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={`risk-${r.risk_id}`} className={styles.entryRow}>
                    <div className={`${styles.entryIcon} ${styles.entryIconWarn}`}>
                      <CloudRain size={15} strokeWidth={2} />
                    </div>
                    <div className={styles.entryBody}>
                      <div className={styles.entryTitle}>
                        {districtLabelByCode(r.district_code ?? '')}{r.street_name ? ` · ${r.street_name}` : ''}
                      </div>
                      <div className={styles.entryMeta}>
                        <span className={styles.entryStrongWarn}>{t('info.flood.riskBadge', { prob: r.rain_prob })}</span>
                        <span className={sys.metaDot}>·</span>
                        <span>{t('info.flood.riskMeta')}</span>
                      </div>
                    </div>
                  </div>
                );
              }
              if (e.kind === 'hotspot') {
                const h = e.hot;
                const d = daysAgo(h.last_flood_at);
                return (
                  <div key={`h-${h.hotspot_id}`} className={styles.entryRow}>
                    <div className={`${styles.entryIcon} ${styles.entryIconNeutral}`}>
                      <History size={15} strokeWidth={2} />
                    </div>
                    <div className={styles.entryBody}>
                      <div className={styles.entryTitle}>
                        {districtLabelByCode(h.district_code)}{h.street_name ? ` · ${h.street_name}` : ''}
                      </div>
                      <div className={styles.entryMeta}>
                        <span>{t('info.flood.hotspotBadge', { count: h.flood_count_30d })}</span>
                        <span className={sys.metaDot}>·</span>
                        <span>{d != null ? t('info.flood.hotspotLastFlood', { count: d }) : t('info.flood.hotspotBaseline')}</span>
                      </div>
                    </div>
                  </div>
                );
              }
              const f = e.report;
              if (f.status !== 'ACTIVE') {
                return (
                  <div key={f.report_id} className={`${styles.entryRow} ${styles.entryResolved}`}>
                    <div className={`${styles.entryIcon} ${styles.entryIconNeutral}`}>
                      <Check size={15} strokeWidth={2} />
                    </div>
                    <div className={styles.entryBody}>
                      <div className={`${styles.entryTitle} ${styles.entryTitleMuted}`}>
                        {districtLabelByCode(f.district_code)}{f.street_name ? ` · ${f.street_name}` : ''}
                      </div>
                      <div className={styles.entryMeta}>{t('info.flood.resolvedAgoText')}</div>
                    </div>
                  </div>
                );
              }
              const depthToken = getDepth(f.depth_level);
              const trustLevel = f.trust_level ?? trustFromScore(f.confidence_score);
              const trust = TRUST_TOKENS[trustLevel];
              const TrustIcon = TRUST_ICONS[trustLevel];
              return (
                <div key={f.report_id} className={styles.entryRow}>
                  <div
                    className={styles.entryIcon}
                    style={{ background: `${depthToken.fillColor}1F`, color: depthToken.fillColor }}
                  >
                    <Droplets size={15} strokeWidth={2} />
                  </div>
                  <div className={styles.entryBody}>
                    <div className={styles.entryTitle}>
                      {districtLabelByCode(f.district_code)}{f.street_name ? ` · ${f.street_name}` : ''}
                    </div>
                    <div className={styles.entryMeta}>
                      <span style={{ color: depthToken.fillColor, fontWeight: 700 }}>{t(depthToken.labelKey)}</span>
                      <span className={sys.metaDot}>·</span>
                      <span>{f.time_ago ?? t('info.flood.justNow')}</span>
                      <span className={sys.metaDot}>·</span>
                      <span className={styles.entryTrust} style={{ color: trust.color }}>
                        <TrustIcon size={11} strokeWidth={2.2} />
                        {t(trust.labelKey)}
                      </span>
                    </div>
                  </div>
                  {f.distance_km != null && (
                    <span className={`${styles.entryDist} num`}>{f.distance_km.toFixed(1)}km</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showReport && (
        <div className={styles.reportBackdrop} onClick={() => !submitting && setShowReport(false)}>
          <div
            className={styles.reportSheet}
            onClick={(e) => e.stopPropagation()}
            style={
              isIosNative && kb.visible
                ? {
                    maxHeight: 'calc(100% - var(--status-bar-height, 0px) - 12px)',
                    paddingBottom: `calc(${kb.height}px + 20px)`,
                  }
                : undefined
            }
          >
            <div className={styles.reportTitle}>{t('info.flood.reportTitle')}</div>
            <div className={styles.reportDesc}>{t('info.flood.reportDesc', '현재 위치로 제보됩니다.')}</div>

            <label className={styles.reportFieldLabel}>{t('info.flood.depthQuestion')}</label>
            <div className={styles.depthGrid}>
              {DEPTH_CODES.map((code) => {
                const token = getDepth(code);
                const selected = depth === code;
                return (
                  <button
                    key={code}
                    type="button"
                    className={`${styles.depthOpt} ${selected ? styles.depthOptSel : ''}`}
                    style={selected ? { borderColor: token.fillColor, background: `${token.fillColor}14` } : undefined}
                    onClick={() => setDepth(code)}
                  >
                    <span className={styles.depthDot} style={{ background: token.fillColor }} />
                    {t(token.labelKey)}
                  </button>
                );
              })}
            </div>

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
                <Camera size={15} strokeWidth={2} />
                {uploadingPhoto ? t('info.flood.photoUploading', '업로드 중...') : t('info.flood.addPhoto')}
              </button>
            )}

            <div className={styles.reportActions}>
              <button className={styles.reportCancel} onClick={() => setShowReport(false)} disabled={submitting}>
                {t('common.cancel', '취소')}
              </button>
              <button className={styles.reportSubmit} onClick={handleSubmitReport} disabled={!depth || submitting || !reportCoords}>
                {submitting ? t('info.flood.ctaSubmitting') : t('info.flood.ctaSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
