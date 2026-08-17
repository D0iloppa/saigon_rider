import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 키워드 알림 전용 페이지(커밋 58bb3b9) 계약 고정. 백엔드 테스트는 23건 붙었지만
// 프론트는 0건이었다 — 이 파일이 그 갭을 메운다.

test('F-5: PATCH response with a different id (server-side idempotent merge) does not duplicate or drop the edited row', () => {
  const source = read('MarketKeywordAlerts.tsx');

  // 서버가 정규화 충돌로 기존 row 를 반환하면 updated.id !== id 로 병합 케이스를 구분해야 한다.
  assert.match(
    source,
    /const mergedIntoExisting = updated\.id !== id/,
    'handleSaveEdit must detect server-side idempotent merge by comparing updated.id to the edited id',
  );

  // 병합 시: 편집 대상(id) row 를 제거하고, 기존 row(updated.id)를 최신값으로 갱신 — 중복 id 없음, 행 소실 없음.
  assert.match(
    source,
    /prev\.filter\(\(x\) => x\.id !== id\)\.map\(\(x\) => \(x\.id === updated\.id \? updated : x\)\)/,
    'merge branch must filter out the stale edited id and update the surviving row by updated.id',
  );

  // 비병합(정상 수정) 시엔 종전처럼 제자리 갱신.
  assert.match(
    source,
    /prev\.map\(\(x\) => \(x\.id === id \? updated : x\)\)/,
    'non-merge branch must update the row in place by id',
  );
});

