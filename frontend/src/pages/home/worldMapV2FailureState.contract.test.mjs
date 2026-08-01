import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// F-13: 같은 파일의 날씨(weatherUnavailable)·침수(floodStatus)는 이미 "실패"와 "빈 배열"을 구분한다.
// 나머지 위젯(내주변상품/최근상품/업체소식/주유소/정비소/커뮤니티)은 fetch 실패를 그냥 빈 배열로
// 삼켜 "원래 없음"과 구별되지 않았다 — 그 삼킴 패턴이 되돌아오지 않는지 정적으로 고정한다.
test('WorldMapV2 widgets track an unavailable status distinct from a genuinely empty result', () => {
  const source = read('WorldMapV2.tsx');

  // 실패 상태를 나타내는 상태 변수 6종 — 모두 'unavailable' 을 유니온에 포함해야 한다.
  for (const name of ['nearbyStatus', 'recentStatus', 'bizNewsStatus', 'communityStatus', 'gasStatus', 'repairStatus']) {
    const decl = source.match(new RegExp(`const \\[${name}, set${name[0].toUpperCase()}${name.slice(1)}\\] = useState<'loading' \\| 'ready' \\| 'unavailable'>`));
    assert.ok(decl, `${name} status state not found — failure/empty distinction regressed`);
  }

  // 각 위젯의 실패 경로가 상태를 'unavailable' 로 세팅해야 한다 (조용히 [] 만 세팅하고 끝나면 회귀).
  assert.match(source, /setNearbyStatus\('unavailable'\)/, 'nearby products failure no longer marks unavailable');
  assert.match(source, /setRecentStatus\('unavailable'\)/, 'recent products failure no longer marks unavailable');
  assert.match(source, /setBizNewsStatus\('unavailable'\)/, 'biz news failure no longer marks unavailable');
  assert.match(source, /setCommunityStatus\('unavailable'\)/, 'community posts failure no longer marks unavailable');
  assert.match(source, /setGasStatus\('unavailable'\)/, 'gas widget failure no longer marks unavailable');
  assert.match(source, /setRepairStatus\('unavailable'\)/, 'repair widget failure no longer marks unavailable');

  // 회귀 감시: 예전 방식(성공 콜백만 있고 실패 시 그냥 빈 배열/무동작인 naked catch)이 그대로면
  // 실패 실증에서 확인했듯 이 네 줄이 소스에 나타난다 — 되돌아오면 걸린다.
  assert.doesNotMatch(
    source,
    /fetchListings\(\{ lat, lng, sort: 'distance', size: 8 \}\)\.then\(\(p\) => setNearbyProducts\(p\.items\)\),/,
    'nearby products fetch regressed to a bare .then with no failure handling',
  );
  assert.doesNotMatch(
    source,
    /gasApi\.getNearby\(refLat, refLng, 3\)\.then\(\(r\) => r && setGasCount\(r\.stations\.length\)\)\.catch\(\(\) => \{\}\),/,
    'gas widget regressed to swallowing fetch failures as an empty/zero result',
  );
});
