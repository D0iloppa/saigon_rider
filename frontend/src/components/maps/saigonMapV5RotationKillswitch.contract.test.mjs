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

test('SaigonMapV5 keeps a 3-state mode slot that cannot leave "free" without the flag', () => {
  const source = read('SaigonMapV5.tsx');

  // 모드 상태가 존재하고 초기값이 'free' 다.
  assert.match(
    source,
    /const \[followMode, setFollowMode\] = useState<'free' \| 'follow' \| 'compass'>\('free'\);/,
    'followMode 3-state slot missing or not initialized to \'free\'',
  );

  // 이 단계에서 setFollowMode 를 호출하는 곳이 없어야 한다 — 순환 트리거는 후속 단계(§7 step 8)
  // 소관이다. 호출부가 생기면 이 계약이 깨져, 다음 워커가 enableFollowCompass 게이트 없이
  // 모드를 바꾸는 코드를 추가하지 않았는지 스스로 점검하게 만든다.
  const setterCalls = source.match(/setFollowMode\(/g) ?? [];
  assert.equal(
    setterCalls.length,
    0,
    'setFollowMode is called somewhere — step 3 must not wire mode transitions yet (that is step 8 scope)',
  );

  // onFollowModeChange 통지 이펙트는 enableFollowCompass 가 false 면 그 자체가 실행되지 않는다
  // (얼리 리턴) — off 경로에서 부모에게 아무 통지도 나가지 않아야 "완전히 동일" 주장이 성립한다.
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(!enableFollowCompass\) return;\s*onFollowModeChange\?\.\(followMode\);\s*\}, \[enableFollowCompass, followMode, onFollowModeChange\]\);/,
    'onFollowModeChange notification effect must early-return when enableFollowCompass is false',
  );
});

test('SaigonMapV5 has zero rotation-render code yet (step 3/4 scope only)', () => {
  const source = read('SaigonMapV5.tsx');

  // 지형 회전 <g transform="rotate(...)"> 는 §7 step 5 소관 — 이 단계에 존재하면 안 된다.
  assert.doesNotMatch(
    source,
    /transform=\{`rotate\(/,
    'a rotation <g transform="rotate(...)"> already exists — that is step 5 scope, not step 3/4',
  );

  // rotateVec/제스처 역회전 헬퍼도 §7 step 6 소관 — 아직 없어야 한다.
  assert.doesNotMatch(source, /rotateVec/, 'rotateVec gesture-inverse helper already exists — that is step 6 scope');
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
