/**
 * 라벨 디클러터 — 화면공간 우선순위 greedy 배치 (순수 함수).
 *
 * SaigonMapV5 의 마커 렌더 루프가 제스처 종료(vbSnap 갱신) 시 1회 호출한다.
 * 겹치는 라벨 중 우선순위가 낮은 것을 숨겨(아이콘/핀은 그대로) 가독성을 확보한다.
 * 라벨은 다른 라벨뿐 아니라 **다른 마커의 아이콘/핀**과 겹쳐도 숨겨진다(표준 symbol
 * collision) — 단, 자기 자신의 아이콘과는 겹쳐도 무방하다(라벨은 원래 자기 핀 옆/아래에
 * 붙는다). 아이콘/핀 자체는 이 함수가 숨기지 않는다(항상 렌더 — 기존 동작 유지).
 *
 * 부수효과·DOM/window 접근 없음 — 입력으로 이미 투영된 화면좌표/폰트크기/중앙점을 받는다.
 *
 * 알고리즘(접근안 A + 아이콘 장애물 확장):
 *  0) occupied 장애물 집합에 **모든 마커의 아이콘 AABB** 를 먼저 시드한다(라벨 유무 무관 —
 *     라벨 없는 마커의 아이콘도 다른 라벨을 막아야 한다). 아이콘 필드가 없는 마커는 스킵.
 *  1) 정렬 1차 키: 선택핀은 항상 최우선(거리 무관), 그 외는 가시영역 중앙과의 거리(가까울수록 우선).
 *  2) 동률 타이브레이커(2차): 우선순위 랭크(미확인뱃지 > POI(landmark > civic > 기타) > 일반).
 *  3) 랭크 내림차순으로 각 라벨의 화면 AABB 를 (이미 채택된 라벨 박스 + 자기 자신을 제외한
 *     모든 아이콘 박스) 와 겹침 검사 — 안 겹치면 채택(Set 추가), 겹치면 라벨만 스킵.
 *     선택된 마커는 항상 채택(아이콘 충돌도 무시).
 *  4) 히스테리시스: 직전에 보이던 라벨은 테스트 박스를 축소해 더 끈적이게(끄는 임계 > 켜는 임계).
 */

// ── 튜닝 상수 ───────────────────────────────────────────────
/** 라벨 폭 근사 = 글자수 × fontSize × 이 계수 (다국어라 canvas 실측 대신 근사치). */
export const LABEL_WIDTH_FACTOR = 0.55;
/** 라벨 높이 = fontSize × 이 계수 (line-height 근사). */
export const LABEL_HEIGHT_FACTOR = 1.15;
/** 히스테리시스 — 직전에 보이던 라벨은 테스트 박스를 이 배율로 축소해 재충돌 임계를 높인다. */
export const HYSTERESIS_SHRINK = 0.8;

// 우선순위 랭크 (클수록 먼저 배치·우선). 중앙거리 정렬의 2차 타이브레이커로만 쓰인다.
const RANK_SELECTED = 1000;
const RANK_BADGE = 800;
const RANK_POI_LANDMARK = 600;
// 업체(biz) 상호명 — POI(civic/other) 밀도만큼은 경쟁 가능하도록 POI 랭크대(450~600) 안에 배치.
// landmark보다까지 위로 올리지는 않는다(중앙거리가 1차 기준이므로 rank는 타이브레이커일 뿐).
const RANK_BIZ = 550;
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
  /**
   * 이 마커의 아이콘/핀이 화면에서 차지하는 AABB (screen px, 4개 모두 있어야 장애물로 시드됨).
   * 라벨 유무와 무관하게 항상 채워 넣을 수 있다 — 라벨 없는 마커의 아이콘도 다른 라벨을 가릴 수 있다.
   * 자기 자신의 라벨 배치 판정에서는 자기 아이콘 박스가 제외된다(id 매칭).
   */
  iconLeft?: number;
  iconRight?: number;
  iconTop?: number;
  iconBottom?: number;
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
  if (m.kind === 'biz') return RANK_BIZ;
  return RANK_GENERAL;
}

function labelBox(m: DeclutterMarker): Box {
  const w = m.text.length * m.fontSize * LABEL_WIDTH_FACTOR;
  const h = m.fontSize * LABEL_HEIGHT_FACTOR;
  return { left: m.labelCx - w / 2, right: m.labelCx + w / 2, top: m.labelTop, bottom: m.labelTop + h };
}

/** 마커의 아이콘 AABB. 4개 필드가 모두 없으면(아이콘 크기 미제공) null — 장애물 시드 생략. */
function iconBoxOf(m: DeclutterMarker): Box | null {
  if (m.iconLeft === undefined || m.iconRight === undefined || m.iconTop === undefined || m.iconBottom === undefined) {
    return null;
  }
  return { left: m.iconLeft, right: m.iconRight, top: m.iconTop, bottom: m.iconBottom };
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
      // 1차: 중앙거리(가까울수록 우선) — 선택핀은 거리 무관 항상 최우선(그대로 유지).
      const da = a.selected ? -1 : dist2(a);
      const db = b.selected ? -1 : dist2(b);
      const dd = da - db;
      if (dd !== 0) return dd;
      return rankOf(b) - rankOf(a); // 동률: 랭크로 타이브레이크
    });

  // 아이콘 장애물 시드 — 라벨 유무와 무관하게 화면 내 모든 마커의 아이콘 AABB 를 미리 채운다.
  // 아이콘은 항상 렌더되는 고정 장애물이라 라벨 배치보다 먼저, 그리고 라벨 유무와 무관하게 존재한다.
  const iconBoxes: { id: string | number; box: Box }[] = [];
  for (const m of markers) {
    const box = iconBoxOf(m);
    if (box) iconBoxes.push({ id: m.id, box });
  }

  const occupied: Box[] = [];
  const visible = new Set<string | number>();
  for (const m of cand) {
    const box = labelBox(m);
    // 선택된 마커는 항상 라벨 유지(최상위) — 겹쳐도(아이콘 포함) 스킵하지 않고, 다른 라벨은 이 박스를 피한다.
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
      // 자기 자신의 아이콘은 제외 — 라벨은 원래 자기 핀 옆/아래에 붙으므로 자기 아이콘과는 겹쳐도 된다.
      for (const ib of iconBoxes) {
        if (ib.id === m.id) continue;
        if (overlaps(ib.box, test)) { hit = true; break; }
      }
    }
    if (!hit) {
      visible.add(m.id);
      occupied.push(box); // 채택 라벨은 전체 박스로 자리 차지(축소본 아님)
    }
  }
  return visible;
}
