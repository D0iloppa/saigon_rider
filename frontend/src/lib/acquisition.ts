/**
 * 유입 귀속(acquisition attribution) — 016_PLATFORM_MASTER_SUPPLEMENT.md §6-2 #30.
 *
 * 진입 URL의 `?ref=` 를 최초 1회만 캡처해 localStorage 에 보관한다(first-touch, 불변) — 이후
 * 앱을 다시 열거나 다른 ref 로 재진입해도 절대 덮어쓰지 않는다. 실제 users.acquisition_source
 * 고정은 서버(routers/auth.py, 신규가입 분기)가 최종 결정하지만, 여기서 이미 있는 값을 덮지
 * 않는 것도 같은 불변식의 일부다 — 클라이언트가 여러 세션에 걸쳐 다른 ref 를 물고 오는 걸
 * 막는다.
 *
 * ref 형식(백엔드 카탈로그와 동일, backend/app/routers/auth.py:_normalize_acq_source):
 *   'agent:<code>' 필드 에이전트, 'u:<user_id>' 지인 소개·매물 공유(#31), 'biz:<code>' 업체 QR.
 * 값 검증(화이트리스트·길이)은 서버가 최종 강제한다 — 여긴 그냥 원문을 들고 다니는 저장소.
 */

const REF_KEY = 'sgr_acq_ref';

/** 앱 부팅 시 1회 호출 — 이미 저장된 값이 있으면 아무것도 하지 않는다(first-touch). */
export function captureAcqRefFromUrl(): void {
  try {
    if (localStorage.getItem(REF_KEY)) return;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) localStorage.setItem(REF_KEY, ref.slice(0, 64));
  } catch {
    // localStorage 불가(프라이버시 모드 등) — 귀속 캡처는 부가 기능이라 조용히 무시한다.
  }
}

/** 저장된 ref — 없으면 null(서버가 'organic' 으로 취급). */
export function getStoredAcqRef(): string | null {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

/** 매물 공유/지인 초대 링크 생성(#31) — 초대자 코드는 본인 user id 그대로 쓴다(별도 초대코드
 * 테이블 신설 없음, 016 §6-3). path 는 앱 내부 경로만 받는다(외부 URL 금지). */
export function buildReferralLink(userId: string, path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('ref', `u:${userId}`);
  return url.toString();
}
