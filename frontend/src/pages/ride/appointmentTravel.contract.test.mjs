import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');
const rideNav = read('RideNav.tsx');
const dmApi = read('../../api/dm.ts');

test('appointment departure is explicit and arrival uses only a foreground native GPS watch', () => {
  assert.match(dmApi, /travel-events\/departure/, 'departure must use its dedicated endpoint');
  assert.match(dmApi, /travel-events\/arrival/, 'arrival must use its dedicated endpoint');
  assert.match(rideNav, /onClick=\{recordDeparture\}/);
  assert.match(rideNav, /native\.watchLocation/);
  assert.match(rideNav, /travel\?\.departed && !travel\.arrived/);
  assert.match(rideNav, /pos\.accuracy == null \|\| pos\.accuracy > APPOINTMENT_ARRIVAL_ACCURACY_MAX_M/);
  assert.match(rideNav, /recordAppointmentArrival\(appointmentId, pos\.lat, pos\.lng, pos\.accuracy\)/);
});

test('travel UI does not create a location channel or use browser location APIs', () => {
  assert.doesNotMatch(rideNav, /createOrJoinLocationChannel/);
  assert.doesNotMatch(rideNav, /navigator\.geolocation/);
});
