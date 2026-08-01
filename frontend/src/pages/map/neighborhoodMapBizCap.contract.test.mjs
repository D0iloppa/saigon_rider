import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// N-2: fetchBizMapItems 는 has_more 로 이미 여러 페이지를 순회하는데, BIZ_MAX_ITEMS 가 100 이면
// 그 순회가 조기 중단돼 101번째 업체부터 조용히 사라진다. 100 회귀를 막는다(c822831 미러).
test('NeighborhoodMap does not cap businesses at the old silent-truncation ceiling of 100', () => {
  const source = read('NeighborhoodMap.tsx');
  const match = source.match(/const BIZ_MAX_ITEMS = (\d+);/);
  assert.ok(match, 'BIZ_MAX_ITEMS constant not found');
  assert.ok(Number(match[1]) > 100, `BIZ_MAX_ITEMS regressed to a silent 100 cap: ${match[1]}`);
});
