import { useEffect, useState } from 'react';
import { pingBizView } from '@/api/biz';

// "N명이 보는중" — 포스트 패널에 포커싱된 업체 1곳만 폴링 (소켓 없음, 결정 2026-07-11).
// 15s 인터벌(AppShell DM_POLL_MS 관례), 백그라운드 탭은 tick 스킵 + 복귀 시 즉시 재조회.
const POLL_MS = 15_000;

export function useBizViewerCount(bizId: string | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!bizId) return; // count 리셋은 직전 이펙트의 cleanup 이 담당
    let cancelled = false;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      pingBizView(bizId)
        .then((n) => { if (!cancelled) setCount(n); })
        .catch(() => { /* 순단 무시 — 칩만 안 뜸 */ });
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      setCount(null); // 업체 전환/패널 닫힘 시 이전 카운트 잔상 제거
    };
  }, [bizId]);
  return count;
}
