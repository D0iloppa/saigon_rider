import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const source = read('useAdEvents.ts');

// code-review medium 지적 #1: 계측은 공용 client.ts(api.realFetch)를 우회한다 — 세션 만료/계정제한
// 부수효과가 계측 실패로 사용자를 강제 로그아웃시키면 안 된다.
test('계측 전송은 api.realFetch 를 쓰지 않는다(세션 부수효과 격리)', () => {
  assert.doesNotMatch(source, /import \{ api \}/);
  assert.doesNotMatch(source, /api\.realFetch\(/);
  assert.match(source, /fetch\('\/api\/bff\/market\/ads\/events'/);
});

// code-review medium 지적 #2: navigator.* 직접 호출은 ESLint error(CLAUDE.md) — sendBeacon 대신
// fetch(keepalive) + document 이벤트로 이탈 시 flush 한다.
test('navigator.sendBeacon 을 쓰지 않는다(navigator.* 직접 호출 금지)', () => {
  // 주석에서는 "왜 안 쓰는지"를 설명하려고 navigator.* 를 언급하므로, 주석을 걷어낸 실제 코드에서만 검사한다.
  const codeOnly = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(codeOnly, /navigator\./);
});

test('클릭/CTA 는 노출 배치 큐를 거치지 않고 즉시 전송된다', () => {
  const fnStart = source.indexOf('export function trackAdEvent(');
  const fnBody = source.slice(fnStart, source.indexOf('\n}', fnStart));
  assert.doesNotMatch(fnBody, /enqueue\(/, 'trackAdEvent 는 enqueue 를 거치면 안 된다(디바운스에 유실)');
  assert.match(fnBody, /send\(\[/, 'trackAdEvent 는 send() 로 즉시 전송해야 한다');
});

test('페이지 이탈(pagehide/visibilitychange) 시 남은 큐를 flush 한다', () => {
  assert.match(source, /document\.addEventListener\('pagehide', flush\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
});

test('flush()는 재실행 시 기존 타이머를 항상 취소한다(중복 POST 방지)', () => {
  const fnStart = source.indexOf('function flush() {');
  const fnBody = source.slice(fnStart, source.indexOf('\nfunction scheduleFlush', fnStart));
  assert.match(fnBody, /if \(flushTimer\) \{\s*\n\s*clearTimeout\(flushTimer\);/);
});

// code-review medium 지적 #5: business_profile_id 는 서버가 ad_id 로부터 유도하므로(schemas.py
// AdEventIn) 클라이언트가 실어보내면 안 되는 죽은 페이로드다.
test('business_profile_id 페이로드를 보내지 않는다', () => {
  assert.doesNotMatch(source, /business_profile_id/);
});

// code-review medium 지적 #3: RefObject + ref.current 의존성은 "스켈레톤 먼저, 카드 나중" 패턴에서
// 관찰 대상이 늦게 붙으면 노출을 영구 미기록한다 — 콜백 ref 로 교체했고, exhaustive-deps 억제는
// 더 이상 필요 없다.
test('useAdImpression 은 콜백 ref 를 반환한다(exhaustive-deps 억제 없음)', () => {
  assert.doesNotMatch(source, /react-hooks\/exhaustive-deps/);
  assert.match(source, /export function useAdImpression\(\s*\n\s*adId: string \| null \| undefined,\s*\n\s*surface: AdEventSurface,\s*\n\): \(node: Element \| null\) => void/);
});
