import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// S-5 (D-6, 대표 결정 2026-08-12): 채팅이 프로필 안쪽 아이콘에 묻혀 있어 답장까지 3탭 이상
// 들어가야 했고, 미읽음은 프로필 탭의 dot 하나뿐이라 몇 건인지 알 수 없었다.
// 결정은 "홈 유지 + 채팅 추가 = 6탭" — 홈에 걸린 정보 화면(유가·날씨·침수) 진입점을 잃지 않기 위함.

test('chat is a first-class tab, not a profile sub-screen', () => {
  const tabbar = read('TabBar.tsx');

  // /dm 이 자기 탭을 갖는다 — 프로필 소속으로 남으면 채팅 화면에서 프로필 탭이 활성 표시된다.
  assert.match(tabbar, /'\/dm': \['\/dm'\]/);
  const profileBlock = tabbar.slice(tabbar.indexOf("'/profile': ["), tabbar.indexOf('};'));
  assert.doesNotMatch(profileBlock, /'\/dm'/, '/dm must be removed from the profile tab prefixes');
});

test('tab order keeps home and inserts chat before community', () => {
  const tabbar = read('TabBar.tsx');
  const paths = [...tabbar.matchAll(/\{ path: '([^']+)',/g)].map((m) => m[1]);

  assert.deepEqual(paths, ['/home', '/market', '/map', '/dm', '/feed', '/profile']);
});

test('unread count renders as a number badge on the chat tab only', () => {
  const tabbar = read('TabBar.tsx');

  // 배지 소스는 채팅 탭 하나 — 다른 탭에 dmUnread 가 붙으면 알림 위치가 다시 갈라진다.
  assert.equal([...tabbar.matchAll(/badge: dmUnread/g)].length, 1);
  assert.match(tabbar, /\{ path: '\/dm',\s+label: t\('tabbar\.chat'\),\s+Icon: MessageCircle,\s+badge: dmUnread \}/);

  // dot(있다/없다)이 아니라 건수를 보여준다. 큰 수는 99+ 로 잘라 탭 폭을 지킨다.
  assert.match(tabbar, /tab\.badge > 0 &&/);
  assert.match(tabbar, /tab\.badge > 99 \? '99\+' : tab\.badge/);
  assert.doesNotMatch(tabbar, /navDot/, 'the old dot must be gone, not left alongside the badge');
});

test('badge style exists and the orphaned dot style is removed', () => {
  const css = read('TabBar.module.css');

  assert.match(css, /\.navBadge \{/);
  assert.doesNotMatch(css, /\.navDot \{/);
  // 6탭에서 탭 폭이 좁아진다 — 긴 vi 라벨이 2줄로 접히면 탭 높이가 어긋난다.
  assert.match(css, /white-space: nowrap;/);
});

test('chat tab label exists in all three locales', () => {
  for (const lang of ['ko', 'en', 'vi']) {
    const dict = JSON.parse(read(`../../locales/${lang}/translation.json`));
    assert.equal(typeof dict.tabbar?.chat, 'string', `${lang} tabbar.chat missing`);
    assert.ok(dict.tabbar.chat.length > 0, `${lang} tabbar.chat is empty`);
  }
});

test('chat list keeps the tabbar while the chat room hides it', () => {
  const shell = read('AppShell.tsx');
  const list = shell.slice(shell.indexOf('const HIDE_TABBAR_PATHS'), shell.indexOf('];', shell.indexOf('const HIDE_TABBAR_PATHS')));

  // 대화방(/dm/:id)은 하단 입력바가 탭바 자리를 쓴다. 목록(/dm)은 탭 루트라 탭바가 있어야 한다.
  assert.match(list, /'\/dm\/'/);
  assert.doesNotMatch(list, /'\/dm',/);
});
