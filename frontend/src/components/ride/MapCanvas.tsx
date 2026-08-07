import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTranslation } from 'react-i18next';
import { RIDE_MAP_STYLE_URL } from '@/lib/rideMapPreload';
import styles from './MapCanvas.module.css';
import { decodePolyline, bearing } from '@/lib/polyline';
import { RIDER_MARKER_PX, RIDER_MARKER_SVG } from './riderMarkerIcon';

export interface MapCanvasHandle {
  /** 전체 경로가 보이도록 맞춤(개요). */
  overview: () => void;
  /** 출발점 기준 진행방향으로 spin + 강한 zoom(경로안내 시작 연출). 틸트 없음. */
  startGuidance: () => void;
  /** 현재 위치로 부드럽게 이동(줌 16 고정). 수동 '내 위치' 버튼용. */
  recenter: (pos: { lat: number; lng: number }) => void;
  /**
   * 현재 위치로 카메라만 따라감(줌 유지). 이동 추적용.
   * courseBearing(도)을 주면 그 방위가 위쪽이 되도록 함께 회전한다(course-up) — null/undefined 면
   * 회전은 건드리지 않는다. "언제 course-up 을 적용할지"는 이제 호출부(MapControls, W17)의
   * 3상태(자유/카메라추종/course-up추종) 판단이다 — 이 메서드는 그 판단을 받아 그대로 실행만 한다.
   */
  follow: (pos: { lat: number; lng: number }, courseBearing?: number | null) => void;
  /** 북향으로 회전 리셋. */
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
  /**
   * 회전(bearing) 변화 통지(W17) — MapControls 의 북향복귀 버튼(bearing!==0 일 때만 노출)과 그
   * 아이콘 회전(rotate(-bearing))이 이 값을 쓴다. rotate 이벤트는 애니메이션 중 프레임마다
   * 발화해 그대로 리렌더에 흘리면 course-up 추종·수동 회전 도중 상위가 매 프레임 리렌더된다 —
   * 정수 도(°) 단위로 양자화하고 직전 값과 같으면 호출하지 않는다(북향 버튼 표시/아이콘 회전
   * 어느 쪽도 1° 미만 정밀도가 필요 없어 시각적으로 손실이 없다).
   */
  onBearingChange?: (bearingDeg: number) => void;
  /**
   * 사용자 제스처(팬/줌/회전) 시작 통지(W17) — MapControls 가 카메라추종/course-up추종을 'free' 로
   * 내리는 트리거. MapLibre 의 dragstart/zoomstart/rotatestart 는 easeTo/flyTo 같은 프로그램적
   * 이동에도 발화하므로, originalEvent(실제 포인터/휠 이벤트)가 있는 경우만 통지한다.
   */
  onGestureStart?: () => void;
}

const ROUTE_SOURCE = 'route';
const TRAIL_SOURCE = 'trail';

/**
 * 공통 지도 캔버스 (MapLibre+OpenFreeMap). nav·quest 공용.
 * 카메라 제어는 ref(MapCanvasHandle)로 노출 — 화면이 시작/재중심/개요를 명령한다.
 */
