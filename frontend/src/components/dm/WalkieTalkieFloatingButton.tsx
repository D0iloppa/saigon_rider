import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import { Mic, Square, X } from 'lucide-react';
import { native, type WalkieTalkieCapability } from '@/lib/native';
import type { WalkieTalkieRecordingResult } from '@/lib/plugins/walkieTalkie';
import { hasWalkieTalkieConsent, isWalkieTalkieOptedOut } from '@/lib/walkieTalkieConsent';
import { WalkieTalkieConsentModal } from './WalkieTalkieConsentModal';
import { api } from '@/api/client';
import { fetchConversationPresence, fetchMessages, markVoicePlayed, notifyRecordingPresence, sendMessage, type DmPresence } from '@/api/dm';
import type { DmConversation } from '@/api/types';
import { loadSession } from '@/lib/session';
import { useUserStore } from '@/store/useUserStore';
import { useWalkieTalkieBubbleStore, type WalkieTalkieConversationMeta } from '@/store/useWalkieTalkieBubbleStore';
import { toast } from '@/components/ui/Toast';
import { playSound } from '@/lib/sound';
import { WalkieChannelPickerSheet } from './WalkieChannelPickerSheet';
import styles from './WalkieTalkieFloatingButton.module.css';

// 'playing' — 수신 음성메시지 재생중(202608 개편). 재생 완료까지는 송신(녹음 시작)을 잠근다(PTT 에티켓).
type Phase = 'idle' | 'permissionDenied' | 'recording' | 'autoStopped' | 'uploading' | 'playing';