test('error 3-way branching: keyword_too_short / banned_keyword / keyword_alert_limit each get distinct copy', () => {
  const source = read('MarketKeywordAlerts.tsx');
  const start = source.indexOf('const describeError');
  assert.notEqual(start, -1, 'describeError is missing');
  const body = source.slice(start, start + 1200);

  assert.ok(body.includes('"code":\\s*"keyword_too_short"'), 'must check for keyword_too_short code');
  assert.match(body, /market\.keywordTooShort/);
  assert.ok(body.includes('"code":\\s*"banned_keyword"'), 'must check for banned_keyword code');
  assert.match(body, /market\.keywordBanned/);
  assert.ok(body.includes('"code":\\s*"keyword_alert_limit"'), 'must check for keyword_alert_limit code');
  assert.match(body, /market\.keywordLimitReached/);

  // 세 분기가 서로 다른 i18n 키를 쓴다 — 뭉뚱그린 단일 실패 문구로 회귀하지 않았음을 확인.
  const keys = [...body.matchAll(/t\('(market\.\w+)'/g)].map((m) => m[1]);
  const distinctErrorKeys = new Set(keys.filter((k) => k !== 'market.alertError'));
  assert.ok(distinctErrorKeys.size >= 3, `expected >=3 distinct error copy keys, got ${[...distinctErrorKeys]}`);
});

test('F-12: load failure renders an error state with retry, never a fake empty list', () => {
  const source = read('MarketKeywordAlerts.tsx');

  assert.match(
    source,
    /\.catch\(\(\) => setLoadError\(true\)\)/,
    'fetchKeywordAlerts failure must set loadError, not silently resolve to an empty list',
  );

  assert.match(
    source,
    /loadError \? \(/,
    'render must branch on loadError before falling through to the empty-state branch',
  );

  const errorBlockStart = source.indexOf('loadError ? (');
  const emptyBlockStart = source.indexOf('keywords.length === 0 ? (');
  assert.ok(errorBlockStart !== -1 && emptyBlockStart !== -1 && errorBlockStart < emptyBlockStart, 'error branch must be checked before the empty-list branch');

  const errorBlock = source.slice(errorBlockStart, emptyBlockStart);
  assert.match(errorBlock, /tone="error"/, 'load-error state must render as an error StateBlock, not a neutral empty one');
  assert.match(errorBlock, /onAction=\{\(\) => setRefreshKey/, 'load-error state must offer a retry action');
});

test("rethrow:true contract: all 4 keyword-alert API calls opt out of client.ts's built-in toast", () => {
  const source = read('../../api/market.ts');
  const start = source.indexOf('export interface KeywordAlert');
  assert.notEqual(start, -1, 'KeywordAlert section is missing from api/market.ts');
  const section = source.slice(start);

  for (const fn of ['fetchKeywordAlerts', 'addKeywordAlert', 'updateKeywordAlert', 'removeKeywordAlert']) {
    const fnStart = section.indexOf(`export async function ${fn}`);
    assert.notEqual(fnStart, -1, `${fn} is missing`);
    const fnEnd = section.indexOf('\n}', fnStart);
    const fnBody = section.slice(fnStart, fnEnd);
    assert.match(fnBody, /rethrow:\s*true/, `${fn} must call realFetch with { rethrow: true }`);
  }
});

test('entry points: MarketMain header bell, empty-listing CTA, NotificationInbox TopBar, and NotiSettings caption all route to /market/keyword-alerts', () => {
  const main = read('MarketMain.tsx');
  const bellBtnStart = main.indexOf("aria-label={t('market.keywordAlerts',");
  assert.notEqual(bellBtnStart, -1, 'MarketMain header bell button (aria-label market.keywordAlerts) is missing');
  assert.match(main.slice(Math.max(0, bellBtnStart - 150), bellBtnStart), /navigate\('\/market\/keyword-alerts'\)/, 'MarketMain header bell must navigate to /market/keyword-alerts');

  const emptyCtaStart = main.indexOf('emptyKeywordAlert');
  assert.notEqual(emptyCtaStart, -1, 'MarketMain empty-listing CTA copy is missing');
  assert.match(main.slice(Math.max(0, emptyCtaStart - 200), emptyCtaStart), /navigate\('\/market\/keyword-alerts'\)/, 'MarketMain empty-listing CTA must navigate to /market/keyword-alerts');

  const inbox = read('../notifications/NotificationInbox.tsx');
  assert.match(inbox, /onClick=\{\(\) => navigate\('\/market\/keyword-alerts'\)\}/, 'NotificationInbox TopBar action must navigate to /market/keyword-alerts');

  const noti = read('../settings/NotiSettings.tsx');
  assert.match(noti, /captionLink[\s\S]{0,80}onClick=\{\(\) => navigate\('\/market\/keyword-alerts'\)\}/, 'NotiSettings caption link must navigate to /market/keyword-alerts');

  const app = read('../../App.tsx');
  assert.match(app, /<Route path="\/market\/keyword-alerts" element=\{<PrivateRoute><MarketKeywordAlerts \/><\/PrivateRoute>\} \/>/, 'App.tsx must route /market/keyword-alerts to MarketKeywordAlerts behind PrivateRoute');
});

test('MarketMain does not resurrect the retired keyword-alert bottom sheet (no newKw state, no .alert* classes)', () => {
  const main = read('MarketMain.tsx');
  assert.doesNotMatch(main, /\bnewKw\b/, 'MarketMain must not reintroduce the retired newKw bottom-sheet state');

  const css = read('MarketMain.module.css');
  assert.doesNotMatch(css, /\.alert\w*\s*\{/, 'MarketMain.module.css must not reintroduce retired keyword-alert bottom-sheet classes');
});

test('normalization stays backend-only: no frontend re-implementation of Vietnamese tone-mark normalization', () => {
  for (const path of ['MarketKeywordAlerts.tsx', '../../api/market.ts']) {
    const source = read(path);
    assert.doesNotMatch(source, /\bnormalize\s*\(/i, `${path} must not reimplement keyword normalization (backend-only: services/search_norm.norm())`);
    assert.doesNotMatch(source, /NFD|NFKD/, `${path} must not perform Unicode decomposition for tone-mark stripping`);
    assert.doesNotMatch(source, /\\u0300-\\u036f/, `${path} must not strip combining diacritical marks client-side`);
  }
});

test('i18n parity: all new keyword-alert copy keys exist with real strings in ko/vi/en', () => {
  const keys = [
    'keywordAlerts',
    'keywordAlertsDesc',
    'keywordPlaceholder',
    'keywordAdd',
    'keywordEmpty',
    'keywordRemove',
    'alertError',
    'keywordAdded',
    'keywordUpdated',
    'keywordRemoved',
    'keywordCount',
    'keywordLimitReached',
    'keywordEdit',
    'keywordLoadError',
    'keywordTooShort',
    'keywordBanned',
    'keywordDuplicate',
  ];

  for (const lang of ['ko', 'vi', 'en']) {
    const json = JSON.parse(read(`../../locales/${lang}/translation.json`));
    for (const key of keys) {
      assert.ok(
        typeof json.market?.[key] === 'string' && json.market[key].length > 0,
        `${lang}: market.${key} must be a real localized string`,
      );
    }
    assert.ok(
      typeof json.market?.emptyKeywordAlert === 'string' && json.market.emptyKeywordAlert.length > 0,
      `${lang}: market.emptyKeywordAlert must be a real localized string`,
    );
  }
});
