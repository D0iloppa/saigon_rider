import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square, X } from 'lucide-react';
import { native, type WalkieTalkieCapability } from '@/lib/native';
import type { WalkieTalkieRecordingResult } from '@/lib/plugins/walkieTalkie';
import type { WalkiePresence } from '@d-modules/walkie-talkie';
import { createWalkieTransport, walkieApi } from '@/lib/walkieSdk';
import { hasWalkieTalkieConsent, isWalkieTalkieOptedOut } from '@/lib/walkieTalkieConsent';
import { WalkieTalkieConsentModal } from './WalkieTalkieConsentModal';
import { sendMessage } from '@/api/dm';
import type { DmConversation } from '@/api/types';
import { loadSession } from '@/lib/session';
import { useUserStore } from '@/store/useUserStore';
import { useWalkieTalkieBubbleStore, type WalkieTalkieConversationMeta } from '@/store/useWalkieTalkieBubbleStore';
import { toast } from '@/components/ui/Toast';
import { playSound } from '@/lib/sound';
import { WalkieChannelPickerSheet } from './WalkieChannelPickerSheet';
import styles from './WalkieTalkieFloatingButton.module.css';

type Phase = 'idle' | 'permissionDenied' | 'recording' | 'autoStopped' | 'uploading';

const BUBBLE_SIZE = 56;
const MARGIN = 12;
// 참석 하트비트 주기. 서버 TTL(45초)의 1/3 이하로 잡아, 한 번 놓쳐도 퇴장으로 오인되지 않는다.
// (SSE 가 붙으면 참석 변화는 푸시로 오고 이 주기는 정합성 보정용으로만 남는다.)
const PRESENCE_HEARTBEAT_MS = 15000;
// 컨텍스트메뉴 "홈화면 고정" — Android 네이티브 위젯 고정(pinToHomeScreen, WalkieTalkieChannelWidgetProvider) 구현 완료.
const PIN_TO_HOME_MENU_ENABLED = true;

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
  const [presence, setPresence] = useState<WalkiePresence | null>(null);
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
  /** 녹음 진입 직전의 캡슐 너비(px) — 녹음중 너비 축소 방지용 바닥값(ResizeObserver 가 갱신). */
  const [lockedWidth, setLockedWidth] = useState(0);
  /**
   * 지금 캡슐 너비를 "녹음 진입 기준값"으로 기억해도 되는 상태인지 (ResizeObserver 콜백이 읽는 미러).
   * 녹음중은 물론이고 권한거부 카드(208px)·롱프레스 메뉴(176px)처럼 캡슐이 다른 레이아웃으로
   * 커져 있을 때 기억하면, 그 값이 녹음중 min-width 로 걸려 캡슐이 두 배로 늘어난다.
   */
  const widthCaptureOkRef = useRef(false);
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
  /** 참석 현황 재조회 — SSE presence/speaking 이벤트가 오면 호출한다(하트비트를 기다리지 않는다). */
  const presenceRefreshRef = useRef<(() => void) | null>(null);
  // 전송엔 성공했지만 clearPendingRecording 이 실패한 항목의 id. bubbleActive 가 다시 켜져
  // 드레인이 재실행돼도 이미 보낸 걸 또 보내지 않도록 막는다(clear 만 재시도).
  const sentPendingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    conversationMetaRef.current = conversationMeta;
  }, [conversationMeta]);

  // "말하는 중" 신호는 **1:1에서도 보낸다**. 종전엔 그룹 전용이었는데("상대가 1명이라 의미 없음"),
  // 상대가 한 명이든 여럿이든 "지금 말하고 있다"는 정보의 가치는 같다(대표 지시 2026-08-28).
  const notifyRecordingStop = useCallback(() => {
    const id = conversationIdRef.current;
    if (id) walkieApi.setSpeaking(id, false).catch(() => {});
    playSound('walkie_ptt_end');
  }, []);

  useEffect(() => {
    native.walkieTalkie.getCapability().then(setCapability).catch(() => setCapability(null));
  }, []);

  // ResizeObserver 콜백이 읽을 미러. useEffect(패시브)로 두면 커밋 후 실행 시점이 브라우저의
  // RO 콜백 전달보다 늦을 수 있어, 녹음 레이아웃의 RO 콜백이 아직 false 를 보고 좁아진 너비를
  // 기준값으로 덮어써 버린다(수정이 간헐적으로 무력화). useLayoutEffect 로 순서를 확정한다.
  useLayoutEffect(() => {
    widthCaptureOkRef.current = phase === 'idle' && !menuOpen;
  }, [phase, menuOpen]);

  // 녹음 상태 이벤트 구독 — 경과시간·레벨미터 + 60초 자동중지(D-4) 감지.
  // available 이 아니라 record 로 판단한다 — available 은 항상 true 라(웹에서도 버블은 뜬다)
  // 녹음 플러그인이 없는 설치본에서 addListener 가 reject 되어 마운트마다 unhandled rejection 이 났다.
  useEffect(() => {
    if (!capability?.record) return;
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
      })
      .catch(() => {
        // 플러그인이 없는 설치본 — 구독만 못 할 뿐, 녹음 진입은 startFlow 가 안내한다.
      });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [capability?.record, notifyRecordingStop]);

  // 캡슐이 실제로 화면에 렌더되는 조건 (아래 early return 들과 동일 집합 — 함께 고쳐야 한다).
  const bubbleActive =
    !!conversationId &&
    !!capability?.available &&
    !!capability.floatingButton &&
    !isWalkieTalkieOptedOut() &&
    !closed;

  // 앱 미실행 중 녹음된 음성 전송 (Android 헤드리스 — 오버레이 버블·홈 위젯).
  // 네이티브는 파일만 남기고 업로드는 못 한다. 이 드레인이 없으면 백그라운드 녹음이 큐에
  // 쌓이기만 하고 **영영 전송되지 않는다**(실제로 그 상태였다).
  useEffect(() => {
    if (!bubbleActive) return;
    let cancelled = false;
    (async () => {
      const pending = await native.walkieTalkie.getPendingRecordings();
      for (const item of pending) {
        if (cancelled) return;
        // 대상 채널을 모르면 보낼 곳이 없다 — 큐에 남겨두면 매번 재시도하므로 버린다.
        if (!item.channelId) {
          await native.walkieTalkie.clearPendingRecording(item.id).catch((err) => {
            console.warn('[walkie] pending clear (no channel) failed', err);
          });
          continue;
        }
        // 이미 전송에 성공했지만 clear 만 실패했던 항목 — 재전송 없이 clear 만 다시 시도한다.
        if (sentPendingIdsRef.current.has(item.id)) {
          try {
            await native.walkieTalkie.clearPendingRecording(item.id);
            sentPendingIdsRef.current.delete(item.id);
          } catch (err) {
            console.warn('[walkie] pending clear retry failed', err);
          }
          continue;
        }
        try {
          const blob = await native.walkieTalkie.readRecordingBlob(item);
          if (blob.size > 0) await walkieApi.sendVoice(item.channelId, blob, item.durationMs);
          sentPendingIdsRef.current.add(item.id);
          // 전송 성공에만 지운다 — 실패하면 다음 실행에 다시 시도한다(재전송은 하지 않는다).
          await native.walkieTalkie.clearPendingRecording(item.id);
          sentPendingIdsRef.current.delete(item.id);
        } catch (err) {
          console.warn('[walkie] pending upload failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bubbleActive]);

  // 채널 참석 — **진입을 서버에 명시적으로 알리고** 머무는 동안 하트비트를 보낸다.
  // 종전엔 앱의 "최근 접속"(User.last_seen_at) 을 참석 대용으로 썼는데, 그건 채널과 무관한
  // 지표라 같은 채널에 둘이 있어도 참석으로 보이지 않았다(대표 지적 2026-08-28).
  useEffect(() => {
    if (!conversationId || !bubbleActive) {
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
      if (cancelled) return;
      walkieApi.join(conversationId).catch(() => {});
      refresh();
    };
    beat();
    const timer = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      presenceRefreshRef.current = null;
      window.clearInterval(timer);
      // 퇴장을 즉시 알린다 — TTL 만 믿으면 상대 화면에 최대 45초간 유령 참석자가 남는다.
      walkieApi.leave(conversationId).catch(() => {});
    };
  }, [conversationId, bubbleActive]);


  // ── 수신 (WalkieTalkie SDK) ──────────────────────────────────────────────
  // 202608 재개편(대표 지시): 수신 음성메시지의 큐잉·자동재생은 더 이상 이 캡슐의 일이 아니다
  // — DmDetail 채팅 버블이 영구 렌더 + 재생을 담당한다(VoiceQueue 는 그쪽에서 쓰지 않는다,
  // "본인이 보낸 것도 보여야 한다"는 요구가 VoiceQueue 의 "본인 발신 제외" 규칙과 맞지 않는다).
  // 이 트랜스포트는 참석·발화(presence/speaking) SSE 이벤트를 즉시 반영하기 위해서만 남긴다 —
  // 커서를 항상 null 로 두면 서버 계약("after 없으면 빈 목록")에 따라 음성 데이터는 오지 않는다.
  const myUserId = session?.userId ?? user?.id ?? '';

  useEffect(() => {
    if (!conversationId || !bubbleActive) return;
    const transport = createWalkieTransport({
      getCursor: () => null,
      onPage: () => {},
      onPresenceChanged: () => presenceRefreshRef.current?.(),
    });
    transport.start(conversationId);
    return () => {
      transport.stop();
    };
  }, [conversationId, bubbleActive]);

  // ── 채널 참여 상태 위젯 (Android ongoing 알림 / iOS Live Activity) ─────────
  // 상태 표시(채널명·참석수·발화중) 전용 — 위젯 안 녹음/재생은 플랫폼이 금지라 탭 딥링크만
  // 한다(navigateTo "dm&id=<channelId>" 규약, 채널 바로가기 위젯과 동일). 웹/구설치본은
  // native.ts 가 no-op/reject 처리하므로 여기선 실패를 조용히 무시한다.
  const statusChannelName = conversationMeta?.name ?? '';
  const statusPresentCount = presence?.present.length ?? 0;
  const statusTotalCount = presence?.members.length ?? 0;
  const statusSpeakingId = presence?.speaking.find((ref) => ref !== myUserId) ?? null;
  const statusSpeakingName = statusSpeakingId ? (presence?.displayNames[statusSpeakingId] ?? '') : '';

  // 시작/종료 — 채널 참여가 시작될 때 띄우고, 채널을 바꾸거나 떠나면(버블 닫기 포함) 내린다.
  useEffect(() => {
    if (!bubbleActive || !conversationId) return;
    native.walkieTalkie
      .startChannelStatus({
        channelId: conversationId,
        channelName: conversationMetaRef.current?.name ?? '',
        presentCount: 0,
        totalCount: 0,
        speakingText: '',
      })
      .catch(() => {});
    return () => {
      native.walkieTalkie.endChannelStatus().catch(() => {});
    };
  }, [bubbleActive, conversationId]);

  // 갱신 — 참석수/발화상태/채널명이 바뀔 때만. 네이티브는 upsert 라 start 와의 경합에 안전하다.
  useEffect(() => {
    if (!bubbleActive || !conversationId) return;
    native.walkieTalkie
      .updateChannelStatus({
        channelId: conversationId,
        channelName: statusChannelName,
        presentCount: statusPresentCount,
        totalCount: statusTotalCount,
        speakingText: statusSpeakingName
          ? t('walkieTalkie.someoneSpeaking', { name: statusSpeakingName, defaultValue: '{{name}}님이 말하는 중' })
          : '',
      })
      .catch(() => {});
  }, [bubbleActive, conversationId, statusChannelName, statusPresentCount, statusTotalCount, statusSpeakingName, t]);

  // 다이나믹 아일랜드식 펼침(peek) — 채널 등장·다른 사람 발화·어텐션 핑 시 자동으로 펼친다.
  // 자동 접힘은 없다(대표 지시 2026-08-27) — 접는 건 더블탭 토글뿐이다.
  const speakingOtherId = presence?.speaking.find((ref) => ref !== myUserId) ?? null;
  const attentionPing = useWalkieTalkieBubbleStore((s) => s.attentionPing);
  useEffect(() => {
    if (!conversationId) return;
    setPeek(true);
  }, [conversationId, speakingOtherId, attentionPing]);

  // 캡슐 크기가 모핑될 때(펼침/접힘) 직전 가로 중심을 유지하며 확장되게 하고, 화면 밖으로
  // 밀려날 때만 반대쪽으로 밀어 넣는다.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      // 녹음 진입 시 캡슐이 좁아지지 않도록 직전 너비를 기억해 둔다. 녹음중·권한거부 카드·
      // 메뉴 펼침 상태에서는 갱신하지 않는다(그 너비를 기준값으로 삼으면 안 된다).
      if (widthCaptureOkRef.current) setLockedWidth((prev) => (prev === w ? prev : w));
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
      // 실패 지점을 남긴다 — 종전엔 어느 단계에서 깨졌는지 알 수 없어(모두 같은 토스트) 기기
      // 테스트마다 왕복이 필요했다. 파일읽기/업로드/전송 중 어디서 났는지 토스트에 그대로 싣는다.
      let step = 'read';
      try {
        const blob = await native.walkieTalkie.readRecordingBlob(result);
        if (blob.size === 0) throw new Error(`empty blob (${result.sizeBytes ?? '?'}B reported)`);
        // 업로드와 메시지 전송이 한 번에 끝난다 — 모듈이 blob 저장(contents 어댑터 경유)과
        // 메시지 생성을 같은 요청에서 처리하므로, 중간에 끊겨 고아 컨텐츠가 남는 경로가 없다.
        step = 'upload';
        await walkieApi.sendVoice(conversationId, blob, result.durationMs ?? 0);
        playSound('dm_send');
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[walkieTalkie] send failed at ${step}`, err);
        toast.error(`${t('walkieTalkie.sendError', { defaultValue: '음성메시지 전송에 실패했어요' })} (${step}: ${reason.slice(0, 90)})`);
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
    if (capability === null) {
      // 아직 getCapability() 응답 전 — "미지원"이 아니라 "준비 중"이다. 구분하지 않으면
      // 마운트 직후 탭했을 때 멀쩡한 네이티브 빌드에도 "앱을 업데이트하라"는 오안내가 뜬다.
      toast.info(t('common.loading', { defaultValue: '불러오는 중...' }));
      return;
    }
    if (!capability.record) {
      // 웹에는 업데이트할 앱이 없다 — 같은 문구를 쓰면 안 된다.
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
      console.error('[walkieTalkie] permission check failed', err);
      toast.error(`${t('walkieTalkie.startError', { defaultValue: '녹음을 시작하지 못했어요' })} (perm: ${reason.slice(0, 90)})`);
      return;
    }
    if (mic !== 'granted') {
      setPhase('permissionDenied');
      return;
    }
    try {
      await native.walkieTalkie.startRecording({ maxDurationSec: capability?.maxDurationSec ?? 60 });
      setPhase('recording');
      playSound('walkie_ptt_start');
      if (conversationId) walkieApi.setSpeaking(conversationId, true).catch(() => {});
    } catch (err) {
      // 네이티브는 PERMISSION_DENIED / SERVICE_UNAVAILABLE / ALREADY_RECORDING / START_FAILED 를
      // 구분해 reject 하는데 종전엔 전부 같은 문구로 덮여 기기에서 원인을 알 수 없었다.
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[walkieTalkie] startRecording failed', err);
      toast.error(`${t('walkieTalkie.startError', { defaultValue: '녹음을 시작하지 못했어요' })} (${reason.slice(0, 90)})`);
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
  // 참석 표기는 그룹뿐 아니라 1:1에서도 의미가 있다(상대가 들어와 있는지) — 채널 참석 기준으로 표시.
  const channelLabel = presence && presence.members.length > 0
    ? `${channelName} · ${presence.present.length}/${presence.members.length}`
    : channelName;
  // 채널명 좌측 참석 dot — 전원 참석이면 초록, 한 명이라도 빠졌으면(또는 참석정보 로딩 전이면) 회색.
  // 1:1 채널도 같은 규칙이다(상대가 들어와 있어야 초록).
  // totalMembers > 0 을 요구한다 — 참석정보가 비어 0/0 으로 오면(스키마 드리프트, 전원 퇴장)
  // ">=" 만으로는 빈 채널이 "전원 참석" 초록으로 빛난다.
  const allPresent = !!presence && presence.members.length > 0 && presence.present.length >= presence.members.length;
  const speakingOtherRef = presence?.speaking.find((ref) => ref !== myUserId) ?? null;
  const speakingOther = speakingOtherRef
    ? { nickname: presence?.displayNames[speakingOtherRef] ?? '' }
    : null;
  const statusText = phase === 'recording' || phase === 'autoStopped'
    ? t('walkieTalkie.statusRecording', { defaultValue: '발신중' })
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
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${dragging ? 1.06 : 1})`,
          // 녹음에 들어갈 때 채널정보 라벨이 빠지면서 캡슐 너비가 줄어들던 것 방지 —
          // 녹음 직전 너비를 바닥값으로 고정한다(대표 지시: 녹음중 사이즈 변경 없음).
          minWidth: isRec && lockedWidth ? lockedWidth : undefined,
        }}
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
                    role="img"
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
            {phase === 'idle' && !peek && presence && presence.members.length > 0 && (
              <span className={styles.count}>{presence.present.length}/{presence.members.length}</span>
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
