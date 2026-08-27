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
import type { DmConversation } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { useWalkieTalkieBubbleStore, type WalkieTalkieConversationMeta } from '@/store/useWalkieTalkieBubbleStore';
import { toast } from '@/components/ui/Toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { WalkieChannelPickerSheet } from './WalkieChannelPickerSheet';
import styles from './WalkieTalkieFloatingButton.module.css';

type Phase = 'idle' | 'permissionDenied' | 'recording' | 'autoStopped' | 'uploading';

const BUBBLE_SIZE = 56;
const MARGIN = 12;
// 참석/녹음중 정보는 실시간성이 중요하지 않다 — 기존 DM 5초 폴링보다 낮은 빈도로 서버 부하를 줄인다.
const PRESENCE_POLL_MS = 18000;

/**
 * 플로팅 토글 녹음 캡슐 (A-7). 웹뷰 내 DOM(position: fixed) — 네이티브 오버레이 아니다(Phase B).
 * 다이나믹 아일랜드 스타일 단일 캡슐(pill) UI — 상태에 따라 compact ↔ expanded 모핑.
 * 드래그 자유 배치(스냅 없음, 화면 경계 클램프만) + 녹음 중 상태(경과시간·레벨) 표시.
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
  const setActiveConversation = useWalkieTalkieBubbleStore((s) => s.setActiveConversation);

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
  // UI 전용 상태 — 캡슐 펼침(peek)·드래그 피드백. 녹음/전송 로직과 무관하다.
  const [peek, setPeek] = useState(false);
  const [dragging, setDragging] = useState(false);
  // 롱프레스(450ms) 컨텍스트메뉴(대표 지시 2026-08-27) — "채널 변경"/"초대장 다시 보내기".
  const [menuOpen, setMenuOpen] = useState(false);
  const [channelSheetOpen, setChannelSheetOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
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

  // 다이나믹 아일랜드식 "잠깐 펼침"(peek) — 채널 등장·다른 사람 발화·어텐션 핑 시 몇 초 펼쳤다가 자동으로 접는다.
  const speakingOtherId = presence?.recordingUsers.find((u) => u.id !== user?.id)?.id ?? null;
  const attentionPing = useWalkieTalkieBubbleStore((s) => s.attentionPing);
  useEffect(() => {
    if (!conversationId) return;
    setPeek(true);
  }, [conversationId, speakingOtherId, attentionPing]);
  useEffect(() => {
    if (!peek) return;
    const timer = window.setTimeout(() => setPeek(false), 3200);
    return () => window.clearTimeout(timer);
  }, [peek]);

  // 캡슐 크기가 모핑될 때(펼침/접힘) 화면 밖으로 밀려나지 않게 경계만 클램프한다.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setPos((p) => ({
        x: Math.min(p.x, Math.max(window.innerWidth - w - MARGIN, 0)),
        y: Math.min(p.y, Math.max(window.innerHeight - h - MARGIN, 0)),
      }));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // 캡슐 DOM 존재 여부가 바뀔 때(대화 진입/닫기/기능 가용) 옵저버를 다시 건다.
  }, [conversationId, closed, capability]);

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

  // 컨텍스트메뉴(대표 지시 2026-08-27) "초대장 다시 보내기" — 현재 대상 대화에 초대카드를 재전송한다.
  const handleResendInvite = useCallback(async () => {
    setMenuOpen(false);
    if (!conversationId) return;
    try {
      await sendMessage(conversationId, '', {
        messageType: 'walkie_invite',
        meta: { invitedByName: user?.nickname ?? '' },
      });
    } catch {
      toast.error(t('walkieTalkie.sendError', { defaultValue: '음성메시지 전송에 실패했어요' }));
    }
  }, [conversationId, t, user]);

  // 컨텍스트메뉴 "채널 변경" — 참여 중인 대화 목록에서 하나를 골라 워키토키 대상만 바꾼다(초대카드는 보내지 않음).
  const handleOpenChannelSheet = useCallback(() => {
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

  // 드래그 자유 배치 — 스냅 없음, 화면 경계 클램프만. 길게 누르면 캡슐이 잠깐 펼쳐진다(채널정보·닫기).
  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      dragMovedRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragging(true);
      // 길게 누르기 → 컨텍스트메뉴(채널 변경/초대장 다시 보내기). 이후 손을 떼도 탭(녹음 토글)으로 이어지지 않게 클릭을 삼킨다.
      // (peek 자체는 채널 등장·타인 발화 시 자동 트리거로 그대로 유지 — 롱프레스라는 제스처만 재배정한다.)
      clearLongPress();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        if (draggingRef.current && !dragMovedRef.current) {
          dragMovedRef.current = true;
          setMenuOpen(true);
        }
      }, 450);
    },
    [clearLongPress, pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragMovedRef.current = true;
      clearLongPress();
    }
    const w = rootRef.current?.offsetWidth ?? BUBBLE_SIZE;
    const h = rootRef.current?.offsetHeight ?? BUBBLE_SIZE;
    const maxX = window.innerWidth - w;
    const maxY = window.innerHeight - h;
    setPos({
      x: Math.min(Math.max(dragStartRef.current.posX + dx, 0), maxX),
      y: Math.min(Math.max(dragStartRef.current.posY + dy, 0), maxY),
    });
  }, [clearLongPress]);

  const onPointerUp = useCallback(() => {
    clearLongPress();
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
  }, [clearLongPress]);

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

  // 채널정보 UX(A-7) — 채널명 + (그룹이면) 참석 인원, 상태(수신대기/발신중), 다른 사람 녹음중 소프트 신호.
  const channelName = conversationMeta?.name ?? t('walkieTalkie.bubbleLabel', { defaultValue: '워키토키 음성메시지' });
  const channelLabel = conversationMeta?.isGroup && presence
    ? `${channelName} · ${presence.activeMembers}/${presence.totalMembers}`
    : channelName;
  const speakingOther = presence?.recordingUsers.find((u) => u.id !== user?.id) ?? null;
  const statusText = phase === 'recording' || phase === 'autoStopped'
    ? t('walkieTalkie.statusRecording', { defaultValue: '발신중' })
    : t('walkieTalkie.statusIdle', { defaultValue: '수신대기' });
  const isRec = phase === 'recording' || phase === 'autoStopped';

  return (
    <>
      {/* div(role=button) — 캡슐 안에 닫기/취소 버튼을 포함해야 해서 <button> 중첩(무효 HTML)을 피한다. */}
      <div
        ref={rootRef}
        role="button"
        tabIndex={0}
        className={styles.capsule}
        data-phase={phase}
        data-dragging={dragging || undefined}
        data-speaking={(!isRec && !!speakingOther) || undefined}
        // left/top 대신 transform(translate3d)으로 이동시킨다 — left/top 변경은 매 포인터무브마다
        // 레이아웃 reflow 를 유발하지만 transform 은 GPU 합성만 일어나 훨씬 부드럽다. 드래그 중
        // 스케일 피드백(1.06)도 별도 CSS transform 대신 여기서 함께 계산해, 두 transform 이 서로
        // 덮어쓰는 문제 없이 한 값으로 합성된다.
        style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${dragging ? 1.06 : 1})` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        aria-label={t('walkieTalkie.bubbleLabel', { defaultValue: '워키토키 음성메시지' })}
      >
        {phase === 'permissionDenied' ? (
          /* 권한거부 — 별도 패널 대신 캡슐 자체가 카드로 확장된다. */
          <div className={styles.denied}>
            <p className={styles.deniedText}>
              {t('walkieTalkie.permissionDenied', { defaultValue: '마이크 권한이 필요해요. 설정에서 허용해 주세요.' })}
            </p>
            <div className={styles.deniedActions}>
              <button
                type="button"
                className={styles.deniedBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  resetToIdle();
                }}
              >
                {t('common.close')}
              </button>
              <button
                type="button"
                className={styles.deniedBtnPrimary}
                onClick={(e) => {
                  e.stopPropagation();
                  native.walkieTalkie.openAppSettings();
                  resetToIdle();
                }}
              >
                {t('walkieTalkie.openAppSettings', { defaultValue: '설정 열기' })}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 닫기(idle·펼침시에만) / 취소(녹음중) — 캡슐 안에 포함된 고스트 버튼, 겹치는 별도 원 없음 */}
            {phase === 'idle' && (
              <button
                type="button"
                className={styles.ghostBtn}
                data-visible={peek || undefined}
                onClick={handleClose}
                aria-label={t('common.close')}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
            {isRec && (
              <button
                type="button"
                className={styles.ghostBtn}
                data-visible
                onClick={handleCancel}
                aria-label={t('common.cancel')}
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            )}

            {/* 녹음중 — 레벨 파형 + 경과시간 / 자동중지 안내 (캡슐 내부에 통합) */}
            {phase === 'recording' && (
              <span className={styles.wave} style={{ '--wt-level': level } as React.CSSProperties} aria-hidden>
                <i /><i /><i /><i />
              </span>
            )}
            {phase === 'recording' && (
              <span className={styles.elapsed}>{Math.floor(elapsedMs / 1000)}s</span>
            )}
            {phase === 'autoStopped' && (
              <span className={styles.autoStoppedText}>
                {t('walkieTalkie.autoStopped', { defaultValue: '자동 중지됨 · 탭하여 전송' })}
              </span>
            )}

            {/* 채널정보 — 평소엔 접혀 있고 peek(등장·발화·길게누름) 때만 펼쳐진다 */}
            {!isRec && (
              <span className={styles.label} data-open={peek || undefined}>
                <span className={styles.channelName}>{channelLabel}</span>
                <span className={speakingOther ? styles.speakingText : styles.statusText}>
                  {speakingOther
                    ? t('walkieTalkie.someoneSpeaking', { name: speakingOther.nickname ?? '', defaultValue: '{{name}}님이 말하는 중' })
                    : statusText}
                </span>
              </span>
            )}

            <span className={styles.iconWrap}>
              {isRec ? (
                <Square size={15} strokeWidth={2} fill="currentColor" />
              ) : (
                <Mic size={19} strokeWidth={2.2} />
              )}
            </span>

            {/* 그룹이면 compact 상태에서도 참석 카운트만 최소로 노출 */}
            {phase === 'idle' && !peek && conversationMeta?.isGroup && presence && (
              <span className={styles.count}>{presence.activeMembers}/{presence.totalMembers}</span>
            )}
          </>
        )}
      </div>

      <WalkieTalkieConsentModal
        open={consentOpen}
        onConsent={handleConsentAgree}
        onClose={() => setConsentOpen(false)}
      />

      {/* 캡슐 롱프레스 컨텍스트메뉴(대표 지시 2026-08-27) — 채널 변경 / 초대장 다시 보내기 */}
      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <div className={styles.menuSheet}>
          <button type="button" className={styles.menuItem} onClick={handleOpenChannelSheet}>
            {t('walkieTalkie.contextMenuChangeChannel', { defaultValue: '채널 변경' })}
          </button>
          <button type="button" className={styles.menuItem} onClick={handleResendInvite}>
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
    </>
  );
}
