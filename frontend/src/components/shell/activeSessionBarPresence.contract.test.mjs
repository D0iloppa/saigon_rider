import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ActiveSessionBar.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./ActiveSessionBar.module.css', import.meta.url), 'utf8');

test('the walkie session bar labels only live presence, never total conversation members', () => {
  assert.match(source, /const presentCount = presence\?\.present\.length \?\? 0/);
  assert.doesNotMatch(source, /const memberCount = presence\?\.members\.length/);
  assert.match(source, /walkieTalkie\.connectedCount', \{ count: cell\.presentCount/);
  assert.match(source, /walkieTalkie\.presenceUnavailable/);
});

test('the session bar follows the storyboard surface treatment rather than a dark floating pill', () => {
  assert.match(css, /background: var\(--surface\)/);
  assert.match(css, /height: 52px/);
  assert.match(css, /background: var\(--brand-50\)/);
  assert.doesNotMatch(css, /border-radius: 14px 14px 0 0/);
  assert.match(source, /<Radio className=\{styles\.sessionIcon\}/);
});
