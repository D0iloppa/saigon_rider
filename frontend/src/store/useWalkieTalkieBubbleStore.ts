import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { native } from '@/lib/native';
import type { DmMessage } from '@/api/types';

/**
 * 워키토키 플로팅 버블(A-7)의 앱 전역 상태.
 *
 * 대표 지시(2026-08-27): 버블이 DM 대화방 화면(DmDetail)에 종속돼 그 화면을 떠나면
 * 사라지던 문제 — 마지막으로 열었던 대화방을 대상으로 앱 전역(App.tsx)에서 유지한다.
 *
 * 추가 지시(2026-08-27): 대화방 입장만으로 자동 참여하지 않는다 — 헤더메뉴 "워키토키" 탭 /
 * 초대카드 "참여하기" / 캡슐 컨텍스트메뉴 "채널 변경" 3가지 명시적 액션에서만 활성화된다.
 *
 * 추가 지시(2026-08-27): 앱을 완전히 종료(force-quit)했다가 다시 열어도 버블이 즉시
 * 다시 뜨도록 `activeConversationId`/`activeConversationMeta`만 persist(localStorage)한다.
 * `closed`는 persist 대상에서 제외 — 매 재기동마다 닫혀있던 상태까지 기억할 필요는 없다
 * (재기동 시 버블은 기본적으로 다시 나타나는 게 이번 요구사항의 의도).
 * `phase`(녹음 진행 상태)는 애초에 이 스토어가 아니라 컴포넌트 로컬 state — 네이티브
 * 녹음은 앱 프로세스가 죽으면 함께 종료되므로 복원 대상이 아니다.
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
  /**
   * 워키토키 참여(대표 지시 2026-08-27: 헤더메뉴 "워키토키" 탭 / 초대카드 "참여하기" / 캡슐
   * 컨텍스트메뉴 "채널 변경" 3가지 명시적 액션에서만 호출) — 매번 closed 를 리셋해 버블을 띄운다.
   */
  setActiveConversation: (id: string, meta?: WalkieTalkieConversationMeta) => void;
  close: () => void;
  /** 진입 아이콘 재탭(활성 대화 있음) 시 닫혀 있던 캡슐을 다시 띄운다. 대상 대화는 그대로 유지. */
  open: () => void;
  /**
   * 어텐션 핑(대표 지시 2026-08-27): 이미 활성 대화가 있는 상태에서 진입 아이콘을 다시 눌렀을 때
   * 캡슐을 끄지 않고 "이미 켜져 있어요"를 알리듯 짧게 흔들리는 비파괴적 피드백만 준다.
   * 값 자체엔 의미 없음 — 증가할 때마다 캡슐 쪽 이펙트가 반응(peek)한다.
   */
  attentionPing: number;
  ping: () => void;

  /**
   * 지금 화면에 떠 있는 DM 대화방 id (DmDetail 이 마운트/언마운트 시 설정).
   *
   * DmDetail 과 워키토키 캡슐이 **같은 대화를 각자 5초마다 조회**하던 중복을 없애기 위한 것이다.
   * 이 값이 캡슐의 대상 대화와 같으면 캡슐은 자체 폴링을 멈추고, DmDetail 이 이미 받아온 결과를
   * 아래 `lastPolledBatch` 로 넘겨받아 쓴다(요청 수가 절반이 된다).
   */
  foregroundConversationId: string | null;
  setForegroundConversation: (id: string | null) => void;
  /** DmDetail 이 방금 폴링으로 받은 신규 메시지 묶음 — 캡슐이 여기서 음성메시지를 골라간다. */
  lastPolledBatch: { conversationId: string; messages: DmMessage[]; seq: number } | null;
  publishPolledMessages: (conversationId: string, messages: DmMessage[]) => void;
}

export const useWalkieTalkieBubbleStore = create<WalkieTalkieBubbleState>()(
  persist(
    (set) => ({
      activeConversationId: null,
      activeConversationMeta: null,
      closed: false,
      setActiveConversation: (id, meta) => {
        set({ activeConversationId: id, activeConversationMeta: meta ?? null, closed: false });
        // 채널 바로가기 위젯(Android) 갱신 — 실패해도 앱 동작에 영향 없음.
        native.walkieTalkie.syncActiveChannel({ channelId: id, channelName: meta?.name ?? '' }).catch(() => {});
      },
      close: () => set({ closed: true }),
      open: () => set({ closed: false }),
      attentionPing: 0,
      ping: () => set((s) => ({ attentionPing: s.attentionPing + 1 })),
      foregroundConversationId: null,
      setForegroundConversation: (id) => set({ foregroundConversationId: id }),
      lastPolledBatch: null,
      publishPolledMessages: (conversationId, messages) =>
        // seq 는 같은 내용이 연달아 와도 구독자가 변화를 감지하게 하는 단조 증가값.
        set((s) => ({
          lastPolledBatch: { conversationId, messages, seq: (s.lastPolledBatch?.seq ?? 0) + 1 },
        })),
    }),
    {
      name: 'saigon-rider-walkie-bubble',
      partialize: (s) => ({
        activeConversationId: s.activeConversationId,
        activeConversationMeta: s.activeConversationMeta,
      }),
    }
  )
);
