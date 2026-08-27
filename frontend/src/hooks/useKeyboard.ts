import { useEffect, useState } from 'react';
import { native } from '@/lib/native';

export interface KeyboardState {
  /** 현재(또는 마지막으로 관측된) 키보드 높이(px). 키보드가 내려가도 마지막 값을 유지. */
  height: number;
  /** 키보드가 떠 있는지. */
  visible: boolean;
}

/**
 * 키보드 높이/가시성 구독. 소스는 native.onKeyboardChange 가 플랫폼별로 결정한다:
 * iOS·Android 네이티브 = KeyboardBridge keyboardWillShow/Hide 이벤트(키보드는 순수 오버레이,
 * 웹뷰 리사이즈 없음), 웹(브리지 미탑재) = 뷰포트 계측 폴백.
 *
 * 키보드가 내려가도 height 는 마지막 관측값을 유지한다 — 소비처(MessageComposer)가
 * 키보드 자리 패널을 같은 크기로 스왑하기 위함.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ height: 0, visible: false });

  useEffect(() => {
    return native.onKeyboardChange(({ height, visible }) => {
      setState((prev) => {
        const next = height > 0 ? height : prev.height; // 내려갈 때 마지막 높이 유지
        if (prev.visible === visible && prev.height === next) return prev;
        return { height: next, visible };
      });
    });
  }, []);

  return state;
}
