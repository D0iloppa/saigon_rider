import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Flag, LogOut, MapPinned, Navigation, Users } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import OsmMap, { type OsmMarker } from '@/components/maps/OsmMap';
import AppointmentLocationPicker from '@/pages/dm/AppointmentLocationPicker';
import type { PickedLocation } from '@/pages/market/LocationPickerSheet';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { useLocationChannelStore } from '@/store/useLocationChannelStore';
import { useLocationStore } from '@/store/useLocationStore';
import { extractErrorCode } from '@/api/client';
import { leaveLocationChannel, putLocationChannelDestination, type LocationChannelMember } from '@/api/locationChannel';
import { toast } from '@/components/ui/Toast';
import { formatDistance } from '@/lib/format';
import { haversineM } from './useLiveLocationChannelRuntime';
import sys from '@/styles/system.module.css';
import styles from './LiveLocationModal.module.css';

/** 참가자 dot = 브랜드 주황(내 위치 파란 점은 OsmMap myLocation 이 그린다 — service-rules "내 위치 파란 점"). */
const MEMBER_DOT = '#ff5a1f';
/** 목적지 — teardrop 핀은 pickedPoint 가 그린다. */

type MemberPhase = 'waiting' | 'moving' | 'locating';

function phaseOf(m: LocationChannelMember): MemberPhase {
  if (m.arrivedAt) return 'waiting';
  if (m.lat != null && m.lng != null) return 'moving';
  return 'locating';
}

/**
 * 실시간 위치공유 채널 모달 — 전면 시트(지도가 충분히 커야 해서 `height="full"`).
 * 지도(참가자 dot + 내 위치 + 목적지 핀) / 목적지 카드 / 참가자 목록 / 길안내·나가기.
 */
