import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 대화방 게시판(init/218, P1) 계약 —
// (1) 세 라우트가 등록돼 있고 lazy 로딩된다.
// (2) 진입 버튼은 direct 방에서는 뜨지 않는다 (서버도 direct 는 400).
// (3) 채널 관리 진입점은 운영진(owner/admin)에게만 — 서버 권한과 같은 기준.
// (4) 글 삭제 버튼은 작성자 또는 운영진에게만.

test('board routes are registered and lazy-loaded', () => {
  const app = read('../../App.tsx');
  for (const name of ['DmBoard', 'DmBoardCompose', 'DmBoardPost']) {
    assert.match(app, new RegExp(`const ${name} = lazyWithRetry\\(\\(\\) => import\\('@/pages/dm/${name}'\\)\\)`));
  }
  assert.match(app, /path="\/dm\/:conversationId\/board" element=\{<PrivateRoute><DmBoard \/><\/PrivateRoute>\}/);
  assert.match(
    app,
    /path="\/dm\/:conversationId\/board\/new" element=\{<PrivateRoute><DmBoardCompose \/><\/PrivateRoute>\}/,
  );
  assert.match(
    app,
    /path="\/dm\/:conversationId\/board\/:postId" element=\{<PrivateRoute><DmBoardPost \/><\/PrivateRoute>\}/,
  );
});

test('the board entry button in the chat header renders only for non-direct rooms', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /\{!isDirect && \(\s*\n\s*<button/);
  assert.match(detail, /navigate\(`\/dm\/\$\{conversationId\}\/board`\)/);
  assert.match(detail, /<LayoutList size=\{21\}/);
});

test('channel management is offered to owner/admin only', () => {
  const board = read('DmBoard.tsx');
  assert.match(board, /const isManager = myRole === 'owner' \|\| myRole === 'admin';/);
  assert.match(board, /isManager \? \(\s*\n\s*<button/);
});

test('post deletion is offered to the author or owner/admin only', () => {
  const post = read('DmBoardPost.tsx');
  assert.match(
    post,
    /const canDelete = !!post && \(post\.authorId === me\?\.id \|\| myRole === 'owner' \|\| myRole === 'admin'\);/,
  );
});

test('comments stay a disabled placeholder in P1 (no API call)', () => {
  const post = read('DmBoardPost.tsx');
  assert.match(post, /commentsPlaceholder/);
  assert.doesNotMatch(post, /fetchComments|createComment/);
});

test('board strings exist in all three locales', () => {
  for (const loc of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${loc}/translation.json`));
    assert.ok(json.dm.board, `${loc} is missing dm.board`);
    for (const key of [
      'title',
      'channelsEmpty',
      'createChannel',
      'channelName',
      'postCompose',
      'postEmpty',
      'deletePost',
      'manageChannels',
    ]) {
      assert.ok(json.dm.board[key], `${loc} is missing dm.board.${key}`);
    }
  }
});
