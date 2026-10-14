import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 2026-08-13 개정 (대표 결정) — **로그인 사용자는 홈, 비로그인 둘러보기는 마켓.**
//
// `bad1a05`(2026-08-12)은 로그인 후 목적지까지 마켓으로 통일했고 이 테스트가 그걸 고정하고 있었다.
// 그러나 홈에는 유가·날씨·침수·주유소·정비소 진입점이 걸려 있어 로그인 사용자에게는 홈이 맞고
// (S-5 채팅 탭 승격 시 6탭 확정 = 홈 유지 결정), 마켓 우선은 **아직 로그인하지 않은 사람에게
// 서비스 가치를 먼저 보여주는** 목적이었다. 두 목적을 사용자 상태로 분리한다.
// 나머지 마켓 우선 항목(익명 진입 시 위치 미요청·스플래시 문구)은 그대로 유효하다.
//
// 2026-10-14 개정 (대표 결정, F-N-03) — **비로그인 진입은 스플래시 [둘러보기][로그인] 두 버튼.**
// [둘러보기](주행동) → `/browse`(게스트 둘러보기, [상품|커뮤니티] 세그먼트가 MarketMain·FeedList 를
// 그대로 감싼다) / [로그인](보조) → `/auth/oauth`. 종전 "단일 버튼 → /market" 계약은 여기서 대체한다.
// 로그인 후 목적지(홈)와 마켓 우선 항목은 그대로다.

test('로그인 완료 기본 목적지는 홈이다 (딥링크 복귀가 우선)', () => {
  for (const path of [
    '../auth/Splash.tsx',
    '../auth/OAuthLogin.tsx',
    '../auth/OAuthResult.tsx',
    '../auth/ProfileSetup.tsx',
  ]) {
    const source = read(path);
    assert.match(source, /consumeReturnTo\(\) \?\? '\/home'/, `${path} must default to home when logged in`);
    // 진입 경로가 4파일에 흩어져 있어 한 곳만 바꾸면 "OAuth 는 마켓 / 스플래시는 홈"으로 갈린다
    // (2026-08-13 실제 사고). 어느 파일에도 마켓 폴백이 남아 있으면 실패시킨다.
    assert.doesNotMatch(source, /consumeReturnTo\(\) \?\? '\/market'/, `${path} still defaults to market`);
  }
});

test('스플래시는 [둘러보기](주행동 → /browse) + [로그인](보조 → /auth/oauth) 두 버튼이다 (2026-10-14)', () => {
  const source = read('../auth/Splash.tsx');
  // 주행동은 채움(primary 기본값) — 로그인 없이 가치를 먼저 보여준다.
  assert.match(source, /<Button onClick=\{\(\) => navigate\('\/browse'\)\}>\{t\('splash\.startBtn'\)\}<\/Button>/);
  // 로그인은 보조(glass) — 주행동과 무게가 같아지면 안 된다.
  assert.match(source, /<Button variant="glass" onClick=\{\(\) => navigate\('\/auth\/oauth'\)\}>\{t\('splash\.loginBtn'\)\}<\/Button>/);
  // 종전 단일 CTA(→ /market)는 남지 않는다 — 게스트 마켓 진입은 /browse 세그먼트가 담당한다.
  assert.doesNotMatch(source, /navigate\('\/market'\)/);

  for (const lang of ['ko', 'en', 'vi']) {
    const splash = JSON.parse(read(`../../locales/${lang}/translation.json`)).splash;
    assert.ok(splash.startBtn && splash.loginBtn, `${lang} splash.startBtn/loginBtn missing`);
  }
});

test('게스트 둘러보기(/browse)는 기존 MarketMain·FeedList 를 그대로 끼운다 — 포크·복제 없음 (2026-10-14)', () => {
  const source = read('../browse/GuestBrowse.tsx');
  assert.match(source, /import MarketMain from '@\/pages\/market\/MarketMain'/);
  assert.match(source, /import FeedList from '@\/pages\/feed\/FeedList'/);
  assert.match(source, /<MarketMain embedded \/>/);
  assert.match(source, /<FeedList embedded \/>/);
  // 탭은 URL 쿼리 — 새로고침·뒤로가기·상세 왕복에 유지된다.
  assert.match(source, /searchParams\.get\('tab'\) === 'community' \? 'community' : 'market'/);
  // 로그인 사용자는 보던 탭의 회원 화면으로(쓰기→로그인 후 맥락 유지, 2026-10-14).
  assert.match(source, /tab === 'community' \? '\/feed' : '\/market'/);

  for (const lang of ['ko', 'en', 'vi']) {
    const browse = JSON.parse(read(`../../locales/${lang}/translation.json`)).browse;
    assert.ok(browse?.tabMarket && browse?.tabCommunity, `${lang} browse.tabMarket/tabCommunity missing`);
  }
});

test('신규·익명 마켓 진입은 위치 권한을 새로 요청하지 않고, 이미 승인된 경우에만 재측위한다', () => {
  const source = read('MarketMain.tsx');

  assert.match(source, /effectiveLocationMode = locationMode === 'gps' && \(!userId \|\| permissionIntent !== 'granted'\) && !coords/);
  assert.match(source, /if \(permissionIntent === 'granted'\) void ensureLocation\(\)/);
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
