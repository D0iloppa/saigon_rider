import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchLocationChannel,
  httpStatusOf,
  locationChannelEventsUrl,
  locationChannelSseHeaders,
  putLocationChannelLocation,
  type LocationChannelEnvelope,
  type LocationChannelState,
} from '@/api/locationChannel';
import { startReconnectingStream } from '@/lib/sse/reconnectingStream';
import { useLocationChannelStore } from '@/store/useLocationChannelStore';
import { useLocationStore } from '@/store/useLocationStore';
import { GPS_ACCURACY_LIMIT_M } from '@/lib/serviceLocation';
import { toast } from '@/components/ui/Toast';

/** 채널 전용 ping 게이트(M-5) — 10초 + 10m. 전역 워처(30m)와 별개로 추가로 건다. */
const PING_MIN_INTERVAL_MS = 10_000;
const PING_MIN_MOVE_M = 10;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 실시간 위치공유 채널 런타임 — 앱 전역 1곳(플로팅 버튼)에서만 호출한다.
 *
 * 1. 복원/재동기화: `conversationId` 가 생기면 GET 으로 스냅샷. 404/403/종료면 스토어 정리.
 * 2. SSE: `snapshot` → 전량 교체, `channel_ended` → 정리, 나머지 → 낙관 반영. (재)연결마다 GET 재동기화.
 * 3. 위치 ping: `useLocationStore` 전역 워처 구독 + 10초/10m 게이트 + 정확도 35m 게이트. GPS 직접 호출 없음.
 */
export function useLiveLocationChannelRuntime() {
  const { t } = useTranslation();
  const conversationId = useLocationChannelStore((s) => s.conversationId);
  const channelId = useLocationChannelStore((s) => s.channelId);
  const applyState = useLocationChannelStore((s) => s.applyState);
  const applyEvent = useLocationChannelStore((s) => s.applyEvent);
  const setConnected = useLocationChannelStore((s) => s.setConnected);
  const clear = useLocationChannelStore((s) => s.clear);

  const coords = useLocationStore((s) => s.coords);
  const coordsAccuracyM = useLocationStore((s) => s.coordsAccuracyM);
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  const setMode = useLocationStore((s) => s.setMode);
  const startWatching = useLocationStore((s) => s.startWatching);

  const lastPingRef = useRef<{ at: number; coords: { lat: number; lng: number } } | null>(null);

  // 1+2. 스냅샷 복원 + SSE 구독.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const endedToast = () => toast.info(t('liveLocation.ended', { defaultValue: '위치공유 채널이 종료됐어요' }));

    const resync = () => {
      fetchLocationChannel(conversationId)
        .then((state) => {
          if (cancelled) return;
          if (state.endedAt || !state.me?.joined) {
            clear();
            return;
          }
          applyState(state);
        })
        .catch((err) => {
          if (cancelled) return;
          const status = httpStatusOf(err);
          // 404(활성 채널 없음)/403(미참가)/410(종료) — 재시도해도 풀리지 않는다 → 정리.
          if (status === 404 || status === 403 || status === 410) clear();
        });
    };
    resync();

    const stream = startReconnectingStream({
      url: () => locationChannelEventsUrl(conversationId),
      headers: locationChannelSseHeaders,
      onOpen: () => {
        if (cancelled) return;
        setConnected(true);
        // 스트림 공백 동안의 변화는 HTTP 가 기준선 — 매 (재)연결마다 전량 재동기화(§3-4).
        resync();
      },
      onMessage: (msg) => {
        if (cancelled) return;
        let env: LocationChannelEnvelope | null = null;
        try {
          env = msg.data ? (JSON.parse(msg.data) as LocationChannelEnvelope) : null;
        } catch {
          return;
        }
        if (!env) return;
        const type = env.type ?? (msg.event as LocationChannelEnvelope['type']);
        if (type === 'snapshot') {
          // snapshot 은 envelope 없이 ChannelState 전체가 올 수도 있다 — 둘 다 수용.
          const state = (env.payload ?? env) as LocationChannelState;
          if (state?.id && Array.isArray(state.members)) applyState(state);
          return;
        }
        if (type === 'channel_ended') {
          clear();
          endedToast();
          return;
        }
        applyEvent({ ...env, type });
        // member_joined 페이로드는 userId 만 — 닉네임·아바타는 HTTP 로 채운다(정합성 기준선).
        if (type === 'member_joined') resync();
      },
      onFatal: () => {
        if (cancelled) return;
        clear();
      },
      onError: () => setConnected(false),
    });

    return () => {
      cancelled = true;
      stream.stop();
      setConnected(false);
    };
    // channelId 가 바뀌면(다른 채널 참가) 스트림을 다시 건다.
  }, [conversationId, channelId, applyState, applyEvent, setConnected, clear, t]);

  // 3-a. 참가 중엔 측위 요청 + 전역 워처 구독. 막힌 상태(scope_all/폴백/게이트)면 setMode('gps') 로 재측위
  //      (LocationShareWidget 2026-08-29 고착 복구 주석과 동일 이유).
  useEffect(() => {
    if (!conversationId) return;
    const s = useLocationStore.getState();
    const blocked = s.mode !== 'gps' || s.coordsSource === 'fallback' || s.gateReason != null;
    (blocked ? setMode('gps') : ensureLocation()).catch(() => {});
    const stop = startWatching();
    return () => {
      stop();
      lastPingRef.current = null;
    };
  }, [conversationId, ensureLocation, setMode, startWatching]);

  // 3-b. 게이트 통과 시에만 PUT location.
  useEffect(() => {
    if (!conversationId || !coords) return;
    if (coordsAccuracyM == null || coordsAccuracyM > GPS_ACCURACY_LIMIT_M) return;
    const last = lastPingRef.current;
    const now = Date.now();
    if (last && now - last.at < PING_MIN_INTERVAL_MS && haversineM(last.coords, coords) < PING_MIN_MOVE_M) return;
    lastPingRef.current = { at: now, coords };
    putLocationChannelLocation(conversationId, {
      lat: coords.lat,
      lng: coords.lng,
      accuracy_m: Math.round(coordsAccuracyM),
    })
      .then((state) => {
        if (state?.id) applyState(state);
      })
      .catch((err) => {
        const status = httpStatusOf(err);
        // 410 종료됨 / 403 미참가 / 404 채널 없음 → 정리. 400(정확도)·5xx 는 다음 tick 자연 재시도.
        if (status === 410 || status === 403 || status === 404) clear();
      });
  }, [conversationId, coords, coordsAccuracyM, applyState, clear]);
}
