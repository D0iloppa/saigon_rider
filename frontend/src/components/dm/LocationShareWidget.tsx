import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import OsmMap from '@/components/maps/OsmMap';
import { LocationShareConsentModal } from './LocationShareConsentModal';
import {
  fetchLocationShareStatus,
  pingLocationShare,
  startLocationShare,
  stopLocationShare,
} from '@/api/dm';
import type { LocationShareStatus } from '@/api/types';
import { useLocationStore } from '@/store/useLocationStore';
import { GPS_ACCURACY_LIMIT_M, classifyLocationError, type LocationGateReason } from '@/lib/serviceLocation';
import styles from './LocationShareWidget.module.css';

interface Props {
  appointmentId: string;
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
export function LocationShareWidget({ appointmentId }: Props) {
  const { t } = useTranslation();
  const coords = useLocationStore((s) => s.coords);
  const coordsAccuracyM = useLocationStore((s) => s.coordsAccuracyM);
  const storeGateReason = useLocationStore((s) => s.gateReason);
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  const startWatching = useLocationStore((s) => s.startWatching);

  const [status, setStatus] = useState<LocationShareStatus | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [localGateReason, setLocalGateReason] = useState<LocationGateReason | null>(null);
  const [busy, setBusy] = useState(false);

  const lastPingRef = useRef<{ at: number; coords: { lat: number; lng: number } } | null>(null);

  const refresh = useCallback(() => {
    fetchLocationShareStatus(appointmentId)
      .then(setStatus)
      .catch(() => {
        /* 폴링 실패는 조용히 다음 tick 에 재시도 — 토스트 폭탄 방지 */
      });
  }, [appointmentId]);

  // 폴링 — §4-B 확정: 신규 실시간 인프라 없이 위젯 자체 폴링으로 완결.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const sharing = status?.myStatus === 'sharing';

  // 공유 중일 때만 측위를 요청하고 전역 워처를 구독한다(비공유 중엔 위치를 건드리지 않는다).
  useEffect(() => {
    if (!sharing) return;
    ensureLocation()
      .then(() => setLocalGateReason(null))
      .catch((e) => setLocalGateReason(classifyLocationError(e)));
    const stop = startWatching();
    return stop;
  }, [sharing, ensureLocation, startWatching]);

  // 거래 세션 전용 게이트(10초+10m) — 전역 워처가 갱신한 coords 를 구독해 조건 충족 시에만 ping.
  useEffect(() => {
    if (!sharing || !coords) return;
    // 정확도 게이트(§4-A 이중게이트) — 정확도를 모르거나 35m 초과면 애초에 보내지 않는다.
    if (coordsAccuracyM == null || coordsAccuracyM > GPS_ACCURACY_LIMIT_M) return;
    const last = lastPingRef.current;
    const now = Date.now();
    if (last && now - last.at < PING_MIN_INTERVAL_MS && distanceM(last.coords, coords) < PING_MIN_MOVE_M) return;

    lastPingRef.current = { at: now, coords };
    pingLocationShare(appointmentId, coords.lat, coords.lng, Math.round(coordsAccuracyM))
      .then(setStatus)
      .catch(() => {
        /* ping 실패는 다음 tick 에 자연 재시도 */
      });
  }, [sharing, coords, coordsAccuracyM, appointmentId]);

  const handleStart = () => setConsentOpen(true);

  const handleConsent = async (consentVersion: string) => {
    setConsentOpen(false);
    setBusy(true);
    try {
      const next = await startLocationShare(appointmentId, consentVersion);
      setStatus(next);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await stopLocationShare(appointmentId);
      lastPingRef.current = null;
      refresh();
    } finally {
      setBusy(false);
    }
  };

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
