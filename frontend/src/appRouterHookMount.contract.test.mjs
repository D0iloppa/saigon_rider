import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const source = read('App.tsx');

// 회귀 2026-08-10(29a4c98) ~ 08-11: useNavigate 를 쓰는 useProximityAlerts 를 App() 본문에서
// 호출했다. App() 은 <BrowserRouter> 를 return 안에서 렌더하므로 본문 훅은 라우터 컨텍스트가
// 생기기 **전에** 실행된다 — react-router 의 invariant 가 빈 메시지 Error 를 던지고, 루트
// ErrorBoundary 가 이를 잡아 앱 전체가 "오류가 발생했어요" 화면으로 떨어졌다(전 화면 불능).
// 라우터 훅에 의존하는 훅은 Router 안의 얇은 래퍼 컴포넌트로만 마운트한다.

const appStart = source.indexOf('export default function App()');
const routerStart = source.indexOf('<BrowserRouter>', appStart);

test('App() 본문(=Router 바깥)에서는 라우터 훅에 의존하는 훅을 호출하지 않는다', () => {
  assert.ok(appStart >= 0, 'App() 선언을 찾지 못했다');
  assert.ok(routerStart > appStart, '<BrowserRouter> 가 App() 안에 있어야 한다');
  const outsideRouter = source.slice(appStart, routerStart);
  assert.doesNotMatch(
    outsideRouter,
    /useProximityAlerts\(/,
    'useProximityAlerts 가 App() 본문으로 돌아왔다 — Router 바깥에서 useNavigate 가 실행돼 앱 전체가 크래시한다',
  );
});

test('근접알림 워처는 <BrowserRouter> 안에서 마운트된다', () => {
  assert.match(
    source.slice(routerStart),
    /<ProximityAlerts enabled=\{!!user\} \/>/,
    '근접알림 워처가 Router 안에서 마운트되지 않는다',
  );
});

// 위 제약이 왜 필요한지의 근거 — 훅이 useNavigate 의존을 잃으면 이 테스트도 의미를 잃는다.
test('제약의 근거: useProximityAlerts 는 useNavigate 를 무조건 호출한다', () => {
  assert.match(read('hooks/useProximityAlerts.ts'), /const navigate = useNavigate\(\);/);
});
