import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, RiderStyle, Language, SkillKey } from '@/api/types';
import type { UserDto } from '@/api/auth';
import i18n, { changeLang } from '@/lib/i18n';

interface UserState {
  user: User | null;
  isAuthenticated: boolean;

  // actions
  loginFromBackend: (dto: UserDto) => void;
  setProfile: (nickname: string, riderStyle: RiderStyle) => void;
  logout: () => void;
  addExp: (levelExp: number, xpPoints: number) => void;
  addGold: (gold: number) => void;
  spendXp: (xp: number) => boolean;
  setLanguage: (lang: Language) => void;
  investSkill: (key: SkillKey) => boolean;
}

function dtoToUser(dto: UserDto): User {
  const language = (i18n.language as Language) || 'vi';
  return {
    id: dto.id,
    phone: dto.phone,
    nickname: dto.nickname ?? '',
    riderStyle: (dto.rider_type as RiderStyle) ?? 'night_rider',
    avatarUrl: dto.avatar_url ?? undefined,
    level: dto.level,
    levelExp: dto.exp,
    xpPoints: dto.xp,
    gold: dto.gold,
    skillPoints: dto.skill_pt,
    language,
    skills: { distance_rider: 0, gold_hunter: 0, safe_rider: 0 },
  };
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      loginFromBackend: (dto) => {
        set({ user: dtoToUser(dto), isAuthenticated: true });
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
        set({ user: { ...u, levelExp: u.levelExp + levelExp, xpPoints: u.xpPoints + xpPoints } });
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
        changeLang(language);
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
