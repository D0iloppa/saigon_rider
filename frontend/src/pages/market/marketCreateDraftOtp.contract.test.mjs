import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

test('판매 작성 화면은 로그인만 요구하고 전화 인증은 게시 직전에 검사한다', () => {
  const route = read('../../components/auth/VerifiedSellerRoute.tsx');
  const create = read('MarketCreate.tsx');

  assert.doesNotMatch(route, /PhoneVerifiedGate|\/auth\/phone-verify/);
  assert.match(route, /<PrivateRoute>\{children\}<\/PrivateRoute>/);
  assert.match(create, /if \(!businessProfileId && !user\.phoneVerified\)/);
  assert.match(create, /navigate\('\/auth\/phone-verify', \{ state: \{ from: \{ pathname: '\/market\/new' \} \} \}\)/);
});

test('매물 초안은 사용자·업체별 key로 저장하고 업로드가 끝난 content만 복원한다', () => {
  const create = read('MarketCreate.tsx');

  assert.match(create, /market-listing-draft/);
  assert.match(create, /DRAFT_MAX_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(create, /businessProfileId \?\? 'personal'/);
  assert.match(create, /localStorage\.setItem\(key, JSON\.stringify\(draft\)\)/);
  assert.match(create, /image\.contentId && image\.serverPreview/);
  assert.match(create, /file: null,[\s\S]*contentId: image\.contentId/);
  assert.match(create, /removeDraft\(draftKey\)/);
});

test('사진 업로드 결과는 배열 index가 아니라 안정적인 local ID에 연결된다', () => {
  const create = read('MarketCreate.tsx');

  assert.match(create, /localId: crypto\.randomUUID\(\)/);
  assert.match(create, /const uploadImage = async \(localId: string, file: File\)/);
  assert.match(create, /img\.localId === localId/);
  assert.match(create, /key=\{img\.localId\}/);
});

test('완료 버튼 차단 사유는 사진·업로드·제목·장소 순으로 사용자에게 표시된다', () => {
  const create = read('MarketCreate.tsx');

  assert.match(create, /market\.postNeedsPhoto/);
  assert.match(create, /market\.postWaitUploads/);
  assert.match(create, /market\.postNeedsTitle/);
  assert.match(create, /market\.postNeedsLocation/);
  assert.match(create, /aria-live="polite"/);
});
