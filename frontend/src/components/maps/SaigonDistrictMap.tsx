import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './SaigonDistrictMap.module.css';
import { HCMC_DISTRICTS, findNearestDistrict, type District } from './district-data';
import { native } from '@/lib/native';

export interface GasMarkerData {
  brand_code?: string | null;
  ref_price?: number | null;
  is_24h?: boolean;
  show_price?: boolean;
}

const VIEW_W = 400;
const VIEW_H = 280;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.5;
const LABEL_FONT_SCALE = 0.75;

type AggregatedType = 'gas' | 'repair' | 'flood' | 'custom';
const BADGE_COLOR: Record<AggregatedType, { fill: string; text: string }> = {
  gas: { fill: '#3B82F6', text: '#fff' },
  repair: { fill: '#F59E0B', text: '#fff' },
  flood: { fill: '#EF4444', text: '#fff' },
  custom: { fill: '#6B7280', text: '#fff' },
};

export interface MapMarker {
  type: 'me' | 'flood' | 'repair' | 'gas' | 'custom';
  lat: number;
  lng: number;
  label?: string;
  onClick?: () => void;
  data?: unknown;
}

export interface SaigonDistrictMapProps {
  highlightedDistricts?: string[];
  highlightColor?: string;
  dangerDistricts?: string[];
  markers?: MapMarker[];
  height?: number | string;
  showLabels?: boolean;
  showLegend?: boolean;
  background?: string;
  interactive?: boolean;
  onDistrictClick?: (district: District) => void;
  /** Zoom/pan 컨트롤 활성 (기본 true). 미니맵은 false 권장 */
  zoomable?: boolean;
  /** 지정 시 해당 district 폴리곤을 채우도록 자동 줌인. null/undefined 면 줌 리셋 */
  focusDistrictCode?: string | null;
  /** 지정 시 해당 구역에 단일 집계 뱃지(=마커 총수)만 표시. nearest-district 분산 안 함. */
  singleBadgeDistrictCode?: string | null;
  /**
   * 제공 시 '내 위치로' 컨트롤을 렌더한다. 실시간 GPS 조회 → HCMC 매핑 시 구역 code,
   * 실패/HCMC 밖이면 null 을 콜백으로 emit. 실제 focus·상태·default-도시 폴백은 부모 몫.
   */
  onLocate?: (code: string | null) => void;
  /** true & onLocate 존재 시 마운트 1회 자동으로 '내 위치로' 실행 (초기 진입 포커싱). */
  locateOnMount?: boolean;
  /** SVG 내부에 주입할 자식 (예: 침수 오버레이). pan/zoom viewBox 좌표계를 그대로 사용. */
  children?: ReactNode;
}

type DistrictVisualState = 'highlight' | 'danger' | 'special' | 'outer' | 'normal';

function getDistrictState(
  district: District,
  highlighted: Set<string>,
  danger: Set<string>,
): DistrictVisualState {
  // 영역 채우기/강조는 '선택(highlight)' 전용. 제보 지역(danger)은 영역을 칠하지 않고
  // 빨간 마커로만 표시한다 (선택과의 혼동 방지). danger 인자는 현재 미사용으로 유지(호환).
  void danger;
  if (highlighted.has(district.code)) return 'highlight';
  if (district.zone === 'outer') return 'outer';
  return 'normal';
}

function districtFill(state: DistrictVisualState, highlightColor: string): string {
  switch (state) {
    case 'highlight': return highlightColor;
    case 'danger': return '#FEE2E2';
    case 'special': return '#FFF3E8';
    case 'outer': return '#F0F0F0';
    default: return '#FFFFFF';
  }
}

function districtStroke(state: DistrictVisualState): string {
  switch (state) {
    case 'highlight':
    case 'special': return '#FF5A1F';
    case 'danger': return '#EF4444';
    case 'outer': return '#E0E0E0';
    default: return '#D1D5DB';
  }
}

function districtStrokeWidth(state: DistrictVisualState): number {
  switch (state) {
    case 'highlight': return 1.5;
    case 'danger': return 1.5;
    case 'special': return 1.8;
    case 'outer': return 0.8;
    default: return 1;
  }
}

