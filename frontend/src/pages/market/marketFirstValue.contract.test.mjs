import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('로그인 완료 기본 목적지는 홈이 아니라 공개 마켓이다', () => {
  for (const path of [
    '../auth/Splash.tsx',
    '../auth/OAuthLogin.tsx',
    '../auth/OAuthResult.tsx',
    '../auth/ProfileSetup.tsx',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /consumeReturnTo\(\) \?\? '\/home'/, `${path} still defaults to home`);
    assert.match(source, /consumeReturnTo\(\) \?\? '\/market'/, `${path} must default to market`);
  }
});

test('첫 스플래시 CTA도 로그인 대신 공개 마켓을 연다', () => {
  const source = read('../auth/Splash.tsx');
  assert.match(source, /<Button onClick=\{\(\) => navigate\('\/market'\)\}>/);
  assert.doesNotMatch(source, /<Button onClick=\{\(\) => navigate\('\/auth\/oauth'\)\}>/);
});

test('신규·익명 마켓 진입은 위치를 자동 요청하지 않고 전체 결과를 먼저 보여준다', () => {
  const source = read('MarketMain.tsx');

  assert.match(source, /effectiveLocationMode = locationMode === 'gps' && \(!userId \|\| permissionIntent !== 'granted'\) && !coords/);
  assert.match(source, /if \(userId && permissionIntent === 'granted'\) void ensureLocation\(\)/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{ void ensureLocation\(\); \}, \[ensureLocation\]\)/);
});

test('스플래시 문구는 퀘스트가 아니라 오토바이 거래와 만남 이동을 약속한다', () => {
  const locales = [
    read('../../locales/vi/translation.json'),
    read('../../locales/ko/translation.json'),
    read('../../locales/en/translation.json'),
  ];

  for (const source of locales) {
    const splash = JSON.parse(source).splash;
    assert.ok(splash.subtitle);
    assert.doesNotMatch(splash.subtitle, /quest|nhiệm vụ/i);
  }
});
