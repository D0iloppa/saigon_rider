import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { Mic, Square, X } from 'lucide-react';
import { native, type WalkieTalkieCapability } from '@/lib/native';
import type { WalkieTalkieRecordingResult } from '@/lib/plugins/walkieTalkie';
import { hasWalkieTalkieConsent, isWalkieTalkieOptedOut } from '@/lib/walkieTalkieConsent';
import { WalkieTalkieConsentModal } from './WalkieTalkieConsentModal';
import { api } from '@/api/client';
import { fetchConversationPresence, notifyRecordingPresence, sendMessage, type DmPresence } from '@/api/dm';
import { useUserStore } from '@/store/useUserStore';
import { useWalkieTalkieBubbleStore, type WalkieTalkieConversationMeta } from '@/store/useWalkieTalkieBubbleStore';
import { toast } from '@/components/ui/Toast';
import styles from './WalkieTalkieFloatingButton.module.css';

type Phase = 'idle' | 'permissionDenied' | 'recording' | 'autoStopped' | 'uploading';

const BUBBLE_SIZE = 56;
const MARGIN = 12;
// 참석/녹음중 정보는 실시간성이 중요하지 않다 — 기존 DM 5초 폴링보다 낮은 빈도로 서버 부하를 줄인다.
const PRESENCE_POLL_MS = 18000;

/**
 * 플로팅 토글 녹음 버블 (A-7). 웹뷰 내 DOM(position: fixed) — 네이티브 오버레이 아니다(Phase B).
 * 드래그 이동 + 화면 가장자리 스냅 + 닫기 버튼 + 녹음 중 상태(경과시간·레벨) 표시.
 *
 * 앱 전역 컴포넌트(App.tsx 마운트) — 대상 대화(`activeConversationId`)와 닫힘 상태(`closed`)는
 * `useWalkieTalkieBubbleStore` 에서 읽는다(대표 지시 2026-08-27: DM 화면을 떠나도 유지).
 * 전송된 메시지를 대화방 화면에 즉시 반영하는 콜백은 없다 — 대화방이 열려있지 않을 때 보낸
 * 메시지는 그 화면의 다음 폴링 tick에 자연스럽게 반영된다.
 */
