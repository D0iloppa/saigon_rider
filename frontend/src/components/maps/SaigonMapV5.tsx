import { LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as PE, type ReactNode } from 'react';
import { resolveUsableLocation, type ResolvedLocation } from '@/lib/serviceLocation';
import { native } from '@/lib/native';
import { inServiceArea } from '@/lib/serviceArea';
import { toast } from '@/components/ui/Toast';
import { fetchCityOutline, type CityOutline } from '@/api/poi';
import depth1 from './v2/saigon-depth1.json';
import { regionContains, type MapMarkerV2, type SelectedRegion } from './v2/region';
import { computeVisibleLabels, type DeclutterMarker } from './v2/labelDeclutter';
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
// roadBox/bldgBox: 피처 단위 뷰포트 컬링용 ward-local bbox — fetch 직후 1회 사전계산해 캐시
// (roads.sort 와 동일하게 loadWardData 에서 채운다). 옵셔널인 이유는 로드 직후 아직
// 계산 전인 과도기 프레임을 타입상 허용하기 위함(런타임엔 항상 함께 채워짐).
type FeatureBBox = readonly [number, number, number, number]; // [x1,y1,x2,y2]
interface Depth3Data {
  VW: number; VH: number; bbox: Bbox; border: string;
  roads: { p: string; c: string; w: number }[]; bldg: string[]; water: string[]; wline: string[];
  roadBox?: FeatureBBox[]; bldgBox?: FeatureBBox[];
}
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

