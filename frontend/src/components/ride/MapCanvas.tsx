import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import { RIDE_MAP_STYLE_URL } from '@/lib/rideMapPreload';
import styles from './MapCanvas.module.css';
import { decodePolyline, bearing } from '@/lib/polyline';

export interface MapCanvasHandle {
  /** 전체 경로가 보이도록 맞춤(개요). */
  overview: () => void;
  /** 출발점 기준 진행방향으로 spin + 강한 zoom(경로안내 시작 연출). 틸트 없음. */
  startGuidance: () => void;
  /** 현재 위치로 부드럽게 이동(줌 16 고정). 수동 '내 위치' 버튼용. */
  recenter: (pos: { lat: number; lng: number }) => void;
  /**
   * 현재 위치로 카메라만 따라감(줌 유지). 이동 추적용.
   * courseBearing(도)을 주면 그 방위가 위쪽이 되도록 함께 회전한다(course-up).
   * 사용자가 '북쪽 맞춤'을 누른 뒤에는 '내 위치'를 다시 누를 때까지 회전을 멈춘다.
   */
  follow: (pos: { lat: number; lng: number }, courseBearing?: number | null) => void;
  /** 북향으로 회전 리셋(course-up 해제). */
  resetNorth: () => void;
}

/** course-up 데드존 — 이 미만의 방위차는 무시(세그먼트 경계에서 지도가 떠는 것 방지). */
const COURSE_DEADZONE_DEG = 8;

interface MapCanvasProps {
  origin: { lat: number; lng: number } | null;
  /** 목적지/체크포인트. 거리(만보계) 퀘스트처럼 고정 목적지가 없으면 null. */
  dest?: { lat: number; lng: number } | null;
  polyline?: string | null;
  /** 실시간 현재 위치(있으면 파란 점 마커, heading 으로 회전). */
  current?: { lat: number; lng: number; heading?: number | null } | null;
  /** 실제 이동경로(서버 스트림 GPS 누적, 오래된→최신). 거리 퀘스트 궤적 표시용. */
  trail?: { lat: number; lng: number }[] | null;
  className?: string;
}

const ROUTE_SOURCE = 'route';
const TRAIL_SOURCE = 'trail';

/**
 * 공통 지도 캔버스 (MapLibre+OpenFreeMap). nav·quest 공용.
 * 카메라 제어는 ref(MapCanvasHandle)로 노출 — 화면이 시작/재중심/개요를 명령한다.
 */
