import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 실기기(네이티브 앱) 결함: @capacitor/geolocation 은 iOS/Android 양쪽 프로젝트에 vendoring
// 되지 않는다(Podfile/capacitor.settings.gradle 에 문서화). 예전에는 getLocation()/
// watchLocation() 이 일단 Capacitor 를 호출해보고 실패(또는 watchPosition 의 침묵 실패 —
// reject 하지 않고 watch id 만 돌려준 채 콜백을 영원히 안 부르는 경우)한 뒤에야
// navigator.geolocation 으로 폴백했다 — watchLocation() 은 첫 틱이 FALLBACK_TIMEOUT_MS(7s)
// 안에 안 오면 전환하는 구조라, 경로안내 시작 직후 최대 7초간 추적이 멈춘 것처럼 보이는
// 결함이 있었다(2026-08-07). 지금은 `Capacitor.isPluginAvailable('Geolocation')` 으로
// 플러그인 등록 여부를 미리(동기) 판정해 애초에 Capacitor 를 호출하지 않고 바로
// navigator.geolocation 을 쓴다 — 호출→침묵→타임아웃 구조 자체가 없어졌다.
// 이 테스트는 그 사전 판정과, 두 함수가 같은 판정을 공유하는지(비대칭 재발 방지 — 이번
// 결함의 원인), 폴백 전환 시 워처가 이중화되지 않는지(service-rules 원칙 7)를 고정한다.
function extractFn(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  // 중괄호 균형으로 함수 끝을 찾는다 (본문에 중첩 함수/블록이 많아 첫 '\n}' 로는 못 자른다).
  let depth = 0;
  let i = source.indexOf('{', start);
  const bodyStart = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(start, i + 1);
}

test('getLocation and watchLocation share the same plugin-availability gate (no asymmetric fallback)', () => {
  const source = read('native.ts');
  const getLocationFn = extractFn(source, 'async getLocation(): Promise<GeoPosition> {');
  const watchLocationFn = extractFn(source, 'watchLocation(handler: LocationUpdateHandler): () => void {');
  assert.match(getLocationFn, /isGeolocationPluginAvailable\(\)/, 'getLocation must gate on isGeolocationPluginAvailable()');
  assert.match(watchLocationFn, /isGeolocationPluginAvailable\(\)/, 'watchLocation must gate on isGeolocationPluginAvailable()');
});

