import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detail = readFileSync(new URL('./DmDetail.tsx', import.meta.url), 'utf8');
const detailCss = readFileSync(new URL('./DmDetail.module.css', import.meta.url), 'utf8');
const list = readFileSync(new URL('./DmList.tsx', import.meta.url), 'utf8');
const listCss = readFileSync(new URL('./DmList.module.css', import.meta.url), 'utf8');
const format = readFileSync(new URL('../../lib/format.ts', import.meta.url), 'utf8');

test('message timestamps preserve clock time while date boundaries render as centered separators', () => {
  assert.match(format, /export function formatMessageTimestamp/);
  assert.match(format, /hour: 'numeric', minute: '2-digit'/);
  assert.match(format, /export function formatMessageDateSeparator/);
  assert.match(format, /year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'/);
  assert.doesNotMatch(format, /month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'/);
  assert.match(detail, /const renderMessageMeta =/);
  assert.match(detail, /if \(isSameSenderRun\(m, next\)\) return null;/);
  assert.match(detail, /formatMessageTimestamp\(m\.createdAt\)/);
  assert.match(detail, /const dateSeparatorMessageIds = useMemo/);
  assert.match(detail, /function isDateSeparatorMessage\(message: DmMessage\): boolean \{/);
  assert.match(detail, /isRegularBubble\(message\) \|\| !!message\.imageUrl \|\| !!message\.deletedAt/);
  assert.match(detail, /if \(row\.kind !== 'dm' \|\| !isDateSeparatorMessage\(row\.item\)\) continue;/);
  assert.match(detail, /const renderDateSeparator =/);
  assert.match(detail, /formatMessageDateSeparator\(m\.createdAt\)/);
  assert.match(detail, /\{renderDateSeparator\(m\)\}/);
  assert.match(detail, /className=\{styles\.messageLine\}/);
  assert.match(detailCss, /\.messageMeta\s*\{/);
  assert.match(detailCss, /\.dateSeparator\s*\{/);
});

test('long press renders an inert explicit message silhouette over the blur while its measured menu stays adjacent', () => {
  assert.match(detail, /openMessageActions\(m, target\)/);
  assert.match(detail, /createPortal\(/);
  assert.match(detail, /styles\.messageActionBackdrop/);
  assert.match(detail, /DM_REACTION_EMOJIS\.map/);
  assert.match(detail, /handleToggleReaction\(actionMsg, emoji\)/);
  assert.doesNotMatch(detail, /<BottomSheet open=\{!!actionMsg\}/);
  assert.match(detail, /const actionPanelRef = useRef<HTMLDivElement>/);
  assert.match(detail, /useLayoutEffect\(\(\) => \{/);
  assert.match(detail, /actionPanelRef\.current\.getBoundingClientRect\(\)\.height/);
  assert.match(detail, /const above = actionAnchor\.top - gap - panelHeight/);
  assert.match(detail, /const below = actionAnchor\.bottom \+ gap/);
  assert.match(detail, /const aboveSpace = Math\.max\(0, actionAnchor\.top - gap - edge\)/);
  assert.match(detail, /maxHeight: aboveSpace/);
  assert.match(detail, /maxHeight: belowSpace/);
  assert.doesNotMatch(detail, /cloneNode|actionSnapshotHostRef|setActionSnapshot|replaceChildren/);
  assert.match(detail, /const renderMessageActionSnapshot = \(\) => \{/);
  assert.match(detail, /actionMsg\.deletedAt/);
  assert.match(detail, /actionMsg\.messageType === 'sticker'/);
  assert.match(detail, /actionMsg\.imageUrl && !actionMsg\.content/);
  assert.match(detail, /styles\.messageActionBubble/);
  assert.match(detail, /styles\.messageActionImage/);
  assert.match(detail, /styles\.messageActionSticker/);
  assert.match(detail, /inert=""/);
  assert.match(detail, /const closeMessageActions = \(\) => \{[\s\S]*setActionMsgId\(null\);[\s\S]*setActionAnchor\(null\);/);
  assert.match(detail, /styles\.messageActionSnapshot/);
  assert.match(detail, /styles\.messageActionSnapshotMine/);
  assert.match(detail, /styles\.messageActionSnapshotTheirs/);
  assert.doesNotMatch(detail, /styles\.messageActionSelected/);
  assert.doesNotMatch(detail, /actionBackdropStyles/);
  assert.match(detailCss, /\.messageActionBackdrop[\s\S]*background: rgba\(20, 23, 31, \.48\)[\s\S]*backdrop-filter: blur\(10px\)/);
  assert.match(detailCss, /\.messageActionSnapshot\s*\{[\s\S]*z-index: 61[\s\S]*display: flex[\s\S]*background: transparent[\s\S]*overflow: visible[\s\S]*pointer-events: none/);
  assert.match(detailCss, /\.messageActionSnapshotMine\s*\{\s*justify-content: flex-end/);
  assert.match(detailCss, /\.messageActionSnapshotTheirs\s*\{\s*justify-content: flex-start/);
  assert.match(detailCss, /\.messageActionBubble\s*\{[\s\S]*width: fit-content[\s\S]*min-height: 0[\s\S]*max-width: 100%/);
  assert.doesNotMatch(detailCss, /\.messageActionBubble\s*\{[\s\S]*width: 100% !important/);
  assert.doesNotMatch(detailCss, /\.messageActionBubble\s*\{[\s\S]*min-height: 100%/);
  assert.match(detailCss, /\.messageActionImage,[\s\S]*\.messageActionSticker\s*\{[\s\S]*width: 100%[\s\S]*height: 100%/);
  assert.match(detailCss, /-webkit-backdrop-filter: blur\(10px\)/);
  assert.match(detailCss, /\.reactionPalette\s*\{\s*flex: 0 0 auto/);
  assert.match(detailCss, /\.messageActionMenu\s*\{\s*flex: 1 1 auto[\s\S]*min-height: 0/);
  assert.match(detail, /const panelWidth = Math\.min\(312, window\.innerWidth - 24\);/);
  assert.match(detailCss, /\.reactionPalette[\s\S]*overflow: hidden/);
  assert.match(detailCss, /\.paletteBtn[\s\S]*flex: 1 1 0/);
});

test('conversation rows expose mute and confirmed leave through a horizontal swipe', () => {
  assert.match(list, /toggleMute\(c\.id\)/);
  assert.match(list, /onPointerMove=\{handleSwipeMove\}/);
  assert.match(list, /gesture\.axis = Math\.abs\(dx\) > Math\.abs\(dy\) \? 'horizontal' : 'vertical'/);
  assert.match(list, /suppressClickRef\.current = gesture\.id/);
  assert.match(list, /requestLeave\(c\)/);
  assert.match(listCss, /touch-action: pan-y/);
  assert.match(listCss, /\.rowActions/);
});

test('new interaction labels exist in every locale', () => {
  for (const locale of ['ko', 'en', 'vi']) {
    const messages = JSON.parse(readFileSync(new URL(`../../locales/${locale}/translation.json`, import.meta.url), 'utf8'));
    for (const key of [
      'leaveAction',
      'notificationsAction',
      'notificationsMuted',
      'notificationsUnmuted',
      'closeMessageActions',
      'reactionsAction',
    ]) {
      assert.ok(messages.dm[key], `${locale} is missing dm.${key}`);
    }
  }
});
