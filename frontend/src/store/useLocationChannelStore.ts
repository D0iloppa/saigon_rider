import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LocationChannelEnvelope, LocationChannelState, LocationEventPayload } from '@/api/locationChannel';

/**
 * 실시간 위치공유 채널의 앱 전역 상태 (Phase 1 — 앱당 채널 1개).
 *
 * 워키토키 버블 스토어와 같은 이유로 앱 전역: 플로팅 🗺️ 버튼은 DM 화면을 떠나도 유지된다.
 * persist 는 `{conversationId, channelId}` 만 — 재기동 시 런타임(useLiveLocationChannelRuntime)이
 * GET 으로 복원하고, 404/403/종료면 정리한다. 좌표·참가자는 휘발(서버가 정합성 기준선).
 */
interface LocationChannelStoreState {
  conversationId: string | null;
  channelId: string | null;
  /** 최신 채널 스냅샷 — GET/POST/PUT 응답 또는 SSE 로 갱신. 복원 전엔 null. */
  state: LocationChannelState | null;
  /** SSE 연결 여부(모달 상태 표시용). */
  connected: boolean;
  modalOpen: boolean;

  /** 채널 생성/참가 성공 시 — 스냅샷을 그대로 채택한다. */
  setChannel: (state: LocationChannelState) => void;
  /** GET/PUT 응답으로 전량 교체. */
  applyState: (state: LocationChannelState) => void;
  /** SSE 이벤트 낙관 반영. `channel_ended` 는 호출부가 clear() 로 처리. */
  applyEvent: (ev: LocationChannelEnvelope) => void;
  setConnected: (v: boolean) => void;
  setModalOpen: (v: boolean) => void;
  /** 나가기/종료/복원 실패 — 전부 초기화(플로팅 버튼 소멸). */
  clear: () => void;
}

export const useLocationChannelStore = create<LocationChannelStoreState>()(
  persist(
    (set, get) => ({
      conversationId: null,
      channelId: null,
      state: null,
      connected: false,
      modalOpen: false,
      setChannel: (state) => set({ conversationId: state.conversationId, channelId: state.id, state }),
      applyState: (state) => set({ state, channelId: state.id }),
      applyEvent: (ev) => {
        const cur = get().state;
        if (!cur || ev.channelId !== cur.id) return;
        const p = ev.payload ?? {};
        switch (ev.type) {
          case 'location': {
            const loc = p as LocationEventPayload;
            set({
              state: {
                ...cur,
                members: cur.members.map((m) =>
                  m.userId === loc.userId
                    ? {
                        ...m,
                        lat: loc.lat,
                        lng: loc.lng,
                        accuracyM: loc.accuracyM ?? null,
                        heading: loc.heading ?? null,
                        speedMps: loc.speedMps ?? null,
                        locatedAt: loc.locatedAt ?? ev.at,
                      }
                    : m,
                ),
              },
            });
            return;
          }
          case 'member_left': {
            const uid: string | undefined = p.userId ?? ev.actorId;
            if (!uid) return;
            // 이탈 즉시 좌표 삭제(§7-3) — dot 소멸.
            set({
              state: {
                ...cur,
                members: cur.members.map((m) =>
                  m.userId === uid ? { ...m, lat: null, lng: null, locatedAt: null, leftAt: ev.at } : m,
                ),
              },
            });
            return;
          }
          case 'member_joined': {
            const uid: string | undefined = p.userId ?? ev.actorId;
            if (!uid) return;
            const exists = cur.members.some((m) => m.userId === uid);
            set({
              state: {
                ...cur,
                members: exists
                  ? cur.members.map((m) => (m.userId === uid ? { ...m, leftAt: null } : m))
                  : [
                      ...cur.members,
                      {
                        userId: uid,
                        nickname: p.nickname ?? '',
                        avatarUrl: p.avatarUrl ?? null,
                        lat: null,
                        lng: null,
                        accuracyM: null,
                        heading: null,
                        speedMps: null,
                        locatedAt: null,
                        arrivedAt: null,
                        etaS: null,
                        distanceM: null,
                        leftAt: null,
                      },
                    ],
              },
            });
            return;
          }
          case 'arrived': {
            const uid: string | undefined = p.userId ?? ev.actorId;
            if (!uid) return;
            set({
              state: {
                ...cur,
                members: cur.members.map((m) => (m.userId === uid ? { ...m, arrivedAt: p.arrivedAt ?? ev.at } : m)),
              },
            });
            return;
          }
          case 'dest_set': {
            const dest = p.dest ?? (typeof p.lat === 'number' ? { lat: p.lat, lng: p.lng, name: p.name ?? null } : null);
            if (dest) set({ state: { ...cur, dest } });
            return;
          }
          default:
            return;
        }
      },
      setConnected: (v) => set({ connected: v }),
      setModalOpen: (v) => set({ modalOpen: v }),
      clear: () => set({ conversationId: null, channelId: null, state: null, connected: false, modalOpen: false }),
    }),
    {
      name: 'saigon-rider-location-channel',
      partialize: (s) => ({ conversationId: s.conversationId, channelId: s.channelId }),
    },
  ),
);
