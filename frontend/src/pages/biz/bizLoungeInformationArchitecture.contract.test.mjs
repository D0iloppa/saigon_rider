import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manage = read('./BizManage.tsx');
const adsManage = read('./BizAdsManage.tsx');
const app = read('../../App.tsx');
const dashboardCss = read('./BizDashboard.module.css');
const newsCss = read('./BizNewsManage.module.css');
const priceCss = read('./BizPriceManage.module.css');
const news = read('./BizNewsManage.tsx');
const price = read('./BizPriceManage.tsx');

test('partner lounge keeps a compact ad summary and routes the full list to a dedicated page', () => {
  assert.match(manage, /navigate\('\/biz\/ads', \{ state: profileState\(active\) \}\)/);
  assert.match(manage, /className=\{styles\.adsSummary\}/);
  assert.doesNotMatch(manage, /adList\.map\(/, 'the lounge must not grow with every ad card');
  assert.match(app, /path="\/biz\/ads"[^\n]*<BizAdsManage/);
  assert.match(adsManage, /fetchBusinessAds\(profileId\)/);
  assert.match(adsManage, /bizContractAction\(ad\) === 'contract'/, 'contract eligibility remains centralized');
  assert.match(adsManage, /onBack=\{\(\) => navigate\('\/biz\/manage', \{ replace: true, state: profileState \}\)\}/);
});

test('review heading and filter share one centered line without offset hacks', () => {
  assert.match(dashboardCss, /\.reviewSectionHead\s*\{[^}]*align-items:\s*center;/s);
  assert.match(dashboardCss, /\.reviewSectionHead \.sectionTitle\s*\{[^}]*margin:\s*0;[^}]*line-height:\s*1\.35;/s);
  assert.match(dashboardCss, /\.filterToggle, \.filterToggleActive\s*\{[^}]*width:\s*auto;[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s);
});

test('management page heroes put the description above a full-width mobile CTA', () => {
  for (const [name, css] of [['news', newsCss], ['price', priceCss]]) {
    assert.match(css, /\.hero\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*stretch;/s, `${name} hero must stack`);
    assert.match(css, /\.hero > button\s*\{[^}]*width:\s*100%;/s, `${name} CTA must fill the row`);
  }
  assert.doesNotMatch(news, /<Button fullWidth=\{false\}/);
  assert.doesNotMatch(price, /<Button fullWidth=\{false\}/);
  assert.doesNotMatch(adsManage, /<Button fullWidth=\{false\}/);
});

test('news, price, and ad management use loaded-scope search, meaningful sort, and created metadata', () => {
  assert.match(news, /newsLoadedScope/);
  assert.match(news, /newsCreatedAt/);
  assert.match(news, /existingIds = new Set/);
  assert.match(news, /news\.length > 0 && hasMore/, 'load more remains available when a search has no matches');
  assert.match(price, /priceSortDisplay/);
  assert.match(price, /priceCreatedAt/);
  assert.match(adsManage, /adsSortPriority/);
  assert.match(adsManage, /adCreatedAt/);
  for (const css of [newsCss, priceCss]) {
    assert.match(css, /\.searchField\s*\{[^}]*min-height:\s*44px;/s);
    assert.match(css, /\.sortSelect\s*\{[^}]*min-height:\s*44px;/s);
  }
});

test('management labels stay complete across ko, en, and vi', () => {
  const locales = ['ko', 'en', 'vi'].map((locale) => JSON.parse(read(`../../locales/${locale}/translation.json`)));
  const adKeys = ['adsManageTitle', 'adsManageDesc', 'adsManageCta', 'adsSummaryCount', 'adsSummaryNeedsAction', 'adsDisplayedCount', 'adsSearchPlaceholder', 'adsSortPriority', 'adCreatedAt'];
  const bizKeys = ['newsSearchPlaceholder', 'newsSortLatest', 'newsCreatedAt', 'priceSearchPlaceholder', 'priceSortDisplay', 'priceCreatedAt'];
  for (const locale of locales) {
    for (const key of adKeys) assert.equal(typeof locale.biz.lounge[key], 'string', `missing biz.lounge.${key}`);
    for (const key of bizKeys) assert.equal(typeof locale.biz[key], 'string', `missing biz.${key}`);
  }
});
