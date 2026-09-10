import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(frontendRoot, path), 'utf8');
const dmDetail = read('src/pages/dm/DmDetail.tsx');
const dmApi = read('src/api/dm.ts');
const rideNav = read('src/pages/ride/RideNav.tsx');

test('appointment directions use the authorized appointment endpoint, never card coordinates', () => {
  assert.match(dmApi, /\/market\/appointments\/\$\{appointmentId\}\/navigation/);
  assert.match(dmDetail, /status === 'ACCEPTED' && navState\?\.status === 'ready' && !!navState\.destination/);
  assert.match(dmDetail, /handleNavigate\(navState\.destination!\)/);
  assert.doesNotMatch(dmDetail, /handleNavigate\(lat!, lng!\)/);
});

test('accepted cards explain destination and location gate states inline', () => {
  assert.match(dmDetail, /appointment_navigation_destination_not_exact/);
  assert.match(dmDetail, /canRetryNavigation/);
  assert.match(dmDetail, /retryAppointmentNavigation\(appt!\.id\)/);
  assert.match(dmDetail, /locationGate\.\$\{routeGateReason\}\.title/);
  assert.match(dmDetail, /routeChecking/);
  assert.match(dmDetail, /apptNavigationNote/);
});

test('navigation payload is exact, finite, in range, and expected gate failures rethrow quietly', () => {
  assert.match(dmApi, /data\.precision !== 'exact'/);
  assert.match(dmApi, /Number\.isFinite\(lat\)/);
  assert.match(dmApi, /lat < -90/);
  assert.match(dmApi, /Number\.isFinite\(lng\)/);
  assert.match(dmApi, /lng > 180/);
  assert.match(dmApi, /\{ rethrow: true \}/);
  assert.doesNotMatch(dmApi, /navigation`\);/);
});

test('travel mode defaults to motorcycle and route lookup is explicit', () => {
  assert.match(rideNav, /const ROUTE_MODES: RouteMode\[\] = \['motorcycle', 'car', 'walking'\]/);
  assert.match(rideNav, /return ROUTE_MODES\.includes\(value as RouteMode\) \? value as RouteMode : 'motorcycle'/);
  assert.match(rideNav, /routeApi\.getRoute\(routeOrigin, dest, locale, routeMode\)/);
  assert.match(rideNav, /onClick=\{fetchRoute\}/);
  assert.doesNotMatch(rideNav, /if \(type === 'nav' && dest && !routeRequested\) fetchRoute\(\)/);
});

test('navigation copy exists in Korean, English, and Vietnamese', () => {
  for (const locale of ['ko', 'en', 'vi']) {
    const copy = JSON.parse(read(`src/locales/${locale}/translation.json`));
    assert.ok(copy.dm.apptNavigationChecking);
    assert.ok(copy.dm.apptNavigationNotExact);
    assert.ok(copy.dm.apptNavigationRetry);
    assert.ok(copy.dm.apptNavigationUnavailable);
    assert.equal(copy.rideNav.routeMode.motorcycle.length > 0, true);
    assert.equal(copy.rideNav.routeMode.car.length > 0, true);
    assert.equal(copy.rideNav.routeMode.walking.length > 0, true);
    assert.ok(copy.rideNav.findRoute);
    assert.ok(copy.rideNav.routingUnavailable);
  }
});
