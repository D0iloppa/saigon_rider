import { create } from 'zustand';

/**
 * 워키토키 플로팅 버블(A-7)의 앱 전역 상태.
 *
 * 대표 지시(2026-08-27): 버블이 DM 대화방 화면(DmDetail)에 종속돼 그 화면을 떠나면
 * 사라지던 문제 — 마지막으로 열었던 대화방을 대상으로 앱 전역(App.tsx)에서 유지한다.
 * persist 하지 않는다 — 앱을 재기동하면 어떤 대화방이 "마지막"인지 다시 DmDetail 진입으로
 * 정해지는 게 자연스럽다(껐다 켠 뒤에도 버블이 떠 있으면 사용자가 대화 내용을 잊은 채
 * 뜬금없이 보게 된다).
 */
/** 버블에 채널정보(A-7 UX)로 표시할 최소 메타 — DmDetail 이 이미 알고 있는 값을 그대로 넘겨준다. */
export interface WalkieTalkieConversationMeta {
  name: string;
  isGroup: boolean;
}

interface WalkieTalkieBubbleState {
  /** 마지막으로 연 DM 대화 — 전송 대상. 아직 한 번도 DM 대화방을 열지 않았으면 null(렌더 안 함). */
  activeConversationId: string | null;
  /** 현재 대상 대화의 채널명/그룹여부 — 없으면(아직 미조회) null. */
  activeConversationMeta: WalkieTalkieConversationMeta | null;
  /** 사용자가 X버튼으로 닫았는지. */
  closed: boolean;
  /** DmDetail 마운트 시 호출 — 다른 대화방으로 바뀔 때만 closed 를 리셋한다(같은 방 재진입은 이전 닫힘 상태 유지). */
  setActiveConversation: (id: string, meta?: WalkieTalkieConversationMeta) => void;
  close: () => void;
  /** 헤더 메뉴 "워키토키" 탭 — 닫혔던 버블을 강제로 다시 띄운다. */
  reopen: (id: string) => void;
}

export const useWalkieTalkieBubbleStore = create<WalkieTalkieBubbleState>((set, get) => ({
  activeConversationId: null,
  activeConversationMeta: null,
  closed: false,
  setActiveConversation: (id, meta) => {
    if (get().activeConversationId === id) {
      if (meta) set({ activeConversationMeta: meta });
      return;
    }
    set({ activeConversationId: id, activeConversationMeta: meta ?? null, closed: false });
  },
  close: () => set({ closed: true }),
  reopen: (id) => set({ activeConversationId: id, closed: false }),
}));
