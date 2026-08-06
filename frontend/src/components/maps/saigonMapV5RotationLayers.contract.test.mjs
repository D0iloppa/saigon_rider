import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// D-G/D-B (260806_svg_map_v6_rotation_design.md §3.3, §7 step 5): 지형(배경·동 경계·블록·건물·
// 선택 동 테두리)은 회전 <g> 안의 `terrain` fragment 에 모여야 하고, 라벨·마커·배지·내 위치·
// anchorOverlay 는 그 밖에서 rotatePoint 로 위치만 회전해야 한다(counter-rotate 금지).
test('SaigonMapV5 keeps terrain (rotated as a whole) and labels/markers (position-only rotation) in the design\'s prescribed groups', () => {
  const source = read('SaigonMapV5.tsx');

  const terrainStart = source.indexOf('const terrain = (');
  const terrainEnd = source.indexOf('\n  // ── 렌더 ──', terrainStart);
  assert.ok(terrainStart >= 0 && terrainEnd > terrainStart, 'terrain fragment (rotated-as-a-whole layers) not found');
  const terrainBlock = source.slice(terrainStart, terrainEnd);

  // §3.3 "안" 목록 — 지형 5종이 모두 terrain 안에 있어야 한다.
  assert.match(terrainBlock, /className=\{styles\.sea\}/, 'background sea rect missing from terrain (should rotate with the map)');
  assert.match(terrainBlock, /cityOutline\.rings\.map/, 'city outline missing from terrain');
  assert.match(terrainBlock, /depth1\.water as string\[\]/, 'Layer 1 (ward boundary/water) nested svg missing from terrain');
  assert.match(terrainBlock, /Layer 2: 블록/, 'Layer 2 (blocks) missing from terrain');
  assert.match(terrainBlock, /\{showL3 && renderL3Layer\(\)\}/, 'Layer 3 (buildings via renderL3Layer) missing from terrain');
  assert.match(terrainBlock, /선택된 동 테두리 overlay/, 'selected ward border overlay missing from terrain');

  // §3.3 "밖" 목록 — 라벨·마커·배지·내 위치는 terrain 안에 있으면 안 되고(counter-rotate 금지,
  // D-B), rotUnified(위치만 회전)로 좌표를 구해야 한다.
  const afterTerrain = source.slice(terrainEnd);
  assert.doesNotMatch(terrainBlock, /rotUnified/, 'terrain fragment must not use rotUnified — terrain rotates as a whole via the <g>, not per-point');
  assert.match(afterTerrain, /동 이름 라벨|동 레이블/, 'ward name label section not found after terrain');
  const wardLabelMatches = afterTerrain.match(/rotUnified\(gps\.lng, gps\.lat\)/g) ?? [];
  assert.equal(wardLabelMatches.length, 2, 'both ward-name label sections (plain + selected/orange) must position via rotUnified');
  assert.match(afterTerrain, /const \{ x: bx, y: by \} = rotUnified\(b\.lng, b\.lat\);/, 'district/cluster badge must position via rotUnified');
  assert.match(afterTerrain, /const \{ x: mx, y: my \} = rotUnified\(m\.lng, m\.lat\);/, 'marker (biz pin/dot) must position via rotUnified');
  assert.match(afterTerrain, /const \{ x: mx, y: my \} = rotUnified\(meLatLng\.lng, meLatLng\.lat\);/, '"내 위치" dot must position via rotUnified');
});

// D-B §3.3 :447-451 — updateAnchorOverlay 는 HTML 형제 노드(<g> 밖)라 자체적으로 rotatePoint 를
// 적용해야 한다. rotUnified(컴포넌트 렌더 스코프 함수)를 못 쓰므로 getCamCenter+rotatePoint 조합.
test('SaigonMapV5 updateAnchorOverlay rotates the anchor position (getCamCenter + rotatePoint), not raw lx/ly', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('const updateAnchorOverlay = useCallback');
  const end = source.indexOf('}, [getCamCenter, bearing]);', start);
  assert.ok(start >= 0 && end > start, 'updateAnchorOverlay callback not found');
  const block = source.slice(start, end);
  assert.match(block, /rotatePoint\(lx\(pos\.lng\), ly\(pos\.lat\), camCx, camCy, -bearing\)/, 'updateAnchorOverlay must rotate the anchor point around the camera center before projecting to screen px');
});

