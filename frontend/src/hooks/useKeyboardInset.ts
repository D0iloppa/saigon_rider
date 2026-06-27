import { useEffect, useState } from 'react';

function readKeyboardInset(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  const inset = window.innerHeight - vv.height - vv.offsetTop;
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
