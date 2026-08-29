import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import OsmMap from '@/components/maps/OsmMap';
import { LocationShareConsentModal } from './LocationShareConsentModal';
import {
  fetchConversationLocationShareStatus,
  fetchLocationShareStatus,
  pingConversationLocationShare,
  pingLocationShare,
  startConversationLocationShare,
  startLocationShare,
  stopConversationLocationShare,
  stopLocationShare,
} from '@/api/dm';
import type { DmMessage, LocationShareStatus } from '@/api/types';
import { useLocationStore } from '@/store/useLocationStore';
import { GPS_ACCURACY_LIMIT_M, classifyLocationError, type LocationGateReason } from '@/lib/serviceLocation';
import { sendLocationShareInvite } from '@/lib/locationShareInvite';
import styles from './LocationShareWidget.module.css';

interface Props {
  /** 이 위치공유가 보고되는 대화방 — 초대카드 전송, 독립(약속 없는) 공유 시 API 대상으로 쓴다. */
  conversationId: string;
  /** 주어지면 약속 기반 정밀도 창 정책(exact window)을 쓴다. 없으면 독립 공유(세션 TTL)로 동작한다. */
  appointmentId?: string;
  /** 공유 시작 시 보낼 초대카드에 넣을 내 닉네임. */
  nickname?: string;
  /** 초대카드 전송에 성공하면 그 메시지를 대화 목록에 즉시 반영하도록 알린다. */
  onInviteSent?: (message: DmMessage) => void;
}

const POLL_MS = 7000;
/** M-5 확정: 거래 세션 전용 ping 게이트 — 10초 + 10m. 전역 워처(30m)와 별개로 이 위젯이 추가로 건다. */
const PING_MIN_INTERVAL_MS = 10_000;
const PING_MIN_MOVE_M = 10;

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 거래중 실시간 위치공유 위젯 (P4).
 *
 * §4-A 불변식: GPS는 절대 직접 호출하지 않는다 — `useLocationStore`의 `ensureLocation()`/
 * `startWatching()`을 경유해 전역 워처의 최신 좌표를 구독만 한다. 이 위젯은 그 좌표 위에
 * 거래 세션 전용 게이트(10초+10m, M-5)를 추가로 얹어 `/ping`을 호출할 뿐이다.
 *
 * §6 확정: 측위 실패·권역 밖이어도 화면 전체를 막지 않는다 — 이 카드 내부에서만 인라인
 * 사유를 보여준다. 중심가 폴백은 쓰지 않는다(측위 실패는 그냥 실패로 보여준다).
 */
