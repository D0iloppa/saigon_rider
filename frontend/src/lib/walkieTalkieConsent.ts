/** 워키토키(음성메시지) 최초 사용 동의 + 옵트아웃 — localStorage (A-9).
 *  실제 녹음/전송 기능(A-4~A-7)이 붙기 전까지는 서버 필드가 없어 로컬에만 저장한다. */
const CONSENT_KEY = 'sgr.walkieTalkie.consent';
const OPT_OUT_KEY = 'sgr.walkieTalkie.optOut';

/** 최초 사용 동의 모달을 이미 통과했는지. */
export function hasWalkieTalkieConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

/** 동의 모달에서 "동의"를 눌렀을 때 기록 — 재노출 방지. */
export function setWalkieTalkieConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, '1');
  } catch {
    /* quota 등 저장 실패 무시 */
  }
}

/** 설정 화면 옵트아웃 스위치로 기능 자체를 껐는지. */
export function isWalkieTalkieOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setWalkieTalkieOptOut(optOut: boolean): void {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* quota 등 저장 실패 무시 */
  }
}
