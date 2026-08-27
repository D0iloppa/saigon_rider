import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CalendarPlus, Check, HandCoins, MailOpen, MapPin, Smile, ImagePlus, MoreVertical, Play, Pause, Mic } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { StarIcon } from '@/components/ui/StarIcon';
import { MessageComposer, type MessageComposerHandle } from '@/components/ui/MessageComposer';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { api, extractErrorCode } from '@/api/client';
import { MOCK_STICKERS, findSticker } from './mockStickers';
import { type PickedLocation } from '../market/LocationPickerSheet';
import AppointmentLocationPicker from './AppointmentLocationPicker';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import {
  fetchMessages,
  sendMessage,
  markRead,
  fetchConversation,
  proposeAppointment,
  acceptAppointment,
  completeAppointment,
  requestAppointmentCompletion,
  declineAppointmentCompletion,
  cancelAppointment,
  proposePriceOffer,
  acceptPriceOffer,
  declinePriceOffer,
  cancelPriceOffer,
  reportConversation,
  removeMember,
  markVoicePlayed,
  DM_REPORT_REASONS,
  type DmReportReason,
} from '@/api/dm';
import type { Appointment, PriceOffer } from '@/api/types';
import PriceOfferSheet from '@/components/market/PriceOfferSheet';
import { fetchMyReview, type ReviewBrief } from '@/api/market';
import ReviewSheet from '@/components/market/ReviewSheet';
import { translateText } from '@/api/translate';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { useDmStore } from '@/store/useDmStore';
import { loadSession } from '@/lib/session';
import { formatRelativeTime } from '@/lib/format';
import type { DmConversation, DmMessage } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { formatPriceVnd } from '../market/marketFormat';
import { WalkieTalkieFloatingButton } from '@/components/dm/WalkieTalkieFloatingButton';
import { DealLiveActions } from '@/components/dm/DealLiveActions';
import styles from './DmDetail.module.css';

