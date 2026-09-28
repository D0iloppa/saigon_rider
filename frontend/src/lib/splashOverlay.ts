/**
 * 스플래시 오버레이 가시 상태 — App.tsx 의 splashVisible 을 전역에서 조회/대기할 수 있게 한다.
 *
 * 버그(2026-09-28): 홈이 splashVisible 오버레이 밑에서 이미 마운트돼 ensureLocation() 을 돌리고
 * 있어, "서비스 지역 밖" 토스트(map.outsideArea)가 스플래시 위에 떠 보였다. 지도/위치 관련
 * 토스트는 이 모듈로 스플래시가 내려간 뒤로 미뤄 사용자가 실제로 화면을 보고 있을 때만 뜨게 한다.
 */
let visible = true;
const waiters: Array<() => void> = [];

export function setSplashOverlayVisible(v: boolean) {
  visible = v;
  if (!visible && waiters.length) {
    const pending = waiters.splice(0, waiters.length);
    pending.forEach((cb) => cb());
  }
}

/** 스플래시가 이미 내려갔으면 즉시, 아니면 내려간 뒤에 콜백을 실행한다. */
export function runAfterSplash(cb: () => void) {
  if (!visible) cb();
  else waiters.push(cb);
}
