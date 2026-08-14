import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join('\n');

// 대표 지시 2026-08-13 11:44 — "사용자가 버튼을 누른 후 가능한지 측정을 해야 하니? / 화면
// 데이터 로딩될 때 백으로 측정해서 **버튼을 제어**해야지".
//
// 종전 구현은 진입점 버튼을 항상 열어두고 RideNav 진입 후 측정해서 막았다(누른 뒤에야 실패).
// 측위는 이미 화면 로딩 시 useLocationStore.ensureLocation() 이 세션당 1회 하고 있었으므로,
// 진입점은 그 결과를 읽어 버튼을 미리 잠그면 된다. 이 계약이 그 방향을 고정한다.

test('useServiceAvailability reads the store only — it never measures location itself', () => {
  const source = code(read('useServiceAvailability.ts'));

  assert.match(source, /useLocationStore\(/, 'availability must derive from the shared location store');
  // 측위 주체는 스토어 하나다(service-rules 원칙 4) — 훅이 직접 측정하면 화면 수만큼 권한창이 뜬다.
  assert.doesNotMatch(source, /requireServiceLocation|requestDeviceLocation|getLocation\(/,
    'the hook must not trigger a measurement; it only reads what the store already resolved');
  // 판정은 실제 게이트와 같은 기준이어야 한다 — 더 느슨하면 "열려 있는데 탭하면 막히는"
  // 상태가 되어 훅의 목적이 무너진다(2026-08-13 코드리뷰).
  assert.match(source, /coordsSource === 'device' && !gateReason && !tooCoarse/);
  assert.match(source, /GATE_ACCURACY_LIMIT_M/, 'the hook must apply the same accuracy limit as the gate');
});

test('useLocationStore remembers WHY the location is unusable (so buttons can explain themselves)', () => {
  const source = code(read('../store/useLocationStore.ts'));

  assert.match(source, /gateReason: LocationGateReason \| null/, 'store must expose a gateReason field');
  // 사유가 실제로 기록돼야 한다 — 기록하지 않으면 버튼이 이유를 말할 수 없다.
  for (const reason of ["'outside_area'", "'permission'", "'timeout'", "'unavailable'", "'scope_all'"]) {
    assert.ok(
      source.includes(`gateReason: ${reason}`)
      || source.includes(`? ${reason}`)
      || source.includes(`: ${reason}`),  // 삼항의 마지막 else 로도 들어온다
      `store must set gateReason to ${reason} on the corresponding outcome`);
  }
  // **측위를 건너뛰는 조기 반환도 사유를 남겨야 한다.** gateReason 은 persist 되지 않으므로
  // 남기지 않으면 재실행 시 (coordsSource:null, gateReason:null) 로 영구 'checking' 이 되고
  // 게이트된 버튼이 설명 없이 죽는다(2026-08-13 코드리뷰 HIGH).
  assert.match(source, /if \(!state\.gateReason\) \{[\s\S]{0,160}pinnedAll \? 'scope_all' : 'permission'/,
    'the skip-measurement early return must record why');
  // 사용자가 고른 '전체 지역'을 기기 고장으로 표기하면 거짓 안내가 된다.
  assert.doesNotMatch(source, /pinnedAll: true[\s\S]{0,80}gateReason: 'unavailable'/,
    "choosing '전체 지역' is a user choice, not a device failure");
  // 주행 중 권역 이탈 tick 도 잠근다 — 버리기만 하면 버튼이 열린 채 남는다.
  assert.match(source, /if \(get\(\)\.gateReason !== 'outside_area'\) set\(\{ gateReason: 'outside_area' \}\)/);
  // 성공 시에는 반드시 해제된다(사유가 남아 버튼이 계속 잠기면 안 된다).
  assert.match(source, /coordsSource: 'device',\s*\n\s*gateReason: null/);
});

test('every /ride-nav entry point locks its button up front AND explains on tap', () => {
  const entries = [
    ['../pages/info/InfoGasList.tsx', 'routeAvailable'],
    ['../pages/info/InfoRepairList.tsx', 'routeAvailable'],
    ['../pages/info/InfoRepairDetail.tsx', 'routeAvailable'],
    ['../pages/dm/DmDetail.tsx', 'routeAvailable'],
  ];
  for (const [path, flag] of entries) {
    const source = code(read(path));
    assert.match(source, /useServiceAvailability\(\)/, `${path}: must consult availability`);
    // `disabled` 를 쓰면 onClick 이 아예 안 불려 **조용히 아무 일도 안 일어난다** — 상단 안내를
    // 못 본 사용자는 그걸 오류로 받아들인다(대표 지적 2026-08-13). 그래서 aria-disabled 로
    // 잠근 티만 내고 탭은 받아 사유를 알린다.
    assert.match(source, new RegExp(`aria-disabled=\\{!${flag}`),
      `${path}: lock the route button with aria-disabled (tappable) — not the disabled attribute`);
    // lookbehind 로 aria- 접두를 제외한다 — 없으면 aria-disabled 가 부분일치해 항상 실패한다.
    assert.doesNotMatch(source, new RegExp(`(?<!aria-)disabled=\\{!${flag}`),
      `${path}: the plain disabled attribute would swallow the tap and hide the reason`);
    // 탭 시 사유 토스트 — 기존 locationGate 문구·토스트를 재사용한다(신규 디자인 금지).
    // 사유가 아직 없으면(측위 중) 기기 문제로 단정하지 않는다 — 아래 checking 계약 참조.
    assert.match(source, /toast\.neutral\(routeGateReason/,
      `${path}: must explain the block with the existing locationGate toast`);
  }
});

test('every locationGate toast uses the neutral tone (state, not error)', () => {
  // 대표 결정 2026-08-13 — 서비스 지역/측위 상태는 오류가 아니라 상태다. 한 화면에서 경로 차단은
  // neutral, 제보 차단은 error 로 갈려 있던 것을 통일했다. (API 호출 실패의 toast.error 는 별개다.)
  const screens = [
    '../pages/feed/FeedEdit.tsx',
    '../pages/dm/DmDetail.tsx',
    '../pages/info/InfoFloodMap.tsx',
    '../pages/info/InfoGasList.tsx',
    '../pages/info/InfoRepairDetail.tsx',
    '../pages/info/InfoRepairList.tsx',
  ];
  for (const path of screens) {
    const source = code(read(path));
    assert.doesNotMatch(source, /toast\.error\(t\(`locationGate\./,
      `${path}: locationGate messages must not use the error tone`);
    assert.doesNotMatch(source, /toast\.(info|success)\(t\(`locationGate\./,
      `${path}: locationGate messages must use toast.neutral`);
  }
});

test('screens that consume availability also trigger the measurement', () => {
  // 훅의 계약은 "화면 로딩 시 스토어가 이미 측위했다"인데, LocationContextBar 를 쓰지 않는
  // 화면(QuestDetail·InfoRepairDetail)은 그 발화가 없어 영구 'checking' 이 됐다(2026-08-13 HIGH).
  for (const path of ['../pages/quest/QuestDetail.tsx', '../pages/info/InfoRepairDetail.tsx']) {
    const source = code(read(path));
    assert.match(source, /useServiceAvailability\(\)/, `${path}: consumes availability`);
    assert.match(source, /ensureLocation\(\)/,
      `${path}: must trigger ensureLocation() on mount, otherwise the gate never resolves`);
  }
});

test('the blocked toast does not claim a device failure while still measuring', () => {
  for (const path of [
    '../pages/info/InfoGasList.tsx', '../pages/info/InfoRepairList.tsx',
    '../pages/info/InfoRepairDetail.tsx', '../pages/dm/DmDetail.tsx',
  ]) {
    const source = code(read(path));
    assert.doesNotMatch(source, /routeGateReason \?\? 'unavailable'/,
      `${path}: reason===null means "still checking", not "device unavailable"`);
    assert.match(source, /locationGate\.checking/, `${path}: must have a checking message`);
  }
});

test('a locked action chip actually looks locked (aria-disabled has a dim rule)', () => {
  // 종전에는 sys.actionChip 에 :disabled 규칙이 아예 없어 잠긴 버튼이 정상 버튼과 똑같이 보였다 —
  // "눌러도 아무 일이 없다"로 읽힌 원인의 절반이다.
  const sys = read('../styles/system.module.css');
  assert.match(sys, /\.actionChip\[aria-disabled='true'\]\s*\{[^}]*opacity/);
  for (const path of ['../pages/info/InfoRepairDetail.module.css', '../pages/dm/DmDetail.module.css']) {
    assert.match(read(path), /\[aria-disabled='true'\]\s*\{[^}]*opacity/, `${path}: needs a dim rule for the locked look`);
  }
});

test('quest start is blocked at the button for GPS-verified quests (no orphan server session)', () => {
  const source = code(read('../pages/quest/QuestDetail.tsx'));

  assert.match(source, /useServiceAvailability\(\)/);
  // GPS 검증형만 막는다 — 위치와 무관한 검증타입까지 막으면 과차단이다.
  assert.match(source, /const needsGps = quest\.cardType === 'DISTANCE' \|\| quest\.cardType === 'CHECKPOINT'/);
  assert.match(source, /const startBlocked = needsGps && !gpsAvailable/);
  // 가드가 apiStartRide 보다 앞에 있어야 서버에 고아 세션이 남지 않는다.
  const guardIdx = source.indexOf('if (startBlocked) return;');
  const startIdx = source.indexOf('await apiStartRide(');
  assert.ok(guardIdx > -1 && startIdx > -1, 'expected both the guard and the start call');
  assert.ok(guardIdx < startIdx, 'the guard must run before apiStartRide()');
});

test('RideNav handles a blocked gate inside the screen — it must not swap the whole screen out', () => {
  const source = code(read('../pages/ride/RideNav.tsx'));

  // 대표 지시 2026-08-13 11:38 "화면 안에서 처리해 / 질 떨어지게 만들지 말고".
  // 게이트 차단이 keyMissing 에 섞이면 showMap 이 꺼져 전체화면 안내로 빠진다 — 그 회귀를 고정한다.
  assert.match(source, /const gateBlocked = type === 'nav' && !!locationError/);
  assert.match(source, /const keyMissing = [^\n]*!gateBlocked/,
    'a blocked gate must not be treated as a missing route-API key (that hides the map)');
  assert.doesNotMatch(source, /LocationGateBlock/,
    'RideNav shows the gate state inside its sheet, not as a full-screen block');
});
