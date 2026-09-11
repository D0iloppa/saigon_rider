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

test('appointment handoff serializes identity, optional place name, and exact coordinates', () => {
  assert.match(dmDetail, /new URLSearchParams\(\{[\s\S]*appointmentId: destination\.appointmentId,[\s\S]*lat: String\(destination\.placeLat\),[\s\S]*lng: String\(destination\.placeLng\),/);
  assert.match(dmDetail, /if \(destination\.placeName\) query\.set\('name', destination\.placeName\)/);
  assert.match(dmDetail, /navigate\(`\/ride-nav\?\$\{query\.toString\(\)\}`\)/);
});

test('ride navigation rejects missing, malformed, non-finite, and out-of-range URL coordinates before route or map actions', () => {
  assert.match(rideNav, /function parseNavDestination\(params: URLSearchParams\): Coords \| null/);
  assert.match(rideNav, /rawLat == null \|\| rawLng == null \|\| rawLat\.trim\(\) === '' \|\| rawLng\.trim\(\) === ''/);
  assert.match(rideNav, /Number\.isFinite\(lat\) \|\| lat < -90 \|\| lat > 90 \|\| !Number\.isFinite\(lng\) \|\| lng < -180 \|\| lng > 180/);
  assert.match(rideNav, /const navDestination = useMemo\(\(\) => parseNavDestination\(params\), \[params\]\)/);
  assert.match(rideNav, /if \(type !== 'nav' \|\| !dest\) return;/);
  assert.match(rideNav, /const openGoogleMaps = \(\) => \{\n    if \(!dest\) return;/);
  assert.match(rideNav, /type === 'nav' && dest && !routeRequested/);
});

test('navigation back behavior remains history-based', () => {
  assert.match(rideNav, /navigate\(-1\);/);
});

test('travel mode defaults to motorcycle and route lookup is explicit', () => {
  assert.match(rideNav, /const ROUTE_MODES: RouteMode\[\] = \['motorcycle', 'car', 'walking'\]/);
  assert.match(rideNav, /return ROUTE_MODES\.includes\(value as RouteMode\) \? value as RouteMode : 'motorcycle'/);
  assert.match(rideNav, /routeApi\.getRoute\(routeOrigin, dest, locale, routeMode\)/);
  assert.match(rideNav, /onClick=\{fetchRoute\}/);
  assert.doesNotMatch(rideNav, /if \(type === 'nav' && dest && !routeRequested\) fetchRoute\(\)/);
});

test('both external map handoffs use the native bridge with the selected travel mode', () => {
  assert.match(rideNav, /const GOOGLE_TRAVEL_MODES: Record<RouteMode, string> = \{\s*motorcycle: 'two-wheeler',\s*car: 'driving',\s*walking: 'walking',\s*\}/);
  assert.match(rideNav, /const openGoogleMaps = \(\) => \{[\s\S]*?if \(!dest\) return;[\s\S]*?native\.openUrl\(`https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=\$\{dest\.lat\},\$\{dest\.lng\}&travelmode=\$\{GOOGLE_TRAVEL_MODES\[routeMode\]\}`\)/);
  assert.match(rideNav, /const openGoogleReroute = \(\) => \{[\s\S]*?if \(!dest\) return;[\s\S]*?native\.openUrl\(`https:\/\/www\.google\.com\/maps\/dir\/\?api=1\$\{o\}&destination=\$\{dest\.lat\},\$\{dest\.lng\}&travelmode=\$\{GOOGLE_TRAVEL_MODES\[routeMode\]\}`\)/);
  assert.doesNotMatch(rideNav, /\bwindow\.open\(/);
  assert.doesNotMatch(rideNav, /\bnavigator\./);
});

test('successful route preview renders duration, distance, and polyline before guidance starts', () => {
  assert.match(rideNav, /if \(!data\?\.configured\) \{[\s\S]*?return;[\s\S]*?\}\n    applyRoute\(data\);/);
  assert.match(rideNav, /polyline=\{route\?\.polyline\}/);
  assert.match(rideNav, /route\?\.duration_text/);
  assert.match(rideNav, /route\?\.distance_text/);
  assert.match(rideNav, /!guidanceStarted && !loading && route\?\.configured/);
});

test('navigation guidance watch starts only from the explicit start action', () => {
  assert.match(rideNav, /const \[guidanceStarted, setGuidanceStarted\] = useState\(isQuest\);/);
  assert.match(rideNav, /useEffect\(\(\) => \{\n    if \(!guidanceStarted\) return;\n    const stop = native\.watchLocation/);
  assert.match(rideNav, /const startGuidance = \(\) => \{[\s\S]*?if \(type !== 'nav' \|\| !route\?\.configured\) return;[\s\S]*?setGuidanceStarted\(true\);/);
  assert.match(rideNav, /<button className=\{styles\.startFab\} onClick=\{startGuidance\}>/);
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
