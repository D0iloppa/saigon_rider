import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'chunk_reload_attempted';

/**
 * lazy() 래퍼 — 배포 직후 옛 index.html 을 들고 있는 세션이 더 이상 존재하지 않는
 * 옛 해시 청크(예: MarketMain-<hash>.js)를 요청해 404/502 로 실패하는 경우를 잡는다.
 * 실패 시 1회에 한해 자동으로 페이지를 새로고침해 최신 index.html·청크를 받아온다.
 * 이미 이 세션에서 한 번 새로고침했다면(sessionStorage 플래그) 다시 시도하지 않고
 * 에러를 그대로 던져 상위 ErrorBoundary 가 안내 UI를 보여주게 한다 — 무한 새로고침 루프 방지.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((error) => {
      if (sessionStorage.getItem(RELOAD_FLAG) === '1') throw error;
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      // 새로고침이 실제로 일어날 때까지 컴포넌트를 서스펜드 상태로 유지 (다시는 resolve/reject 되지 않음)
      return new Promise<{ default: T }>(() => {});
    })
  );
}
