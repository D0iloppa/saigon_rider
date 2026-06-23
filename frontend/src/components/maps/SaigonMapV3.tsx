import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { native } from '@/lib/native';
import depth1 from './v2/saigon-depth1.json';
import type { SelectedRegion, MapMarkerV2 } from './v2/region';
import styles from './SaigonMapV3.module.css';

/**
 * Saigon Map v3 — SaigonMapV2 기반, 동네지도 전용 변경.
 *
 * V2 대비 변경:
 *  - children?: ReactNode → depth3 SVG 내부에 오버레이로 주입 (SaigonDistrictMap 패턴)
 *  - 드릴다운 제스처: 더블탭 제거, 단일 탭으로 즉시 드릴인
 *  - 버튼 '+': 순수 줌만 (depth 전환 없음). '−': 줌아웃 후 최솟값에서 depth 팝(뒤로가기)
 *  - 제거: defaultWardSlug, pickMode, onPointPick, onVisibleMarkersChange
 */

interface LatLng { lat: number; lng: number }
interface Bbox { S: number; W: number; N: number; E: number }
interface Box { VW: number; VH: number; bbox: Bbox; border: string }
interface Depth2Data extends Box { blocks: { p: string; cx: number; cy: number }[] }
interface Depth3Data extends Box { roads: { p: string; c: string; w: number }[]; bldg: string[]; water: string[]; wline: string[] }
interface VB { x: number; y: number; w: number; h: number }

const MIN_ZOOM_RATIO = 0.06;
const TOAST_MS = 2400;
const ASSET_BASE = `${import.meta.env.BASE_URL}maps/v2/`;
const D1_BBOX = depth1.bbox as Bbox;

const parsePts = (s: string): [number, number][] =>
  s.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);

function spanBox(s: string) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of parsePts(s)) {
    if (x < minx) minx = x; if (y < miny) miny = y;
    if (x > maxx) maxx = x; if (y > maxy) maxy = y;
  }
  return { minx, miny, maxx, maxy, span: Math.max(maxx - minx, maxy - miny) };
}

function projGps(g: LatLng, vw: number, vh: number, b: Bbox): [number, number] {
  return [((g.lng - b.W) / (b.E - b.W)) * vw, ((b.N - g.lat) / (b.N - b.S)) * vh];
}

function buildRegion(idx: number): SelectedRegion | null {
  const w = depth1.wards[idx];
  if (!w?.gps) return null;
  const poly = parsePts(w.p).map(([x, y]) => ({
    lat: D1_BBOX.N - (y / depth1.VH) * (D1_BBOX.N - D1_BBOX.S),
    lng: D1_BBOX.W + (x / depth1.VW) * (D1_BBOX.E - D1_BBOX.W),
  }));
  return { name: w.n ?? '', lat: w.gps.lat, lng: w.gps.lng, poly };
}

