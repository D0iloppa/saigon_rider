import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { decodePolyline, bearing } from '@/lib/polyline';

export interface MapCanvasHandle {
  /** 전체 경로가 보이도록 맞춤(개요). */
  overview: () => void;
  /** 출발점 기준 진행방향으로 spin + 강한 zoom(경로안내 시작 연출). 틸트 없음. */
  startGuidance: () => void;
  /** 현재 위치로 부드럽게 이동. */
  recenter: (pos: { lat: number; lng: number }) => void;
  /** 북향으로 회전 리셋. */
  resetNorth: () => void;
}

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

const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const curMarkerRef = useRef<maplibregl.Marker | null>(null);
  const trailFitDoneRef = useRef(false);

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
      // 진행 방위 = 시작점→다음 경로점(없으면 목적지)
      const next = pts.length >= 2 ? pts[1] : dest ? [dest.lng, dest.lat] : null;
      const brg = next ? bearing(start[1], start[0], next[1], next[0]) : 0;
      // 진행방향 회전(spin) + 강한 줌. 3D 틸트 없음(pitch 0).
      map.flyTo({ center: start, zoom: 18.5, pitch: 0, bearing: brg, duration: 2200, essential: true });
    },
    recenter(pos) {
      mapRef.current?.easeTo({ center: [pos.lng, pos.lat], zoom: 16, duration: 700 });
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
      style: STYLE_URL,
      center: fallbackCenter(),
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.on('load', () => { readyRef.current = true; });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
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
          new maplibregl.Marker({ element: pinEl('🏁') }).setLngLat([dest.lng, dest.lat]).addTo(map),
        );
      }
      if (origin) {
        markersRef.current.push(
          new maplibregl.Marker({ element: pinEl('📍') }).setLngLat([origin.lng, origin.lat]).addTo(map),
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
      // 초기 개요
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

  return <div ref={containerRef} className={className} />;
});

export default MapCanvas;

function pinEl(emoji: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:28px;line-height:1;transform:translateY(-6px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))';
  el.textContent = emoji;
  return el;
}

/** 파란 현재위치 + 방향 화살표(자식 요소를 heading 으로 회전). */
function headingEl(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:22px;height:22px;position:relative';
  const arrow = document.createElement('div');
  arrow.style.cssText =
    'width:22px;height:22px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 0 0 5px rgba(37,99,235,.25),0 1px 3px rgba(0,0,0,.3);transition:transform .3s';
  wrap.appendChild(arrow);
  return wrap;
}
