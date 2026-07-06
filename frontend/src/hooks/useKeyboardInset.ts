import { useEffect, useState } from 'react';

function readKeyboardInset(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  // 키보드 높이 = 레이아웃 뷰포트 − 비주얼 뷰포트. offsetTop(브라우저의 키보드 팬)은
  // 빼지 않는다 — 빼면 팬이 일어난 순간 inset 이 0 이 되어 .page 가 안 줄고, 그 결과
  // 브라우저가 다시 팬해 헤더가 밀려 올라가는 악순환이 생긴다. (interactive-widget=resizes-visual)
  const inset = window.innerHeight - vv.height;
  return inset > 0 ? Math.round(inset) : 0;
}

export function useKeyboardInset(): number {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const sync = () => setKeyboardInset(readKeyboardInset());
    const vv = window.visualViewport;

    sync();
    window.addEventListener('resize', sync);
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);

    return () => {
      window.removeEventListener('resize', sync);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, []);

  return keyboardInset;
}
