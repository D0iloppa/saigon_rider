import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 실기기(네이티브 앱) 결함: @capacitor/geolocation 은 iOS/Android 양쪽 프로젝트에 vendoring
// 되지 않는다(Podfile/capacitor.settings.gradle 에 문서화). getLocation() 은 이 사실을 알고
// navigator.geolocation 폴백을 갖고 있지만, watchLocation() 은 대칭 폴백이 없어 실기기에서
// 경로안내 카메라 연출·이탈/도착 판정·동네지도 실시간 위치점·나침반 회전이 전부 조용히
// 죽었다(watchPosition 이 reject 하지 않고 watch id 만 돌려준 채 콜백을 영원히 안 부르는
// 침묵 실패이기 때문에 에러로도 못 잡는다). 이 테스트는 그 대칭 폴백과, 폴백 전환 시
// 워처가 이중화되지 않는지(service-rules 원칙 7: 추종 워처는 앱 전역 1개)를 고정한다.
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

test('watchLocation: dev override is still checked first (short-circuit before capacitor/navigator paths)', () => {
  const source = read('native.ts');
  const fn = extractFn(source, 'watchLocation(handler: LocationUpdateHandler): () => void {');
  const devIdx = fn.indexOf('readDevGpsOverride()');
  const capIdx = fn.indexOf('Geolocation.watchPosition');
  assert.ok(devIdx >= 0 && capIdx >= 0, 'both dev-override check and Geolocation.watchPosition must be present');
  assert.ok(devIdx < capIdx, 'dev override check must run before starting the capacitor watch');
});

test('watchLocation: has a navigator.geolocation.watchPosition fallback path (symmetry with getLocation)', () => {
  const source = read('native.ts');
  const fn = extractFn(source, 'watchLocation(handler: LocationUpdateHandler): () => void {');
  assert.match(fn, /navigator\.geolocation\.watchPosition/, 'must fall back to navigator.geolocation.watchPosition');
  assert.match(fn, /navigator\.geolocation\.clearWatch/, 'must clear the navigator fallback watch on cleanup');
  // heading/speed/accuracy 필드가 폴백 경로에서도 채워져야 한다 (나침반 회전·이탈판정 의존).
  const fallbackStart = fn.indexOf('navigator.geolocation.watchPosition');
  const fallbackSlice = fn.slice(fallbackStart, fallbackStart + 400);
  assert.match(fallbackSlice, /accuracy: p\.coords\.accuracy/);
  assert.match(fallbackSlice, /speed: p\.coords\.speed/);
  assert.match(fallbackSlice, /heading: p\.coords\.heading/);
});

test('watchLocation: silent-failure timeout constant exists and stops the capacitor watch before starting the fallback (no double watcher)', () => {
  const source = read('native.ts');
  const fn = extractFn(source, 'watchLocation(handler: LocationUpdateHandler): () => void {');
  assert.match(fn, /FALLBACK_TIMEOUT_MS\s*=\s*7_000/, 'fallback timeout constant must be defined (7s)');
  const startFallbackFn = extractFn(fn, 'const startNavigatorFallback = () => {');
  assert.match(startFallbackFn, /stopCapacitor\(\)/, 'switching to fallback must stop the existing capacitor watch first — otherwise both sources fire');
});

test('behavioral reproduction: capacitor silent -> fallback starts once and capacitor watch is cleared; capacitor healthy -> no fallback', async () => {
  // native.ts 는 browser/Capacitor 전역에 의존해 직접 import 할 수 없으므로(다른 contract
  // 테스트들과 동일 패턴), 동일한 제어 흐름을 재현해 동작을 검증한다. 타임아웃 값만 테스트용으로
  // 줄인다(실제 상수는 위 source 테스트가 고정한다).
  function makeWatchLocation({ capacitor, navigatorGeo, timeoutMs }) {
    return function watchLocation(handler) {
      let stopped = false;
      let capacitorWatchId;
      let navigatorWatchId;
      let gotFirstTick = false;

      const stopCapacitor = () => {
        if (capacitorWatchId != null) {
          capacitor.clearWatch(capacitorWatchId);
          capacitorWatchId = undefined;
        }
      };
      const stopNavigator = () => {
        if (navigatorWatchId != null) {
          navigatorGeo.clearWatch(navigatorWatchId);
          navigatorWatchId = undefined;
        }
      };
      const startNavigatorFallback = () => {
        if (stopped || navigatorWatchId != null) return;
        stopCapacitor();
        navigatorWatchId = navigatorGeo.watchPosition(
          (p) => {
            gotFirstTick = true;
            handler({ source: 'navigator', ...p });
          },
          () => {},
        );
      };

      capacitor.watchPosition((pos) => {
        if (pos) {
          gotFirstTick = true;
          handler({ source: 'capacitor', ...pos });
        }
      }).then((id) => {
        if (stopped) { capacitor.clearWatch(id); return; }
        capacitorWatchId = id;
      });

      const timer = setTimeout(() => {
        if (!gotFirstTick) startNavigatorFallback();
      }, timeoutMs);

      return () => {
        stopped = true;
        clearTimeout(timer);
        stopCapacitor();
        stopNavigator();
      };
    };
  }

  // Case A: capacitor stays silent forever (simulating the unregistered-plugin bug) -> fallback kicks in.
  {
    const calls = [];
    let capClearedId = null;
    const capacitor = {
      watchPosition: async () => 'cap-watch-1', // never invokes the callback — silent failure
      clearWatch: (id) => { capClearedId = id; },
    };
    let navWatchStarted = false;
    const navigatorGeo = {
      watchPosition: (onPos) => { navWatchStarted = true; setTimeout(() => onPos({ lat: 1, lng: 2 }), 5); return 42; },
      clearWatch: () => {},
    };
    const watchLocation = makeWatchLocation({ capacitor, navigatorGeo, timeoutMs: 10 });
    const stop = watchLocation((pos) => calls.push(pos));
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(navWatchStarted, true, 'fallback must start when capacitor never ticks');
    assert.equal(capClearedId, 'cap-watch-1', 'the capacitor watch must be cleared when falling back — no double watcher');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].source, 'navigator');
    stop();
  }

  // Case B: capacitor ticks promptly -> fallback must never start.
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
    const watchLocation = makeWatchLocation({ capacitor, navigatorGeo, timeoutMs: 10 });
    const stop = watchLocation((pos) => calls.push(pos));
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(navWatchStarted, false, 'fallback must not start when capacitor is healthy');
    assert.equal(calls.length >= 1, true);
    assert.equal(calls[0].source, 'capacitor');
    stop();
    assert.equal(capCleared, true, 'cleanup must clear the active capacitor watch');
  }
});
