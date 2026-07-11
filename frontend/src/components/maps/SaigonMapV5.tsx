import { LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as PE, type ReactNode } from 'react';
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
const L1_VBW = BASE_W * 0.60;  // 6000: 도시 전체 조망 — district(구) 단위 뱃지 (ward 단위는 겹쳐서 지저분함)
const L2_VBW = BASE_W * 0.35;  // 3500: 블록/도로 표시 (~5km) — ward(동) 단위 뱃지
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
export interface DistrictBadge {
  lat: number;
  lng: number;
  count: number;
}

export interface SaigonMapV5Props {
  height?: number | string;
  className?: string;
  locateOnMount?: boolean;
  initialGps?: { lat: number; lng: number };
  /** 마운트 시 이 lat/lng bbox로 뷰포트를 복원 (재진입 뷰포트 기억 — GPS 없음). 마운트 이후 변경은 무시 */
  initialViewport?: { N: number; S: number; E: number; W: number };
  markers?: MapMarkerV2[];
  /** 지도 좌표(lat/lng)에 고정되는 HTML 오버레이(핀 말풍선 등) — svg 형제로 렌더되어 팬/줌을 따라간다 */
  anchorOverlay?: { lat: number; lng: number; node: ReactNode };
  districtBadges?: DistrictBadge[];
  /** 도시 전체 조망(vb.w >= L1_VBW)에서만 노출되는 더 굵은 단위(구) 뱃지 — 없으면 districtBadges로 대체 */
  cityBadges?: DistrictBadge[];
  onRegionSelect?: (region: SelectedRegion) => void;
  /** 마커가 아닌 지도 영역을 탭했을 때 부모 오버레이를 정리하는 훅. */
  onMapTap?: () => void;
  onBboxChange?: (bbox: { N: number; S: number; E: number; W: number }) => void;
  onDepthChange?: (showDistrictBadges: boolean) => void;
  locateRef?: React.MutableRefObject<(() => void) | null>;
  /** 현재 뷰포트 기준 bbox 재발행 트리거 — region 해제 등 파이프라인 재동기화용 */
  emitBboxRef?: React.MutableRefObject<(() => void) | null>;
  searchFitRef?: React.MutableRefObject<((points: { lat: number; lng: number }[]) => void) | null>;
  /** 줌 유지 recenter — 포스트 패널 캐러셀이 포커싱 업체로 지도만 이동할 때 사용 (focusLatLng 와 달리 줌·ward 선택 부작용 없음) */
  focusPointRef?: React.MutableRefObject<((pos: { lat: number; lng: number }) => void) | null>;
  forceMarkers?: boolean;
  polyActive?: boolean;
  onLocate?: () => void;
  /** GPS 측정 성공 시 좌표 통지 — 부모가 위치 스토어에 기억(재진입 복원용) */
  onLocated?: (pos: { lat: number; lng: number }) => void;
  /** 서비스 지역(HCMC) 밖 GPS 안내 문구 — 미지정 시 한국어 기본값 */
  outsideAreaMessage?: string;
  selectRegionOnLocate?: boolean;
  /** 부모가 동일 기능의 위치 CTA를 제공할 때 지도 내부 버튼을 숨긴다. */
  showLocateControl?: boolean;
  selectionOnly?: boolean;
  bottomInsetPx?: number;
  topInsetPx?: number;
}

