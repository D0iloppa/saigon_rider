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
// (5) 댓글(init/219, P2) — 목록·작성 API 를 쓰고, 답글은 한 단, 삭제는 작성자 또는 운영진.

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

test('the post detail loads and posts comments (init/219, P2)', () => {
  const post = read('DmBoardPost.tsx');
  assert.doesNotMatch(post, /commentsPlaceholder/); // P1 의 비활성 자리는 사라졌다
  assert.match(post, /fetchChannelComments\(conversationId, postId\)/);
  assert.match(post, /createChannelComment\(conversationId, postId, body, replyTo\?\.id \?\? null\)/);
  // 답글은 한 단만 들여쓴다 — 최상위 댓글 아래에 parentId 가 그 댓글인 것들만 붙인다.
  assert.match(post, /comments\.filter\(\(c\) => !c\.parentId\)/);
  assert.match(post, /comments\.filter\(\(r\) => r\.parentId === c\.id\)/);
});

test('comment deletion is offered to the author or owner/admin only', () => {
  const post = read('DmBoardPost.tsx');
  assert.match(
    post,
    /const canDeleteComment = !c\.deleted && \(c\.authorId === me\?\.id \|\| isManager\);/,
  );
  assert.match(post, /const isManager = myRole === 'owner' \|\| myRole === 'admin';/);
});

test('replying targets the top-level comment and can be cancelled', () => {
  const post = read('DmBoardPost.tsx');
  // 답글에 답글을 달아도 부모는 최상위 댓글 — 서버가 접는 규칙과 화면이 같아야 한다.
  assert.match(post, /id: c\.parentId \?\? c\.id,/);
  // 칩 이름은 실제로 스레드가 붙는 최상위 댓글의 작성자, 정작 답한 상대는 mention 으로 보존한다.
  assert.match(post, /name: parent \? \(parent\.authorNickname \?\? unknown\) : name,/);
  assert.match(post, /mention: parent \? name : null,/);
  assert.ok(post.includes('const body = replyTo?.mention ? `@${replyTo.mention} ${typed}` : typed;'));
  assert.match(post, /replyTo && \(/);
  assert.match(post, /dm\.board\.commentCancelReply/);
  assert.match(post, /onClick=\{\(\) => setReplyTo\(null\)\}/);
});

test('the comment input does not send mid-IME-composition', () => {
  const post = read('DmBoardPost.tsx');
  // 한국어·베트남어 조합 중 Enter 가 조기 전송되던 결함 — MessageComposer 와 같은 가드.
  assert.match(post, /e\.key === 'Enter' && !e\.shiftKey && !e\.nativeEvent\.isComposing/);
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
      'comments',
      'commentsEmpty',
      'commentPlaceholder',
      'commentReply',
      'commentReplyingTo',
      'commentDelete',
      'commentDeleted',
    ]) {
      assert.ok(json.dm.board[key], `${loc} is missing dm.board.${key}`);
    }
  }
});
