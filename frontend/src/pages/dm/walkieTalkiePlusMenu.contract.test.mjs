import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detail = readFileSync(new URL('./DmDetail.tsx', import.meta.url), 'utf8');

test('the DM plus menu opens and invites to a walkie-talkie channel without an appointment gate', () => {
  const plusMenu = detail.slice(detail.indexOf('menuItems={['), detail.indexOf(']}\n      />', detail.indexOf('menuItems={[')));
  const walkieItem = plusMenu.match(/\{\n\s+key: 'walkieTalkie',[\s\S]*?\n\s+\},/)?.[0] ?? '';

  assert.match(walkieItem, /key: 'walkieTalkie'/);
  assert.match(walkieItem, /icon: <Radio size=\{26\} strokeWidth=\{1\.8\} \/>/);
  assert.match(walkieItem, /label: t\('dm\.moreMenuWalkieTalkie'/);
  assert.match(walkieItem, /onPress: handleWalkieJoin/);
  assert.doesNotMatch(walkieItem, /status === 'ACCEPTED'|isDirect/);

  const handler = detail.slice(detail.indexOf('const handleWalkieJoin'), detail.indexOf('// 약속잡기 시트 오픈'));
  assert.match(handler, /joinWalkieChannel\(/);
  assert.match(handler, /conversationId,/);
  assert.match(handler, /isGroup: !isDirect/);
  assert.match(handler, /user\?\.nickname/);
});
