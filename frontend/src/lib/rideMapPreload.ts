/**
 * 경로안내 지도(MapLibre + OpenFreeMap) 프리로딩.
 *
 * '경로' 버튼을 누른 뒤에야 스타일 JSON → 스프라이트/글리프 → 타일 순으로 네트워크가 시작돼,
 * 느린 회선에서는 지도가 뜨기 전까지 빈 화면이 길게 남는다(대표 지적 2026-08-06).
 * 앱이 한가할 때 미리 받아 브라우저 HTTP 캐시에 올려 그 공백을 줄인다.
 *
 * **표시 전용 최적화다** — 실패해도 조용히 넘어간다(경로안내는 어차피 자기 스타일을 다시 요청한다).
 * 타일까지 받지는 않는다: 어느 줌·어느 타일이 필요할지는 목적지가 정해져야 알 수 있고,
 * 미리 받으면 데이터 요금만 쓰게 된다. 지연의 앞단(스타일·스프라이트·글리프)만 덜어낸다.
 */
export const RIDE_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

let started = false;

/** 스타일과 그 스프라이트/글리프를 미리 받아 둔다. 앱 세션당 1회. */
export function preloadRideMapStyle(): void {
  if (started) return;
  started = true;

  const run = () => {
    fetch(RIDE_MAP_STYLE_URL, { mode: 'cors', cache: 'force-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((style: { sprite?: string; glyphs?: string } | null) => {
        if (!style) return;
        // 스프라이트(아이콘 아틀라스)는 스타일 로드 직후 무조건 필요하다 — 같이 데워 둔다.
        if (style.sprite) {
          void fetch(`${style.sprite}.json`, { mode: 'cors', cache: 'force-cache' }).catch(() => {});
          void fetch(`${style.sprite}.png`, { mode: 'cors', cache: 'force-cache' }).catch(() => {});
        }
      })
      .catch(() => { /* 프리로드 실패는 무시 — 본 로딩이 다시 요청한다 */ });
  };

  // 부팅 경로를 방해하지 않도록 한가할 때 실행한다.
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 5000 });
  else setTimeout(run, 3000);
}