test('isGeolocationPluginAvailable is a synchronous check on Capacitor.isPluginAvailable("Geolocation")', () => {
  const source = read('native.ts');
  const fn = extractFn(source, 'function isGeolocationPluginAvailable(): boolean {');
  assert.match(fn, /Capacitor\.isPluginAvailable\(\s*['"]Geolocation['"]\s*\)/);
});

test('watchLocation: dev override is still checked first (short-circuits before the availability gate)', () => {
  const source = read('native.ts');
  const fn = extractFn(source, 'watchLocation(handler: LocationUpdateHandler): () => void {');
  const devIdx = fn.indexOf('readDevGpsOverride()');
  const gateIdx = fn.indexOf('isGeolocationPluginAvailable()');
  assert.ok(devIdx >= 0 && gateIdx >= 0, 'both dev-override check and the availability gate must be present');
  assert.ok(devIdx < gateIdx, 'dev override check must run before the plugin-availability gate');
});

test('watchLocation: plugin unavailable -> goes straight to navigator.geolocation.watchPosition (no capacitor attempt, no timeout)', () => {
  const source = read('native.ts');
  const fn = extractFn(source, 'watchLocation(handler: LocationUpdateHandler): () => void {');
  assert.match(fn, /!isGeolocationPluginAvailable\(\)/);
  const gateStart = fn.indexOf('if (!isGeolocationPluginAvailable())');
  const gateBlock = extractFn(fn, 'if (!isGeolocationPluginAvailable()) {');
  assert.match(gateBlock, /navigator\.geolocation\.watchPosition/, 'must watch via navigator.geolocation when the plugin is unavailable');
  assert.match(gateBlock, /navigator\.geolocation\.clearWatch/, 'must clear the navigator watch on cleanup');
  assert.match(gateBlock, /accuracy: p\.coords\.accuracy/);
  assert.match(gateBlock, /speed: p\.coords\.speed/);
  assert.match(gateBlock, /heading: p\.coords\.heading/);
  // 침묵-실패 타임아웃 구조(호출 후 대기)가 사라졌는지 — 사전 판정으로 대체됐으므로 더 이상 없어야 한다.
  assert.doesNotMatch(fn, /FALLBACK_TIMEOUT_MS/, 'the 7s silent-failure timeout must be gone — availability is now known upfront');
  assert.ok(gateStart < fn.indexOf('Geolocation.watchPosition({ enableHighAccuracy: true }'), 'the unavailable branch must return before ever calling Geolocation.watchPosition');
});

test('watchLocation: plugin available -> only one watcher (capacitor), no navigator watcher started alongside it', () => {
  const source = read('native.ts');
  const fn = extractFn(source, 'watchLocation(handler: LocationUpdateHandler): () => void {');
  // Capacitor 경로 블록에는 navigator.geolocation.watchPosition 호출이 없어야 한다(워처 이중화 금지).
  const capBlockStart = fn.indexOf('Geolocation.watchPosition({ enableHighAccuracy: true }');
  assert.ok(capBlockStart >= 0, 'capacitor watchPosition call must exist');
  const capBlockTail = fn.slice(capBlockStart);
  assert.doesNotMatch(capBlockTail, /navigator\.geolocation\.watchPosition/, 'must not start a navigator watcher while the capacitor watcher is active');
});

test('behavioral reproduction: availability gate picks exactly one source and cleans it up, no double watcher', async () => {
  // native.ts 는 browser/Capacitor 전역에 의존해 직접 import 할 수 없으므로(다른 contract
  // 테스트들과 동일 패턴), 동일한 제어 흐름을 재현해 동작을 검증한다.
  function makeWatchLocation({ pluginAvailable, capacitor, navigatorGeo }) {
    return function watchLocation(handler) {
      if (!pluginAvailable) {
        if (!navigatorGeo) return () => {};
        const navigatorWatchId = navigatorGeo.watchPosition(
          (p) => handler({ source: 'navigator', ...p }),
          () => {},
        );
        return () => navigatorGeo.clearWatch(navigatorWatchId);
      }

      let stopped = false;
      let capacitorWatchId;
      capacitor.watchPosition((pos) => {
        if (pos) handler({ source: 'capacitor', ...pos });
      }).then((id) => {
        if (stopped) { capacitor.clearWatch(id); return; }
        capacitorWatchId = id;
      });

      return () => {
        stopped = true;
        if (capacitorWatchId != null) {
          capacitor.clearWatch(capacitorWatchId);
          capacitorWatchId = undefined;
        }
      };
    };
  }

  // Case A: plugin unavailable (current native reality) -> navigator is used immediately, capacitor never called.
  {
    const calls = [];
    let capacitorCalled = false;
    const capacitor = {
      watchPosition: async () => { capacitorCalled = true; return 'cap-watch-1'; },
      clearWatch: () => {},
    };
    let navWatchStarted = false;
    let navCleared = false;
    const navigatorGeo = {
      watchPosition: (onPos) => { navWatchStarted = true; setTimeout(() => onPos({ lat: 1, lng: 2 }), 5); return 42; },
      clearWatch: () => { navCleared = true; },
    };
    const watchLocation = makeWatchLocation({ pluginAvailable: false, capacitor, navigatorGeo });
    const stop = watchLocation((pos) => calls.push(pos));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(navWatchStarted, true, 'navigator watch must start immediately when the plugin is unavailable');
    assert.equal(capacitorCalled, false, 'capacitor must never be called when the plugin is unavailable');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].source, 'navigator');
    stop();
    assert.equal(navCleared, true, 'cleanup must clear the navigator watch');
  }

  // Case B: plugin available -> capacitor is used, navigator is never started.
  {
    const calls = [];
    let capCleared = false;
    const capacitor = {
      watchPosition: async (cb) => { setTimeout(() => cb({ coords: {} }), 2); return 'cap-watch-2'; },
      clearWatch: () => { capCleared = true; },
    };
    let navWatchStarted = false;
    const navigatorGeo = {
      watchPosition: () => { navWatchStarted = true; return 99; },
      clearWatch: () => {},
    };
    const watchLocation = makeWatchLocation({ pluginAvailable: true, capacitor, navigatorGeo });
    const stop = watchLocation((pos) => calls.push(pos));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(navWatchStarted, false, 'navigator watch must never start when the plugin is available');
    assert.equal(calls.length >= 1, true);
    assert.equal(calls[0].source, 'capacitor');
    stop();
    assert.equal(capCleared, true, 'cleanup must clear the active capacitor watch');
  }
});
