import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, RiderStyle, Language, SkillKey } from '@/api/types';
import type { UserDto } from '@/api/auth';
import { apiGetMe, apiGetMeById, apiInvestSkill } from '@/api/auth';
import { apiRegisterDeviceMap, apiUnregisterDeviceMap } from '@/api/device';
import i18n, { changeLang } from '@/lib/i18n';
import { native } from '@/lib/native';
import { clearSession, loadSession } from '@/lib/session';
import { useLocationStore } from '@/store/useLocationStore';

interface UserState {
  user: User | null;
  isAuthenticated: boolean;

  // actions
  loginFromBackend: (dto: UserDto) => void;
  refreshUser: () => Promise<void>;
  setProfile: (nickname: string, riderStyle: RiderStyle) => void;
  updateNickname: (nickname: string) => void;
  updateAvatar: (avatarUrl: string) => void;
  markPhoneVerified: (phone: string) => void;
  logout: () => void;
  addExp: (levelExp: number, xpPoints: number) => void;
  addGold: (gold: number) => void;
  spendXp: (xp: number) => boolean;
  setLanguage: (lang: Language) => void;
  investSkill: (key: SkillKey) => Promise<boolean>;
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
    phoneVerified: dto.phone_verified ?? false,
    nickname: dto.nickname ?? '',
    riderStyle: extractRiderStyle(dto.rider_type),
    avatarUrl: dto.avatar_url ?? undefined,
    level: dto.level,
    levelExp: dto.exp,
    xpPoints: dto.xp,
    gold: dto.gold,
    skillPoints: dto.skill_pt,
    mannerTemp: dto.manner_temp ?? 36.5,
    language,
    skills: dto.skills ?? { distance_rider: 0, gold_hunter: 0, quest_slot: 0, cost_discount: 0, mileage_rate: 0 },
    createdAt: dto.created_at,
  };
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      loginFromBackend: (dto) => {
        if (get().user?.id !== dto.id) {
          useLocationStore.getState().clearLocation();
        }
        set({
          user: dtoToUser(dto),
          isAuthenticated: true,
        });

        native.getDeviceUUID()
          .then(async (uuid) => {
            if (!uuid) {
              console.warn('[device-map] getDeviceUUID empty — skip register', {
                isNative: native.isNative,
                platform: native.platform,
              });
              return;
            }
            const fcmToken = await native.getFCMToken().catch(() => '');
            apiRegisterDeviceMap(uuid, fcmToken || undefined)
              .then(() => console.info('[device-map] registered', uuid))
              .catch((e) => console.warn('[device-map] register failed', e));
          })
          .catch((e) => console.error('[device-map] getDeviceUUID threw', e));
      },

      refreshUser: async () => {
        const u = get().user;
        if (!u) return;
        try {
          const res = u.phone ? await apiGetMe(u.phone) : await apiGetMeById(u.id);
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

      // OTP 검증 성공 응답(phone, phone_verified)을 그대로 store 에 반영 — 재조회 없이 즉시 갱신
      markPhoneVerified: (phone) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, phone, phoneVerified: true } });
      },

      logout: () => {
        const session = loadSession();
        if (session) {
          native.getDeviceUUID()
            .then((uuid) => uuid && apiUnregisterDeviceMap(uuid, session))
            .catch((e) => console.warn('[device-map] unregister failed', e));
        }
        if (native.isNative) {
          native.stopGPS();
        }
        clearSession();
        useLocationStore.getState().clearLocation();
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

      investSkill: async (key) => {
        const u = get().user;
        // SGR-280: 스킬은 0~9 서브포인트(단계=//3). 클릭당 1 SP, 9에서 만렙.
        if (!u || u.skillPoints < 1 || u.skills[key] >= 9) return false;
        try {
          const dto = await apiInvestSkill(u.id, key);
          set({ user: dtoToUser(dto) });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'saigon-rider-user',
    }
  )
);
