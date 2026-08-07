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
//
// 개정(2026-08-06, 사용자 결정 1): 추종을 나침반에서 분리해 직교 2축(isFollowing/compassOn)으로
// 바꿨다 — 구 3-state 'free'|'follow'|'compass' 순환은 폐기됐다. onFollowModeChange 는 어느
// 소비처도 전달하지 않는 관측 전용 prop 이라(grep 확인) 시그니처를 새 모델에 맞게 바꿨다.
test('SaigonMapV5 declares enableFollowCompass prop with false default', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(
    source,
    /enableFollowCompass\?: boolean;/,
    'enableFollowCompass?: boolean prop declaration missing from SaigonMapV5Props',
  );
  assert.match(
    source,
    /onFollowModeChange\?: \(state: \{ following: boolean; compassOn: boolean \}\) => void;/,
    'onFollowModeChange observer prop declaration missing from SaigonMapV5Props (orthogonal state shape)',
  );

  // 구조분해 기본값이 반드시 false 여야 한다 — prop 을 안 준 8개 소비처는 이 기본값으로 동작한다.
  assert.match(
    source,
    /enableFollowCompass = false,\s*onFollowModeChange,\s*\}: SaigonMapV5Props\) \{/,
    'enableFollowCompass must destructure with a false default (killswitch)',
  );
});

