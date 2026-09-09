import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const detail = readFileSync(new URL('./DmDetail.tsx', import.meta.url), 'utf8');
const detailCss = readFileSync(new URL('./DmDetail.module.css', import.meta.url), 'utf8');
const list = readFileSync(new URL('./DmList.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../api/dm.ts', import.meta.url), 'utf8');

const locales = Object.fromEntries(
  ['ko', 'en', 'vi'].map((locale) => [
    locale,
    JSON.parse(readFileSync(new URL(`../../locales/${locale}/translation.json`, import.meta.url), 'utf8')),
  ]),
);

test('list and detail leave through the non-destructive membership endpoint with confirmation', () => {
  assert.ok(api.includes('`/dm/conversations/${conversationId}/membership`'));
  assert.match(detail, /useConfirmStore\.getState\(\)\.open/);
  assert.match(detail, /leaveConversation\(conversationId\)/);
  assert.match(list, /useConfirmStore\.getState\(\)\.open/);
  assert.match(list, /leaveConversation\(c\.id\)/);
});

test('appointment actions have one primary row and separated completion and secondary rows', () => {
  assert.match(detail, /apptPrimaryAction/);
  assert.match(detail, /apptCompletionActions/);
  assert.match(detail, /apptSecondaryActions/);
  assert.match(detailCss, /@media \(max-width: 360px\)[\s\S]*apptSecondaryActions[\s\S]*grid-template-columns: 1fr/);
});

test('leave semantics are translated in every supported locale', () => {
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of ['leaveRoom', 'leaveConversationNamed', 'leaveDirectConfirm', 'leaveGroupConfirm']) {
      assert.ok(messages.dm[key], `${locale} is missing dm.${key}`);
    }
  }
});
