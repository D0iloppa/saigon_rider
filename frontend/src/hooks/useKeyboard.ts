import { useEffect, useState } from 'react';

export interface KeyboardState {
  /** 현재(또는 마지막으로 관측된) 키보드 높이(px). 키보드가 내려가도 마지막 값을 유지. */
  height: number;
  /** 키보드가 떠 있는지. */
  visible: boolean;
}

// 작은 뷰포트 변화(주소창 등)를 키보드로 오인하지 않기 위한 임계값
const KEYBOARD_THRESHOLD = 120;

/**
 * 키보드 높이/가시성을 JS 만으로 측정한다 (네이티브 플러그인 불필요).
 *
 * 이 앱의 네이티브 호스트는 키보드가 뜨면 웹뷰 영역을 리사이즈한다
 * (iOS: keyboardLayoutGuide, Android: adjustPan + SystemBars IME 패딩 —
 * native/ios/HANDOFF_keyboard_resize.md 참고). 따라서 키보드 높이 =
 * "baseline innerHeight − 현재 innerHeight" 로 얻을 수 있다.
 * 오버레이형(리사이즈 안 하는) 환경을 위해 visualViewport inset 도 함께 보고 max 를 취한다.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ height: 0, visible: false });

  useEffect(() => {
    let baseline = window.innerHeight;

    const measure = () => {
      baseline = Math.max(baseline, window.innerHeight);
      const vv = window.visualViewport;
      // offsetTop(브라우저 키보드 팬)은 빼지 않는다 — 빼면 팬 시 0 이 되어 악순환. [[useKeyboardInset]]
      const vpInset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height)) : 0;
      const resizeDelta = Math.max(0, baseline - window.innerHeight);
      const kb = Math.max(vpInset, resizeDelta);
      const visible = kb > KEYBOARD_THRESHOLD;
      setState((prev) => {
        const height = kb > 0 ? kb : prev.height; // 내려갈 때 마지막 높이 유지
        if (prev.visible === visible && prev.height === height) return prev;
        return { height, visible };
      });
    };

    const vv = window.visualViewport;
    window.addEventListener('resize', measure);
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, []);

  return state;
}
