import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 감독 추가 작업 3 (260806_svg_map_v6_rotation_design.md 는 소비처 배선을 §7 에 넣지 않았다 —
// 이 갭을 메운다). SaigonMapV5 의 8개 소비처 중 동네지도·마켓지도 딱 2곳에만 enableFollowCompass
// 를 전달한다. 나머지 6곳(위치 피커·정보 지도)은 추종/회전이 탐색을 방해하므로 건드리지 않는다.
const WIRED = [
  '../../pages/map/NeighborhoodMapCanvas.tsx',
  '../../pages/market/MarketMain.tsx',
];
const NOT_WIRED = [
  '../../pages/biz/BizPublic.tsx',
  '../../pages/biz/BizLocationPicker.tsx',
  '../../pages/info/InfoFloodMap.tsx',
  '../../pages/info/InfoGasList.tsx',
  '../../pages/info/InfoRepairList.tsx',
  '../../pages/market/LocationPickerSheet.tsx',
];

test('enableFollowCompass is wired to exactly NeighborhoodMapCanvas and MarketMain', () => {
  for (const path of WIRED) {
    const source = read(path);
    assert.match(
      source,
      /enableFollowCompass/,
      `${path} must pass enableFollowCompass to SaigonMapV5 (this is the map that should offer follow+compass)`,
    );
  }
});

test('enableFollowCompass is NOT wired to the 6 picker/info map consumers', () => {
  for (const path of NOT_WIRED) {
    const source = read(path);
    assert.doesNotMatch(
      source,
      /enableFollowCompass/,
      `${path} must NOT pass enableFollowCompass — follow/compass is disruptive for location pickers and info maps`,
    );
  }
});
