import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 2026-08-07 — 나침반 3-state 상태기계(북향/수동/heading 추종) + 두 손가락 수동 회전 제스처.
// ai-docs/context/service-rules.md §회전(나침반) 참조. 이 파일은 saigonMapV5RotationKillswitch/
// RotationOutsideArea/FollowCompassToggle 이 이미 고정한 것(킬스위치, 지역 밖 heading, 추종/회전
// 직교성)과 겹치지 않는, 상태기계 자체와 수동 제스처 계산에만 집중한다.

test('bearing merges exactly three sources (north/manual/follow) into one variable', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /const bearing = compassMode === 'manual' \? manualBearing : compassMode === 'follow' \? compassBearing : 0;/,
    'bearing must be the single merge point of north(0)/manual(manualBearing)/follow(compassBearing) — every consumer (hit-test, culling, label/marker rotation, terrain <g>) reads only this variable',
  );
});

// 2026-08-07 재개정(네이버지도 모델) — heading 추종 시작은 ◎ 버튼(recenterCurrentContext)으로
// 옮겨졌다. 나침반 버튼(toggleCompass)은 이제 북향 리셋 전용이고 bearing !== 0 일 때만 렌더된다.
test('compass button resets to north only; heading-follow start moved to the ◎ button', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('const toggleCompass = useCallback(() => {');
  const end = source.indexOf('}, []);', start);
  assert.ok(start >= 0 && end > start, 'toggleCompass not found');
  const block = source.slice(start, end);
  assert.match(
    block,
    /setCompassMode\('north'\);/,
    'toggleCompass must unconditionally reset compassMode to north — it no longer starts heading-follow (that transition now lives in recenterCurrentContext, the ◎ button)',
  );

  const recenterStart = source.indexOf('const recenterCurrentContext = useCallback(() => {');
  const recenterEnd = source.indexOf('}, [enableFollowCompass, isFollowing, compassMode, runLocate]);', recenterStart);
  assert.ok(recenterStart >= 0 && recenterEnd > recenterStart, 'recenterCurrentContext not found');
  const recenterBlock = source.slice(recenterStart, recenterEnd);
  assert.match(
    recenterBlock,
    /\} else if \(compassMode !== 'follow'\) \{[\s\S]*?setCompassMode\('follow'\);/,
    '◎ must be the one to transition compassMode to follow (camera-follow -> heading-follow, the 3rd cycle stage)',
  );
});

