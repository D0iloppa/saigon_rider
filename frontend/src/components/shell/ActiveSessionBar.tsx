import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, Square, X, MapPinned, Radio, Users } from 'lucide-react';
import { HIDE_TABBAR_PATHS } from '@/components/layout/AppShell';
import { native, type WalkieTalkieCapability } from '@/lib/native';
import type { WalkieTalkieRecordingResult } from '@/lib/plugins/walkieTalkie';
import { VoiceQueue, type WalkiePresence } from '@d-modules/walkie-talkie';
import { createWalkieTransport, walkieApi } from '@/lib/walkieSdk';
import { hasWalkieTalkieConsent, isWalkieTalkieOptedOut } from '@/lib/walkieTalkieConsent';
import { WalkieTalkieConsentModal } from '@/components/dm/WalkieTalkieConsentModal';
import { WalkieChannelPickerSheet } from '@/components/dm/WalkieChannelPickerSheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { sendMessage } from '@/api/dm';
import type { DmConversation } from '@/api/types';
import { loadSession } from '@/lib/session';
import { formatDuration } from '@/components/dm/VoiceMessageBubble';
import { useUserStore } from '@/store/useUserStore';
import { useWalkieTalkieBubbleStore, type WalkieTalkieConversationMeta } from '@/store/useWalkieTalkieBubbleStore';
import { useLocationChannelStore } from '@/store/useLocationChannelStore';
import { useLiveLocationChannelRuntime } from '@/components/location/useLiveLocationChannelRuntime';
import { LiveLocationModal } from '@/components/location/LiveLocationModal';
import { leaveLocationChannel } from '@/api/locationChannel';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useSheetPresenceStore } from '@/store/useSheetPresenceStore';
import { toast } from '@/components/ui/Toast';
import { playSound } from '@/lib/sound';
import styles from './ActiveSessionBar.module.css';

// 'playing' — 수신 음성메시지 자동재생 중. 재생 완료까지는 송신(PTT)을 잠근다(반이중 에티켓).
type Phase = 'idle' | 'permissionDenied' | 'recording' | 'autoStopped' | 'uploading' | 'playing';

// 채팅방(DmDetail) 라우트 패턴 — 이 화면에서는 App.tsx 전역 인스턴스를 숨기고 DmDetail 이
// 입력창 바로 위에 자체 인스턴스를 렌더한다(F-N-01 FR-2 "채팅방: 입력창 위").
const DM_DETAIL_PATH = /^\/dm\/[^/]+$/;
const PRESENCE_HEARTBEAT_MS = 15000;

/**
 * 워키토키 세션의 실제 로직(캡슐/드래그/펼침/컨텍스트메뉴는 없음) — 녹음 시작/정지, 채널
 * join/leave, 수신 음성 자동재생 큐와 현재 세션 제어를 한 곳에서 담당한다.
 * PTT(누르는 동안 녹음)로 상호작용만 바뀐다(F-N-01 FR-2 제안).
 */
