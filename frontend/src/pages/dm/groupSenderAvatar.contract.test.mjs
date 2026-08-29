import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// W2 그룹채팅 계약 —
// (1) 그룹방 말풍선에만 발신자를 붙인다. 1:1 방/내 메시지는 종전과 동일하게 렌더돼야 한다.
// (2) DmList 는 사진·아바타가 없을 때 AppImage 에 undefined 를 넘기면 안 된다
//     (AppImage 는 src 없으면 /img-error.png 로 폴백한다) — Avatar 이니셜 폴백을 쓴다.

test('renderSender bails out for direct rooms and for my own messages', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /const renderSender = \(m: DmMessage, prev: DmMessage \| null\) => \{/);
  assert.match(detail, /if \(isDirect \|\| m\.senderId === myId\) return null;/);
});

test('renderSender collapses consecutive messages from the same sender within the run window', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /const SENDER_RUN_MS = 2 \* 60 \* 1000;/);
  assert.match(detail, /prev\.senderId === m\.senderId &&/);
  assert.match(detail, /new Date\(m\.createdAt\)\.getTime\(\) - new Date\(prev\.createdAt\)\.getTime\(\) < SENDER_RUN_MS/);
});

test('renderSender is wired into all three bubble render sites (sticker/image/text)', () => {
  const detail = read('DmDetail.tsx');
  const calls = detail.match(/\{renderSender\(m, prevMsg\)\}/g) ?? [];
  assert.equal(calls.length, 3);
});

test('unknown/left senders fall back to the dm.unknownMember string in all three locales', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /memberNames\[m\.senderId\] \|\| t\('dm\.unknownMember'/);
  for (const loc of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${loc}/translation.json`));
    assert.ok(json.dm.unknownMember, `${loc} is missing dm.unknownMember`);
  }
});

test('group members are loaded once on room entry, not only when replying', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /if \(isDirect \|\| !conversationId\) return;\s*\n\s*fetchMembers\(conversationId\)/);
  assert.match(detail, /setMemberAvatars\(Object\.fromEntries\(ms\.map\(\(mm\) => \[mm\.userId, mm\.avatarUrl\]\)\)\);/);
});

test('DmList uses Avatar (never hands AppImage an undefined src)', () => {
  const list = read('DmList.tsx');
  assert.doesNotMatch(list, /AppImage/);
  assert.match(list, /<Avatar src=\{rowAvatar\(c\)\} name=\{rowName\(c\)\} seed=\{rowSeed\(c\)\} size=\{48\} \/>/);
  assert.doesNotMatch(list, /\?\? undefined/);
});

test('Avatar renders an initial instead of AppImage when there is no src', () => {
  const avatar = read('../../components/ui/Avatar.tsx');
  assert.match(avatar, /src \? \(/);
  assert.match(avatar, /className=\{styles\.initial\}/);
});