function labelFill(state: DistrictVisualState): string {
  switch (state) {
    case 'highlight': return '#9A3412';
    case 'danger': return '#B91C1C';
    case 'special': return '#FF5A1F';
    case 'outer': return '#9CA3AF';
    default: return '#4B5563';
  }
}

function labelWeight(state: DistrictVisualState): number {
  return state === 'normal' || state === 'outer' ? 400 : 600;
}

/**
 * Saigon District Map — 168 district (주요 29) 행정구역 지도.
 * 시안: docs/saigon-map-v2-accurate.html · viewBox 0 0 400 280.
 */
export default function SaigonDistrictMap({
  highlightedDistricts = [],
  highlightColor = '#FFBB8A',
  dangerDistricts = [],
  markers = [],
  height = 320,
  showLabels = true,
  showLegend = false,
  background = '#EEF7F5',
  interactive = true,
  onDistrictClick,
  zoomable = true,
  focusDistrictCode,
  singleBadgeDistrictCode,
  onLocate,
  locateOnMount = false,
  children,
}: SaigonDistrictMapProps) {
  const { t } = useTranslation();
  const [legendOpen, setLegendOpen] = useState(false);
  // GPS 가 HCMC 밖일 때 표시할 내 좌표 (구역 선택 대신 좌표 라벨만 노출).
  const [outsideCoords, setOutsideCoords] = useState<{ lat: number; lng: number } | null>(null);
  // '내 위치로' 로 찾은 구역 (지도 내부에서 하이라이트). 페이지의 highlightedDistricts 와 합집합.
  const [locatedCode, setLocatedCode] = useState<string | null>(null);
  const highlightedSet = useMemo(() => {
    const s = new Set(highlightedDistricts);
    if (locatedCode) s.add(locatedCode);
    // 포커스된 구역도 강조 집합에 포함 → focusDistrictCode 만 넘긴 페이지(침수 등)도
    // 메인과 동일하게 선택 구역 강조 + 비선택 라벨 축소/흐림(hasFocus) 적용.
    if (focusDistrictCode) s.add(focusDistrictCode);
    return s;
  }, [highlightedDistricts, locatedCode, focusDistrictCode]);
  const dangerSet = useMemo(() => new Set(dangerDistricts), [dangerDistricts]);

  // 'me' 마커는 집계 대상에서 제외 (단일 위치 마커이므로 그대로 표시).
  const meMarkers = useMemo(() => {
    return markers
      .filter((m) => m.type === 'me')
      .map((m) => {
        const nearest = findNearestDistrict(m.lat, m.lng);
        const pos = nearest ? { x: nearest.label.x, y: nearest.label.y } : { x: 200, y: 140 };
        return { ...m, svg: pos };
      });
  }, [markers]);

  // 그 외 마커는 (district × type) 으로 집계해 1배지/그룹으로 표시.
  const aggregatedBadges = useMemo(() => {
    const nonMe = markers.filter((m) => m.type !== 'me');
    // singleBadge 모드: 선택 구역에 마커 총수 뱃지 하나만 (nearest 분산 안 함 → 리스트 수와 일치).
    if (singleBadgeDistrictCode) {
      if (nonMe.length === 0) return [];
      const d = HCMC_DISTRICTS.find((x) => x.code === singleBadgeDistrictCode);
      if (!d) return [];
      return [{
        districtCode: d.code,
        type: nonMe[0].type as AggregatedType,
        count: nonMe.length,
        pos: { x: d.label.x, y: d.label.y },
      }];
    }
    const groups = new Map<string, {
      districtCode: string;
      type: AggregatedType;
      count: number;
      pos: { x: number; y: number };
    }>();
    for (const m of markers) {
      if (m.type === 'me') continue;
      const nearest = findNearestDistrict(m.lat, m.lng);
      if (!nearest) continue;
      const key = `${nearest.code}|${m.type}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        groups.set(key, {
          districtCode: nearest.code,
          type: m.type as AggregatedType,
          count: 1,
          pos: { x: nearest.label.x, y: nearest.label.y },
        });
      }
    }
    return Array.from(groups.values());
  }, [markers, singleBadgeDistrictCode]);

  // ── Zoom / Pan state ──
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panStartX: number;
    panStartY: number;
    moved: boolean;
  } | null>(null);
  // 멀티터치 핀치: 두 포인터의 client 좌표 보관
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startZoom: number; startPan: { x: number; y: number } } | null>(null);
  const wasGesture = useRef(false);

  const viewW = VIEW_W / zoom;
  const viewH = VIEW_H / zoom;

  const clampPan = useCallback((px: number, py: number, z: number) => {
    const maxX = Math.max(0, VIEW_W - VIEW_W / z);
    const maxY = Math.max(0, VIEW_H - VIEW_H / z);
    return {
      x: Math.max(0, Math.min(maxX, px)),
      y: Math.max(0, Math.min(maxY, py)),
    };
  }, []);

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      const centerX = pan.x + VIEW_W / zoom / 2;
      const centerY = pan.y + VIEW_H / zoom / 2;
      const newPan = clampPan(centerX - VIEW_W / z / 2, centerY - VIEW_H / z / 2, z);
      setZoom(z);
      setPan(newPan);
    },
    [pan, zoom, clampPan],
  );

  const focusOnDistrict = useCallback((code: string | null) => {
    if (!code) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const d = HCMC_DISTRICTS.find((x) => x.code === code);
    if (!d) return;
    const pts = d.polygon
      .trim()
      .split(/\s+/)
      .map((p) => p.split(',').map(Number))
      .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    // 폴리곤이 화면의 ~60% 차지하도록 zoom 계산
    const targetZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.min((VIEW_W / bboxW) * 0.6, (VIEW_H / bboxH) * 0.6)),
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const newPan = clampPan(cx - VIEW_W / targetZoom / 2, cy - VIEW_H / targetZoom / 2, targetZoom);
    setZoom(targetZoom);
    setPan(newPan);
  }, [clampPan]);

  useEffect(() => {
    focusOnDistrict(focusDistrictCode ?? null);
  }, [focusDistrictCode, focusOnDistrict]);

  // '내 위치로': 모든 interactive 지도에 내장. 실시간 GPS →
  //  · HCMC 안: 해당 구역으로 지도 자체 줌 + 하이라이트 (페이지 무관 통일 동작)
  //  · HCMC 밖: 구역 스냅 없이 내 좌표 라벨만, 전체 지도 유지
  // onLocate(code|null) 는 페이지가 추가로 반응(선택 상태·default 도시 폴백)하도록 선택적 emit.
  const runLocate = useCallback(async (): Promise<void> => {
    try {
      const pos = await native.getLocation();
      const inHcmc =
        pos.lat >= 10.40 && pos.lat <= 11.10 && pos.lng >= 106.40 && pos.lng <= 107.00;
      if (inHcmc) {
        const code = findNearestDistrict(pos.lat, pos.lng)?.code ?? null;
        setOutsideCoords(null);
        setLocatedCode(code);
        if (code) focusOnDistrict(code);
        onLocate?.(code);
      } else {
        setLocatedCode(null);
        setOutsideCoords({ lat: pos.lat, lng: pos.lng });
        focusOnDistrict(null);
        onLocate?.(null);
      }
    } catch {
      setOutsideCoords(null);
      onLocate?.(null);
    }
  }, [onLocate, focusOnDistrict]);

  const didLocateOnMount = useRef(false);
  useEffect(() => {
    if (!locateOnMount || didLocateOnMount.current) return;
    didLocateOnMount.current = true;
    void runLocate();
  }, [locateOnMount, runLocate]);

  const pointerDistance = () => {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!zoomable) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // 핀치 시작
      pinchRef.current = {
        startDist: pointerDistance(),
        startZoom: zoom,
        startPan: { ...pan },
      };
      dragRef.current = null;
      wasGesture.current = true;
      return;
    }

    if (zoom > 1) {
      // 1포인터 드래그 pan
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        panStartX: pan.x,
        panStartY: pan.y,
        moved: false,
      };
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 핀치 진행
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const dist = pointerDistance();
      if (pinchRef.current.startDist > 0) {
        const ratio = dist / pinchRef.current.startDist;
        const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchRef.current.startZoom * ratio));
        const startZ = pinchRef.current.startZoom;
        const startP = pinchRef.current.startPan;
        const centerX = startP.x + VIEW_W / startZ / 2;
        const centerY = startP.y + VIEW_H / startZ / 2;
        setZoom(targetZoom);
        setPan(clampPan(centerX - VIEW_W / targetZoom / 2, centerY - VIEW_H / targetZoom / 2, targetZoom));
      }
      return;
    }

    // 1포인터 pan
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = viewW / rect.width;
    const scaleY = viewH / rect.height;
    const dx = (e.clientX - d.startX) * scaleX;
    const dy = (e.clientY - d.startY) * scaleY;
    if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
    setPan(clampPan(d.panStartX - dx, d.panStartY - dy, zoom));
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      // 한 프레임 뒤 gesture 플래그 리셋 (직후 click 무시용)
      setTimeout(() => { wasGesture.current = false; }, 0);
    }
    const d = dragRef.current;
    if (d && d.pointerId === e.pointerId) dragRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const wasDragged = () => dragRef.current?.moved === true || wasGesture.current;

  return (
    <div
      className={styles.mapContainer}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        background,
      }}
    >
      <svg
        viewBox={`${pan.x} ${pan.y} ${viewW} ${viewH}`}
        xmlns="http://www.w3.org/2000/svg"
        xmlLang="vi"
        className={styles.mapSvg}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: zoomable && zoom > 1 ? (dragRef.current ? 'grabbing' : 'grab') : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <filter id="srMapPinShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
          </filter>
        </defs>

        <rect width="400" height="280" fill={background} />

        {/* 주요 도로 */}
        <line x1="262" y1="92" x2="335" y2="62" stroke="#C8C8C8" strokeWidth="1.8" opacity="0.65" />
        <line x1="195" y1="68" x2="295" y2="58" stroke="#C8C8C8" strokeWidth="1.8" opacity="0.65" />
        <line x1="130" y1="185" x2="238" y2="188" stroke="#C8C8C8" strokeWidth="1.5" opacity="0.6" />

        {/* 사이공 강 */}
        <path
          d="M 262,88 C 268,106 272,122 268,142 C 262,160 258,177 252,196 C 245,215 238,232 232,248"
          fill="none" stroke="#6ED8D0" strokeWidth="16" strokeLinecap="round" opacity="0.7"
        />
        <path
          d="M 262,88 C 268,106 272,122 268,142 C 262,160 258,177 252,196 C 245,215 238,232 232,248"
          fill="none" stroke="#A8EAE6" strokeWidth="7" strokeLinecap="round" opacity="0.45"
        />
        <path
          d="M 158,175 C 168,182 178,188 185,195"
          fill="none" stroke="#6ED8D0" strokeWidth="5" strokeLinecap="round" opacity="0.4"
        />
        <ellipse cx="232" cy="258" rx="18" ry="9" fill="#6ED8D0" opacity="0.25" />

        {/* district 폴리곤 + 라벨 */}
        {(() => {
          const hasFocus = highlightedSet.size > 0;
          // 선택/위험/특수 구역을 뒤에 그려 최상단에 오도록 정렬
          const ordered = [...HCMC_DISTRICTS].sort((a, b) => {
            const rank = (d: District) => {
              const s = getDistrictState(d, highlightedSet, dangerSet);
              if (s === 'highlight' || s === 'danger') return 2;
              if (s === 'special') return 1;
              return 0;
            };
            return rank(a) - rank(b);
          });
          return ordered.map((d) => {
          const state = getDistrictState(d, highlightedSet, dangerSet);
          const isSpecial = state === 'special';
          // 선택/위험/특수 외 라벨은 focus 상태에서 축소·반투명 처리해 겹침 완화
          const isFocused = state === 'highlight' || state === 'danger' || state === 'special';
          const labelScale = hasFocus && !isFocused ? 0.5 : 1;
          const labelOpacity = hasFocus && !isFocused ? 0.3 : 1;
          return (
            <g
              key={d.code}
              style={{
                cursor: interactive && onDistrictClick ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (wasDragged()) return;
                if (interactive) onDistrictClick?.(d);
              }}
            >
              <polygon
                points={d.polygon}
                fill={districtFill(state, highlightColor)}
                stroke={districtStroke(state)}
                strokeWidth={districtStrokeWidth(state)}
                strokeDasharray={isSpecial ? '3,2' : undefined}
              />
              {showLabels && (
                <text
                  x={d.label.x}
                  y={d.label.y}
                  fontFamily="'Noto Sans', sans-serif"
                  fontSize={d.label.fontSize * labelScale * LABEL_FONT_SCALE}
                  fontWeight={labelWeight(state)}
                  fill={labelFill(state)}
                  opacity={labelOpacity}
                  textAnchor="middle"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {d.label.text ?? d.nameVi}
                </text>
              )}
            </g>
          );
          });
        })()}

        {/* 다리 마커 */}
        {showLabels && (
          <g style={{ pointerEvents: 'none' }}>
            <text x="258" y="112" fontSize="9" textAnchor="middle">▲</text>
            <text x="272" y="110" fontFamily="'Noto Sans', sans-serif" fontSize="5" fill="#6B7280">Cầu Sài Gòn</text>
            <text x="248" y="165" fontSize="9" textAnchor="middle">▲</text>
            <text x="262" y="163" fontFamily="'Noto Sans', sans-serif" fontSize="5" fill="#6B7280">Cầu Phú Mỹ</text>
            <text x="242" y="135" fontSize="9" textAnchor="middle">▲</text>
            <text x="248" y="133" fontFamily="'Noto Sans', sans-serif" fontSize="5" fill="#6B7280">Thủ Thiêm</text>
          </g>
        )}

        {/* 사용자 위치 마커 ('me') — 집계 대상 아님 */}
        {meMarkers.map((m, i) => (
          <g
            key={`me-${i}`}
            transform={`translate(${m.svg.x}, ${m.svg.y}) scale(${1 / zoom})`}
            style={{ cursor: interactive && m.onClick ? 'pointer' : 'default' }}
            onClick={() => {
              if (wasDragged()) return;
              if (interactive) m.onClick?.();
            }}
          >
            <circle r="8" fill="#FF5A1F" stroke="#fff" strokeWidth="2" filter="url(#srMapPinShadow)" />
            <circle r="3" fill="#fff" />
            {m.label && (
              <text y="-12" fontSize="7" fontWeight={700} fill="#FF5A1F" textAnchor="middle">
                {m.label}
              </text>
            )}
          </g>
        ))}

        {/* District 집계 배지 — (district × type) 그룹 1개당 1배지 */}
        {aggregatedBadges.map((b) => {
          const color = BADGE_COLOR[b.type];
          return (
            <g
              key={`${b.districtCode}-${b.type}`}
              transform={`translate(${b.pos.x}, ${b.pos.y}) scale(${1 / zoom})`}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onClick={() => {
                if (wasDragged()) return;
                if (!interactive) return;
                focusOnDistrict(b.districtCode);
              }}
            >
              <circle r="9" fill={color.fill} stroke="#fff" strokeWidth="2" filter="url(#srMapPinShadow)" />
              <text
                fontSize="10"
                fontWeight={700}
                fill={color.text}
                textAnchor="middle"
                dy="3.5"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {b.count}
              </text>
            </g>
          );
        })}

        {children}
      </svg>

      {outsideCoords && (
        <div className={styles.coordLabel}>
          📍 {outsideCoords.lat.toFixed(4)}, {outsideCoords.lng.toFixed(4)} · {t('map.outsideArea')}
        </div>
      )}

      {zoomable && (
        <div className={styles.zoomControls}>
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label={t('map.locate')}
            onClick={() => { void runLocate(); }}
          >
            ◎
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label={t('map.zoomIn')}
            onClick={() => applyZoom(zoom * ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
          >
            +
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label={t('map.zoomOut')}
            onClick={() => applyZoom(zoom / ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
          >
            −
          </button>
        </div>
      )}

      {showLegend && (
        <div className={styles.legendWrap}>
          <button
            type="button"
            className={styles.legendToggle}
            aria-label={t('map.toggleLegend')}
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((v) => !v)}
          >
            {legendOpen ? '×' : 'i'}
          </button>
          {legendOpen && (
            <div className={styles.legend} role="region" aria-label={t('map.legendTitle')}>
              <div className={styles.legendTitle}>{t('map.legendTitle')}</div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#FFBB8A', border: '1.5px solid #FF5A1F' }} />
                {t('map.legend.me')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: '#FEE2E2', border: '1.5px solid #EF4444' }} />
                {t('map.legend.flood')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendCircle} style={{ background: '#F59E0B' }} />
                {t('map.legend.repair')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendCircle} style={{ background: '#3B82F6' }} />
                {t('map.legend.gas')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendLine} /> {t('map.legend.road')}
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendIcon}>▲</span> {t('map.legend.bridge')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
