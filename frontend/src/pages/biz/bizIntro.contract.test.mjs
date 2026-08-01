import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 업체소개(intro) 신설 — 공개 상세는 intro 가 없으면 그 영역 자체를 렌더하지 않아야 한다
// (빈 껍데기 금지). profile.intro 조건부 렌더 없이 항상 렌더하는 회귀를 막는다.
test('BizPublic only renders the intro block when profile.intro is present (no empty shell)', () => {
  const source = read('BizPublic.tsx');

  assert.match(
    source,
    /\{profile\.intro\s*&&\s*<p[^>]*>\{profile\.intro\}<\/p>\}/,
    'BizPublic must gate the intro paragraph on `profile.intro` truthiness — an unconditional render would show an empty area for businesses without an intro',
  );
});

// 업체소개(intro) 는 최대 500자 — 신청 폼 · 정보수정 폼 양쪽에 걸려 있어야 한다
test('BizApply and BizManage cap the intro textarea at 500 characters', () => {
  const applySource = read('BizApply.tsx');
  const manageSource = read('BizManage.tsx');

  assert.match(
    applySource,
    /<textarea[\s\S]*?value=\{intro\}[\s\S]*?maxLength=\{500\}/,
    'BizApply intro textarea must have maxLength={500}',
  );
  assert.match(
    manageSource,
    /<textarea[\s\S]*?value=\{intro\}[\s\S]*?maxLength=\{500\}/,
    'BizManage intro textarea must have maxLength={500}',
  );
});
