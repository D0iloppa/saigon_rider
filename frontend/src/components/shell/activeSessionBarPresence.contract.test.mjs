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

// F-S3-03 FR-6 (실기기 피드백 260922) — 접속 표시 3분법·경과시간·발화 상태.
test('the presence dot uses a green/gray/hollow trichotomy instead of orange as a status color', () => {
  assert.match(css, /\.presenceDot\[data-presence='connected'\] \{\s*background: var\(--success\);/);
  assert.match(css, /\.presenceDot\[data-presence='unknown'\] \{\s*background: transparent;\s*border: 1px solid var\(--line\);/);
  assert.doesNotMatch(css, /background: var\(--brand-500\);\s*\n\}\s*\n\n\.presenceDot\[data-all-present\]/);
  assert.match(source, /data-presence=\{cell\.presenceDotState\}/);
});

test('a 1:1 conversation shows a status phrase instead of a peer-count number, group keeps the count', () => {
  assert.match(source, /const isGroup = \(presence\?\.members\.length \?\? 0\) >= 3/);
  assert.match(source, /walkieTalkie\.peerConnected', \{ defaultValue: '상대 접속 중' \}/);
  assert.match(source, /walkieTalkie\.aloneConnected', \{ defaultValue: '나만 접속 · 녹음은 전달돼요' \}/);
  assert.match(source, /walkieTalkie\.connectedCount', \{ count: cell\.presentCount/);
});

test('the recording label is replaced by the elapsed m:ss (not appended), sharing the auto-stop timer source', () => {
  assert.match(source, /formatDuration } from '@\/components\/dm\/VoiceMessageBubble'/);
  assert.doesNotMatch(source, /recordingLabel/);
  assert.match(source, /setElapsedMs\(s\.elapsedMs\)/);
  assert.match(source, /cell\.isRec \? formatDuration\(cell\.elapsedMs\) : t\('walkieTalkie\.pttLabel'/);
});

test('the elapsed label turns danger red at 50s and gets countdown emphasis in the last 5s', () => {
  assert.match(source, /data-warn=\{\(cell\.isRec && cell\.elapsedMs >= 50000\)/);
  assert.match(source, /data-countdown=\{\(cell\.isRec && cell\.elapsedMs >= 55000\)/);
  assert.match(css, /\.pttBtn\[data-active\] \.pttLabel\[data-warn\] \{\s*color: var\(--danger\);/);
  assert.match(css, /\.pttLabel\[data-countdown\] \{\s*font-weight: 800;/);
});

test('a peer speaking (not myself) surfaces "speaking" status, using the presence.speaking field', () => {
  assert.match(source, /const speakingOthers = presence\?\.speaking\.filter\(\(id\) => id !== myUserId\) \?\? \[\]/);
  assert.match(source, /walkieTalkie\.someoneSpeaking', \{ name: cell\.speakingOtherName/);
  assert.match(source, /walkieTalkie\.multipleSpeaking', \{ count: cell\.speakingOthers\.length/);
});

test('pressing PTT immediately refreshes presence to shrink the 15s heartbeat staleness window', () => {
  const onPTTDownBody = source.slice(source.indexOf('const onPTTDown = useCallback'), source.indexOf('const onPTTUp = useCallback'));
  assert.match(onPTTDownBody, /presenceRefreshRef\.current\?\.\(\);/);
});

// F-S3-03 FR-3 — 롱프레스는 [채널 변경][초대장 다시 보내기] 메뉴를 연다. "나가기"는 X 버튼(closeBtn)
// 몫이지 롱프레스가 곧바로 requestClose() 를 부르지 않는다.
test('long-pressing the walkie cell opens a change-channel / resend-invite menu instead of closing the channel', () => {
  const onCellPointerDownBody = source.slice(
    source.indexOf('const onCellPointerDown = useCallback(() => {'),
    source.indexOf('const handleChangeChannel = useCallback'),
  );
  assert.match(onCellPointerDownBody, /setMenuOpen\(true\)/);
  assert.doesNotMatch(onCellPointerDownBody, /cell\.requestClose\(\)/);
  assert.match(source, /import \{ WalkieChannelPickerSheet \} from '@\/components\/dm\/WalkieChannelPickerSheet';/);
  assert.match(source, /walkieTalkie\.contextMenuChangeChannel', \{ defaultValue: '채널 변경' \}/);
  assert.match(source, /walkieTalkie\.contextMenuResendInvite', \{ defaultValue: '초대장 다시 보내기' \}/);
  assert.match(source, /messageType: 'walkie_invite'/);
});

test('no prerender bubble is introduced for in-progress recording (rejected proposal)', () => {
  // addPendingVoice is only ever called once, after the recording is finished (finishAndSend),
  // never at the moment recording starts (startFlow) — no optimistic in-progress bubble.
  const startFlowBody = source.slice(source.indexOf('const startFlow = useCallback'), source.indexOf('const locked ='));
  assert.doesNotMatch(startFlowBody, /addPendingVoice/);
  assert.doesNotMatch(source, /status:\s*'recording'/);
});