function SaigonMapV5({
  height = 400,
  className,
  locateOnMount,
  initialGps,
  initialViewport,
  markers,
  anchorOverlay,
  districtBadges,
  cityBadges,
  onRegionSelect,
  onMapTap,
  onBboxChange,
  onDepthChange,
  locateRef,
  emitBboxRef,
  searchFitRef,
  focusPointRef,
  forceMarkers = false,
  polyActive = true,
  onLocate,
  onLocated,
  outsideAreaMessage,
  selectRegionOnLocate = true,
  showLocateControl = true,
  selectionOnly = false,
  bottomInsetPx = 0,
  topInsetPx = 0,
}: SaigonMapV5Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // anchorOverlay DOM + 좌표 미러 — 팬/핀치 fast-path(setVBAttr)가 React 재렌더 없이 위치를 갱신
  const anchorElRef = useRef<HTMLDivElement>(null);
  const anchorPosRef = useRef<{ lat: number; lng: number } | null>(null);

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
  const didAutoLocate = useRef(false);
  // 마운트 rAF(빈 deps)가 최신 focusLatLng 를 부르기 위한 latest-ref (onViewportChangeRef 와 동일 패턴)
  const focusLatLngRef = useRef<((pos: { lat: number; lng: number }, opts?: { silent?: boolean; selectRegion?: boolean; suppressBbox?: boolean }) => void) | null>(null);
  // 마운트 rAF(빈 deps 이펙트)가 최신 onViewportChange를 부르기 위한 latest-ref.
  // 콜백을 빈 deps 이펙트에 직접 클로저 캡처하면 React Compiler가 수동 메모이제이션
  // 보존을 포기해 컴포넌트 전체 최적화가 스킵된다(preserve-manual-memoization 에러).
  const onViewportChangeRef = useRef<(suppressBbox?: boolean) => void>(() => {});

  const gest = useRef<{
    pts: Map<number, { x: number; y: number }>;
    lastP: { x: number; y: number } | null;
    lastD: number;
    moved: boolean;
    downTarget: EventTarget | null;
  }>({ pts: new Map(), lastP: null, lastD: 0, moved: false, downTarget: null });

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS);
  }, []);

  // anchorOverlay 화면 배치 — 말풍선 하단-중앙이 핀 위를 향하도록 놓고, 좌우는 컨테이너 안으로
  // 클램프하되 꼬리(--tail-x)는 핀의 실제 x를 계속 가리킨다. 핀이 화면 밖이면 숨김.
  const updateAnchorOverlay = useCallback(() => {
    const el = anchorElRef.current;
    const svg = svgRef.current;
    const pos = anchorPosRef.current;
    if (!el || !svg || !pos) return;
    const vb = vbRef.current;
    const cw = svg.clientWidth || 1;
    const ch = svg.clientHeight || 1;
    const px = (lx(pos.lng) - vb.x) / vb.w * cw;
    const py = (ly(pos.lat) - vb.y) / vb.h * ch;
    if (px < 0 || px > cw || py < 0 || py > ch) {
      el.style.visibility = 'hidden';
      return;
    }
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    // 꼬리 간격: 마커 halo 화면 반지름(r×1.4, 업체 핀 r:1.15 기준) + 꼬리 돌출(≈11px) + 여백
    const gap = cw * 0.015 * 1.15 * 1.4 + 14;
    const bx = Math.min(Math.max(px - bw / 2, 8), Math.max(8, cw - bw - 8));
    const by = py - gap - bh;
    el.style.transform = `translate(${bx}px, ${by}px)`;
    el.style.setProperty('--tail-x', `${Math.min(Math.max(px - bx, 20), bw - 20)}px`);
    el.style.visibility = 'visible';
  }, []);

  const setVBAttr = useCallback(() => {
    const v = vbRef.current;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    // 팬/핀치 중에는 vbSnap 재렌더가 없으므로 여기서 오버레이 위치도 함께 직접 갱신
    updateAnchorOverlay();
  }, [updateAnchorOverlay]);

  // 앵커 좌표 미러 + 초기 배치 — 노드가 그려진 직후(페인트 전) 측정·배치해 (0,0) 플래시 방지
  useLayoutEffect(() => {
    anchorPosRef.current = anchorOverlay ? { lat: anchorOverlay.lat, lng: anchorOverlay.lng } : null;
    updateAnchorOverlay();
  }, [anchorOverlay, updateAnchorOverlay]);

  const getBottomInsetUnits = useCallback((viewHeight: number) => {
    const svg = svgRef.current;
    const pxHeight = svg?.clientHeight || containerRef.current?.clientHeight || 1;
    return Math.max(0, Math.min(viewHeight * 0.55, (bottomInsetPx / pxHeight) * viewHeight));
  }, [bottomInsetPx]);

  const clampVB = useCallback((v: VB): VB => {
    const pad = BASE_W * 0.10;
    const bottomInsetUnits = getBottomInsetUnits(v.h);
    const slackX = Math.max(pad, v.w * 0.275);
    const slackYTop = Math.max(pad, v.h * 0.21);
    const slackYBottom = Math.max(pad, v.h * 0.39) + bottomInsetUnits;
    // 뷰포트가 데이터보다 넓으면/높으면 → 중앙 정렬, 그렇지 않으면 넉넉한 빈 여백까지 허용
    const DATA_CX = (lx(D1_BBOX.W) + lx(D1_BBOX.E)) / 2;
    const DATA_CY = (ly(D1_BBOX.N) + ly(D1_BBOX.S)) / 2;
    const x = v.w >= BASE_W + 2 * slackX
      ? DATA_CX - v.w / 2
      : Math.max(-slackX, Math.min(BASE_W - v.w + slackX, v.x));
    const y = v.h >= BASE_H + slackYTop + slackYBottom
      ? DATA_CY - v.h / 2
      : Math.max(-slackYTop, Math.min(BASE_H - v.h + slackYBottom, v.y));
    return { ...v, x, y };
  }, [getBottomInsetUnits]);

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
      if (initialViewport) {
        // 재진입 복원: 저장된 마지막 뷰포트로 시작. 화면 비율이 달라졌을 수 있으므로
        // 너비를 기준으로 중심을 유지해 재구성한다. 복원 경로는 bbox까지 emit해서
        // (아래 기본 경로와 달리 suppress 안 함) 게이트 통과 줌이면 리스트 파이프라인이 바로 이어진다.
        const rx1 = lx(initialViewport.W), rx2 = lx(initialViewport.E);
        const rw = Math.max(MIN_VBW, Math.min(BASE_W * 1.2, rx2 - rx1));
        const rh = rw * ar;
        const rcx = (rx1 + rx2) / 2;
        const rcy = (ly(initialViewport.N) + ly(initialViewport.S)) / 2;
        vbRef.current = clampVB({ x: rcx - rw / 2, y: rcy - rh / 2, w: rw, h: rh });
        setVBAttr();
        setVbSnap((n) => n + 1);
        onViewportChangeRef.current();
        return;
      }
      if (initialGps) {
        // 재진입 좌표 기억: 예전엔 별도 이펙트가 focus 한 것을 이 rAF 가 전역 뷰로 덮어썼다
        // (시나리오 1.3 회귀) — 레이아웃 확정 후 여기서 직접 Layer3 포커스하고 bbox 도
        // emit 해(suppress 안 함) 게이트 통과 리스트 파이프라인을 바로 잇는다.
        focusLatLngRef.current?.(initialGps, { silent: true, selectRegion: selectRegionOnLocate });
        return;
      }
      const dataX1 = lx(D1_BBOX.W), dataX2 = lx(D1_BBOX.E);
      const dataCX = (dataX1 + dataX2) / 2;
      const dataCY = (ly(D1_BBOX.N) + ly(D1_BBOX.S)) / 2;
      const initW = (dataX2 - dataX1) * 1.15;
      const initH = initW * ar;
      const insetUnits = getBottomInsetUnits(initH);
      vbRef.current = clampVB({ x: dataCX - initW / 2, y: dataCY - initH / 2 + insetUnits / 2, w: initW, h: initH });
      setVBAttr();
      setVbSnap((n) => n + 1);
      // focusLatLng(GPS 자동 진입)이 이 rAF보다 먼저 좁은 뷰로 줌인해도, 여기서 다시 넓은 뷰로
      // 덮어쓰면서 onDepthChange를 안 부르면 화면(뱃지 표시)과 부모 showDistrictBadges 상태가
      // 어긋난다(헤더 총건수가 실제 뱃지 합계와 안 맞는 버그) — 최종 vb 기준으로 항상 재통지.
      onViewportChangeRef.current(true);
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

  // polyActive/selWard를 ref로 미러링 — onViewportChange가 이 둘을 deps로 물면
  // 콜백 체인 전체(centerOnUnified/focusLatLng/runLocate/fitToPoints)가 ward 선택마다
  // 재생성되어 이펙트가 연쇄 재실행된다(호출 시점의 최신 값만 필요하므로 ref로 충분).
  // useEffect 미러: 렌더 중 ref 쓰기는 React Compiler가 최적화를 포기하는 패턴.
  const polyActiveRef = useRef(polyActive);
  const selWardRef = useRef(selWard);
  useEffect(() => {
    polyActiveRef.current = polyActive;
    selWardRef.current = selWard;
  }, [polyActive, selWard]);

  // ── 뷰포트 변경 후 호출: LOD 체크 + 데이터 프리로드 ────────
  const onViewportChange = useCallback((suppressBbox?: boolean) => {
    const vb = vbRef.current;
    const l2 = vb.w < L2_VBW;
    const l3 = vb.w < L3_VBW;

    if (l2 !== prevLOD.current.l2 || l3 !== prevLOD.current.l3) {
      prevLOD.current = { l2, l3 };
      setVbSnap((n) => n + 1);
    }

    if (!suppressBbox) {
      onBboxChange?.({
        N: uy2lat(vb.y),
        S: uy2lat(vb.y + vb.h),
        W: ux2lng(vb.x),
        E: ux2lng(vb.x + vb.w),
      });
    }

    onDepthChange?.(!l2 && !(polyActiveRef.current && selWardRef.current !== null));

    if (!l2) return;
    depth1.wards.forEach((w, i) => {
      if (!w.slug || !wardInView(i, vb)) return;
      void loadWardData(w.slug as string, l3);
    });
  }, [loadWardData, onBboxChange, onDepthChange]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const centerOnUnified = useCallback((cx: number, cy: number) => {
    const vb = vbRef.current;
    const insetUnits = getBottomInsetUnits(vb.h);
    vbRef.current = clampVB({
      ...vb,
      x: cx - vb.w / 2,
      y: cy - vb.h / 2 + insetUnits * 0.5,
    });
    setVBAttr();
    onViewportChange();
    setVbSnap((n) => n + 1);
  }, [clampVB, getBottomInsetUnits, onViewportChange, setVBAttr]);

  const focusLatLng = useCallback((pos: { lat: number; lng: number }, opts?: { silent?: boolean; selectRegion?: boolean; suppressBbox?: boolean }) => {
    setMeLatLng(pos);

    const d1x = (pos.lng - D1_BBOX.W) / (D1_BBOX.E - D1_BBOX.W) * depth1.VW;
    const d1y = (D1_BBOX.N - pos.lat) / (D1_BBOX.N - D1_BBOX.S) * depth1.VH;
    let idx = depth1.wards.findIndex((w) => !!w.slug && pointInPoly(d1x, d1y, w.p));
    const inHcmc = pos.lat >= D1_BBOX.S - 0.05 && pos.lat <= D1_BBOX.N + 0.05
                && pos.lng >= D1_BBOX.W - 0.05 && pos.lng <= D1_BBOX.E + 0.05;
    if (idx < 0 && inHcmc) {
      let bestD = Infinity;
      depth1.wards.forEach((w, i) => {
        const g = w.gps as { lat: number; lng: number } | undefined;
        if (!g) return;
        const d = (g.lat - pos.lat) ** 2 + (g.lng - pos.lng) ** 2;
        if (d < bestD) { bestD = d; idx = i; }
      });
    }
    if (idx < 0) idx = depth1.wards.findIndex((w) => w.slug === 'ben-thanh');

    const svg = svgRef.current;
    const ar = svg ? svg.clientHeight / svg.clientWidth : 1;
    {
      // "내 위치" 포커스는 동 프레이밍(ward bbox×1.3 — 동 크기에 따라 Layer2에 머묾)이 아니라
      // 사용자 지점 중심 + Layer3(건물/골목) 스테이지의 최소 줌으로 고정한다 (기획 260707:
      // 3-stage[폴리곤→블록/도로→건물] 중 마지막 스테이지 진입 폭 = L3_VBW 바로 안쪽)
      const targetW = L3_VBW * 0.9;
      const cx = lx(pos.lng), cy = ly(pos.lat);
      const targetH = targetW * ar;
      const insetUnits = getBottomInsetUnits(targetH);
      vbRef.current = clampVB({ x: cx - targetW / 2, y: cy - targetH / 2 + insetUnits / 2, w: targetW, h: targetH });
    }
    setVBAttr();
    onViewportChange(opts?.suppressBbox);
    setVbSnap((n) => n + 1);

    if (idx >= 0 && opts?.selectRegion !== false) {
      setSelWard(idx);
      const slug = depth1.wards[idx].slug as string | undefined;
      if (slug) void loadWardData(slug, false);
      const region = buildWardRegion(idx);
      if (region) onRegionSelect?.(region);
    } else if (idx >= 0) {
      setSelWard(idx);
      const slug = depth1.wards[idx].slug as string | undefined;
      if (slug) void loadWardData(slug, false);
    } else if (!opts?.silent) {
      showToast(t('map.locateNotFound', { defaultValue: '위치를 찾을 수 없어요' }));
    }
  }, [clampVB, getBottomInsetUnits, loadWardData, onRegionSelect, onViewportChange, setVBAttr, showToast, t]);
  focusLatLngRef.current = focusLatLng;

  // ── GPS 위치 ───────────────────────────────────────────────
  const runLocate = useCallback(async () => {
    onLocate?.();
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      // 서비스 지역(HCMC bbox + 0.05° 마진) 밖 — 가장자리 clamp 딥줌·무의미한 조회·
      // 가짜 위치점을 만들지 않고 안내만 한다 (시나리오 3.3, V2/V3 outsideArea 가드 복원)
      const inHcmc = pos.lat >= HCMC.S - 0.05 && pos.lat <= HCMC.N + 0.05
                  && pos.lng >= HCMC.W - 0.05 && pos.lng <= HCMC.E + 0.05;
      if (!inHcmc) {
        // 막다른 길 방지: 안내 후 서비스 중심가(Bến Thành)로 이동해 원격 사용자도
        // 매물 탐색이 가능하게 한다. 가짜 위치점·좌표 저장은 하지 않는다.
        showToast(outsideAreaMessage ?? '서비스 지역 밖이에요 · 호치민 중심을 보여드려요');
        focusLatLng({ lat: 10.772, lng: 106.697 }, { silent: true, selectRegion: selectRegionOnLocate });
        setMeLatLng(null);
        return;
      }
      focusLatLng({ lat: pos.lat, lng: pos.lng }, { selectRegion: selectRegionOnLocate });
      onLocated?.({ lat: pos.lat, lng: pos.lng });
    } catch {
      // 측정 실패 시 임의 지역(기본 좌표) 딥줌·가짜 위치점 폴백을 하지 않는다 —
      // 뷰포트 유지 + 안내만 (시나리오 3.4)
      showToast(t('map.locateFailed', { defaultValue: '위치를 가져올 수 없어요' }));
    }
  }, [focusLatLng, onLocate, onLocated, outsideAreaMessage, selectRegionOnLocate, showToast, t]);

  // ◎ 버튼: 동 선택 중엔 그 동 중심으로, 아니면 GPS를 다시 측정해 진짜 "현재 위치"로 이동
  const recenterCurrentContext = useCallback(() => {
    if (polyActive && selWard !== null) {
      const ward = depth1.wards[selWard];
      const gps = ward.gps as { lat: number; lng: number } | undefined;
      if (gps) {
        centerOnUnified(lx(gps.lng), ly(gps.lat));
        return;
      }
    }
    void runLocate();
  }, [centerOnUnified, polyActive, runLocate, selWard]);

  // 검색 결과 등 임의의 좌표 집합이 모두 보이도록 뷰포트를 맞춤(ward 자동 줌과 동일한 방식)
  const fitToPoints = useCallback((points: { lat: number; lng: number }[]) => {
    if (points.length === 0) return;
    const svg = svgRef.current;
    const ar = svg ? svg.clientHeight / svg.clientWidth : 1;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    points.forEach((p) => {
      const ux = lx(p.lng), uy = ly(p.lat);
      if (ux < x1) x1 = ux; if (ux > x2) x2 = ux;
      if (uy < y1) y1 = uy; if (uy > y2) y2 = uy;
    });
    const spanW = Math.max(x2 - x1, MIN_VBW) * 1.6;
    const spanH = Math.max(y2 - y1, MIN_VBW) * 1.6;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const targetW = Math.max(spanW, spanH / ar);
    const targetH = targetW * ar;
    const insetUnits = getBottomInsetUnits(targetH);
    vbRef.current = clampVB({ x: cx - targetW / 2, y: cy - targetH / 2 + insetUnits / 2, w: targetW, h: targetH });
    setVBAttr();
    onViewportChange();
    setVbSnap((n) => n + 1);
  }, [clampVB, getBottomInsetUnits, onViewportChange, setVBAttr]);

  useEffect(() => {
    if (searchFitRef) searchFitRef.current = fitToPoints;
    return () => { if (searchFitRef) searchFitRef.current = null; };
  }, [searchFitRef, fitToPoints]);

  useEffect(() => {
    // initialGps 마운트 포커스는 레이아웃 rAF(위 초기화 이펙트)로 이관됨 — 여기는 자동 locate 만.
    // didAutoLocate 가드: runLocate는 부모 prop에 의존해 재생성될 수 있어 이 이펙트가 여러 번
    // 재실행될 수 있음 — 가드 없이는 그때마다 GPS를 다시 측정(마운트당 1회만 허용).
    if (locateOnMount && !didAutoLocate.current) {
      didAutoLocate.current = true;
      void runLocate();
    }
  }, [locateOnMount, runLocate]);

  useEffect(() => {
    if (locateRef) locateRef.current = () => void runLocate();
    return () => { if (locateRef) locateRef.current = null; };
  }, [locateRef, runLocate]);

  useEffect(() => {
    if (emitBboxRef) emitBboxRef.current = () => onViewportChange();
    return () => { if (emitBboxRef) emitBboxRef.current = null; };
  }, [emitBboxRef, onViewportChange]);

  useEffect(() => {
    if (focusPointRef) focusPointRef.current = (pos) => centerOnUnified(lx(pos.lng), ly(pos.lat));
    return () => { if (focusPointRef) focusPointRef.current = null; };
  }, [focusPointRef, centerOnUnified]);

  useEffect(() => {
    // suppressBbox: 이 이펙트는 시트 높이·선택모드/선택동 변화에 따른 LOD/뱃지 재계산용이지
    // 사용자 뷰포트 의도가 아니다 — bbox까지 재-emit하면 handleRegionSelect가 방금
    // 비운 viewportBbox를 500ms 뒤 되살리는 문제가 있었음. bbox는 제스처/줌/fit 경로만 emit.
    // polyActive/selWard는 onDepthChange(뱃지 표시) 재통지를 위해 명시적 트리거로 유지.
    onViewportChange(true);
  }, [bottomInsetPx, onViewportChange, polyActive, selWard]);

  useEffect(() => {
    if (!svgRef.current) return;
    vbRef.current = clampVB(vbRef.current);
    setVBAttr();
    setVbSnap((n) => n + 1);
  }, [bottomInsetPx, clampVB, setVBAttr]);

  // ── 비-passive wheel ───────────────────────────────────────
  useEffect(() => {
    if (selectionOnly) return;
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
  }, [applyZoom, onViewportChange, selectionOnly]);

  // ── 포인터: 팬 + 핀치줌 ───────────────────────────────────
  const onPointerDown = (e: PE<SVGSVGElement>) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const g = gest.current;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.lastP = { x: e.clientX, y: e.clientY };
    g.moved = false;
    // 포인터 캡처 후엔 pointerup의 target이 svg로 재지정되므로, 탭 시작 시점의 실제
    // 타깃을 기억해 마커 탭인지 판별한다 (마커 탭이 ward 선택까지 발화하는 것 방지).
    g.downTarget = e.target;
    if (g.pts.size === 2) {
      const [a, b] = [...g.pts.values()];
      g.lastD = Math.hypot(b.x - a.x, b.y - a.y);
    }
  };

  const onPointerMove = (e: PE<SVGSVGElement>) => {
    const g = gest.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (selectionOnly) {
      if (g.lastP && (Math.abs(e.clientX - g.lastP.x) + Math.abs(e.clientY - g.lastP.y) > 3)) g.moved = true;
      return;
    }
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
    // 마커 위에서 시작된 탭: setPointerCapture 가 click 을 svg 로 재타겟팅해 마커 g 의
    // onClick 이 실입력에서 절대 발화하지 않으므로(시나리오 4.4) 여기서 직접 디스패치한다.
    const markerEl = (g.downTarget as Element | null)?.closest?.('[data-marker]');
    if (markerEl) {
      const mid = markerEl.getAttribute('data-marker');
      markers?.find((m) => String(m.id) === mid)?.onClick?.();
      return;
    }
    onMapTap?.();
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

  // 줌 +/- 도구는 핀치·휠 제스처와 중복되어 현재 숨김.
  // 다시 노출할 때는 아래 위치에 zoomIn/zoomOut 핸들러와 .zoomControls JSX를 복원한다.

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
          {depth1.wards.map((w, i) => {
            if (polyActive && selWard !== null) {
              return (
                <polygon key={i} points={w.p as string}
                  className={i === selWard ? styles.wardBoundary : styles.wardDim}
                />
              );
            }
            return (
              <polygon key={i} points={w.p as string}
                className={styles.ward}
              />
            );
          })}
        </svg>

        {/* Layer 2: 블록 (ward별 nested SVG) */}
        {showL2 && depth1.wards.map((w, i) => {
          if (!w.slug || !wardInView(i, vb)) return null;
          if (polyActive && selWard !== null && i !== selWard) return null;
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
          if (polyActive && selWard !== null && i !== selWard) return null;
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

        {/* 선택된 동 테두리 overlay — 지역선택 모드에서만 노출 */}
        {polyActive && selWard !== null && (
          <svg x={d1Rect.x} y={d1Rect.y} width={d1Rect.w} height={d1Rect.h}
            viewBox={`0 0 ${depth1.VW} ${depth1.VH}`} preserveAspectRatio="none"
            overflow="visible" pointerEvents="none">
            <polygon
              points={depth1.wards[selWard].p as string}
              fill="none"
              stroke="#ff5a1f"
              strokeWidth={vb.w * 0.0006}
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

        {/* 마커 — depth1(줌아웃)이면 구역 count badge, depth2+이면 개별 dot */}
        {/* polyActive+selWard 상태(동 선택 중)에는 배지 숨김 — 선택 동 외부 배지 노출 방지 */}
        {!forceMarkers && vb.w >= L2_VBW && !(polyActive && selWard !== null)
          ? (vb.w >= L1_VBW ? cityBadges ?? districtBadges : districtBadges)?.map((b, i) => {
              const bx = lx(b.lng), by = ly(b.lat);
              if (bx < vb.x - 200 || bx > vb.x + vb.w + 200) return null;
              if (by < vb.y - 200 || by > vb.y + vb.h + 200) return null;
              if (b.count === 0) return null;
              const r = vb.w * 0.030;
              const fs = r * 0.80;
              const label = b.count >= 1000 ? `${Math.floor(b.count / 1000)}k` : String(b.count);
              return (
                <g key={i} pointerEvents="none">
                  <circle cx={bx} cy={by} r={r} fill="#ff5a1f" opacity={0.92} />
                  <text x={bx} y={by} fontSize={fs} fontWeight="700" fill="#fff"
                    textAnchor="middle" dominantBaseline="middle"
                    fontFamily="system-ui,-apple-system,sans-serif">
                    {label}
                  </text>
                </g>
              );
            })
          : (forceMarkers || vb.w < L2_VBW) && markers?.map((m) => {
              const mx = lx(m.lng), my = ly(m.lat);
              if (mx < vb.x - 50 || mx > vb.x + vb.w + 50) return null;
              if (my < vb.y - 50 || my > vb.y + vb.h + 50) return null;
              const r = vb.w * 0.015 * (m.r ?? 1);
              return (
                <g key={m.id} data-marker={String(m.id)} style={{ cursor: 'pointer' }} onClick={m.onClick} pointerEvents="all">
                  {m.selected && (
                    // 선택 강조 링 — 포스트 패널 포커싱 업체 (브랜드 오렌지)
                    <circle cx={mx} cy={my} r={r * 1.75} fill="none" stroke="#ff5a1f" strokeWidth={r * 0.22} opacity={0.9} />
                  )}
                  <circle cx={mx} cy={my} r={r * 1.4} fill="rgba(255,255,255,0.65)" />
                  <circle cx={mx} cy={my} r={r} fill={m.color ?? '#3b82f6'} stroke="#fff" strokeWidth={r * 0.28} />
                  {m.icon && (
                    // 업종 글리프 — 24×24 path 를 원 내접 정사각(변 1.24r, 대각 반지름 0.88r)으로 스케일
                    <path
                      d={m.icon} fill="#fff" pointerEvents="none"
                      transform={`translate(${mx - r * 0.62}, ${my - r * 0.62}) scale(${(r * 1.24) / 24})`}
                    />
                  )}
                  {m.label && (
                    // 업체 핀 상호명 라벨 (SGR-323, 당근 IN-1 패턴) — 동명 텍스트와 동일한 흰 헤일로
                    <text
                      x={mx} y={my + r * 2.0}
                      fontSize={r * 1.5} fontWeight={700}
                      fill="#1f2937"
                      stroke="rgba(255,255,255,0.90)" strokeWidth={r * 0.42}
                      paintOrder="stroke fill"
                      textAnchor="middle" dominantBaseline="hanging"
                      fontFamily="system-ui,-apple-system,sans-serif"
                      pointerEvents="none">
                      {m.label}
                    </text>
                  )}
                </g>
              );
            })
        }

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

      {/* 앵커 오버레이 — lat/lng 고정 HTML 노드. svg 형제라 setPointerCapture 재타겟팅과 무관하게
          내부 onClick 이 정상 발화한다. 위치는 updateAnchorOverlay 가 transform 으로 직접 갱신. */}
      {anchorOverlay && (
        <div ref={anchorElRef} className={styles.anchorOverlay}>
          {anchorOverlay.node}
        </div>
      )}

      {!selectionOnly && (
        <>
          {/* topInsetPx: 검색창처럼 지도 위에 뜨는 상단 오버레이가 있으면 그 아래로 밀어냄 */}
          {/* 줌 +/- 도구는 핀치·휠 제스처와 중복되어 현재 주석 처리 상태다. */}
          {/* bottomInsetPx: 드래거블 시트의 현재 노출 높이 — 시트 위에 항상 붙어 다니도록.
              미전달 시(정보 페이지들) CSS 기본값(bottom: 28px)을 그대로 쓴다 */}
          {showLocateControl && (
            <div className={styles.locateCtrl} style={bottomInsetPx ? { bottom: bottomInsetPx + 16 } : undefined}>
              <button
                type="button"
                className={styles.ctrlBtn}
                onClick={recenterCurrentContext}
                aria-label={polyActive ? t('map.centerSelectedArea') : t('map.centerMap')}
                title={polyActive ? t('map.centerSelectedArea') : t('map.centerMap')}
              >
                <LocateFixed size={16} strokeWidth={2.2} />
              </button>
            </div>
          )}
        </>
      )}

      {/* topInsetPx(검색창 등 상단 오버레이) 아래로 배치 — 겹침 방지 (줌 컨트롤과 동일 공식) */}
      {toast && (
        <div
          className={styles.toast}
          style={topInsetPx ? { top: `calc(var(--status-bar-height, 0px) + 12px + ${topInsetPx}px)` } : undefined}
        >
          {toast}
        </div>
      )}

      {/* 변수 사용 억제 — vbSnap은 re-render 트리거 전용 */}
      <span hidden aria-hidden>{vbSnap}</span>
    </div>
  );
}

// memo: 부모(NeighborhoodMap)가 검색어 타이핑 등으로 재렌더될 때 props가 참조 동일하면
// 수천 노드 SVG 리컨실을 건너뛴다 — 콜백 props는 소비처에서 useCallback 필수(기존 계약).
export default memo(SaigonMapV5);
