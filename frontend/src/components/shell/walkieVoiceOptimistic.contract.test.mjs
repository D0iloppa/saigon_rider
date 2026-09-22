import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bar = readFileSync(join(here, 'ActiveSessionBar.tsx'), 'utf8');
const detail = readFileSync(join(here, '../../pages/dm/DmDetail.tsx'), 'utf8');
const bubble = readFileSync(join(here, '../dm/VoiceMessageBubble.tsx'), 'utf8');

test('walkie PTT creates a local sending bubble before upload and keeps retryable failures', () => {
  assert.match(bar, /addPendingVoice\(\{[\s\S]*?status: 'uploading'[\s\S]*?blob: null/);
  assert.match(bar, /readRecordingBlob[\s\S]*?sendPendingVoice/);
  assert.match(bar, /status: 'failed', blob/);
  assert.match(detail, /kind: 'pendingVoice'/);
  assert.match(detail, /deliveryStatus=\{pending\.status\}/);
  assert.match(detail, /retryPendingWalkieVoice/);
  assert.match(bubble, /walkieTalkie\.uploading/);
  assert.match(bubble, /walkieTalkie\.retrySend/);
});
