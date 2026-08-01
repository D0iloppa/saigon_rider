import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// F-14: depth2/depth3(도로·건물) 자산 fetch 실패가 .catch(() => {}) 로 조용히 무시되면
// 도로·건물 없는 흰 지도가 "정상"처럼 보인다. 실패를 assetLoadFailed 상태로 추적해
// 사용자에게 알리고 재시도 경로(버튼)를 주는지 고정한다. 로딩 전략(뷰포트 기반 lazy load,
// lightweight 게이트) 자체는 건드리지 않았음을 이 계약도 전제로 한다 — loadWardData 함수
// 시그니처/호출부는 대상이 아니다.
test('SaigonMapV5 tracks depth2/depth3 asset load failures instead of swallowing them', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(
    source,
    /const \[assetLoadFailed, setAssetLoadFailed\] = useState\(false\);/,
    'assetLoadFailed state not found — asset failure tracking regressed',
  );

  // depth2.json 실패 경로가 더 이상 빈 catch 로 무시되지 않는다.
  assert.doesNotMatch(
    source,
    /fetch\(`\$\{ASSET_BASE\}\$\{slug\}\/depth2\.json`\)\s*\.then\(\(r\) => r\.json\(\)\)\s*\.then\(\(d: Depth2Data\) => \{ entry\.d2 = d; \}\)\s*\.catch\(\(\) => \{\}\)/,
    'depth2.json fetch failure regressed to a silent empty catch',
  );
  // depth3.json 실패 경로도 마찬가지. (2026-08-01: 시퀀스 가드 추가로 무조건 호출에서
  // "최신 요청일 때만" 호출로 좁혀졌다 — saigonMapV5AssetLoadSeq.contract.test.mjs 참고.)
  assert.match(source, /setAssetLoadFailed\(true\)/, 'no catch path sets assetLoadFailed(true) — failures are silent again');

  // 사용자에게 실패를 보여주고 재시도 버튼을 제공하는 배너가 렌더돼야 한다.
  assert.match(source, /assetLoadFailed && \(/, 'no conditional render gated on assetLoadFailed — failure banner regressed');
  assert.match(source, /onClick=\{\(\) => \{ setAssetLoadFailed\(false\); onViewportChange\(true\); \}\}/, 'no retry action wired to re-attempt failed asset loads');
});
