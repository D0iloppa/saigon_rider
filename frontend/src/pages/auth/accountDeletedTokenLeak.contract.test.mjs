import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 보안 사고 고정 (2026-08-02 실기 스크린샷): 탈퇴 계정 로그인 409(account_deleted) 응답의
// restore_token(소비 즉시 세션 발급 — 새면 계정 탈취)이 토스트/인라인 에러 문자열에
// `HTTP 409 | {detail 통째}` 로 원문 노출됐다. 이 파일은 두 층을 고정한다:
//   (1) 사용자 표시 문자열 생성기(extractErrorMessage)가 민감 토큰을 절대 싣지 않는다
//   (2) 모든 OAuth 진입 경로가 account_deleted 를 /auth/restore 라우팅(라우터 state)으로 처리한다

const clientSource = read('../../api/client.ts');
const oauthLoginSource = read('OAuthLogin.tsx');
const oauthResultSource = read('OAuthResult.tsx');

// ── (1) 심층 방어: extractErrorMessage 가 restore_token 을 사용자 표시 문자열에 싣지 않는다 ──
// 소스에서 함수를 추출해 실제로 실행(행위 검증)한다 — 문자열 존재 검사가 아니라
// "409 account_deleted 응답 본문을 넣었을 때 토큰 값이 결과에 없다"를 직접 확인한다.
function evalExtractErrorMessage() {
  const start = clientSource.indexOf('const SENSITIVE_DETAIL_KEYS');
  const fnStart = clientSource.indexOf('function extractErrorMessage');
  const sliceFrom = start !== -1 && start < fnStart ? start : fnStart;
  assert.notEqual(fnStart, -1, 'extractErrorMessage not found in client.ts');
  const end = clientSource.indexOf('\n}', fnStart);
  const snippet = clientSource
    .slice(sliceFrom, end + 2)
    // TS 타입 어노테이션 제거 → 순수 JS 로 평가
    .replace(/: (any|string|number)\b/g, '');
  // eslint 대상 아님(.mjs 테스트) — 소스에서 추출한 코드를 격리 평가
  return new Function(`${snippet}; return extractErrorMessage;`)();
}

test('409 account_deleted detail: user-visible message never contains restore_token value', () => {
  const extractErrorMessage = evalExtractErrorMessage();
  const detail = {
    code: 'account_deleted',
    deleted_at: '2026-08-02T08:59:17.900860+00:00',
    restorable_until: '2026-09-01T08:59:17.900860+00:00',
    restore_token: 'SECRET_RESTORE_TOKEN_VALUE',
  };
  const msg = extractErrorMessage({ detail }, 409, 'POST /api/bff/auth/oauth/exchange');
  assert.ok(
    !msg.includes('SECRET_RESTORE_TOKEN_VALUE'),
    `restore_token leaked into user-visible message: ${msg}`,
  );
  assert.ok(!msg.includes('restore_token'), `restore_token key leaked: ${msg}`);
});

test('sensitive-key stripping applies to any future error shape, not just account_deleted', () => {
  const extractErrorMessage = evalExtractErrorMessage();
  const msg = extractErrorMessage(
    { detail: { code: 'some_future_error', session_token: 'SECRET_SESSION', hint: 'x' } },
    400,
    'POST /api/bff/whatever',
  );
  assert.ok(!msg.includes('SECRET_SESSION'), `session_token leaked: ${msg}`);
  // 민감키 외 정보는 유지된다 (과도한 마스킹으로 디버깅 정보까지 지우지 않는다)
  assert.ok(msg.includes('some_future_error'));
});

test('non-object details (string / 422 array) keep their existing formatting', () => {
  const extractErrorMessage = evalExtractErrorMessage();
  assert.equal(extractErrorMessage({ detail: 'plain message' }, 429, 'call'), 'HTTP 429 | plain message');
  const arr = [{ loc: ['body', 'phone'], msg: 'field required' }];
  assert.equal(extractErrorMessage({ detail: arr }, 422, 'call'), `HTTP 422 | ${JSON.stringify(arr)}`);
});

// ── (2) client.ts: 409 account_deleted 는 토스트/문자열화 전에 AccountDeletedError 로 던진다 ──
test('realFetch intercepts 409 account_deleted before building a toast message', () => {
  const idxThrow = clientSource.indexOf("err?.detail?.code === 'account_deleted'");
  assert.notEqual(idxThrow, -1, '409 account_deleted interception missing in realFetch');
  const idxMessage = clientSource.indexOf('extractErrorMessage(err, res.status', idxThrow);
  assert.ok(
    idxThrow < idxMessage,
    'account_deleted must be intercepted before the generic toast/message path',
  );
});

// ── (3) OAuth 진입 경로별: account_deleted → /auth/restore 라우팅 ──
// OAuthLogin.tsx 의 각 핸들러 블록을 잘라 restore 처리(restoreInfoFromError/goRestore)를 확인한다.
function section(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${label}: marker not found (${startMarker})`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `${label}: end marker not found (${endMarker})`);
  return source.slice(start, end);
}

const ENTRY_PATHS = [
  ['web Google (GIS JSON login)', 'const handleOAuthResult', 'const finishRedirectOAuth'],
  ['native Google deep link', 'const handleNativeGoogle', 'const handleNativeZalo'],
  ['native Zalo deep link', 'const handleNativeZalo', 'const handleNativeApple'],
  ['native Apple deep link', 'const handleNativeApple', 'const handleWebZalo'],
  ['web Zalo popup postMessage', 'const handleWebZalo', 'const handleDevLogin'],
  ['dev login', 'const handleDevLogin', 'return ('],
];

for (const [label, startMarker, endMarker] of ENTRY_PATHS) {
  test(`OAuth entry path routes account_deleted to /auth/restore: ${label}`, () => {
    const block = section(oauthLoginSource, startMarker, endMarker, label);
    assert.match(
      block,
      /restoreInfoFromError/,
      `${label}: catch block does not detect AccountDeletedError`,
    );
    assert.match(block, /goRestore/, `${label}: does not route to /auth/restore`);
  });
}

test('popup-blocked full-page fallback (OAuthResult) routes account_deleted to /auth/restore via router state', () => {
  assert.match(oauthResultSource, /instanceof AccountDeletedError/);
  const idxRestore = oauthResultSource.indexOf("navigate('/auth/restore'");
  assert.notEqual(idxRestore, -1, 'OAuthResult does not navigate to /auth/restore');
  // 복구 정보는 라우터 state 로만 — URL 폴백(navigate(`/auth/oauth?error=...`))보다 먼저 처리
  const idxUrlFallback = oauthResultSource.indexOf('encodeURIComponent(msg)');
  assert.ok(
    idxRestore < idxUrlFallback,
    'AccountDeletedError must be handled before the URL-serialized error fallback',
  );
});

test('restore token travels only via router state — never URL query/hash', () => {
  for (const [name, source] of [['OAuthLogin.tsx', oauthLoginSource], ['OAuthResult.tsx', oauthResultSource]]) {
    assert.doesNotMatch(source, /auth\/restore\?/, `${name}: /auth/restore must not carry query params`);
    assert.doesNotMatch(source, /restore_token=/i, `${name}: restore token must never be URL-encoded`);
  }
  assert.match(oauthLoginSource, /navigate\('\/auth\/restore',\s*\{\s*state/, 'goRestore must pass info via router state');
});
