import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('guest bar fills the empty tabbar slot on public browse screens only', () => {
  const shell = read('AppShell.tsx');

  // 탭바를 숨기는 이유가 둘로 나뉜다: 미인증(=게스트 바가 대신한다) vs 경로 자체가 하단 CTA 를 쓴다(=아무것도 두지 않는다).
  assert.match(shell, /const tabBarHiddenByPath = HIDE_TABBAR_PATHS\.some\(\(p\) => pathname\.startsWith\(p\)\)/);
  assert.match(shell, /const hideTabBar = !isAuthenticated \|\| tabBarHiddenByPath/);
  assert.match(shell, /const showGuestBar = !isAuthenticated && !tabBarHiddenByPath/);
  assert.match(shell, /\{showGuestBar && \(/);
});

test('guest bar CTA reuses the shared auth guard so the current route is restored after login', () => {
  const shell = read('AppShell.tsx');

  assert.match(shell, /import \{ useRequireAuth \} from '@\/hooks\/useRequireAuth'/);
  assert.match(shell, /onClick=\{\(\) => \{ requireAuth\(\); \}\}/);

  // returnTo 보존은 훅 하나에만 있어야 한다 — AppShell 이 별도 경로를 만들면 복귀 규칙이 갈라진다.
  assert.doesNotMatch(shell, /saveReturnTo|navigate\('\/auth\/oauth'\)/);
});

test('expired session keeps public browse screens instead of pushing to splash', () => {
  const app = read('../../App.tsx');

  assert.match(app, /const PUBLIC_BROWSE_PREFIXES = \['\/market', '\/biz'\]/);

  const handler = app.slice(app.indexOf('setSessionExpiredHandler(('), app.indexOf('// 정지/밴 계정 전역 핸들러'));
  const logoutAt = handler.indexOf('logout();');
  const publicReturnAt = handler.indexOf('PUBLIC_BROWSE_PREFIXES.some(');
  const replaceAt = handler.indexOf("window.location.replace('/splash')");

  assert.ok(logoutAt !== -1, 'expired session must still clear the session');
  assert.ok(publicReturnAt !== -1, 'public browse paths must be checked');
  // 로그아웃 → 공개 경로면 그 자리 유지 → 아니면 스플래시. 순서가 뒤집히면 익명 열람이 다시 튕긴다.
  assert.ok(logoutAt < publicReturnAt, 'logout must run before the public-path early return');
  assert.ok(publicReturnAt < replaceAt, 'public-path early return must precede the splash redirect');
  assert.match(handler.slice(publicReturnAt), /^PUBLIC_BROWSE_PREFIXES\.some\(\(prefix\) => p === prefix \|\| p\.startsWith\(`\$\{prefix\}\/`\)\)\) return;/);
});

test('sell FAB on the public list enters login instead of replacing history with splash', () => {
  const main = read('../../pages/market/MarketMain.tsx');

  // 게스트 바가 "로그인하면 판매할 수 있어요"라고 안내하는 바로 위 버튼이다 — 여기서 PrivateRoute 로
  // 튕기면 replace 라 목록으로 돌아올 수도 없다.
  assert.match(main, /onClick=\{\(\) => \{ if \(requireAuth\(\)\) navigate\('\/market\/new'\); \}\}/);
});

test('guest bar copy exists in all three locales', () => {
  for (const lang of ['ko', 'en', 'vi']) {
    const dict = JSON.parse(read(`../../locales/${lang}/translation.json`));
    assert.equal(typeof dict.guest?.barText, 'string', `${lang} guest.barText missing`);
    assert.equal(typeof dict.guest?.barCta, 'string', `${lang} guest.barCta missing`);
    assert.ok(dict.guest.barText.length > 0 && dict.guest.barCta.length > 0, `${lang} guest copy is empty`);
  }
});
