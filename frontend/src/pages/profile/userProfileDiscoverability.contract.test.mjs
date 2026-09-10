import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const profile = read('./UserProfile.tsx');
const market = read('../market/MarketDetail.tsx');
const dm = read('../dm/DmDetail.tsx');
const api = read('../../api/profile.ts');

test('expanded profile uses truthful server fields and existing seller listing API', () => {
  assert.match(api, /marketplace_sold_count/);
  assert.match(api, /marketplace_review_count/);
  assert.match(api, /marketplace_avg_rating/);
  assert.match(profile, /fetchListings\(\{ sellerId: userId, hideSold: true, publicView: true, page: 1, size: 4 \}\)/);
  // WP-4(2026-09-09, 당근 비교 트리아지 F049, 대표 승인) — 공개 프로필에 신뢰 티어칩 노출을
  // 허용하되, 원값 manner_temp(숫자 온도)는 여전히 응답/화면 어디에도 실리지 않아야 한다.
  // 이 assert 는 원값 금지를 계속 강제한다 — 완화가 아니라 범위를 좁힌 것.
  assert.doesNotMatch(profile, /mannerTemp|manner score/i);
  assert.doesNotMatch(api, /manner_temp/i);
  // 티어칩 자체는 노출돼야 한다 — 서버가 미리 변환한 tier 만 받는다(TrustTierChip 의 tier prop).
  assert.match(profile, /<TrustTierChip tier={profile\.trustTier} \/>/);
  assert.match(api, /trust_tier/);
});

test('market seller identity and direct chat header expose safe profile routes', () => {
  assert.match(market, /detail\.seller\.id === myId \? '\/profile' : `\/profile\/\$\{detail\.seller\.id\}`/);
  assert.match(dm, /isDirect && otherUserId/);
  assert.match(dm, /otherUserId === user\?\.id \? '\/profile' : `\/profile\/\$\{otherUserId\}`/);
  assert.match(dm, /isDirect && !isMine && otherUserId/);
  assert.match(dm, /messageProfileBtn/);
});

test('new labels exist in all supported locales', () => {
  for (const language of ['ko', 'en', 'vi']) {
    const locale = JSON.parse(read(`../../locales/${language}/translation.json`));
    for (const key of ['openProfile', 'trustSection', 'memberSince', 'completedSales', 'marketReviews', 'marketSection', 'marketEmpty', 'marketError']) {
      assert.equal(typeof locale.userProfile[key], 'string', `${language} missing userProfile.${key}`);
    }
  }
});
