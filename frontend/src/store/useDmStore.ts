import { create } from 'zustand';
import { fetchConversations } from '@/api/dm';

interface DmState {
  totalUnread: number;
  refreshUnread: () => Promise<void>;
}

export const useDmStore = create<DmState>((set) => ({
  totalUnread: 0,
  refreshUnread: async () => {
    try {
      const convs = await fetchConversations();
      const total = convs.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);
      set({ totalUnread: total });
    } catch {
      // silent — badge just stays stale
    }
  },
}));
