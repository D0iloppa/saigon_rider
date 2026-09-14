import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// 섹션 1행 레일 + 더보기 드릴다운 (판매 중인 매물 / 게시물) — 서브페이지가 useInfiniteScroll 로
// 무한스크롤을 이관받았는지, 수동 페이지네이션이 남지 않았는지 확인한다.

test('listings and posts sub-pages exist and use useInfiniteScroll (no manual pagination)', () => {
  const listings = read('./ProfileListings.tsx');
  const posts = read('./ProfilePosts.tsx');

  assert.match(listings, /useInfiniteScroll[<(]/);
  assert.match(posts, /useInfiniteScroll[<(]/);

  for (const [name, source] of [['ProfileListings', listings], ['ProfilePosts', posts]]) {
    assert.doesNotMatch(source, /pageRef|onScroll=/, `${name}: manual pagination must not be reintroduced`);
  }

  assert.match(listings, /fetchListings\(/, 'ProfileListings must call fetchListings');
  assert.match(posts, /fetchMyFeed\(/, 'ProfilePosts must call fetchMyFeed');
});

test('App.tsx registers both sub-routes as a normal route and as a background overlay', () => {
  const app = read('../../App.tsx');

  assert.match(app, /<Route path="\/profile\/:userId\/listings" element=\{<PrivateRoute><ProfileListings \/><\/PrivateRoute>\} \/>/);
  assert.match(app, /<Route path="\/profile\/:userId\/posts" element=\{<PrivateRoute><ProfilePosts \/><\/PrivateRoute>\} \/>/);

  const overlayStart = app.indexOf('{backgroundLocation && (');
  const overlayEnd = app.indexOf('</Routes>', overlayStart);
  assert.ok(overlayStart > -1 && overlayEnd > overlayStart, 'BackgroundRoutes overlay block not found');
  const overlay = app.slice(overlayStart, overlayEnd);
  assert.match(overlay, /path="\/profile\/:userId\/listings"/, 'listings sub-page must also be a background overlay');
  assert.match(overlay, /path="\/profile\/:userId\/posts"/, 'posts sub-page must also be a background overlay');
});

test('UserProfile.module.css switched to a single-row rail (marketGrid/feedGrid removed)', () => {
  const css = read('./UserProfile.module.css');

  assert.match(css, /\.rail\s*\{[^}]*overflow-x:\s*auto[^}]*scrollbar-width:\s*none[^}]*\}/s);
  assert.match(css, /\.railItem\s*\{[^}]*flex:\s*0 0 150px[^}]*\}/s);
  assert.doesNotMatch(css, /\.marketGrid/);
  assert.doesNotMatch(css, /\.feedGrid/);
});
