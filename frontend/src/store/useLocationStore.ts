import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/lib/i18n';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { inServiceArea } from '@/lib/serviceArea';
import { wardRegionAt } from '@/components/maps/v2/wardRegions';
import { BEN_THANH_FALLBACK } from '@/lib/mapDefaults';
import { useConfirmStore } from '@/store/useConfirmStore';

/**
 * 앱 전체 위치 컨텍스트 — 단일 SoT (대표 지시 2026-08-06 "기본을 다 GPS로 / 안잡히면 전체지역으로").
 *
 * 2모드뿐이다: 'gps'(내 현재 위치 반경 NEARBY_RADIUS_KM) ↔ 'all'(전체 지역).
 * 종전의 'region'(사용자가 고른 동)은 폐기됐다 — 화면마다 기준이 갈려 홈/마켓/동네지도/정보가
 * 서로 다른 지역을 보여주던 원인이었다(설계도 ai-docs/260806_gps_scope_unification_design.md §1).
 *
 * 좌표(coords)는 **persist 하지 않는다.** 모드만 기억하고 좌표는 세션마다 새로 측위한다 —
 * 어제 좌표로 오늘의 "근처"를 계산하면 헤더와 목록이 어긋나는 회귀가 재발한다.
 */

/** 'gps' 모드에서 "근처"로 볼 반경 (km). 대표 확정 2026-08-06. */
export const NEARBY_RADIUS_KM = 3;

export type LocationMode = 'gps' | 'all';

/** 위치 권한에 대한 사용자 의사 — 프리프롬프트를 다시 띄울지 판단한다. */
export type PermissionIntent = 'undecided' | 'granted' | 'declined';

/**
 * 기준 좌표의 출처.
 * 'device'   — 실측 좌표.
 * 'fallback' — 서비스 권역(37개 동) 밖이라 중심가(Bến Thành) 좌표로 대체됨.
 *              화면은 이 값을 보고 라벨을 정직하게 써야 한다 — 권역 밖인데 "내 현재 위치"라고
 *              표기하면 사용자가 결과를 오해한다(UX 감사 P1 "위치 출처 은폐").
 */
export type CoordsSource = 'device' | 'fallback';

export interface Coords {
  lat: number;
  lng: number;
}

interface LocationState {
  /** persist 됨 — 앱을 껐다 켜도 사용자가 고른 모드는 유지된다. */
  mode: LocationMode;
  /** persist 안 됨 — 세션마다 재측위. */
  coords: Coords | null;
  /** 표시 라벨 전용. 필터 판정에는 절대 쓰지 않는다(판정은 coords 반경). */
  wardName: string | null;
  /** coords 의 출처. mode==='all' 이면 null. */
  coordsSource: CoordsSource | null;
  /** persist 됨 — 'declined' 면 프리프롬프트를 다시 띄우지 않는다. */
  permissionIntent: PermissionIntent;
  resolving: boolean;

  /**
   * 측위를 시도해 mode/coords 를 확정한다. 세션당 실측 1회 — 이미 좌표가 있으면 즉시 반환하고,
   * 동시 호출은 같은 Promise 를 공유한다(화면 5개가 각자 진입하며 호출해도 측위는 한 번).
   */
  ensureLocation: () => Promise<void>;
  /** 표시범위 시트의 2옵션이 호출. 'gps' 선택 시 측위를 재시도한다. */
  setMode: (mode: LocationMode) => Promise<void>;
  /**
   * 이동 추종 시작 — 앱 전역에서 **한 번만** 호출한다(App.tsx). 반환값은 해제 함수.
   * 화면마다 호출하면 워처가 중복된다.
   */
  startWatching: () => () => void;
  setPermissionIntent: (intent: PermissionIntent) => void;
  setWardName: (name: string | null) => void;
  /** 로그아웃 시 — 모드/좌표/권한의사 전부 초기화. */
  clearLocation: () => void;
}

/** 세션당 1회 규칙을 지키기 위한 in-flight 공유 Promise. */
let inflight: Promise<void> | null = null;
/** 이동 추종 워처 해제 함수 — 앱 전역 1개만 돈다. */
let watchStop: (() => void) | null = null;

/**
 * 이동으로 인정할 최소 이동 거리(m).
 *
 * GPS 는 정지 상태에서도 수 m 씩 튄다. 그대로 스토어에 반영하면 coords 를 deps 로 쓰는
 * 목록·지도 조회가 계속 재발화한다. 반경이 3km 인 만큼 30m 이하 흔들림은 결과를 바꾸지
 * 않으므로 무시한다(오토바이 주행 속도에서는 1초 안에 넘는 값이라 추종성은 유지된다).
 */
