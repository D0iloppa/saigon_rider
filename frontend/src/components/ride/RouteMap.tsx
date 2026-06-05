import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { decodePolyline } from '@/lib/polyline';

interface RouteMapProps {
  origin: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number };
  /** Google encoded polyline (overview). 없으면 출발/도착 마커만 표시. */
  polyline?: string | null;
  className?: string;
}

// 무료·키 불필요 벡터 타일 스타일 (OpenFreeMap). 운영 안정화 시 self-host/MapTiler 키로 교체 가능.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const ROUTE_SOURCE = 'route';
const ROUTE_LAYER = 'route-line';
const ROUTE_CASING = 'route-casing';

/**
 * MapLibre GL + OpenFreeMap 벡터 타일 경로 지도 (SGR-269).
 * 줌·팬·회전·틸트 가능. 실시간 턴바이턴은 아님 — 경로선·출발/도착 마커 미리보기.
 */
export default function RouteMap({ origin, dest, polyline, className }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // 지도 1회 초기화.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [dest.lng, dest.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', () => { readyRef.current = true; });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      markersRef.current = [];
    };
    // 목적지는 마운트 시 고정 (한 카드 = 한 화면)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // origin/polyline 변동 시 경로선·마커 갱신.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // 기존 마커 제거
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // 도착 마커 🏁
      markersRef.current.push(
        new maplibregl.Marker({ element: pinEl('🏁') })
          .setLngLat([dest.lng, dest.lat])
          .addTo(map),
      );
      // 출발(내 위치) 마커 — 파란 점
      if (origin) {
        markersRef.current.push(
          new maplibregl.Marker({ element: dotEl() })
            .setLngLat([origin.lng, origin.lat])
            .addTo(map),
        );
      }

      const pts = polyline ? decodePolyline(polyline).map(([la, ln]) => [ln, la] as [number, number]) : [];
      const geo: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: pts },
      };
      const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geo);
      } else {
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data: geo });
        map.addLayer({
          id: ROUTE_CASING, type: 'line', source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#B82C08', 'line-width': 9, 'line-opacity': 0.35 },
        });
        map.addLayer({
          id: ROUTE_LAYER, type: 'line', source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FF5A1F', 'line-width': 5 },
        });
      }

      // 카메라 맞춤
      const fitPts = pts.length >= 2 ? pts : (origin ? [[origin.lng, origin.lat], [dest.lng, dest.lat]] : null);
      if (fitPts && fitPts.length >= 2) {
        const bounds = fitPts.reduce(
          (b, c) => b.extend(c as [number, number]),
          new maplibregl.LngLatBounds(fitPts[0] as [number, number], fitPts[0] as [number, number]),
        );
        map.fitBounds(bounds, { padding: { top: 120, bottom: 280, left: 50, right: 50 }, duration: 600 });
      }
    };

    if (readyRef.current) apply();
    else map.once('load', apply);
  }, [origin, dest, polyline]);

  return <div ref={containerRef} className={className} />;
}

/** 에셋 의존 없는 이모지 핀 마커 element. */
function pinEl(emoji: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:28px;line-height:1;transform:translateY(-6px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))';
  el.textContent = emoji;
  return el;
}

/** 파란 현재위치 점. */
function dotEl(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'width:18px;height:18px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.25),0 1px 3px rgba(0,0,0,.3)';
  return el;
}
