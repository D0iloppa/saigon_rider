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

// §2.5/§7 step 6: 제스처 역회전은 4곳(휠·핀치중심·팬·탭) 전부에 적용돼야 한다.
test('SaigonMapV5 applies gesture-inverse rotation at all 4 call sites (wheel, pinch-center, pan, tap)', () => {
  const source = read('SaigonMapV5.tsx');

  // 휠
  const wheelStart = source.indexOf("const onWheel = (e: WheelEvent) => {");
  const wheelEnd = source.indexOf('el.addEventListener', wheelStart);
  assert.match(source.slice(wheelStart, wheelEnd), /rotatePoint\(rawCx, rawCy, camCx, camCy, bearing\)/, 'wheel handler must invert rotation via rotatePoint(+bearing)');

  // 핀치 중심
  assert.match(source, /rotatePoint\(rawCx, rawCy, camCx, camCy, bearing\);\s*applyZoom\(g\.lastD \/ dist, cx, cy\);/, 'pinch-center handler must invert rotation via rotatePoint(+bearing) before applyZoom');

  // 팬
  assert.match(source, /const \{ x: dx, y: dy \} = rotateVec\(dxRaw, dyRaw, bearing\);\s*vbRef\.current = clampVB\(\{ \.\.\.vb, x: vb\.x - dx, y: vb\.y - dy \}\);/, 'pan handler must invert the screen delta via rotateVec(+bearing) before applying it to vb');

  // 탭
  assert.match(source, /const \{ x: mx, y: my \} = rotatePoint\(rawMx, rawMy, camCx, camCy, bearing\);/, 'tap handler must invert rotation via rotatePoint(+bearing) before ward/pick lookups');
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
