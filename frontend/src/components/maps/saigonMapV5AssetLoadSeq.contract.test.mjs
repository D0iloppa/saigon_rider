import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 리뷰 지적 4: assetLoadFailed 가 시퀀스 가드 없는 단일 boolean 이라, depth2/depth3 fetch 가
// 여러 동에 대해 병렬로 나갈 때 늦게 도착한 실패가 먼저 온 성공을 덮어써(혹은 반대) 배너가
// 잘못 뜨거나 사라질 수 있다. useInfiniteScroll.ts 의 reqSeqRef 시퀀스 가드 패턴을 미러링해
// 상태 갱신만 가드해야 한다 — loadWardData/onViewportChange 시그니처·호출부는 그대로 유지.
test('SaigonMapV5 guards assetLoadFailed updates with a sequence ref so stale (out-of-order) fetch completions cannot clobber newer ones', () => {
  const source = read('SaigonMapV5.tsx');

  // 시퀀스 카운터 ref 존재 — useInfiniteScroll의 reqSeqRef와 동일한 발상(단조 증가 카운터).
  assert.match(
    source,
    /const \w*[Ss]eq\w*Ref\s*=\s*useRef\(0\)/,
    'no monotonic sequence ref found near asset loading — the reqSeqRef guard pattern was not mirrored',
  );

  // setAssetLoadFailed 호출이 더 이상 무조건적이면 안 된다 — 시퀀스 비교로 감싸야 한다.
  assert.doesNotMatch(
    source,
    /\.then\(\(d: Depth2Data\) => \{ entry\.d2 = d; setAssetLoadFailed\(false\); \}\)/,
    'depth2 success handler still sets assetLoadFailed unconditionally — regressed to the unguarded race',
  );

  const setAssetLoadFailedCalls = source.match(/setAssetLoadFailed\((?:true|false)\)/g) ?? [];
  assert.ok(setAssetLoadFailedCalls.length >= 2, 'expected multiple setAssetLoadFailed(true/false) call sites (d2 + d3 success/failure)');

  // 시그니처/호출부는 그대로 — loadWardData 는 여전히 (slug, needD3) 두 인자, onViewportChange 는 그대로.
  assert.match(source, /const loadWardData = useCallback\(async \(slug: string, needD3: boolean\)/, 'loadWardData signature must not change (ADR 재작업 금지)');
  assert.match(source, /onViewportChange\(true\)|onViewportChange\(\)/, 'onViewportChange call sites must remain intact');
});
