import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detail = readFileSync(new URL('./DmDetail.tsx', import.meta.url), 'utf8');
const detailCss = readFileSync(new URL('./DmDetail.module.css', import.meta.url), 'utf8');
const dmApi = readFileSync(new URL('../../api/dm.ts', import.meta.url), 'utf8');

const locales = Object.fromEntries(
  ['ko', 'en', 'vi'].map((locale) => [
    locale,
    JSON.parse(readFileSync(new URL(`../../locales/${locale}/translation.json`, import.meta.url), 'utf8')),
  ]),
);

test('direct DM overflow exposes block through the shared destructive confirmation flow', () => {
  assert.match(detail, /isDirect && !conv\?\.blockedByMe/);
  assert.match(detail, /onClick=\{handleBlockPick\}/);
  assert.match(detail, /useConfirmStore\.getState\(\)\.open/);
  assert.match(detail, /await blockUser\(otherUserId\)/);
  assert.match(detail, /currentAppointment\?\.status === 'ACCEPTED'/);
});

test('successful block keeps history visible while replacing composer and closing local sessions', () => {
  assert.match(dmApi, /messagingDisabled: raw\.messaging_disabled \?\? false/);
  assert.match(dmApi, /blockedByMe: raw\.blocked_by_me \?\? false/);
  assert.match(detail, /messagingDisabled \? \(/);
  assert.match(detail, /className=\{styles\.blockedComposer\}/);
  assert.match(detail, /!messagingDisabled && <ActiveSessionBar/);
  assert.match(detail, /useWalkieTalkieBubbleStore\.getState\(\)\.close\(\)/);
  assert.match(detail, /useLocationChannelStore\.getState\(\)\.clear\(\)/);
  assert.match(detail, /if \(isDirect\) refreshConv\(\)/);
  assert.match(detailCss, /\.blockedComposer\s*\{/);
});

test('block state and confirmation copy exist in every supported locale', () => {
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of ['blockAction', 'blockConfirm', 'blockConfirmTrade', 'blockedByMe', 'messagingDisabled']) {
      assert.ok(messages.dm[key], `${locale} is missing dm.${key}`);
    }
  }
});
