import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !/^\s*(?:\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');

// 대표 지적 2026-08-13 — "바텀시트 위에 피드리스트가 있으니까 뭔가 불안해".
// ProfileCard 시트가 [프로필 헤더] + [페이지네이션 피드 리스트] + [댓글 오버레이] 3층을 한 표면에
// 쌓고 있었다: 시트 드래그와 리스트 스크롤이 충돌하고, 시트는 URL 이 없어 뒤로가기 의미가 없고,
// "곧 닫을 표면"과 "계속 이어지는 목록"이라는 반대 신호가 겹쳤다.
// 원칙: **시트는 잎(leaf), 페이지는 탐색(browse)** — 인스타·Threads·TikTok·당근 공통.

test('the ProfileCard bottom sheet is gone — no file, no references', () => {
  assert.ok(!existsSync(join(here, '..', '..', 'components', 'ProfileCard.tsx')),
    'components/ProfileCard.tsx must be removed (superseded by the profile page)');

  for (const path of [
    '../feed/FeedList.tsx', '../feed/FeedDetail.tsx', 'FollowerList.tsx', 'FollowingList.tsx',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /ProfileCard/, `${path}: must not reference the removed sheet`);
    assert.doesNotMatch(source, /profileCardUserId/, `${path}: leftover sheet state`);
  }
});

test('every profile entry point navigates to the page instead of opening a sheet', () => {
  const entries = [
    ['../feed/FeedList.tsx', /navigate\(`\/profile\/\$\{p\.userId\}`\)/],
    ['../feed/FeedDetail.tsx', /navigate\(`\/profile\/\$\{post\.userId\}`\)/],
    ['FollowerList.tsx', /navigate\(`\/profile\/\$\{u\.id\}`\)/],
    ['FollowingList.tsx', /navigate\(`\/profile\/\$\{u\.id\}`\)/],
  ];
  for (const [path, pattern] of entries) {
    assert.match(code(read(path)), pattern, `${path}: avatar/row tap must push the profile page`);
  }
  // 아바타뿐 아니라 닉네임도 진입점이어야 한다(인스타·Threads 관례, 22px 히트영역 보완).
  assert.match(code(read('../feed/FeedList.tsx')), /className=\{styles\.nickBtn\}/,
    'FeedList: the nickname must be tappable too');
});

test('the profile page keeps every capability the sheet had (no feature regression)', () => {
  const source = code(read('UserProfile.tsx'));
  const required = [
    ['fetchUserProfile(', '프로필 조회'],
    ['followUser(', '팔로우'],
    ['unfollowUser(', '언팔로우'],
    ['createConversation(', 'DM 시작'],
    ['reportUser(', '신고'],
    ['fetchMyFeed(', '유저 피드 목록'],
    ['toggleCheer(', '응원 토글'],
    ['USER_REPORT_REASONS', '신고 사유 목록'],
  ];
  for (const [needle, label] of required) {
    assert.ok(source.includes(needle), `UserProfile must keep: ${label} (${needle})`);
  }
  // 페이지네이션도 이관돼야 한다 — 시트가 하던 것을 페이지가 못 하면 퇴행이다.
  assert.match(source, /pageRef\.current \+ 1/, 'pagination (load more) must be ported');
});

test('the page browses; comments stay on the post detail (sheet-in-sheet is what we removed)', () => {
  const source = code(read('UserProfile.tsx'));

  // 카드 탭은 게시물 상세로 — 목록 안에서 댓글을 열지 않는다(FeedList 의 기존 관례와 동일).
  assert.match(source, /navigate\(`\/feed\/post\/\$\{p\.id\}`\)/);
  assert.doesNotMatch(source, /fetchComments|postComment|toggleCommentLike/,
    'comment APIs belong to the post detail page, not to a profile list');

  // 응원은 목록에서 유지(FeedList 와 같은 규칙).
  assert.match(source, /toggleCheer\(post\.id\)/);
});

test('the profile page is registered as a route AND as a background overlay (map/list state survives)', () => {
  const app = read('../../App.tsx');
  // 일반 라우트
  assert.match(app, /<Route path="\/profile\/:userId" element=\{<PrivateRoute><UserProfile \/><\/PrivateRoute>\} \/>/);
  // BackgroundRoutes 오버레이 — /feed/post/:postId 선례. 시트의 유일한 장점(배경 보존)을 유지하되
  // URL·뒤로가기를 얻는다.
  const overlayStart = app.indexOf('{backgroundLocation && (');
  const overlayEnd = app.indexOf('</Routes>', overlayStart);
  assert.ok(overlayStart > -1 && overlayEnd > overlayStart, 'BackgroundRoutes overlay block not found');
  assert.match(app.slice(overlayStart, overlayEnd), /path="\/profile\/:userId"/,
    'the profile page must also be an overlay route so the background (map/list) is preserved');
});

test('userProfile strings are localized in all three locales', () => {
  for (const lang of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${lang}/translation.json`));
    for (const key of ['title', 'loadError', 'feedSection', 'feedEmpty']) {
      const v = json.userProfile?.[key];
      assert.ok(typeof v === 'string' && v.length > 0, `${lang}: userProfile.${key} missing`);
    }
    // 시트에서 옮겨온 액션 문구도 3로케일에 실재해야 한다.
    assert.ok(typeof json.follow?.dmBtn === 'string' && json.follow.dmBtn.length > 0,
      `${lang}: follow.dmBtn missing (DM button aria-label)`);
  }
});
