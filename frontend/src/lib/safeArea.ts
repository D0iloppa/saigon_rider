let cachedTop: number | null = null;

/**
 * 상단 safe-area(`--status-bar-height`, 플랫폼별 24~44px)의 실측 px.
 *
 * 이 토큰은 `env()`/`max()` 를 포함해 `getComputedStyle(...).getPropertyValue()` 로 읽으면
 * 계산되지 않은 문자열이 나올 수 있어, 숨은 프로브 엘리먼트의 높이로 실측한다.
 * 플로팅 버블(워키토키·위치공유) 드래그 클램프의 y 하한으로 쓴다 — 노치/다이나믹아일랜드
 * /상태바 영역으로 버블이 올라가 가려지는 것을 막는다.
 */
export function getTopSafeAreaPx(): number {
  if (cachedTop != null) return cachedTop;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:var(--status-bar-height)';
  document.body.appendChild(probe);
  cachedTop = probe.offsetHeight || 24;
  probe.remove();
  return cachedTop;
}