export function LocationShareWidget({ conversationId, appointmentId, nickname, onInviteSent }: Props) {
  const { t } = useTranslation();
  // 약속이 주어지면 기존 정밀도 창 API, 없으면 독립(대화 단위) API — 둘은 서버에서도 별개 엔드포인트다.
  const shareApi = appointmentId
    ? {
        fetchStatus: () => fetchLocationShareStatus(appointmentId),
        start: (cv: string) => startLocationShare(appointmentId, cv),
        stop: () => stopLocationShare(appointmentId),
        ping: (lat: number, lng: number, acc: number) => pingLocationShare(appointmentId, lat, lng, acc),
      }
    : {
        fetchStatus: () => fetchConversationLocationShareStatus(conversationId),
        start: (cv: string) => startConversationLocationShare(conversationId, cv),
        stop: () => stopConversationLocationShare(conversationId),
        ping: (lat: number, lng: number, acc: number) => pingConversationLocationShare(conversationId, lat, lng, acc),
      };
  const shareKey = appointmentId ?? conversationId;
  const coords = useLocationStore((s) => s.coords);
  const coordsAccuracyM = useLocationStore((s) => s.coordsAccuracyM);
  const storeGateReason = useLocationStore((s) => s.gateReason);
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  const setMode = useLocationStore((s) => s.setMode);
  const startWatching = useLocationStore((s) => s.startWatching);

  const [status, setStatus] = useState<LocationShareStatus | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [localGateReason, setLocalGateReason] = useState<LocationGateReason | null>(null);
  const [busy, setBusy] = useState(false);
  // 403/404 같은 영구적 실패(재시도해도 절대 안 풀림) — 폴링을 중단하고 인라인 문구만 보여준다.
  const [unavailable, setUnavailable] = useState(false);

  const lastPingRef = useRef<{ at: number; coords: { lat: number; lng: number } } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    shareApi.fetchStatus()
      .then(setStatus)
      .catch((err) => {
        // realFetch 의 에러 메시지 형식은 "HTTP {status} | ...". 403/404는 재시도해도 풀리지
        // 않는 실패(권한 없음/약속 삭제 등)라 폴링을 멈춘다. 5xx·네트워크 오류는 다음 tick 재시도.
        const status = Number(/^HTTP (\d+)/.exec((err as Error)?.message ?? '')?.[1]);
        if (status === 403 || status === 404) {
          setUnavailable(true);
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      });
  }, [shareKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 폴링 — §4-B 확정: 신규 실시간 인프라 없이 위젯 자체 폴링으로 완결.
  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [refresh]);

  const sharing = status?.myStatus === 'sharing';

  // 공유 중일 때만 측위를 요청하고 전역 워처를 구독한다(비공유 중엔 위치를 건드리지 않는다).
  //
  // ⚠️ 고착 상태 복구(2026-08-29) — `ensureLocation()` 은 이미 확정된 상태를 재측위하지 않는다
  // (`mode==='gps' && coords` 면 즉시 resolve, `pinnedAll`/거부면 사유만 남기고 resolve). 그래서
  // ① 표시범위를 '전체 지역'으로 고정해둔 경우(`scope_all`), ② 과거에 측위가 실패해 'all' 로
  // 떨어진 경우, ③ 권역 밖 판정으로 중심가 폴백 좌표가 박힌 경우 — 셋 다 위젯이 사유 문구만
  // 띄운 채 **영영 좌표를 못 얻어** ping 이 한 번도 안 나갔다(대표 실기기 리포트: "위치를 확인할
  // 수 없어요" + "공유 중"이 동시에 표시). '공유 시작'은 사용자의 **명시적 GPS 의사**이므로,
  // 막힌 상태일 때만 `setMode('gps')` 로 고정을 풀고 재측위한다(정상 상태면 건드리지 않는다).
  useEffect(() => {
    if (!sharing) return;
    const s = useLocationStore.getState();
    const blocked = s.mode !== 'gps' || s.coordsSource === 'fallback' || s.gateReason != null;
    const resolve = blocked ? setMode('gps') : ensureLocation();
    resolve
      .then(() => setLocalGateReason(null))
      .catch((e) => setLocalGateReason(classifyLocationError(e)));
    const stop = startWatching();
    return stop;
  }, [sharing, ensureLocation, setMode, startWatching]);

  // 거래 세션 전용 게이트(10초+10m) — 전역 워처가 갱신한 coords 를 구독해 조건 충족 시에만 ping.
  useEffect(() => {
    if (!sharing || !coords) return;
    // 정확도 게이트(§4-A 이중게이트) — 정확도를 모르거나 35m 초과면 애초에 보내지 않는다.
    if (coordsAccuracyM == null || coordsAccuracyM > GPS_ACCURACY_LIMIT_M) return;
    const last = lastPingRef.current;
    const now = Date.now();
    if (last && now - last.at < PING_MIN_INTERVAL_MS && distanceM(last.coords, coords) < PING_MIN_MOVE_M) return;

    lastPingRef.current = { at: now, coords };
    shareApi.ping(coords.lat, coords.lng, Math.round(coordsAccuracyM))
      .then(setStatus)
      .catch(() => {
        /* ping 실패는 다음 tick 에 자연 재시도 */
      });
  }, [sharing, coords, coordsAccuracyM, shareKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = () => setConsentOpen(true);

  const handleConsent = async (consentVersion: string) => {
    setConsentOpen(false);
    setBusy(true);
    try {
      const next = await shareApi.start(consentVersion);
      setStatus(next);
      // 상대방은 위치공유가 시작된 걸 모를 수 있으므로 초대카드를 함께 보낸다(워키토키와 동일 이유).
      const msg = await sendLocationShareInvite(conversationId, nickname);
      if (msg) onInviteSent?.(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await shareApi.stop();
      lastPingRef.current = null;
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (unavailable) {
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <MapPin size={18} strokeWidth={2} />
          <strong className={styles.title}>{t('locationShare.widgetTitle', { defaultValue: '실시간 위치공유' })}</strong>
        </div>
        <p className={styles.inlineGate}>{t('locationShare.unavailable', { defaultValue: '위치 공유를 사용할 수 없어요' })}</p>
      </div>
    );
  }

  if (!status) return null;

  const gateReason = sharing ? localGateReason ?? (storeGateReason ?? null) : null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <MapPin size={18} strokeWidth={2} />
        <strong className={styles.title}>{t('locationShare.widgetTitle', { defaultValue: '실시간 위치공유' })}</strong>
      </div>

      {status.myStatus === 'not_started' && (
        <Button size="sm" fullWidth={false} disabled={busy} onClick={handleStart}>
          {t('locationShare.startBtn', { defaultValue: '위치 공유 시작' })}
        </Button>
      )}

      {sharing && (
        <>
          {gateReason && (
            <p className={styles.inlineGate}>
              {t(`locationShare.gate.${gateReason}`, {
                defaultValue: '위치를 확인할 수 없어요',
              })}
            </p>
          )}
          <p className={styles.statusLine}>{t('locationShare.sharingActive', { defaultValue: '내 위치를 공유하고 있어요' })}</p>
          <p className={styles.peerLine}>
            {status.peerStatus === 'sharing'
              ? t('locationShare.peerSharing', { defaultValue: '상대방도 위치를 공유하고 있어요' })
              : t('locationShare.peerNotStarted', { defaultValue: '상대방은 아직 위치를 공유하지 않았어요' })}
          </p>

          {status.peerLat != null && status.peerLng != null && (
            <div className={styles.mapWrap}>
              <OsmMap
                center={{ lat: status.peerLat, lng: status.peerLng }}
                markers={[{ id: 'peer', lat: status.peerLat, lng: status.peerLng, color: '#3b82f6' }]}
                myLocation={coords}
                className={styles.map}
              />
            </div>
          )}

          <Button size="sm" variant="ghost" fullWidth={false} disabled={busy} onClick={handleStop}>
            {t('locationShare.stopBtn', { defaultValue: '공유 중단' })}
          </Button>
        </>
      )}

      {status.myStatus === 'stopped' && (
        <p className={styles.statusLine}>{t('locationShare.myStopped', { defaultValue: '위치 공유가 종료됐어요' })}</p>
      )}

      <LocationShareConsentModal open={consentOpen} onConsent={handleConsent} onClose={() => setConsentOpen(false)} />
    </div>
  );
}
