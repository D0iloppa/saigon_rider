import { create } from 'zustand';
import type { SafetyGrade, Quest } from '@/api/types';
import { fetchActiveCard } from '@/api/quests';
import { native as NativeInterface } from '@/lib/native';

interface RideState {
  isActive: boolean;
  isPaused: boolean;
  questId: string | null;
  questTitle: string | null;
  userQuestId: string | null;

  cardType: 'DISTANCE' | 'CHECKPOINT';
  targetDistanceM: number;
  targetLat: number | null;
  targetLng: number | null;

  startedAt: number | null;
  pausedTotalMs: number;
  pausedAt: number | null;

  distanceM: number;
  durationSec: number;
  speedKmh: number;
  avgSpeedKmh: number;
  safetyGrade: SafetyGrade;

  currentLat: number | null;
  currentLng: number | null;
  distanceToTargetM: number | null;
  reachedTarget: boolean;

  _pollId: number | null;
  _durationId: number | null;
  _stopGeoWatch: (() => void) | null;

  startRide: (quest: Quest, userQuestId: string) => void;
  pauseRide: () => void;
  resumeRide: () => void;
  abandonRide: () => void;
  completeRide: () => 'success' | 'failed';
  reset: () => void;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const INITIAL: Omit<
  RideState,
  'startRide' | 'pauseRide' | 'resumeRide' | 'abandonRide' | 'completeRide' | 'reset'
> = {
  isActive: false,
  isPaused: false,
  questId: null,
  questTitle: null,
  userQuestId: null,
  cardType: 'DISTANCE',
  targetDistanceM: 0,
  targetLat: null,
  targetLng: null,
  startedAt: null,
  pausedTotalMs: 0,
  pausedAt: null,
  distanceM: 0,
  durationSec: 0,
  speedKmh: 0,
  avgSpeedKmh: 0,
  safetyGrade: 'A',
  currentLat: null,
  currentLng: null,
  distanceToTargetM: null,
  reachedTarget: false,
  _pollId: null,
  _durationId: null,
  _stopGeoWatch: null,
};

const POLL_INTERVAL_MS = 3000;
const CHECKPOINT_PROXIMITY_M = 100;

export const useRideStore = create<RideState>((set, get) => ({
  ...INITIAL,

  startRide: (quest, userQuestId) => {
    const prev = get();
    if (prev._pollId) window.clearInterval(prev._pollId);
    if (prev._durationId) window.clearInterval(prev._durationId);
    if (prev._stopGeoWatch) prev._stopGeoWatch();

    const cardType: 'DISTANCE' | 'CHECKPOINT' = quest.cardType ?? 'DISTANCE';
    const targetLat = quest.targetLat ?? null;
    const targetLng = quest.targetLng ?? null;

    set({
      ...INITIAL,
      isActive: true,
      isPaused: false,
      questId: quest.id,
      questTitle: quest.title,
      userQuestId,
      cardType,
      targetDistanceM: quest.minDistanceM,
      targetLat,
      targetLng,
      startedAt: Date.now(),
    });

    NativeInterface.startGPS();

    const lastSampleRef = { distanceM: 0, ts: Date.now() };
    const pollId = window.setInterval(async () => {
      const s = get();
      if (!s.isActive || s.isPaused || !s.userQuestId) return;
      const card = await fetchActiveCard(s.userQuestId);
      if (!card) return;

      const now = Date.now();
      const newDist = card.current_distance_m ?? 0;
      const dtSec = Math.max(1, (now - lastSampleRef.ts) / 1000);
      const speedKmh = Math.max(0, ((newDist - lastSampleRef.distanceM) / dtSec) * 3.6);
      lastSampleRef.distanceM = newDist;
      lastSampleRef.ts = now;

      const elapsedSec = Math.max(1, (now - (s.startedAt ?? now) - s.pausedTotalMs) / 1000);
      const avgSpeedKmh = (newDist / elapsedSec) * 3.6;

      set({
        distanceM: newDist,
        speedKmh: Math.round(speedKmh * 10) / 10,
        avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
      });

      if (card.status === 'COMPLETED' && !s.reachedTarget) {
        set({ reachedTarget: true });
      }
    }, POLL_INTERVAL_MS);

    const durationId = window.setInterval(() => {
      const s = get();
      if (!s.isActive || s.isPaused || !s.startedAt) return;
      const elapsedMs = Date.now() - s.startedAt - s.pausedTotalMs;
      set({ durationSec: Math.floor(elapsedMs / 1000) });
    }, 1000);

    let stopGeoWatch: (() => void) | null = null;
    if (cardType === 'CHECKPOINT' && targetLat != null && targetLng != null) {
      stopGeoWatch = NativeInterface.watchLocation((loc) => {
        const dist = haversineM(loc.lat, loc.lng, targetLat, targetLng);
        set({
          currentLat: loc.lat,
          currentLng: loc.lng,
          distanceToTargetM: Math.round(dist),
        });
      });
    }

    set({ _pollId: pollId, _durationId: durationId, _stopGeoWatch: stopGeoWatch });
  },

  pauseRide: () => set({ isPaused: true, pausedAt: Date.now() }),

  resumeRide: () => {
    const s = get();
    if (!s.pausedAt) {
      set({ isPaused: false });
      return;
    }
    set({
      isPaused: false,
      pausedAt: null,
      pausedTotalMs: s.pausedTotalMs + (Date.now() - s.pausedAt),
    });
  },

  abandonRide: () => {
    const s = get();
    if (s._pollId) window.clearInterval(s._pollId);
    if (s._durationId) window.clearInterval(s._durationId);
    if (s._stopGeoWatch) s._stopGeoWatch();
    NativeInterface.stopGPS();
    set({ ...INITIAL });
  },

  completeRide: () => {
    const s = get();
    if (s._pollId) window.clearInterval(s._pollId);
    if (s._durationId) window.clearInterval(s._durationId);
    if (s._stopGeoWatch) s._stopGeoWatch();
    NativeInterface.stopGPS();

    const result: 'success' | 'failed' =
      s.cardType === 'CHECKPOINT'
        ? s.reachedTarget
          ? 'success'
          : 'failed'
        : s.distanceM >= s.targetDistanceM
          ? 'success'
          : 'failed';

    set({ isActive: false, isPaused: false, _pollId: null, _durationId: null, _stopGeoWatch: null });
    return result;
  },

  reset: () => {
    const s = get();
    if (s._pollId) window.clearInterval(s._pollId);
    if (s._durationId) window.clearInterval(s._durationId);
    if (s._stopGeoWatch) s._stopGeoWatch();
    NativeInterface.stopGPS();
    set({ ...INITIAL });
  },
}));

export { CHECKPOINT_PROXIMITY_M };
