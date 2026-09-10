import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { native } from '@/lib/native';

/**
 * 워키토키 플로팅 버블(A-7)의 앱 전역 상태.
 *
 * 대표 지시(2026-08-27): 버블이 DM 대화방 화면(DmDetail)에 종속돼 그 화면을 떠나면
 * 사라지던 문제 — 마지막으로 열었던 대화방을 대상으로 앱 전역(App.tsx)에서 유지한다.
 *
 * 추가 지시(2026-08-27): 대화방 입장만으로 자동 참여하지 않는다 — 헤더메뉴 "워키토키" 탭 /
 * 초대카드 "참여하기" / 캡슐 컨텍스트메뉴 "채널 변경" 3가지 명시적 액션에서만 활성화된다.
 *
 * 대표 지시(2026-08-27) — **2026-09-10 대표 지시로 번복.** 당시엔 `activeConversationId`/
 * `activeConversationMeta`만 persist(localStorage)하고 앱을 완전히 종료(force-quit)했다가
 * 다시 열면 버블이 즉시 다시 뜨는 것을 의도된 동작으로 규정했다. 그런데 X 로 캡슐을 닫아도
 * 재기동 시 그대로 다시 나타나는 게 오작동으로 보고돼, X 의 의미를 "버블 숨김"이 아니라
 * "채널에서 나가기"로 바꿨다 — `close()` 가 persist 대상인 `activeConversationId`/
 * `activeConversationMeta`를 직접 비워, 재기동해도 되살아날 대상 자체가 없다.
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
  /**
   * 워키토키 참여(대표 지시 2026-08-27: 헤더메뉴 "워키토키" 탭 / 초대카드 "참여하기" / 캡슐
   * 컨텍스트메뉴 "채널 변경" 3가지 명시적 액션에서만 호출).
   */
  setActiveConversation: (id: string, meta?: WalkieTalkieConversationMeta) => void;
  /**
   * X버튼 — "채널에서 나가기"(2026-09-10 대표 지시로 확정. 이전엔 캡슐만 숨기고 대상 대화는
   * 유지했으나, 그 결과 재기동 시 캡슐이 되살아나는 게 오작동으로 지적돼 번복). persist 대상인
   * activeConversationId/activeConversationMeta 를 직접 비워 재기동해도 되살아날 대상이 없게
   * 하고, Android 채널 바로가기 위젯의 활성 채널도 같이 해제한다. 재참여는 3가지 명시적 활성화
   * 경로(setActiveConversation)로만 가능 — 여기선 새 진입로를 만들지 않는다.
   */
  close: () => void;
  /**
   * 로그아웃 시 전체 초기화 — persist 된 activeConversationId/activeConversationMeta 를 지운다.
   * close() 와 상태 결과는 같다(둘 다 대상 대화를 비우고 Android 위젯도 해제) — 로그아웃 후에도
   * 대상 대화나 위젯이 남아있으면 다음 사용자(같은 기기 재로그인 등)에게 이전 계정의 워키토키
   * 버블/위젯이 그대로 뜬다. 위젯 SharedPreferences 는 `MyFirebaseMessagingService.maybeAutoPlay`
   * 의 백그라운드 자동재생 게이트이기도 해서, 해제하지 않으면 로그아웃 후에도 이전 계정 채널의
   * 음성 푸시가 조용히 자동재생될 수 있다.
   */
  reset: () => void;
  /**
   * 어텐션 핑(대표 지시 2026-08-27): 이미 활성 대화가 있는 상태에서 진입 아이콘을 다시 눌렀을 때
   * 캡슐을 끄지 않고 "이미 켜져 있어요"를 알리듯 짧게 흔들리는 비파괴적 피드백만 준다.
   * 값 자체엔 의미 없음 — 증가할 때마다 캡슐 쪽 이펙트가 반응(peek)한다.
   */
  attentionPing: number;
  ping: () => void;
  /**
   * 캡슐이 녹음 중인지(반이중 게이트). DmDetail 의 음성 버블이 재생을 막는 데 쓴다 — iOS 는 녹음 중
   * 웹 오디오 재생이 마이크를 끊고(service-rules §워키토키 9), 무전기 관례상 말하는 동안 듣지 않는다.
   * 비영속 — 녹음은 프로세스와 함께 끝난다.
   */
  recording: boolean;
  setRecording: (v: boolean) => void;
}

export const useWalkieTalkieBubbleStore = create<WalkieTalkieBubbleState>()(
  persist(
    (set) => ({
      activeConversationId: null,
      activeConversationMeta: null,
      setActiveConversation: (id, meta) => {
        set({ activeConversationId: id, activeConversationMeta: meta ?? null });
        // 채널 바로가기 위젯(Android) 갱신 — 실패해도 앱 동작에 영향 없음.
        native.walkieTalkie.syncActiveChannel({ channelId: id, channelName: meta?.name ?? '' }).catch(() => {});
      },
      close: () => {
        set({ activeConversationId: null, activeConversationMeta: null });
        // 채널 바로가기 위젯(Android) 활성 채널 해제 — 실패해도 앱 동작에 영향 없음.
        native.walkieTalkie.syncActiveChannel({ channelId: '', channelName: '' }).catch(() => {});
      },
      reset: () => {
        set({ activeConversationId: null, activeConversationMeta: null });
        // 로그아웃 — close() 와 동일하게 위젯 활성 채널도 해제한다(다음 사용자에게 이전 계정
        // 채널이 남지 않도록, 백그라운드 자동재생 게이트이기도 하다).
        native.walkieTalkie.syncActiveChannel({ channelId: '', channelName: '' }).catch(() => {});
      },
      attentionPing: 0,
      ping: () => set((s) => ({ attentionPing: s.attentionPing + 1 })),
      recording: false,
      setRecording: (v) => set({ recording: v }),
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