// A-8: 음성메시지(message_type='voice') 카드. 표준 HTML5 <audio> 로 재생/진행바만 다룬다(커스텀 오디오 엔진 금지).
// 재생 상태를 카드별로 독립 관리해야 해서 별도 컴포넌트로 분리했다.
function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function VoiceMessageCard({
  msg,
  isMine,
  onPlayed,
  autoPlay,
}: {
  msg: DmMessage;
  isMine: boolean;
  onPlayed: () => void;
  autoPlay?: boolean;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [elapsedSec, setElapsedSec] = useState(0);
  const totalSec = Math.round((msg.meta?.durationMs ?? 0) / 1000);

  // B-4: 음성메시지 알림 탭 딥링크로 진입했을 때 해당 메시지를 자동재생한다.
  useEffect(() => {
    if (autoPlay) audioRef.current?.play();
  }, [autoPlay]);

  // D-6: 재생완료로 파일이 삭제되면 audioUrl 이 null 로 온다 — 더 이상 재생 불가능함을 명시.
  if (!msg.audioUrl) {
    return (
      <div className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs} ${styles.voiceCard}`}>
        <div className={styles.voiceDeleted}>
          <Mic size={16} />
          <span>{t('dm.voicePlayed', { defaultValue: '재생 완료된 음성메시지' })}</span>
        </div>
        <div className={styles.meta}>
          {formatRelativeTime(msg.createdAt)}
          {isMine && msg.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
        </div>
      </div>
    );
  }

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  };

  return (
    <div className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs} ${styles.voiceCard}`}>
      <div className={styles.voiceRow}>
        <button
          type="button"
          className={styles.voicePlayBtn}
          onClick={togglePlay}
          aria-label={playing ? t('dm.voicePause', { defaultValue: '일시정지' }) : t('dm.voicePlay', { defaultValue: '재생' })}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className={styles.voiceProgressTrack}>
          <div className={styles.voiceProgressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className={styles.voiceDuration}>{mmss(playing || elapsedSec > 0 ? elapsedSec : totalSec)}</span>
      </div>
      <audio
        ref={audioRef}
        src={msg.audioUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setElapsedSec(a.currentTime);
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setElapsedSec(0);
          // 내가 보낸 메시지를 내가 재생해도 삭제 트리거가 되면 안 된다 — 상대가 보낸 메시지일 때만 신고.
          // (서버도 발신자 체크를 하지만 불필요한 호출을 프론트에서도 미리 걸러낸다)
          if (!isMine) onPlayed();
        }}
      />
      <div className={styles.meta}>
        {formatRelativeTime(msg.createdAt)}
        {isMine && msg.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
      </div>
    </div>
  );
}

export default function DmDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  // 길안내 버튼 제어용 — 스토어가 이미 끝낸 측위 결과를 읽기만 한다(새로 측정하지 않는다).
  const { available: routeAvailable, reason: routeGateReason } = useServiceAvailability();
  const location = useLocation();
  const locationState = location.state as { conv?: DmConversation } | null;
  // B-4: 음성메시지 알림 탭 딥링크(/dm/:id?voice=1&mid=<messageId>) — 해당 메시지를 자동재생한다.
  const autoPlayMessageId = new URLSearchParams(location.search).get('voice') === '1'
    ? new URLSearchParams(location.search).get('mid')
    : null;
  const user = useUserStore((s) => s.user);
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const session = loadSession();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [conv, setConv] = useState<DmConversation | null>(locationState?.conv ?? null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  // 초기 메시지 로드 상태 — 실패를 "대화 없음"과 구분하기 위해 별도 관리 (P1-6)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [apptWhen, setApptWhen] = useState('');
  const [apptPlace, setApptPlace] = useState<PickedLocation | null>(null);
  const [apptLocOpen, setApptLocOpen] = useState(false);
  const [tr, setTr] = useState<Record<string, string>>({});
  const [trOpen, setTrOpen] = useState<Record<string, boolean>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [myReview, setMyReview] = useState<ReviewBrief | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const otherName = conv?.otherUserNickname ?? locationState?.conv?.otherUserNickname ?? t('dm.detailTitle');
  // 260827 group/open 확장 (§3.5) — 마켓 약속·가격제안 UI 는 direct 에서만 렌더
  const isDirect = (conv?.conversationType ?? locationState?.conv?.conversationType ?? 'direct') === 'direct';
  const roomTitle = conv?.title ?? locationState?.conv?.title ?? t('dm.group', { defaultValue: '그룹톡방' });
  const roomMemberCount = conv?.memberCount ?? locationState?.conv?.memberCount ?? null;

  // 초기 메시지 로드 — 실패 시 loadError 로 구분해 재시도를 제공 (P1-6: 500/timeout 이 빈 대화로 보이던 버그)
  const loadMessages = useCallback(() => {
    if (!conversationId) return;
    setLoading(true);
    setLoadError(false);
    fetchMessages(conversationId)
      .then((res) => {
        setMessages(res.items);
        markRead(conversationId).then(() => refreshUnread()).catch(() => {});
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!conversationId) return;
    fetchConversation(conversationId).then(setConv).catch(() => {});
    loadMessages();
    return () => { refreshUnread(); };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!conversationId) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const last = messages[messages.length - 1];
        const res = await fetchMessages(conversationId, 1, last?.createdAt);
        if (res.items.length > 0) {
          setMessages((prev) => [...prev, ...res.items]);
          markRead(conversationId).then(() => refreshUnread()).catch(() => {});
        }
      } catch {
        // 순단 무시 — 다음 tick 에 재시도
      }
    };
    const interval = setInterval(tick, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [conversationId, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // 바닥 고정 여부 — 사용자가 위로 스크롤해 과거를 보는 중이면 false (자동 스크롤 중단)
  const pinnedRef = useRef(true);
  const kb = useKeyboard();
  // 정착 윈도우 루프가 프레임 단위 스냅으로 키보드 smooth 스크롤을 덮어쓰지 않도록
  // 키보드 표시 여부를 ref 로도 노출 (진입 직후 2초 내 첫 입력창 터치 시 경합 방지)
  const kbVisibleRef = useRef(false);
  useEffect(() => {
    kbVisibleRef.current = kb.visible;
  }, [kb.visible]);

  // 진입/새 메시지 시 바닥 고정 — 스티커·이미지 등 늦게 로드되는 요소가 스크롤 이후에
  // 높이를 키워도(언더슛) 정착 윈도우(2초) 동안 바닥을 유지한다. 사용자가 위로
  // 스크롤하거나 키보드가 뜨면(smooth 스크롤 담당) 즉시 중단한다.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    pinnedRef.current = true;
    const deadline = performance.now() + 2000;
    let raf = 0;
    const tick = (now: number) => {
      if (!pinnedRef.current) return;
      if (kbVisibleRef.current) {
        // 키보드 표시 중 새 메시지 — 프레임 스냅 루프는 smooth 스크롤과 싸우므로
        // smooth 1회로 처리하고 루프는 재예약하지 않는다.
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        return;
      }
      el.scrollTop = el.scrollHeight;
      if (now < deadline) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [messages]);

  // 키보드(iOS 오버레이)가 뜨면 컴포저 스페이서가 메시지 영역을 줄인다 —
  // 최근 메시지가 가려지지 않게 리스트를 바닥으로 부드럽게 재스크롤 (스페이서 렌더 반영 후).
  useEffect(() => {
    // 과거 메시지를 읽는 중(pinned 해제)이면 읽던 위치를 보존한다.
    if (!kb.visible || !pinnedRef.current) return;
    const t = window.setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [kb.visible]);

  // 거래완료(SOLD) 매물에 이미 남긴 후기 확인 — 있으면 배너 숨김 + 내 후기 표시(409 방지).
  useEffect(() => {
    const lid = conv?.contextId;
    if (!lid || conv?.contextListing?.status !== 'SOLD') return;
    fetchMyReview(lid)
      .then((r) => { setMyReview(r); if (r) setReviewed(true); })
      .catch(() => {});
  }, [conv?.contextId, conv?.contextListing?.status]);

  const handleSend = async () => {
    if (!input.trim() || !conversationId || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, text);
      setMessages((prev) => [...prev, msg]);
    } catch (err) {
      // 전송 실패 시 입력을 비운 채로 두지 않고 원문을 복원 — 재입력 없이 한 번의 조작으로 재전송 가능 (P1-6)
      setInput(text);
      const msg = err instanceof Error ? err.message : '';
      toast.error(
        msg.includes('banned_keyword')
          ? t('dm.bannedKeyword', { defaultValue: '금지된 표현이 포함되어 있습니다' })
          : t('common.errorUnexpected'),
      );
    } finally {
      setSending(false);
    }
  };

  // 대화 신고 (T&S)
  const handleReport = async (reason: DmReportReason) => {
    if (!conversationId) return;
    try {
      await reportConversation(conversationId, reason);
      setReportOpen(false);
      toast.success(t('dm.reportDone', { defaultValue: '신고가 접수되었어요' }));
    } catch (err) {
      setReportOpen(false); // 실패해도 닫는다 — 사유를 바꿔도 결과가 같다(MarketDetail 과 동일)
      // R-3(260819 W3) — 취소한 신고 재시도와 처리 중인 신고 재시도는 다른 문구로 안내한다.
      const code = extractErrorCode(err);
      if (code === 'report_already_cancelled') {
        toast.error(t('support.reportAlreadyCancelledError'));
      } else if (code === 'report_already_pending') {
        toast.error(t('support.reportAlreadyPendingError'));
      } else {
        toast.error(t('dm.reportError', { defaultValue: '이미 신고했거나 처리에 실패했어요' }));
      }
    }
  };

  // 사진 첨부: /contents/upload → sendMessage(imageContentId) (MarketCreate 업로드 패턴 동일)
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file || !conversationId || !user || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      form.append('owner_id', user.id);
      const { id } = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      const msg = await sendMessage(conversationId, '', { imageContentId: id });
      setMessages((prev) => [...prev, msg]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  // 스티커 전송: message_type='sticker' + meta.stickerId (백엔드 meta 제네릭, 무변경)
  const handleSendSticker = async (stickerId: string) => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, '', { messageType: 'sticker', meta: { stickerId } });
      setMessages((prev) => [...prev, msg]);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  // 약속잡기 시트 오픈 시 일시 기본값 = 다음 정시(최소 30분 이후). datetime-local은 로컬 타임존 문자열이 필요해 toISOString() 사용 금지.
  const getDefaultApptWhen = () => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const handleOpenAppt = () => {
    if (!apptWhen) setApptWhen(getDefaultApptWhen());
    setApptOpen(true);
  };

  const handleSendAppointment = async () => {
    if (!conversationId || !apptWhen || sending) return;
    setSending(true);
    try {
      const msg = await proposeAppointment(conversationId, {
        whenAt: apptWhen,
        placeName: apptPlace?.districtName ?? null,
        placeLat: apptPlace?.lat ?? null,
        placeLng: apptPlace?.lng ?? null,
      });
      setMessages((prev) => [...prev, msg]);
      setApptOpen(false);
      setApptWhen('');
      setApptPlace(null);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  const handleSendPriceOffer = async (amount: number) => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      const msg = await proposePriceOffer(conversationId, amount);
      // 서버가 직전 PROPOSED 제안을 supersede(CANCELLED) 하므로 로컬 카드도 즉시 갱신 (DM-2)
      setMessages((prev) => [
        ...prev.map((m) =>
          m.priceOffer?.status === 'PROPOSED' && m.priceOffer.id !== msg.priceOffer?.id
            ? { ...m, priceOffer: { ...m.priceOffer, status: 'CANCELLED' as const } }
            : m,
        ),
        msg,
      ]);
      setOfferOpen(false);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  // 제안 상태 변경 후 해당 메시지의 priceOffer 갱신 (약속과 동일 패턴)
  const patchPriceOffer = (offer: PriceOffer) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.priceOffer?.id === offer.id ? { ...msg, priceOffer: offer } : msg)),
    );
  };

  const handlePriceOfferAction = async (
    action: (id: string) => Promise<PriceOffer>,
    offerId: string,
  ) => {
    if (sending) return;
    setSending(true);
    try {
      patchPriceOffer(await action(offerId));
      // 가격제안 수락이 약속잡기 게이트를 풀 수 있으므로 대화 컨텍스트 재조회
      if (conversationId) fetchConversation(conversationId).then(setConv).catch(() => {});
    } catch {
      // 카드가 stale(이미 변경된 제안) → 메시지 재동기화로 카드 상태 교정
      if (conversationId) fetchMessages(conversationId).then((res) => setMessages(res.items)).catch(() => {});
      toast.error(t('dm.priceOfferOutdated', { defaultValue: '제안 상태가 변경되어 새로고침했어요' }));
    } finally {
      setSending(false);
    }
  };

  // P6: DealLiveActions 슬롯에 넘길 "현재 약속" — 대화 내 가장 최근 약속 메시지 기준.
  // 약속이 없는 대화면 null → DealLiveActions 자체가 렌더되지 않는다.
  const currentAppointmentId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const appt = messages[i].appointment;
      if (messages[i].messageType === 'appointment' && appt) return appt.id;
    }
    return null;
  }, [messages]);

  // 약속 상태 변경 후 해당 메시지의 appointment를 갱신 (5초 폴링과 별개로 즉시 반영)
  const patchAppointment = (appt: Appointment) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.appointment?.id === appt.id ? { ...msg, appointment: appt } : msg)),
    );
  };

  const handleAppointmentAction = async (
    action: (id: string) => Promise<Appointment>,
    appointmentId: string,
  ) => {
    if (sending) return;
    setSending(true);
    try {
      patchAppointment(await action(appointmentId));
      // 약속 상태 변경이 매물 상태(RESERVED/SOLD/ON_SALE)를 바꾸므로 컨텍스트 갱신
      if (conversationId) fetchConversation(conversationId).then(setConv).catch(() => {});
    } catch {
      // 카드가 stale(이미 변경된 약속) → 메시지 재동기화로 카드 상태 교정
      if (conversationId) fetchMessages(conversationId).then((res) => setMessages(res.items)).catch(() => {});
      toast.error(t('dm.apptOutdated', { defaultValue: '약속 상태가 변경되어 새로고침했어요' }));
    } finally {
      setSending(false);
    }
  };

  // A-8/D-6: 상대가 보낸 음성메시지 재생완료 신고 — 서버가 파일을 삭제하고 playedAt 을 기록한다.
  const handleVoicePlayed = useCallback((messageId: string) => {
    if (!conversationId) return;
    markVoicePlayed(conversationId, messageId)
      .then((updated) => {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      })
      .catch(() => {});
  }, [conversationId]);

  const handleTranslateMsg = async (msgId: string, content: string) => {
    if (tr[msgId]) {
      setTrOpen((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
      return;
    }
    try {
      const { translated } = await translateText(content);
      setTr((prev) => ({ ...prev, [msgId]: translated }));
      setTrOpen((prev) => ({ ...prev, [msgId]: true }));
    } catch {
      toast.error(t('dm.translateError', { defaultValue: '번역 실패' }));
    }
  };

  // 약속 길안내. **버튼 자체를 제어한다** — 대표 지시 2026-08-13 11:44 ("화면 데이터 로딩될 때
  // 백으로 측정해서 버튼을 제어해야지"). 종전 주석("항상 진입, HCMC 밖이면 RideNav 가 구글맵
  // 전환")은 현행과 맞지 않았다: RideNav 는 구글맵으로 자동 전환하지 않는다.
  const handleNavigate = (lat: number, lng: number) => {
    // disabled 로 두면 조용히 아무 일도 안 일어나 오류로 보인다(대표 지적 2026-08-13) —
    // aria-disabled 로 잠근 티만 내고 탭은 받아 사유를 알린다. 토스트는 기존 것 재사용.
    if (!routeAvailable) {
      toast.neutral(routeGateReason ? t(`locationGate.${routeGateReason}.title`) : t('locationGate.checking', '위치를 확인하고 있어요'));
      return;
    }
    navigate(`/ride-nav?type=nav&lat=${lat}&lng=${lng}`);
  };

  const handleReviewSubmitted = () => {
    setReviewed(true);
  };

  // 그룹/오픈톡방 나가기 — 최소 구현(§3.8): 초대·강퇴 등 세부 관리 UI 는 이 서브태스크 범위 밖.
  const handleLeaveRoom = async () => {
    if (!conversationId) return;
    const uid = session?.userId ?? user?.id;
    if (!uid) return;
    try {
      await removeMember(conversationId, uid);
      navigate('/dm');
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  };

  const myId = session?.userId ?? user?.id;
  const listing = conv?.contextListing ?? null;

  return (
    <div className={styles.page}>
      <TopBar
        title={isDirect ? otherName : roomTitle}
        rightContent={
          <button
            className={styles.headerMoreBtn}
            type="button"
            onClick={() => setReportOpen(true)}
            aria-label={t('dm.more', { defaultValue: '더보기' })}
          >
            <MoreVertical size={22} strokeWidth={2} />
          </button>
        }
      />

      {/* 그룹/오픈톡방 최소 정보 UI (§3.8) — 초대·강퇴·mute 같은 세부 관리는 범위 밖(TODO) */}
      {!isDirect && (
        <div className={styles.roomInfoBar}>
          <span className={styles.roomInfoText}>
            {roomMemberCount != null
              ? t('dm.memberCount', { count: roomMemberCount, defaultValue: '멤버 {{count}}명' })
              : ''}
          </span>
          <button type="button" className={styles.roomLeaveBtn} onClick={handleLeaveRoom}>
            {t('dm.leaveRoom', { defaultValue: '나가기' })}
          </button>
        </div>
      )}

      {/* 매물 컨텍스트 카드 — direct 전용 (마켓 문의 대화) */}
      {isDirect && listing && (
        <button className={styles.contextCard} type="button" onClick={() => navigate(`/market/${listing.id}`)}>
          <AppImage src={listing.thumbnailUrl ?? undefined} alt="" className={styles.contextThumb} />
          <div className={styles.contextInfo}>
            <span className={styles.contextTitle}>{listing.title}</span>
            <span className={styles.contextPrice}>{formatPriceVnd(listing.priceVnd, t)}</span>
          </div>
        </button>
      )}

      {/* 거래완료 시: 내 후기 있으면 표시, 없으면 후기 보내기 (REF-05) — direct 전용 */}
      {isDirect && listing?.status === 'SOLD' && (
        myReview ? (
          <div className={styles.myReviewBanner}>
            <StarIcon size={13} /> {myReview.rating}.0 {t('dm.myReview', { defaultValue: '내 후기' })}
            {myReview.comment ? ` · ${myReview.comment}` : ''}
          </div>
        ) : !reviewed ? (
          <button className={styles.reviewBanner} type="button" onClick={() => setReviewOpen(true)}>
            <StarIcon size={13} /> {t('dm.sendReview', { defaultValue: '거래 후기 보내기' })}
          </button>
        ) : null
      )}

      <div
        className={styles.messages}
        ref={listRef}
        onClick={() => composerRef.current?.close()}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        }}
      >
        {loading ? (
          <p className={styles.loadingText}>{t('common.loading')}</p>
        ) : loadError ? (
          <div role="alert" aria-live="assertive">
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('dm.messagesLoadError', { defaultValue: 'Không tải được tin nhắn' })}
              actionLabel={t('common.retry')}
              onAction={loadMessages}
            />
          </div>
        ) : messages.length === 0 ? (
          <StateBlock icon={MailOpen} title={t('dm.emptyThread', { defaultValue: 'Chưa có tin nhắn nào. Hãy bắt đầu trò chuyện!' })} />
        ) : messages.map((m) => {
          const isMine = m.senderId === myId;
          if (m.messageType === 'appointment') {
            const appt = m.appointment;
            const status = appt?.status;
            const iAmProposer = !!appt && appt.proposerId === myId;
            const whenRaw = appt?.whenAt ?? m.meta?.when ?? '';
            // 서버 저장값(UTC)을 뷰어 로컬 타임존으로 재변환해 표시 (DM-1)
            const whenDate = whenRaw ? new Date(whenRaw) : null;
            const pad2 = (n: number) => String(n).padStart(2, '0');
            const dateText = whenDate
              ? `${whenDate.getFullYear()}.${pad2(whenDate.getMonth() + 1)}.${pad2(whenDate.getDate())}`
              : '';
            const timeText = whenDate ? `${pad2(whenDate.getHours())}:${pad2(whenDate.getMinutes())}` : '';
            const placeText = appt?.placeName ?? m.meta?.place ?? null;
            const lat = appt?.placeLat ?? m.meta?.placeLat ?? null;
            const lng = appt?.placeLng ?? m.meta?.placeLng ?? null;
            const statusLabel: Record<string, string> = {
              PROPOSED: t('dm.apptProposed', { defaultValue: '제안됨' }),
              ACCEPTED: t('dm.apptAccepted', { defaultValue: '확정' }),
              COMPLETED: t('dm.apptCompleted', { defaultValue: '거래완료' }),
              CANCELLED: t('dm.apptCancelled', { defaultValue: '취소됨' }),
            };
            const hasCoords = lat != null && lng != null;
            const showNav = hasCoords && status !== 'CANCELLED';
            const isSeller = !!appt?.sellerId && appt.sellerId === myId;
            const canAccept = !!appt && status === 'PROPOSED' && !iAmProposer;
            const canComplete = !!appt && status === 'ACCEPTED' && isSeller;
            const canCancel = !!appt && (status === 'PROPOSED' || status === 'ACCEPTED');
            // S-16: 완료 요청은 ACCEPTED 의 하위 상태 — 거절된 요청은 "요청 없음"으로 되돌려 재요청을 허용한다.
            const completionPending = !!appt?.completionRequestedAt && !appt.completionDeclinedAt;
            const canRequestCompletion = !!appt && status === 'ACCEPTED' && !isSeller && !completionPending;
            const canDeclineCompletion = !!appt && status === 'ACCEPTED' && isSeller && completionPending;
            const cancelLabel = status === 'ACCEPTED'
              ? t('dm.apptCancel', { defaultValue: '약속 취소' })
              : iAmProposer
                ? t('dm.apptCancelOffer', { defaultValue: '제안 취소' })
                : t('dm.apptReject', { defaultValue: '거절' });
            return (
              <div key={m.id} className={`${styles.apptCard} ${(status && styles[`appt_${status}`]) || ''}`}>
                <div className={styles.apptHeader}>
                  <span className={styles.apptTitle}>
                    <CalendarPlus size={15} /> {t('dm.appointment', { defaultValue: '약속' })}
                  </span>
                  {status && (
                    <span className={styles.apptStatusPill} data-status={status}>
                      {completionPending
                        ? t('dm.apptCompletionRequested', { defaultValue: '완료 요청됨' })
                        : statusLabel[status]}
                    </span>
                  )}
                </div>
                <div className={styles.apptInfo}>
                  <div className={styles.apptRow}>
                    <span className={styles.apptRowLabel}>{t('dm.apptDate', { defaultValue: '날짜' })}</span>
                    <span className={styles.apptRowVal}>{dateText}</span>
                  </div>
                  <div className={styles.apptRow}>
                    <span className={styles.apptRowLabel}>{t('dm.apptTime', { defaultValue: '시간' })}</span>
                    <span className={styles.apptRowVal}>{timeText}</span>
                  </div>
                  {placeText && (
                    <div className={styles.apptRow}>
                      <span className={styles.apptRowLabel}>{t('dm.apptPlace', { defaultValue: '장소' })}</span>
                      <span className={styles.apptRowVal}>{placeText}</span>
                    </div>
                  )}
                </div>
                {/* S-16: 판매자가 앱을 열지 않아 거래가 정체되지 않도록 구매자에게 요청 도선을 준다.
                    거절 시엔 그 사실을 구매자 화면에 남겨야 "요청이 사라진" 것으로 오인하지 않는다.
                    누가 거절했는지로 문구가 갈린다 — 운영 기각(`completionDeclinedBy === null`)을
                    "판매자가 거절"이라고 하면 사실과 다르고 연락할 상대도 잘못 가리킨다. */}
                {appt?.completionDeclinedAt && !isSeller && status === 'ACCEPTED' && (
                  <p className={styles.apptNote}>
                    {appt.completionDeclinedBy
                      ? t('dm.apptCompletionDeclinedNote', { defaultValue: '판매자가 완료 요청을 거절했어요. 대화로 확인해 주세요.' })
                      : t('dm.apptCompletionDismissedNote', { defaultValue: '완료 요청이 운영 검토에서 기각됐어요. 알림에서 사유를 확인해 주세요.' })}
                  </p>
                )}
                {(canAccept || canComplete || showNav || canCancel || canRequestCompletion || canDeclineCompletion) && (
                  <div className={styles.apptActions}>
                    {canAccept && (
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(acceptAppointment, appt.id)}>
                        {t('dm.apptAccept', { defaultValue: '약속 수락' })}
                      </button>
                    )}
                    {canComplete && (
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(completeAppointment, appt.id)}>
                        {t('dm.apptComplete', { defaultValue: '거래 완료' })}
                      </button>
                    )}
                    {canRequestCompletion && (
                      <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(requestAppointmentCompletion, appt.id)}>
                        {appt.completionDeclinedAt
                          ? t('dm.apptRequestCompletionAgain', { defaultValue: '완료 다시 요청' })
                          : t('dm.apptRequestCompletion', { defaultValue: '거래 완료 요청' })}
                      </button>
                    )}
                    {canDeclineCompletion && (
                      <button className={styles.apptBtnGhost} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(declineAppointmentCompletion, appt.id)}>
                        {t('dm.apptDeclineCompletion', { defaultValue: '요청 거절' })}
                      </button>
                    )}
                    {showNav && (
                      <button className={styles.apptBtnGhost} type="button"
                        aria-disabled={!routeAvailable}
                        onClick={() => handleNavigate(lat!, lng!)}>
                        {t('dm.navigate', { defaultValue: '길안내' })}
                      </button>
                    )}
                    {canCancel && (
                      <button className={styles.apptBtnGhost} type="button" disabled={sending}
                        onClick={() => handleAppointmentAction(cancelAppointment, appt.id)}>
                        {cancelLabel}
                      </button>
                    )}
                  </div>
                )}
                <div className={styles.apptTime}>{formatRelativeTime(m.createdAt)}</div>
              </div>
            );
          }
          // 임베드가 없으면(위조/삭제된 제안) 일반 버블로 폴백 — content에 요약 텍스트가 있다
          if (m.messageType === 'price_offer' && m.priceOffer) {
            const offer = m.priceOffer;
            const status = offer.status;
            const iAmProposer = offer.proposerId === myId;
            const statusLabel: Record<string, string> = {
              PROPOSED: t('dm.offerProposed', { defaultValue: '제안됨' }),
              ACCEPTED: t('dm.offerAccepted', { defaultValue: '수락됨' }),
              DECLINED: t('dm.offerDeclined', { defaultValue: '거절됨' }),
              CANCELLED: t('dm.offerCancelled', { defaultValue: '취소됨' }),
            };
            return (
              // 약속 카드(.apptCard) 공용 골격 재사용 — 가격제안 전용은 금액 표시뿐
              <div key={m.id} className={`${styles.apptCard} ${styles[`appt_${status}`] || ''}`}>
                <div className={styles.apptHeader}>
                  <span className={styles.apptTitle}>
                    <HandCoins size={15} /> {t('dm.priceOffer', { defaultValue: '가격제안' })}
                  </span>
                  <span className={styles.apptStatusPill} data-status={status}>{statusLabel[status]}</span>
                </div>
                <div className={styles.offerBody}>
                  <div className={styles.offerAmount}>{formatPriceVnd(offer.amount, t)}</div>
                  {listing && offer.amount !== listing.priceVnd && (
                    <div className={styles.offerCompare}>
                      {t('dm.offerListedPrice', { defaultValue: '판매가' })} {formatPriceVnd(listing.priceVnd, t)}
                    </div>
                  )}
                </div>
                {status === 'PROPOSED' && (
                  <div className={styles.apptActions}>
                    {!iAmProposer && (
                      <>
                        <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                          onClick={() => handlePriceOfferAction(acceptPriceOffer, offer.id)}>
                          {t('dm.offerAccept', { defaultValue: '수락' })}
                        </button>
                        <button className={styles.apptBtnGhost} type="button" disabled={sending}
                          onClick={() => handlePriceOfferAction(declinePriceOffer, offer.id)}>
                          {t('dm.offerDecline', { defaultValue: '거절' })}
                        </button>
                      </>
                    )}
                    {iAmProposer && (
                      <button className={styles.apptBtnGhost} type="button" disabled={sending}
                        onClick={() => handlePriceOfferAction(cancelPriceOffer, offer.id)}>
                        {t('dm.offerCancel', { defaultValue: '제안 취소' })}
                      </button>
                    )}
                  </div>
                )}
                <div className={styles.apptTime}>{formatRelativeTime(m.createdAt)}</div>
              </div>
            );
          }
          if (m.messageType === 'sticker') {
            const st = findSticker(m.meta?.stickerId);
            return (
              <div
                key={m.id}
                className={`${styles.stickerMsg} ${isMine ? styles.stickerMine : styles.stickerTheirs}`}
              >
                {st ? (
                  <img
                    src={st.uri}
                    alt=""
                    className={styles.stickerImg}
                    // 스티커가 정착 윈도우(2초) 이후에 로드돼도 바닥 고정 중이면 재스크롤 (사진 메시지와 동일 패턴)
                    onLoad={() => {
                      if (pinnedRef.current) listRef.current?.scrollTo(0, listRef.current.scrollHeight);
                    }}
                  />
                ) : (
                  <div className={styles.text}>[sticker]</div>
                )}
                <div className={styles.meta}>
                  {formatRelativeTime(m.createdAt)}
                  {isMine && m.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
                </div>
              </div>
            );
          }
          if (m.messageType === 'voice') {
            return (
              <VoiceMessageCard
                key={m.id}
                msg={m}
                isMine={isMine}
                onPlayed={() => handleVoicePlayed(m.id)}
                autoPlay={m.id === autoPlayMessageId}
              />
            );
          }
          // 이미지 첨부(캡션 없음) 메시지 — 버블 배경/패딩 없이 이미지만 (스티커와 동일 패턴)
          if (m.imageUrl && !m.content) {
            return (
              <div
                key={m.id}
                className={`${styles.imageMsg} ${isMine ? styles.imageMine : styles.imageTheirs}`}
              >
                <AppImage
                  src={m.imageUrl}
                  alt=""
                  className={styles.msgImg}
                  /* 이미지 비동기 로드로 높이가 늦게 생겨 오토스크롤이 언더슛 — 바닥 고정 중이면 재스크롤 (스티커와 동일 가드) */
                  onLoad={() => {
                    if (pinnedRef.current) listRef.current?.scrollTo(0, listRef.current.scrollHeight);
                  }}
                />
                <div className={styles.meta}>
                  {formatRelativeTime(m.createdAt)}
                  {isMine && m.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
              {m.content && <div className={styles.text}>{m.content}</div>}
              {m.imageUrl && (
                <AppImage
                  src={m.imageUrl}
                  alt=""
                  className={styles.msgImg}
                  /* 이미지 비동기 로드로 높이가 늦게 생겨 오토스크롤이 언더슛 — 바닥 고정 중이면 재스크롤 (스티커와 동일 가드) */
                  onLoad={() => {
                    if (pinnedRef.current) listRef.current?.scrollTo(0, listRef.current.scrollHeight);
                  }}
                />
              )}
              {m.content && trOpen[m.id] && tr[m.id] && (
                <div className={styles.translated}>{tr[m.id]}</div>
              )}
              {m.content && !isMine && (
                <button className={styles.translateBtn} type="button" onClick={() => handleTranslateMsg(m.id, m.content!)}>
                  {trOpen[m.id]
                    ? t('dm.hideTranslation', { defaultValue: '번역 숨기기' })
                    : t('dm.translate', { defaultValue: '번역' })}
                </button>
              )}
              <div className={styles.meta}>
                {formatRelativeTime(m.createdAt)}
                {isMine && m.readAt && <Check size={12} strokeWidth={2.6} className={styles.read} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* P6: 거래 DM 슬롯 컨테이너 — 약속이 있을 때만 위치공유 위젯 노출 (§7, 워키토키와는 배치만 공유) */}
      <DealLiveActions appointmentId={currentAppointmentId} />

      {/* 워키토키 플로팅 토글 녹음 버블 (A-7) — getCapability().floatingButton=false(웹) 면 내부에서 렌더 스킵 */}
      {conversationId && (
        <WalkieTalkieFloatingButton
          conversationId={conversationId}
          onMessageSent={(msg) => setMessages((prev) => [...prev, msg])}
        />
      )}

      <MessageComposer
        ref={composerRef}
        value={input}
        onChange={setInput}
        onSend={handleSend}
        placeholder={t('dm.inputPlaceholder')}
        // 초기 로드가 끝나기 전(loading/loadError)에는 전송을 잠근다 — 대화 상태를 모르는 채로 보낼 수 없게 (P1-6)
        sending={sending || loading || loadError}
        sendAriaLabel={t('dm.sendBtn')}
        menuAriaLabel={t('dm.more', { defaultValue: '더보기' })}
        menuItems={[
          {
            key: 'album',
            icon: <ImagePlus size={26} strokeWidth={1.8} />,
            label: t('dm.album', { defaultValue: '앨범' }),
            onPress: () => fileInputRef.current?.click(),
          },
          // 약속잡기 — direct 전용. 판매자는 항상, 구매자는 판매자의 거래진행 액션 이후에만 (백엔드도 403으로 차단)
          ...(isDirect && conv?.appointmentUnlocked
            ? [{
                key: 'appt',
                icon: <CalendarPlus size={26} strokeWidth={1.8} />,
                label: t('dm.makeAppointment', { defaultValue: '약속잡기' }),
                onPress: handleOpenAppt,
              }]
            : []),
          // 가격제안 — direct 전용. 매물 대화 + 가격제안 허용 + 판매 종결 전 + 판매자 본인 아님 (백엔드도 403/409로 차단)
          ...(isDirect && listing?.isNegotiable && listing.status !== 'SOLD' && listing.sellerId !== myId
            ? [{
                key: 'offer',
                icon: <HandCoins size={26} strokeWidth={1.8} />,
                label: t('dm.priceOffer', { defaultValue: '가격제안' }),
                onPress: () => setOfferOpen(true),
              }]
            : []),
          {
            key: 'emoticon',
            icon: <Smile size={26} strokeWidth={1.8} />,
            label: t('dm.emoticon', { defaultValue: '이모티콘' }),
            renderPanel: () => (
              <div className={styles.stickerGrid}>
                {MOCK_STICKERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.stickerBtn}
                    onClick={() => handleSendSticker(s.id)}
                  >
                    <img src={s.uri} alt="" className={styles.stickerThumb} />
                  </button>
                ))}
              </div>
            ),
          },
        ]}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleImageSelect}
      />

      {/* 약속잡기 시트 */}
      <BottomSheet open={apptOpen} onClose={() => setApptOpen(false)}>
        <div className={styles.apptSheet}>
          <h2 className={styles.apptSheetTitle}>{t('dm.makeAppointment', { defaultValue: '약속잡기' })}</h2>
          <label className={styles.apptLabel}>{t('dm.apptWhen', { defaultValue: '일시' })}</label>
          <input
            type="datetime-local"
            className={styles.apptInput}
            value={apptWhen}
            onChange={(e) => setApptWhen(e.target.value)}
          />
          <label className={styles.apptLabel}>{t('dm.apptPlace', { defaultValue: '장소' })}</label>
          <button className={styles.apptPlaceBtn} onClick={() => setApptLocOpen(true)}>
            <MapPin size={16} className={styles.apptPlacePin} />
            {apptPlace
              ? apptPlace.districtName
              : t('dm.apptPlacePick', { defaultValue: '지도를 탭해 장소 찍기' })}
          </button>
          <div className={styles.apptSubmit}>
            <Button onClick={handleSendAppointment} disabled={!apptWhen}>
              {t('dm.apptSend', { defaultValue: '약속 제안 보내기' })}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <AppointmentLocationPicker
        open={apptLocOpen}
        onClose={() => setApptLocOpen(false)}
        value={apptPlace ? { lat: apptPlace.lat, lng: apptPlace.lng } : null}
        onConfirm={setApptPlace}
      />

      {/* 가격제안 시트 — direct 전용 */}
      {isDirect && listing && (
        <PriceOfferSheet
          open={offerOpen}
          onClose={() => setOfferOpen(false)}
          listingTitle={listing.title}
          listingThumbnailUrl={listing.thumbnailUrl}
          listingPriceVnd={listing.priceVnd}
          onSubmit={handleSendPriceOffer}
          submitting={sending}
        />
      )}

      {/* 거래 후기 시트 — direct 전용 */}
      {isDirect && (
        <ReviewSheet
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          targetId={conv?.otherUserId ?? ''}
          listingId={conv?.contextId ?? undefined}
          onSubmitted={handleReviewSubmitted}
        />
      )}

      {/* 대화 신고 사유 */}
      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)}>
        <div className={styles.reportSheet}>
          <h2 className={styles.reportSheetTitle}>{t('dm.reportTitle', { defaultValue: '신고 사유' })}</h2>
          {DM_REPORT_REASONS.map((r) => (
            <button key={r} className={styles.reportItem} onClick={() => handleReport(r)}>
              {t(`dm.reportReason_${r}`)}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
