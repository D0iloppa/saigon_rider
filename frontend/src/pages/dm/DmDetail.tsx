import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, MapPin } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import LocationPickerSheet, { type PickedLocation } from '../market/LocationPickerSheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { fetchMessages, sendMessage, markRead, fetchConversation } from '@/api/dm';
import { createReview, type ReviewRating } from '@/api/market';
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

const MANNER_TAGS = ['PUNCTUAL', 'KIND', 'FAST_REPLY', 'GOOD_ITEM'] as const;

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
  const [reviewRating, setReviewRating] = useState<ReviewRating | null>(null);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewed, setReviewed] = useState(false);
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
    const whenLabel = apptWhen.replace('T', ' ');
    const placeName = apptPlace?.districtName ?? '';
    const summary = t('dm.apptSummary', { when: whenLabel, place: placeName, defaultValue: `약속 제안: ${whenLabel} ${placeName}` });
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, summary, {
        messageType: 'appointment',
        meta: {
          when: apptWhen,
          place: placeName || undefined,
          placeLat: apptPlace?.lat,
          placeLng: apptPlace?.lng,
        },
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

  const toggleTag = (tag: string) =>
    setReviewTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));

  const handleSubmitReview = async () => {
    if (!conv || !myId || !reviewRating) return;
    try {
      await createReview({
        reviewerId: myId,
        targetId: conv.otherUserId,
        listingId: conv.contextId ?? undefined,
        rating: reviewRating,
        mannerTags: reviewTags,
        comment: reviewComment.trim() || undefined,
      });
      setReviewed(true);
      setReviewOpen(false);
      toast.success(t('dm.reviewSent', { defaultValue: '후기를 보냈습니다' }));
    } catch {
      toast.error(t('dm.reviewError', { defaultValue: '후기 전송 실패' }));
    }
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

      {/* 거래완료 시 후기 보내기 (REF-05) */}
      {listing?.status === 'SOLD' && !reviewed && (
        <button className={styles.reviewBanner} type="button" onClick={() => setReviewOpen(true)}>
          ⭐ {t('dm.sendReview', { defaultValue: '거래 후기 보내기' })}
        </button>
      )}

      <div className={styles.messages} ref={listRef}>
        {messages.map((m) => {
          const isMine = m.senderId === myId;
          if (m.messageType === 'appointment') {
            return (
              <div key={m.id} className={styles.apptCard}>
                <span className={styles.apptBadge}>📅 {t('dm.appointment', { defaultValue: '약속' })}</span>
                <div className={styles.apptWhen}>{(m.meta?.when ?? '').replace('T', ' ')}</div>
                {m.meta?.place && <div className={styles.apptPlace}>📍 {m.meta.place}</div>}
                {m.meta?.placeLat != null && m.meta?.placeLng != null && (
                  <button
                    className={styles.apptNavBtn}
                    type="button"
                    onClick={() => navigate(`/ride-nav?type=nav&lat=${m.meta!.placeLat}&lng=${m.meta!.placeLng}`)}
                  >
                    🧭 {t('dm.navigate', { defaultValue: '길안내' })}
                  </button>
                )}
                <div className={styles.meta}>{formatRelativeTime(m.createdAt)}</div>
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
              : t('dm.apptPlacePick', { defaultValue: '지도에서 동네 선택' })}
          </button>
          <div className={styles.apptSubmit}>
            <Button onClick={handleSendAppointment} disabled={!apptWhen}>
              {t('dm.apptSend', { defaultValue: '약속 제안 보내기' })}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <LocationPickerSheet
        open={apptLocOpen}
        onClose={() => setApptLocOpen(false)}
        value={apptPlace ? { lat: apptPlace.lat, lng: apptPlace.lng } : null}
        onConfirm={setApptPlace}
      />

      {/* 거래 후기 시트 (REF-05) */}
      <BottomSheet open={reviewOpen} onClose={() => setReviewOpen(false)}>
        <div className={styles.apptSheet}>
          <h2 className={styles.apptSheetTitle}>{t('dm.sendReview', { defaultValue: '거래 후기 보내기' })}</h2>

          <label className={styles.apptLabel}>{t('dm.satisfaction', { defaultValue: '만족도' })}</label>
          <div className={styles.ratingRow}>
            <button
              type="button"
              className={`${styles.ratingBtn} ${reviewRating === 'GOOD' ? styles.ratingGood : ''}`}
              onClick={() => setReviewRating('GOOD')}
            >
              👍 {t('dm.ratingGood', { defaultValue: '좋아요' })}
            </button>
            <button
              type="button"
              className={`${styles.ratingBtn} ${reviewRating === 'BAD' ? styles.ratingBad : ''}`}
              onClick={() => setReviewRating('BAD')}
            >
              👎 {t('dm.ratingBad', { defaultValue: '별로예요' })}
            </button>
          </div>

          <label className={styles.apptLabel}>{t('dm.mannerTags', { defaultValue: '매너 칭찬 (선택)' })}</label>
          <div className={styles.tagRow}>
            {MANNER_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`${styles.tagChip} ${reviewTags.includes(tag) ? styles.tagChipActive : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {t(`dm.tag_${tag.toLowerCase()}`)}
              </button>
            ))}
          </div>

          <label className={styles.apptLabel}>{t('dm.reviewComment', { defaultValue: '후기 (선택)' })}</label>
          <textarea
            className={styles.apptInput}
            rows={3}
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder={t('dm.reviewPlaceholder', { defaultValue: '거래 경험을 남겨주세요' })}
          />

          <div className={styles.apptSubmit}>
            <Button onClick={handleSubmitReview} disabled={!reviewRating}>
              {t('dm.reviewSubmit', { defaultValue: '후기 보내기' })}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
