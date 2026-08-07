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
//
// 2026-08-07 개정(대표 지시, 네이버지도 참조) — heading 추종을 나침반 버튼에서 ◎ 버튼으로
// 옮겼다: ◎ 는 자유→카메라추종→heading추종→자유 3단을 순환하고, 나침반 버튼은 bearing!==0
// 일 때만 나타나는 "북향 복귀 전용" 버튼이 됐다(평상시엔 존재하지 않음).

// D-C 폐기(2026-08-06, 사용자 지시) — "나침반 모드에서 L3 비활성"은 뒤집혔다. L3 는 이제
// bearing 과 무관하게 vbW 임계만으로 게이트되고, 오버스캔 방어는 컬링(rotatedBBoxOfRect)이 맡는다.
test('SaigonMapV5 no longer gates L3 on bearing (D-C reversed — L3 renders during compass rotation)', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /const showL3 = L3_ENABLED && !lightweight && vb\.w < L3_VBW;/,
    'showL3 must be gated only by the existing LOD threshold — bearing===0 must not be ANDed in anymore (D-C reversed)',
  );
  assert.doesNotMatch(
    source,
    /const showL3 = .*bearing/,
    'showL3 must not reference bearing at all (D-C reversed, 2026-08-06)',
  );
});

test('SaigonMapV5 expands the L2/L3 ward culling rect for rotation via a rotated-AABB helper that is identity at bearing===0', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /function rotatedBBoxOfRect\(vb: VB, cx: number, cy: number, deg: number\): VB \{\s*if \(deg === 0\) return vb;/,
    'rotatedBBoxOfRect must early-return the original vb unchanged when deg===0 (killswitch: culling result unchanged for the 8 existing consumers)',
  );
  // 3곳: onViewportChange 프리로드 루프 + Layer 2 렌더 + Layer 3(renderL3Layer) 렌더 — 각각 자기
  // 스코프의 cullVb(동일 헬퍼, 다른 지역변수)를 쓴다. L3 는 이제 회전 중에도 렌더되므로(D-C
  // 반전) 그 ward 게이트도 축정렬 vb 가 아니라 cullVb 를 써야 회전한 화면 모서리에서 안 빠진다.
  const cullConsumers = source.match(/wardInView\(i, cullVb\)/g) ?? [];
  assert.equal(
    cullConsumers.length,
    3,
    'preload loop + Layer 2 + Layer 3 (renderL3Layer) ward gates must all cull against the rotation-expanded rect (cullVb), not the raw axis-aligned vb — L3 is no longer gated off during rotation (D-C reversed), so its ward gate must also be rotation-safe',
  );
});