export function LiveLocationModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = useLocationChannelStore((s) => s.modalOpen);
  const setModalOpen = useLocationChannelStore((s) => s.setModalOpen);
  const conversationId = useLocationChannelStore((s) => s.conversationId);
  const state = useLocationChannelStore((s) => s.state);
  const connected = useLocationChannelStore((s) => s.connected);
  const applyState = useLocationChannelStore((s) => s.applyState);
  const clear = useLocationChannelStore((s) => s.clear);
  const myCoords = useLocationStore((s) => s.coords);
  const { available: routeAvailable, reason: routeGateReason } = useServiceAvailability();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClose = useCallback(() => setModalOpen(false), [setModalOpen]);

  const myId = state?.me.userId ?? null;
  const members = useMemo(() => (state?.members ?? []).filter((m) => !m.leftAt), [state]);
  const others = members.filter((m) => m.userId !== myId);

  const markers = useMemo<OsmMarker[]>(
    () =>
      others
        .filter((m) => m.lat != null && m.lng != null)
        .map((m) => ({ id: m.userId, lat: m.lat as number, lng: m.lng as number, color: MEMBER_DOT })),
    [others],
  );
  const dest = state?.dest ?? null;
  const center = dest ?? myCoords ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : null);

  const handleLeave = async () => {
    if (!conversationId) return;
    setBusy(true);
    try {
      await leaveLocationChannel(conversationId);
    } catch {
      // 이미 종료/미참가여도 결과는 같다 — 로컬 정리.
    } finally {
      setBusy(false);
      clear();
      toast.info(t('liveLocation.left', { defaultValue: '위치공유에서 나왔어요' }));
    }
  };

  const handleSetDest = async (loc: PickedLocation) => {
    setPickerOpen(false);
    if (!conversationId) return;
    setBusy(true);
    try {
      const next = await putLocationChannelDestination(conversationId, {
        lat: loc.lat,
        lng: loc.lng,
        ...(loc.districtName ? { name: loc.districtName } : {}),
      });
      applyState(next);
    } catch (err) {
      if (extractErrorCode(err) === 'proposal_required') {
        toast.info(t('liveLocation.proposalSoon', { defaultValue: '목적지 변경 제안은 곧 지원돼요' }));
      } else {
        toast.error(t('liveLocation.destError', { defaultValue: '목적지를 설정하지 못했어요' }));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleNavigate = () => {
    if (!dest) return;
    if (!routeAvailable) {
      toast.neutral(routeGateReason ? t(`locationGate.${routeGateReason}.title`) : t('locationGate.checking', '위치를 확인하고 있어요'));
      return;
    }
    setModalOpen(false);
    navigate(`/ride-nav?type=nav&lat=${dest.lat}&lng=${dest.lng}`);
  };

  const phaseLabel = (p: MemberPhase) =>
    p === 'waiting'
      ? t('liveLocation.phaseWaiting', { defaultValue: '대기 중' })
      : p === 'moving'
        ? t('liveLocation.phaseMoving', { defaultValue: '이동 중' })
        : t('liveLocation.phaseLocating', { defaultValue: '위치 확인 중' });

  return (
    <>
      <BottomSheet open={open} onClose={onClose} height="full">
        <div className={styles.sheet}>
          <div className={styles.head}>
            <span className={styles.headIcon}><MapPinned size={18} strokeWidth={2} /></span>
            <strong className={styles.title}>{t('liveLocation.title', { defaultValue: '실시간 위치공유' })}</strong>
            <span className={styles.live} data-on={connected || undefined}>
              <i />
              {connected
                ? t('liveLocation.live', { defaultValue: '실시간' })
                : t('liveLocation.reconnecting', { defaultValue: '연결 중' })}
            </span>
          </div>

          <div className={styles.mapWrap}>
            <OsmMap
              center={center}
              markers={markers}
              myLocation={myCoords}
              pickedPoint={dest ? { lat: dest.lat, lng: dest.lng } : null}
              className={styles.map}
            />
          </div>

          {/* 목적지 카드 — 없으면 설정 유도(D1: 최초 설정은 누구나 즉시). */}
          <div className={sys.card}>
            <div className={styles.destRow}>
              <span className={styles.destIcon}><Flag size={16} strokeWidth={2} /></span>
              <div className={styles.destBody}>
                <span className={`${sys.sectionLabel} micro`}>{t('liveLocation.destLabel', { defaultValue: '목적지' })}</span>
                {dest ? (
                  <>
                    <strong className={styles.destName}>
                      {dest.name || t('liveLocation.destUnnamed', { defaultValue: '지도에서 찍은 위치' })}
                    </strong>
                    {myCoords && (
                      <span className={`${styles.destMeta} num`}>{formatDistance(haversineM(myCoords, dest))}</span>
                    )}
                  </>
                ) : (
                  <span className={styles.destEmpty}>{t('liveLocation.destEmpty', { defaultValue: '아직 목적지가 없어요' })}</span>
                )}
              </div>
              {dest ? (
                <Button size="sm" fullWidth={false} onClick={handleNavigate} aria-disabled={!routeAvailable}>
                  <Navigation size={14} strokeWidth={2} /> {t('dm.navigate', { defaultValue: '길안내' })}
                </Button>
              ) : (
                <Button size="sm" fullWidth={false} disabled={busy} onClick={() => setPickerOpen(true)}>
                  {t('liveLocation.setDest', { defaultValue: '목적지 설정' })}
                </Button>
              )}
            </div>
          </div>

          {/* 참가자 목록 */}
          <div className={sys.sectionHead}>
            <span className={sys.sectionLabel}>
              <Users size={12} strokeWidth={2.5} /> {t('liveLocation.members', { defaultValue: '참가자' })}
            </span>
            <span className={`${sys.sectionAside} num`}>{members.length}</span>
          </div>
          <div className={sys.card}>
            {members.length === 0 && (
              <div className={styles.emptyRow}>{t('liveLocation.membersLoading', { defaultValue: '참가자를 불러오고 있어요' })}</div>
            )}
            {members.map((m) => {
              const isMe = m.userId === myId;
              const phase = phaseOf(m);
              const dist = !isMe && myCoords && m.lat != null && m.lng != null ? haversineM(myCoords, { lat: m.lat, lng: m.lng }) : null;
              return (
                <div key={m.userId} className={styles.memberRow}>
                  <Avatar src={m.avatarUrl ?? null} name={m.nickname || '?'} seed={m.userId} size={36} />
                  <div className={styles.memberBody}>
                    <span className={styles.memberName}>
                      {isMe ? t('liveLocation.me', { defaultValue: '나' }) : m.nickname}
                    </span>
                    <span className={styles.memberMeta}>
                      <span className={styles.phase} data-phase={phase}>{phaseLabel(phase)}</span>
                      {dist != null && (
                        <>
                          <span className={sys.metaDot} />
                          <span className="num">{formatDistance(dist)}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" className={styles.leaveBtn} disabled={busy} onClick={handleLeave}>
            <LogOut size={15} strokeWidth={2} /> {t('liveLocation.leave', { defaultValue: '나가기' })}
          </button>
          <p className={styles.leaveHint}>{t('liveLocation.leaveHint', { defaultValue: '나가면 내 위치가 즉시 삭제돼요' })}</p>
        </div>
      </BottomSheet>

      <AppointmentLocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={dest ? { lat: dest.lat, lng: dest.lng } : null}
        onConfirm={handleSetDest}
      />
    </>
  );
}
