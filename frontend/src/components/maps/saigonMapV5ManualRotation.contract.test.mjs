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

test('compass button toggles north<->follow only; manual never transitions straight to follow', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('const toggleCompass = useCallback(() => {');
  const end = source.indexOf('}, []);', start);
  assert.ok(start >= 0 && end > start, 'toggleCompass not found');
  const block = source.slice(start, end);
  assert.match(
    block,
    /setCompassMode\(\(prev\) => \(prev === 'north' \? 'follow' : 'north'\)\);/,
    'toggleCompass must map north->follow and anything else (manual or follow)->north — this is the "manual/follow -> north, north -> follow" contract from the state machine',
  );
});

test('manual two-finger rotation gesture: deadzone before committing, then continuous per-frame updates', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(
    source,
    /const MANUAL_ROTATE_START_DEG = 6;/,
    'MANUAL_ROTATE_START_DEG constant (cumulative-angle deadzone before manual rotation engages) must exist and be documented',
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

  // 데드존을 넘으면 정확히 이 시점에 'manual' 로 전이하고, 그 이후 프레임은 매번 반영한다(추가
  // 데드존 없음 — 진행 중인 회전에 프레임마다 데드존을 걸면 반응이 끊겨 보인다).
  assert.match(
    moveBlock,
    /if \(Math\.abs\(g\.angleAcc\) >= MANUAL_ROTATE_START_DEG\) \{\s*g\.rotating = true;\s*setCompassMode\('manual'\);/,
    'crossing the cumulative deadzone must switch compassMode to \'manual\' exactly once per gesture',
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
