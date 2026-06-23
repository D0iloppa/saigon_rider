import { useCallback, useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import { native } from '@/lib/native';
import depth1 from './v2/saigon-depth1.json';
import type { MapMarkerV2, SelectedRegion } from './v2/region';
import styles from './SaigonMapV5.module.css';

/**
 * Saigon Map v5 — 단일 통합 좌표계 위의 연속 줌 지도.
 * Layer 1 (항상): 동 경계선 + 수로  [depth1.json]
 * Layer 2 (vbW<35%): 블록/도로       [ward/depth2.json]
 * Layer 3 (vbW<7%):  건물/상세       [ward/depth3.json]
 *
 * 좌표계: equirectangular, depth1 bbox 기준 [0..BASE_W] × [0..BASE_H]
 * 각 ward 데이터는 nested <svg x y width height viewBox preserveAspectRatio="none">
 * 로 지리적 bbox에 배치 — 데이터 변환 없이 재사용.
 */

// ── 인터페이스 ──────────────────────────────────────────────
interface Bbox { S: number; W: number; N: number; E: number }
interface Depth2Data { VW: number; VH: number; bbox: Bbox; border: string; blocks: { p: string; cx: number; cy: number }[] }
interface Depth3Data { VW: number; VH: number; bbox: Bbox; border: string; roads: { p: string; c: string; w: number }[]; bldg: string[]; water: string[]; wline: string[] }
interface VB { x: number; y: number; w: number; h: number }

// ── 통합 좌표계 ─────────────────────────────────────────────
const D1_BBOX = depth1.bbox as Bbox;
// depth1 데이터 extent에 10% 패딩
const PAD_LNG = (D1_BBOX.E - D1_BBOX.W) * 0.05;
const PAD_LAT = (D1_BBOX.N - D1_BBOX.S) * 0.05;
const HCMC = {
  W: D1_BBOX.W - PAD_LNG, E: D1_BBOX.E + PAD_LNG,
  S: D1_BBOX.S - PAD_LAT, N: D1_BBOX.N + PAD_LAT,
} as const;
const BASE_W = 10_000;
const BASE_H = Math.round(BASE_W * (HCMC.N - HCMC.S) / (HCMC.E - HCMC.W)); // ≈ 10,800

const lx = (lng: number) => (lng - HCMC.W) / (HCMC.E - HCMC.W) * BASE_W;
const ly = (lat: number) => (HCMC.N - lat) / (HCMC.N - HCMC.S) * BASE_H;
// 역변환: unified coord → lat/lng
const ux2lng = (ux: number) => HCMC.W + (ux / BASE_W) * (HCMC.E - HCMC.W);
const uy2lat = (uy: number) => HCMC.N - (uy / BASE_H) * (HCMC.N - HCMC.S);

// LOD 임계값 — viewBox 너비 기준
const L2_VBW = BASE_W * 0.35;  // 3500: 블록/도로 표시 (~5km)
const L3_VBW = BASE_W * 0.07;  // 700:  건물 표시  (~1km)
const MIN_VBW = BASE_W * 0.01; // 100:  최대 줌인

const TOAST_MS = 2400;
const ASSET_BASE = `${import.meta.env.BASE_URL}maps/v2/`;

// ── 모듈 시작 시 ward bbox 사전계산 (뷰포트 컬링용) ──────────
const parsePts = (s: string): [number, number][] =>
  s.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);

function pointInPoly(x: number, y: number, poly: string): boolean {
  const pts = parsePts(poly);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// depth1 SVG 좌표(0..VW, 0..VH) → 통합 좌표
const d1ToUx = (x: number) => lx(D1_BBOX.W + (x / depth1.VW) * (D1_BBOX.E - D1_BBOX.W));
const d1ToUy = (y: number) => ly(D1_BBOX.N - (y / depth1.VH) * (D1_BBOX.N - D1_BBOX.S));

// ward 폴리곤 → 통합 좌표 bbox (뷰포트 컬링용)
const WARD_UBBOXES = depth1.wards.map((w) => {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of parsePts(w.p)) {
    const ux = d1ToUx(x), uy = d1ToUy(y);
    if (ux < x1) x1 = ux; if (ux > x2) x2 = ux;
    if (uy < y1) y1 = uy; if (uy > y2) y2 = uy;
  }
  return { x1, y1, x2, y2 };
});