function useWalkieSessionCell() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const session = loadSession();
  const conversationId = useWalkieTalkieBubbleStore((s) => s.activeConversationId);
  const conversationMeta = useWalkieTalkieBubbleStore((s) => s.activeConversationMeta);
  const closeBubble = useWalkieTalkieBubbleStore((s) => s.close);
  const setStoreRecording = useWalkieTalkieBubbleStore((s) => s.setRecording);
  const addPendingVoice = useWalkieTalkieBubbleStore((s) => s.addPendingVoice);
  const updatePendingVoice = useWalkieTalkieBubbleStore((s) => s.updatePendingVoice);

  const [capability, setCapability] = useState<WalkieTalkieCapability | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [presence, setPresence] = useState<WalkiePresence | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [queue, setQueue] = useState<{ id: string; audioUrl: string }[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const phaseRef = useRef<Phase>('idle');
  const pendingResultRef = useRef<WalkieTalkieRecordingResult | null>(null);
  const manualStopRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const presenceRefreshRef = useRef<(() => void) | null>(null);
  const sentPendingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    phaseRef.current = phase;
    setStoreRecording(phase === 'recording' || phase === 'autoStopped');
  }, [phase, setStoreRecording]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const notifyRecordingStop = useCallback(() => {
    const id = conversationIdRef.current;
    if (id) walkieApi.setSpeaking(id, false).catch(() => {});
    playSound('walkie_ptt_end');
  }, []);

  useEffect(() => {
    native.walkieTalkie.getCapability().then(setCapability).catch(() => setCapability(null));
  }, []);

  // 녹음 상태 이벤트 구독 — 60초 자동중지(D-4) 감지. 자동 전송은 하지 않는다(사용자 확정).
  useEffect(() => {
    if (!capability?.record) return;
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    native.walkieTalkie
      .addListener('recordingState', (s) => {
        // F-S3-03 FR-6: 바에 보이는 경과 시간은 60초 자동중지가 읽는 것과 같은 이벤트에서
        // 나온다(별도 타이머 금지) — recordingState 는 record 진행 중에만 elapsedMs>0 로 온다.
        if (phaseRef.current === 'recording' || phaseRef.current === 'autoStopped') {
          setElapsedMs(s.elapsedMs);
        }
        if (s.state === 'idle' && !manualStopRef.current && phaseRef.current === 'recording') {
          manualStopRef.current = true;
          setPhase('autoStopped');
          notifyRecordingStop();
          native.walkieTalkie
            .stopRecording()
            .then((result) => {
              if (!cancelled) pendingResultRef.current = result;
            })
            .catch(() => {
              if (!cancelled) pendingResultRef.current = null;
            });
        }
      })
      .then((h) => {
        if (cancelled) h.remove();
        else handle = h;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [capability?.record, notifyRecordingStop]);

  const active =
    isAuthenticated &&
    !!user &&
    !!conversationId &&
    !!capability?.available &&
    !!capability.floatingButton &&
    !isWalkieTalkieOptedOut();

  // 앱 미실행 중 녹음된 음성 전송 드레인 (Android 헤드리스 — 오버레이 버블·홈 위젯).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const pending = await native.walkieTalkie.getPendingRecordings();
      for (const item of pending) {
        if (cancelled) return;
        if (!item.channelId) {
          await native.walkieTalkie.clearPendingRecording(item.id).catch(() => {});
          continue;
        }
        if (sentPendingIdsRef.current.has(item.id)) {
          try {
            await native.walkieTalkie.clearPendingRecording(item.id);
            sentPendingIdsRef.current.delete(item.id);
          } catch {
            /* 다음 실행에 재시도 */
          }
          continue;
        }
        try {
          const blob = await native.walkieTalkie.readRecordingBlob(item);
          if (blob.size > 0) await walkieApi.sendVoice(item.channelId, blob, item.durationMs);
          sentPendingIdsRef.current.add(item.id);
          await native.walkieTalkie.clearPendingRecording(item.id);
          sentPendingIdsRef.current.delete(item.id);
        } catch {
          /* 다음 실행에 재시도 */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  // 채널 참석 — 진입 알림 + 하트비트.
  useEffect(() => {
    if (!conversationId || !active) {
      setPresence(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      walkieApi
        .presence(conversationId)
        .then((p) => {
          if (!cancelled) setPresence(p);
        })
        .catch(() => {});
    };
    presenceRefreshRef.current = refresh;
    const beat = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      walkieApi
        .join(conversationId)
        .then(() => {
          if (!cancelled && document.visibilityState !== 'visible') {
            walkieApi.leave(conversationId).catch(() => {});
          }
        })
        .catch(() => {});
      refresh();
    };
    beat();
    const timer = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);
    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') beat();
      else walkieApi.leave(conversationId).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      presenceRefreshRef.current = null;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      walkieApi.leave(conversationId).catch(() => {});
    };
  }, [conversationId, active]);

  // 수신 자동재생 큐 (VoiceQueue SDK) — 채팅 이력 기록(DmDetail)과 역할이 다르다.
  const myUserId = session?.userId ?? user?.id ?? '';
  const queueRef = useRef<VoiceQueue | null>(null);

  useEffect(() => {
    if (!conversationId || !active) {
      queueRef.current?.reset();
      queueRef.current = null;
      setQueue([]);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
      }
      return;
    }
    const voiceQueue = new VoiceQueue({ selfRef: myUserId });
    queueRef.current = voiceQueue;
    setQueue([]);

    const transport = createWalkieTransport({
      getCursor: () => voiceQueue.cursor,
      onPresenceChanged: () => presenceRefreshRef.current?.(),
      onPage: (page) => {
        const added = voiceQueue.ingest(page.items);
        voiceQueue.setCursor(page.cursor);
        if (added.length > 0) {
          setQueue((prev) => [...prev, ...added.map((m) => ({ id: m.id, audioUrl: m.audioUrl as string }))]);
        }
      },
    });
    transport.start(conversationId);
    return () => {
      transport.stop();
    };
  }, [conversationId, active, myUserId]);

  const currentPlayId = queue[0]?.id ?? null;
  useEffect(() => {
    if (active && phase === 'idle' && queue.length > 0) setPhase('playing');
  }, [active, phase, queue.length]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const item = queue[0];
    const audio = audioRef.current;
    if (!item || !audio) {
      setPhase('idle');
      return;
    }
    audio.src = item.audioUrl;
    playSound('walkie_ptt_start');
    audio.play().catch(() => {
      queueRef.current?.shift();
      setQueue((prev) => prev.slice(1));
      setPhase('idle');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentPlayId]);

  const handlePlaybackEnded = useCallback(() => {
    const item = queueRef.current?.shift() ?? null;
    setQueue((prev) => prev.slice(1));
    if (item) walkieApi.markPlayed(item.id).catch(() => {});
    playSound('walkie_ptt_end');
    setPhase('idle');
  }, []);

  const resetToIdle = useCallback(() => {
    pendingResultRef.current = null;
    manualStopRef.current = false;
    setElapsedMs(0);
    setPhase('idle');
  }, []);

  const sendPendingVoice = useCallback(async (
    id: string,
    blob: Blob,
    durationMs: number,
  ) => {
    updatePendingVoice(id, { status: 'uploading', blob });
    try {
      await walkieApi.sendVoice(conversationId!, blob, durationMs);
      updatePendingVoice(id, { status: 'sent' });
      playSound('dm_send');
    } catch (err) {
      console.error('[walkieTalkie] send failed at upload', err);
      updatePendingVoice(id, { status: 'failed', blob });
      toast.error(t('walkieTalkie.sendError', { defaultValue: '음성메시지 전송에 실패했어요' }));
    }
  }, [conversationId, t, updatePendingVoice]);

  const finishAndSend = useCallback(
    async (result: WalkieTalkieRecordingResult) => {
      if (!user || !conversationId) {
        toast.error(t('walkieTalkie.recordingDiscarded', { defaultValue: '전송할 수 없어 녹음이 삭제됐어요' }));
        resetToIdle();
        return;
      }
      setPhase('uploading');
      let step = 'read';
      const pendingId = crypto.randomUUID();
      const durationMs = result.durationMs ?? 0;
      // 녹음 종료와 동시에 말풍선을 만든다. 파일 읽기/업로드 시간은 사용자가 "전송 중"으로
      // 인지하고, 서버 이력은 DmDetail 이 다음 폴링에서 이 로컬 항목을 교체한다.
      addPendingVoice({
        id: pendingId,
        conversationId,
        durationMs,
        createdAt: new Date().toISOString(),
        status: 'uploading',
        blob: null,
      });
      try {
        const blob = await native.walkieTalkie.readRecordingBlob(result);
        if (blob.size < 700) throw new Error(`empty blob (${blob.size}B)`);
        step = 'upload';
        await sendPendingVoice(pendingId, blob, durationMs);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[walkieTalkie] send failed at ${step}`, err);
        updatePendingVoice(pendingId, { status: 'failed' });
        toast.error(`${t('walkieTalkie.sendError', { defaultValue: '음성메시지 전송에 실패했어요' })} (${step}: ${reason.slice(0, 90)})`);
      } finally {
        notifyRecordingStop();
        resetToIdle();
      }
    },
    [addPendingVoice, conversationId, notifyRecordingStop, resetToIdle, sendPendingVoice, t, updatePendingVoice, user],
  );

  const startFlow = useCallback(async () => {
    manualStopRef.current = false;
    if (capability === null) {
      toast.info(t('common.loading', { defaultValue: '불러오는 중...' }));
      return;
    }
    if (!capability.record) {
      toast.info(
        native.isNative
          ? t('walkieTalkie.recordUnsupported', { defaultValue: '이 버전에서는 음성 녹음을 지원하지 않아요. 앱을 업데이트해주세요' })
          : t('walkieTalkie.recordUnsupportedWeb', { defaultValue: '음성 녹음은 앱에서만 지원해요' }),
      );
      return;
    }
    let mic: string;
    try {
      const perm = await native.walkieTalkie.checkPermission();
      mic = perm.mic;
      if (mic !== 'granted') {
        const granted = await native.walkieTalkie.requestPermission('mic');
        mic = granted ? 'granted' : 'denied';
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      toast.error(`${t('walkieTalkie.startError', { defaultValue: '녹음을 시작하지 못했어요' })} (perm: ${reason.slice(0, 90)})`);
      return;
    }
    if (mic !== 'granted') {
      setPhase('permissionDenied');
      return;
    }
    try {
      await native.walkieTalkie.startRecording({ maxDurationSec: capability?.maxDurationSec ?? 60 });
      setElapsedMs(0);
      setPhase('recording');
      if (native.platform !== 'ios') playSound('walkie_ptt_start');
      if (conversationId) walkieApi.setSpeaking(conversationId, true).catch(() => {});
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      toast.error(`${t('walkieTalkie.startError', { defaultValue: '녹음을 시작하지 못했어요' })} (${reason.slice(0, 90)})`);
    }
  }, [capability, conversationId, t]);

  const locked = phase === 'playing' || ((phase === 'idle' || phase === 'permissionDenied') && queue.length > 0);

  // PTT — 누르는 동안 녹음, 떼면 전송 (F-N-01 FR-2 "말하기 버튼").
  const onPTTDown = useCallback(() => {
    if (phase === 'uploading' || phase === 'recording' || phase === 'autoStopped') return;
    // F-S3-03 FR-6 실패 시나리오 ①: 하트비트가 15초 주기라 회색 상태가 최대 15초 낡을 수 있다 —
    // PTT를 누르는 순간 즉시 재조회해 그 창을 좁힌다.
    presenceRefreshRef.current?.();
    if (locked) {
      toast.info(t('walkieTalkie.lockedTransmitToast', { defaultValue: '받은 음성메시지를 먼저 들어야 말할 수 있어요' }));
      return;
    }
    if (phase === 'idle' || phase === 'permissionDenied') {
      if (!hasWalkieTalkieConsent()) {
        setConsentOpen(true);
        return;
      }
      startFlow();
    }
  }, [phase, locked, startFlow, t]);

  const onPTTUp = useCallback(async () => {
    if (phase === 'recording') {
      manualStopRef.current = true;
      try {
        const result = await native.walkieTalkie.stopRecording();
        await finishAndSend(result);
      } catch {
        toast.error(t('walkieTalkie.stopError', { defaultValue: '녹음을 마치지 못했어요' }));
        notifyRecordingStop();
        resetToIdle();
      }
      return;
    }
    if (phase === 'autoStopped' && pendingResultRef.current) {
      await finishAndSend(pendingResultRef.current);
    }
  }, [phase, finishAndSend, notifyRecordingStop, resetToIdle, t]);

  const handleConsentAgree = useCallback(() => {
    setConsentOpen(false);
    startFlow();
  }, [startFlow]);

  const confirmOpen = useConfirmStore((s) => s.open);
  const requestClose = useCallback(() => {
    confirmOpen(
      t('walkieTalkie.leaveChannelConfirm', { defaultValue: '무전기 채널에서 나갈까요?' }),
      () => closeBubble(),
    );
  }, [confirmOpen, closeBubble, t]);

  const channelName = conversationMeta?.name ?? t('walkieTalkie.bubbleLabel', { defaultValue: '워키토키 음성메시지' });
  const allPresent = !!presence && presence.members.length > 0 && presence.present.length >= presence.members.length;
  // `members` is everyone who belongs to the conversation. The bar is a live-channel
  // control, so showing that value here made "2명" look like two people were connected
  // even when the peer had left. Only the presence heartbeat's `present` set is truthful.
  const presentCount = presence?.present.length ?? 0;
  const isRec = phase === 'recording' || phase === 'autoStopped';

  // F-S3-03 FR-6: 1:1(멤버 2명 이하)은 숫자 대신 상태어, 그룹(멤버 3명 이상)만 기존 숫자 표기.
  const isGroup = (presence?.members.length ?? 0) >= 3;
  const otherPresent = !!presence && presence.present.some((id) => id !== myUserId);
  const speakingOthers = presence?.speaking.filter((id) => id !== myUserId) ?? [];
  const speakingOtherName = speakingOthers.length === 1
    ? (presence?.displayNames[speakingOthers[0]] ?? t('walkieTalkie.someone', { defaultValue: '상대방' }))
    : null;
  // 상태 점 3분법 — presence 미확인(빈 원) / 나만 접속(회색) / 접속 확인됨(초록).
  const presenceDotState: 'connected' | 'alone' | 'unknown' = !presence
    ? 'unknown'
    : (isGroup ? allPresent : otherPresent)
      ? 'connected'
      : 'alone';

  return {
    active,
    conversationId,
    channelName,
    presenceDotState,
    isGroup,
    otherPresent,
    speakingOthers,
    speakingOtherName,
    presentCount,
    presenceAvailable: presence !== null,
    phase,
    isRec,
    elapsedMs,
    locked,
    onPTTDown,
    onPTTUp,
    requestClose,
    audioRef,
    handlePlaybackEnded,
    consentOpen,
    setConsentOpen,
    handleConsentAgree,
    retryPendingVoice: (id: string, blob: Blob, durationMs: number) => void sendPendingVoice(id, blob, durationMs),
  };
}

type WalkieSessionCell = ReturnType<typeof useWalkieSessionCell>;

/**
 * 실시간 위치공유 세션 셀 — 채널 SSE·ping 런타임(useLiveLocationChannelRuntime)은
 * 채널 SSE·ping 런타임과 이탈 확인을 유지하되 표시는 고정 바 칸으로 한정한다.
 */
function useLocationSessionCell() {
  const { t } = useTranslation();
  useLiveLocationChannelRuntime();
  const conversationId = useLocationChannelStore((s) => s.conversationId);
  const state = useLocationChannelStore((s) => s.state);
  const setModalOpen = useLocationChannelStore((s) => s.setModalOpen);
  const clear = useLocationChannelStore((s) => s.clear);
  const confirmOpen = useConfirmStore((s) => s.open);

  const activeCount = state ? state.members.filter((m) => !m.leftAt).length : 0;

  const openModal = useCallback(() => setModalOpen(true), [setModalOpen]);

  const requestClose = useCallback(() => {
    confirmOpen(
      t('liveLocation.leaveChannelConfirm', { defaultValue: '위치공유 채널에서 나갈까요?' }),
      async () => {
        if (!conversationId) return;
        try {
          await leaveLocationChannel(conversationId);
        } catch {
          /* 이미 종료/미참가여도 결과는 같다 — 로컬 정리 */
        } finally {
          clear();
          toast.info(t('liveLocation.left', { defaultValue: '위치공유에서 나왔어요' }));
        }
      },
    );
  }, [confirmOpen, conversationId, clear, t]);

  return { active: !!conversationId, activeCount, openModal, requestClose };
}

type LocationSessionCell = ReturnType<typeof useLocationSessionCell>;

function WalkieCell({ cell, onOpenChat }: { cell: WalkieSessionCell; onOpenChat: () => void }) {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const setActiveConversation = useWalkieTalkieBubbleStore((s) => s.setActiveConversation);
  const longPressTimerRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  // 롱프레스 메뉴(F-S3-03 FR-3) — [채널 변경][초대장 다시 보내기]. "나가기"는 별도 X 버튼(closeBtn)이 맡는다.
  const [menuOpen, setMenuOpen] = useState(false);
  const [channelSheetOpen, setChannelSheetOpen] = useState(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onCellPointerDown = useCallback(() => {
    movedRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      movedRef.current = true;
      setMenuOpen(true);
    }, 450);
  }, [clearLongPress]);

  const handleChangeChannel = useCallback(() => {
    setMenuOpen(false);
    setChannelSheetOpen(true);
  }, []);

  const handleSelectChannel = useCallback(
    (c: DmConversation) => {
      const isGroup = c.conversationType !== 'direct';
      setActiveConversation(c.id, { name: isGroup ? (c.title ?? '') : (c.otherUserNickname ?? ''), isGroup });
    },
    [setActiveConversation],
  );

  const handleResendInvite = useCallback(async () => {
    setMenuOpen(false);
    if (!cell.conversationId) return;
    try {
      await sendMessage(cell.conversationId, '', {
        messageType: 'walkie_invite',
        meta: { invitedByName: user?.nickname ?? '' },
      });
    } catch {
      toast.error(t('walkieTalkie.sendError', { defaultValue: '음성메시지 전송에 실패했어요' }));
    }
  }, [cell.conversationId, t, user]);

  const onCellClick = useCallback(() => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onOpenChat();
  }, [onOpenChat]);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.cell}
      data-locked={cell.locked || undefined}
      onPointerDown={onCellPointerDown}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onClick={onCellClick}
    >
      <span
        className={styles.presenceDot}
        data-presence={cell.presenceDotState}
        role="img"
        aria-label={
          cell.presenceDotState === 'unknown'
            ? t('walkieTalkie.presenceUnavailable', { defaultValue: '접속 확인 중' })
            : cell.presenceDotState === 'connected'
              ? t('walkieTalkie.presenceAll', { defaultValue: '전원 참석' })
              : t('walkieTalkie.presencePartial', { defaultValue: '일부 미참석' })
        }
      />
      <Radio className={styles.sessionIcon} size={16} strokeWidth={2} aria-hidden="true" />
      <span className={styles.channelName}>{cell.channelName}</span>
      <button
        type="button"
        className={styles.pttBtn}
        data-active={cell.isRec || undefined}
        data-locked={cell.locked || undefined}
        onPointerDown={(e) => {
          e.stopPropagation();
          cell.onPTTDown();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          cell.onPTTUp();
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          cell.onPTTUp();
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label={
          cell.isRec
            ? (cell.elapsedMs >= 55000
              ? t('walkieTalkie.recordingCountdownAria', {
                sec: Math.max(0, 60 - Math.floor(cell.elapsedMs / 1000)),
                defaultValue: '녹음 중, {{sec}}초 남음',
              })
              : t('walkieTalkie.recordingElapsedAria', {
                sec: Math.floor(cell.elapsedMs / 1000),
                defaultValue: '녹음 중 {{sec}}초',
              }))
            : t('walkieTalkie.pttButtonLabel', { defaultValue: '누르는 동안 말하기' })
        }
      >
        {cell.isRec ? <Square size={14} strokeWidth={2} fill="currentColor" /> : <Mic size={14} strokeWidth={2.2} />}
        <span
          className={`${styles.pttLabel} num`}
          data-warn={(cell.isRec && cell.elapsedMs >= 50000) || undefined}
          data-countdown={(cell.isRec && cell.elapsedMs >= 55000) || undefined}
        >
          {cell.isRec ? formatDuration(cell.elapsedMs) : t('walkieTalkie.pttLabel', { defaultValue: '말하기' })}
        </span>
      </button>
      {cell.presenceAvailable ? (
        cell.isGroup ? (
          <span className={styles.memberCount}>
            <Users size={13} strokeWidth={2.2} />
            {cell.speakingOthers.length >= 2
              ? t('walkieTalkie.multipleSpeaking', { count: cell.speakingOthers.length, defaultValue: '{{count}}명이 말하는 중' })
              : cell.speakingOtherName
                ? t('walkieTalkie.someoneSpeaking', { name: cell.speakingOtherName, defaultValue: '{{name}}님이 말하는 중' })
                : t('walkieTalkie.connectedCount', { count: cell.presentCount, defaultValue: '접속 {{count}}명' })}
          </span>
        ) : (
          <span className={styles.statusText}>
            {cell.speakingOtherName
              ? t('walkieTalkie.someoneSpeaking', { name: cell.speakingOtherName, defaultValue: '{{name}}님이 말하는 중' })
              : cell.otherPresent
                ? t('walkieTalkie.peerConnected', { defaultValue: '상대 접속 중' })
                : t('walkieTalkie.aloneConnected', { defaultValue: '나만 접속 · 녹음은 전달돼요' })}
          </span>
        )
      ) : (
        <span className={styles.presenceUnavailable}>
          {t('walkieTalkie.presenceUnavailable', { defaultValue: '접속 확인 중' })}
        </span>
      )}
      <button
        type="button"
        className={styles.closeBtn}
        onClick={(e) => {
          e.stopPropagation();
          cell.requestClose();
        }}
        aria-label={t('common.close', { defaultValue: '닫기' })}
      >
        <X size={13} strokeWidth={2.5} />
      </button>

      <audio ref={cell.audioRef} onEnded={cell.handlePlaybackEnded} />

      <WalkieTalkieConsentModal
        open={cell.consentOpen}
        onConsent={cell.handleConsentAgree}
        onClose={() => cell.setConsentOpen(false)}
      />

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} height="fit">
        <div className={styles.longPressMenu} role="menu">
          <button type="button" role="menuitem" className={styles.menuOption} onClick={handleChangeChannel}>
            {t('walkieTalkie.contextMenuChangeChannel', { defaultValue: '채널 변경' })}
          </button>
          <button type="button" role="menuitem" className={styles.menuOption} onClick={handleResendInvite}>
            {t('walkieTalkie.contextMenuResendInvite', { defaultValue: '초대장 다시 보내기' })}
          </button>
        </div>
      </BottomSheet>

      <WalkieChannelPickerSheet
        open={channelSheetOpen}
        onClose={() => setChannelSheetOpen(false)}
        onSelect={handleSelectChannel}
        title={t('walkieTalkie.changeChannelTitle', { defaultValue: '채널 변경' })}
      />
    </div>
  );
}

function LocationCell({ cell }: { cell: LocationSessionCell }) {
  const { t } = useTranslation();
  const longPressTimerRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onCellPointerDown = useCallback(() => {
    movedRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      movedRef.current = true;
      cell.requestClose();
    }, 450);
  }, [clearLongPress, cell]);

  const onCellClick = useCallback(() => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    cell.openModal();
  }, [cell]);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.cell}
      onPointerDown={onCellPointerDown}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onClick={onCellClick}
    >
      <MapPinned size={16} strokeWidth={2} />
      <span className={styles.channelName}>
        {t('liveLocation.bubbleLabel', { defaultValue: '실시간 위치공유' })}
        {cell.activeCount > 0 ? ` · ${cell.activeCount}` : ''}
      </span>
      <button
        type="button"
        className={styles.closeBtn}
        onClick={(e) => {
          e.stopPropagation();
          cell.requestClose();
        }}
        aria-label={t('common.close', { defaultValue: '닫기' })}
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// HIDE_TABBAR_PATHS 중 탭바 자리를 "화면 자체의 고정 하단 CTA 바"로 대체해 쓰는 화면 —
// 이 fixed 바가 bottom:0 으로 내려앉으면 그 CTA 바와 겹친다. 각 화면 .ctaBar 실제 높이
// (패딩 + 버튼)만큼 위로 올려 앉힌다.
const PAGE_BOTTOM_BAR_HEIGHTS: { prefix: string; height: string }[] = [
  { prefix: '/biz/', height: 'calc(82px + env(safe-area-inset-bottom))' }, // BizPublic.module.css .ctaBar
  { prefix: '/market/ad/', height: '102px' }, // AdDetail.module.css .ctaBar
];

interface ActiveSessionBarProps {
  /**
   * 'fixed'(기본) — App.tsx 전역 마운트, 화면 하단(탭바 위)에 고정. 채팅방(DmDetail)에서는
   * 렌더하지 않는다(그 화면은 'inline' 인스턴스가 입력창 위에 대신 뜬다).
   * 'inline' — DmDetail 이 입력창 바로 위에 in-flow 로 렌더할 때 사용.
   */
  variant?: 'fixed' | 'inline';
}

/**
 * 하단 고정 "진행 중 바" (F-N-01 FR-2) — 무전기·위치공유 세션을 떠다니는 캡슐/버블 대신
 * 화면 하단 한 줄에 고정 표시한다. 드래그·자동 펼침·더블탭 없음: 바 탭=대화방 이동,
 * 롱프레스 또는 우측 X=확인 후 닫기.
 */
export function ActiveSessionBar({ variant = 'fixed' }: ActiveSessionBarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const walkie = useWalkieSessionCell();
  const location = useLocationSessionCell();
  const sheetOpen = useSheetPresenceStore((s) => s.openCount > 0);

  // fixed 인스턴스는 채팅방 화면(자체 inline 인스턴스가 대신 뜬다)이거나, BottomSheet 가
  // 열려 있는 화면(예: 프로필 더보기 시트)에서 숨는다 — 그렇지 않으면 z-index 상 시트
  // 콘텐츠 사이에 이 전역 바가 끼어들어 시트 항목처럼 겹쳐 보인다.
  const suppressed = variant === 'fixed' && (DM_DETAIL_PATH.test(pathname) || sheetOpen);
  // 탭바가 보이는 화면(AppShell.HIDE_TABBAR_PATHS 밖)에서는 탭바 위로 올라앉아야 한다 —
  // 그렇지 않으면 fixed 바가 탭바와 같은 자리(viewport bottom)에서 겹친다(버그: 채팅방 나가면
  // 잘못된 위치에 고정).
  const aboveTabBar = variant === 'fixed' && !HIDE_TABBAR_PATHS.some((p) => pathname.startsWith(p));
  // 탭바 자리를 화면 자체 CTA 바가 대신 쓰는 화면(예: 업체 상세)에서는 탭바가 아니라
  // 그 CTA 바 위로 올라앉아야 한다 — 위 aboveTabBar=false 이분법이 놓치는 경우.
  const pageBottomBar = variant === 'fixed'
    ? PAGE_BOTTOM_BAR_HEIGHTS.find((entry) => pathname.startsWith(entry.prefix))
    : undefined;

  if (suppressed || (!walkie.active && !location.active)) return null;

  return (
    <div
      className={variant === 'fixed' ? styles.fixedWrap : styles.inlineWrap}
      data-above-tabbar={aboveTabBar || undefined}
      style={pageBottomBar ? { bottom: pageBottomBar.height, paddingBottom: 0 } : undefined}
    >
      <div className={styles.bar}>
        {walkie.active && (
          <WalkieCell
            cell={walkie}
            onOpenChat={() => walkie.conversationId && navigate(`/dm/${walkie.conversationId}`)}
          />
        )}
        {location.active && <LocationCell cell={location} />}
      </div>
      {location.active && <LiveLocationModal />}
    </div>
  );
}
