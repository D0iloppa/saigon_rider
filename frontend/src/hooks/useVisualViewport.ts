import { useEffect, useState } from 'react';

export interface VisualViewportState {
  /** 보이는 영역(키보드 제외) 높이(px). */
  height: number;
  /** 레이아웃 뷰포트 대비 비주얼 뷰포트 상단 오프셋(px) — iOS 키보드 팬 보정용. */
  offsetTop: number;
}

function read(): VisualViewportState {
  if (typeof window === 'undefined') return { height: 0, offsetTop: 0 };
  const vv = window.visualViewport;
  const layoutH = window.innerHeight;
  const height = vv ? vv.height : layoutH;
  const rawOffset = vv ? vv.offsetTop : 0;
  // 페이지가 차지할 [offsetTop, offsetTop+height] 는 [0, layoutH] 안에 있어야 한다.
  // 키보드 애니메이션 중 iOS 가 offsetTop 을 순간적으로 과도하게 보고(오버슛)하면 페이지가
  // 화면 아래로 밀렸다 돌아오는 "다시 그리는" 현상이 생기므로 유효 범위로 clamp 한다.
  const offsetTop = Math.max(0, Math.min(rawOffset, layoutH - height));
  return { height, offsetTop };
}

/**
 * 비주얼 뷰포트(키보드가 가리고 남은 실제 표시 영역)를 추적한다.
 *
 * 하단 입력창 화면(채팅)에서 이 값으로 페이지를 비주얼 뷰포트에 pin 하면
 * (height = height, transform: translateY(offsetTop)), 키보드가 떠서 iOS 가
 * 화면을 밀어올려도(offsetTop 증가) UI 가 항상 보이는 영역에 유지돼 헤더가 사라지지 않는다.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(read);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setState(read());
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}
