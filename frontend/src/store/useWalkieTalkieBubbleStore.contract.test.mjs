import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'useWalkieTalkieBubbleStore.ts'), 'utf8');

// 대표 지시(2026-09-10, 2026-08-27 지시 번복) 회귀 고정: X버튼(close())은 캡슐만 숨기지 않고
// persist 대상(activeConversationId/activeConversationMeta)을 직접 비운다 — 그래야 앱을
// force-quit 후 재기동해도 캡슐이 되살아나지 않는다. 종전엔 closed:true 만 세팅해 재기동 시
// 캡슐이 다시 뜨는 문제가 있었다.

const closeImplStart = source.indexOf('close: () => {');
const closeImplEnd = source.indexOf('reset: () =>', closeImplStart);
const closeBody = source.slice(closeImplStart, closeImplEnd);

test('close() clears the persisted conversation fields, not just a closed flag', () => {
  assert.match(
    closeBody,
    /set\(\{ activeConversationId: null, activeConversationMeta: null \}\)/,
    'X (close()) must clear activeConversationId/activeConversationMeta so relaunch has nothing to rehydrate',
  );
  assert.doesNotMatch(closeBody, /closed: true/, '`closed` flag semantics were removed — close() must not resurrect it');
});

test('close() releases the Android channel-shortcut widget (empty channelId/channelName)', () => {
  assert.match(
    closeBody,
    /native\.walkieTalkie\.syncActiveChannel\(\{ channelId: '', channelName: '' \}\)\.catch\(\(\) => \{\}\)/,
    'leaving must release the widget-active-channel with empty strings, fire-and-forget like other native calls',
  );
});

test('the closed flag and open() action are gone — nothing sets closed:true anymore', () => {
  // 전체 파일이 아니라 인터페이스 선언 + 스토어 구현 블록만 본다 — 파일 상단 히스토리 docblock
  // 산문에 "closed" 를 포함한 단어(예: fail-closed)가 들어가도 오탐하지 않도록.
  const declStart = source.indexOf('interface WalkieTalkieBubbleState');
  const declRegion = source.slice(declStart);
  assert.doesNotMatch(declRegion, /\bclosed\b/, 'closed field/flag must be fully removed as an orphan of the close() redefinition');
  assert.doesNotMatch(declRegion, /\bopen: \(\)/, 'open() action must be removed — it only ever reset the now-gone closed flag');
});

test('partialize only persists activeConversationId/activeConversationMeta', () => {
  const partializeBody = source.slice(source.indexOf('partialize:'), source.indexOf('}\n  )\n);') + 20);
  assert.match(partializeBody, /activeConversationId: s\.activeConversationId,/);
  assert.match(partializeBody, /activeConversationMeta: s\.activeConversationMeta,/);
});

// 로그아웃(reset())도 X(close())와 마찬가지로 위젯 활성 채널을 해제해야 한다 — 안 그러면
// 같은 기기 재로그인 시 이전 계정의 채널명이 위젯에 남고, 그 채널의 백그라운드 자동재생
// 게이트(MyFirebaseMessagingService.maybeAutoPlay)도 계속 열려 있게 된다.
const resetImplStart = source.indexOf('reset: () => {');
const resetImplEnd = source.indexOf('attentionPing:', resetImplStart);
const resetBody = source.slice(resetImplStart, resetImplEnd);

test('reset() (logout) also releases the Android channel-shortcut widget', () => {
  assert.match(
    resetBody,
    /set\(\{ activeConversationId: null, activeConversationMeta: null \}\)/,
    'reset() must still clear the persisted conversation fields',
  );
  assert.match(
    resetBody,
    /native\.walkieTalkie\.syncActiveChannel\(\{ channelId: '', channelName: '' \}\)\.catch\(\(\) => \{\}\)/,
    'reset() must release the widget-active-channel too, same as close()',
  );
});

// DmDetail 의 음성알림 딥링크(?voice=1) 활성화 effect — walkieActiveConversationId 를 deps 에
// 넣으면 X(close())로 스토어가 비워질 때 이 effect 가 재실행돼 즉시 재활성화시키므로,
// ?voice=1 화면에서 X 가 무력화된다(회귀: 음성알림 탭 → 진입 → 캡슐 X → 캡슐이 도로 나타남).
const dmDetailSource = readFileSync(join(here, '..', 'pages', 'dm', 'DmDetail.tsx'), 'utf8');
const voiceEffectStart = dmDetailSource.indexOf('voiceJoinedForRef');
const voiceEffectEnd = dmDetailSource.indexOf('}, [voiceDeepLink, conversationId]);', voiceEffectStart);
const voiceEffectRegion = dmDetailSource.slice(voiceEffectStart, voiceEffectEnd + 40);

test('DmDetail voice deep-link activation is one-shot per conversation entry, not re-triggered by store changes', () => {
  assert.notEqual(voiceEffectStart, -1, 'voiceJoinedForRef guard must exist');
  assert.doesNotMatch(
    voiceEffectRegion,
    /walkieActiveConversationId/,
    'the deep-link effect must not depend on walkieActiveConversationId — a later X (close()) must not re-trigger it',
  );
});