const WATCH_MIN_MOVE_M = 30;

/** 두 좌표 사이 거리(m) — haversine. 워처 게이트 판정 전용. */
function distanceM(a: Coords, b: Coords): number {
  const R = 6371e3;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** 폴백 토스트 세션당 1회 — 화면 5개가 각자 띄우면 폭탄이 된다. */
let fallbackToastShown = false;

/**
 * 시스템 권한창을 띄우기 **전에** 목적을 먼저 알리는 자체 프리프롬프트.
 *
 * 표시 범위 기본값이 GPS 가 되면서 앱 진입만으로 권한창이 뜨게 됐다 — 맥락 없이 뜨는
 * 시스템 창은 반사적 거부를 부르고, 한 번 거부되면 앱에서 되돌릴 수 없다. 그래서 권한이
 * **아직 미결정('prompt')일 때만** 한 번 물어본다. (설계도 §5)
 *
 * @returns true = 시스템 권한창으로 진행, false = "나중에"(전체 지역으로)
 */
function preflightPermission(): Promise<boolean> {
  // 이미 허용/거부가 결정된 상태면 묻지 않는다 — 결정된 값대로 흘러가면 된다.
  // (거부 상태면 아래 native 호출이 실패해 catch 의 'all' 폴백으로 간다.)
  return native
    .checkLocationPermission()
    .catch(() => 'prompt' as const)
    .then((status) => {
      if (status !== 'prompt') return true;
      return new Promise<boolean>((resolve) => {
        useConfirmStore.getState().open(
          {
            mode: 'code',
            value: 'map.permissionRationale',
          },
          () => resolve(true),
          {
            confirmLabel: { mode: 'code', value: 'map.permissionAllow' },
            cancelLabel: { mode: 'code', value: 'map.permissionLater' },
          },
        );
        // 취소(백드롭 탭·ESC 포함)로 닫히면 onConfirm 이 호출되지 않는다 — isOpen 이
        // 내려가는 것을 구독해 "나중에"로 확정한다. ConfirmDialog 는 확인 시에도 close()
        // 를 부르므로, 이미 resolve(true) 된 뒤의 이 resolve(false)는 무시된다(Promise 특성).
        const unsub = useConfirmStore.subscribe((s) => {
          if (!s.isOpen) { unsub(); resolve(false); }
        });
      });
    });
}

/** 측위 실패 사유별 안내. 실패는 항상 'all' 폴백으로 귀결된다(대표 지시). */
function notifyFallback(messageKey: string, defaultValue: string) {
  if (fallbackToastShown) return;
  fallbackToastShown = true;
  toast.neutral(i18n.t(messageKey, { defaultValue }));
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      mode: 'gps',
      coords: null,
      wardName: null,
      coordsSource: null,
      permissionIntent: 'undecided',
      resolving: false,

      ensureLocation: () => {
        const state = get();
        // 이미 이번 세션에 측위가 끝났으면 재측위하지 않는다.
        if (state.mode === 'gps' && state.coords) return Promise.resolve();
        // 사용자가 명시적으로 '전체 지역'을 고른 상태면 측위 자체를 시도하지 않는다.
        if (state.mode === 'all' && state.permissionIntent === 'declined') return Promise.resolve();
        if (inflight) return inflight;

        set({ resolving: true });
        inflight = preflightPermission()
          .then((allowed) => {
            if (!allowed) {
              // 프리프롬프트에서 "나중에" — 시스템 권한창을 띄우지 않고 전체 지역으로 간다.
              set({ mode: 'all', coords: null, wardName: null, coordsSource: null, permissionIntent: 'declined' });
              return null;
            }
            return native.ensureLocationPermission().then(() => native.getLocation());
          })
          .then((pos) => {
            if (!pos) return; // 프리프롬프트 거절 — 위에서 이미 'all' 로 확정했다
            if (!inServiceArea(pos.lat, pos.lng)) {
              // 서비스 권역(37개 동) 밖 — **측위 실패와는 다른 사건이다.** 어디 있는지는
              // 알지만 서비스 범위 밖일 뿐이므로, 기존과 동일하게 알리고 중심가로 안내한다
              // (대표 확인 2026-08-06). 전체 지역으로 떨어뜨리지 않는다 — mode 는 'gps' 를
              // 유지해 반경 3km 필터가 그대로 걸리고, 목록이 비지 않는다.
              // coordsSource:'fallback' 으로 표시해 화면이 "내 현재 위치"라고 쓰지 않게 한다.
              set({
                mode: 'gps',
                coords: { ...BEN_THANH_FALLBACK },
                coordsSource: 'fallback',
                wardName: null,
                permissionIntent: 'granted',
              });
              notifyFallback(
                'map.outsideArea',
                '서비스 지역(호치민 중심 37개 동) 밖이에요 · 중심가를 기준으로 보여드려요',
              );
              return;
            }
            set({
              mode: 'gps',
              coords: { lat: pos.lat, lng: pos.lng },
              coordsSource: 'device',
              // 라벨은 여기서 한 번에 정한다 — 화면마다 각자 해석하면 홈만 동네명이 뜨고
              // 마켓·동네지도는 '내 현재 위치' 폴백이 뜨는 비대칭이 생긴다(2026-08-06 발견).
              // 오프라인 폴리곤이라 API 호출이 없다. 37개 동 밖이면 null(라벨 없음).
              wardName: wardRegionAt(pos.lat, pos.lng)?.name ?? null,
              permissionIntent: 'granted',
            });
          })
          .catch((err: unknown) => {
            // 측위 실패 — 어디 있는지 모르므로 전체 지역 외에 줄 수 있는 게 없다.
            // (권역밖과 달리 중심가로 보내면 "왜 여기냐"는 근거가 없다.)
            const code = (err as { code?: number } | null)?.code;
            set({ mode: 'all', coords: null, wardName: null, coordsSource: null });
            if (code === 1) {
              set({ permissionIntent: 'declined' });
              notifyFallback('map.listFirst.nearMeDenied', '위치 권한이 없어 전체 지역을 보여드려요');
            } else if (code === 3) {
              notifyFallback('map.listFirst.nearMeTimeout', '위치를 잡지 못해 전체 지역을 보여드려요');
            } else {
              notifyFallback('map.listFirst.nearMeUnavailable', '위치를 사용할 수 없어 전체 지역을 보여드려요');
            }
          })
          .finally(() => {
            inflight = null;
            set({ resolving: false });
          });

        return inflight;
      },

      setMode: (mode) => {
        if (mode === 'all') {
          set({ mode: 'all', coords: null, wardName: null, coordsSource: null });
          return Promise.resolve();
        }
        // 'gps' 재선택은 사용자의 명시적 의사 — 이전에 거부했더라도 다시 시도한다.
        set({ mode: 'gps', permissionIntent: 'undecided' });
        fallbackToastShown = false;
        return get().ensureLocation();
      },

      startWatching: () => {
        // 'gps' 모드일 때만 의미가 있다. 'all' 은 좌표를 안 쓰므로 워처를 돌릴 이유가 없다.
        if (get().mode !== 'gps') return () => {};
        if (watchStop) return watchStop; // 이미 돌고 있으면 그대로 재사용(중복 방지)

        const stop = native.watchLocation((pos) => {
          const prev = get();
          if (prev.mode !== 'gps') return;
          if (!inServiceArea(pos.lat, pos.lng)) return; // 권역 밖 이동은 무시(마지막 유효 위치 유지)
          // **거리 게이트** — GPS 는 가만히 있어도 몇 m 씩 흔들린다. 그대로 반영하면 목록·지도
          // 조회가 초당 몇 번씩 재발화한다. WATCH_MIN_MOVE_M 이상 움직였을 때만 갱신한다.
          if (prev.coords && distanceM(prev.coords, pos) < WATCH_MIN_MOVE_M) return;
          set({
            coords: { lat: pos.lat, lng: pos.lng },
            coordsSource: 'device',
            wardName: wardRegionAt(pos.lat, pos.lng)?.name ?? null,
          });
        });

        watchStop = () => { stop(); watchStop = null; };
        return watchStop;
      },

      setPermissionIntent: (permissionIntent) => set({ permissionIntent }),
      setWardName: (wardName) => set({ wardName }),
      clearLocation: () => {
        if (watchStop) watchStop();
        inflight = null;
        fallbackToastShown = false;
        set({ mode: 'gps', coords: null, wardName: null, coordsSource: null, permissionIntent: 'undecided' });
      },
    }),
    {
      name: 'saigon-rider-location',
      // v3(mode:'all'|'region' + region/accountId/location) → v4(mode:'gps'|'all'). 구버전 값이
      // 남아 있으면 mode:'region' 이 그대로 복원돼 첫 진입이 깨지므로 통째로 버린다.
      version: 4,
      migrate: () => ({
        mode: 'gps' as LocationMode,
        permissionIntent: 'undecided' as PermissionIntent,
      }),
      partialize: (state) => ({
        mode: state.mode,
        permissionIntent: state.permissionIntent,
      }),
    },
  ),
);