function pointInPoly(x: number, y: number, polyStr: string): boolean {
  const pts = parsePts(polyStr);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface SaigonMapV3Props {
  height?: number | string;
  /** 마운트 시 조용히 1회 auto-locate (커버리지 밖이면 토스트 없이 무시) */
  locateOnMount?: boolean;
  /** 마커 표시 방식. 'badge'(기본)=depth1 선택동 집계배지+depth2/3 핀, 'pins'=전 depth 개별핀 */
  markerMode?: 'badge' | 'pins';
  /** 진입 시 이 좌표가 속한 동에 포커스 (내위치 마커 없이) */
  initialGps?: { lat: number; lng: number };
  markers?: MapMarkerV2[];
  /** depth1 배지 직접 주입. 제공 시 markers 기반 ward-count 계산 대신 이 데이터를 투영 */
  wardCountBadges?: { lat: number; lng: number; count: number }[];
  /** 선택/locate 시 선택 지역(동) emit */
  onRegionSelect?: (region: SelectedRegion) => void;
  /** depth3 SVG 레이어 내부에 주입할 오버레이. pan/zoom viewBox 좌표계 그대로 사용 */
  children?: ReactNode;
  className?: string;
}

export default function SaigonMapV3({
  height = 300,
  locateOnMount = false,
  markerMode = 'badge',
  initialGps,
  markers = [],
  wardCountBadges,
  onRegionSelect,
  children,
  className,
}: SaigonMapV3Props) {
  const { t } = useTranslation();
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const [sel1, setSel1] = useState<number | null>(null);
  const [sel2, setSel2] = useState<number | null>(null);
  const [d2, setD2] = useState<Depth2Data | null>(null);
  const [d3, setD3] = useState<Depth3Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const clipId = useId().replace(/:/g, '');
  const svgRefs = useRef<Record<number, SVGSVGElement | null>>({});
  const clipRef = useRef<SVGPolygonElement>(null);
  const landRef = useRef<SVGPolygonElement>(null);
  const edgeRef = useRef<SVGPolygonElement>(null);
  const wardSlugRef = useRef<string | null>(null);
  const openBlockRef = useRef<string | null>(null);
  const cache = useRef<Map<string, { d2?: Depth2Data; d3?: Depth3Data }>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vbRef = useRef<Record<number, VB>>({
    1: { x: 0, y: 0, w: depth1.VW, h: depth1.VH },
    2: { x: 0, y: 0, w: 1000, h: 1000 },
    3: { x: 0, y: 0, w: 1000, h: 1000 },
  });
  const fullRef = useRef<Record<number, VB>>({
    1: { x: 0, y: 0, w: depth1.VW, h: depth1.VH },
    2: { x: 0, y: 0, w: 1000, h: 1000 },
    3: { x: 0, y: 0, w: 1000, h: 1000 },
  });
  const depthRef = useRef(depth);
  useEffect(() => { depthRef.current = depth; }, [depth]);

  const gest = useRef<{
    pts: Map<number, { x: number; y: number }>;
    lastD: number;
    lastP: { x: number; y: number } | null;
    moved: boolean;
  }>({ pts: new Map(), lastD: 0, lastP: null, moved: false });

  const setVBAttr = useCallback((d: number) => {
    const vb = vbRef.current[d];
    const svg = svgRefs.current[d];
    if (!svg) return;
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const s = vb.w / fullRef.current[d].w;
    svg.querySelectorAll<SVGGElement>('[data-zmarker]').forEach((el) => {
      el.setAttribute('transform', `translate(${el.getAttribute('data-mx')} ${el.getAttribute('data-my')}) scale(${s})`);
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchWard = useCallback(async (slug: string, which: 'd2' | 'd3') => {
    const entry = cache.current.get(slug) ?? {};
    if (!entry[which]) {
      const res = await fetch(`${ASSET_BASE}${slug}/${which === 'd2' ? 'depth2' : 'depth3'}.json`);
      if (!res.ok) throw new Error(`map asset ${slug}/${which}`);
      entry[which] = await res.json();
      cache.current.set(slug, entry);
    }
    return entry[which]!;
  }, []);

  const centerOn = useCallback((d: number, px: number, py: number) => {
    const full = fullRef.current[d], vb = vbRef.current[d];
    vbRef.current[d] = {
      ...vb,
      x: Math.max(full.x, Math.min(full.x + full.w - vb.w, px - vb.w / 2)),
      y: Math.max(full.y, Math.min(full.y + full.h - vb.h, py - vb.h / 2)),
    };
    setVBAttr(d);
  }, [setVBAttr]);

  // ── 드릴인 ──
  const loadWardD2 = useCallback(async (slug: string): Promise<Depth2Data> => {
    const data = (await fetchWard(slug, 'd2')) as Depth2Data;
    if (wardSlugRef.current !== slug) {
      wardSlugRef.current = slug;
      setD2(data); setD3(null); openBlockRef.current = null;
      fullRef.current[2] = { x: 0, y: 0, w: data.VW, h: data.VH };
      vbRef.current[2] = { ...fullRef.current[2] };
    }
    return data;
  }, [fetchWard]);

  const openBlock = useCallback(async (slug: string, blockPts: string) => {
    const data = (await fetchWard(slug, 'd3')) as Depth3Data;
    setD3(data);
    openBlockRef.current = blockPts;
    const bb = spanBox(blockPts);
    const side = bb.span * 1.18;
    const cx = (bb.minx + bb.maxx) / 2, cy = (bb.miny + bb.maxy) / 2;
    const full: VB = { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
    fullRef.current[3] = full;
    vbRef.current[3] = { ...full };
    clipRef.current?.setAttribute('points', blockPts);
    landRef.current?.setAttribute('points', blockPts);
    edgeRef.current?.setAttribute('points', blockPts);
    setDepth(3);
    requestAnimationFrame(() => setVBAttr(3));
  }, [fetchWard, setVBAttr]);

  const drillIntoWard = useCallback(async (slug: string) => {
    if (loading || depthRef.current !== 1) return;
    setLoading(true);
    try {
      await loadWardD2(slug);
      setSel2(null);
      setDepth(2);
      requestAnimationFrame(() => setVBAttr(2));
    } catch { /* 에셋 없음 — depth1 유지 */ } finally { setLoading(false); }
  }, [loading, loadWardD2, setVBAttr]);

  const drillIntoBlock = useCallback(async (blockPts: string) => {
    const slug = wardSlugRef.current;
    if (!slug || loading) return;
    setLoading(true);
    try { await openBlock(slug, blockPts); } catch { /* noop */ } finally { setLoading(false); }
  }, [loading, openBlock]);

  const popDepth = useCallback((d: number) => {
    if (d <= 1) return;
    const prev = (d - 1) as 1 | 2;
    vbRef.current[prev] = { ...fullRef.current[prev] };
    setVBAttr(prev);
    setDepth(prev);
  }, [setVBAttr]);

  // ── 줌 (핀치/휠) ──
  const applyZoom = useCallback((d: 1 | 2 | 3, f: number, cx: number, cy: number) => {
    const full = fullRef.current[d], vb = vbRef.current[d];
    const minW = full.w * MIN_ZOOM_RATIO;
    const w = Math.max(minW, Math.min(full.w, vb.w * f));
    const h = w * full.h / full.w;
    const nx = Math.max(full.x, Math.min(full.x + full.w - w, cx - (cx - vb.x) * (w / vb.w)));
    const ny = Math.max(full.y, Math.min(full.y + full.h - h, cy - (cy - vb.y) * (h / vb.h)));
    vbRef.current[d] = { x: nx, y: ny, w, h };
    setVBAttr(d);
  }, [setVBAttr]);

  const zoomToWidth = useCallback((d: number, w: number, cx: number, cy: number) => {
    const full = fullRef.current[d];
    const nw = Math.max(full.w * MIN_ZOOM_RATIO, Math.min(full.w, w));
    const nh = nw * full.h / full.w;
    vbRef.current[d] = {
      w: nw, h: nh,
      x: Math.max(full.x, Math.min(full.x + full.w - nw, cx - nw / 2)),
      y: Math.max(full.y, Math.min(full.y + full.h - nh, cy - nh / 2)),
    };
    setVBAttr(d);
  }, [setVBAttr]);

  // V3: '+' 버튼 = 순수 줌만. depth 전환 없음.
  const onZoomIn = useCallback(() => {
    const d = depthRef.current, vb = vbRef.current[d], full = fullRef.current[d];
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    zoomToWidth(d, Math.max(full.w * MIN_ZOOM_RATIO, vb.w * 0.6), cx, cy);
  }, [zoomToWidth]);

  // V3: '−' 버튼 = 줌아웃. 최솟값에서 depth 팝 (뒤로가기).
  const onZoomOut = useCallback(() => {
    const d = depthRef.current, full = fullRef.current[d], vb = vbRef.current[d];
    if (vb.w < full.w - 0.5) { vbRef.current[d] = { ...full }; setVBAttr(d); }
    else popDepth(d);
  }, [popDepth, setVBAttr]);

  // 비-passive wheel
  useEffect(() => {
    const offs: Array<() => void> = [];
    ([1, 2, 3] as const).forEach((d) => {
      const el = svgRefs.current[d];
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        if (depthRef.current !== d) return;
        e.preventDefault();
        const vb = vbRef.current[d];
        const r = el.getBoundingClientRect();
        const cx = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
        const cy = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
        applyZoom(d, e.deltaY > 0 ? 1.12 : 0.89, cx, cy);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      offs.push(() => el.removeEventListener('wheel', onWheel));
    });
    return () => offs.forEach((o) => o());
  }, [applyZoom]);

  // ── 포인터 (드래그 팬 + 핀치 줌) ──
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const g = gest.current;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.lastP = { x: e.clientX, y: e.clientY };
    g.moved = false;
    if (g.pts.size === 2) {
      const a = [...g.pts.values()];
      g.lastD = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
    }
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const g = gest.current;
    if (!g.pts.has(e.pointerId)) return;
    const d = depthRef.current;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const vb = vbRef.current[d];
    const r = e.currentTarget.getBoundingClientRect();
    if (g.pts.size === 2) {
      const a = [...g.pts.values()];
      const dist = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
      if (g.lastD) {
        const cx = vb.x + (((a[0].x + a[1].x) / 2 - r.left) / r.width) * vb.w;
        const cy = vb.y + (((a[0].y + a[1].y) / 2 - r.top) / r.height) * vb.h;
        applyZoom(d, g.lastD / dist, cx, cy);
      }
      g.lastD = dist; g.moved = true;
      return;
    }
    if (g.lastP) {
      const dx = ((e.clientX - g.lastP.x) / r.width) * vb.w;
      const dy = ((e.clientY - g.lastP.y) / r.height) * vb.h;
      if (Math.abs(e.clientX - g.lastP.x) + Math.abs(e.clientY - g.lastP.y) > 2) g.moved = true;
      const full = fullRef.current[d];
      vbRef.current[d] = {
        ...vb,
        x: Math.max(full.x, Math.min(full.x + full.w - vb.w, vb.x - dx)),
        y: Math.max(full.y, Math.min(full.y + full.h - vb.h, vb.y - dy)),
      };
      setVBAttr(d);
      g.lastP = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const g = gest.current;
    g.pts.delete(e.pointerId);
    if (g.pts.size < 2) g.lastD = 0;
    if (g.pts.size === 0) g.lastP = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const pan = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

  // ── 지역 선택: V3 = 단일 탭으로 즉시 드릴인 (더블탭 제거) ──
  const onWardTap = (i: number) => {
    if (gest.current.moved) return;
    setSel1(i);
    emitWard(i);
    if (depth1.wards[i].slug) void drillIntoWard(depth1.wards[i].slug as string);
  };
  const onBlockTap = (i: number) => {
    if (gest.current.moved || !d2) return;
    setSel2(i);
    void drillIntoBlock(d2.blocks[i].p);
  };

  const emitWard = (idx: number) => {
    const r = buildRegion(idx);
    if (r) onRegionSelect?.(r);
  };

  // ── 내 위치로 ──
  const nearestWard = useCallback((pos: LatLng) => {
    let best = 0, bestD = Infinity;
    depth1.wards.forEach((w, i) => {
      if (!w.gps) return;
      const dd = (w.gps.lat - pos.lat) ** 2 + (w.gps.lng - pos.lng) ** 2;
      if (dd < bestD) { bestD = dd; best = i; }
    });
    return best;
  }, []);

  const locateTo = useCallback(async (pos: LatLng, opts?: { marker?: boolean }) => {
    if (opts?.marker !== false) setMe(pos);
    const [d1x, d1y] = projGps(pos, depth1.VW, depth1.VH, D1_BBOX);
    let wardIdx = depth1.wards.findIndex((w) => !!w.slug && pointInPoly(d1x, d1y, w.p));
    if (wardIdx < 0) wardIdx = nearestWard(pos);
    const ward = depth1.wards[wardIdx];
    const cur = depthRef.current;
    setSel1(wardIdx);
    const region = buildRegion(wardIdx);
    if (region) onRegionSelect?.(region);
    if (cur === 1 || !ward.slug) {
      setDepth(1); centerOn(1, d1x, d1y); return;
    }
    setLoading(true);
    try {
      const data2 = await loadWardD2(ward.slug);
      const [d2x, d2y] = projGps(pos, data2.VW, data2.VH, data2.bbox);
      const blkIdx = data2.blocks.findIndex((b) => pointInPoly(d2x, d2y, b.p));
      if (cur === 2) {
        setSel2(blkIdx >= 0 ? blkIdx : null);
        setDepth(2);
        requestAnimationFrame(() => centerOn(2, d2x, d2y));
        return;
      }
      // cur === 3
      if (blkIdx < 0) {
        setSel2(null); setDepth(2);
        requestAnimationFrame(() => centerOn(2, d2x, d2y));
        return;
      }
      const myBlock = data2.blocks[blkIdx].p;
      if (openBlockRef.current === myBlock) {
        centerOn(3, d2x, d2y);
      } else {
        setSel2(blkIdx);
        await openBlock(ward.slug, myBlock);
      }
    } catch { /* noop */ } finally { setLoading(false); }
  }, [onRegionSelect, nearestWard, centerOn, loadWardD2, openBlock]);

  const runLocate = useCallback(async (opts?: { silent?: boolean }) => {
    const resetAndToast = (msg: string) => {
      if (opts?.silent) return;
      const d = depthRef.current;
      vbRef.current[d] = { ...fullRef.current[d] };
      setVBAttr(d);
      showToast(msg);
    };
    let pos: LatLng;
    try {
      pos = await native.getLocation();
    } catch {
      resetAndToast(t('mapV2.locateFailed', '위치를 가져올 수 없어요'));
      return;
    }
    const inside = pos.lat >= D1_BBOX.S && pos.lat <= D1_BBOX.N && pos.lng >= D1_BBOX.W && pos.lng <= D1_BBOX.E;
    if (!inside) {
      resetAndToast(t('map.outsideArea', '현재 위치가 서비스 지역(호치민 도심) 밖이에요'));
      return;
    }
    await locateTo(pos);
  }, [locateTo, showToast, setVBAttr, t]);

  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    if (initialGps) {
      void locateTo(initialGps, { marker: false });
    }
    if (locateOnMount && !initialGps) void runLocate({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 마커/내위치 렌더 ──
  const renderMe = (vw: number, vh: number, bbox: Bbox, d: number) => {
    if (!me) return null;
    const [x, y] = projGps(me, vw, vh, bbox);
    if (x < 0 || x > vw || y < 0 || y > vh) return null;
    const unit = fullRef.current[d].w;
    const s = vbRef.current[d].w / unit;
    const r = unit * 0.012;
    return (
      <g data-zmarker data-mx={x} data-my={y} transform={`translate(${x} ${y}) scale(${s})`}>
        <circle r={r * 2.4} className={styles.meRing} />
        <circle r={r} className={styles.meDot} strokeWidth={r * 0.35} />
      </g>
    );
  };

  const renderClusterBadges = (vw: number, vh: number, bbox: Bbox) => {
    const threshold = vw * 0.07;
    const projected = markers
      .map((m) => { const [x, y] = projGps(m, vw, vh, bbox); return { m, x, y }; })
      .filter(({ x, y }) => x >= 0 && x <= vw && y >= 0 && y <= vh);
    const used = new Array(projected.length).fill(false);
    const clusters: { cx: number; cy: number; count: number }[] = [];
    for (let i = 0; i < projected.length; i++) {
      if (used[i]) continue;
      const group = [projected[i]];
      used[i] = true;
      for (let j = i + 1; j < projected.length; j++) {
        if (used[j]) continue;
        const dx = projected[i].x - projected[j].x;
        const dy = projected[i].y - projected[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) { group.push(projected[j]); used[j] = true; }
      }
      const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
      const cy = group.reduce((s, p) => s + p.y, 0) / group.length;
      clusters.push({ cx, cy, count: group.length });
    }
    const r = vw * 0.013;
    return clusters.map((cl, i) => (
      <g key={`cl${i}`}>
        <circle cx={cl.cx} cy={cl.cy} r={r * 1.9} className={styles.badge} strokeWidth={r * 0.4} />
        <text x={cl.cx} y={cl.cy} className={styles.badgeText} fontSize={r * 2} dominantBaseline="central">{cl.count}</text>
      </g>
    ));
  };

  const renderMarkers = (vw: number, vh: number, bbox: Bbox, d: number) => {
    const unit = fullRef.current[d].w;
    const s = vbRef.current[d].w / unit;
    const base = unit * 0.011;
    return markers.map((m) => {
      const [x, y] = projGps(m, vw, vh, bbox);
      if (x < 0 || x > vw || y < 0 || y > vh) return null;
      return (
        <g
          key={m.id}
          data-zmarker
          data-mx={x}
          data-my={y}
          transform={`translate(${x} ${y}) scale(${s})`}
          className={m.onClick ? styles.marker : undefined}
          onClick={m.onClick ? () => { if (!gest.current.moved) m.onClick?.(); } : undefined}
        >
          <circle r={base * 1.7 * (m.r ?? 1)} fill={m.color ?? '#3b82f6'} stroke="#fff" strokeWidth={base * 0.4} />
        </g>
      );
    });
  };

  return (
    <div className={`${styles.stage} ${className ?? ''}`} style={{ height }}>

      {/* depth1 — 동(ward) 경계 */}
      <div className={`${styles.layer} ${depth === 1 ? styles.active : ''}`}>
        <svg
          ref={(el) => { svgRefs.current[1] = el; }}
          className={`${styles.svg} ${styles.grab}`}
          viewBox={`0 0 ${depth1.VW} ${depth1.VH}`}
          preserveAspectRatio="xMidYMid meet"
          {...pan}
        >
          <rect width={depth1.VW} height={depth1.VH} fill="#EEF7F5" />
          {depth1.water.map((p, i) => <polygon key={`w${i}`} points={p} className={styles.river} />)}
          {depth1.wline.map((w, i) => <polyline key={`l${i}`} points={w.p} className={styles.rline} strokeWidth={w.w} />)}
          {depth1.wards.map((w, i) => i === sel1 ? null : (
            <polygon key={`d${i}`} points={w.p} className={styles.ward} onClick={() => onWardTap(i)} />
          ))}
          {sel1 != null && (
            <polygon points={depth1.wards[sel1].p} className={styles.wardSel} onClick={() => onWardTap(sel1)} />
          )}
          {depth1.wards.map((w, i) => w.n ? (
            <text key={`t${i}`} x={w.lx} y={w.ly} className={sel1 === i ? styles.wlabSel : styles.wlab} fontSize={sel1 === i ? 12 : 7} opacity={sel1 === i ? 1 : 0.5}>{w.n}</text>
          ) : null)}
          {sel1 != null && depth1.wards[sel1].n && (
            <text x={depth1.wards[sel1].lx} y={depth1.wards[sel1].ly} className={styles.wlabSel} fontSize={12}>{depth1.wards[sel1].n}</text>
          )}
          {markerMode === 'pins'
            ? renderMarkers(depth1.VW, depth1.VH, D1_BBOX, 1)
            : (() => {
                const r = depth1.VW * 0.013;
                if (wardCountBadges && wardCountBadges.length > 0) {
                  return wardCountBadges.map((b, i) => {
                    const [bx, by] = projGps(b, depth1.VW, depth1.VH, D1_BBOX);
                    return (
                      <g key={`wb${i}`}>
                        <circle cx={bx} cy={by} r={r * 1.9} className={styles.badge} strokeWidth={r * 0.4} />
                        <text x={bx} y={by} className={styles.badgeText} fontSize={r * 2} dominantBaseline="central">{b.count}</text>
                      </g>
                    );
                  });
                }
                if (markers.length === 0) return null;
                return depth1.wards.map((w, i) => {
                  const cnt = markers.filter((m) => {
                    const [mx, my] = projGps(m, depth1.VW, depth1.VH, D1_BBOX);
                    return pointInPoly(mx, my, w.p);
                  }).length;
                  if (cnt === 0) return null;
                  return (
                    <g key={`badge${i}`}>
                      <circle cx={w.lx} cy={w.ly} r={r * 1.9} className={styles.badge} strokeWidth={r * 0.4} />
                      <text x={w.lx} y={w.ly} className={styles.badgeText} fontSize={r * 2} dominantBaseline="central">{cnt}</text>
                    </g>
                  );
                });
              })()}
          {renderMe(depth1.VW, depth1.VH, D1_BBOX, 1)}
        </svg>
      </div>

      {/* depth2 — 블록 경계 */}
      <div className={`${styles.layer} ${depth === 2 ? styles.active : ''}`}>
        <svg
          ref={(el) => { svgRefs.current[2] = el; }}
          className={`${styles.svg} ${styles.grab}`}
          preserveAspectRatio="xMidYMid meet"
          {...pan}
        >
          <rect x={-5000} y={-5000} width={20000} height={20000} fill="#EEF7F5" />
          {d2 && (
            <>
              {d2.blocks.map((b, i) => i === sel2 ? null : (
                <polygon key={i} points={b.p} className={styles.blk} onClick={() => onBlockTap(i)} />
              ))}
              <polygon points={d2.border} className={styles.border} />
              {sel2 != null && (
                <polygon points={d2.blocks[sel2].p} className={styles.blkSel} onClick={() => onBlockTap(sel2)} />
              )}
              {markerMode === 'pins' ? renderMarkers(d2.VW, d2.VH, d2.bbox, 2) : renderClusterBadges(d2.VW, d2.VH, d2.bbox)}
              {renderMe(d2.VW, d2.VH, d2.bbox, 2)}
            </>
          )}
        </svg>
      </div>

      {/* depth3 — 건물/도로 + children 오버레이 */}
      <div className={`${styles.layer} ${depth === 3 ? styles.active : ''}`}>
        <svg
          ref={(el) => { svgRefs.current[3] = el; }}
          className={styles.svg}
          preserveAspectRatio="xMidYMid meet"
          {...pan}
        >
          <rect x={-5000} y={-5000} width={20000} height={20000} fill="#EEF7F5" />
          <defs><clipPath id={clipId}><polygon ref={clipRef} points="" /></clipPath></defs>
          <polygon ref={landRef} points="" className={styles.land} />
          {d3 && (
            <g clipPath={`url(#${clipId})`}>
              {d3.water.map((p, i) => <polygon key={`w${i}`} points={p} className={styles.water} />)}
              {d3.wline.map((p, i) => <polyline key={`l${i}`} points={p} className={styles.wline} />)}
              {d3.bldg.map((p, i) => <polygon key={`b${i}`} points={p} className={styles.bldg} />)}
              {[...d3.roads].sort((a, b) => a.w - b.w).map((r, i) => (
                <polyline key={`r${i}`} points={r.p} className={styles.road} stroke={r.c} strokeWidth={r.w} />
              ))}
            </g>
          )}
          <polygon ref={edgeRef} points="" className={styles.blockedge} />
          {d3 && renderMarkers(d3.VW, d3.VH, d3.bbox, 3)}
          {d3 && renderMe(d3.VW, d3.VH, d3.bbox, 3)}
          {children}
        </svg>
      </div>

      {loading && <div className={styles.loading}>{t('common.loading', '불러오는 중…')}</div>}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* 우상단: +(줌) · −(줌/뒤로) */}
      <div className={styles.zoomControls}>
        <button type="button" className={styles.ctrlBtn} aria-label={t('map.zoomIn', '확대')} onClick={onZoomIn}>+</button>
        <button type="button" className={styles.ctrlBtn} aria-label={t('map.zoomOut', '축소')} onClick={onZoomOut}>−</button>
      </div>
      {/* 우하단: ◎(내 위치) */}
      <div className={styles.controls}>
        <button type="button" className={styles.ctrlBtn} aria-label={t('map.locate', '내 위치로')} onClick={() => { void runLocate(); }}>◎</button>
      </div>
    </div>
  );
}
