import { create } from 'zustand';

/**
 * 플로팅 버블(워키토키 캡슐 / 실시간 위치공유 버블)의 겹침 순서.
 *
 * 대표 지시(2026-09-07): 한쪽을 CSS z-index 로 항상 위에 고정하니(워키토키 61 > 위치공유 60)
 * 오히려 어색하다 — **마지막에 터치한 버블이 최상단**으로 올라오는 게 자연스럽다.
 * 각 버블이 pointerdown 시 `bringToFront(자기 id)` 를 호출하고, `topId` 와 자기 id 가 같으면
 * 상대보다 한 단계 높은 z-index 를 인라인으로 적용한다.
 *
 * 세션 내 상태 — persist 하지 않는다(앱을 다시 열면 어느 쪽이 위였는지 기억할 필요 없음).
 */
interface FloatingBubbleZOrderState {
  /** 마지막으로 터치된 버블 id. 아직 아무것도 안 눌렀으면 null(둘 다 기본 z-index). */
  topId: string | null;
  bringToFront: (id: string) => void;
}

export const useFloatingBubbleZOrderStore = create<FloatingBubbleZOrderState>()((set) => ({
  topId: null,
  bringToFront: (id) => set({ topId: id }),
}));
