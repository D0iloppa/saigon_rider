import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 감독 추가 작업 2 (260806_svg_map_v6_rotation_design.md §7 미기재 갭): 탭 히트테스트가 후보 ward
// 목록을 고를 때 축정렬 vb 를 썼다 — 나침반 모드에서 회전된 화면 모서리를 탭하면 엉뚱한 동으로
// 잡히거나 못 잡힌다. 렌더 컬링(:771 preload, :1217 render)은 이미 rotatedBBoxOfRect(cullVb) 를
// 쓰고 있었지만 탭 핸들러(pointerUp)의 findIndex 만 vb 그대로였다 — 이 계약이 그 자리를 고정한다.
test('tap hit-test ward candidate lookup uses a rotated bbox, not the raw axis-aligned vb', () => {
  const source = read('SaigonMapV5.tsx');

  // 탭 핸들러 안의 depth1.wards.findIndex 후보 필터가 rotatedBBoxOfRect 로 얻은 사각형을 쓴다.
  const tapFindIndex = source.match(
    /const tapCullVb = rotatedBBoxOfRect\(vb, camCx, camCy, bearing\);\s*\n\s*const idx = depth1\.wards\.findIndex\(\(_, i\) => wardInView\(i, tapCullVb\) && pointInPoly\(d1x, d1y, depth1\.wards\[i\]\.p\)\);/,
  );
  assert.ok(
    tapFindIndex,
    'tap handler must gate ward candidates with rotatedBBoxOfRect(vb, camCx, camCy, bearing), not the raw vb — otherwise rotated screen corners miss/mis-hit wards in compass mode',
  );

  // bearing===0 항등(킬스위치) — rotatedBBoxOfRect 가 deg===0 이면 vb 를 그대로 반환하므로 기존
  // 8개 소비처(enableFollowCompass 미전달, bearing 상수 0)의 탭 동작은 완전히 그대로다.
  assert.match(
    source,
    /function rotatedBBoxOfRect\(vb: VB, cx: number, cy: number, deg: number\): VB \{\s*if \(deg === 0\) return vb;/,
    'rotatedBBoxOfRect must still return vb unchanged at deg===0 for the killswitch to hold',
  );
});
