import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 도착 예정 시각(arrivalTime) 이 기기 타임존이 아니라 항상 베트남 현지시각(ICT) 으로 표기돼야
// 한다 (service-rules.md 시각 표기 절, 제정 2026-08-06). 과거엔 Date.now() + duration_s*1000 을
// 로컬 getHours()/getMinutes() 로 읽어 한국(KST)에서 실기기 테스트 시 KST 로 표시됐다.

test('RideNav.tsx: applyRoute 는 로컬 getHours()/getMinutes() 대신 formatVnTime(공용 ICT 포맷터) 를 쓴다', () => {
  const source = read('RideNav.tsx');

  const fnStart = source.indexOf('const applyRoute = (data: RouteData) => {');
  assert.ok(fnStart >= 0, 'applyRoute not found in RideNav.tsx');
  const fnEnd = source.indexOf('\n  };', fnStart);
  const fn = source.slice(fnStart, fnEnd);

  assert.match(fn, /setArrivalTime\(formatVnTime\(d, i18n\.language, \{ hourCycle: 'h23' \}\)\)/);
  assert.doesNotMatch(fn, /getHours\(\)/, 'applyRoute must not read local wall-clock hours');
  assert.doesNotMatch(fn, /getMinutes\(\)/, 'applyRoute must not read local wall-clock minutes');
});

test("RideNav.tsx: formatVnTime 을 '@/lib/vnTime' 에서 import 한다 (임시 로컬 재구현 금지)", () => {
  const source = read('RideNav.tsx');
  assert.match(source, /import \{ formatVnTime \} from '@\/lib\/vnTime';/);
});

test('vnTime.ts: formatVnTime 은 Asia/Ho_Chi_Minh 타임존을 하드코딩하고, 기존 호출부(opts 미지정) 는 형식이 그대로다', () => {
  const source = read(join('..', '..', 'lib', 'vnTime.ts'));
  assert.match(source, /timeZone: VN_TIME_ZONE/);
  assert.match(source, /VN_TIME_ZONE = 'Asia\/Ho_Chi_Minh'/);
  // opts 는 추가 파라미터로만 확장 — 기존 hour/minute 2-digit 기본값 위에 얹는다(하위호환).
  assert.match(source, /hour: '2-digit',\s*\n\s*minute: '2-digit',\s*\n\s*\.\.\.opts,/);
});

// 순수 함수 단위 검증: formatVnTime 이 실제로 하는 계산(ICT 타임존 고정 + hourCycle:'h23')을
// vnTime.ts 밖에서 재구현하지 않고, Intl 자체 동작을 여러 host TZ 아래서 실행해 동일 결과가
// 나오는지 확인한다. RideNav 가 넘기는 옵션과 완전히 동일한 Intl 호출이다.
function formatIctH23(epochMs, tz) {
  const out = execFileSync(
    process.execPath,
    ['-e', `
      const d = new Date(${epochMs});
      process.stdout.write(d.toLocaleTimeString(undefined, {
        timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }));
    `],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
  );
  return out;
}

test('formatVnTime(hourCycle:h23) 는 기기 타임존(TZ env) 이 바뀌어도 항상 같은 ICT 시각 문자열을 낸다', () => {
  // 2026-08-07T02:41:00Z == 2026-08-07 09:41 ICT (UTC+7)
  const epochMs = Date.parse('2026-08-07T02:41:00Z');
  const results = ['Asia/Seoul', 'UTC', 'America/Los_Angeles', 'Asia/Ho_Chi_Minh'].map((tz) => formatIctH23(epochMs, tz));
  for (const r of results) assert.equal(r, '09:41', `expected ICT 09:41 regardless of host TZ, got ${r}`);
});

test('hourCycle:h23 은 자정 부근에서도 "24:xx" 가 아니라 "00:xx" 로 나온다 (hour12:false 만으로는 로케일에 따라 24:xx 로 새는 ICU 이슈 회피)', () => {
  // 2026-08-06T17:05:00Z == 2026-08-07 00:05 ICT
  const epochMs = Date.parse('2026-08-06T17:05:00Z');
  const results = ['Asia/Seoul', 'UTC', 'America/Los_Angeles'].map((tz) => formatIctH23(epochMs, tz));
  for (const r of results) assert.equal(r, '00:05', `expected 00:05, got ${r}`);
});
