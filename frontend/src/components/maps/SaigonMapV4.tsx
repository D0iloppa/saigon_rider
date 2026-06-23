import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as PE } from 'react';
import { native } from '@/lib/native';
import depth1 from './v2/saigon-depth1.json';
import type { MapMarkerV2, SelectedRegion } from './v2/region';
import styles from './SaigonMapV4.module.css';

/**
 * Saigon Map v4 — 동네지도 전용.
 * - GPS 기준 ward 자동 진입 (depth2 블록 뷰)
 * - depth3 전체 오버레이 (블록 경계 내 건물/도로/수로)
 * - 블록 탭 → 선택 하이라이트 + 나머지 dim (drill-down 없음)
 * - 줌/팬만 활성화, depth 전환 없음
 */

interface Bbox { S: number; W: number; N: number; E: number }
interface Box { VW: number; VH: number; bbox: Bbox; border: string }
interface Depth2Data extends Box { blocks: { p: string; cx: number; cy: number }[] }
interface Depth3Data extends Box { roads: { p: string; c: string; w: number }[]; bldg: string[]; water: string[]; wline: string[] }
interface VB { x: number; y: number; w: number; h: number }

const MIN_ZOOM = 0.05;
const TOAST_MS = 2400;
const ASSET_BASE = `${import.meta.env.BASE_URL}maps/v2/`;
const D1_BBOX = depth1.bbox as Bbox;
const DEFAULT_SLUG = 'ben-thanh';

const parsePts = (s: string): [number, number][] =>
  s.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);

