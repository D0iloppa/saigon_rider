import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// F-9 우회 차단: OAuthLogin.tsx/OAuthResult.tsx 는 최초 로그인 직후 1회만 profile-setup 으로
// 보낸다 — 그 화면에서 체크박스를 누르지 않고 벗어나면(URL 로 /home 직행, 재실행 등) 세션은
// 유효하고 is_new 는 false 라 아무 게이트도 없이 서비스로 들어갈 수 있었다.
// PrivateRoute(모든 서비스 화면의 단일 진입점)에 재진입 시점 게이트를 고정한다.
test('PrivateRoute redirects sessions with no recorded consent to profile-setup', () => {
  const source = read('PrivateRoute.tsx');

  assert.match(
    source,
    /consentAgreedAt === null/,
    'consent gate missing — PrivateRoute no longer checks consentAgreedAt',
  );
  assert.match(
    source,
    /Navigate to="\/auth\/profile-setup"/,
    'consent gate does not redirect to the existing profile-setup screen (no new screen should be built)',
  );
});

// 판정 불가(서버 값 미제공 — 필드 자체가 undefined)일 때 차단하면 F-19 의 fail-open 원칙과
// 어긋난다. 넓은 falsy 체크(!user?.consentAgreedAt)로 회귀하면 undefined 도 걸려 전원이
// 갇히는 사고가 나므로, 반드시 엄격한 null 비교(=== null)만 써야 한다.
test('the consent gate fails open on undefined (unknown) rather than blocking everyone', () => {
  const source = read('PrivateRoute.tsx');

  assert.doesNotMatch(
    source,
    /if\s*\(!user\?\.consentAgreedAt\)/,
    'gate regressed to a broad falsy check — this also blocks users when the field is undefined (judgeable=false case)',
  );
  assert.match(
    source,
    /user\?\.consentAgreedAt === null/,
    'gate must use a strict null comparison so undefined (unknown) passes through',
  );
});

// 동의 화면 자체를 새로 만들지 않고 기존 ProfileSetup 을 재사용했는지 — App.tsx 라우트 확인.
test('App.tsx still routes /auth/profile-setup outside PrivateRoute (no redirect loop) and reuses ProfileSetup', () => {
  const source = read('../../App.tsx');

  assert.match(
    source,
    /<Route path="\/auth\/profile-setup" element=\{<ProfileSetup \/>\}\s*\/>/,
    'profile-setup route regressed — must stay outside PrivateRoute or the consent gate loops forever',
  );
});

// 동의 저장 성공 시 로컬 store 도 즉시 반영해야 한다 — 안 그러면 서버는 기록됐는데 프론트
// 캐시가 여전히 null 이라 navigate('/home') 직후 PrivateRoute 가 바로 되돌려보내는 bounce 가 난다.
test('ProfileSetup updates the local store immediately after consent is recorded', () => {
  const source = read('../../pages/auth/ProfileSetup.tsx');

  assert.match(
    source,
    /markConsentAgreed\(consented\.consent_agreed_at\)/,
    'ProfileSetup no longer syncs the store after apiSaveConsent — re-entry would bounce right back',
  );
});
