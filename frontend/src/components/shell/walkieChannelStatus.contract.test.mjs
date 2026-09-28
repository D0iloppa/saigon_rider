import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ActiveSessionBar.tsx', import.meta.url), 'utf8');
const bundle = readFileSync(
  new URL('../../../../native/ios/SaigonRiderWidgets/SaigonRiderWidgetsBundle.swift', import.meta.url),
  'utf8',
);
const attributes = readFileSync(
  new URL('../../../../native/ios/Shared/LiveActivityAttributes.swift', import.meta.url),
  'utf8',
);
const iosPlugin = readFileSync(
  new URL('../../../../native/ios/Shared/Plugins/WalkieTalkiePlugin.swift', import.meta.url),
  'utf8',
);

test('active walkie lifecycle starts, updates, and always ends the native persistent status', () => {
  assert.match(source, /native\.walkieTalkie\.startChannelStatus\(\{/);
  assert.match(source, /native\.walkieTalkie\.updateChannelStatus\(\{/);
  assert.match(source, /return \(\) => \{\s*enqueueChannelStatus\(\(\) => native\.walkieTalkie\.endChannelStatus\(\)\);\s*\};/);
  assert.match(source, /if \(!active \|\| !conversationId\) return;/);
});

test('native status operations are serialized across channel switches and StrictMode remounts', () => {
  assert.match(source, /const channelStatusTaskRef = useRef<Promise<void>>\(Promise\.resolve\(\)\)/);
  assert.match(source, /channelStatusTaskRef\.current = channelStatusTaskRef\.current\s*\.then\(operation, operation\)\s*\.catch\(\(\) => \{\}\)/);
});

test('persistent status does not change the approved DM-only in-app bar visibility', () => {
  assert.match(source, /const walkieHere = walkie\.active && walkie\.conversationId === conversationId/);
  assert.match(source, /if \(!walkieHere && !locationHere\) return null/);
});

test('the existing iOS widget target registers the shared walkie channel Live Activity contract', () => {
  assert.match(bundle, /WalkieChannelStatusLiveActivity\(\)/);
  assert.match(attributes, /struct WalkieChannelStatusAttributes: ActivityAttributes, Equatable/);
});

test('iOS recovers and ends system activities after an app-process restart', () => {
  assert.match(iosPlugin, /let activities = Activity<WalkieChannelStatusAttributes>\.activities/);
  assert.match(iosPlugin, /for activity in activities where activity\.attributes\.channelId != channelId/);
  assert.match(iosPlugin, /activities\.first\(where: \{ \$0\.attributes\.channelId == channelId \}\)/);
  assert.match(iosPlugin, /for activity in activities \{\s*await activity\.end\(nil, dismissalPolicy: \.immediate\)/);
});