function pointInPoly(x: number, y: number, polyStr: string): boolean {
  const pts = parsePts(polyStr);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function buildWardRegion(idx: number): SelectedRegion {
  const w = depth1.wards[idx];
  const poly = parsePts(w.p).map(([x, y]) => ({
    lat: D1_BBOX.N - (y / depth1.VH) * (D1_BBOX.N - D1_BBOX.S),
    lng: D1_BBOX.W + (x / depth1.VW) * (D1_BBOX.E - D1_BBOX.W),
  }));
  const gps = w.gps as { lat: number; lng: number } | undefined;
  return { name: (w.n as string) ?? '', lat: gps?.lat ?? 0, lng: gps?.lng ?? 0, poly };
}

function buildBlockRegion(blockIdx: number, d2: Depth2Data): SelectedRegion {
  const block = d2.blocks[blockIdx];
  const poly = parsePts(block.p).map(([x, y]) => ({
    lat: d2.bbox.N - (y / d2.VH) * (d2.bbox.N - d2.bbox.S),
    lng: d2.bbox.W + (x / d2.VW) * (d2.bbox.E - d2.bbox.W),
  }));
  const lat = d2.bbox.N - (block.cy / d2.VH) * (d2.bbox.N - d2.bbox.S);
  const lng = d2.bbox.W + (block.cx / d2.VW) * (d2.bbox.E - d2.bbox.W);
  return { name: `구역 ${blockIdx + 1}`, lat, lng, poly };
}

export interface SaigonMapV4Props {
  height?: number | string;
  locateOnMount?: boolean;
  markers?: MapMarkerV2[];
  onWardLoad?: (region: SelectedRegion) => void;
  onBlockSelect?: (region: SelectedRegion | null) => void;
  className?: string;
}

export default function SaigonMapV4({
  height = 400,
  locateOnMount,
  markers,
  onWardLoad,
  onBlockSelect,
  className,
}: SaigonMapV4Props) {
  const uid = useId();
  const clipId = `v4c${uid.replace(/:/g, '')}`;

  const [d2, setD2] = useState<Depth2Data | null>(null);
  const [d3, setD3] = useState<Depth3Data | null>(null);
  const [selBlock, setSelBlock] = useState<number | null>(null);
  const [meLatLng, setMeLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const svgRef = useRef<SVGSVGElement>(null);
  const vbRef = useRef<VB>({ x: 0, y: 0, w: 1000, h: 1000 });
  const fullRef = useRef<VB>({ x: 0, y: 0, w: 1000, h: 1000 });
  const d2Ref = useRef<Depth2Data | null>(null);
  const selRef = useRef<number | null>(null);
  const wardSlugRef = useRef('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // 포인터 제스처 상태
  const gest = useRef<{
    pts: Map<number, { x: number; y: number }>;
    lastP: { x: number; y: number } | null;
    lastD: number;
    moved: boolean;
  }>({ pts: new Map(), lastP: null, lastD: 0, moved: false });

  useEffect(() => { d2Ref.current = d2; }, [d2]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS);
  };

  const setVBAttr = useCallback(() => {
    const v = vbRef.current;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }, []);

  const clampVB = useCallback((v: VB): VB => {
    const full = fullRef.current;
    let { x, y, w, h } = v;
    if (w >= full.w) return { x: full.x, y: full.y, w: full.w, h: full.h };
    x = Math.max(full.x, Math.min(full.x + full.w - w, x));
    y = Math.max(full.y, Math.min(full.y + full.h - h, y));
    return { x, y, w, h };
  }, []);

  const applyZoom = useCallback((f: number, cx: number, cy: number) => {
    const full = fullRef.current, vb = vbRef.current;
    const minW = full.w * MIN_ZOOM;
    const w = Math.max(minW, Math.min(full.w, vb.w * f));
    const h = w * full.h / full.w;
    vbRef.current = clampVB({ x: cx - (cx - vb.x) * (w / vb.w), y: cy - (cy - vb.y) * (h / vb.h), w, h });
    setVBAttr();
  }, [clampVB, setVBAttr]);

  // ward + depth3 동시 로드
  const loadWard = useCallback(async (slug: string, gps?: { lat: number; lng: number }) => {
    if (wardSlugRef.current === slug) return;
    setLoading(true);
    try {
      const [d2data, d3data] = await Promise.all([
        fetch(`${ASSET_BASE}${slug}/depth2.json`).then((r) => { if (!r.ok) throw r; return r.json() as Promise<Depth2Data>; }),
        fetch(`${ASSET_BASE}${slug}/depth3.json`).then((r) => { if (!r.ok) throw r; return r.json() as Promise<Depth3Data>; }),
      ]);
      wardSlugRef.current = slug;
      const full: VB = { x: 0, y: 0, w: d2data.VW, h: d2data.VH };
      fullRef.current = full;
      if (gps) {
        const mx = (gps.lng - d2data.bbox.W) / (d2data.bbox.E - d2data.bbox.W) * d2data.VW;
        const my = (d2data.bbox.N - gps.lat) / (d2data.bbox.N - d2data.bbox.S) * d2data.VH;
        const initW = d2data.VW * 0.55;
        vbRef.current = clampVB({ x: mx - initW / 2, y: my - initW / 2, w: initW, h: initW * (d2data.VH / d2data.VW) });
      } else {
        vbRef.current = { ...full };
      }
      setD2(d2data);
      setD3(d3data);
      setSelBlock(null);
      selRef.current = null;
      requestAnimationFrame(setVBAttr);
    } catch {
      showToast('지도 데이터를 불러올 수 없어요');
    } finally {
      setLoading(false);
    }
  }, [clampVB, setVBAttr]);

  const runLocate = useCallback(async () => {
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      setMeLatLng({ lat: pos.lat, lng: pos.lng });
      // depth1 좌표계에서 ward 탐색
      const x1 = (pos.lng - D1_BBOX.W) / (D1_BBOX.E - D1_BBOX.W) * depth1.VW;
      const y1 = (D1_BBOX.N - pos.lat) / (D1_BBOX.N - D1_BBOX.S) * depth1.VH;
      let idx = depth1.wards.findIndex((w) => !!w.slug && pointInPoly(x1, y1, w.p));
      if (idx < 0) {
        // 폴리곤 miss → 가장 가까운 ward
        let bestD = Infinity;
        depth1.wards.forEach((w, i) => {
          const g = w.gps as { lat: number; lng: number } | undefined;
          if (!g) return;
          const d = (g.lat - pos.lat) ** 2 + (g.lng - pos.lng) ** 2;
          if (d < bestD) { bestD = d; idx = i; }
        });
      }
      const slug = idx >= 0 && depth1.wards[idx].slug ? depth1.wards[idx].slug as string : DEFAULT_SLUG;
      await loadWard(slug, { lat: pos.lat, lng: pos.lng });
      if (idx >= 0) onWardLoad?.(buildWardRegion(idx));
    } catch {
      showToast('위치를 가져올 수 없어요');
      if (!wardSlugRef.current) await loadWard(DEFAULT_SLUG);
    }
  }, [loadWard, onWardLoad]);

  useEffect(() => {
    if (locateOnMount) void runLocate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 비-passive wheel
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), vb = vbRef.current;
      const cx = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
      const cy = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
      applyZoom(e.deltaY > 0 ? 1.12 : 0.89, cx, cy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  // ── 포인터 이벤트 (팬 + 핀치) ──
  const onPointerDown = (e: PE<SVGSVGElement>) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const g = gest.current;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.lastP = { x: e.clientX, y: e.clientY };
    g.moved = false;
    if (g.pts.size === 2) {
      const [a, b] = [...g.pts.values()];
      g.lastD = Math.hypot(b.x - a.x, b.y - a.y);
    }
  };

  const onPointerMove = (e: PE<SVGSVGElement>) => {
    const g = gest.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const vb = vbRef.current;
    const r = e.currentTarget.getBoundingClientRect();
    if (g.pts.size === 2) {
      const [a, b] = [...g.pts.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (g.lastD) {
        const cx = vb.x + (((a.x + b.x) / 2 - r.left) / r.width) * vb.w;
        const cy = vb.y + (((a.y + b.y) / 2 - r.top) / r.height) * vb.h;
        applyZoom(g.lastD / dist, cx, cy);
      }
      g.lastD = dist;
      g.moved = true;
      return;
    }
    if (g.lastP) {
      const dx = ((e.clientX - g.lastP.x) / r.width) * vb.w;
      const dy = ((e.clientY - g.lastP.y) / r.height) * vb.h;
      if (Math.abs(e.clientX - g.lastP.x) + Math.abs(e.clientY - g.lastP.y) > 3) g.moved = true;
      const full = fullRef.current;
      vbRef.current = {
        ...vb,
        x: Math.max(full.x, Math.min(full.x + full.w - vb.w, vb.x - dx)),
        y: Math.max(full.y, Math.min(full.y + full.h - vb.h, vb.y - dy)),
      };
      setVBAttr();
      g.lastP = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = (e: PE<SVGSVGElement>) => {
    const g = gest.current;
    const wasSingle = g.pts.size === 1 && !g.moved;
    const cx = e.clientX, cy = e.clientY;
    g.pts.delete(e.pointerId);
    if (g.pts.size < 2) g.lastD = 0;
    if (g.pts.size === 0) g.lastP = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }

    if (wasSingle) {
      const d2cur = d2Ref.current;
      if (!d2cur) return;
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      const vb = vbRef.current;
      const x = vb.x + ((cx - r.left) / r.width) * vb.w;
      const y = vb.y + ((cy - r.top) / r.height) * vb.h;
      let hit: number | null = null;
      for (let i = d2cur.blocks.length - 1; i >= 0; i--) {
        if (pointInPoly(x, y, d2cur.blocks[i].p)) { hit = i; break; }
      }
      const next = hit !== null && hit === selRef.current ? null : hit;
      selRef.current = next;
      setSelBlock(next);
      onBlockSelect?.(next !== null ? buildBlockRegion(next, d2cur) : null);
    }
  };

  // ── 줌 버튼 ──
  const onZoomIn = () => {
    const vb = vbRef.current;
    applyZoom(0.6, vb.x + vb.w / 2, vb.y + vb.h / 2);
  };
  const onZoomOut = () => {
    const full = fullRef.current, vb = vbRef.current;
    if (vb.w < full.w - 0.5) { vbRef.current = { ...full }; setVBAttr(); }
  };

  // ── 렌더 헬퍼 ──
  const renderD3 = () => {
    if (!d3) return null;
    return (
      <>
        {d3.water.map((p, i) => <polygon key={`w${i}`} points={p} className={styles.water} />)}
        {d3.wline.map((p, i) => <polyline key={`l${i}`} points={p} className={styles.wline} />)}
        {d3.bldg.map((p, i) => <polygon key={`b${i}`} points={p} className={styles.bldg} />)}
        {[...d3.roads].sort((a, b) => a.w - b.w).map((r, i) => (
          <polyline key={`r${i}`} points={r.p} stroke={r.c} strokeWidth={r.w} className={styles.road} />
        ))}
      </>
    );
  };

  const renderMe = () => {
    if (!meLatLng || !d2) return null;
    const x = (meLatLng.lng - d2.bbox.W) / (d2.bbox.E - d2.bbox.W) * d2.VW;
    const y = (d2.bbox.N - meLatLng.lat) / (d2.bbox.N - d2.bbox.S) * d2.VH;
    if (x < 0 || x > d2.VW || y < 0 || y > d2.VH) return null;
    return (
      <g pointerEvents="none">
        <circle cx={x} cy={y} r={18} className={styles.meRing} />
        <circle cx={x} cy={y} r={7} className={styles.meDot} strokeWidth={2.5} />
      </g>
    );
  };

  const renderMarkers = () => {
    if (!markers || !d2) return null;
    return markers.map((m) => {
      const x = (m.lng - d2.bbox.W) / (d2.bbox.E - d2.bbox.W) * d2.VW;
      const y = (d2.bbox.N - m.lat) / (d2.bbox.N - d2.bbox.S) * d2.VH;
      if (x < -20 || x > d2.VW + 20 || y < -20 || y > d2.VH + 20) return null;
      const r = (m.r ?? 1) * 7;
      return (
        <g key={m.id} className={styles.marker} onClick={m.onClick} pointerEvents="all">
          <circle cx={x} cy={y} r={r + 3} fill="rgba(255,255,255,0.7)" />
          <circle cx={x} cy={y} r={r} fill={m.color ?? '#3b82f6'} stroke="#fff" strokeWidth={1.5} />
        </g>
      );
    });
  };

  const hasSel = selBlock !== null;

  return (
    <div
      className={`${styles.stage} ${className ?? ''}`}
      style={{ height }}
    >
      <svg
        ref={svgRef}
        className={`${styles.svg}${loading ? '' : ' ' + styles.grab}`}
        viewBox={`0 0 ${d2?.VW ?? 1000} ${d2?.VH ?? 1000}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* 배경 */}
        {d2 && <rect x={0} y={0} width={d2.VW} height={d2.VH} className={styles.land} />}

        {/* depth3 dim 레이어: 선택 없으면 전체 표시, 선택 있으면 흐리게 */}
        <g opacity={hasSel ? 0.15 : 1}>{renderD3()}</g>

        {/* depth3 클립 레이어: 선택된 블록만 선명하게 */}
        {hasSel && d2 && (
          <>
            <defs>
              <clipPath id={clipId}>
                <polygon points={d2.blocks[selBlock!].p} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>{renderD3()}</g>
          </>
        )}

        {/* 블록 폴리곤 (클릭 타겟 + 테두리) */}
        {d2?.blocks.map((block, i) => (
          <polygon
            key={i}
            points={block.p}
            fill={hasSel && i !== selBlock ? 'rgba(0,0,0,0.06)' : 'transparent'}
            stroke={i === selBlock ? '#ff5a1f' : '#aab8c2'}
            strokeWidth={i === selBlock ? 2.2 : 0.9}
            strokeLinejoin="round"
            style={{ cursor: 'pointer' }}
          />
        ))}

        {/* 선택 블록 선택 하이라이트 링 */}
        {hasSel && d2 && (
          <polygon
            points={d2.blocks[selBlock!].p}
            fill="rgba(255,91,31,0.07)"
            stroke="#ff5a1f"
            strokeWidth={2.2}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}

        {/* ward 외곽선 */}
        {d2 && <polygon points={d2.border} className={styles.wardBorder} pointerEvents="none" />}

        {/* 마커 + 내 위치 */}
        {renderMarkers()}
        {renderMe()}
      </svg>

      {/* 줌 버튼 */}
      <div className={styles.zoomControls}>
        <button type="button" className={styles.ctrlBtn} onClick={onZoomIn}>+</button>
        <button type="button" className={styles.ctrlBtn} onClick={onZoomOut}>−</button>
      </div>

      {/* 내 위치 버튼 */}
      <div className={styles.controls}>
        <button type="button" className={styles.ctrlBtn} onClick={() => void runLocate()} aria-label="내 위치로">◎</button>
      </div>

      {loading && <div className={styles.loading}>지도 로딩 중…</div>}
      {toast && <div className={styles.toast} key={toast}>{toast}</div>}
    </div>
  );
}