// §2.5/§7 step 6 개정(2026-08-06 실측 수정) — 4곳 중 실제로 +bearing 역회전이 필요한 곳은
// **탭 1곳뿐**이다. 휠/핀치중심/팬은 모두 applyZoom·vb 갱신에 그대로 쓰이는 userSpace(viewBox)
// 좌표라 회전이 필요 없다(viewBox 자체는 절대 돌지 않고, 회전은 그 안의 지형 <g> 만 돈다).
// 08cd1e3 이 4곳에 일률로 넣은 rotatePoint/rotateVec 보정은 휠·핀치중심·팬 3곳에서 틀렸다 —
// 실측(bearing=90 에서 수평 드래그가 vb.y 만 바꾸는 결함, 2026-08-06)으로 확인 후 제거했다.
// 탭만 예외인 이유: pointInPoly 히트테스트가 ward 폴리곤(map/unified 좌표계)과 비교하므로,
// 화면에 보이는 userSpace 지점을 map 좌표로 되돌리는 +bearing 변환이 반드시 필요하다.
test('SaigonMapV5 gesture math: only tap inverts rotation, wheel/pinch/pan use raw userSpace deltas', () => {
  const source = read('SaigonMapV5.tsx');

  // 휠 — rawCx/rawCy 를 그대로 applyZoom에 전달(회전 보정 없음)
  const wheelStart = source.indexOf("const onWheel = (e: WheelEvent) => {");
  const wheelEnd = source.indexOf('el.addEventListener', wheelStart);
  const wheelBlock = source.slice(wheelStart, wheelEnd);
  assert.match(wheelBlock, /applyZoom\(e\.deltaY > 0 \? 1\.12 : 0\.89, rawCx, rawCy\);/, 'wheel handler must zoom toward raw userSpace point (no rotation correction)');
  assert.doesNotMatch(wheelBlock, /rotatePoint\(rawCx, rawCy/, 'wheel handler must not rotate the raw zoom center');

  // 핀치 중심 — 동일하게 raw 그대로
  assert.match(source, /applyZoom\(g\.lastD \/ dist, rawCx, rawCy\);/, 'pinch-center handler must zoom toward raw userSpace point (no rotation correction)');
  assert.doesNotMatch(source, /rotatePoint\(rawCx, rawCy, camCx, camCy, bearing\)/, 'pinch-center handler must not rotate the raw zoom center');

  // 팬 — dxRaw/dyRaw 를 그대로 vb 에 적용(rotateVec 제거)
  assert.match(source, /vbRef\.current = clampVB\(\{ \.\.\.vb, x: vb\.x - dxRaw, y: vb\.y - dyRaw \}\);/, 'pan handler must apply the raw userSpace delta directly to vb (no rotation correction)');
  assert.doesNotMatch(source, /rotateVec\(dxRaw, dyRaw, bearing\)/, 'pan handler must not rotate the raw screen delta');

  // 탭 — map 좌표계 히트테스트를 위해 +bearing 역회전이 여전히 필요하다.
  assert.match(source, /const \{ x: mx, y: my \} = rotatePoint\(rawMx, rawMy, camCx, camCy, bearing\);/, 'tap handler must invert rotation via rotatePoint(+bearing) before ward/pick lookups (map-space hit-test)');
});

// D-H 8.3: off 경로(enableFollowCompass=false, 8개 기존 소비처)는 여전히 회전 <g> 가 트리에
// 없어야 한다 — 킬스위치 테스트(saigonMapV5RotationKillswitch)가 조건부 렌더 자체는 고정하므로,
// 여기서는 그 조건이 정확히 enableFollowCompass 하나에만 걸려 있음을 재확인한다(다른 조건과
// 결합되어 우회 가능해지지 않았는지).
test('SaigonMapV5 rotation <g> conditional depends only on enableFollowCompass', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /\{enableFollowCompass \? \(/,
    'rotation <g> ternary must be gated directly on enableFollowCompass with no additional AND/OR conditions',
  );
});
