import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 사용자 결정 2 (2026-08-06): 서비스 지역 밖에서는 회전(나침반)은 허용하되 추종·"내 위치" 점은
// 허용하지 않는다. heading/speed 는 기기 값이라 위치 의미론과 무관하지만, 좌표 자체는 지역 밖이면
// 가짜 위치점을 찍지 않는다는 기존 불변식(runLocate 의 noMeDot 처리와 동일)을 지켜야 한다.
//
// 감독 지적 함정: early return 구조를 그대로 두고 게이트만 내리면, 지역 밖으로 나가는 순간
// meLatLng 이 "마지막 유효 좌표"로 고정된 채 남는다. 그 상태에서 회전을 허용하면 getCamCenter()
// 가 낡은 위치를 축으로 써서 지도가 엉뚱한 점을 중심으로 돈다 — 그래서 "마지막 좌표가 서비스
// 지역 안이었는가"를 별도로 추적(meInServiceAreaRef)해 지역 밖이면 getCamCenter 가 viewBox
// 중심으로 전환해야 한다.
test('meDot watcher updates compassBearing outside the service-area gate (heading rotates even outside HCMC)', () => {
  const source = read('SaigonMapV5.tsx');
  const watcherStart = source.indexOf('return native.watchLocation((pos) => {');
  const watcherEnd = source.indexOf('}, [meDotActive, centerOnUnified]);', watcherStart);
  assert.ok(watcherStart >= 0 && watcherEnd > watcherStart, 'meDot watcher callback not found');
  const block = source.slice(watcherStart, watcherEnd);

  // insideArea 판정이 먼저 오고, compassBearing 갱신 로직(compassModeRef 체크부터)은 그 if(insideArea)
  // 블록 밖(뒤)에 있어야 한다 — 즉 지역 밖이어도 실행된다. 2026-08-07: 게이트가 boolean compassOnRef
  // 에서 3-state compassModeRef !== 'follow' 로 바뀌었다(같은 위치, 같은 역할).
  const insideAreaIdx = block.indexOf('const insideArea = inServiceArea(pos.lat, pos.lng);');
  const compassCheckIdx = block.indexOf("if (compassModeRef.current !== 'follow') return;");
  assert.ok(insideAreaIdx >= 0, 'insideArea determination not found');
  assert.ok(compassCheckIdx > insideAreaIdx, 'compass gate must come after the insideArea determination');

  // compassBearing 갱신 라인이 `if (insideArea) {` 블록 안에 있으면 안 된다 — 블록 범위를
  // 괄호 매칭으로 잘라 그 안에 setCompassBearing 이 없는지 확인한다.
  const insideBlockStart = block.indexOf('if (insideArea) {');
  const insideBlockOpenBrace = block.indexOf('{', insideBlockStart);
  let depth = 1;
  let i = insideBlockOpenBrace + 1;
  for (; i < block.length && depth > 0; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') depth--;
  }
  const insideAreaBlockBody = block.slice(insideBlockOpenBrace + 1, i - 1);
  assert.doesNotMatch(insideAreaBlockBody, /setCompassBearing/, 'setCompassBearing must NOT be inside the insideArea gate — heading rotates regardless of service area');
});

test('meDot watcher skips setMeLatLng and follow centering outside the service-area gate (no fake location point)', () => {
  const source = read('SaigonMapV5.tsx');
  const watcherStart = source.indexOf('return native.watchLocation((pos) => {');
  const watcherEnd = source.indexOf('}, [meDotActive, centerOnUnified]);', watcherStart);
  const block = source.slice(watcherStart, watcherEnd);

  const insideBlockStart = block.indexOf('if (insideArea) {');
  assert.ok(insideBlockStart >= 0, 'if (insideArea) gate not found');
  const insideBlockOpenBrace = block.indexOf('{', insideBlockStart);
  let depth = 1;
  let i = insideBlockOpenBrace + 1;
  for (; i < block.length && depth > 0; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') depth--;
  }
  const insideAreaBlockBody = block.slice(insideBlockOpenBrace + 1, i - 1);

  assert.match(insideAreaBlockBody, /setMeLatLng\(\{ lat: pos\.lat, lng: pos\.lng \}\);/, 'setMeLatLng must be inside the insideArea gate — location point is not set outside the service area');
  assert.match(insideAreaBlockBody, /centerOnUnified\(lx\(pos\.lng\), ly\(pos\.lat\)\);/, 'follow centering must be inside the insideArea gate — camera does not follow outside the service area');
});

