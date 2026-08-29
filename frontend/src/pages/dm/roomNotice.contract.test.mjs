import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 방 공지(init/217) 계약 —
// (1) system 메시지 분기는 kind switch 이고, 미지 kind 는 빈 말풍선으로 새지 않고 return null 이다.
// (2) 공지 배너/등록 액션은 group/open 방에서만 뜬다 (direct 는 서버도 400).
// (3) 내리기는 등록자 본인 또는 운영진(owner/admin)만 — 서버 규칙과 동일 기준.

test('system message branch is a kind switch with a null default', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /if \(m\.messageType === 'system'\) \{\s*\n\s*switch \(m\.meta\?\.kind\) \{/);
  assert.match(detail, /case 'listing_divider':/);
  assert.match(detail, /case 'notice_set':/);
  // 미지 kind 안전판 — 종전에는 일반 텍스트 버블로 흘러 빈 말풍선이 됐다
  assert.match(detail, /default:\s*\n(?:\s*\/\/.*\n)*\s*return null;/);
});

test('notice banner renders only for non-direct rooms with an active notice', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /\{!isDirect && notice && \(/);
  assert.match(detail, /const notice = conv\?\.notice \?\? null;/);
});

test('clearing a notice is limited to the setter or owner/admin', () => {
  const detail = read('DmDetail.tsx');
  assert.match(
    detail,
    /const canClearNotice = !!notice && \(notice\.setBy === myId \|\| myRole === 'owner' \|\| myRole === 'admin'\);/,
  );
  assert.match(detail, /\{canClearNotice && \(/);
});

test('the "pin as notice" action is offered for group text messages only', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /\{!isDirect && actionMsg\.messageType === 'text' && \(/);
  assert.match(detail, /onClick=\{\(\) => handleSetNotice\(actionMsg\)\}/);
});

test('notice strings exist in all three locales', () => {
  for (const loc of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${loc}/translation.json`));
    for (const key of ['noticeSet', 'noticeClear', 'noticeBanner', 'noticeSetCard', 'noticeSetBy']) {
      assert.ok(json.dm[key], `${loc} is missing dm.${key}`);
    }
    assert.match(json.dm.noticeSetBy, /\{\{name\}\}/, `${loc} dm.noticeSetBy must interpolate name`);
  }
});
