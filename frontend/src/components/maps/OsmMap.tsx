import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const HCMC: [number, number] = [106.7009, 10.7769]; // [lng, lat] fallback

export interface OsmMarker {
  id: string;
  lat: number;
  lng: number;
  /** 마커 색 (탭별 구분). 기본 brand. */
  color?: string;
}

export interface OsmCountBadge {
  id: string | number;
  lat: number;
  lng: number;
  count: number;
  color?: string;
}

export interface Viewport {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

interface OsmMapProps {
  center: { lat: number; lng: number } | null;
  markers: OsmMarker[];
  /** 넓게 볼 때 집계 배지(개별 핀 대신). */
  countBadges?: OsmCountBadge[];
  myLocation?: { lat: number; lng: number } | null;
  /** 강조 표시할 마커 id (시트에서 선택된 항목). */
  selectedId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** 지도 이동/줌 종료 시 현재 보이는 영역·줌 통지. */
  onViewportChange?: (v: Viewport) => void;
  /** 지도 빈 곳 탭 시 좌표 통지(픽 모드). */
  onMapClick?: (lat: number, lng: number) => void;
  /** 픽 모드에서 선택된 지점 핀. */
  pickedPoint?: { lat: number; lng: number } | null;
  className?: string;
}

function dotEl(color: string, active: boolean): HTMLElement {
  const el = document.createElement('div');
  const size = active ? 20 : 13;
  el.style.cssText =
    `width:${size}px;height:${size}px;border-radius:50%;background:${color};` +
    `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;` +
    (active ? 'z-index:3;' : '');
  return el;
}

function badgeEl(count: number, color: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    `min-width:30px;height:30px;padding:0 9px;border-radius:999px;background:${color};color:#fff;` +
    'font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;' +
    'border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)';
  el.textContent = String(count);
  return el;
}

function pinEl(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
    'background:#ff3b30;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)';
  return el;
}

function meEl(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:18px;height:18px;position:relative';
  const ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;inset:-7px;border-radius:50%;background:rgba(59,130,246,.22)';
  const dot = document.createElement('div');
  dot.style.cssText =
    'position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)';
  wrap.append(ring, dot);
  return wrap;
}

/**
 * OpenStreetMap(OpenFreeMap 타일 · MapLibre GL) 풀스크린 지도.
 * 동네지도 v2 — 매물/피드 좌표를 점으로 표시, 점 탭 콜백 제공.
 * 출처표기(ODbL/OpenMapTiles)는 시트에 가려지지 않도록 top-right compact 로 둔다.
 */
export default function OsmMap({
  center,
  markers,
  countBadges,
  myLocation,
  selectedId,
  onMarkerClick,
  onViewportChange,
  onMapClick,
  pickedPoint,
  className,
}: OsmMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const badgesRef = useRef<maplibregl.Marker[]>([]);
  const meMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onClickRef = useRef(onMarkerClick);
  const onViewportRef = useRef(onViewportChange);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onClickRef.current = onMarkerClick;
    onViewportRef.current = onViewportChange;
    onMapClickRef.current = onMapClick;
  });

  // 지도 1회 생성
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: center ? [center.lng, center.lat] : HCMC,
      zoom: 14,
      attributionControl: false,
    });
    // 출처표기: 상태바·시트에 안 가리도록 좌하단 compact (ODbL/OpenMapTiles 가이드라인 준수)
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    const emitViewport = () => {
      const b = map.getBounds();
      onViewportRef.current?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
        zoom: map.getZoom(),
      });
    };
    map.on('load', () => {
      readyRef.current = true;
      emitViewport();
      // compact attribution 이 로드 시 펼쳐져 나오므로 접어서 ⓘ 만 노출(탭하면 펼침)
      map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    map.on('moveend', emitViewport);
    map.on('click', (e) => onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // center 변경 시 이동 (부모가 GPS/저장좌표로 한 번 세팅)
  useEffect(() => {
    if (mapRef.current && center) mapRef.current.easeTo({ center: [center.lng, center.lat], duration: 600 });
  }, [center]);

  // 마커 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = markers.map((mk) => {
      const el = dotEl(mk.color ?? '#ff6f3c', mk.id === selectedId);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClickRef.current?.(mk.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]).addTo(map);
    });
  }, [markers, selectedId]);

  // 집계 배지 (넓게 볼 때)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    badgesRef.current.forEach((m) => m.remove());
    badgesRef.current = (countBadges ?? []).map((b) =>
      new maplibregl.Marker({ element: badgeEl(b.count, b.color ?? '#ff6f3c') })
        .setLngLat([b.lng, b.lat])
        .addTo(map),
    );
  }, [countBadges]);

  // 픽 모드 선택 핀
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pinMarkerRef.current?.remove();
    pinMarkerRef.current = null;
    if (pickedPoint) {
      pinMarkerRef.current = new maplibregl.Marker({ element: pinEl(), anchor: 'bottom' })
        .setLngLat([pickedPoint.lng, pickedPoint.lat])
        .addTo(map);
    }
  }, [pickedPoint]);

  // 내 위치 마커
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    meMarkerRef.current?.remove();
    meMarkerRef.current = null;
    if (myLocation) {
      meMarkerRef.current = new maplibregl.Marker({ element: meEl() })
        .setLngLat([myLocation.lng, myLocation.lat])
        .addTo(map);
    }
  }, [myLocation]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
}