function wardInView(idx: number, vb: VB): boolean {
  const b = WARD_UBBOXES[idx];
  return b.x1 < vb.x + vb.w && b.x2 > vb.x && b.y1 < vb.y + vb.h && b.y2 > vb.y;
}

// bbox → nested SVG 위치 (통합 좌표)
function bboxToRect(bbox: Bbox) {
  const x = lx(bbox.W), y = ly(bbox.N);
  return { x, y, w: lx(bbox.E) - x, h: ly(bbox.S) - y };
}

// ward idx → SelectedRegion (lat/lng 폴리곤)
function buildWardRegion(idx: number): SelectedRegion | null {
  const w = depth1.wards[idx];
  const gps = w.gps as { lat: number; lng: number } | undefined;
  if (!gps) return null;
  const poly = parsePts(w.p).map(([x, y]) => ({
    lat: D1_BBOX.N - (y / depth1.VH) * (D1_BBOX.N - D1_BBOX.S),
    lng: D1_BBOX.W + (x / depth1.VW) * (D1_BBOX.E - D1_BBOX.W),
  }));
  return { name: (w.n as string) ?? '', lat: gps.lat, lng: gps.lng, poly };
}

// ── 컴포넌트 ────────────────────────────────────────────────
export interface SaigonMapV5Props {
  height?: number | string;
  className?: string;
  locateOnMount?: boolean;
  markers?: MapMarkerV2[];
  onRegionSelect?: (region: SelectedRegion) => void;
  onBboxChange?: (bbox: { N: number; S: number; E: number; W: number }) => void;
  locateRef?: React.MutableRefObject<(() => void) | null>;
}

