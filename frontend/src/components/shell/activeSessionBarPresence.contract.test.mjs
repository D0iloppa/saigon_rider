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

test('the fixed bar hides whenever any BottomSheet is open, not only on the DM detail route', () => {
  assert.match(source, /import \{ useSheetPresenceStore \} from '@\/store\/useSheetPresenceStore';/);
  assert.match(source, /const sheetOpen = useSheetPresenceStore\(\(s\) => s\.openCount > 0\)/);
  assert.match(source, /DM_DETAIL_PATH\.test\(pathname\) \|\| sheetOpen/);
});

test('BottomSheet reports its open state to the shared sheet presence store', () => {
  const bottomSheetSource = readFileSync(
    new URL('../ui/BottomSheet.tsx', import.meta.url),
    'utf8',
  );
  assert.match(bottomSheetSource, /import \{ useSheetPresenceStore \} from '@\/store\/useSheetPresenceStore';/);
  assert.match(bottomSheetSource, /useSheetPresenceStore\.getState\(\)\.increment\(\)/);
  assert.match(bottomSheetSource, /useSheetPresenceStore\.getState\(\)\.decrement\(\)/);
});

test('the fixed bar sits above a page-owned fixed bottom CTA bar instead of overlapping it', () => {
  assert.match(source, /PAGE_BOTTOM_BAR_HEIGHTS/);
  assert.match(source, /\{ prefix: '\/biz\/', height:/);
  assert.match(source, /\{ prefix: '\/market\/ad\/', height:/);
  assert.match(source, /pageBottomBar \? \{ bottom: pageBottomBar\.height, paddingBottom: 0 \} : undefined/);
});

test('the session bar follows the storyboard surface treatment rather than a dark floating pill', () => {
  assert.match(css, /background: var\(--surface\)/);
  assert.match(css, /height: 52px/);
  assert.match(css, /background: var\(--brand-50\)/);
  assert.doesNotMatch(css, /border-radius: 14px 14px 0 0/);
  assert.match(source, /<Radio className=\{styles\.sessionIcon\}/);
});
