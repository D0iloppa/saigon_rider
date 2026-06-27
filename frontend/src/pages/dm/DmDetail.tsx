import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, MapPin } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
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
} from '@/api/dm';
import type { Appointment } from '@/api/types';
import { fetchMyReview, type ReviewBrief } from '@/api/market';
import ReviewSheet from '@/components/market/ReviewSheet';
import { translateText } from '@/api/translate';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { useDmStore } from '@/store/useDmStore';
import { loadSession } from '@/lib/session';
import { formatRelativeTime } from '@/lib/format';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
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
  const [apptWhen, setApptWhen] = useState('');
  const [apptPlace, setApptPlace] = useState<PickedLocation | null>(null);
  const [apptLocOpen, setApptLocOpen] = useState(false);
  const [tr, setTr] = useState<Record<string, string>>({});
  const [trOpen, setTrOpen] = useState<Record<string, boolean>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [myReview, setMyReview] = useState<ReviewBrief | null>(null);
  const keyboardInset = useKeyboardInset();
  const listRef = useRef<HTMLDivElement>(null);
  // 한글/베트남어 IME 조합 중 controlled value 재설정이 글자를 중복시킴 → 조합 중 state 갱신 보류
  const composingRef = useRef(false);
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

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

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
    <div className={styles.page} style={{ height: keyboardInset > 0 ? `calc(100% - ${keyboardInset}px)` : undefined }}>
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

      <div className={styles.messages} ref={listRef}>
        {messages.map((m) => {
          const isMine = m.senderId === myId;
          if (m.messageType === 'appointment') {
            const appt = m.appointment;
            const status = appt?.status;
            const iAmProposer = !!appt && appt.proposerId === myId;
            const whenRaw = appt?.whenAt ?? m.meta?.when ?? '';
            const dateText = whenRaw.slice(0, 10).replace(/-/g, '.');
            const timeText = whenRaw.slice(11, 16);
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
            return (
              <div key={m.id} className={`${styles.apptCard} ${status ? styles[`appt_${status}`] : ''}`}>
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
                <div className={styles.apptActions}>
                  {appt && status === 'PROPOSED' && !iAmProposer && (
                    <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                      onClick={() => handleAppointmentAction(acceptAppointment, appt.id)}>
                      {t('dm.apptAccept', { defaultValue: '약속 수락' })}
                    </button>
                  )}
                  {appt && status === 'ACCEPTED' && isSeller && (
                    <button className={styles.apptBtnPrimary} type="button" disabled={sending}
                      onClick={() => handleAppointmentAction(completeAppointment, appt.id)}>
                      🤝 {t('dm.apptComplete', { defaultValue: '거래 완료' })}
                    </button>
                  )}
                  {showNav && (
                    <button className={styles.apptBtnSecondary} type="button"
                      onClick={() => handleNavigate(lat!, lng!)}>
                      🧭 {t('dm.navigate', { defaultValue: '길안내' })}
                    </button>
                  )}
                  {appt && status === 'PROPOSED' && !iAmProposer && (
                    <button className={styles.apptBtnText} type="button" disabled={sending}
                      onClick={() => handleAppointmentAction(cancelAppointment, appt.id)}>
                      {t('dm.apptReject', { defaultValue: '거절' })}
                    </button>
                  )}
                  {appt && status === 'PROPOSED' && iAmProposer && (
                    <button className={styles.apptBtnText} type="button" disabled={sending}
                      onClick={() => handleAppointmentAction(cancelAppointment, appt.id)}>
                      {t('dm.apptCancel', { defaultValue: '제안 취소' })}
                    </button>
                  )}
                  {appt && status === 'ACCEPTED' && (
                    <button className={styles.apptBtnText} type="button" disabled={sending}
                      onClick={() => handleAppointmentAction(cancelAppointment, appt.id)}>
                      {t('dm.apptCancel', { defaultValue: '약속 취소' })}
                    </button>
                  )}
                </div>
                <div className={styles.apptTime}>{formatRelativeTime(m.createdAt)}</div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}>
              {m.content && <div className={styles.text}>{m.content}</div>}
              {m.imageUrl && <AppImage src={m.imageUrl} alt="" className={styles.msgImg} />}
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

      <div className={styles.inputBar}>
        <button className={styles.apptBtn} onClick={() => setApptOpen(true)} aria-label={t('dm.makeAppointment', { defaultValue: '약속잡기' })}>
          <CalendarPlus size={22} strokeWidth={2} />
        </button>
        <input
          className={styles.input}
          placeholder={t('dm.inputPlaceholder')}
          value={input}
          onChange={(e) => {
            if (composingRef.current) return; // 조합 중에는 갱신 보류(IME가 직접 표시)
            setInput(e.target.value);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            setInput((e.target as HTMLInputElement).value); // 조합 확정값 1회 반영
          }}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={handleSend}
          disabled={!input.trim() || sending}
          aria-label={t('dm.sendBtn')}
        >
          ↗
        </button>
      </div>

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
