import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 리뷰 지적 2: MarketEdit 이 useUserStore((s) => s.user) 로 객체 전체를 구독하고 그걸
// fetchListing effect의 deps에 넣으면, 수정 중 다른 화면의 store mutation(addExp 등)이
// user 객체 참조를 새로 만들 때마다 effect가 재실행돼 로컬 입력(title/description/images)이
// 서버 값으로 조용히 덮어써진다. 같은 화면군의 선례(MarketDetail.tsx: s.user?.id)를 미러링해야 한다.
test('MarketEdit selects only user.id from the store (mirrors MarketDetail), not the whole user object', () => {
  const source = read('MarketEdit.tsx');

  assert.doesNotMatch(
    source,
    /useUserStore\(\(s\) => s\.user\)/,
    'MarketEdit still subscribes to the whole user object — any unrelated store mutation that creates a new user reference will re-run the fetchListing effect and clobber in-progress edits',
  );
  assert.match(
    source,
    /useUserStore\(\(s\) => s\.user\?\.id\)/,
    'MarketEdit must select s.user?.id only, like MarketDetail.tsx does (const myId = useUserStore((s) => s.user?.id))',
  );
});
