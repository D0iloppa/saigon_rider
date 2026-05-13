import { create } from 'zustand';
import type { SafetyGrade, Quest } from '@/api/types';

interface RideState {
  // 현재 라이딩
  isActive: boolean;
  isPaused: boolean;
  questId: string | null;
  questTitle: string | null;
  targetDistanceM: number;
  startedAt: number | null;       // timestamp
  pausedTotalMs: number;          // 누적 일시정지 시간
  pausedAt: number | null;

  // 실시간 측정값
  distanceM: number;
  durationSec: number;
  speedKmh: number;
  avgSpeedKmh: number;
  safetyGrade: SafetyGrade;

  // 시뮬레이션 인터벌
  _intervalId: number | null;

  // actions
  startRide: (quest: Quest) => void;
  pauseRide: () => void;
  resumeRide: () => void;
  abandonRide: () => void;
  completeRide: () => 'success' | 'failed';
  tick: () => void;
  reset: () => void;
}

const INITIAL: Omit<
  RideState,
  | 'startRide'
  | 'pauseRide'
  | 'resumeRide'
  | 'abandonRide'
  | 'completeRide'
  | 'tick'
  | 'reset'
> = {
  isActive: false,
  isPaused: false,
  questId: null,
  questTitle: null,
  targetDistanceM: 0,
  startedAt: null,
  pausedTotalMs: 0,
  pausedAt: null,
  distanceM: 0,
  durationSec: 0,
  speedKmh: 0,
  avgSpeedKmh: 0,
  safetyGrade: 'A',
  _intervalId: null,
};

export const useRideStore = create<RideState>((set, get) => ({
  ...INITIAL,

  startRide: (quest) => {
    const prev = get();
    if (prev._intervalId) window.clearInterval(prev._intervalId);
    const id = window.setInterval(() => get().tick(), 1000);
    set({
      ...INITIAL,
      isActive: true,
      isPaused: false,
      questId: quest.id,
      questTitle: quest.title,
      targetDistanceM: quest.minDistanceM,
      startedAt: Date.now(),
      _intervalId: id,
    });
  },

  pauseRide: () => {
    set({ isPaused: true, pausedAt: Date.now() });
  },

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
    if (s._intervalId) window.clearInterval(s._intervalId);
    set({ ...INITIAL });
  },

  completeRide: () => {
    const s = get();
    if (s._intervalId) window.clearInterval(s._intervalId);
    const result: 'success' | 'failed' =
      s.distanceM >= s.targetDistanceM ? 'success' : 'failed';
    set({ isActive: false, isPaused: false, _intervalId: null });
    return result;
  },

  tick: () => {
    const s = get();
    if (!s.isActive || s.isPaused || !s.startedAt) return;

    const elapsedMs = Date.now() - s.startedAt - s.pausedTotalMs;
    const durationSec = Math.floor(elapsedMs / 1000);

    // 시뮬레이션: 평균 30~40km/h, 살짝 변동
    // 1초당 평균 9~11미터 진행
    const incrementM = 8 + Math.random() * 4;
    const distanceM = Math.min(s.distanceM + incrementM, s.targetDistanceM * 1.2);
    const speedKmh = Math.round((incrementM * 3.6) * 10) / 10 + 20;
    const avgSpeedKmh =
      durationSec > 0 ? Math.round((distanceM / durationSec) * 3.6 * 10) / 10 : 0;

    // 안전 등급: 시간이 지날수록 약간씩 변동
    let safetyGrade: SafetyGrade = s.safetyGrade;
    if (Math.random() < 0.02) {
      const r = Math.random();
      safetyGrade = r > 0.85 ? 'C' : r > 0.55 ? 'B' : 'A';
    }

    set({ distanceM, durationSec, speedKmh, avgSpeedKmh, safetyGrade });
  },

  reset: () => {
    const s = get();
    if (s._intervalId) window.clearInterval(s._intervalId);
    set({ ...INITIAL });
  },
}));