const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { origin, dest, polyline, current, trail, className },
  ref,
) {
  const { t } = useTranslation();
  // 타일이 오기 전 빈 화면을 스피너로 덮는다(대표 지적 2026-08-06) — 느린 회선에서
  // "지도가 죽은 것처럼" 보이던 구간을 없앤다. 프리로딩은 lib/rideMapPreload.ts.
  const [mapLoading, setMapLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const curMarkerRef = useRef<maplibregl.Marker | null>(null);
  const trailFitDoneRef = useRef(false);
  // 안내 중 여부 — true 면 경로 갱신(이탈 재탐색 등)이 카메라를 개요로 되돌리지 않는다.
  const guidingRef = useRef(false);
  // 시작 연출(flyTo) 진행 중 — 이 구간엔 follow 가 카메라를 건드리지 않는다.
  const introRef = useRef(false);
  // course-up(진행방향 위쪽) 적용 여부 — '북쪽 맞춤'으로 끄고 '내 위치'로 다시 켠다.
  const courseUpRef = useRef(false);

  const routePts = (): [number, number][] =>
    polyline ? decodePolyline(polyline).map(([la, ln]) => [ln, la]) : [];

  // 카메라 맞춤용 좌표들 (경로 우선, 없으면 출발+목적지).
  const fitPoints = (): [number, number][] => {
    const pts = routePts();
    if (pts.length >= 2) return pts;
    const arr: [number, number][] = [];
    if (origin) arr.push([origin.lng, origin.lat]);
    if (dest) arr.push([dest.lng, dest.lat]);
    return arr;
  };
  const fallbackCenter = (): [number, number] =>
    dest ? [dest.lng, dest.lat] : origin ? [origin.lng, origin.lat] : [106.7, 10.77];

  // 시트(≈50vh)·상단 버튼을 피해 경로 전체가 보이도록 컨테이너 비율 패딩.
  const fitPadding = () => {
    const el = mapRef.current?.getContainer();
    const h = el?.clientHeight ?? 700;
    const w = el?.clientWidth ?? 390;
    return {
      top: Math.round(h * 0.2),
      bottom: Math.round(h * 0.62),
      left: Math.round(w * 0.16),
      right: Math.round(w * 0.16),
    };
  };

  // 카메라 명령 노출
  useImperativeHandle(ref, () => ({
    overview() {
      const map = mapRef.current;
      if (!map) return;
      guidingRef.current = false;
      courseUpRef.current = false; // 개요는 항상 북향
      const fit = fitPoints();
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      if (fit.length >= 2) {
        const b = fit.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(fit[0], fit[0]));
        map.fitBounds(b, { padding: fitPadding(), duration: 800 });
      } else {
        map.easeTo({ center: fallbackCenter(), zoom: 15, duration: 600 });
      }
    },
    startGuidance() {
      const map = mapRef.current;
      if (!map) return;
      const pts = routePts();
      const start: [number, number] | undefined = origin ? [origin.lng, origin.lat] : pts[0];
      if (!start) return;
      guidingRef.current = true;
      courseUpRef.current = true;
      // 진행 방위 = 시작점→다음 경로점(없으면 목적지)
      const next = pts.length >= 2 ? pts[1] : dest ? [dest.lng, dest.lat] : null;
      const brg = next ? bearing(start[1], start[0], next[1], next[0]) : 0;
      // 진행방향 회전(spin) + 강한 줌. 3D 틸트 없음(pitch 0).
      // 연출이 끝날 때까지 follow(easeTo) 를 막는다 — 안내 시작과 함께 GPS watch 가 켜지면서
      // 첫 좌표가 수백 ms 안에 들어오고, 그 easeTo 가 flyTo 를 취소해 연출이 사라졌다.
      introRef.current = true;
      map.flyTo({ center: start, zoom: 18.5, pitch: 0, bearing: brg, duration: 2200, essential: true });
      // 등록은 flyTo 이후 — flyTo 는 진행 중 애니메이션을 먼저 중단시키고 그 moveend 를 흘리므로,
      // 먼저 등록하면 직전 fitBounds 의 중단 이벤트로 즉시 해제돼 버린다.
      map.once('moveend', () => { introRef.current = false; });
    },
    recenter(pos) {
      courseUpRef.current = true; // '내 위치' 탭 = 추적 복귀(북쪽 맞춤으로 끈 회전도 되살린다)
      mapRef.current?.easeTo({ center: [pos.lng, pos.lat], zoom: 16, duration: 700 });
    },
    follow(pos, courseBearing) {
      const map = mapRef.current;
      if (!map || introRef.current) return;
      // center 와 bearing 을 한 번의 easeTo 로 — 나눠 호출하면 뒤 호출이 앞 애니메이션을 취소한다.
      const opts: Parameters<typeof map.easeTo>[0] = { center: [pos.lng, pos.lat], duration: 500 };
      if (courseBearing != null && courseUpRef.current) {
        const diff = Math.abs((((courseBearing - map.getBearing()) % 360 + 540) % 360) - 180);
        if (diff >= COURSE_DEADZONE_DEG) opts.bearing = courseBearing;
      }
      map.easeTo(opts);
    },
    resetNorth() {
      courseUpRef.current = false; // 사용자가 북향을 원함 — 다음 GPS 틱이 되돌리지 않게 회전 정지
      mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    },
  }));

  // 초기화
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: RIDE_MAP_STYLE_URL,
      center: fallbackCenter(),
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.on('load', () => { readyRef.current = true; setMapLoading(false); });
    // 스타일/타일을 못 받아도 스피너가 영구히 남지 않게 한다 — 실패는 지도 자체가 보여준다.
    map.on('error', () => setMapLoading(false));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      setMapLoading(true);
      markersRef.current = [];
      curMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 경로선 + 출발/도착 마커
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (dest) {
        markersRef.current.push(
          new maplibregl.Marker({ element: pinEl('dest') }).setLngLat([dest.lng, dest.lat]).addTo(map),
        );
      }
      if (origin) {
        markersRef.current.push(
          new maplibregl.Marker({ element: pinEl('origin') }).setLngLat([origin.lng, origin.lat]).addTo(map),
        );
      }
      const pts = routePts();
      const geo: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts },
      };
      const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geo);
      } else {
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: geo });
        map.addLayer({
          id: 'route-casing', type: 'line', source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#B82C08', 'line-width': 9, 'line-opacity': 0.35 },
        });
        map.addLayer({
          id: 'route-line', type: 'line', source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FF5A1F', 'line-width': 5 },
        });
      }
      // 초기 개요 — 안내 시작 후에는 생략한다. (이 effect 는 startGuidance() 의 flyTo 보다 뒤에
      // 커밋되므로, 가드가 없으면 회전+줌 연출이 매번 개요 fitBounds 로 덮여 사라진다.)
      if (guidingRef.current) return;
      const fit = fitPoints();
      if (fit.length >= 2) {
        const b = fit.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(fit[0], fit[0]));
        map.fitBounds(b, { padding: fitPadding(), duration: 600 });
      }
    };
    if (readyRef.current) apply();
    else map.once('load', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, dest, polyline]);

  // 실시간 현재 위치 마커 (회전 화살표)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !current) return;
    const set = () => {
      if (!curMarkerRef.current) {
        curMarkerRef.current = new maplibregl.Marker({ element: headingEl() }).setLngLat([current.lng, current.lat]).addTo(map);
      } else {
        curMarkerRef.current.setLngLat([current.lng, current.lat]);
      }
      const arrow = curMarkerRef.current.getElement().firstElementChild as HTMLElement | null;
      if (arrow && typeof current.heading === 'number') arrow.style.transform = `rotate(${current.heading}deg)`;
    };
    if (readyRef.current) set();
    else map.once('load', set);
  }, [current]);

  // 실제 이동경로(trail) — 서버 스트림 GPS 누적선. route(목적지 경로)와 구분되는 시안색.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const coords: [number, number][] = (trail ?? []).map((p) => [p.lng, p.lat]);
      const geo: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords },
      };
      const src = map.getSource(TRAIL_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geo);
      } else {
        map.addSource(TRAIL_SOURCE, { type: 'geojson', data: geo });
        map.addLayer({
          id: 'trail-line', type: 'line', source: TRAIL_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#00C2FF', 'line-width': 5, 'line-opacity': 0.9 },
        });
      }
      // 목적지 경로(route)·origin 이 없을 때(거리 퀘스트)만, 첫 좌표 확보 시 1회 트레일에 맞춤.
      if (!trailFitDoneRef.current && coords.length >= 1 && !polyline && !dest) {
        trailFitDoneRef.current = true;
        if (coords.length >= 2) {
          const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
          map.fitBounds(b, { padding: fitPadding(), duration: 600 });
        } else {
          map.easeTo({ center: coords[coords.length - 1], zoom: 16, duration: 600 });
        }
      }
    };
    if (readyRef.current) apply();
    else map.once('load', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trail]);

  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {mapLoading && (
        <div className={styles.loading}>
          <span className={styles.spinner} aria-hidden />
          <span>{t('map.loadingMap', { defaultValue: '지도를 불러오는 중…' })}</span>
        </div>
      )}
    </div>
  );
});