const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { origin, dest, polyline, current, trail, className, onBearingChange, onGestureStart },
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
  // 마지막으로 알려진 유효 heading(진북 기준 도). 정지 중이거나 GPS 가 heading 을 안 주는 틱에는
  // 이 값을 유지한다(대표 확정) — 방향을 0 으로 되돌리면 멈출 때마다 오토바이가 북쪽으로 홱 돈다.
  // null 인 동안(= 아직 한 번도 방향을 모름)에는 오토바이를 아예 띄우지 않는다. 아래 마커 effect 참조.
  const lastHeadingRef = useRef<number | null>(null);
  const trailFitDoneRef = useRef(false);
  // 안내 중 여부 — true 면 경로 갱신(이탈 재탐색 등)이 카메라를 개요로 되돌리지 않는다.
  const guidingRef = useRef(false);
  // 시작 연출(flyTo) 진행 중 — 이 구간엔 follow 가 카메라를 건드리지 않는다.
  const introRef = useRef(false);
  // onBearingChange/onGestureStart 최신값을 latest-ref 로 — map.on() 구독은 마운트 이펙트(빈 deps)
  // 안에서 1회만 걸고, 콜백 identity 변경마다 재구독하지 않는다(SaigonMapV5 의 onViewportChangeRef
  // 와 동일 패턴).
  const onBearingChangeRef = useRef(onBearingChange);
  onBearingChangeRef.current = onBearingChange;
  const onGestureStartRef = useRef(onGestureStart);
  onGestureStartRef.current = onGestureStart;
  const lastEmittedBearingRef = useRef(0);

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
      mapRef.current?.easeTo({ center: [pos.lng, pos.lat], zoom: 16, duration: 700 });
    },
    follow(pos, courseBearing) {
      const map = mapRef.current;
      if (!map || introRef.current) return;
      // center 와 bearing 을 한 번의 easeTo 로 — 나눠 호출하면 뒤 호출이 앞 애니메이션을 취소한다.
      // courseBearing 을 적용할지(=course-up 3단째인지)는 호출부(MapControls)가 이미 판단해
      // null/값으로 넘긴다 — 여기서는 값이 있을 때만 데드존을 걸고 그대로 반영한다.
      const opts: Parameters<typeof map.easeTo>[0] = { center: [pos.lng, pos.lat], duration: 500 };
      if (courseBearing != null) {
        const diff = Math.abs((((courseBearing - map.getBearing()) % 360 + 540) % 360) - 180);
        if (diff >= COURSE_DEADZONE_DEG) opts.bearing = courseBearing;
      }
      map.easeTo(opts);
    },
    resetNorth() {
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
    // 회전 통지 — 정수 도 단위로 양자화 후 직전 값과 다를 때만 올린다(위 onBearingChange 주석).
    map.on('rotate', () => {
      const deg = Math.round(((map.getBearing() % 360) + 360) % 360);
      if (deg === lastEmittedBearingRef.current) return;
      lastEmittedBearingRef.current = deg;
      onBearingChangeRef.current?.(deg);
    });
    // 사용자 제스처 통지 — originalEvent 가 있는 경우만(easeTo/flyTo 등 프로그램적 이동은 없음).
    const onGesture = (e: { originalEvent?: unknown }) => { if (e.originalEvent) onGestureStartRef.current?.(); };
    map.on('dragstart', onGesture);
    map.on('zoomstart', onGesture);
    map.on('rotatestart', onGesture);
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

  // 실시간 현재 위치 마커 — 방향을 알기 전엔 파란 dot, 알고 나면 위에서 본 오토바이(W18).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !current) return;
    const set = () => {
      if (!curMarkerRef.current) {
        // rotationAlignment:'map' — 마커 회전 기준을 "지도"로 잡는다. 기본값(viewport)이면 지도가
        // heading 만큼 돌아가는 course-up 에서 아이콘에 heading 을 그대로 적용할 때 회전이 이중
        // 계산돼 방향이 거짓이 된다. 'map' 이면 MapLibre 가 현재 bearing 을 빼서 그려주므로
        // (rotateZ(rotation - bearing)) 북향·course-up·수동 회전 어느 상태에서도 진북 기준 heading
        // 하나만 넘기면 맞는다. 'heading - bearing' 을 직접 계산하는 대안(동네지도 방식)은 회전
        // 애니메이션 프레임마다 우리가 다시 계산해 넣어야 해서 여기선 택하지 않았다.
        curMarkerRef.current = new maplibregl.Marker({ element: headingEl(), rotationAlignment: 'map' })
          .setLngLat([current.lng, current.lat])
          .addTo(map);
      } else {
        curMarkerRef.current.setLngLat([current.lng, current.lat]);
      }
      const h =
        typeof current.heading === 'number' && Number.isFinite(current.heading)
          ? current.heading
          : lastHeadingRef.current;
      // 첫 유효 heading 이 오기 전에는 dot 을 그대로 둔다 — 방향을 모르는데 오토바이를 북쪽으로
      // 세워두면 그건 "정보 없음"이 아니라 거짓 방향이다. 첫 값이 오는 순간 dot → 오토바이로 바꾼다.
      if (h == null) return;
      lastHeadingRef.current = h;
      curMarkerRef.current.setRotation(h);
      showRider(curMarkerRef.current.getElement());
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

/**
 * 현재위치 마커 — 펄스 링 + (방향 미상)파란 dot + (숨김)오토바이 실루엣.
 * 마커 전체를 MapLibre 가 회전시키므로(rotationAlignment:'map') 여기서 transform 을 걸지 않는다.
 * 링·dot 은 원형이라 회전해도 시각 영향이 없다.
 */
function headingEl(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${RIDER_MARKER_PX}px;height:${RIDER_MARKER_PX}px;position:relative`;
  const dot = document.createElement('div');
  dot.dataset.part = 'dot';
  dot.style.cssText =
    'position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);z-index:1';
  const ring = document.createElement('div');
  ring.style.cssText =
    'position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#2563EB;z-index:0';
  const rider = document.createElement('div');
  rider.dataset.part = 'rider';
  rider.style.cssText = 'position:absolute;inset:0;display:none;z-index:2';
  rider.innerHTML = RIDER_MARKER_SVG;
  wrap.appendChild(dot);
  wrap.appendChild(ring);
  wrap.appendChild(rider);
  ring.animate(
    [{ transform: 'scale(1)', opacity: 0.55 }, { transform: 'scale(2.8)', opacity: 0 }],
    { duration: 1600, iterations: Infinity, easing: 'ease-out' },
  );
  return wrap;
}

/** 첫 유효 heading 확보 시 dot → 오토바이로 전환(되돌리지 않는다 — 마지막 방향을 유지하므로). */
function showRider(wrap: HTMLElement): void {
  const dot = wrap.querySelector<HTMLElement>('[data-part="dot"]');
  const rider = wrap.querySelector<HTMLElement>('[data-part="rider"]');
  if (dot) dot.style.display = 'none';
  if (rider) rider.style.display = 'block';
}