const BUBBLE_SIZE = 56;
const MARGIN = 12;
// 참석/녹음중 정보는 실시간성이 중요하지 않다 — 기존 DM 5초 폴링보다 낮은 빈도로 서버 부하를 줄인다.
const PRESENCE_POLL_MS = 18000;
// 컨텍스트메뉴 "홈화면 고정" — Android 네이티브 위젯 고정(pinToHomeScreen, WalkieTalkieChannelWidgetProvider) 구현 완료.
const PIN_TO_HOME_MENU_ENABLED = true;
// GET /dm/conversations/{id}/messages 의 페이지 크기(backend/app/routers/dm.py size 기본값) —
// 마지막 페이지 번호를 계산해 "현재 시점" 커서를 잡는 데 쓴다.
const MESSAGE_PAGE_SIZE = 50;

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
  const session = loadSession();
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
  // 수신 음성메시지 큐(202608 개편) — 워키토키처럼 채팅 버블이 아니라 이 캡슐에서만 재생한다.
  const [queue, setQueue] = useState<{ id: string; audioUrl: string }[]>([]);
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
  // 더블탭 → 캡슐 펼침(peek) 토글. idle/권한거부 상태의 탭에만 적용(녹음중 탭은 정지/전송이라 지연 없이 즉시 반응해야 한다).
  const tapTimerRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const pendingResultRef = useRef<WalkieTalkieRecordingResult | null>(null);
  const manualStopRef = useRef(false);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  // 녹음 리스너 이펙트(deps: capability.available 고정)에서 최신 대화 정보를 읽기 위한 ref.
  const conversationIdRef = useRef<string | null>(null);
  const conversationMetaRef = useRef<WalkieTalkieConversationMeta | null>(null);
  // 캡슐 모핑(펼침/접힘) 시 직전 너비 대비 변화량을 구해 확장을 중앙 기준으로 유지하기 위한 ref.
  const prevWidthRef = useRef<number | null>(null);
  // 수신 음성메시지 재생용 — dedup(같은 메시지 중복 큐잉 방지)과 폴링 커서, 재생 엘리먼트.
  const queuedIdsRef = useRef<Set<string>>(new Set());
  const sinceCursorRef = useRef<string | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // 캡슐이 실제로 화면에 렌더되는 조건 (아래 early return 들과 동일 집합 — 함께 고쳐야 한다).
  // 렌더되지 않으면 <audio> 도 없어(audioRef.current === null) 재생 이펙트가 곧바로 phase 를
  // idle 로 되돌리고, 큐가 차 있으면 idle→playing→idle 무한루프가 된다. 그래서 수신 폴링과
  // 자동재생은 렌더 조건과 같은 게이트를 쓴다.
  const bubbleActive =
    !!conversationId &&
    !!capability?.available &&
    !!capability.floatingButton &&
    !isWalkieTalkieOptedOut() &&
    !closed;

  // 수신 음성메시지 폴링(202608 개편) — DmDetail 화면이 열려있지 않아도 이 캡슐이 대상 대화의 새
  // 음성메시지를 감지해야 한다. DmDetail 자체 메시지 폴링과 같은 5초 주기를 그대로 맞춘다(참석정보
  // 폴링(18초)과 달리 메시지 수신은 체감 지연이 커서 더 짧게 잡아야 한다) — presence 폴링과는
  // 별개의 이펙트/타이머다(섞으면 안 된다).
  useEffect(() => {
    if (!conversationId || !bubbleActive) {
      setQueue([]);
      queuedIdsRef.current = new Set();
      return;
    }
    queuedIdsRef.current = new Set();
    sinceCursorRef.current = undefined;
    setQueue([]);
    let cancelled = false;
    let seeded = false;
    const myId = session?.userId ?? user?.id;
    // 커서 없이 폴링하면 API 가 created_at ASC 첫 페이지(= 대화의 가장 오래된 50건)를 준다 —
    // 그대로 두면 채널을 켜는 순간 과거 음성이 전부 큐잉·자동재생되고, 재생 잠금 때문에 그동안
    // 송신도 막힌다. 마지막 페이지의 최신 메시지 시각을 커서로 잡아 "이후 도착분"만 받는다.
    // (기기 시계 대신 서버가 찍은 타임스탬프를 쓴다 — 시계 오차로 수신을 놓치지 않도록.)
    const seedCursor = async () => {
      const first = await fetchMessages(conversationId, 1);
      const lastPage = Math.max(1, Math.ceil(first.total / MESSAGE_PAGE_SIZE));
      const page = lastPage === 1 ? first : await fetchMessages(conversationId, lastPage);
      sinceCursorRef.current = page.items[page.items.length - 1]?.createdAt;
    };
    const tick = async () => {
      if (cancelled || !seeded) return;
      try {
        const res = await fetchMessages(conversationId, 1, sinceCursorRef.current);
        if (cancelled || res.items.length === 0) return;
        sinceCursorRef.current = res.items[res.items.length - 1].createdAt;
        // 상대가 보낸, 아직 재생 전(audioUrl 이 남아있는), 아직 큐에 없는 음성메시지만 큐잉.
        const incoming = res.items.filter(
          (m) => m.messageType === 'voice' && m.senderId !== myId && m.audioUrl && !queuedIdsRef.current.has(m.id),
        );
        if (incoming.length === 0) return;
        incoming.forEach((m) => queuedIdsRef.current.add(m.id));
        setQueue((prev) => [...prev, ...incoming.map((m) => ({ id: m.id, audioUrl: m.audioUrl as string }))]);
      } catch {
        // 순단 무시 — 다음 tick 에 재시도 (DmDetail 메시지 폴링과 동일 패턴)
      }
    };
    seedCursor()
      // 시딩 실패 시엔 기기 시계로라도 "지금"을 잡는다 — 커서 없는 채로 폴링을 시작해
      // 과거 50건을 쏟아내는 것보다 낫다.
      .catch(() => { sinceCursorRef.current = new Date().toISOString(); })
      .then(() => {
        seeded = true;
        tick();
      });
    const interval = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- myId 는 세션 고정값, 재구독 불필요
  }, [conversationId, bubbleActive]);

  // 큐가 있고 유휴 상태면 자동 재생 시작. 재생 중 항목(queue[0])이 바뀔 때만 실제로 오디오를
  // 다시 로드한다 — queue 배열 전체를 deps 로 두면 재생 도중 새 메시지가 뒤에 추가되기만 해도
  // 배열 참조가 바뀌어 재생 중이던 오디오가 처음부터 다시 시작돼버린다.
  const currentPlayId = queue[0]?.id ?? null;
  useEffect(() => {
    if (bubbleActive && phase === 'idle' && queue.length > 0) setPhase('playing');
  }, [bubbleActive, phase, queue.length]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const item = queue[0];
    const audio = audioRef.current;
    if (!item || !audio) {
      setPhase('idle');
      return;
    }
    audio.src = item.audioUrl;
    audio.play().catch(() => {
      // 자동재생 실패 — 잠금을 계속 걸어두면 영영 못 듣게 되니, 해당 항목만 건너뛰고 잠금을 푼다.
      setQueue((prev) => prev.slice(1));
      setPhase('idle');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentPlayId]);

  // D-6: 재생 완료 신고 — 서버가 파일을 삭제한다(DmDetail 이 하던 markVoicePlayed 호출을 그대로 이관).
  const handlePlaybackEnded = useCallback(() => {
    const item = queue[0];
    setQueue((prev) => prev.slice(1));
    if (item && conversationId) {
      markVoicePlayed(conversationId, item.id).catch(() => {});
    }
    // 큐에 남은 항목이 있으면 위 idle→playing 이펙트가 자동으로 다음 항목 재생을 이어간다.
    setPhase('idle');
  }, [queue, conversationId]);

  // 다이나믹 아일랜드식 펼침(peek) — 채널 등장·다른 사람 발화·어텐션 핑 시 자동으로 펼친다.
  // 자동 접힘은 없다(대표 지시 2026-08-27) — 접는 건 더블탭 토글뿐이다.
  const speakingOtherId = presence?.recordingUsers.find((u) => u.id !== user?.id)?.id ?? null;
  const attentionPing = useWalkieTalkieBubbleStore((s) => s.attentionPing);
  const isPlayingPhase = phase === 'playing';
  useEffect(() => {
    if (!conversationId) return;
    setPeek(true);
    // isPlayingPhase 도 트리거에 포함 — 재생 시작 시(그리고 종료 시 재수신 대비) 채널명 대신
    // "재생중" 상태를 보여준다.
  }, [conversationId, speakingOtherId, attentionPing, isPlayingPhase]);

  // 캡슐 크기가 모핑될 때(펼침/접힘) 직전 가로 중심을 유지하며 확장되게 하고, 화면 밖으로
  // 밀려날 때만 반대쪽으로 밀어 넣는다.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setPos((p) => {
        const prevW = prevWidthRef.current;
        const centeredX = prevW === null ? p.x : p.x - (w - prevW) / 2;
        prevWidthRef.current = w;
        return {
          x: Math.min(Math.max(centeredX, 0), Math.max(window.innerWidth - w - MARGIN, 0)),
          y: Math.min(p.y, Math.max(window.innerHeight - h - MARGIN, 0)),
        };
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      prevWidthRef.current = null;
    };
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
        playSound('dm_send');
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
    // 녹음 플러그인이 없는 설치본(웹, 또는 WalkieTalkie 미등록 구버전 앱)에서는 아래 호출들이
    // 전부 reject 된다 — 예전엔 그대로 새어나가 unhandled rejection 으로 아무 반응 없이 끝났다.
    if (!capability?.record) {
      toast.info(t('walkieTalkie.recordUnsupported', { defaultValue: '이 버전에서는 음성 녹음을 지원하지 않아요. 앱을 업데이트해주세요' }));
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
    } catch {
      toast.error(t('walkieTalkie.startError', { defaultValue: '녹음을 시작하지 못했어요' }));
      return;
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

    // 의도된 불편함(대표 지시) — 받은 음성메시지를 다 듣기 전엔 송신을 시작할 수 없다. 실제 PTT
    // 에티켓처럼, 듣는 중엔 말을 얹지 않는다. 이미 녹음 중인 걸 멈춰서 보내는 동작(아래 'recording'/
    // 'autoStopped' 분기)은 이 잠금과 무관하게 그대로 허용한다 — 잠기는 건 "새로 시작"뿐이다.
    if (phase === 'playing' || ((phase === 'idle' || phase === 'permissionDenied') && queue.length > 0)) {
      toast.info(t('walkieTalkie.lockedTransmitToast', { defaultValue: '받은 음성메시지를 먼저 들어야 말할 수 있어요' }));
      return;
    }

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
  }, [phase, queue.length, startFlow, finishAndSend, notifyRecordingStop, resetToIdle, t]);

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

  // 컨텍스트메뉴 "홈화면 고정" — Android 는 네이티브 위젯 고정 요청, 그 외 플랫폼은 미지원 안내.
  const handlePinToHome = useCallback(() => {
    setMenuOpen(false);
    if (native.platform === 'android') {
      native.walkieTalkie.pinToHomeScreen().catch(() => {});
      return;
    }
    toast.info(t('walkieTalkie.pinToHomeIosUnavailable', { defaultValue: 'iOS에서는 아직 지원하지 않아요' }));
  }, [t]);

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
      // 메뉴 펼침 중에도 드래그(이동)는 허용한다 — 포인터 캡처를 여기서 즉시 걸지 않고 드래그
      // 임계값을 넘는 시점(onPointerMove)까지 미루므로, 메뉴 항목 버튼의 개별 클릭은 그대로 통과한다.
      draggingRef.current = true;
      dragMovedRef.current = false;
      dragStartRef.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
      setDragging(true);
      // 길게 누르기 → 컨텍스트메뉴(채널 변경/초대장 다시 보내기). 이후 손을 떼도 탭(녹음 토글)으로 이어지지 않게 클릭을 삼킨다.
      // (peek 자체는 채널 등장·타인 발화 시 자동 트리거로 그대로 유지 — 롱프레스라는 제스처만 재배정한다.)
      // 롱프레스는 메뉴를 토글한다 — 열려있으면 닫고, 닫혀있으면 연다.
      clearLongPress();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        if (draggingRef.current && !dragMovedRef.current) {
          dragMovedRef.current = true;
          setMenuOpen((v) => !v);
        }
      }, 450);
    },
    [clearLongPress, pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (!dragMovedRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      dragMovedRef.current = true;
      clearLongPress();
      // 드래그가 실제로 시작된 시점에만 포인터를 캡처한다 — pointerdown 즉시 캡처하면 이후
      // 모든 포인터 이벤트가 캡슐 루트로만 전달돼 메뉴 항목 버튼의 탭(<4px 이동)을 못 받게 된다.
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
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
    if (menuOpen) return; // 메뉴 항목 클릭이 캡슐로 버블돼도 녹음 토글로 이어지지 않게.
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    // 더블탭(280ms 이내 재탭) → 펼침(peek) 토글(접혔으면 펴고, 펴졌으면 접는다). idle/권한거부
    // 상태에서만 판정 — 녹음중/자동중지 탭(정지·전송)은 지연 없이 즉시 처리해야 하므로 그대로 통과시킨다.
    if (phase === 'idle' || phase === 'permissionDenied') {
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
        setPeek((p) => !p);
        return;
      }
      tapTimerRef.current = window.setTimeout(() => {
        tapTimerRef.current = null;
        handleTap();
      }, 280);
      return;
    }
    handleTap();
  }, [handleTap, menuOpen, phase]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
    };
  }, []);

  // 렌더 조건은 bubbleActive 하나로 모은다 — 폴링/자동재생 게이트와 갈라지면 무한루프가 재발한다.
  if (!bubbleActive) return null;

  // 채널정보 UX(A-7) — 채널명 + (그룹이면) 참석 인원, 상태(수신대기/발신중), 다른 사람 녹음중 소프트 신호.
  const channelName = conversationMeta?.name ?? t('walkieTalkie.bubbleLabel', { defaultValue: '워키토키 음성메시지' });
  const channelLabel = conversationMeta?.isGroup && presence
    ? `${channelName} · ${presence.activeMembers}/${presence.totalMembers}`
    : channelName;
  // 채널명 좌측 참석 dot — 전원 참석이면 초록, 한 명이라도 빠졌으면(또는 참석정보 로딩 전이면) 회색.
  // 1:1 채널도 같은 규칙이다(상대가 들어와 있어야 초록).
  const allPresent = !!presence && presence.activeMembers >= presence.totalMembers;
  const speakingOther = presence?.recordingUsers.find((u) => u.id !== user?.id) ?? null;
  const statusText = phase === 'recording' || phase === 'autoStopped'
    ? t('walkieTalkie.statusRecording', { defaultValue: '발신중' })
    : phase === 'playing'
      ? t('walkieTalkie.statusPlaying', { defaultValue: '재생중' })
      : t('walkieTalkie.statusIdle', { defaultValue: '수신대기' });
  const isRec = phase === 'recording' || phase === 'autoStopped';

  return (
    <>
      {/* 메뉴 펼침 중 바깥 탭 → 닫기. 배경은 어둡히지 않는다(DI 스타일 — 메뉴가 제자리에서 떠 있을 뿐). */}
      {menuOpen && <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />}

      {/* div(role=button) — 캡슐 안에 닫기/취소 버튼을 포함해야 해서 <button> 중첩(무효 HTML)을 피한다. */}
      <div
        ref={rootRef}
        role="button"
        tabIndex={0}
        className={styles.capsule}
        data-phase={phase}
        data-menu-open={menuOpen || undefined}
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
          <div className={styles.topRow}>
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
                <span className={styles.channelRow}>
                  <span
                    className={styles.presenceDot}
                    data-all-present={allPresent || undefined}
                    aria-label={allPresent
                      ? t('walkieTalkie.presenceAll', { defaultValue: '전원 참석' })
                      : t('walkieTalkie.presencePartial', { defaultValue: '일부 미참석' })}
                  />
                  <span className={styles.channelName}>{channelLabel}</span>
                </span>
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
            {/* 재생 대기 큐가 2개 이상이면(연속 수신) 남은 개수를 배지로 노출 — 참석 카운트와 같은 패턴 재사용 */}
            {phase === 'playing' && queue.length > 1 && (
              <span className={styles.count}>{queue.length}</span>
            )}
          </div>
        )}

        {/* 롱프레스 컨텍스트메뉴(대표 지시 2026-08-27) — 별도 패널이 아니라 캡슐 자체가 아래로
            확장된다(DI 스타일: 하나의 연속된 셰이프). 상단 행(topRow)은 그대로 위에 고정되고,
            메뉴 블록이 in-flow 로 그 아래에 펼쳐져 캡슐의 실제 높이·너비가 커진다 — 그래서
            기존 ResizeObserver 가 가로 중앙 유지·화면 하단 클램프(위로 밀어올림)를 그대로 처리한다.
            항상 마운트 — data-open 토글로 펼침/접힘을 트랜지션한다. */}
        <div
          className={styles.menuPanel}
          data-open={menuOpen || undefined}
          role="menu"
        >
          <div className={styles.menuInner}>
            <div className={styles.menuList}>
              <button type="button" role="menuitem" className={styles.menuOption} onClick={handleOpenChannelSheet}>
                {t('walkieTalkie.contextMenuChangeChannel', { defaultValue: '채널 변경' })}
              </button>
              <button type="button" role="menuitem" className={styles.menuOption} onClick={handleResendInvite}>
                {t('walkieTalkie.contextMenuResendInvite', { defaultValue: '초대장 다시 보내기' })}
              </button>
              {PIN_TO_HOME_MENU_ENABLED && (
                <button type="button" role="menuitem" className={styles.menuOption} onClick={handlePinToHome}>
                  {t('walkieTalkie.contextMenuPinToHome', { defaultValue: '홈화면 고정' })}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 수신 음성메시지 재생 전용 — 화면에 보이지 않는다. src 는 재생 이펙트가 큐 head 로 갱신한다. */}
      <audio ref={audioRef} onEnded={handlePlaybackEnded} />

      <WalkieTalkieConsentModal
        open={consentOpen}
        onConsent={handleConsentAgree}
        onClose={() => setConsentOpen(false)}
      />

      <WalkieChannelPickerSheet
        open={channelSheetOpen}
        onClose={() => setChannelSheetOpen(false)}
        onSelect={handleSelectChannel}
        title={t('walkieTalkie.changeChannelTitle', { defaultValue: '채널 변경' })}
      />
    </>
  );
}