// 낡은 meLatLng 함정 방어 — getCamCenter 는 meInServiceAreaRef 가 false 면 meLatLng 이 여전히
// 값을 갖고 있어도 viewBox 중심을 반환해야 한다.
test('getCamCenter falls back to the viewBox center when the last coordinate was outside the service area (stale meLatLng trap)', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /const meInServiceAreaRef = useRef\(true\);/,
    'meInServiceAreaRef tracking slot missing',
  );
  assert.match(
    source,
    /const getCamCenter = useCallback\(\(\): \{ x: number; y: number \} => \{\s*const m = meLatLngRef\.current;\s*const v = vbRef\.current;\s*return \(m && meInServiceAreaRef\.current\) \? \{ x: lx\(m\.lng\), y: ly\(m\.lat\) \} : \{ x: v\.x \+ v\.w \/ 2, y: v\.y \+ v\.h \/ 2 \};/,
    'getCamCenter must check meInServiceAreaRef in addition to meLatLngRef — otherwise a stale in-area coordinate remains the rotation center after leaving the service area',
  );

  // meInServiceAreaRef 갱신이 워처 콜백 안에 있고, insideArea 판정 직후(gate 분기보다 먼저)
  // 갱신돼야 이번 tick부터 바로 반영된다.
  const watcherStart = source.indexOf('return native.watchLocation((pos) => {');
  const watcherEnd = source.indexOf('}, [meDotActive, centerOnUnified]);', watcherStart);
  const block = source.slice(watcherStart, watcherEnd);
  assert.match(
    block,
    /const insideArea = inServiceArea\(pos\.lat, pos\.lng\);\s*meInServiceAreaRef\.current = insideArea;/,
    'meInServiceAreaRef must be updated from insideArea before the gate branches run',
  );
});

// 사용자 결정 1 — 추종과 회전(수동)이 독립이다: "자유(미추종)+수동회전" 조합이 도달 가능해야
// 한다(예: 자유 단계에서 두 손가락으로 돌리면 compassMode='manual', isFollowing 은 그대로 false).
// 재개정(2026-08-07, 네이버지도 모델): heading 추종은 이제 ◎ 의 몫이라 나침반 버튼(toggleCompass)
// 은 순수 "북향 리셋"이 됐다 — isFollowing 을 전혀 참조/변경하지 않아야 한다는 계약은 그대로 선다.
// W16 (2026-08-07, 회귀 수정) — 이 파일의 기존 테스트들은 모두 "meDot 워처(native.watchLocation)"
// 안의 compassBearing 갱신 로직만 검증했다. 그 로직은 W15 이후로도 그대로 `compassModeRef.current
// !== 'follow'` 게이트를 썼기 때문에 통과했다. 그런데 실제 회귀는 그 워처가 아니라 **자력계 구독
// 자체**(별도 useEffect, native.watchCompassHeading)가 `meDotActive` 단독 게이트로 바뀌어 서비스
// 권역 밖(meLatLng===null → meDotActive 항상 false)에서 구독이 걸리지 않은 것이었다 — 즉 위 워처가
// "자력계가 이미 compassBearing 을 갱신하고 있으니 GPS course 로 덮어쓰지 않겠다"고 올바르게
// 양보하는데, 정작 자력계 쪽이 구독조차 안 돼 있어 아무도 compassBearing 을 갱신하지 않는
// 조합이었다. 이 파일이 meDot 워처만 보고 자력계 구독 effect 를 전혀 다루지 않아 놓쳤다 — 아래
// 테스트로 그 구독 게이트가 권역 밖에서도(=meDotActive 와 무관하게, compassMode==='follow' 만으로)
// 걸릴 수 있음을 직접 못박아 보강한다.
test('magnetometer subscription gate does not require meDotActive when heading-follow is active (outside-area rotation must still work without a me-dot)', () => {
  const source = read('SaigonMapV5.tsx');
  assert.match(
    source,
    /const compassSubscriptionActive = meDotActive \|\| compassMode === 'follow';/,
    'the magnetometer subscription gate must be meDotActive OR compassMode==="follow" — a meDotActive-only gate silently drops the subscription outside the service area (meLatLng===null there), which is exactly the scenario this contract file is about',
  );
  const start = source.indexOf('const unwatch = native.watchCompassHeading(');
  const effectStart = source.lastIndexOf('useEffect(() => {', start);
  const effectEnd = source.indexOf('}, [compassSubscriptionActive]);', start);
  assert.ok(effectEnd > start, 'magnetometer effect must depend on [compassSubscriptionActive]');
  const effect = source.slice(effectStart, effectEnd);
  assert.match(effect, /if \(!compassSubscriptionActive\) return;/, 'magnetometer effect must gate on the OR-combined flag, not meDotActive alone');
});

test('compass button (toggleCompass) resets to north only and never reads or writes isFollowing', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('const toggleCompass = useCallback(() => {');
  const end = source.indexOf('}, []);', start);
  assert.ok(start >= 0 && end > start, 'toggleCompass callback not found');
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /isFollowing/, 'toggleCompass must not touch isFollowing — free+rotation must be reachable independently of follow state, and pressing compass must not change the ◎ follow stage');
  assert.match(block, /setCompassMode\('north'\);/, 'toggleCompass must unconditionally reset compassMode to north');
});