export default function SaigonMapV5({
  height = 400,
  className,
  locateOnMount,
  markers,
  onRegionSelect,
  onBboxChange,
  locateRef,
}: SaigonMapV5Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // viewBox: 애니메이션용 ref, 데이터 갱신용 state
  const vbRef = useRef<VB>({ x: 0, y: 0, w: BASE_W, h: BASE_W });
  const [vbSnap, setVbSnap] = useState(0); // LOD 변경·데이터 로드 시 re-render 트리거

  const [meLatLng, setMeLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [selWard, setSelWard] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  // slug → {d2?, d3?} 캐시
  const [wardData, setWardData] = useState<Record<string, { d2?: Depth2Data; d3?: Depth3Data }>>({});
  const cacheRef = useRef<Record<string, { d2?: Depth2Data; d3?: Depth3Data }>>({});
  const loadingRef = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const prevLOD = useRef({ l2: false, l3: false });

  const gest = useRef<{
    pts: Map<number, { x: number; y: number }>;
    lastP: { x: number; y: number } | null;
    lastD: number;
    moved: boolean;
  }>({ pts: new Map(), lastP: null, lastD: 0, moved: false });

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS);
  }, []);

  const setVBAttr = useCallback(() => {
    const v = vbRef.current;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }, []);

  const clampVB = useCallback((v: VB): VB => {
    const pad = BASE_W * 0.10;
    // 뷰포트가 데이터보다 넓으면/높으면 → 중앙 정렬, 그렇지 않으면 일반 클램프
    const DATA_CX = (lx(D1_BBOX.W) + lx(D1_BBOX.E)) / 2;
    const DATA_CY = (ly(D1_BBOX.N) + ly(D1_BBOX.S)) / 2;
    const x = v.w >= BASE_W + 2 * pad
      ? DATA_CX - v.w / 2
      : Math.max(-pad, Math.min(BASE_W - v.w + pad, v.x));
    const y = v.h >= BASE_H + 2 * pad
      ? DATA_CY - v.h / 2
      : Math.max(-pad, Math.min(BASE_H - v.h + pad, v.y));
    return { ...v, x, y };
  }, []);

  const applyZoom = useCallback((f: number, cx: number, cy: number) => {
    const vb = vbRef.current;
    const svg = svgRef.current;
    const ar = svg ? svg.clientHeight / svg.clientWidth : 1;
    const newW = Math.max(MIN_VBW, Math.min(BASE_W * 1.2, vb.w * f));
    // x·y 동일 factor로 등비 줌 (preserveAspectRatio="none" 환경에서 정확)
    const factor = newW / vb.w;
    vbRef.current = clampVB({
      x: cx - (cx - vb.x) * factor,
      y: cy - (cy - vb.y) * factor,
      w: newW,
      h: newW * ar,
    });
    setVBAttr();
  }, [clampVB, setVBAttr]);

  // ── 초기 viewBox: 데이터 extent 중심 + 화면 비율 반영 ───────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // rAF: 컨테이너 레이아웃 완료 후 실행 (width=0 방지)
    requestAnimationFrame(() => {
      const { width, height: h } = el.getBoundingClientRect();
      const ar = (h || 1) / (width || 1);
      const dataX1 = lx(D1_BBOX.W), dataX2 = lx(D1_BBOX.E);
      const dataCX = (dataX1 + dataX2) / 2;
      const dataCY = (ly(D1_BBOX.N) + ly(D1_BBOX.S)) / 2;
      const initW = (dataX2 - dataX1) * 1.15;
      vbRef.current = clampVB({ x: dataCX - initW / 2, y: dataCY - (initW * ar) / 2, w: initW, h: initW * ar });
      setVBAttr();
      setVbSnap((n) => n + 1);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 데이터 로딩 ────────────────────────────────────────────
  const loadWardData = useCallback(async (slug: string, needD3: boolean) => {
    if (!cacheRef.current[slug]) cacheRef.current[slug] = {};
    const entry = cacheRef.current[slug];
    const fetches: Promise<void>[] = [];

    const key2 = `${slug}:d2`, key3 = `${slug}:d3`;
    if (!entry.d2 && !loadingRef.current.has(key2)) {
      loadingRef.current.add(key2);
      fetches.push(
        fetch(`${ASSET_BASE}${slug}/depth2.json`)
          .then((r) => r.json())
          .then((d: Depth2Data) => { entry.d2 = d; })
          .catch(() => {})
          .finally(() => loadingRef.current.delete(key2)),
      );
    }
    if (needD3 && !entry.d3 && !loadingRef.current.has(key3)) {
      loadingRef.current.add(key3);
      fetches.push(
        fetch(`${ASSET_BASE}${slug}/depth3.json`)
          .then((r) => r.json())
          .then((d: Depth3Data) => { entry.d3 = d; })
          .catch(() => {})
          .finally(() => loadingRef.current.delete(key3)),
      );
    }

    if (fetches.length > 0) {
      await Promise.all(fetches);
      setWardData((prev) => ({ ...prev, [slug]: { ...entry } }));
    }
  }, []);

  // ── 뷰포트 변경 후 호출: LOD 체크 + 데이터 프리로드 ────────
  const onViewportChange = useCallback(() => {
    const vb = vbRef.current;
    const l2 = vb.w < L2_VBW;
    const l3 = vb.w < L3_VBW;

    if (l2 !== prevLOD.current.l2 || l3 !== prevLOD.current.l3) {
      prevLOD.current = { l2, l3 };
      setVbSnap((n) => n + 1);
    }

    onBboxChange?.({
      N: uy2lat(vb.y),
      S: uy2lat(vb.y + vb.h),
      W: ux2lng(vb.x),
      E: ux2lng(vb.x + vb.w),
    });

    if (!l2) return;
    depth1.wards.forEach((w, i) => {
      if (!w.slug || !wardInView(i, vb)) return;
      void loadWardData(w.slug as string, l3);
    });
  }, [loadWardData, onBboxChange]);

  // ── GPS 위치 ───────────────────────────────────────────────
  const runLocate = useCallback(async () => {
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      setMeLatLng({ lat: pos.lat, lng: pos.lng });

      // depth1 SVG 좌표로 변환해서 ward 탐색
      const d1x = (pos.lng - D1_BBOX.W) / (D1_BBOX.E - D1_BBOX.W) * depth1.VW;
      const d1y = (D1_BBOX.N - pos.lat) / (D1_BBOX.N - D1_BBOX.S) * depth1.VH;
      let idx = depth1.wards.findIndex((w) => !!w.slug && pointInPoly(d1x, d1y, w.p));
      // HCMC 범위 밖이면 nearest-ward 폴백 생략 (한국 등 외부 좌표 방지)
      const inHcmc = pos.lat >= D1_BBOX.S - 0.05 && pos.lat <= D1_BBOX.N + 0.05
                  && pos.lng >= D1_BBOX.W - 0.05 && pos.lng <= D1_BBOX.E + 0.05;
      if (idx < 0 && inHcmc) {
        // HCMC 내부지만 폴리곤 miss → 가장 가까운 ward
        let bestD = Infinity;
        depth1.wards.forEach((w, i) => {
          const g = w.gps as { lat: number; lng: number } | undefined;
          if (!g) return;
          const d = (g.lat - pos.lat) ** 2 + (g.lng - pos.lng) ** 2;
          if (d < bestD) { bestD = d; idx = i; }
        });
      }
      if (idx < 0) {
        // HCMC 밖 or 완전 실패 → 벤탄 폴백
        idx = depth1.wards.findIndex((w) => w.slug === 'ben-thanh');
      }

      const svg = svgRef.current;
      const ar = svg ? svg.clientHeight / svg.clientWidth : 1;
      // ward 전체가 viewport에 들어오도록 ward bbox 기준 zoom
      if (idx >= 0) {
        const wb = WARD_UBBOXES[idx];
        const wardW = wb.x2 - wb.x1;
        const wardH = wb.y2 - wb.y1;
        const wardCX = (wb.x1 + wb.x2) / 2;
        const wardCY = (wb.y1 + wb.y2) / 2;
        const targetW = Math.max(wardW, wardH / ar) * 1.3;
        vbRef.current = clampVB({ x: wardCX - targetW / 2, y: wardCY - targetW * ar / 2, w: targetW, h: targetW * ar });
      } else {
        const targetW = L2_VBW * 0.55;
        const cx = lx(pos.lng), cy = ly(pos.lat);
        vbRef.current = clampVB({ x: cx - targetW / 2, y: cy - targetW * ar / 2, w: targetW, h: targetW * ar });
      }
      setVBAttr();
      onViewportChange();
      setVbSnap((n) => n + 1);

      if (idx >= 0) {
        setSelWard(idx);
        // onViewportChange 와 독립적으로 직접 로드 (belt+suspenders)
        const slug = depth1.wards[idx].slug as string | undefined;
        if (slug) void loadWardData(slug, false);
        const region = buildWardRegion(idx);
        if (region) onRegionSelect?.(region);
      }
    } catch {
      // GPS 실패 → 벤탄 폴백
      const fallbackIdx = depth1.wards.findIndex((w) => w.slug === 'ben-thanh');
      if (fallbackIdx >= 0) {
        const svg = svgRef.current;
        const ar = svg ? svg.clientHeight / svg.clientWidth : 1;
        const wb = WARD_UBBOXES[fallbackIdx];
        const wardCX = (wb.x1 + wb.x2) / 2;
        const wardCY = (wb.y1 + wb.y2) / 2;
        const targetW = Math.max(wb.x2 - wb.x1, (wb.y2 - wb.y1) / ar) * 1.3;
        vbRef.current = clampVB({ x: wardCX - targetW / 2, y: wardCY - targetW * ar / 2, w: targetW, h: targetW * ar });
        setVBAttr();
        onViewportChange();
        setVbSnap((n) => n + 1);
        setSelWard(fallbackIdx);
        const region = buildWardRegion(fallbackIdx);
        if (region) onRegionSelect?.(region);
      }
      showToast('위치를 가져올 수 없어요');
    }
  }, [clampVB, setVBAttr, onViewportChange, loadWardData, onRegionSelect, showToast]);

  useEffect(() => {
    if (locateOnMount) void runLocate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (locateRef) locateRef.current = () => void runLocate();
    return () => { if (locateRef) locateRef.current = null; };
  }, [locateRef, runLocate]);

  // ── 비-passive wheel ───────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), vb = vbRef.current;
      const cx = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
      const cy = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
      applyZoom(e.deltaY > 0 ? 1.12 : 0.89, cx, cy);
      onViewportChange();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, onViewportChange]);

  // ── 포인터: 팬 + 핀치줌 ───────────────────────────────────
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
      vbRef.current = clampVB({ ...vb, x: vb.x - dx, y: vb.y - dy });
      setVBAttr();
      g.lastP = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = (e: PE<SVGSVGElement>) => {
    const g = gest.current;
    const wasTap = g.pts.size === 1 && !g.moved;
    const tapX = e.clientX, tapY = e.clientY;
    g.pts.delete(e.pointerId);
    if (g.pts.size < 2) g.lastD = 0;
    if (g.pts.size === 0) g.lastP = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }

    onViewportChange();
    setVbSnap((n) => n + 1);

    if (!wasTap) return;
    const svgEl = svgRef.current;
    const r = svgEl?.getBoundingClientRect();
    if (!r || !svgEl) return;

    const vb = vbRef.current;
    const mx = vb.x + ((tapX - r.left) / r.width) * vb.w;
    const my = vb.y + ((tapY - r.top) / r.height) * vb.h;

    // 통합 좌표 → depth1 SVG 좌표
    const d1x = (mx - lx(D1_BBOX.W)) / (lx(D1_BBOX.E) - lx(D1_BBOX.W)) * depth1.VW;
    const d1y = (my - ly(D1_BBOX.N)) / (ly(D1_BBOX.S) - ly(D1_BBOX.N)) * depth1.VH;

    const idx = depth1.wards.findIndex((_, i) => wardInView(i, vb) && pointInPoly(d1x, d1y, depth1.wards[i].p));
    if (idx >= 0) {
      setSelWard(idx);
      const region = buildWardRegion(idx);
      if (region) onRegionSelect?.(region);
    }
  };

  // ── 줌 버튼 ────────────────────────────────────────────────
  const zoomIn = () => {
    const vb = vbRef.current;
    applyZoom(0.6, vb.x + vb.w / 2, vb.y + vb.h / 2);
    onViewportChange();
    setVbSnap((n) => n + 1);
  };
  const zoomOut = () => {
    const vb = vbRef.current;
    applyZoom(1.5, vb.x + vb.w / 2, vb.y + vb.h / 2);
    onViewportChange();
    setVbSnap((n) => n + 1);
  };

  // ── LOD 상태 (render 시점 기준) ────────────────────────────
  const vb = vbRef.current;
  const showL2 = vb.w < L2_VBW;
  const showL3 = vb.w < L3_VBW;

  // depth1 nested SVG 위치 (통합 좌표)
  const d1Rect = bboxToRect(D1_BBOX);

  // ── 렌더 ──────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`${styles.stage} ${className ?? ''}`} style={{ height }}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* 배경 (수면) */}
        <rect x={-BASE_W} y={-BASE_H} width={BASE_W * 3} height={BASE_H * 3} className={styles.sea} />

        {/* Layer 1: 동 경계 (depth1, 항상 — 가장 먼저 렌더해서 배경 역할) */}
        <svg x={d1Rect.x} y={d1Rect.y} width={d1Rect.w} height={d1Rect.h}
          viewBox={`0 0 ${depth1.VW} ${depth1.VH}`} preserveAspectRatio="none" overflow="visible">
          {(depth1.water as string[]).map((p, i) => (
            <polygon key={i} points={p} className={styles.river} />
          ))}
          {(depth1.wline as { p: string; w: number }[]).map((wl, i) => (
            <polyline key={i} points={wl.p} className={styles.rline} />
          ))}
          {depth1.wards.map((w, i) => (
            <polygon key={i} points={w.p as string}
              className={i === selWard ? styles.wardSel : styles.ward}
            />
          ))}
        </svg>

        {/* Layer 2: 블록 (ward별 nested SVG) */}
        {showL2 && depth1.wards.map((w, i) => {
          if (!w.slug || !wardInView(i, vb)) return null;
          const d = wardData[w.slug as string];
          if (!d?.d2) return null;
          const r = bboxToRect(d.d2.bbox);
          return (
            <svg key={`l2-${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
              viewBox={`0 0 ${d.d2.VW} ${d.d2.VH}`} preserveAspectRatio="none" overflow="visible">
              {d.d2.blocks.map((b, bi) => (
                <polygon key={bi} points={b.p} className={styles.blk} />
              ))}
            </svg>
          );
        })}

        {/* Layer 3: 건물 (ward별 nested SVG) */}
        {showL3 && depth1.wards.map((w, i) => {
          if (!w.slug || !wardInView(i, vb)) return null;
          const d = wardData[w.slug as string];
          if (!d?.d3) return null;
          const r = bboxToRect(d.d3.bbox);
          return (
            <svg key={`l3-${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
              viewBox={`0 0 ${d.d3.VW} ${d.d3.VH}`} preserveAspectRatio="none" overflow="visible">
              {d.d3.water.map((p, pi) => <polygon key={pi} points={p} className={styles.water} />)}
              {d.d3.wline.map((p, pi) => <polyline key={pi} points={p} className={styles.wline} />)}
              {d.d3.bldg.map((p, pi) => <polygon key={pi} points={p} className={styles.bldg} />)}
              {d.d3.roads.map((road, ri) => (
                <polyline key={ri} points={road.p} stroke={road.c} strokeWidth={road.w} className={styles.road} />
              ))}
            </svg>
          );
        })}

        {/* 선택된 동 테두리 overlay — Layer 2/3 위에 항상 노출 */}
        {selWard !== null && (
          <svg x={d1Rect.x} y={d1Rect.y} width={d1Rect.w} height={d1Rect.h}
            viewBox={`0 0 ${depth1.VW} ${depth1.VH}`} preserveAspectRatio="none"
            overflow="visible" pointerEvents="none">
            <polygon
              points={depth1.wards[selWard].p as string}
              fill="none"
              stroke="#ff5a1f"
              strokeWidth={3}
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* 동 레이블 — depth3 레벨에서는 숨김 (건물 레벨에선 dot/맥락으로 충분) */}
        {vb.w >= L3_VBW && depth1.wards.map((w, i) => {
          if (i === selWard || !wardInView(i, vb)) return null;
          const gps = w.gps as { lat: number; lng: number } | undefined;
          if (!gps || !(w.n)) return null;
          // clamp: city≈6px, ward≈9px, deep≈20px
          const fs = Math.min(180, Math.max(22, vb.w * 0.023));
          return (
            <text key={i}
              x={lx(gps.lng)} y={ly(gps.lat)}
              fontSize={fs} fontWeight={600}
              fill="rgba(50,70,80,0.80)"
              stroke="rgba(255,255,255,0.85)" strokeWidth={fs * 0.28}
              paintOrder="stroke fill"
              textAnchor="middle" dominantBaseline="middle"
              fontFamily="system-ui,-apple-system,sans-serif"
              pointerEvents="none">
              {w.n as string}
            </text>
          );
        })}
        {/* 선택된 동 레이블 — depth3 레벨에서는 숨김 */}
        {vb.w >= L3_VBW && selWard !== null && (() => {
          const w = depth1.wards[selWard];
          const gps = w.gps as { lat: number; lng: number } | undefined;
          if (!gps || !(w.n)) return null;
          // clamp: city≈9px, ward≈13px, deep≈34px
          const fs = Math.min(250, Math.max(35, vb.w * 0.034));
          return (
            <text
              x={lx(gps.lng)} y={ly(gps.lat)}
              fontSize={fs} fontWeight={800}
              fill="#e84c00"
              stroke="rgba(255,255,255,0.90)" strokeWidth={fs * 0.30}
              paintOrder="stroke fill"
              textAnchor="middle" dominantBaseline="middle"
              fontFamily="system-ui,-apple-system,sans-serif"
              pointerEvents="none">
              {w.n as string}
            </text>
          );
        })()}

        {/* 마커 */}
        {markers?.map((m) => {
          const mx = lx(m.lng), my = ly(m.lat);
          if (mx < vb.x - 50 || mx > vb.x + vb.w + 50) return null;
          if (my < vb.y - 50 || my > vb.y + vb.h + 50) return null;
          const r = vb.w * 0.015;
          return (
            <g key={m.id} style={{ cursor: 'pointer' }} onClick={m.onClick} pointerEvents="all">
              <circle cx={mx} cy={my} r={r * 1.4} fill="rgba(255,255,255,0.65)" />
              <circle cx={mx} cy={my} r={r} fill={m.color ?? '#3b82f6'} stroke="#fff" strokeWidth={r * 0.28} />
            </g>
          );
        })}

        {/* 내 위치 */}
        {meLatLng && (() => {
          const mx = lx(meLatLng.lng), my = ly(meLatLng.lat);
          const r = vb.w * 0.012;
          return (
            <g pointerEvents="none">
              <circle cx={mx} cy={my} r={r * 2} className={styles.meRing} />
              <circle cx={mx} cy={my} r={r} className={styles.meDot} strokeWidth={r * 0.35} />
            </g>
          );
        })()}
      </svg>

      {/* OSM 저작권 표기 (하단 좌측) */}
      <div className={styles.attrib}>© OpenStreetMap contributors</div>

      {/* 줌 버튼 */}
      <div className={styles.zoomControls}>
        <button type="button" className={styles.ctrlBtn} onClick={zoomIn}>+</button>
        <button type="button" className={styles.ctrlBtn} onClick={zoomOut}>−</button>
      </div>

      {/* 내 위치 버튼 */}
      <div className={styles.locateCtrl}>
        <button type="button" className={styles.ctrlBtn} onClick={() => void runLocate()}>◎</button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}

      {/* 변수 사용 억제 — vbSnap은 re-render 트리거 전용 */}
      <span hidden aria-hidden>{vbSnap}</span>
    </div>
  );
}
