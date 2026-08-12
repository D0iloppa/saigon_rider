import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const source = read('useProximityAlerts.ts');

// 260806_proximity_ad_design.md §4/§5-3/§9-7: 로컬 진입감지는 클라이언트 1차 판정(즉시성 우선)
// 이고, 서버(ST_DWithin + 위치일관성)가 최종 확정한다 — 여기서는 로컬 거리계산·트리거 로직만
// 고정한다.

test('로컬 진입감지 반경은 서버 정책 기본값(D-3: notify_radius_m=300)과 동일하다', () => {
  assert.match(source, /const NOTIFY_RADIUS_M = 300;/);
});

test('haversine 거리계산은 lib/polyline 의 기존 유틸을 재사용한다 — 중복 구현 금지', () => {
  assert.match(source, /import \{ haversineM \} from '@\/lib\/polyline';/);
  assert.match(source, /haversineM\(gp\.lat, gp\.lng, candidate\.lat, candidate\.lng\)/);
});

test('반경 밖 후보는 서버 보고 없이 건너뛴다', () => {
  assert.match(source, /if \(distanceM > NOTIFY_RADIUS_M\) continue;/);
});

test('같은 가맹점은 로컬 스로틀 윈도 안에서 재전송하지 않는다(배터리·데이터, §R-4)', () => {
  assert.match(source, /const LOCAL_REPOST_THROTTLE_MS = 20_000;/);
  assert.match(
    source,
    /if \(nowMs - lastAt < LOCAL_REPOST_THROTTLE_MS\) continue;/,
    '스로틀 윈도 안이면 POST 를 건너뛰어야 한다',
  );
});

test('후보 목록을 받기 전에는 진입판정을 하지 않는다(로딩 경합 방지)', () => {
  assert.match(source, /if \(!candidatesLoadedRef\.current \|\| candidatesRef\.current\.length === 0\)/);
});

test('진입 보고는 기존 /proximity/enter 엔드포인트를 재사용한다 — 신규 엔드포인트 없음', () => {
  assert.match(source, /import \{ fetchProximityCandidates, postProximityEnter, /);
});

const effectStart = source.indexOf('useEffect(() => {');
const getLocationCall = source.indexOf('native.getLocation()', effectStart);
const watchLocationCall = source.indexOf('native.watchLocation(', effectStart);

test('launch build disables proximity monitoring before either location API can run', () => {
  const gate = source.indexOf('if (!PROXIMITY_ALERTS_ENABLED || !enabled) return;', effectStart);

  assert.match(source, /export const PROXIMITY_ALERTS_ENABLED = false;/);
  assert.ok(gate > effectStart, 'the effect must start with the launch safety gate');
  assert.ok(gate < getLocationCall, 'getLocation must be unreachable while the switch is false');
  assert.ok(gate < watchLocationCall, 'watchLocation must be unreachable while the switch is false');
});
