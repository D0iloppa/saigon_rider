import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// ai-docs/260806_svg_map_v6_rotation_design.md §7 step 8 (D-D 3-state 토글 / D-C L3 게이트 /
// D-I heading 정책). step 3~7 계약(saigonMapV5RotationKillswitch, saigonMapV5RotationLayers)이
// 고정한 것과 겹치지 않는, step 8 에서 새로 성립하는 계약만 다룬다.

test('SaigonMapV5 gates L3 rendering on bearing===0 (D-C, compass mode disables L3)', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /const showL3 = L3_ENABLED && !lightweight && vb\.w < L3_VBW && bearing === 0;/,
    'showL3 must AND bearing===0 into the existing LOD threshold — compass rotation (bearing!==0) must disable L3',
  );
});

test('SaigonMapV5 expands the L2 ward culling rect for rotation via a rotated-AABB helper that is identity at bearing===0', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /function rotatedBBoxOfRect\(vb: VB, cx: number, cy: number, deg: number\): VB \{\s*if \(deg === 0\) return vb;/,
    'rotatedBBoxOfRect must early-return the original vb unchanged when deg===0 (killswitch: culling result unchanged for the 8 existing consumers)',
  );
  assert.match(
    source,
    /wardInView\(i, cullVb\)/,
    'Layer 2 ward render loop must cull against the rotation-expanded rect (cullVb), not the raw axis-aligned vb',
  );
});

test('SaigonMapV5 gesture handlers (wheel/pinch/pan) exit follow/compass mode back to free', () => {
  const source = read('SaigonMapV5.tsx');

  const wheelStart = source.indexOf('const onWheel = (e: WheelEvent) => {');
  const wheelEnd = source.indexOf('el.addEventListener', wheelStart);
  assert.match(
    source.slice(wheelStart, wheelEnd),
    /if \(followModeRef\.current !== 'free'\) setFollowMode\('free'\);/,
    'wheel (zoom) gesture must exit to free mode',
  );

  const pointerMoveStart = source.indexOf('const onPointerMove = (e: PE<SVGSVGElement>) => {');
  const pointerMoveEnd = source.indexOf('const onPointerUp', pointerMoveStart);
  const pointerMoveBlock = source.slice(pointerMoveStart, pointerMoveEnd);
  const exits = pointerMoveBlock.match(/if \(followModeRef\.current !== 'free'\) setFollowMode\('free'\);/g) ?? [];
  assert.equal(exits.length, 2, 'pan and pinch branches inside onPointerMove must each exit to free mode (found ' + exits.length + ')');
});

test('SaigonMapV5 heading policy uses the reference implementation constants and a last-valid-bearing hold (D-I §9.3)', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(source, /const COMPASS_DEADZONE_DEG = 8;/, 'compass deadzone must match MapCanvas.tsx COURSE_DEADZONE_DEG (8°)');
  assert.match(source, /const COMPASS_MIN_SPEED_MPS = 1\.5;/, 'compass min-speed threshold must match reference implementation (1.5 m/s)');

  // meDot 워처 콜백 안에서 heading==null || speed==null || speed<threshold 이면 갱신을 건너뛴다
  // (= 마지막 유효 방위 유지). native.watchLocation 은 여전히 1곳이어야 한다(다른 계약 파일이 고정).
  assert.match(
    source,
    /if \(pos\.heading == null \|\| pos\.speed == null \|\| pos\.speed < COMPASS_MIN_SPEED_MPS\) return;/,
    'watcher callback must hold the last valid bearing when heading/speed is null or below the speed threshold',
  );
  assert.match(
    source,
    /if \(diff >= COMPASS_DEADZONE_DEG\) setCompassBearing\(pos\.heading\);/,
    'watcher callback must only apply a new bearing once the deadzone is exceeded',
  );
});

test('SaigonMapV5 follow/compass camera recentring goes through centerOnUnified, not focusLatLng (D-F)', () => {
  const source = read('SaigonMapV5.tsx');
  const watcherStart = source.indexOf('return native.watchLocation((pos) => {');
  const watcherEnd = source.indexOf('}, [meDotActive, centerOnUnified]);', watcherStart);
  assert.ok(watcherStart >= 0 && watcherEnd > watcherStart, 'meDot watcher callback not found');
  const block = source.slice(watcherStart, watcherEnd);
  assert.match(block, /centerOnUnified\(lx\(pos\.lng\), ly\(pos\.lat\)\);/, 'follow/compass camera recentring must call centerOnUnified, not focusLatLng (avoids the selectRegion/toast side effects documented in D-F)');
  assert.doesNotMatch(block, /focusLatLng\(/, 'the per-tick follow path must not call focusLatLng');
});

test('ko/en/vi translation.json declare the same key set (map.followModeOn / map.compassModeOn present in all three)', () => {
  const locales = ['ko', 'en', 'vi'];
  const collectKeys = (obj, prefix = '') => {
    const keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...collectKeys(v, path));
      else keys.push(path);
    }
    return keys;
  };
  const keySets = locales.map((loc) => {
    const json = JSON.parse(readFileSync(join(here, `../../locales/${loc}/translation.json`), 'utf8'));
    return { loc, keys: new Set(collectKeys(json)) };
  });

  assert.ok(keySets[0].keys.has('map.followModeOn'), 'ko is missing map.followModeOn');
  assert.ok(keySets[0].keys.has('map.compassModeOn'), 'ko is missing map.compassModeOn');

  const [base, ...rest] = keySets;
  for (const other of rest) {
    const missingInOther = [...base.keys].filter((k) => !other.keys.has(k));
    const missingInBase = [...other.keys].filter((k) => !base.keys.has(k));
    assert.equal(missingInOther.length, 0, `${other.loc} is missing keys present in ${base.loc}: ${missingInOther.slice(0, 10).join(', ')}`);
    assert.equal(missingInBase.length, 0, `${base.loc} is missing keys present in ${other.loc}: ${missingInBase.slice(0, 10).join(', ')}`);
  }
});
