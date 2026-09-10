import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// W2 + 채팅 UI 개선 계약 —
// (1) 그룹방은 발신자 이름을 묶고, 1:1 수신 메시지는 첫 말풍선에만 프로필을 붙인다.
// (2) DmList 는 사진·아바타가 없을 때 AppImage 에 undefined 를 넘기면 안 된다
//     (AppImage 는 src 없으면 /img-error.png 로 폴백한다) — Avatar 이니셜 폴백을 쓴다.

test('group sender names stay group-only while direct incoming runs get one profile slot', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /const renderSender = \(m: DmMessage, prev: DmMessage \| null\) => \{/);
  assert.match(detail, /if \(isDirect \|\| m\.senderId === myId\) return null;/);
  assert.match(detail, /const renderDirectAvatar = \(m: DmMessage, previous: DmMessage \| null\) => \{/);
  assert.match(detail, /const showAvatar = !isSameSenderRun\(previous, m\);/);
  assert.match(detail, /className=\{styles\.messageProfileSlot\}/);
});

test('renderSender collapses consecutive messages from the same sender within the run window', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /const SENDER_RUN_MS = 2 \* 60 \* 1000;/);
  assert.match(detail, /previous\.senderId !== message\.senderId/);
  assert.match(detail, /elapsed < SENDER_RUN_MS/);
  assert.match(detail, /localDayKey\(previous\.createdAt\) === localDayKey\(message\.createdAt\)/);
});

test('sender presentation is wired into deleted, sticker, image, and text bubble sites', () => {
  const detail = read('DmDetail.tsx');
  const calls = detail.match(/\{renderSender\(m, prevMsg\)\}/g) ?? [];
  assert.equal(calls.length, 4);
  const directAvatarCalls = detail.match(/\{renderDirectAvatar\(m, prevMsg\)\}/g) ?? [];
  assert.equal(directAvatarCalls.length, 4);
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
