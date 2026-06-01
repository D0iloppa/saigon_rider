import { create } from 'zustand';
import type { SafetyGrade, Quest } from '@/api/types';
import { fetchActiveCard, fetchRidePolicy } from '@/api/quests';
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

  policyProximityM: number;
  policyBands: Array<{ code: string; thresholdM: number }>;

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
  policyProximityM: 100,
  policyBands: [
    { code: 'BAND_5KM', thresholdM: 5000 },
    { code: 'BAND_1KM', thresholdM: 1000 },
  ],
  _pollId: null,
  _durationId: null,
  _stopGeoWatch: null,
};

const POLL_INTERVAL_MS = 3000;

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

    fetchRidePolicy()
      .then((policy) => {
        set({
          policyProximityM: policy.checkpointProximityM,
          policyBands: policy.checkpointDistanceBands,
        });
      })
      .catch(() => {
        // 폴백은 INITIAL 의 기본값 유지
      });

    const pollId = window.setInterval(async () => {
      const s = get();
      if (!s.isActive || s.isPaused || !s.userQuestId) return;
      const card = await fetchActiveCard(s.userQuestId);
      if (!card) return;

      const now = Date.now();
      const newDist = card.current_distance_m ?? 0;
      const elapsedSec = Math.max(1, (now - (s.startedAt ?? now) - s.pausedTotalMs) / 1000);
      const avgSpeedKmh = (newDist / elapsedSec) * 3.6;

      const next: Partial<RideState> = {
        distanceM: newDist,
        speedKmh: card.last_speed_kmh ?? 0,
        avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
        distanceToTargetM: card.distance_to_target_m,
        currentLat: card.last_lat,
        currentLng: card.last_lng,
      };
      set(next);

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

    set({ _pollId: pollId, _durationId: durationId, _stopGeoWatch: null });
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

