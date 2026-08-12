import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// S-16 (D-7, 대표 결정): 판매자가 앱을 다시 열지 않으면 구매자의 거래·리뷰가 영구 정체됐다.
// 결정은 "구매자 요청 + 판매자 확인 + 운영 이의" — **자동 완료는 없다**.

test('buyer gets a request button; completing stays seller-only', () => {
  const detail = read('DmDetail.tsx');

  assert.match(detail, /const canComplete = !!appt && status === 'ACCEPTED' && isSeller;/);
  assert.match(detail, /const canRequestCompletion = !!appt && status === 'ACCEPTED' && !isSeller && !completionPending;/);
  assert.match(detail, /const canDeclineCompletion = !!appt && status === 'ACCEPTED' && isSeller && completionPending;/);

  // 완료 확정 액션은 여전히 판매자 버튼 하나뿐 — 구매자 버튼이 completeAppointment 를 부르면 자동 완료가 된다.
  const requestBtn = detail.slice(detail.indexOf('{canRequestCompletion && ('), detail.indexOf('{canDeclineCompletion && ('));
  assert.match(requestBtn, /handleAppointmentAction\(requestAppointmentCompletion, appt\.id\)/);
  assert.doesNotMatch(requestBtn, /completeAppointment/);
});

test('a declined request reopens the buyer request path and says so on screen', () => {
  const detail = read('DmDetail.tsx');

  // 거절됨 = 요청 없음 상태로 되돌려 재요청을 허용한다.
  assert.match(detail, /const completionPending = !!appt\?\.completionRequestedAt && !appt\.completionDeclinedAt;/);
  // 거절 사실이 화면에 남지 않으면 구매자는 "요청이 사라졌다"고 읽는다.
  assert.match(detail, /appt\?\.completionDeclinedAt && !isSeller && status === 'ACCEPTED'/);
  assert.match(detail, /dm\.apptCompletionDeclinedNote/);
  assert.match(detail, /dm\.apptRequestCompletionAgain/);
});

test('an ops dismissal is not reported to the buyer as a seller decline', () => {
  const detail = read('DmDetail.tsx');

  // 운영 기각은 completionDeclinedBy 가 null 이다 — 같은 시각 필드를 쓰므로 행위자로 문구를 갈라야
  // "판매자가 거절했다"고 잘못 말하지 않는다(연락할 상대도 달라진다).
  assert.match(detail, /appt\.completionDeclinedBy\s*\n?\s*\?\s*t\('dm\.apptCompletionDeclinedNote'/);
  assert.match(detail, /:\s*t\('dm\.apptCompletionDismissedNote'/);
});

test('pending request is visible in the card status pill', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /completionPending\s*\?\s*t\('dm\.apptCompletionRequested'/);
});

test('api client exposes request/decline and carries the new fields', () => {
  const dm = read('../../api/dm.ts');

  assert.match(dm, /appointments\/\$\{appointmentId\}\/request-completion/);
  assert.match(dm, /appointments\/\$\{appointmentId\}\/decline-completion/);
  assert.match(dm, /completionRequestedBy: raw\.completion_requested_by \?\? null/);
  assert.match(dm, /completionRequestedAt: raw\.completion_requested_at \?\? null/);
  assert.match(dm, /completionDeclinedAt: raw\.completion_declined_at \?\? null/);
  assert.match(dm, /completionDeclinedBy: raw\.completion_declined_by \?\? null/);
});

test('completion request copy exists in all three locales', () => {
  const keys = [
    'apptCompletionRequested',
    'apptRequestCompletion',
    'apptRequestCompletionAgain',
    'apptDeclineCompletion',
    'apptCompletionDeclinedNote',
    'apptCompletionDismissedNote',
  ];
  for (const lang of ['ko', 'en', 'vi']) {
    const dict = JSON.parse(read(`../../locales/${lang}/translation.json`));
    for (const key of keys) {
      assert.equal(typeof dict.dm?.[key], 'string', `${lang} dm.${key} missing`);
      assert.ok(dict.dm[key].length > 0, `${lang} dm.${key} is empty`);
    }
  }
});
