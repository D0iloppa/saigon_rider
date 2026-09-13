import { create } from 'zustand';
import { fetchConversations } from '@/api/dm';
import { fetchNotifications } from '@/api/notifications';

// 앱의 미읽음 뱃지 2종(채팅 탭 / 홈 알림벨)을 한 스토어에서 들고 있다.
// 종전엔 알림벨만 HomePage 로컬 state 로 따로 관리하면서 홈 마운트 시 1회만 조회해,
// 채팅 탭 뱃지와 값이 어긋나 보였다(2026-09-13). 갱신은 App.tsx 가 같은 tick 에서 함께 돈다.
interface DmState {
  totalUnread: number;
  notiUnread: number;
  refreshUnread: () => Promise<void>;
  /** userId 를 인자로 받는다 — 스토어끼리 import 해 순환 참조를 만들지 않기 위해서다. */
  refreshNotiUnread: (userId: string) => Promise<void>;
}

export const useDmStore = create<DmState>((set) => ({
  totalUnread: 0,
  notiUnread: 0,
  refreshUnread: async () => {
    try {
      const convs = await fetchConversations();
      const total = convs.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);
      set({ totalUnread: total });
    } catch {
      // silent — badge just stays stale
    }
  },
  refreshNotiUnread: async (userId: string) => {
    try {
      const r = await fetchNotifications(userId, 1);
      set({ notiUnread: r.unread_count });
    } catch {
      // silent — badge just stays stale
    }
  },
}));
