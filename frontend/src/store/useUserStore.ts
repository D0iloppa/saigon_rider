import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, RiderStyle, Language, SkillKey } from '@/api/types';
import type { UserDto } from '@/api/auth';
import { apiGetMe } from '@/api/auth';
import i18n, { changeLang } from '@/lib/i18n';

interface UserState {
  user: User | null;
  passcode: string | null;
  isAuthenticated: boolean;

  // actions
  loginFromBackend: (dto: UserDto, passcode?: string) => void;
  refreshUser: () => Promise<void>;
  setProfile: (nickname: string, riderStyle: RiderStyle) => void;
  updateNickname: (nickname: string) => void;
  updateAvatar: (avatarUrl: string) => void;
  logout: () => void;
  addExp: (levelExp: number, xpPoints: number) => void;
  addGold: (gold: number) => void;
  spendXp: (xp: number) => boolean;
  setLanguage: (lang: Language) => void;
  investSkill: (key: SkillKey) => boolean;
}

function extractRiderStyle(rt: UserDto['rider_type']): RiderStyle {
  if (!rt) return 'night_rider';
  const code = typeof rt === 'string' ? rt : rt.code;
  return code.toLowerCase() as RiderStyle;
}

function dtoToUser(dto: UserDto): User {
  const language = (i18n.language as Language) || 'vi';
  return {
    id: dto.id,
    phone: dto.phone,
    nickname: dto.nickname ?? '',
    riderStyle: extractRiderStyle(dto.rider_type),
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
      passcode: null,
      isAuthenticated: false,

      loginFromBackend: (dto, passcode) => {
        set({
          user: dtoToUser(dto),
          isAuthenticated: true,
          ...(passcode !== undefined ? { passcode } : {}),
        });
      },

      refreshUser: async () => {
        const u = get().user;
        if (!u) return;
        try {
          const res = await apiGetMe(u.phone);
          set({ user: dtoToUser(res.user) });
        } catch {
          // silent fail
        }
      },

      setProfile: (nickname, riderStyle) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, nickname, riderStyle } });
      },

      updateNickname: (nickname) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, nickname } });
      },

      updateAvatar: (avatarUrl) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, avatarUrl } });
      },

      logout: () => {
        set({ user: null, passcode: null, isAuthenticated: false });
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
