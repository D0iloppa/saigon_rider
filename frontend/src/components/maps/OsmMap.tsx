import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { HCMC_DISPLAY_CENTER } from '@/lib/mapDefaults';
import styles from './OsmMap.module.css';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
const HCMC: [number, number] = [HCMC_DISPLAY_CENTER.lng, HCMC_DISPLAY_CENTER.lat]; // [lng, lat] fallback

export interface OsmMarker {
  id: string;
  lat: number;
  lng: number;
  /** 마커 색 (탭별 구분). 기본 brand. 아바타 핀에서는 폴백 배경색. */
  color?: string;
  /** 있으면 아바타 teardrop 핀으로 렌더(사람 마커). 없으면 기존 단색 dot. */
  avatarUrl?: string;
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

/** 부모(LiveLocationModal 등)가 지도를 직접 조작하기 위한 imperative API. */
export interface OsmMapHandle {
  /** 주어진 좌표로 리센터. */
  recenter: (lat: number, lng: number, zoom?: number) => void;
  /** 주어진 좌표들이 모두 보이는 최소 줌으로 맞춤(1개뿐이면 recenter 로 대체). */
  fitToPoints: (points: { lat: number; lng: number }[]) => void;
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

/** 아바타를 담은 teardrop 핀(공유위치 참가자용). 이미지 로드 실패 시 폴백 색 배경만 남는다. */
function avatarPinEl(color: string, active: boolean, avatarUrl: string): HTMLElement {
  const size = active ? 40 : 34;
  const el = document.createElement('div');
  el.style.cssText =
    `width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);` +
    `background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer;` +
    'display:flex;align-items:center;justify-content:center;overflow:hidden;' +
    (active ? 'z-index:3;' : '');
  const inner = size - 8;
  const img = document.createElement('img');
  img.src = avatarUrl;
  img.alt = '';
  // 핀이 -45deg 회전돼 있으므로 안의 아바타는 +45deg 로 되돌려 똑바로 보이게 한다.
  img.style.cssText = `width:${inner}px;height:${inner}px;border-radius:50%;object-fit:cover;display:block;transform:rotate(45deg)`;
  img.onerror = () => img.remove();
  el.append(img);
  return el;
}

function dotEl(color: string, active: boolean, avatarUrl?: string): HTMLElement {
  if (avatarUrl) return avatarPinEl(color, active, avatarUrl);
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
  ring.className = styles.meRing;
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
const OsmMap = forwardRef<OsmMapHandle, OsmMapProps>(function OsmMap({
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
}, ref) {
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
      const el = dotEl(mk.color ?? '#ff6f3c', mk.id === selectedId, mk.avatarUrl);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClickRef.current?.(mk.id);
      });
      // teardrop 핀은 뾰족한 끝이 좌표를 가리켜야 한다(pickedPoint 핀과 동일).
      return new maplibregl.Marker({ element: el, anchor: mk.avatarUrl ? 'bottom' : 'center' })
        .setLngLat([mk.lng, mk.lat])
        .addTo(map);
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

  // 부모 조작용 imperative API — 리센터 / 참가자 전체보기(LiveLocationModal 버튼).
  useImperativeHandle(ref, () => ({
    recenter: (lat, lng, zoom) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [lng, lat], zoom: zoom ?? 15, duration: 600 });
    },
    fitToPoints: (points) => {
      const map = mapRef.current;
      if (!map || points.length === 0) return;
      if (points.length === 1) {
        map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 15, duration: 600 });
        return;
      }
      const bounds = points.reduce(
        (b, p) => b.extend([p.lng, p.lat]),
        new maplibregl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]),
      );
      map.fitBounds(bounds, { padding: 60, duration: 600 });
    },
  }), []);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
});

export default OsmMap;