test('SaigonMapV5 keeps follow (boolean) and rotation (3-state) axes that cannot leave their off value without the flag', () => {
  const source = read('SaigonMapV5.tsx');

  // 추종은 여전히 boolean(isFollowing). 회전축은 2026-08-07 개정으로 3-state 다 — bearing 이
  // north(0)/manual(manualBearing)/follow(compassBearing) 세 소스 중 하나를 합류시킨다(§상태기계).
  assert.match(
    source,
    /const \[isFollowing, setIsFollowing\] = useState\(false\);/,
    'isFollowing state slot missing or not initialized to false',
  );
  assert.match(
    source,
    /const \[compassMode, setCompassMode\] = useState<'north' \| 'manual' \| 'follow'>\('north'\);/,
    'compassMode 3-state slot missing or not initialized to \'north\'',
  );
  assert.match(
    source,
    /const \[manualBearing, setManualBearing\] = useState\(0\);/,
    'manualBearing state slot missing or not initialized to 0',
  );
  assert.match(
    source,
    /const bearing = compassMode === 'manual' \? manualBearing : compassMode === 'follow' \? compassBearing : 0;/,
    'bearing must merge the three sources (north/manual/follow) into the single variable every other consumer (hit-test/culling/label rotation) reads',
  );

  // ◎ 버튼(recenterCurrentContext)이 실제로 setIsFollowing 을 호출해야 한다.
  const setterCalls = source.match(/setIsFollowing\(/g) ?? [];
  assert.ok(
    setterCalls.length > 0,
    'setIsFollowing must be called (◎ button 2-state toggle + gesture free-exit) — 0 calls means the wiring is missing',
  );
  // 나침반 토글 버튼(toggleCompass)이 'north'⇄'follow' 만 오간다 — 'manual'→'follow' 직접 전이는 없다.
  assert.match(
    source,
    /const toggleCompass = useCallback\(\(\) => \{\s*setCompassMode\(\(prev\) => \(prev === 'north' \? 'follow' : 'north'\)\);/,
    'toggleCompass must flip between north and follow (manual also returns to north, never straight to follow)',
  );

  // 킬스위치의 실제 의미는 "0 calls" 가 아니라 "enableFollowCompass 없이는 isFollowing 이 false 를
  // 벗어나지 않는다" 다 — recenterCurrentContext 가 !enableFollowCompass 를 가장 먼저 확인하고 그
  // 경로엔 setIsFollowing 호출이 없어야 한다(기존 1회성 recenter 동작 그대로).
  const recenterStart = source.indexOf('const recenterCurrentContext = useCallback(() => {');
  const recenterEnd = source.indexOf('}, [enableFollowCompass, isFollowing, runLocate]);', recenterStart);
  assert.ok(recenterStart >= 0 && recenterEnd > recenterStart, 'recenterCurrentContext callback not found');
  const recenterBlock = source.slice(recenterStart, recenterEnd);
  const offBranchStart = recenterBlock.indexOf('if (!enableFollowCompass) {');
  const offBranchEnd = recenterBlock.indexOf('return;', offBranchStart);
  assert.ok(offBranchStart >= 0 && offBranchEnd > offBranchStart, 'recenterCurrentContext must early-branch on !enableFollowCompass');
  const offBranch = recenterBlock.slice(offBranchStart, offBranchEnd);
  assert.doesNotMatch(offBranch, /setIsFollowing\(/, 'the !enableFollowCompass branch must not call setIsFollowing — off path stays a 1-shot recenter (killswitch)');
  assert.match(offBranch, /void runLocate\(\);/, 'the !enableFollowCompass branch must still call runLocate (unchanged 1-shot recenter behavior)');

  // toggleCompass 는 enableFollowCompass=false 면 렌더되지 않는 버튼에서만 호출되므로(아래 JSX
  // 조건부 렌더), 소스 레벨에 별도 가드가 없어도 되지만 — 나침반 버튼 JSX 자체가
  // enableFollowCompass 로 게이트돼 있어야 한다.
  assert.match(source, /\{enableFollowCompass && \(\s*<button\s*type="button"\s*className=\{compassActive/, 'compass toggle button must be conditionally rendered on enableFollowCompass');

  // onFollowModeChange 통지 이펙트는 enableFollowCompass 가 false 면 그 자체가 실행되지 않는다
  // (얼리 리턴) — off 경로에서 부모에게 아무 통지도 나가지 않아야 "완전히 동일" 주장이 성립한다.
  // 외부 계약(state shape)은 boolean 그대로 — compassMode!=='north' 로 파생시켜 전달한다.
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(!enableFollowCompass\) return;[\s\S]*?onFollowModeChange\?\.\(\{ following: isFollowing, compassOn: compassMode !== 'north' \}\);\s*\}, \[enableFollowCompass, isFollowing, compassMode, onFollowModeChange\]\);/,
    'onFollowModeChange notification effect must early-return when enableFollowCompass is false, and derive compassOn from compassMode !== \'north\'',
  );
});

// 수동 회전 제스처도 킬스위치 대상이다(대표 지시: "enableFollowCompass=false 면 회전 기능 전체가
// 없어야 한다 — 수동 회전 제스처도 포함"). onPointerMove 의 2-포인터(핀치) 분기 안에서 회전 각도
// 계산/모드 전이 블록 전체가 enableFollowCompass 로 게이트돼 있어야, 미배선 8개 소비처에서 두 손가락
// 제스처가 여전히 순수 핀치줌(거리만)으로만 동작한다.
test('manual two-finger rotation is gated behind enableFollowCompass — off path never touches compassMode/manualBearing', () => {
  const source = read('SaigonMapV5.tsx');
  const moveStart = source.indexOf('const onPointerMove = (e: PE<SVGSVGElement>) => {');
  const moveEnd = source.indexOf('const onPointerUp', moveStart);
  assert.ok(moveStart >= 0 && moveEnd > moveStart, 'onPointerMove not found');
  const moveBlock = source.slice(moveStart, moveEnd);

  assert.match(
    moveBlock,
    /if \(enableFollowCompass\) \{[\s\S]*?setCompassMode\('manual'\)[\s\S]*?\}\s*g\.lastAngleDeg = angleDeg;\s*\}/,
    'the rotation-angle tracking block (deadzone accumulation + setCompassMode/setManualBearing) must be wrapped in an enableFollowCompass check inside the 2-pointer branch',
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

test('SaigonMapV5 has a rotatePoint position helper with a bearing===0 identity early return (step 6)', () => {
  const source = read('SaigonMapV5.tsx');

  // rotatePoint(라벨·마커 위치 회전 + 탭 히트테스트 좌표 변환, D-B)는 bearing===0 항등 반환을 가져야 한다.
  assert.match(
    source,
    /function rotatePoint\(x: number, y: number, cx: number, cy: number, deg: number\): \{ x: number; y: number \} \{\s*if \(deg === 0\) return \{ x, y \};/,
    'rotatePoint must early-return the identity point when deg===0 (killswitch: label/marker positions unchanged when bearing is 0)',
  );

  // rotateVec(구 §7 step 6, 08cd1e3)은 실측(2026-08-06) 결과 휠/핀치중심/팬 3곳 모두 불필요한
  // 보정이었음이 확인돼 제거됐다 — 팬 델타는 이미 userSpace 벡터라 vb.x/vb.y 에 그대로 더할 수
  // 있고, 회전은 userSpace *안*(지형 <g>)에서만 일어나 viewBox 자체는 돌지 않는다. 재도입 금지.
  assert.doesNotMatch(
    source,
    /function rotateVec\(/,
    'rotateVec must stay removed — pan/wheel/pinch use raw userSpace deltas directly (2026-08-06 gesture fix), only tap needs +bearing (map-space hit-test)',
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
