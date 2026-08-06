import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// D-H(260806_svg_map_v6_rotation_design.md §7 step 3, §8): SaigonMapV5 에 회전 prop 을 추가하되
// prop 미전달 시 기존 동작과 완전히 동일해야 한다(기본 off 킬스위치). 이 계약은 실제 회전 렌더
// (§7 step 5~)가 아니라, 그 회전이 들어갈 자리와 그것이 꺼져 있음을 보장하는 계약만 고정한다.
test('SaigonMapV5 declares enableFollowCompass prop with false default', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(
    source,
    /enableFollowCompass\?: boolean;/,
    'enableFollowCompass?: boolean prop declaration missing from SaigonMapV5Props',
  );
  assert.match(
    source,
    /onFollowModeChange\?: \(mode: 'free' \| 'follow' \| 'compass'\) => void;/,
    'onFollowModeChange observer prop declaration missing from SaigonMapV5Props',
  );

  // 구조분해 기본값이 반드시 false 여야 한다 — prop 을 안 준 8개 소비처는 이 기본값으로 동작한다.
  assert.match(
    source,
    /enableFollowCompass = false,\s*onFollowModeChange,\s*\}: SaigonMapV5Props\) \{/,
    'enableFollowCompass must destructure with a false default (killswitch)',
  );
});

test('SaigonMapV5 keeps a 3-state mode slot that cannot leave "free" without the flag (§7 step 8)', () => {
  const source = read('SaigonMapV5.tsx');

  // 모드 상태가 존재하고 초기값이 'free' 다.
  assert.match(
    source,
    /const \[followMode, setFollowMode\] = useState<'free' \| 'follow' \| 'compass'>\('free'\);/,
    'followMode 3-state slot missing or not initialized to \'free\'',
  );

  // step 8 부터는 순환 트리거(◎ 버튼)가 실제로 setFollowMode 를 호출해야 한다 — 더 이상 0곳이면
  // 안 된다(이전 계약은 step 3~7 구간의 "아직 안 걸림"을 고정한 것이었다).
  const setterCalls = source.match(/setFollowMode\(/g) ?? [];
  assert.ok(
    setterCalls.length > 0,
    'setFollowMode must now be called (◎ button 3-state cycle + gesture free-exit, §7 step 8) — 0 calls means step 8 wiring is missing',
  );

  // 킬스위치의 실제 의미는 "0 calls" 가 아니라 "enableFollowCompass 없이는 free 를 벗어나지
  // 않는다" 다 — recenterCurrentContext 가 !enableFollowCompass 를 가장 먼저 확인하고 그 경로엔
  // setFollowMode 호출이 없어야 한다(기존 1회성 recenter 동작 그대로).
  const recenterStart = source.indexOf('const recenterCurrentContext = useCallback(() => {');
  const recenterEnd = source.indexOf('}, [enableFollowCompass, followMode, runLocate]);', recenterStart);
  assert.ok(recenterStart >= 0 && recenterEnd > recenterStart, 'recenterCurrentContext callback not found');
  const recenterBlock = source.slice(recenterStart, recenterEnd);
  const offBranchStart = recenterBlock.indexOf('if (!enableFollowCompass) {');
  const offBranchEnd = recenterBlock.indexOf('return;', offBranchStart);
  assert.ok(offBranchStart >= 0 && offBranchEnd > offBranchStart, 'recenterCurrentContext must early-branch on !enableFollowCompass');
  const offBranch = recenterBlock.slice(offBranchStart, offBranchEnd);
  assert.doesNotMatch(offBranch, /setFollowMode\(/, 'the !enableFollowCompass branch must not call setFollowMode — off path stays a 1-shot recenter (killswitch)');
  assert.match(offBranch, /void runLocate\(\);/, 'the !enableFollowCompass branch must still call runLocate (unchanged 1-shot recenter behavior)');

  // onFollowModeChange 통지 이펙트는 enableFollowCompass 가 false 면 그 자체가 실행되지 않는다
  // (얼리 리턴) — off 경로에서 부모에게 아무 통지도 나가지 않아야 "완전히 동일" 주장이 성립한다.
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(!enableFollowCompass\) return;\s*onFollowModeChange\?\.\(followMode\);\s*\}, \[enableFollowCompass, followMode, onFollowModeChange\]\);/,
    'onFollowModeChange notification effect must early-return when enableFollowCompass is false',
  );
});

test('SaigonMapV5 gates the rotation <g> behind enableFollowCompass — off path renders no <g> at all', () => {
  const source = read('SaigonMapV5.tsx');

  // §7 step 5 (D-G): 지형 회전 <g transform="rotate(...)"> 가 이제 존재해야 하지만, 반드시
  // enableFollowCompass 로 조건부 렌더돼야 한다 — rotate(0) 조차 요소 트리를 바꾸므로(D-H 8.3),
  // 플래그가 꺼지면 <g> 자체가 트리에 없어야 한다(그 경우 terrain 이 그대로 반환된다).
  assert.match(
    source,
    /\{enableFollowCompass \? \(\s*<g transform=\{`rotate\(\$\{-bearing\} \$\{camCx\} \$\{camCy\}\)`\}>\{terrain\}<\/g>\s*\) : terrain\}/,
    'rotation <g> must be conditionally rendered on enableFollowCompass, with the off-path falling back to the bare terrain fragment',
  );
});

test('SaigonMapV5 has a rotateVec gesture-inverse helper with a bearing===0 identity early return (step 6)', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(
    source,
    /function rotateVec\(dx: number, dy: number, deg: number\): \{ x: number; y: number \} \{\s*if \(deg === 0\) return \{ x: dx, y: dy \};/,
    'rotateVec must early-return the identity vector when deg===0 (killswitch: gesture math unchanged when bearing is 0)',
  );

  // rotatePoint(라벨·마커 위치 회전, D-B)도 동일하게 bearing===0 항등 반환을 가져야 한다.
  // (제스처 역회전 4곳의 실제 호출부 계약은 saigonMapV5RotationLayers.contract.test.mjs 가 §7
  // step 6 커밋에서 별도로 고정한다 — 이 테스트는 두 헬퍼 함수 자체의 킬스위치 계약만 다룬다.)
  assert.match(
    source,
    /function rotatePoint\(x: number, y: number, cx: number, cy: number, deg: number\): \{ x: number; y: number \} \{\s*if \(deg === 0\) return \{ x, y \};/,
    'rotatePoint must early-return the identity point when deg===0 (killswitch: label/marker positions unchanged when bearing is 0)',
  );
});

test('SaigonMapV5 still installs native.watchLocation exactly once (D-E, no new watcher)', () => {
  const source = read('SaigonMapV5.tsx');
  const calls = source.match(/native\.watchLocation\(/g) ?? [];
  assert.equal(
    calls.length,
    1,
    'native.watchLocation call count changed — D-E requires reusing the existing meDot watcher, not adding a new one',
  );
});
