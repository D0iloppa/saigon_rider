import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// W18 (2026-08-07) — 길찾기 내 위치 마커를 "위에서 본 오토바이"로. 그전까지 MapCanvas 는 heading 으로
// 파란 "원"을 회전시키고 있었다 = 방향 표시가 사실상 미구현이었다. 이 파일은 새로 만든 방향 표시가
// (a) 지도 회전과 이중 계산되지 않고 (b) 정지 중에 북쪽으로 튀지 않으며 (c) 방향을 모르는 동안
// 거짓 방향을 그리지 않는다는 세 가지를 못박는다. 세 가지 모두 화면에서는 "그럴듯해 보이는"
// 회귀라 눈으로 잡기 어렵다.

const marker = () => {
  const source = read('MapCanvas.tsx');
  const start = source.indexOf('// 실시간 현재 위치 마커');
  const end = source.indexOf('// 실제 이동경로(trail)', start);
  assert.ok(start >= 0 && end > start, 'current-position marker effect not found');
  return source.slice(start, end);
};

test("marker rotation is anchored to the map, not the viewport — course-up must not double-count the rotation", () => {
  const block = marker();
  assert.match(
    block,
    /new maplibregl\.Marker\(\{ element: headingEl\(\), rotationAlignment: 'map' \}\)/,
    "Marker must be created with rotationAlignment:'map'. viewport(기본값) 기준이면 course-up 에서 " +
      '지도가 heading 만큼 이미 돌아간 위에 아이콘을 또 heading 만큼 돌려 방향이 두 배가 된다. ' +
      "'map' 이면 MapLibre 가 rotateZ(rotation - bearing) 으로 그려주므로 북향(bearing 0)에서는 " +
      'heading 그대로, course-up(bearing≈heading)에서는 화면상 거의 위쪽 — 양쪽 모두 진북 기준으로 맞다.',
  );
  assert.match(
    block,
    /curMarkerRef\.current\.setRotation\(h\)/,
    '회전은 Marker.setRotation() 으로만 건다 — 엘리먼트에 직접 transform 을 쓰면 MapLibre 가 매 프레임 ' +
      '덮어쓰는 transform 과 충돌한다(구 구현은 firstElementChild 에 rotate() 를 걸어 아무 효과가 없었다).',
  );
  assert.doesNotMatch(
    block,
    /style\.transform\s*=/,
    'marker effect must not set element transform by hand (rotationAlignment 와 충돌)',
  );
});

test('a tick without a valid heading keeps the last known direction instead of snapping to north', () => {
  const block = marker();
  assert.match(
    block,
    /typeof current\.heading === 'number' && Number\.isFinite\(current\.heading\)\s*\?\s*current\.heading\s*:\s*lastHeadingRef\.current/,
    '유효 heading 이 없는 틱(정지·GPS 결측·NaN)에는 직전 유효값을 쓴다(대표 확정). ' +
      'Number.isFinite 가 없으면 NaN heading 이 그대로 setRotation 에 들어간다.',
  );
  assert.match(
    block,
    /lastHeadingRef\.current = h;/,
    'must persist the resolved heading for the next tick',
  );
});

test('before the very first valid heading the marker stays a plain dot — never a bike pointing north', () => {
  const block = marker();
  const guard = block.indexOf('if (h == null) return;');
  assert.ok(guard >= 0, "must bail out while heading is still unknown (h == null)");
  assert.ok(
    guard < block.indexOf('showRider('),
    '방향을 한 번도 모르는 상태에서 오토바이를 띄우면 북쪽을 향한 거짓 정보가 된다 — ' +
      'showRider() 는 반드시 이 가드 뒤에서만 호출돼야 한다.',
  );
  assert.ok(
    guard < block.indexOf('setRotation('),
    'setRotation() 도 가드 뒤 — 방향 미상 구간엔 회전 자체를 걸지 않는다.',
  );
});

test('dot → bike swap is one-way and driven by data-part hooks', () => {
  const source = read('MapCanvas.tsx');
  assert.match(source, /dot\.dataset\.part = 'dot'/, 'dot needs its data-part hook');
  assert.match(source, /rider\.dataset\.part = 'rider'/, 'rider layer needs its data-part hook');
  assert.match(source, /rider\.innerHTML = RIDER_MARKER_SVG/, 'rider layer must render the shared SVG');
  const fn = source.slice(source.indexOf('function showRider'));
  assert.match(fn, /dot\.style\.display = 'none'/);
  assert.match(fn, /rider\.style\.display = 'block'/);
  assert.doesNotMatch(
    fn,
    /'block'[\s\S]*dot\.style\.display = ''/,
    '되돌리기 없음 — 마지막 방향을 유지하므로 dot 으로 회귀할 이유가 없다',
  );
});

test('the top-down bike keeps the cues that survive 30px and points north at rotation 0', () => {
  const icon = read('riderMarkerIcon.ts');
  assert.match(icon, /export const RIDER_MARKER_PX = 30;/, '22px 에서는 코·핸들바가 뭉개진다 — 30px 확정');
  assert.match(icon, /viewBox="0 0 32 32"/, 'shapes are authored in a 32-unit box');
  // 판독 단서 4종. 하나라도 빠지면 1x 에서 "무슨 물체인지"가 사라진다.
  assert.match(icon, /M16 1\.4 19\.8 7\.2h-7\.6Z/, '앞쪽 삼각 코 — 앞뒤 비대칭의 핵심');
  assert.match(icon, /<rect x="7\.4" y="6\.6" width="17\.2"/, '핸들바 가로바 — top-down 최대 단서');
  assert.match(icon, /a6\.2 6\.2 0 0 1-12\.4 0/, '뒤로 넓어지는 시트');
  assert.match(icon, /<rect x="14\.6" y="22\.1"/, '뒷바퀴 꼬리 — 몸통 축을 읽게 한다');
  // 대비: 기존 dot 의 (파랑 + 흰 테두리 + 그림자) 전략 계승. 실루엣이라 테두리 대신 흰 할로 2-pass.
  assert.match(icon, /<g fill="#fff" stroke="#fff" stroke-width="2\.4"/, '흰 할로 pass 가 먼저');
  assert.match(icon, /<g fill="#2563EB">/, '파란 fill pass 가 그 위에');
  assert.ok(
    icon.indexOf('fill="#fff"') < icon.indexOf('fill="#2563EB"'),
    '할로가 먼저 깔려야 한다 — 순서가 뒤집히면 실루엣이 흰색으로 덮인다',
  );
  assert.match(icon, /drop-shadow\(0 1px 2px rgba\(0,0,0,\.45\)\)/, '지도 위 부양감(기존 dot 그림자 계승)');
});
