import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, RiderStyle, Language, SkillKey } from '@/api/types';

interface UserState {
  user: User | null;
  isAuthenticated: boolean;

  // actions
  login: (phone: string) => void;
  setProfile: (nickname: string, riderStyle: RiderStyle) => void;
  logout: () => void;
  addExp: (levelExp: number, xpPoints: number) => void;
  addGold: (gold: number) => void;
  spendXp: (xp: number) => boolean;
  setLanguage: (lang: Language) => void;
  investSkill: (key: SkillKey) => boolean;
}

const DEFAULT_USER: User = {
  id: 'u-me',
  phone: '+84 901 234 567',
  nickname: '@nguyen_rider',
  riderStyle: 'night_rider',
  avatarUrl: 'https://i.pravatar.cc/240?img=12',
  level: 7,
  levelExp: 1680,
  xpPoints: 240,
  gold: 1820,
  skillPoints: 2,
  language: 'ko',
  skills: { distance_rider: 1, gold_hunter: 0, safe_rider: 1 },
};

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: DEFAULT_USER,
      isAuthenticated: true, // 더미 — 프로토타입은 기본 로그인 상태

      login: (phone) => {
        set({
          user: { ...DEFAULT_USER, phone },
          isAuthenticated: true,
        });
      },

      setProfile: (nickname, riderStyle) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, nickname, riderStyle } });
      },

      logout: () => {
        set({ user: null, isAuthenticated: false });
      },

      addExp: (levelExp, xpPoints) => {
        const u = get().user;
        if (!u) return;
        set({
          user: {
            ...u,
            levelExp: u.levelExp + levelExp,
            xpPoints: u.xpPoints + xpPoints,
          },
        });
      },

      addGold: (gold) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, gold: u.gold + gold } });
      },

      spendXp: (xp) => {
        const u = get().user;
        if (!u || u.xpPoints < xp) return false;
        set({ user: { ...u, xpPoints: u.xpPoints - xp } });
        return true;
      },

      setLanguage: (language) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, language } });
      },

      investSkill: (key) => {
        const u = get().user;
        if (!u || u.skillPoints < 1 || u.skills[key] >= 3) return false;
        set({
          user: {
            ...u,
            skillPoints: u.skillPoints - 1,
            skills: { ...u.skills, [key]: u.skills[key] + 1 },
          },
        });
        return true;
      },
    }),
    { name: 'saigon-rider-user' }
  )
);