// ── 회전(나침반) 좌표 헬퍼 (ai-docs/260806_svg_map_v6_rotation_design.md D-G/D-B) ──────
// 지형은 SVG <g transform="rotate(-bearing, camCx, camCy)"> 로 통째로 돌리고(D-G), 라벨·마커는
// counter-rotate 하지 않고 이 함수로 "위치만" 회전시킨다(D-B) — glyph 는 절대 기울지 않는다.
// 회전 중심은 카메라 중심(camCx/camCy, 나침반 모드에서는 사용자 위치)이지 viewBox 중심이 아니다
// — 혼용하면 회전할 때 지도가 미끄러진다(설계서 §3 주의사항). bearing===0 이면 항등 반환한다
// (D-H 8.3 킬스위치 — enableFollowCompass=false 소비처는 이 함수가 호출돼도 결과가 lx/ly 와 동일).
function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  if (deg === 0) return { x, y };
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const dx = x - cx, dy = y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}
// 제스처 역회전 — 화면 좌표계 델타(팬 dx/dy)를 지형(map) 좌표계로 되돌린다(설계서 §2.5). 벡터라
// 회전 중심이 필요 없다. bearing===0 이면 항등 반환(D-H 킬스위치).
function rotateVec(dx: number, dy: number, deg: number): { x: number; y: number } {
  if (deg === 0) return { x: dx, y: dy };
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}
// 컬링 사각형 회전 bbox 확장 (D-C, §4·§7 step 7) — <g rotate(-bearing, cx, cy)> 안에서는 축정렬
// viewBox 사각형이 화면을 채우려면 지도 좌표계에서 그 사각형을 +bearing 만큼 cx/cy 기준으로 돌린
// 회전 사각형이 보여야 한다. 정확한 회전 폴리곤 대신 안전한(넉넉한) AABB를 반환 — 45°에서 면적 2배.
// deg===0 이면 원본 vb 를 그대로 반환한다(킬스위치 — bearing=0 인 8개 기존 소비처는 컬링 결과 불변).
function rotatedBBoxOfRect(vb: VB, cx: number, cy: number, deg: number): VB {
  if (deg === 0) return vb;
  const corners: [number, number][] = [
    [vb.x, vb.y], [vb.x + vb.w, vb.y], [vb.x, vb.y + vb.h], [vb.x + vb.w, vb.y + vb.h],
  ];
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of corners) {
    const p = rotatePoint(x, y, cx, cy, deg);
    if (p.x < x1) x1 = p.x; if (p.x > x2) x2 = p.x;
    if (p.y < y1) y1 = p.y; if (p.y > y2) y2 = p.y;
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// LOD 임계값 — viewBox 너비 기준
const L1_VBW = BASE_W * 0.60;  // 6000: 도시 전체 조망 — district(구) 단위 뱃지 (ward 단위는 겹쳐서 지저분함)
const L2_VBW = BASE_W * 0.35;  // 3500: 블록/도로 표시 (~5km) — ward(동) 단위 뱃지
const L3_VBW = BASE_W * 0.07;  // 700:  건물 표시  (~1km)
const MIN_VBW = BASE_W * 0.01; // 100:  최대 줌인

// ── L3 상세지도(건물/도로 depth3) 부활 플래그 ──────────────────────────────────
// true: 줌인(vbW<L3_VBW) 시 renderL3Layer() 로 건물/도로 상세 레이어를 렌더(부활 기본값).
// false: 상세 레이어 미렌더 — 경량 L1/L2 조망만.
// 끄려면 이 플래그를 false 로 바꾸면 된다.
// NeighborhoodMapCanvas 가 이 플래그를 import 해, POI 참조 레이어 조회/렌더와
// 상세지도 구동(SaigonMapV5 를 비-lightweight 로 넘겨 depth3 로드)까지 함께 게이트한다.
export const L3_ENABLED = true;

// 업체 teardrop 핀 — 로컬 24유닛 좌표계: 머리 원 중심 (12,9)·반지름 9, 꼬리 꼭짓점 (12,24).
// 접선점 (4.8,14.4)/(19.2,14.4) 는 꼭짓점→원(거리 15, R 9)의 정확한 접선 계산값.
const BIZ_PIN_PATH = 'M12 24 L4.8 14.4 A9 9 0 1 1 19.2 14.4 Z';
// 내부 흰 원형 홀 반지름 (당근 레퍼런스) — 업종 글리프(변 9, 반대각 6.36)가 내접한다.
const BIZ_PIN_HOLE_R = 6.4;
// 매물·피드 선택 teardrop 내부 도메인 글리프 (24×24 Material filled, biz 업종 글리프와 동일 방식).
// 선택 시에만 teardrop 홀 안에 노출된다 — 비선택 dot 은 글리프 없이 기존 그대로.
const LISTING_GLYPH_PATH = 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z'; // local_offer (가격표)
const FEED_GLYPH_PATH = 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z'; // chat (말풍선)
const ASSET_BASE = `${import.meta.env.BASE_URL}maps/v2/`;

// ── 도로 케이싱 (표준 카토그래피 — Mapbox/OSM 관례) ──────
// depth3 도로색(c)은 파이프라인 ROAD_STYLE 산출 6종 — 데이터 재생성 없이 렌더에서 fill/casing 파생.
// casing 은 fill 보다 어두운 웜톤 한 단계. 랭크(등급) 오름차순으로 그룹의 casing→fill 쌍을 완결한 뒤
// 다음 그룹으로 넘어가 상위 등급 casing이 하위 등급 fill에 덮이지 않는다(ROAD_RANK 참고).
// 골목(#f6f6f6)은 무케이싱 — 전체 도로의 ~55%라 노드 2배 부담이 크고, 최하등급 무케이싱이 관례.
const ROAD_FILL: Record<string, string> = {
  '#f6f6f6': '#fcfbf7', // 골목
  '#ffffff': '#ffffff', // 이면도로
  '#EDE6DA': '#f4eee0', // 보행로
  '#FBD980': '#fde08f', // tertiary
  '#F6C453': '#fbcd60', // secondary
  '#F4A93C': '#f8ae42', // 간선 (진한 casing + 밝은 fill)
};
const ROAD_CASING: Record<string, string> = {
  '#ffffff': '#cdc6b4',
  '#EDE6DA': '#d6ccb6',
  '#FBD980': '#e2b155',
  '#F6C453': '#d89d2f',
  '#F4A93C': '#c9801d',
};
// 도로 등급 랭크 — gen_saigon_map_v2.py ROAD_STYLE 의 6단계 순서(motorway/trunk 최상위 … service 최하위)와 일치.
// 폭(w)은 등급과 100% 단조 대응이 아니라(예: tertiary 2.4 > secondary_link 2), 정렬/그룹핑은 랭크를 1차 키로 쓴다.
const ROAD_RANK: Record<string, number> = {
  '#f6f6f6': 0, // 골목(service)
  '#EDE6DA': 1, // 보행로(pedestrian)
  '#ffffff': 2, // 이면도로(tertiary/residential/living_street/unclassified)
  '#FBD980': 3, // secondary/secondary_link
  '#F6C453': 4, // primary/primary_link
  '#F4A93C': 5, // 간선(motorway/trunk/motorway_link/trunk_link)
};
const CASING_RATIO = 1.42; // casing 폭 = fill 폭 × 1.42
// roads 배열은 로드 시 (랭크, 폭) 오름차순 정렬돼 있으므로, 랭크 경계에서만 끊어 연속 구간으로 그룹핑한다.
// 그룹별로 casing→fill 쌍을 완결한 뒤 다음 그룹(다음 랭크)으로 넘어가야 상위 등급 casing이
// 하위 등급 fill에 덮이지 않는다(표준 카토그래피 casing-fill-casing-fill 반복 패턴).
// 도로 객체 대신 원본 배열 인덱스를 다룬다 — 뷰포트 컬링으로
// 매 렌더 필터링된 부분집합을 그룹핑할 때, React key를 필터 결과의 로컬 위치가 아니라
// 안정적인 원본 인덱스로 매길 수 있게 한다(필터링된 집합이 렌더마다 달라져도 key 불변).
function groupRoadIdxByRank(idxs: number[], roads: Depth3Data['roads']): number[][] {
  const groups: number[][] = [];
  let lastRank = -1;
  for (const idx of idxs) {
    const rank = ROAD_RANK[roads[idx].c] ?? 0;
    if (rank !== lastRank) { groups.push([]); lastRank = rank; }
    groups[groups.length - 1].push(idx);
  }
  return groups;
}
// 줌 연동 도로폭 배율 — 스트로크는 nested viewBox 유닛이라 줌에 선형 비례 자동 스케일인데,
// 그대로면 L3 진입(vbW=700)엔 헤어라인(간선 화면폭 ~1%)·MIN_VBW(100)엔 과대(~7%)다.
// 지수 0.4 곡선으로 완만화: 진입 직후 ×1.5 → 딥줌 ×0.69 (간선 화면폭 ~1.5% → ~4.8%).
// 클램프는 도로 노출 구간(MIN_VBW..L3_VBW) 밖 비정상 vb 방어용 상한/하한.
const roadWidthK = (vbw: number) => Math.min(2.0, Math.max(0.6, 1.5 * ((vbw / L3_VBW) ** 0.4)));

// 피처 단위 뷰포트 컬링 마진 — React 재렌더는 제스처 종료 시(onPointerUp → setVbSnap)에만
// 일어나므로, 팬/핀치 도중(같은 제스처 안에서)엔 컬링 결과가 갱신되지 않는다. 팬 자체는
// DOM 속성 직접 갱신(setVBAttr)으로 무-리렌더 최적화돼 있고 이게 성능 핵심이라 팬 중
// setVbSnap 을 추가로 유발하지 않는다 — 대신 렌더 시점 뷰포트 기준 사방으로 뷰포트
// 폭/높이의 1.0배(= 3×3 뷰포트 영역)를 마진으로 둬, 한 번의 연속 드래그(화면폭 ~1배 이동)
// 동안 마진 밖으로 나가는 일반적인 팬을 커버한다. 대형 ward도 3×3만 그리므로 컬링 성능
// 이득은 유지된다. 이 마진을 넘는 초고속 장거리 드래그의 순간적 가장자리 공백은
// pointerUp(=setVbSnap 재컬링)에서 즉시 해소되는 허용 트레이드오프.
const FEATURE_CULL_MARGIN = 1.0;

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

// ── 피처 단위 뷰포트 컬링 (depth3 건물/도로, ward-local 좌표) ────
// points 문자열의 min/max — ward 데이터 로드 시 1회만 호출(entry.d3.bldgBox/roadBox), 매 렌더 재파싱 없음.
function computeBBox(points: string): FeatureBBox {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of parsePts(points)) {
    if (x < x1) x1 = x; if (x > x2) x2 = x;
    if (y < y1) y1 = y; if (y > y2) y2 = y;
  }
  return [x1, y1, x2, y2];
}
function boxIntersects(b: FeatureBBox, x1: number, y1: number, x2: number, y2: number): boolean {
  return b[0] < x2 && b[2] > x1 && b[1] < y2 && b[3] > y1;
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

// 좌표가 속한 ward 판별 (패키지 B — 바텀시트 ward 리스트 소스) — 37개 폴리곤 순회는 가볍고,
// SelectedRegion 빌드는 최초 1회만 수행해 모듈 캐시한다. 반환 객체도 캐시에서 그대로 돌려주므로
// 같은 ward 안에서는 참조가 동일 — 호출부(useMemo/이펙트 deps)가 ward 변경만 감지할 수 있다.
let wardRegionsCache: { slug: string; region: SelectedRegion }[] | null = null;
export function findWardAt(lat: number, lng: number): { slug: string; region: SelectedRegion } | null {
  if (!wardRegionsCache) {
    wardRegionsCache = [];
    for (let i = 0; i < depth1.wards.length; i++) {
      const slug = (depth1.wards[i] as { slug?: string }).slug;
      if (!slug) continue; // gps/slug 없는 ward 스킵 (buildWardRegion 가드와 동일)
      const region = buildWardRegion(i);
      if (region) wardRegionsCache.push({ slug, region });
    }
  }
  for (const w of wardRegionsCache) {
    if (regionContains(w.region, lat, lng)) return w;
  }
  return null;
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
  /**
   * 마운트 시 GPS 를 1회 조용히 읽어 '내 위치' 파란 점만 찍는다 — 카메라 이동·지역 선택·토스트
   * 부작용이 전혀 없다(locateOnMount 와의 차이). 지역이 선택돼 있어 자동 locate 를 끈 화면
   * (마켓지도 region/gps 모드)에서도 내 위치는 보여주기 위한 것. 실패·서비스 지역 밖이면 무동작.
   * locateOnMount 가 켜져 있으면 중복 측위를 피하려 이쪽은 건너뛴다.
   */
  meDotOnMount?: boolean;
  initialGps?: { lat: number; lng: number };
  /** 마운트 시 이 lat/lng bbox로 뷰포트를 복원 (재진입 뷰포트 기억 — GPS 없음). 마운트 이후 변경은 무시 */
  initialViewport?: { N: number; S: number; E: number; W: number };
  markers?: MapMarkerV2[];
  /** 지도 좌표(lat/lng)에 고정되는 HTML 오버레이(핀 말풍선 등) — svg 형제로 렌더되어 팬/줌을 따라간다 */
  anchorOverlay?: { lat: number; lng: number; node: ReactNode };
  districtBadges?: DistrictBadge[];
  /** 배지(집계/클러스터) 탭 핸들러. 주면 배지가 탭 가능해진다 — 미전달 시 기존대로 장식이다. */
  onBadgeClick?: (badge: DistrictBadge) => void;
  /** 도시 전체 조망(vb.w >= L1_VBW)에서만 노출되는 더 굵은 단위(구) 뱃지 — 없으면 districtBadges로 대체 */
  cityBadges?: DistrictBadge[];
  onRegionSelect?: (region: SelectedRegion) => void;
  /** 마커가 아닌 지도 영역을 탭했을 때 부모 오버레이를 정리하는 훅. */
  onMapTap?: () => void;
  onBboxChange?: (bbox: { N: number; S: number; E: number; W: number }) => void;
  /**
   * onBboxChange와 동일 시점(같은 뷰포트 변경)에 함께 emit되는 크롭 이전(raw) 컨테이너
   * 기하 사각형 — onBboxChange는 상/하 UI크롬 인셋만큼 비대칭 크롭돼(query bbox 인셋,
   * fetch/카운트/리스트/마커 전용) (N+S)/2가 더 이상 "화면 진짜 중심"이 아니다. 핀
   * 재배치 크로스헤어(컨테이너 정중앙 고정)·뷰포트 저장/복원·줌인 타겟처럼 실제 기하
   * 중심이 필요한 소비처는 이 raw bbox의 중심을 써야 한다.
   */
  onRawViewportChange?: (bbox: { N: number; S: number; E: number; W: number }) => void;
  /**
   * 줌 깊이 신호.
   * @param showDistrictBadges markerDepth 임계 미달(= 핀·데이터 게이트를 닫아야 하는 상태)
   * @param belowL3 아직 L3(건물/골목) 스테이지에 못 들어옴 — '확대해서 주변 보기' 힌트 노출 조건.
   *   게이트(1번)와 분리한 이유: 마켓은 markerDepth='l2' 라 L2 에서 이미 핀이 보이지만,
   *   힌트는 L3 까지 유도해야 하므로 L2 구간에서도 떠야 한다(대표 지적 2026-08-06).
   */
  onDepthChange?: (showDistrictBadges: boolean, belowL3: boolean) => void;
  locateRef?: React.MutableRefObject<(() => void) | null>;
  /** 현재 뷰포트 기준 bbox 재발행 트리거 — region 해제 등 파이프라인 재동기화용 */
  emitBboxRef?: React.MutableRefObject<(() => void) | null>;
  searchFitRef?: React.MutableRefObject<((points: { lat: number; lng: number }[]) => void) | null>;
  /** 줌 유지 recenter — 포스트 패널 캐러셀이 포커싱 업체로 지도만 이동할 때 사용 (focusLatLng 와 달리 줌·ward 선택 부작용 없음) */
  focusPointRef?: React.MutableRefObject<((pos: { lat: number; lng: number }) => void) | null>;
  /** 좌표 중심 순수 확대 — GPS 측위 없이 주어진 좌표로 Layer3 줌인만 수행 (focusLatLng 와 달리 ward 선택·토스트 부작용 없음) */
  zoomInRef?: React.MutableRefObject<((pos: { lat: number; lng: number }) => void) | null>;
  forceMarkers?: boolean;
  polyActive?: boolean;
  /**
   * 선택 동을 좌표로 직접 지정한다 — polyActive 강조(주황 테두리 + 외부지역 마스크)의 대상.
   * initialViewport 복원 경로(마운트 rAF)는 focusLatLng 를 건너뛰므로 selWard 가 null 로 남아
   * "지역을 골랐는데 경계가 안 그려지는" 상태가 됐다(동네지도 회귀, 2026-08-03 대표 지적).
   * 카메라를 움직이지 않고 selWard 만 좌표로 맞춘다 — 뷰포트 복원과 경계 강조를 양립시킨다.
   */
  activeRegionAt?: { lat: number; lng: number } | null;
  onLocate?: () => void;
  /** 현재 위치 해석 성공 시 좌표 통지. 두 번째 인자는 출처가 필요한 호출부용 메타데이터. */
  onLocated?: (coords: { lat: number; lng: number }, location?: ResolvedLocation) => void;
  /** 서비스 지역(HCMC) 밖 GPS 안내 문구 — 미지정 시 한국어 기본값 */
  outsideAreaMessage?: string;
  /** 서비스 지역 밖일 때 벤탄 좌표로 이동할지 여부. 기본은 기존 동작(안내 후 중단). */
  outsideAreaFallback?: boolean;
  selectRegionOnLocate?: boolean;
  /** 부모가 동일 기능의 위치 CTA를 제공할 때 지도 내부 버튼을 숨긴다. */
  showLocateControl?: boolean;
  selectionOnly?: boolean;
  /** true면 지도 탭이 ward 선택 대신 탭 좌표를 onPointPick으로 emit한다 (SaigonMapV2 pickMode와 동일 계약). 기본 false — 기존 소비자 동작 불변. */
  pickMode?: boolean;
  /** pickMode 탭 시 호출되는 정밀 좌표 콜백. */
  onPointPick?: (pos: { lat: number; lng: number }) => void;
  /** 온디맨드 보조 지도용. 동 경계·수로·블록만 유지하고 무거운 depth3 파일은 로드하지 않는다. */
  lightweight?: boolean;
  /** 콘텐츠 핀 조회를 허용할 줌 단계. 기본은 상세 지도와 같은 depth3. */
  markerDepth?: 'l2' | 'l3';
  bottomInsetPx?: number;
  topInsetPx?: number;
  /**
   * 검색범위(query bbox) 크롭 전용 상단 인셋 — topInsetPx(라벨 디클러터 중앙 보정·줌 컨트롤
   * 배치용)와 별개 채널. topInsetPx는 검색바+칩 "고정 상수" 합산값이라 플랫폼별 상태바
   * 높이가 빠져 있어 크롭에 그대로 쓰면 칩 줄에 가린 마커가 검색범위에 잡힌다. 부모가 실측한
   * 값을 넘긴다. 미지정 시 topInsetPx로 폴백(기존 호출부 호환).
   */
  queryTopInsetPx?: number;
  /**
   * 검색범위(query bbox) 크롭 전용 하단 인셋 — bottomInsetPx(팬/줌 클램프·센터링용, 시트
   * 펼침에 따라 변하는 실측값)와 별개로, 시트가 펼쳐져도 "최소화(collapsed) 높이"로
   * 고정된 값을 받는다(대표 명시 요구). 미지정 시 크롭 없음(0).
   */
  queryBottomInsetPx?: number;
  /**
   * HCMC 전역 윤곽을 Layer 1(동 경계) 뒤에 저대비 배경으로 깐다. 순수 표시용 — 서비스지역
   * 판정과 무관. 기본 꺼짐(기존 소비 화면 무영향). 조회 실패 시 조용히 생략(지도는 그대로 동작).
   */
  showCityOutline?: boolean;
  /**
   * 카메라 추종 + 나침반 회전을 켠다 (설계: ai-docs/260806_svg_map_v6_rotation_design.md D-H).
   * **기본 false — 미지정 시 기존 동작과 완전히 동일하다(킬스위치).** 회전 렌더·3-state 순환 UI·
   * 워처 heading 소비는 후속 단계(§7 step 5~8)에서 이 플래그로 게이트되어 추가된다.
   */
  enableFollowCompass?: boolean;
  /** 3-state 모드 변화 통지(옵션, 관측 전용). 부모 UI 동기화·e2e 관측용 — 미전달 시 무동작. */
  onFollowModeChange?: (mode: 'free' | 'follow' | 'compass') => void;
}

function SaigonMapV5({
  height = 400,
  className,
  locateOnMount,
  meDotOnMount,
  initialGps,
  initialViewport,
  markers,
  anchorOverlay,
  districtBadges,
  onBadgeClick,
  cityBadges,
  onRegionSelect,
  onMapTap,
  onBboxChange,
  onRawViewportChange,
  onDepthChange,
  locateRef,
  emitBboxRef,
  searchFitRef,
  focusPointRef,
  zoomInRef,
  forceMarkers = false,
  polyActive = true,
  activeRegionAt = null,
  onLocate,
  onLocated,
  outsideAreaMessage,
  outsideAreaFallback = false,
  selectRegionOnLocate = true,
  showLocateControl = true,
  selectionOnly = false,
  pickMode = false,
  onPointPick,
  lightweight = false,
  markerDepth = 'l3',
  bottomInsetPx = 0,
  topInsetPx = 0,
  queryTopInsetPx = topInsetPx,
  queryBottomInsetPx = 0,
  showCityOutline = false,
  enableFollowCompass = false,
  onFollowModeChange,
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
  // 3-state 카메라 모드(자유/추종/추종+나침반, D-D) — enableFollowCompass=false 면 이 상태를
  // 바꾸는 경로가 아직 없으므로 'free' 를 벗어날 수 없다(킬스위치). 순환 트리거(◎ 버튼)·회전
  // 렌더·워처 heading 소비는 후속 단계(§7 step 5~8)에서 이 플래그로 게이트되어 추가된다.
  const [followMode, setFollowMode] = useState<'free' | 'follow' | 'compass'>('free');
  // 회전 중심(카메라 중심) 참조용 미러 — 나침반 모드에서 회전 중심은 사용자 위치이지 viewBox
  // 중심이 아니다(D-B 주의사항). 렌더마다 최신값으로 갱신해, effect 의존성 배열에 넣지 않고도
  // 제스처 핸들러(휠 등)가 stale 값을 읽지 않게 한다.
  const meLatLngRef = useRef(meLatLng);
  meLatLngRef.current = meLatLng;
  // 나침반 회전각(도) — heading 소스 연결은 §7 step 8 소관이라 이 단계는 0 으로 고정한다. 아래
  // 렌더부의 회전 <g> 조건부 렌더는 이 값이 아니라 enableFollowCompass 로만 게이트된다(D-H) —
  // 즉 플래그가 꺼지면 이 값과 무관하게 회전 <g> 자체가 트리에 없다.
  const bearing = 0;
  // 회전 중심 계산 — ref 만 읽으므로 빈 deps 로 항상 안정적인 참조를 유지해, 이 함수를 쓰는
  // 이펙트(휠 리스너 등)가 매 렌더 재구독되지 않게 한다.
  const getCamCenter = useCallback((): { x: number; y: number } => {
    const m = meLatLngRef.current;
    const v = vbRef.current;
    return m ? { x: lx(m.lng), y: ly(m.lat) } : { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  }, []);
  // HCMC 전역 윤곽(선택적 배경) — 조회 실패 시 null 유지, 지도는 그대로 동작.
  const [cityOutline, setCityOutline] = useState<CityOutline | null>(null);
  useEffect(() => {
    if (!showCityOutline) return;
    let cancelled = false;
    fetchCityOutline().then((d) => { if (!cancelled) setCityOutline(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [showCityOutline]);
  // 도로·건물(depth2/depth3) 자산 로드 실패 추적 — 실패해도 흰 지도가 "정상"처럼 보이던 것을
  // 알림+재시도로 노출한다. cityOutline은 순수 장식용 배경(위 주석)이라 그대로 조용히 생략 유지.
  const [assetLoadFailed, setAssetLoadFailed] = useState(false);
  const [selWard, setSelWard] = useState<number | null>(null);
  // slug → {d2?, d3?} 캐시
  const [wardData, setWardData] = useState<Record<string, { d2?: Depth2Data; d3?: Depth3Data }>>({});
  const cacheRef = useRef<Record<string, { d2?: Depth2Data; d3?: Depth3Data }>>({});
  const loadingRef = useRef<Set<string>>(new Set());
  // assetLoadFailed 시퀀스 가드 — depth2/depth3 fetch 가 여러 동에 대해 병렬로 나가면 완료 순서가
  // 요청 순서와 다를 수 있다. useInfiniteScroll.ts 의 reqSeqRef 와 동일한 발상: 매 fetch 시작
  // 시점에 단조 증가 seq 를 발급하고, 그보다 더 최근에 발급된 seq 의 결과가 이미 반영된 뒤
  // 도착한 완료(=자신보다 새 seq 가 이미 적용됨)는 폐기해 늦게 온 응답이 상태를 덮어쓰지 못하게 한다.
  const assetSeqRef = useRef(0);
  const lastAssetSeqRef = useRef(0);
  const prevLOD = useRef({ l2: false, l3: false });
  const didAutoLocate = useRef(false);
  // 마운트 시점의 locateOnMount 값 — 이후 prop 이 false→true 로 뒤집혀도 자동 locate 를 하지 않는다.
  // 호출부가 이 prop 을 반응형 조건(mode==='viewport' / locationMode==='all')에 묶어 두어, 지역
  // 필터 ✕ 해제로 조건이 참이 되는 순간 GPS 재측정 + 카메라 딥줌이 발화하던 버그(대표 지적
  // 2026-08-04: "필터만 풀려야 하는데 위치도 다시 잡고 다시 렌더링") — prop 이름대로 마운트 1회로 고정.
  const locateOnMountAtMount = useRef(locateOnMount);
  // meDotOnMount 도 같은 이유로 마운트 1회 — 지역 필터 ✕ 해제로 조건이 뒤집힐 때 재측위 금지.
  const meDotOnMountAtMount = useRef(meDotOnMount && !locateOnMount);
  const didMeDotLocate = useRef(false);
  // 라벨 디클러터 히스테리시스 — 직전 프레임의 표시 라벨 집합(깜빡임 방지용)
  const prevVisibleRef = useRef<ReadonlySet<string | number>>(new Set());
  // 마운트 rAF(빈 deps)가 최신 focusLatLng 를 부르기 위한 latest-ref (onViewportChangeRef 와 동일 패턴)
  const focusLatLngRef = useRef<((pos: { lat: number; lng: number }, opts?: { silent?: boolean; selectRegion?: boolean; suppressBbox?: boolean; noMeDot?: boolean }) => void) | null>(null);
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
    // 앵커도 라벨과 동일하게 위치만 회전한다(D-B) — 카메라 중심 기준(getCamCenter), viewBox
    // 중심이 아니다. bearing===0 이면 rotatePoint 의 항등 반환으로 기존 px/py 와 동일.
    const { x: camCx, y: camCy } = getCamCenter();
    const { x: ux, y: uy } = rotatePoint(lx(pos.lng), ly(pos.lat), camCx, camCy, -bearing);
    const px = (ux - vb.x) / vb.w * cw;
    const py = (uy - vb.y) / vb.h * ch;
    if (px < 0 || px > cw || py < 0 || py > ch) {
      el.style.visibility = 'hidden';
      return;
    }
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    // 꼬리 간격: 마커 halo 화면 반지름(r×1.4, 업체 핀 r:1.15 기준) + 꼬리 돌출(≈11px) + 여백
    // 말풍선이 핀과 상호 라벨을 덮지 않도록 지도 위쪽으로 한 단계 더 띄운다.
    const gap = cw * 0.015 * 1.15 * 1.4 + 26;
    const bx = Math.min(Math.max(px - bw / 2, 8), Math.max(8, cw - bw - 8));
    const by = py - gap - bh;
    el.style.transform = `translate(${bx}px, ${by}px)`;
    el.style.setProperty('--tail-x', `${Math.min(Math.max(px - bx, 20), bw - 20)}px`);
    el.style.visibility = 'visible';
  }, [getCamCenter, bearing]);

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

  // 검색범위(query bbox) 크롭 전용 — clampVB/센터링(getBottomInsetUnits, 팬·줌·포커스 전용)과는
  // 완전히 분리된 별도 산출식이다. px→unit 변환은 동일한 scaleY(viewHeight/pxHeight, preserveAspectRatio
  // ="none" 이므로 X/Y 스케일이 다를 수 있어 세로축은 반드시 세로 스케일로 환산)를 재사용하되,
  // 상단은 queryTopInsetPx(검색바+칩 실측, topInsetPx와 별개 — 상태바 높이 포함), 하단은
  // queryBottomInsetPx(시트 최소화 높이, 고정)를 쓴다. 각 변을 최대 45%로 캡(둘 다 캡에 걸려도
  // 최소 10%는 남아 bbox 역전 방지).
  const getQueryCropUnits = useCallback((viewHeight: number) => {
    const svg = svgRef.current;
    const pxHeight = svg?.clientHeight || containerRef.current?.clientHeight || 1;
    const scaleY = viewHeight / pxHeight;
    const cap = viewHeight * 0.45;
    return {
      top: Math.max(0, Math.min(cap, queryTopInsetPx * scaleY)),
      bottom: Math.max(0, Math.min(cap, queryBottomInsetPx * scaleY)),
    };
  }, [queryTopInsetPx, queryBottomInsetPx]);

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
        focusLatLngRef.current?.(initialGps, { silent: true, selectRegion: selectRegionOnLocate, noMeDot: true });
        return;
      }
      const dataX1 = lx(D1_BBOX.W), dataX2 = lx(D1_BBOX.E);
      const dataCX = (dataX1 + dataX2) / 2;
      const dataCY = (ly(D1_BBOX.N) + ly(D1_BBOX.S)) / 2;
      // [초기 줌 정책] 기본 = D1 전체 조망(줌 게이트 위: 구역 뱃지 O / 핀 X) — md/상급자 지시대로 전체지도 시작 유지.
      //   (권도일 의견) 처음부터 줌인 상태가 UX상 나을 수 있음. 원하면 아래 initW 를 게이트 통과값
      //   (예: Math.max(MIN_VBW, L3_VBW * 0.9))으로 바꿔 줌인 시작 — 값은 실기 튜닝 필요.
      //   (const 재선언 불가라 "주석 해제"가 아니라 위 initW 값 교체 방식)
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
      const seq = ++assetSeqRef.current;
      fetches.push(
        fetch(`${ASSET_BASE}${slug}/depth2.json`)
          .then((r) => r.json())
          .then((d: Depth2Data) => {
            entry.d2 = d;
            if (seq >= lastAssetSeqRef.current) { lastAssetSeqRef.current = seq; setAssetLoadFailed(false); }
          })
          .catch(() => {
            if (seq >= lastAssetSeqRef.current) { lastAssetSeqRef.current = seq; setAssetLoadFailed(true); }
          })
          .finally(() => loadingRef.current.delete(key2)),
      );
    }
    if (needD3 && !entry.d3 && !loadingRef.current.has(key3)) {
      loadingRef.current.add(key3);
      const seq = ++assetSeqRef.current;
      fetches.push(
        fetch(`${ASSET_BASE}${slug}/depth3.json`)
          .then((r) => r.json())
          .then((d: Depth3Data) => {
            // (랭크, 폭) 오름차순 정렬 — 랭크 우선(등급별 casing-fill 그룹 경계), 폭은 그룹 내부 2차 키 (캐시 전 1회)
            d.roads.sort((a, b) => (ROAD_RANK[a.c] ?? 0) - (ROAD_RANK[b.c] ?? 0) || a.w - b.w);
            // 피처 단위 뷰포트 컬링용 bbox 사전계산 (로드 시 1회, 정렬 이후라 roads 인덱스와 정합)
            d.roadBox = d.roads.map((road) => computeBBox(road.p));
            d.bldgBox = d.bldg.map((p) => computeBBox(p));
            entry.d3 = d;
            if (seq >= lastAssetSeqRef.current) { lastAssetSeqRef.current = seq; setAssetLoadFailed(false); }
          })
          .catch(() => {
            if (seq >= lastAssetSeqRef.current) { lastAssetSeqRef.current = seq; setAssetLoadFailed(true); }
          })
          .finally(() => loadingRef.current.delete(key3)),
      );
    }

    if (fetches.length > 0) {
      await Promise.all(fetches);
      setWardData((prev) => ({ ...prev, [slug]: { ...entry } }));
    }
  }, []);

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
      // raw(크롭 이전) 컨테이너 기하 사각형을 먼저 emit — (N+S)/2가 실제 컨테이너 중심과
      // 일치한다(핀 크로스헤어 등 raw 중심 소비처용). 아래 크롭 bbox보다 먼저 호출해, 소비자가
      // 같은 tick 안에서 cropped 핸들러 실행 시점에 이미 최신 raw ref를 읽을 수 있게 한다.
      onRawViewportChange?.({
        N: uy2lat(vb.y),
        S: uy2lat(vb.y + vb.h),
        W: ux2lng(vb.x),
        E: ux2lng(vb.x + vb.w),
      });
      // 조회(query) bbox = UI 크롬(상단 검색바+칩, 하단 시트 최소화 높이)에 가린 영역을 뺀
      // "가시-안전 사각형" 기준 — LOD(l2/l3, 위 vb.w 기준)·렌더 뷰포트(viewBox)·제스처와는
      // 무관하게 이 emit 값에만 적용한다.
      const { top: topCropUnits, bottom: bottomCropUnits } = getQueryCropUnits(vb.h);
      onBboxChange?.({
        N: uy2lat(vb.y + topCropUnits),
        S: uy2lat(vb.y + vb.h - bottomCropUnits),
        W: ux2lng(vb.x),
        E: ux2lng(vb.x + vb.w),
      });
    }

    const markerDepthReady = markerDepth === 'l2' ? l2 : l3;
    // 순수 줌 깊이 신호만 emit — 여기에 `&& !(polyActive && selWard !== null)` 억제를 다시
    // 넣지 말 것(회귀 이력 2026-08-04). 그 조건의 목적(지역 선택 중 구 집계 배지 감추기)은
    // 아래 배지 렌더 조건 `!(polyActive && selWard !== null)` 이 이미 독립적으로 처리한다.
    // 소비자(NeighborhoodMapCanvas/MarketMain)는 이 신호를 "줌아웃 시 핀·말풍선·패널 정리"
    // 게이트로 쓰므로, 지역 선택 상태에서 항상 false 를 emit 하면 정리 게이트가 영구 개방돼
    // 줌아웃해도 말풍선만 허공에 남는 결함이 됐다(대표 지적).
    onDepthChange?.(!markerDepthReady, !l3);

    if (!l2) return;
    // 나침반 회전 중엔 프리로드 판정도 회전 bbox(cullVb)로 — 안 하면 회전한 화면 모서리에
    // 들어온 ward 의 depth2 가 아직 안 실려 렌더 시점(showL2 블록)에 빈 구간이 보인다(D-C).
    const { x: camCx, y: camCy } = getCamCenter();
    const cullVb = rotatedBBoxOfRect(vb, camCx, camCy, bearing);
    depth1.wards.forEach((w, i) => {
      if (!w.slug || !wardInView(i, cullVb)) return;
      void loadWardData(w.slug as string, l3 && !lightweight);
    });
  }, [lightweight, loadWardData, markerDepth, onBboxChange, onRawViewportChange, onDepthChange, getQueryCropUnits, getCamCenter, bearing]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  // followMode 관측 통지 — enableFollowCompass=false 면 이 이펙트 자체가 나가지 않는다(off 경로
  // 완전 동일성 보장, D-H 8.3). true 라도 이 단계에선 followMode 가 'free' 밖으로 나가지 않으므로
  // 실질 통지는 아직 없다 — 자리만 마련(§7 step 5~8이 순환 트리거를 추가하면 여기서 발화한다).
  useEffect(() => {
    if (!enableFollowCompass) return;
    onFollowModeChange?.(followMode);
  }, [enableFollowCompass, followMode, onFollowModeChange]);

  // 컨테이너 비율 변화(화면 회전 등) 시 vb 비율 불변식(vb.h = vb.w × ar) 재계산 — §2.3/D-A.
  // 카메라 함수(applyZoom/focusLatLng/fitToPoints/zoomInRef)는 호출 시점의 ar을 반영해 항상
  // 최신이지만, 카메라 함수 호출 없이 컨테이너만 리사이즈되면(iOS 는 세로 고정이 아니라 회전을
  // 허용한다 — native/ios/SaigonRider.xcodeproj/project.pbxproj 의
  // INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone/_iPad 확인, Android 만 portrait 고정)
  // vb 가 낡은 비율로 남아 preserveAspectRatio="none" 합성이 비균등해진다. 중심을 유지한 채 h만 보정한다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const svg = svgRef.current;
      const cw = svg?.clientWidth, ch = svg?.clientHeight;
      if (!cw || !ch) return;
      const ar = ch / cw;
      const v = vbRef.current;
      const expectedH = v.w * ar;
      if (Math.abs(expectedH - v.h) < 0.5) return;
      vbRef.current = clampVB({ ...v, y: v.y - (expectedH - v.h) / 2, h: expectedH });
      setVBAttr();
      onViewportChange();
      setVbSnap((n) => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampVB, onViewportChange, setVBAttr]);

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

  const focusLatLng = useCallback((pos: { lat: number; lng: number }, opts?: { silent?: boolean; selectRegion?: boolean; suppressBbox?: boolean; noMeDot?: boolean }) => {
    // noMeDot: 마운트 재진입 좌표(storedCoords)는 실제 GPS fix 가 아니라 폴백(HCMC 중심)일 수
    // 있으므로 "내 위치" dot 을 찍지 않는다 — 서비스지역 밖 유저에게 가짜 위치점을 안 만드는
    // runLocate 원칙(setMeLatLng(null))을 마운트 포커스에도 일관 적용. 카메라 이동만 수행.
    if (!opts?.noMeDot) setMeLatLng(pos);

    const d1x = (pos.lng - D1_BBOX.W) / (D1_BBOX.E - D1_BBOX.W) * depth1.VW;
    const d1y = (D1_BBOX.N - pos.lat) / (D1_BBOX.N - D1_BBOX.S) * depth1.VH;
    const idx = depth1.wards.findIndex((w) => !!w.slug && pointInPoly(d1x, d1y, w.p));

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
    } else if (idx < 0 && !opts?.silent) {
      toast.neutral(t('map.locateNotFound', { defaultValue: '위치를 찾을 수 없어요' }));
    }
  }, [clampVB, getBottomInsetUnits, loadWardData, onRegionSelect, onViewportChange, setVBAttr, t]);
  focusLatLngRef.current = focusLatLng;

  // 선택 동 좌표 → selWard 동기화 (카메라 이동 없음). initialViewport 복원 경로가 focusLatLng 를
  // 건너뛰어 selWard 가 null 로 남던 문제를 메운다 — 경계 강조와 뷰포트 기억을 양립시킨다.
  // deps 는 원시값(lat/lng)으로 — 호출부가 매 렌더 새 객체를 넘겨도 이펙트가 재실행되지 않는다.
  const activeLat = activeRegionAt?.lat ?? null;
  const activeLng = activeRegionAt?.lng ?? null;
  useEffect(() => {
    if (activeLat == null || activeLng == null) return;
    const d1x = (activeLng - D1_BBOX.W) / (D1_BBOX.E - D1_BBOX.W) * depth1.VW;
    const d1y = (D1_BBOX.N - activeLat) / (D1_BBOX.N - D1_BBOX.S) * depth1.VH;
    const idx = depth1.wards.findIndex((w) => !!w.slug && pointInPoly(d1x, d1y, w.p));
    if (idx < 0) return;
    setSelWard(idx);
    const slug = depth1.wards[idx].slug as string | undefined;
    if (slug) void loadWardData(slug, false);
  }, [activeLat, activeLng, loadWardData]);

  // ── GPS 위치 ───────────────────────────────────────────────
  const runLocate = useCallback(async () => {
    onLocate?.();
    try {
      const location = await resolveUsableLocation();
      if (location.source === 'fallback') {
        toast.neutral(outsideAreaMessage ?? t('market.outOfService', { defaultValue: '서비스 지역 밖이에요' }));
        setMeLatLng(null);
        if (!outsideAreaFallback) return;
      }
      focusLatLng(location.coords, {
        selectRegion: selectRegionOnLocate,
        noMeDot: location.source === 'fallback',
      });
      onLocated?.(location.coords, location);
    } catch {
      // 측정 실패 시 임의 지역(기본 좌표) 딥줌·가짜 위치점 폴백을 하지 않는다 —
      // 뷰포트 유지 + 안내만 (시나리오 3.4)
      toast.neutral(t('map.locateFailed', { defaultValue: '위치를 가져올 수 없어요' }));
    }
  }, [focusLatLng, onLocate, onLocated, outsideAreaFallback, outsideAreaMessage, selectRegionOnLocate, t]);

  // ◎ 버튼: 항상 GPS 를 다시 측정해 "내 위치"로 센터링 + 줌인한다(focusLatLng 가 L3_VBW*0.9,
  // 즉 건물/골목이 보이는 최소 줌까지 맞춘다). 종전엔 "동 선택 중이면 그 동 중심으로" 분기가
  // 있었으나, 지역 선택이 폐기돼(2026-08-06) 갈 곳이 하나뿐이다.
  const recenterCurrentContext = useCallback(() => {
    void runLocate();
  }, [runLocate]);

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
    if (locateOnMountAtMount.current && !didAutoLocate.current) {
      didAutoLocate.current = true;
      void runLocate();
    }
  }, [runLocate]);

  useEffect(() => {
    // 내 위치 점만 찍는 조용한 측위 — 카메라/지역선택을 건드리지 않아 선택 동 경계와 어긋날
    // 여지가 없다. 서비스 지역 밖(fallback)이면 그 좌표는 내 위치가 아니므로 점을 찍지 않는다.
    if (!meDotOnMountAtMount.current || didMeDotLocate.current) return;
    didMeDotLocate.current = true;
    void resolveUsableLocation()
      .then((location) => {
        if (location.source === 'device') setMeLatLng(location.coords);
      })
      .catch(() => undefined); // 장식용 점 — 실패 시 조용히 포기(안내는 위치 기능 호출부 책임)
  }, []);

  // 내 위치 점의 실시간 추종 (대표 지적 2026-08-05: "gps 로 표시는 하는데 실시간 반영을 안 한다").
  // 점이 한 번 찍힌 뒤(=실측 성공)에만 watch 를 걸어, 점을 안 쓰는 화면(위치 피커 등)에서는
  // GPS 를 켜지 않는다. **카메라는 따라가지 않는다** — 표시 전용 (service-rules 원칙 5).
  // 언마운트/점 소멸 시 watch 해제. 서비스 지역 밖 좌표는 갱신을 건너뛴다(마지막 유효 위치 유지).
  const meDotActive = meLatLng !== null;
  useEffect(() => {
    if (!meDotActive) return;
    return native.watchLocation((pos) => {
      if (!inServiceArea(pos.lat, pos.lng)) return;
      setMeLatLng({ lat: pos.lat, lng: pos.lng });
    });
  }, [meDotActive]);

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
    if (zoomInRef) {
      zoomInRef.current = (pos) => {
        const svg = svgRef.current;
        const ar = svg ? svg.clientHeight / svg.clientWidth : 1;
        const targetW = L3_VBW * 0.9; // focusLatLng와 동일한 게이트 통과 목표 줌
        const cx = lx(pos.lng), cy = ly(pos.lat);
        const targetH = targetW * ar;
        const insetUnits = getBottomInsetUnits(targetH);
        vbRef.current = clampVB({ x: cx - targetW / 2, y: cy - targetH / 2 + insetUnits / 2, w: targetW, h: targetH });
        setVBAttr();
        onViewportChange();
        setVbSnap((n) => n + 1);
      };
    }
    return () => { if (zoomInRef) zoomInRef.current = null; };
  }, [zoomInRef, clampVB, getBottomInsetUnits, onViewportChange, setVBAttr]);

  const lastQueryInsetRef = useRef(bottomInsetPx);
  useEffect(() => {
    if (lastQueryInsetRef.current === bottomInsetPx) return;
    lastQueryInsetRef.current = bottomInsetPx;
    // 가시 영역 inset이 실제로 달라졌으면 같은 카메라에서도 query bbox를 정확히 한 번 갱신한다.
    onViewportChange();
  }, [bottomInsetPx, onViewportChange]);

  useEffect(() => {
    // 선택 모드 변화는 LOD/뱃지만 다시 계산하고 query bbox는 유지한다.
    onViewportChange(true);
  }, [onViewportChange, polyActive, selWard]);

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
      const rawCx = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
      const rawCy = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
      // 화면→viewBox 직선 매핑(raw)은 회전 전 좌표다. 지형은 화면에서 -bearing 만큼 돌아
      // 보이므로, 줌 중심이 포인터 아래 지형과 계속 일치하려면 +bearing 만큼 되돌려야 한다(§2.5).
      const { x: camCx, y: camCy } = getCamCenter();
      const { x: cx, y: cy } = rotatePoint(rawCx, rawCy, camCx, camCy, bearing);
      applyZoom(e.deltaY > 0 ? 1.12 : 0.89, cx, cy);
      onViewportChange();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, onViewportChange, selectionOnly, getCamCenter, bearing]);

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
        const rawCx = vb.x + (((a.x + b.x) / 2 - r.left) / r.width) * vb.w;
        const rawCy = vb.y + (((a.y + b.y) / 2 - r.top) / r.height) * vb.h;
        // 핀치 중심도 휠과 동일한 이유로 +bearing 되돌림(§2.5).
        const { x: camCx, y: camCy } = getCamCenter();
        const { x: cx, y: cy } = rotatePoint(rawCx, rawCy, camCx, camCy, bearing);
        applyZoom(g.lastD / dist, cx, cy);
      }
      g.lastD = dist;
      g.moved = true;
      return;
    }
    if (g.lastP) {
      const dxRaw = ((e.clientX - g.lastP.x) / r.width) * vb.w;
      const dyRaw = ((e.clientY - g.lastP.y) / r.height) * vb.h;
      if (Math.abs(e.clientX - g.lastP.x) + Math.abs(e.clientY - g.lastP.y) > 3) g.moved = true;
      // 팬 델타는 화면 좌표계 벡터다 — 지형이 -bearing 만큼 돌아 보이므로, 지도 좌표계로
      // 되돌리려면 +bearing 만큼 회전한다(벡터라 중심 없이 rotateVec 로 충분, §2.5).
      const { x: dx, y: dy } = rotateVec(dxRaw, dyRaw, bearing);
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
    // 핀치(2)→팬(1) 전환: 남은 포인터로 팬 기준점(lastP)을 리셋한다. 안 하면 다음 팬 이동이
    // 핀치 시작 시점의 stale lastP 와의 큰 차이를 dx/dy 로 계산해 지도가 튄다(간헐적 포커스 점프).
    if (g.pts.size === 1) { const [p] = [...g.pts.values()]; g.lastP = { x: p.x, y: p.y }; }
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
    const rawMx = vb.x + ((tapX - r.left) / r.width) * vb.w;
    const rawMy = vb.y + ((tapY - r.top) / r.height) * vb.h;
    // 탭 좌표도 휠·핀치와 동일 이유로 +bearing 되돌림(§2.5).
    const { x: camCx, y: camCy } = getCamCenter();
    const { x: mx, y: my } = rotatePoint(rawMx, rawMy, camCx, camCy, bearing);

    if (pickMode) {
      onPointPick?.({ lat: uy2lat(my), lng: ux2lng(mx) });
      return;
    }

    // 통합 좌표 → depth1 SVG 좌표
    const d1x = (mx - lx(D1_BBOX.W)) / (lx(D1_BBOX.E) - lx(D1_BBOX.W)) * depth1.VW;
    const d1y = (my - ly(D1_BBOX.N)) / (ly(D1_BBOX.S) - ly(D1_BBOX.N)) * depth1.VH;

    const idx = depth1.wards.findIndex((_, i) => wardInView(i, vb) && pointInPoly(d1x, d1y, depth1.wards[i].p));
    if (idx >= 0 && onRegionSelect) {
      // 지역 선택 재활성 (2026-07-25) — onRegionSelect 를 넘긴 소비자(동네지도·침수)에서만
      // 오버뷰 ward 폴리곤 탭이 그 동을 선택한다. onRegionSelect 미전달 소비자(피커로만 선택하는
      // 주유/정비 등)에는 탭이 아무 동작도 하지 않아 기존 동작이 유지된다.
      setSelWard(idx);
      const region = buildWardRegion(idx);
      if (region) onRegionSelect(region);
    }
  };

  // 줌 +/- 도구는 핀치·휠 제스처와 중복되어 현재 숨김.
  // 다시 노출할 때는 아래 위치에 zoomIn/zoomOut 핸들러와 .zoomControls JSX를 복원한다.

  // ── LOD 상태 (render 시점 기준) ────────────────────────────
  const vb = vbRef.current;
  const showL2 = vb.w < L2_VBW;
  // 나침반 회전 중(bearing!==0)엔 L3(건물)를 렌더하지 않는다(D-C, §4·§7 step 7) — 오버스캔으로
  // 피처가 최대 2배 늘어나는 구간을 저사양 기기에서 감당하지 못한다. bearing===0(킬스위치·자유·
  // 추종 모드)이면 기존과 동일하게 L3_VBW 임계만으로 게이트된다.
  const showL3 = L3_ENABLED && !lightweight && vb.w < L3_VBW && bearing === 0;
  // 도로폭 배율·건물 음영 게이트 — 마커 r 과 동일하게 render 시점 vb 기준 (제스처 종료 시 재계산).
  // 음영 duplicate 는 건물 노드를 2배로 만들므로 딥줌 절반(vbW<350)부터만 적용해 노드를 아낀다.
  const roadK = roadWidthK(vb.w);
  const bldgShadow = vb.w < L3_VBW * 0.5;

  // depth1 nested SVG 위치 (통합 좌표)
  const d1Rect = bboxToRect(D1_BBOX);

  // 회전 중심(camCx/camCy) — 지형 회전 <g>(D-G)·라벨/마커 위치회전(rotUnified, D-B) 공통 기준.
  // enableFollowCompass=false 여도 계산 자체는 항상 수행하되(bearing=0 이라 rotUnified 는
  // 항등), 회전 <g> 렌더는 아래 반환부에서 플래그로만 게이트한다(D-H).
  const { x: camCx, y: camCy } = getCamCenter();
  const rotUnified = (lng: number, lat: number) => rotatePoint(lx(lng), ly(lat), camCx, camCy, -bearing);
  // 컬링 사각형 회전 bbox 확장(D-C, §7 step 7) — L2 ward 렌더 컬링(wardInView)은 축정렬 vb 를
  // 그대로 쓰면 회전한 모서리의 ward 를 누락한다. bearing===0(킬스위치 경로 포함)이면 vb 그대로.
  const cullVb = rotatedBBoxOfRect(vb, camCx, camCy, bearing);

  // ── 라벨 디클러터 ──────────────────────────────────────────
  // 겹치는 라벨을 우선순위(선택>뱃지>POI>일반, 동률 시 가시영역 중앙거리)로 정리한다.
  // 라벨(<text>)만 게이팅 — 아이콘/핀은 항상 유지. 단, 라벨은 다른 마커의 아이콘/핀과
  // 겹쳐도 숨겨진다 — 그래서 라벨 없는 마커도 후보 배열에 넣어 아이콘 박스를 시드해야 한다.
  // null 이면 디클러터 없이 전부 표시.
  // 제스처 종료(vbSnap 갱신) 시 1회 재계산 — vbRef 는 deps 에 넣지 않아 매 프레임 계산을 피한다.
  const visibleLabelIds = useMemo<Set<string | number> | null>(() => {
    if (!markers || !(forceMarkers || vb.w < L2_VBW)) return null;
    const svg = svgRef.current;
    const cw = svg?.clientWidth ?? 0;
    const ch = svg?.clientHeight ?? 0;
    if (cw <= 0 || ch <= 0) return null; // 컨테이너 미측정 — 디클러터 없이 전부 표시
    const v = vbRef.current;
    const cands: DeclutterMarker[] = [];
    for (const m of markers) {
      // 회전 후 좌표로 겹침 판정해야 정확하다(설계서 §3) — rotUnified 는 bearing===0 이면 항등.
      const { x: mx, y: my } = rotUnified(m.lng, m.lat);
      if (mx < v.x - 50 || mx > v.x + v.w + 50 || my < v.y - 50 || my > v.y + v.h + 50) continue;
      const sx = ((mx - v.x) / v.w) * cw;
      const sy = ((my - v.y) / v.h) * ch;
      // 화면 px 는 줌 불변(r 이 vb.w 에 비례) — r_px = 0.015 × (m.r) × cw. 렌더 루프의 각 kind
      // 라벨 오프셋/폰트(units)와 아이콘 지오메트리(units)를 그대로 px 로 환산한다.
      const rpx = 0.015 * (m.r ?? 1) * cw;

      // 선택된 매물/피드는 teardrop 이라 라벨을 그리지 않는다(렌더 루프와 동일) — 라벨 후보 제외.
      // 아이콘(teardrop)은 여전히 그려지므로 장애물 시드에는 포함한다.
      const noLabel = !m.label || (m.selected && (m.kind === 'listing' || m.kind === 'feed'));
      let fontSize = 0;
      let labelTop = 0;
      let poiTier = 0;
      if (!noLabel) {
        if (m.kind === 'biz') {
          fontSize = rpx * (m.selected ? 1.5 : 1.1);
          labelTop = sy + rpx * (m.selected ? 1.05 : 0.65);
        } else if (m.kind === 'poi') {
          fontSize = rpx * 1.1 + 2 * (cw / v.w); // 렌더의 (r*1.1 + 2 units)
          labelTop = sy + rpx * 1.05 * 1.35; // half=r*1.05, y=my+half*1.35
          // POI 등급은 색으로만 판별 가능(MapMarkerV2 에 카테고리 필드 없음) — 호출부(NeighborhoodMap)
          // 뮤트 톤 landmark=#74847f / civic=#8b909a 와 결합. 그 외/미지정은 기타 POI(tier 0).
          poiTier = m.color === '#74847f' ? 2 : m.color === '#8b909a' ? 1 : 0;
        } else {
          fontSize = rpx * 1.5;
          labelTop = sy + rpx * 2.0;
        }
      }

      // 아이콘 AABB — 렌더 루프(아래 markers?.map 블록)의 실제 도형 크기를 화면 px 로 환산.
      let iconLeft: number, iconRight: number, iconTop: number, iconBottom: number;
      if (m.kind === 'biz' && m.selected) {
        // teardrop 핀(BIZ_PIN_PATH) — 머리 半width 9·s(s=r*1.25/9)=1.25r, 상단 24·s=3.333r, 팁=중심.
        // 외곽 scale(1.5) 가 (mx,my) 기준으로 적용되어 半width→1.875r, 상단 오프셋→5.0r.
        iconLeft = sx - 1.875 * rpx; iconRight = sx + 1.875 * rpx;
        iconTop = sy - 5.0 * rpx; iconBottom = sy;
      } else if (m.kind === 'biz') {
        // 원형 아이콘 — center (mx, my-0.8r) radius 0.92r(+stroke/badge 여유 포함 1.03r).
        const cy = sy - 0.8 * rpx, cr = 1.03 * rpx;
        iconLeft = sx - cr; iconRight = sx + cr; iconTop = cy - cr; iconBottom = cy + cr;
      } else if (m.kind === 'poi') {
        // 뮤트 칩 — half=r*1.05 + 테두리(strokeWidth half*0.14 의 절반 돌출) ≈ 1.12r (halo 제거됨).
        const half = 1.12 * rpx;
        iconLeft = sx - half; iconRight = sx + half; iconTop = sy - half; iconBottom = sy + half;
      } else if (m.selected && (m.kind === 'listing' || m.kind === 'feed')) {
        // 매물/피드 선택 승격 teardrop — biz 선택과 동일 지오메트리(BIZ_PIN_PATH 공용).
        iconLeft = sx - 1.875 * rpx; iconRight = sx + 1.875 * rpx;
        iconTop = sy - 5.0 * rpx; iconBottom = sy;
      } else {
        // 원형 dot — halo 1.4r, 선택 시 강조링 1.75r(+stroke 여유 1.86r) 이 더 크다.
        const dr = (m.selected ? 1.86 : 1.4) * rpx;
        iconLeft = sx - dr; iconRight = sx + dr; iconTop = sy - dr; iconBottom = sy + dr;
      }

      cands.push({
        id: m.id, kind: m.kind, selected: m.selected, badge: m.badge, poiTier,
        labelCx: sx, labelTop, fontSize, text: noLabel ? '' : (m.label as string), sx, sy,
        iconLeft, iconRight, iconTop, iconBottom,
      });
    }
    const centerX = cw / 2;
    const centerY = (topInsetPx + (ch - bottomInsetPx)) / 2; // 하단 시트/상단 오버레이 보정 중심
    return computeVisibleLabels(cands, { centerX, centerY, prevVisible: prevVisibleRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, vbSnap, forceMarkers, bottomInsetPx, topInsetPx]);

  // 히스테리시스 미러 — 표시 집합을 다음 재계산의 직전 상태로 보관(렌더 중 ref 쓰기 회피)
  useEffect(() => {
    if (visibleLabelIds) prevVisibleRef.current = visibleLabelIds;
  }, [visibleLabelIds]);

  // ── L3 상세 레이어(건물/도로 depth3) 렌더 ─────────────────────────────────
  // 상단 L3_ENABLED 플래그 + showL3(=L3_ENABLED && !lightweight && vbW<L3_VBW) 게이트
  // 하에서만 호출된다. 상세지도를 끄려면 상단 L3_ENABLED 를 false 로.
  // (ward 별 nested SVG — 피처 단위 뷰포트 컬링 적용. 마커/핀 렌더와는 무관.)
  const renderL3Layer = () => depth1.wards.map((w, i) => {
    if (!w.slug || !wardInView(i, vb)) return null;
    if (polyActive && selWard !== null && i !== selWard) return null;
    const d = wardData[w.slug as string];
    if (!d?.d3) return null;
    const d3 = d.d3;
    const r = bboxToRect(d3.bbox);
    // 피처 단위 뷰포트 컬링 — ward 전체가 아니라 현재 뷰포트(+마진)와 교차하는
    // 건물/도로만 렌더한다(§FEATURE_CULL_MARGIN). 통합 좌표(vb) → ward-local(VW/VH)
    // 변환 후 사전계산된 bbox(entry.d3.bldgBox/roadBox, 로드 시 1회)와 비교.
    const lvx1 = (vb.x - r.x) / r.w * d3.VW;
    const lvy1 = (vb.y - r.y) / r.h * d3.VH;
    const lvx2 = (vb.x + vb.w - r.x) / r.w * d3.VW;
    const lvy2 = (vb.y + vb.h - r.y) / r.h * d3.VH;
    const mgx = (lvx2 - lvx1) * FEATURE_CULL_MARGIN;
    const mgy = (lvy2 - lvy1) * FEATURE_CULL_MARGIN;
    const cx1 = lvx1 - mgx, cy1 = lvy1 - mgy, cx2 = lvx2 + mgx, cy2 = lvy2 + mgy;
    const bldgBox = d3.bldgBox;
    // 필터링된 값 배열이 아니라 원본 인덱스 배열을 만든다 — React key를 필터 결과의
    // 로컬 위치가 아니라 안정적인 원본 인덱스로 매겨, 컬링 결과가 렌더마다 달라져도
    // 같은 건물/도로가 같은 key를 유지한다(순수 도형이라 기능버그는 아니었지만 더 안전).
    const bldgIdxInView = bldgBox
      ? d3.bldg.map((_, bi) => bi).filter((bi) => boxIntersects(bldgBox[bi], cx1, cy1, cx2, cy2))
      : d3.bldg.map((_, bi) => bi);
    const roadBox = d3.roadBox;
    const roadIdxInView = roadBox
      ? d3.roads.map((_, ri) => ri).filter((ri) => boxIntersects(roadBox[ri], cx1, cy1, cx2, cy2))
      : d3.roads.map((_, ri) => ri);
    return (
      <svg key={`l3-${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
        viewBox={`0 0 ${d3.VW} ${d3.VH}`} preserveAspectRatio="none" overflow="visible">
        {d3.water.map((p, pi) => <polygon key={pi} points={p} className={styles.water} />)}
        {d3.wline.map((p, pi) => <polyline key={pi} points={p} className={styles.wline} />)}
        {/* 건물 음영 — y+오프셋 어두운 duplicate 를 아래 깔아 입체감 (SVG filter 는 개수상 성능 위험) */}
        {bldgShadow && (
          <g transform="translate(0.9, 1.3)" pointerEvents="none">
            {bldgIdxInView.map((bi) => <polygon key={bi} points={d3.bldg[bi]} className={styles.bldgShadow} />)}
          </g>
        )}
        {bldgIdxInView.map((bi) => <polygon key={bi} points={d3.bldg[bi]} className={styles.bldg} />)}
        {/* 도로 랭크별 casing-fill 페어: 랭크 오름차순으로 그룹의 casing 전부 → 그 그룹의 fill 전부를 그려
            상위 등급 casing이 하위 등급 fill에 덮이지 않는다 (표준 카토그래피 casing-fill-casing-fill 반복).
            컬링은 그룹핑 전에 적용 — 순서는 그대로 유지되므로 랭크 그룹 경계는 안 깨진다. */}
        {groupRoadIdxByRank(roadIdxInView, d3.roads).flatMap((group) => [
          ...group.map((ri) => {
            const road = d3.roads[ri];
            return ROAD_CASING[road.c] ? (
              <polyline key={`c${ri}`} points={road.p} stroke={ROAD_CASING[road.c]}
                strokeWidth={road.w * roadK * CASING_RATIO} className={styles.road} />
            ) : null;
          }),
          ...group.map((ri) => {
            const road = d3.roads[ri];
            return (
              <polyline key={`f${ri}`} points={road.p} stroke={ROAD_FILL[road.c] ?? road.c}
                strokeWidth={road.w * roadK} className={styles.road} />
            );
          }),
        ])}
      </svg>
    );
  });

  // 지형(배경·동 경계·블록·건물·선택 동 테두리) — 나침반 모드에서 회전 <g>(D-G) 안에 들어가는
  // 부분만 모아 둔다(설계서 §3.3 "안" 목록). 라벨·마커·내 위치는 별도로 위치만 회전(D-B)하므로
  // 여기 포함하지 않는다.
  const terrain = (
    <>
      {/* 배경 (수면) */}
      <rect x={-BASE_W} y={-BASE_H} width={BASE_W * 3} height={BASE_H * 3} className={styles.sea} />

      {/* HCMC 전역 윤곽(선택적) — Layer 1 도심 폴리곤보다 뒤에 깔리는 저대비 배경 실루엣 */}
      {cityOutline && cityOutline.rings.map((ring, i) => (
        <polygon
          key={`outline-${i}`}
          points={ring.map(([lat, lng]) => `${lx(lng)},${ly(lat)}`).join(' ')}
          className={styles.cityOutline}
        />
      ))}

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
            // 외부 동도 여기서 함께 그린다 — .wardDim 은 "가리는 마스크"가 아니라 감쇠
            // 레이어다(얕은 알파로 stage 배경이 비쳐 푸른톤이 되고 지형이 은은히 남는다).
            // 별도 오버레이로 덮으려던 시도는 선택 동이 섬처럼 보여 반려됐다(2026-08-04).
            return (
              <polygon key={i} points={w.p as string}
                className={i === selWard ? styles.wardBoundary : styles.wardDim}
              />
            );
          }
          return (
            <polygon key={i} points={w.p as string}
              className={showL2 ? styles.ward : styles.wardOverview}
            />
          );
        })}
      </svg>

      {/* Layer 2: 블록 (ward별 nested SVG) */}
      {showL2 && depth1.wards.map((w, i) => {
        if (!w.slug || !wardInView(i, cullVb)) return null;
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

      {/* Layer 3: 건물 (ward별 nested SVG) — renderL3Layer() 로 분리, 상단 L3_ENABLED 플래그로 게이트 */}
      {showL3 && renderL3Layer()}

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
    </>
  );

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
        <defs>
          {/* 업체 핀 접지 그림자 — feGaussianBlur filter 대신 radialGradient 타원
              (핀 최대 200개에서 filter 는 래스터화 비용으로 프레임 드랍 위험, gradient 는 저비용) */}
          <radialGradient id="sgrPinShadow">
            <stop offset="0%" stopColor="#000" stopOpacity={0.30} />
            <stop offset="60%" stopColor="#000" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#000" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* 지형 — 나침반 모드에서만 회전 <g> 로 감싼다(D-G). enableFollowCompass=false 면 <g>
            자체가 트리에 없다 — rotate(0) 조차 요소 트리를 바꾸므로 금지(D-H 8.3 킬스위치). */}
        {enableFollowCompass ? (
          <g transform={`rotate(${-bearing} ${camCx} ${camCy})`}>{terrain}</g>
        ) : terrain}

        {/* 동 레이블 — depth3 레벨에서는 숨김 (건물 레벨에선 dot/맥락으로 충분) */}
        {vb.w >= L3_VBW && depth1.wards.map((w, i) => {
          // selWard 는 polyActive(지역선택 모드)일 때만 건너뛴다 — 그때만 아래 오렌지 라벨(블록 B)이
          // 대신 그리기 때문. viewport 모드(polyActive=false)에선 B 가 안 그리므로, 여기서 일반
          // 회색 라벨로 정상 표시해야 stale selWard(폴백 ben-thanh 등) 동의 라벨이 사라지지 않는다.
          if ((polyActive && i === selWard) || !wardInView(i, vb)) return null;
          const gps = w.gps as { lat: number; lng: number } | undefined;
          if (!gps || !(w.n)) return null;
          // clamp: city≈6px, ward≈9px, deep≈20px
          const fs = Math.min(180, Math.max(22, vb.w * 0.023));
          const { x: wx, y: wy } = rotUnified(gps.lng, gps.lat);
          return (
            <text key={i}
              x={wx} y={wy}
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
        {/* 선택된 동 레이블 — depth3 레벨에서는 숨김. polyActive 가드: 테두리(위)와 동일 —
            viewport 모드에서 stale selWard 로 오렌지 강조가 남는 것 방지 */}
        {vb.w >= L3_VBW && polyActive && selWard !== null && (() => {
          const w = depth1.wards[selWard];
          const gps = w.gps as { lat: number; lng: number } | undefined;
          if (!gps || !(w.n)) return null;
          // clamp: city≈9px, ward≈13px, deep≈34px
          const fs = Math.min(250, Math.max(35, vb.w * 0.034));
          const { x: wx, y: wy } = rotUnified(gps.lng, gps.lat);
          return (
            <text
              x={wx} y={wy}
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
              const { x: bx, y: by } = rotUnified(b.lng, b.lat);
              if (bx < vb.x - 200 || bx > vb.x + vb.w + 200) return null;
              if (by < vb.y - 200 || by > vb.y + vb.h + 200) return null;
              if (b.count === 0) return null;
              const r = vb.w * 0.030;
              const fs = r * 0.80;
              const label = b.count >= 1000 ? `${Math.floor(b.count / 1000)}k` : String(b.count);
              return (
                <g
                  key={i}
                  pointerEvents={onBadgeClick ? 'all' : 'none'}
                  style={onBadgeClick ? { cursor: 'pointer' } : undefined}
                  onClick={onBadgeClick ? () => onBadgeClick(b) : undefined}
                >
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
              const { x: mx, y: my } = rotUnified(m.lng, m.lat);
              if (mx < vb.x - 50 || mx > vb.x + vb.w + 50) return null;
              if (my < vb.y - 50 || my > vb.y + vb.h + 50) return null;
              const r = vb.w * 0.015 * (m.r ?? 1);
              if (m.kind === 'biz') {
                // 업체 = 지도 주 콘텐츠 (마커 위계 역전, 2026-07-21) — 비선택도 카테고리 색
                // 원형 + 흰 글리프로 선명하게 부상시킨다(과거 중립 회색 #8b93a1 은 POI 에 묻혔음).
                // 선택된 업체는 물방울 핀으로 한 단계 더 승격.
                const s = (r * 1.25) / 9; // 머리 반지름 1.25r → 로컬 24유닛(머리 R=9) 스케일
                const color = m.color ?? '#ff5a1f';
                return (
                  <g key={m.id} data-marker={String(m.id)} style={{ cursor: 'pointer' }} onClick={m.onClick} pointerEvents="all">
                    {m.selected ? (
                      <>
                        <ellipse cx={mx} cy={my + r * 0.2} rx={r * 1.1} ry={r * 0.4}
                          fill="url(#sgrPinShadow)" pointerEvents="none" />
                        <g transform={`translate(${mx}, ${my}) scale(1.5) translate(${-mx}, ${-my})`}>
                          <g transform={`translate(${mx - 12 * s}, ${my - 24 * s}) scale(${s})`}>
                            <path d={BIZ_PIN_PATH} fill={color} stroke="#fff" strokeWidth={1.5} />
                            <circle cx={12} cy={9} r={BIZ_PIN_HOLE_R} fill="#fff" pointerEvents="none" />
                            {m.icon && (
                              <path d={m.icon} fill={color} pointerEvents="none"
                                transform="translate(7.5, 4.5) scale(0.375)" />
                            )}
                          </g>
                        </g>
                      </>
                    ) : (
                      <>
                        <circle cx={mx} cy={my - r * 0.8} r={r * 0.92} fill={color} stroke="#fff" strokeWidth={r * 0.22} />
                        {m.icon && (
                          <path d={m.icon} fill="#fff" pointerEvents="none"
                            transform={`translate(${mx - r * 0.46}, ${my - r * 1.26}) scale(${(r * 0.92) / 24})`} />
                        )}
                        {m.badge && (
                          <circle cx={mx + r * 0.68} cy={my - r * 1.48} r={r * 0.28}
                            fill="#ef4444" stroke="#fff" strokeWidth={r * 0.1} pointerEvents="none" />
                        )}
                      </>
                    )}
                    {m.label && (!visibleLabelIds || visibleLabelIds.has(m.id)) && (
                      // 상호명 = 주인공 라벨 — 비선택도 진하게/굵게(과거 #667085/600 은 POI 라벨에
                      // 밀렸음), 선택 시 크기만 한 단계 더 승격. ※ 색·굵기는 시작값.
                      <text
                        x={mx} y={my + r * (m.selected ? 1.05 : 0.65)}
                        fontSize={r * (m.selected ? 1.5 : 1.1)} fontWeight={700}
                        fill={m.selected ? '#1f2937' : '#333d4b'}
                        stroke="rgba(255,255,255,0.90)" strokeWidth={r * (m.selected ? 0.42 : 0.3)}
                        paintOrder="stroke fill"
                        textAnchor="middle" dominantBaseline="hanging"
                        fontFamily="system-ui,-apple-system,sans-serif"
                        pointerEvents="none">
                        {m.label}
                      </text>
                    )}
                  </g>
                );
              }
              // POI 상시 참조 레이어 (Phase A-2) — 매물/피드/업체와 별개의 "위치 기준 표식".
              // 마커 위계 역전 (2026-07-21): POI 는 지표(orientation reference)일 뿐 사용자가 찾는
              // 대상이 아니다 — 과거 청록 스퀘어클+흰 halo(footprint가 업체의 1.6배)를 버리고,
              // 반투명 밝은 칩 + 뮤트 글리프(색은 호출부 주입, landmark/civic 뮤트 톤) + 얇은 회색
              // 라벨로 배경에 후퇴시킨다. 위치 파악은 되되 시선은 안 끄는 것이 목표. 탭 동작이
              // 없으므로 pointerEvents none — 지도 제스처와 콘텐츠 마커 클릭을 가리지 않는다.
              // ※ 색·투명도·크기 계수는 시작값, 실기 조정 대상.
              if (m.kind === 'poi') {
                const half = r * 1.05;
                const color = m.color ?? '#74847f';
                return (
                  <g key={m.id} data-marker={String(m.id)} pointerEvents="none">
                    <rect x={mx - half} y={my - half} width={half * 2} height={half * 2} rx={half * 0.42}
                      fill="rgba(255,255,255,0.82)" stroke={color} strokeOpacity={0.55} strokeWidth={half * 0.14} />
                    {m.icon && (
                      <path d={m.icon} fill={color}
                        transform={`translate(${mx - half * 0.66}, ${my - half * 0.66}) scale(${(half * 1.32) / 24})`} />
                    )}
                    {m.label && (!visibleLabelIds || visibleLabelIds.has(m.id)) && (
                      <text x={mx} y={my + half * 1.35}
                        fontSize={r * 1.1 + 2} fontWeight={500}
                        fill="#7d8590"
                        stroke="rgba(255,255,255,0.88)" strokeWidth={r * 0.3}
                        paintOrder="stroke fill"
                        textAnchor="middle" dominantBaseline="hanging"
                        fontFamily="system-ui,-apple-system,sans-serif">
                        {m.label}
                      </text>
                    )}
                  </g>
                );
              }
              // 매물·피드 **선택 승격** — biz 와 동일한 teardrop shape(BIZ_PIN_PATH), 채움은
              // 레이어색, 홀 안 글리프만 도메인별(매물=가격표 / 피드=말풍선).
              // 비선택은 아래 dot 로 폴백한다 — "선택 전 dot / 선택 시 pin" 이 의도된 구분이다
              // (대표 지시 2026-08-06). dot 의 색 문제는 아래 기본색으로 따로 해결했다.
              if (m.selected && (m.kind === 'listing' || m.kind === 'feed')) {
                const s = (r * 1.25) / 9;
                const color = m.color ?? (m.kind === 'feed' ? '#3b82f6' : '#ff6f3c');
                const glyph = m.kind === 'feed' ? FEED_GLYPH_PATH : LISTING_GLYPH_PATH;
                const scale = 1.5;
                return (
                  <g key={m.id} data-marker={String(m.id)} style={{ cursor: 'pointer' }} onClick={m.onClick} pointerEvents="all">
                    <ellipse cx={mx} cy={my + r * 0.2} rx={r * 1.1} ry={r * 0.4}
                      fill="url(#sgrPinShadow)" pointerEvents="none" />
                    <g transform={`translate(${mx}, ${my}) scale(${scale}) translate(${-mx}, ${-my})`}>
                      <g transform={`translate(${mx - 12 * s}, ${my - 24 * s}) scale(${s})`}>
                        <path d={BIZ_PIN_PATH} fill={color} stroke="#fff" strokeWidth={1.5} />
                        <circle cx={12} cy={9} r={BIZ_PIN_HOLE_R} fill="#fff" pointerEvents="none" />
                        <path d={glyph} fill={color} pointerEvents="none"
                          transform="translate(7.5, 4.5) scale(0.375)" />
                      </g>
                    </g>
                  </g>
                );
              }
              return (
                <g key={m.id} data-marker={String(m.id)} style={{ cursor: 'pointer' }} onClick={m.onClick} pointerEvents="all">
                  {m.selected && (
                    // 선택 강조 링 — 타 페이지의 dot 마커 선택용(피드·매물은 위 teardrop 으로 승격돼 미해당)
                    <circle cx={mx} cy={my} r={r * 1.75} fill="none" stroke="#ff5a1f" strokeWidth={r * 0.22} opacity={0.9} />
                  )}
                  <circle cx={mx} cy={my} r={r * 1.4} fill="rgba(255,255,255,0.65)" />
                  {/* dot 기본색은 브랜드 주황이다. 종전 기본값 #3b82f6 은 "내 위치" 파란 점과
                      같은 색이라 매물·주유소·정비소 핀이 내 위치와 구분되지 않았다
                      (대표 지적 2026-08-06). 도메인별 색이 필요하면 호출부가 m.color 로 준다. */}
                  <circle cx={mx} cy={my} r={r} fill={m.color ?? '#ff6f3c'} stroke="#fff" strokeWidth={r * 0.28} />
                  {m.icon && (
                    // 업종 글리프 — 24×24 path 를 원 내접 정사각(변 1.24r, 대각 반지름 0.88r)으로 스케일
                    <path
                      d={m.icon} fill="#fff" pointerEvents="none"
                      transform={`translate(${mx - r * 0.62}, ${my - r * 0.62}) scale(${(r * 1.24) / 24})`}
                    />
                  )}
                  {m.badge && (
                    <circle cx={mx + r * 0.75} cy={my - r * 0.75} r={r * 0.32}
                      fill="#ef4444" stroke="#fff" strokeWidth={r * 0.12} pointerEvents="none" />
                  )}
                  {m.label && (!visibleLabelIds || visibleLabelIds.has(m.id)) && (
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
          const { x: mx, y: my } = rotUnified(meLatLng.lng, meLatLng.lat);
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

      {/* 도로·건물 자산 로드 실패 안내 — 흰 지도가 "정상"으로 보이던 것을 알림+재시도로 노출.
          한 동도 못 불러왔으면(전체 실패) vs 일부만 못 불러왔으면(부분 실패)을 이미 갖고 있는
          wardData 캐시 유무로 구분 — 새 로딩 전략·상태 추가 없이 기존 상태만으로 판별. */}
      {assetLoadFailed && (
        <div className={styles.assetIssueBanner} role="alert">
          <span>
            {Object.keys(wardData).length > 0
              ? t('map.assetPartialFail', { defaultValue: '지도 일부를 불러오지 못했어요' })
              : t('map.loadError')}
          </span>
          <button
            type="button"
            className={styles.assetIssueRetryBtn}
            onClick={() => { setAssetLoadFailed(false); onViewportChange(true); }}
          >
            {t('common.retry')}
          </button>
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
                aria-label={t('map.centerMap')}
                title={t('map.centerMap')}
              >
                <LocateFixed size={16} strokeWidth={2.2} />
              </button>
            </div>
          )}
        </>
      )}

      {/* 변수 사용 억제 — vbSnap은 re-render 트리거 전용 */}
      <span hidden aria-hidden>{vbSnap}</span>
    </div>
  );
}

// memo: 부모(NeighborhoodMap)가 검색어 타이핑 등으로 재렌더될 때 props가 참조 동일하면
// 수천 노드 SVG 리컨실을 건너뛴다 — 콜백 props는 소비처에서 useCallback 필수(기존 계약).
export default memo(SaigonMapV5);
