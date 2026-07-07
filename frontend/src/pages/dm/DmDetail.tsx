import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, HandCoins, MapPin, Smile, ImagePlus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { MessageComposer, type MessageComposerHandle } from '@/components/ui/MessageComposer';
import { useKeyboard } from '@/hooks/useKeyboard';
import { api } from '@/api/client';
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
  cancelAppointment,
  proposePriceOffer,
  acceptPriceOffer,
  declinePriceOffer,
  cancelPriceOffer,
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
import styles from './DmDetail.module.css';

export default function DmDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const locationState = useLocation().state as { conv?: DmConversation } | null;
  const user = useUserStore((s) => s.user);
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const session = loadSession();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [conv, setConv] = useState<DmConversation | null>(locationState?.conv ?? null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
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
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<MessageComposerHandle>(null);
  const otherName = conv?.otherUserNickname ?? locationState?.conv?.otherUserNickname ?? t('dm.detailTitle');

  useEffect(() => {
    if (!conversationId) return;
    fetchConversation(conversationId).then(setConv).catch(() => {});
    fetchMessages(conversationId).then((res) => {
      setMessages(res.items);
      markRead(conversationId).then(() => refreshUnread());
    });
    return () => { refreshUnread(); };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      const last = messages[messages.length - 1];
      const res = await fetchMessages(conversationId, 1, last?.createdAt);
      if (res.items.length > 0) {
        setMessages((prev) => [...prev, ...res.items]);
        markRead(conversationId).then(() => refreshUnread());
      }
    }, 5000);
    return () => clearInterval(interval);
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
    } finally {
      setSending(false);
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

  // 약속 길안내: 항상 RideNav 진입(위치 판정으로 막지 않음). HCMC 밖이면 RideNav가 내부에서 구글맵 전환.
  const handleNavigate = (lat: number, lng: number) => {
    navigate(`/ride-nav?type=nav&lat=${lat}&lng=${lng}`);
  };

  const handleReviewSubmitted = () => {
    setReviewed(true);
  };

  const myId = session?.userId ?? user?.id;
  const listing = conv?.contextListing ?? null;

  return (
    <div className={styles.page}>
      <TopBar title={otherName} />

      {/* 매물 컨텍스트 카드 */}
      {listing && (
        <button className={styles.contextCard} type="button" onClick={() => navigate(`/market/${listing.id}`)}>
          <AppImage src={listing.thumbnailUrl ?? undefined} alt="" className={styles.contextThumb} />
          <div className={styles.contextInfo}>
            <span className={styles.contextTitle}>{listing.title}</span>
            <span className={styles.contextPrice}>{formatPriceVnd(listing.priceVnd, t)}</span>
          </div>
        </button>
      )}

      {/* 거래완료 시: 내 후기 있으면 표시, 없으면 후기 보내기 (REF-05) */}
      {listing?.status === 'SOLD' && (
        myReview ? (
          <div className={styles.myReviewBanner}>
            ⭐ {myReview.rating}.0 {t('dm.myReview', { defaultValue: '내 후기' })}
            {myReview.comment ? ` · ${myReview.comment}` : ''}
          </div>
        ) : !reviewed ? (
          <button className={styles.reviewBanner} type="button" onClick={() => setReviewOpen(true)}>
            ⭐ {t('dm.sendReview', { defaultValue: '거래 후기 보내기' })}
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
        {messages.map((m) => {
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
                  {status && <span className={styles.apptStatusPill} data-status={status}>{statusLabel[status]}</span>}
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
                {(canAccept || canComplete || showNav || canCancel) && (
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
                    {showNav && (
                      <button className={styles.apptBtnGhost} type="button"
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
                  {isMine && m.readAt && <span className={styles.read}> ✓</span>}
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
                {isMine && m.readAt && <span className={styles.read}> ✓</span>}
              </div>
            </div>
          );
        })}
      </div>

      <MessageComposer
        ref={composerRef}
        value={input}
        onChange={setInput}
        onSend={handleSend}
        placeholder={t('dm.inputPlaceholder')}
        sending={sending}
        sendAriaLabel={t('dm.sendBtn')}
        menuAriaLabel={t('dm.more', { defaultValue: '더보기' })}
        menuItems={[
          {
            key: 'album',
            icon: <ImagePlus size={26} strokeWidth={1.8} />,
            label: t('dm.album', { defaultValue: '앨범' }),
            onPress: () => fileInputRef.current?.click(),
          },
          // 약속잡기 — 판매자는 항상, 구매자는 판매자의 거래진행 액션 이후에만 (백엔드도 403으로 차단)
          ...(conv?.appointmentUnlocked
            ? [{
                key: 'appt',
                icon: <CalendarPlus size={26} strokeWidth={1.8} />,
                label: t('dm.makeAppointment', { defaultValue: '약속잡기' }),
                onPress: handleOpenAppt,
              }]
            : []),
          // 가격제안 — 매물 대화 + 가격제안 허용 + 판매 종결 전 + 판매자 본인 아님 (백엔드도 403/409로 차단)
          ...(listing?.isNegotiable && listing.status !== 'SOLD' && listing.sellerId !== myId
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

      {/* 가격제안 시트 */}
      {listing && (
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

      {/* 거래 후기 시트 */}
      <ReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        targetId={conv?.otherUserId ?? ''}
        listingId={conv?.contextId ?? undefined}
        onSubmitted={handleReviewSubmitted}
      />
    </div>
  );
}