export function WalkieTalkieFloatingButton() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const conversationId = useWalkieTalkieBubbleStore((s) => s.activeConversationId);
  const conversationMeta = useWalkieTalkieBubbleStore((s) => s.activeConversationMeta);
  const closed = useWalkieTalkieBubbleStore((s) => s.closed);
  const closeBubble = useWalkieTalkieBubbleStore((s) => s.close);

  const [capability, setCapability] = useState<WalkieTalkieCapability | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [presence, setPresence] = useState<DmPresence | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pos, setPos] = useState(() => ({
    x: Math.max(window.innerWidth - BUBBLE_SIZE - MARGIN, 0),
    y: Math.round(window.innerHeight * 0.55),
  }));

  const phaseRef = useRef<Phase>('idle');
  const pendingResultRef = useRef<WalkieTalkieRecordingResult | null>(null);
  const manualStopRef = useRef(false);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  // 녹음 리스너 이펙트(deps: capability.available 고정)에서 최신 대화 정보를 읽기 위한 ref.
  const conversationIdRef = useRef<string | null>(null);
  const conversationMetaRef = useRef<WalkieTalkieConversationMeta | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    conversationMetaRef.current = conversationMeta;
  }, [conversationMeta]);

  // 그룹 대화에서만 "녹음 중" 소프트 신호를 보낸다(1:1은 상대가 1명이라 의미 없음).
  const notifyRecordingStop = useCallback(() => {
    const id = conversationIdRef.current;
    if (id && conversationMetaRef.current?.isGroup) {
      notifyRecordingPresence(id, 'stop').catch(() => {});
    }
  }, []);

  useEffect(() => {
    native.walkieTalkie.getCapability().then(setCapability).catch(() => setCapability(null));
  }, []);

  // 녹음 상태 이벤트 구독 — 경과시간·레벨미터 + 60초 자동중지(D-4) 감지.
  useEffect(() => {
    if (!capability?.available) return;
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    native.walkieTalkie
      .addListener('recordingState', (s) => {
        setElapsedMs(s.elapsedMs);
        setLevel(s.level);
        // 우리가 stopRecording() 을 호출하지 않았는데 idle 로 돌아오면 네이티브 자동중지다.
        // 자동 전송은 하지 않는다(사용자 확정) — 파일만 확보해두고 탭을 기다린다.
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
      });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [capability?.available, notifyRecordingStop]);

  // 채널정보 UX(A-7) — 참석 인원 + 소프트 녹음중 신호. 대화방이 바뀔 때마다 새로 폴링 시작.
  useEffect(() => {
    if (!conversationId) {
      setPresence(null);
      return;
    }
    let cancelled = false;
    const tick = () => {
      fetchConversationPresence(conversationId)
        .then((p) => { if (!cancelled) setPresence(p); })
        .catch(() => {});
    };
    tick();
    const timer = window.setInterval(tick, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [conversationId]);

  const resetToIdle = useCallback(() => {
    pendingResultRef.current = null;
    manualStopRef.current = false;
    setPhase('idle');
    setElapsedMs(0);
    setLevel(0);
  }, []);

  const finishAndSend = useCallback(
    async (result: WalkieTalkieRecordingResult) => {
      if (!user || !conversationId) {
        resetToIdle();
        return;
      }
      setPhase('uploading');
      try {
        const fileUrl = Capacitor.convertFileSrc(result.filePath);
        const blob = await fetch(fileUrl).then((r) => r.blob());
        const file = new File([blob], `walkie-${Date.now()}.m4a`, { type: result.mimeType });
        const form = new FormData();
        form.append('file', file);
        form.append('owner_type', 'user');
        form.append('owner_id', user.id);
        const { id } = await api.realFetchForm<{ id: string }>('/contents/upload', form);
        // 대화방 화면이 열려 있으면 그 화면의 폴링이 다음 tick에 이 메시지를 알아서 가져온다.
        await sendMessage(conversationId, '', { audioContentId: id });
      } catch {
        toast.error(t('walkieTalkie.sendError', { defaultValue: '음성메시지 전송에 실패했어요' }));
      } finally {
        notifyRecordingStop();
        resetToIdle();
      }
    },
    [conversationId, notifyRecordingStop, resetToIdle, t, user],
  );

  const startFlow = useCallback(async () => {
    manualStopRef.current = false;
    const perm = await native.walkieTalkie.checkPermission();
    let mic = perm.mic;
    if (mic !== 'granted') {
      const granted = await native.walkieTalkie.requestPermission('mic');
      mic = granted ? 'granted' : 'denied';
    }
    if (mic !== 'granted') {
      setPhase('permissionDenied');
      return;
    }
    try {
      await native.walkieTalkie.startRecording({ maxDurationSec: capability?.maxDurationSec ?? 60 });
      setPhase('recording');
      if (conversationId && conversationMeta?.isGroup) {
        notifyRecordingPresence(conversationId, 'start').catch(() => {});
      }
    } catch {
      toast.error(t('walkieTalkie.startError', { defaultValue: '녹음을 시작하지 못했어요' }));
    }
  }, [capability, conversationId, conversationMeta, t]);

  const handleTap = useCallback(async () => {
    if (phase === 'uploading') return;

    if (phase === 'idle' || phase === 'permissionDenied') {
      if (!hasWalkieTalkieConsent()) {
        setConsentOpen(true);
        return;
      }
      await startFlow();
      return;
    }
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
  }, [phase, startFlow, finishAndSend, notifyRecordingStop, resetToIdle, t]);

  const handleConsentAgree = useCallback(() => {
    setConsentOpen(false);
    startFlow();
  }, [startFlow]);

  const handleCancel = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (phase === 'recording') {
        manualStopRef.current = true;
        try {
          await native.walkieTalkie.cancelRecording();
        } catch {
          /* 이미 종료된 녹음이면 무시 */
        }
      }
      if (phase === 'recording' || phase === 'autoStopped') {
        notifyRecordingStop();
      }
      resetToIdle();
    },
    [phase, notifyRecordingStop, resetToIdle],
  );

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    closeBubble();
  }, [closeBubble]);

  // 드래그 이동 + 가장자리 스냅
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      dragMovedRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMovedRef.current = true;
    const maxX = window.innerWidth - BUBBLE_SIZE;
    const maxY = window.innerHeight - BUBBLE_SIZE;
    setPos({
      x: Math.min(Math.max(dragStartRef.current.posX + dx, 0), maxX),
      y: Math.min(Math.max(dragStartRef.current.posY + dy, 0), maxY),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setPos((p) => {
      const center = p.x + BUBBLE_SIZE / 2;
      const snappedX = center < window.innerWidth / 2 ? MARGIN : window.innerWidth - BUBBLE_SIZE - MARGIN;
      return { x: snappedX, y: p.y };
    });
  }, []);

  const onClick = useCallback(() => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    handleTap();
  }, [handleTap]);

  if (!conversationId) return null;
  if (!capability?.available || !capability.floatingButton) return null;
  if (isWalkieTalkieOptedOut()) return null;
  if (closed) return null;

  // 채널정보 UX(A-7) — 채널명 + (그룹이면) 참석 인원, 상태(수신대기/발신중), 다른 사람 녹음중 소프트 배지.
  const channelName = conversationMeta?.name ?? t('walkieTalkie.bubbleLabel', { defaultValue: '워키토키 음성메시지' });
  const channelLabel = conversationMeta?.isGroup && presence
    ? `${channelName} · ${presence.activeMembers}/${presence.totalMembers}`
    : channelName;
  const speakingOther = presence?.recordingUsers.find((u) => u.id !== user?.id) ?? null;
  const statusText = phase === 'recording' || phase === 'autoStopped'
    ? t('walkieTalkie.statusRecording', { defaultValue: '발신중' })
    : t('walkieTalkie.statusIdle', { defaultValue: '수신대기' });

  return (
    <>
      {/* div(role=button) — 내부에 닫기/취소 버튼을 겹쳐야 해서 <button> 중첩(무효 HTML)을 피한다. */}
      <div
        role="button"
        tabIndex={0}
        className={styles.bubble}
        data-phase={phase}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        aria-label={t('walkieTalkie.bubbleLabel', { defaultValue: '워키토키 음성메시지' })}
      >
        <span className={styles.channelLabel}>
          <span className={styles.channelName}>{channelLabel}</span>
          <span className={speakingOther ? styles.speakingBadge : styles.statusText}>
            {speakingOther
              ? t('walkieTalkie.someoneSpeaking', { name: speakingOther.nickname ?? '', defaultValue: '{{name}}님이 말하는 중' })
              : statusText}
          </span>
        </span>
        {(phase === 'recording' || phase === 'autoStopped') && (
          <span className={styles.level} style={{ transform: `scale(${1 + level * 0.4})` }} />
        )}
        {phase === 'recording' || phase === 'autoStopped' ? (
          <Square size={20} strokeWidth={2} fill="currentColor" />
        ) : (
          <Mic size={24} strokeWidth={2} />
        )}
        {(phase === 'recording' || phase === 'autoStopped') && (
          <span className={styles.elapsed}>
            {phase === 'autoStopped'
              ? t('walkieTalkie.autoStopped', { defaultValue: '자동 중지됨 · 탭하여 전송' })
              : `${Math.floor(elapsedMs / 1000)}s`}
          </span>
        )}
        {phase === 'idle' && (
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label={t('common.close')}>
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
        {(phase === 'recording' || phase === 'autoStopped') && (
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleCancel}
            aria-label={t('common.cancel')}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {phase === 'permissionDenied' && (
        <div
          className={styles.panel}
          style={{
            left: Math.min(pos.x, window.innerWidth - 220 - MARGIN),
            top: Math.max(pos.y - 96, MARGIN),
          }}
        >
          <p className={styles.panelText}>{t('walkieTalkie.permissionDenied', { defaultValue: '마이크 권한이 필요해요. 설정에서 허용해 주세요.' })}</p>
          <div className={styles.panelActions}>
            <button type="button" className={styles.panelBtn} onClick={() => resetToIdle()}>
              {t('common.close')}
            </button>
            <button
              type="button"
              className={styles.panelBtnPrimary}
              onClick={() => {
                native.walkieTalkie.openAppSettings();
                resetToIdle();
              }}
            >
              {t('walkieTalkie.openAppSettings', { defaultValue: '설정 열기' })}
            </button>
          </div>
        </div>
      )}

      <WalkieTalkieConsentModal
        open={consentOpen}
        onConsent={handleConsentAgree}
        onClose={() => setConsentOpen(false)}
      />
    </>
  );
}
