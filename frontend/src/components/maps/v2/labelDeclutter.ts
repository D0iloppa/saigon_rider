/**
 * 라벨 디클러터 — 화면공간 우선순위 greedy 배치 (순수 함수).
 *
 * SaigonMapV5 의 마커 렌더 루프가 제스처 종료(vbSnap 갱신) 시 1회 호출한다.
 * 겹치는 라벨 중 우선순위가 낮은 것을 숨겨(아이콘/핀은 그대로) 가독성을 확보한다.
 *
 * 부수효과·DOM/window 접근 없음 — 입력으로 이미 투영된 화면좌표/폰트크기/중앙점을 받는다.
 * 라벨(<text>)만 대상이며 아이콘/핀 게이팅은 하지 않는다.
 *
 * 알고리즘(접근안 A):
 *  1) 우선순위 랭크(1차): 선택됨 > 미확인뱃지 > POI(landmark > civic > 기타) > 일반.
 *  2) 동률 타이브레이커(2차): 가시영역 중앙과의 거리(가까울수록 우선).
 *  3) 랭크 내림차순으로 각 라벨의 화면 AABB 를 이미 채택된 박스들과 겹침 검사 —
 *     안 겹치면 채택(Set 추가), 겹치면 라벨만 스킵. 선택된 마커는 항상 채택.
 *  4) 히스테리시스: 직전에 보이던 라벨은 테스트 박스를 축소해 더 끈적이게(끄는 임계 > 켜는 임계).
 */

// ── 튜닝 상수 ───────────────────────────────────────────────
/** 라벨 폭 근사 = 글자수 × fontSize × 이 계수 (다국어라 canvas 실측 대신 근사치). */
export const LABEL_WIDTH_FACTOR = 0.55;
/** 라벨 높이 = fontSize × 이 계수 (line-height 근사). */
export const LABEL_HEIGHT_FACTOR = 1.15;
/** 히스테리시스 — 직전에 보이던 라벨은 테스트 박스를 이 배율로 축소해 재충돌 임계를 높인다. */
export const HYSTERESIS_SHRINK = 0.8;

// 우선순위 랭크 (클수록 먼저 배치·우선). 동률은 화면 중앙 거리로 타이브레이크.
const RANK_SELECTED = 1000;
const RANK_BADGE = 800;
const RANK_POI_LANDMARK = 600;
const RANK_POI_CIVIC = 500;
const RANK_POI_OTHER = 450;
const RANK_GENERAL = 100;

export interface DeclutterMarker {
  id: string | number;
  kind?: 'biz' | 'listing' | 'feed' | 'poi';
  selected?: boolean;
  badge?: boolean;
  /** POI 등급 — 2=landmark, 1=civic, 0=기타 POI. 비-POI 는 무시된다. */
  poiTier?: number;
  /** 라벨 박스 중심 x (screen px, textAnchor=middle 기준). */
  labelCx: number;
  /** 라벨 박스 상단 y (screen px, dominantBaseline=hanging 기준). */
  labelTop: number;
  /** 라벨 폰트 크기 (screen px). */
  fontSize: number;
  /** 라벨 텍스트 (폭 추정용). */
  text: string;
  /** 중앙거리 타이브레이커용 마커 화면 좌표 (screen px). */
  sx: number;
  sy: number;
}

export interface DeclutterCtx {
  /** 가시영역 중심 x (screen px — 하단시트/상단 오버레이 보정 포함). */
  centerX: number;
  /** 가시영역 중심 y (screen px). */
  centerY: number;
  /** 직전 프레임의 표시 집합 (히스테리시스용). */
  prevVisible?: ReadonlySet<string | number>;
}

interface Box { left: number; right: number; top: number; bottom: number }

function rankOf(m: DeclutterMarker): number {
  if (m.selected) return RANK_SELECTED;
  if (m.badge) return RANK_BADGE;
  if (m.kind === 'poi') {
    if (m.poiTier === 2) return RANK_POI_LANDMARK;
    if (m.poiTier === 1) return RANK_POI_CIVIC;
    return RANK_POI_OTHER;
  }
  return RANK_GENERAL;
}

function labelBox(m: DeclutterMarker): Box {
  const w = m.text.length * m.fontSize * LABEL_WIDTH_FACTOR;
  const h = m.fontSize * LABEL_HEIGHT_FACTOR;
  return { left: m.labelCx - w / 2, right: m.labelCx + w / 2, top: m.labelTop, bottom: m.labelTop + h };
}

function shrink(b: Box, k: number): Box {
  const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
  const hw = ((b.right - b.left) / 2) * k, hh = ((b.bottom - b.top) / 2) * k;
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * 라벨을 표시할 마커 id 집합을 계산한다.
 * @param markers 라벨을 가진 마커들(화면좌표·폰트크기 이미 투영됨). text 가 빈 항목은 무시.
 */
export function computeVisibleLabels(
  markers: DeclutterMarker[],
  ctx: DeclutterCtx,
): Set<string | number> {
  const dist2 = (m: DeclutterMarker) => (m.sx - ctx.centerX) ** 2 + (m.sy - ctx.centerY) ** 2;
  const cand = markers
    .filter((m) => m.text.length > 0)
    .sort((a, b) => {
      const rd = rankOf(b) - rankOf(a);
      if (rd !== 0) return rd;
      return dist2(a) - dist2(b); // 동률: 중앙에 가까운 쪽 우선
    });

  const occupied: Box[] = [];
  const visible = new Set<string | number>();
  for (const m of cand) {
    const box = labelBox(m);
    // 선택된 마커는 항상 라벨 유지(최상위) — 겹쳐도 스킵하지 않고, 다른 라벨은 이 박스를 피한다.
    if (m.selected) {
      visible.add(m.id);
      occupied.push(box);
      continue;
    }
    const test = ctx.prevVisible?.has(m.id) ? shrink(box, HYSTERESIS_SHRINK) : box;
    let hit = false;
    for (const o of occupied) {
      if (overlaps(o, test)) { hit = true; break; }
    }
    if (!hit) {
      visible.add(m.id);
      occupied.push(box); // 채택 라벨은 전체 박스로 자리 차지(축소본 아님)
    }
  }
  return visible;
}
