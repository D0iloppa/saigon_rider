import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./BizManage.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./BizManage.module.css', import.meta.url), 'utf8');

test('operations and performance tabs stick inside the BizManage body below TopBar', () => {
  assert.match(
    source,
    /<TopBar[^>]*\/>\s*<div className=\{styles\.body\}[\s\S]*?<section className=\{styles\.identity\}[\s\S]*?<nav className=\{styles\.tabs\}/,
    'TopBar must remain outside the body scroller, with store identity before the sticky tabs',
  );
  assert.match(css, /\.body\s*\{[^}]*overflow-y:\s*auto;/, 'BizManage body must be the scroll ancestor');
  assert.match(
    css,
    /\.tabs\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*10;/,
    'tabs must pin to the body top, which starts immediately below the status-bar-aware TopBar',
  );
  assert.doesNotMatch(css, /\.identity\s*\{[^}]*position:\s*sticky;/, 'store identity must scroll away');
});