// 2026-08-07 개정(대표 지시 + 네이버지도 SDK 참조, W11) — 이전 계약("제스처는 isFollowing 만
// 끄고 compassMode 는 절대 안 건드린다")은 헤딩추종(compassMode==='follow') 이탈 경로에서 상태
// 기계 밖 조합을 만드는 결함이 있었다: 추종만 꺼지고 compassMode 가 'follow'로 남으면 ◎ 버튼은
// 'free'로 계산되는데 지도는 자력계를 계속 따라 회전했고, 그 상태에서 ◎ 를 다시 누르면 즉시
// heading 단계로 재진입해 "다음 클릭 시 1단계부터"라는 대표 스펙이 깨졌다(W10 실측). 네이버
// 지도 SDK 의 LocationTrackingMode 도 Follow·Face 모두 제스처 시 NoFollow 로 직행한다(헤딩도
// 함께 해제) — 그래서 새 계약은 "compassMode==='follow' 일 때만 'manual' 로 전환하고 이탈
// 시점 각도(compassBearingRef.current)를 manualBearing 으로 이어받는다"로 바뀐다. 손으로 만든
// 회전('manual')이나 정방향('north')은 여전히 손대지 않는다 — "제스처는 사용자가 손으로 만든
// 회전을 몰래 끄지 않는다"는 원 원칙은 follow 가 아닌 두 상태에 대해 유지된다. 두 손가락 회전
// 제스처 자체(핀치 분기 안의 각도 추적)가 만드는 별도의 'manual' 전이는 별도 계약
// (saigonMapV5ManualRotation.contract.test.mjs)이 고정한다.
test('SaigonMapV5 wheel/pan/pinch gestures exit heading-follow via a shared exitFollowByGesture helper (compassMode only changes when it was follow)', () => {
  const source = read('SaigonMapV5.tsx');

  const helperStart = source.indexOf('const exitFollowByGesture = useCallback(() => {');
  const helperEnd = source.indexOf('}, []);', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'exitFollowByGesture helper not found');
  const helperBlock = source.slice(helperStart, helperEnd);
  assert.match(helperBlock, /if \(!isFollowingRef\.current\) return;/, 'helper must no-op when not currently following');
  assert.match(helperBlock, /setIsFollowing\(false\);/, 'helper must turn off isFollowing');
  assert.match(
    helperBlock,
    /if \(compassModeRef\.current === 'follow'\) \{\s*setManualBearing\(compassBearingRef\.current\);\s*setCompassMode\('manual'\);\s*\}/,
    'helper must switch compassMode to manual and carry over the current bearing ONLY when compassMode was follow',
  );

  const wheelStart = source.indexOf('const onWheel = (e: WheelEvent) => {');
  const wheelEnd = source.indexOf('el.addEventListener', wheelStart);
  const wheelBlock = source.slice(wheelStart, wheelEnd);
  assert.match(wheelBlock, /exitFollowByGesture\(\);/, 'wheel (zoom) gesture must call exitFollowByGesture');
  assert.doesNotMatch(wheelBlock, /setCompassMode\(/, 'wheel gesture must not touch compassMode directly (only via the helper)');

  const pointerMoveStart = source.indexOf('const onPointerMove = (e: PE<SVGSVGElement>) => {');
  const pointerMoveEnd = source.indexOf('const onPointerUp', pointerMoveStart);
  const pointerMoveBlock = source.slice(pointerMoveStart, pointerMoveEnd);
  const exits = pointerMoveBlock.match(/exitFollowByGesture\(\);/g) ?? [];
  assert.equal(exits.length, 2, 'pan and pinch branches inside onPointerMove must each call exitFollowByGesture (found ' + exits.length + ')');

  // pan(단일 포인터) 분기만 떼어 확인 — 회전 커밋 로직(setCompassMode('manual')/setManualBearing)은
  // 두 손가락(핀치) 분기에서만 일어나야 한다. exitFollowByGesture 호출 자체는 pan 분기에도 있지만
  // 그건 헬퍼 안에서만 조건부로 compassMode 를 만지므로 이 assert 대상이 아니다.
  const panBranchStart = pointerMoveBlock.indexOf('if (g.lastP) {');
  assert.ok(panBranchStart >= 0, 'pan branch (if (g.lastP)) not found inside onPointerMove');
  const panBranch = pointerMoveBlock.slice(panBranchStart);
  assert.doesNotMatch(panBranch, /setCompassMode\(/, 'pan gesture must not call setCompassMode directly (only via the helper)');
  assert.doesNotMatch(panBranch, /setManualBearing\(/, 'pan gesture must not call setManualBearing directly (only via the helper)');
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

test('ko/en/vi translation.json declare the same key set (map.followModeOn / map.followModeHeading / map.compassReset present in all three, old compassMode* keys retired)', () => {
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
  assert.ok(keySets[0].keys.has('map.followModeHeading'), 'ko is missing map.followModeHeading (◎ 3rd stage label)');
  assert.ok(keySets[0].keys.has('map.compassReset'), 'ko is missing map.compassReset (north-reset-only compass button label)');
  for (const { loc, keys } of keySets) {
    assert.ok(!keys.has('map.compassModeOn'), `${loc} still has retired key map.compassModeOn`);
    assert.ok(!keys.has('map.compassModeOff'), `${loc} still has retired key map.compassModeOff`);
    assert.ok(!keys.has('map.compassModeManual'), `${loc} still has retired key map.compassModeManual`);
  }

  const [base, ...rest] = keySets;
  for (const other of rest) {
    const missingInOther = [...base.keys].filter((k) => !other.keys.has(k));
    const missingInBase = [...other.keys].filter((k) => !base.keys.has(k));
    assert.equal(missingInOther.length, 0, `${other.loc} is missing keys present in ${base.loc}: ${missingInOther.slice(0, 10).join(', ')}`);
    assert.equal(missingInBase.length, 0, `${base.loc} is missing keys present in ${other.loc}: ${missingInBase.slice(0, 10).join(', ')}`);
  }
});

// 네이버지도 모델(2026-08-07, 대표 지시) — 나침반 버튼은 회전 시에만 존재하고, ◎ 는 3단을 순환한다.
test('compass button JSX renders only when bearing !== 0, and only ever resets to north', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /\{bearing !== 0 && \(\s*<button/,
    'compass button must be gated on bearing !== 0 — it must not exist in the tree at bearing===0 (no always-present compass icon)',
  );
  const start = source.indexOf("const toggleCompass = useCallback(() => {");
  const end = source.indexOf('}, []);', start);
  assert.ok(start >= 0 && end > start, 'toggleCompass not found');
  const block = source.slice(start, end);
  assert.match(block, /setCompassMode\('north'\);/, 'toggleCompass must unconditionally reset to north');
  assert.doesNotMatch(block, /setIsFollowing/, 'toggleCompass must not touch isFollowing — it only resets rotation, not the ◎ follow stage');
});

test('◎ button (recenterCurrentContext) cycles free -> camera-follow -> heading-follow -> free', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('const recenterCurrentContext = useCallback(() => {');
  const end = source.indexOf('}, [enableFollowCompass, isFollowing, compassMode, runLocate]);', start);
  assert.ok(start >= 0 && end > start, 'recenterCurrentContext not found with the expected 3-stage deps array');
  const block = source.slice(start, end);

  assert.match(block, /if \(!enableFollowCompass\) \{\s*void runLocate\(\);\s*return;\s*\}/, 'killswitch path must stay a 1-shot runLocate with no state writes');
  assert.match(block, /if \(!isFollowing\) \{[\s\S]*?void runLocate\(\);[\s\S]*?setIsFollowing\(true\);/, 'free -> camera-follow transition must runLocate then setIsFollowing(true)');
  assert.match(block, /\} else if \(compassMode !== 'follow'\) \{[\s\S]*?setCompassMode\('follow'\);/, 'camera-follow -> heading-follow transition must only flip compassMode to follow (no re-runLocate, no isFollowing change)');
  assert.match(block, /\} else \{[\s\S]*?setIsFollowing\(false\);\s*setCompassMode\('north'\);/, 'heading-follow -> free transition must turn off both isFollowing and rotation (north)');
});