test('manual two-finger rotation gesture: deadzone before committing, then continuous per-frame updates', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(
    source,
    /const MANUAL_ROTATE_START_DEG = 6;/,
    'MANUAL_ROTATE_START_DEG history: 6 (original) -> 10 (2026-08-07 AM, "회전모드가 어색해" feedback: pinch-zoom-only gestures were tripping rotation) -> 6 (2026-08-07 PM, "인식이 잘 안 된다": anti-pinch-misfire duty moved to ROTATE_DOMINANCE_RATIO) -> 6 (2026-08-07 night, this change, kept — the "slow dial rotation doesn\'t register" defect was in g.distAcc\'s definition, not this angle deadzone, see below)',
  );
  assert.match(
    source,
    /const ROTATE_DOMINANCE_RATIO = 2\.0;/,
    'ROTATE_DOMINANCE_RATIO history: 1.2 -> 2.0 (2026-08-07 PM, reasoning: "pure rotation has distAcc≈0 so raising this ratio is free") -> 2.0 (2026-08-07 night, this change, kept) — that reasoning was correct in principle but g.distAcc itself was computed wrong at the time (see the fix below), which is what actually broke slow dial rotation; the ratio itself was never the bug',
  );

  // 회전 커밋 판정은 순수 함수로 분리돼 있다 — 아래 시나리오 테스트가 이 함수를 실제로 추출/실행한다.
  assert.match(
    source,
    /function shouldCommitRotation\(\s*angleAccDeg: number,\s*distAcc: number,\s*dist: number,\s*startDeg: number,\s*dominanceRatio: number,\s*\): boolean \{/,
    'rotation-commit judgment must be a standalone pure function (extractable/testable), not inlined only in onPointerMove',
  );

  const moveStart = source.indexOf('const onPointerMove = (e: PE<SVGSVGElement>) => {');
  const moveEnd = source.indexOf('const onPointerUp', moveStart);
  const moveBlock = source.slice(moveStart, moveEnd);

  // 두 포인터 각도를 매 프레임 계산한다(핀치줌의 거리 계산과 나란히, 같은 두 포인터에서).
  assert.match(
    moveBlock,
    /const angleDeg = Math\.atan2\(b\.y - a\.y, b\.x - a\.x\) \* \(180 \/ Math\.PI\);/,
    'pinch branch must compute the two-pointer angle alongside the existing distance (zoom) calculation',
  );

  // 데드존 미달 구간에서는 manualBearing/compassMode 를 바꾸지 않고 각도만 누적한다.
  assert.match(
    moveBlock,
    /if \(!g\.rotating\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*g\.angleAcc \+= delta;/,
    'below the deadzone, only g.angleAcc must accumulate — manualBearing/compassMode must not change yet (prevents pinch-zoom jitter from being read as rotation intent)',
  );

  // ★ 이번 수정의 핵심: g.distAcc 는 프레임별 |Δ| 절대값 누적이 아니라, 제스처 시작 거리
  // (g.startD) 대비 "순" 거리 변화여야 한다. 구버전은 다이얼 회전(거리 거의 불변)에서도 프레임마다의
  // 잡음이 상쇄 없이 쌓여 프레임 수(=느리게 돌릴수록 증가)에 비례해 부풀었다 — 그래서 느린 회전이
  // 지배성 판정을 통과하지 못했다. g.startD 기준으로 매 프레임 재계산하면 참값이 프레임 수와
  // 무관해진다.
  assert.match(
    moveBlock,
    /g\.distAcc = Math\.abs\(dist - g\.startD\);/,
    'g.distAcc must be the NET distance change since gesture start (Math.abs(dist - g.startD)), recomputed fresh each frame — NOT a per-frame abs-delta accumulator (that was this defect: noise accumulates with frame count for slow dial rotation, where net distance stays ~0)',
  );
  assert.doesNotMatch(
    moveBlock,
    /g\.distAcc \+= /,
    'g.distAcc must never be incremented/accumulated across frames — it is recomputed from g.startD each frame (accumulating abs per-frame deltas is exactly the fixed defect)',
  );

  // 데드존을 넘으면 정확히 이 시점에 'manual' 로 전이하고, 그 이후 프레임은 매번 반영한다(추가
  // 데드존 없음 — 진행 중인 회전에 프레임마다 데드존을 걸면 반응이 끊겨 보인다). 판정은 이제
  // shouldCommitRotation() 순수 함수(각도 데드존 그리고 지배성 판정)로 위임된다.
  assert.match(
    moveBlock,
    /if \(shouldCommitRotation\(g\.angleAcc, g\.distAcc, dist, MANUAL_ROTATE_START_DEG, ROTATE_DOMINANCE_RATIO\)\) \{\s*g\.rotating = true;\s*setCompassMode\('manual'\);/,
    'crossing the cumulative deadzone AND the dominance check (via shouldCommitRotation) must switch compassMode to \'manual\' exactly once per gesture',
  );
  assert.match(
    moveBlock,
    /\} else \{\s*setManualBearing\(\(prev\) => \(\(prev \+ delta\) % 360 \+ 360\) % 360\);\s*\}/,
    'once rotating, every subsequent frame must apply its delta directly with no further deadzone',
  );

  // manual 진입 시 이전까지 화면에 보이던 각(북향 0 또는 추종 중 heading)에서 이어 붙인다 —
  // manualBearing 의 stale 값을 기준으로 삼지 않는다(모드 전환 시 지도가 순간적으로 튀는 결함 방지).
  assert.match(
    moveBlock,
    /setManualBearing\(\(\(g\.baseBearing \+ g\.angleAcc\) % 360 \+ 360\) % 360\);/,
    'manual mode must start from baseBearing (captured at gesture start from the then-current bearing), not from a stale manualBearing',
  );
  assert.match(
    source,
    /g\.baseBearing = bearing;/,
    'onPointerDown must capture the current effective bearing as baseBearing when a new two-pointer gesture begins',
  );
  assert.match(
    source,
    /g\.startD = g\.lastD;/,
    'onPointerDown must capture the gesture-start two-finger distance (g.startD) — the fixed-reference point g.distAcc now measures net change against',
  );
});

// ★ 실제 실행 회귀 테스트 — 상수·정규식만 박아두는 위 계약 테스트보다 강한 방어. shouldCommitRotation
// 함수의 소스 텍스트를 추출해 TS 타입 어노테이션만 지운 뒤(런타임 동작과 무관한 소거 — tsc/babel 이
// 빌드 시 하는 것과 동일) new Function 으로 그대로 실행한다. Node 20(이 리포의 CI/로컬 실행 환경)은
// .ts 를 직접 import 할 수 없어(ts-node/tsx 미설치) 진짜 TS 유닛테스트가 불가능하므로, 커밋된 실제
// 코드를 이 방식으로 실행하는 것이 이 환경에서 낼 수 있는 가장 강한 회귀 방어다.
function extractShouldCommitRotation(source) {
  const sig = 'function shouldCommitRotation(';
  const start = source.indexOf(sig);
  assert.ok(start >= 0, 'shouldCommitRotation not found in SaigonMapV5.tsx');
  let depth = 0;
  let i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  const fnSource = source.slice(start, i + 1);
  // 타입 소거: 매개변수의 ": number" / 반환형 "): boolean {" 만 제거한다 — 로직 문자열은 그대로.
  const erased = fnSource
    .replace(/: number/g, '')
    .replace(/\): boolean \{/, ') {');
  // eslint-disable-next-line no-new-func -- 테스트 전용, 커밋된 소스를 실행해 검증한다
  return new Function(`return (${erased});`)();
}

test('shouldCommitRotation scenario matrix — dial rotation commits regardless of speed, pure pinch-zoom never commits, anchored one-finger rotation commits', () => {
  const source = read('SaigonMapV5.tsx');
  const shouldCommitRotation = extractShouldCommitRotation(source);
  const START_DEG = 6;
  const RATIO = 2.0;

  // 시나리오 1: 두 손가락 다이얼 회전(간격을 유지한 채 천천히 90°) — 손가락 사이 거리는 시작
  // 값(250px) 근처에서 아주 미세한 잡음(±0.5px)만 있을 뿐 순 변화는 거의 없다(distAcc≈0.5).
  // 6° 지점(데드존)에서 이미 지배성 판정을 통과해야 한다 — 프레임 수(느리게 돌리는지 빠르게
  // 돌리는지)와 무관하게.
  assert.equal(
    shouldCommitRotation(START_DEG, 0.5, 250, START_DEG, RATIO),
    true,
    'scenario 1 (slow dial rotation, distAcc~0.5px net): must commit at the angle deadzone regardless of how many frames it took to accumulate — this is exactly the case the old |Δ|-accumulator broke for slow gestures',
  );

  // 시나리오 2: 순수 핀치줌(간격이 200px→400px 로 크게 변화, 손가락 비대칭으로 인한 잡음각
  // 6~8°까지). 순 거리 변화(distAcc)가 실제 줌 이동량 그대로 크므로 지배성 판정에 걸려야 한다.
  assert.equal(
    shouldCommitRotation(8, 200, 400, START_DEG, RATIO),
    false,
    'scenario 2 (pure pinch-zoom, up to 8° finger-asymmetry jitter, dist 200->400): must NOT commit — net distance change (200px) dwarfs the rotation arc, so pinch-only gestures never misfire into rotation',
  );

  // 시나리오 3: 한 손가락을 축으로 고정한 회전 — 고정 손가락 기준 반지름이 거의 그대로 유지되므로
  // (distAcc≈0) 계속 걸려야 한다. 이건 기존에도 되던 경로이므로 회귀가 없어야 한다.
  assert.equal(
    shouldCommitRotation(45, 1.0, 250, START_DEG, RATIO),
    true,
    'scenario 3 (one-finger-anchored rotation, distAcc~1px net): must keep committing (this was the existing workaround users relied on — must not regress)',
  );
});

test('manual rotation coexists with pinch-zoom — both read from the same two-pointer branch, distance for zoom and angle for rotation', () => {
  const source = read('SaigonMapV5.tsx');
  const moveStart = source.indexOf('const onPointerMove = (e: PE<SVGSVGElement>) => {');
  const twoPointerStart = source.indexOf('if (g.pts.size === 2) {', moveStart);
  const moveEnd = source.indexOf('const onPointerUp', moveStart);
  assert.ok(twoPointerStart >= moveStart && twoPointerStart < moveEnd, 'two-pointer branch not found inside onPointerMove');
  const twoPointerBlock = source.slice(twoPointerStart, moveEnd);
  assert.match(twoPointerBlock, /applyZoom\(g\.lastD \/ dist, rawCx, rawCy\);/, 'pinch-zoom (distance-based) must remain in the same branch as the new rotation logic');
  assert.match(twoPointerBlock, /if \(enableFollowCompass\) \{/, 'rotation logic must be gated so the two-pointer branch is pinch-zoom-only when enableFollowCompass is off');
});

test('desktop mouse rotation is intentionally not implemented (mobile-first app, no wheel/drag rotate shortcut added)', () => {
  const source = read('SaigonMapV5.tsx');
  const wheelStart = source.indexOf('const onWheel = (e: WheelEvent) => {');
  const wheelEnd = source.indexOf('el.addEventListener', wheelStart);
  const wheelBlock = source.slice(wheelStart, wheelEnd);
  assert.doesNotMatch(wheelBlock, /setCompassMode|setManualBearing|shiftKey|altKey|ctrlKey|metaKey/, 'wheel handler must stay zoom-only — no modifier-key rotate shortcut was added (Capacitor WebView app targets touch, not desktop mouse)');
});
