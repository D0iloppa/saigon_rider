import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('마켓 파일럿은 피벗 전 레벨·재화 노출을 하나의 kill switch로 숨긴다', () => {
  const flags = read('featureFlags.ts');
  const home = read('../pages/home/HomePage.tsx');
  const profile = read('../pages/profile/ProfileMain.tsx');

  assert.match(flags, /export const SHOW_LEGACY_GAME_ECONOMY = false;/);
  assert.match(home, /SHOW_LEGACY_GAME_ECONOMY && <div className=\{styles\.levelBadge\}/);
  assert.match(home, /SHOW_LEGACY_GAME_ECONOMY && \(/);
  assert.match(profile, /SHOW_LEGACY_GAME_ECONOMY && <div className=\{styles\.currencyBento\}/);
  assert.match(profile, /SHOW_LEGACY_GAME_ECONOMY && \(\s*<>\s*<div className=\{styles\.levelRow\}/);
});
