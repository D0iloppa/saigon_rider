import { lazy, type ComponentType } from 'react';

const RETRY_KEY = 'chunk_reload_attempts';
/** 한 장애 구간에서 허용하는 자동 새로고침 최대 횟수 — 상한이 무한 루프를 막는다. */
const MAX_AUTO_RELOADS = 2;

function attempts(): number {
  return Number(sessionStorage.getItem(RETRY_KEY) ?? '0');
}

/**
 * 청크 재시도 카운터를 초기화한다. 청크가 한 번이라도 정상 로드되면(=장애 종료),
 * 그리고 사용자가 ErrorBoundary 의 '다시 시도'를 직접 누르면 호출된다.
 *
 * sessionStorage 는 새로고침으로 지워지지 않아 WebView 를 완전히 종료하기 전까지
 * 남는다 — 초기화 경로가 없으면 자동 재시도를 한 번 소진한 뒤 앱을 껐다 켤 때까지
 * 계속 에러 화면만 보게 된다. 이 함수가 그 탈출구다.
 */
export function clearChunkRetryState() {
  sessionStorage.removeItem(RETRY_KEY);
}

/**
 * lazy() 래퍼 — 배포 직후 옛 index.html 을 들고 있는 세션이 더 이상 존재하지 않는
 * 옛 해시 청크(예: MarketMain-<hash>.js)를 요청해 404/502 로 실패하는 경우를 잡는다.
 * 실패하면 최대 MAX_AUTO_RELOADS 회까지 자동으로 페이지를 새로고침해 최신
 * index.html·청크를 받아온다. 상한을 넘기면 에러를 그대로 던져 상위 ErrorBoundary 가
 * 안내 UI를 보여준다.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory()
      .then((mod) => {
        // 정상 로드 = 장애 종료. 다음 장애에 다시 자동 복구할 수 있도록 카운터를 비운다.
        if (attempts() > 0) clearChunkRetryState();
        return mod;
      })
      .catch((error) => {
        const n = attempts();
        if (n >= MAX_AUTO_RELOADS) throw error;
        sessionStorage.setItem(RETRY_KEY, String(n + 1));
        window.location.reload();
        // 새로고침이 실제로 일어날 때까지 서스펜드 유지 (다시는 resolve/reject 되지 않음)
        return new Promise<{ default: T }>(() => {});
      })
  );
}