export default MapCanvas;

/** 지도 마커 (구 이모지 → SVG 칩: OS 무관 렌더). dest = 도착 깃발 칩, origin = 출발점 도트. */
function pinEl(kind: 'dest' | 'origin'): HTMLElement {
  const el = document.createElement('div');
  if (kind === 'origin') {
    el.style.cssText =
      'width:14px;height:14px;border-radius:50%;background:var(--ink-700,#1A1D2A);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)';
    return el;
  }
  el.style.cssText =
    'width:32px;height:32px;border-radius:50%;background:#fff;border:2px solid var(--brand-500,#FF5A1F);color:var(--brand-600,#ED4310);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.28)';
  el.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>';
  return el;
}

/** 파란 현재위치 dot + 살아있는 듯 깜빡이는 펄스 링(WAAPI, CSS 파일 불필요). */
function headingEl(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:22px;height:22px;position:relative';
  // firstElementChild = dot(회전 대상 유지). 방향 없는 trail 위치도 원형이라 시각 영향 없음.
  const dot = document.createElement('div');
  dot.style.cssText =
    'position:absolute;inset:0;width:22px;height:22px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);z-index:1;transition:transform .3s';
  const ring = document.createElement('div');
  ring.style.cssText =
    'position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#2563EB;z-index:0';
  wrap.appendChild(dot);
  wrap.appendChild(ring);
  ring.animate(
    [{ transform: 'scale(1)', opacity: 0.55 }, { transform: 'scale(2.8)', opacity: 0 }],
    { duration: 1600, iterations: Infinity, easing: 'ease-out' },
  );
  return wrap;
}
