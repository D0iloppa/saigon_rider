import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellOff, MailOpen, Trash2, UsersRound } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { WalkieTalkieEntryButton } from '@/components/dm/WalkieTalkieEntryButton';
import { fetchConversations, leaveConversation, toggleMute } from '@/api/dm';
import { formatRelativeTime } from '@/lib/format';
import type { DmConversation } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { useDmStore } from '@/store/useDmStore';
import { formatPriceVnd } from '../market/marketFormat';
import { useConfirmStore } from '@/store/useConfirmStore';
import { toast } from '@/components/ui/Toast';
import styles from './DmList.module.css';

const SWIPE_ACTION_WIDTH = 144;
const SWIPE_OPEN_THRESHOLD = 48;

export default function DmList() {
  const { t } = useTranslation();

  // 가격제안/약속 메시지는 서버 content(한국어 하드코딩) 대신 메타 기반으로 뷰어 로케일 미리보기 조립 (DM-5)
  const previewText = (c: DmConversation): string => {
    if (c.lastMessageType === 'price_offer' && c.lastMessageMeta?.amount != null) {
      return t('dm.offerSummary', {
        amount: formatPriceVnd(c.lastMessageMeta.amount, t),
        defaultValue: '가격 제안: {{amount}}',
      });
    }
    if (c.lastMessageType === 'appointment' && c.lastMessageMeta?.when) {
      const d = new Date(c.lastMessageMeta.when); // UTC → 뷰어 로컬 타임존 (DM-1)
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const when = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      return t('dm.apptSummary', {
        when,
        place: c.lastMessageMeta.place ?? '',
        defaultValue: '약속 제안: {{when}} {{place}}',
      }).trim();
    }
    return c.lastMessagePreview ?? '';
  };
  // 서버는 enum 만 내리고 라벨은 뷰어 로케일로 매핑 (DmDetail 의 약속 상태 라벨과 동일 키 재사용)
  const tradeStatusLabel = (status: string): string =>
    status === 'ACCEPTED'
      ? t('dm.apptAccepted', { defaultValue: '확정' })
      : t('dm.apptProposed', { defaultValue: '제안됨' });

  const navigate = useNavigate();
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; x: number } | null>(null);
  const [mutingId, setMutingId] = useState<string | null>(null);
  const gestureRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    currentOffset: number;
    axis: 'pending' | 'horizontal' | 'vertical';
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  useEffect(() => {
    fetchConversations().then((convs) => {
      setConversations(convs);
      refreshUnread();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // group/open 은 photo_url(있으면), 없으면 이름 이니셜 — 대표 멤버 아바타 스택은 이 서브태스크 범위 밖(§3.5 최소선)
  const rowAvatar = (c: DmConversation) =>
    c.conversationType === 'direct' ? c.otherUserAvatarUrl : c.photoUrl;
  const rowSeed = (c: DmConversation) =>
    c.conversationType === 'direct' ? (c.otherUserId ?? c.id) : c.id;
  const rowName = (c: DmConversation) =>
    c.conversationType === 'direct' ? (c.otherUserNickname ?? 'Unknown') : (c.title ?? t('dm.group', { defaultValue: '그룹톡방' }));

  const requestLeave = (c: DmConversation) => {
    useConfirmStore.getState().open(
      c.conversationType === 'direct'
        ? t('dm.leaveDirectConfirm')
        : t('dm.leaveGroupConfirm'),
      async () => {
        try {
          await leaveConversation(c.id);
          setConversations((current) => current.filter((item) => item.id !== c.id));
          useConfirmStore.getState().close();
          refreshUnread();
        } catch {
          useConfirmStore.getState().close();
          toast.error(t('common.errorUnexpected'));
        }
      },
      { confirmLabel: t('dm.leaveRoom') },
    );
  };

  const handleSwipeStart = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gestureRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: openSwipeId === id ? -SWIPE_ACTION_WIDTH : 0,
      currentOffset: openSwipeId === id ? -SWIPE_ACTION_WIDTH : 0,
      axis: 'pending',
    };
  };

  const handleSwipeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    if (gesture.axis === 'pending' && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (gesture.axis === 'horizontal') e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (gesture.axis !== 'horizontal') return;
    e.preventDefault();
    const x = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, gesture.startOffset + dx));
    gesture.currentOffset = x;
    setDragOffset({ id: gesture.id, x });
  };

  const finishSwipe = (e: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    if (gesture.axis === 'horizontal') {
      setOpenSwipeId(gesture.currentOffset <= -SWIPE_OPEN_THRESHOLD ? gesture.id : null);
      suppressClickRef.current = gesture.id;
      window.setTimeout(() => {
        if (suppressClickRef.current === gesture.id) suppressClickRef.current = null;
      }, 0);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }
    gestureRef.current = null;
    setDragOffset(null);
  };

  const openConversation = (c: DmConversation) => {
    if (suppressClickRef.current === c.id) {
      suppressClickRef.current = null;
      return;
    }
    if (openSwipeId) {
      setOpenSwipeId(null);
      return;
    }
    navigate(`/dm/${c.id}`, { state: { conv: c } });
  };

  const handleMute = async (c: DmConversation) => {
    if (mutingId) return;
    setMutingId(c.id);
    try {
      const muted = await toggleMute(c.id);
      toast.success(muted
        ? t('dm.notificationsMuted', { defaultValue: '채팅 알림을 껐어요' })
        : t('dm.notificationsUnmuted', { defaultValue: '채팅 알림을 켰어요' }));
      setOpenSwipeId(null);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setMutingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar
        title={t('dm.title')}
        rightContent={
          <>
            <WalkieTalkieEntryButton />
            <button
              className={styles.headerAddBtn}
              type="button"
              onClick={() => navigate('/dm/group/new')}
              aria-label={t('dm.createGroup', { defaultValue: '그룹 만들기' })}
            >
              <UsersRound size={20} strokeWidth={2} />
            </button>
          </>
        }
      />

      <div className={styles.body}>
        {conversations.length === 0 ? (
          <StateBlock icon={MailOpen} title={t('dm.empty')} />
        ) : (
          <div className={styles.list}>
            {conversations.map((c) => {
              const swipeOpen = openSwipeId === c.id;
              const offset = dragOffset?.id === c.id
                ? dragOffset.x
                : swipeOpen ? -SWIPE_ACTION_WIDTH : 0;
              return (
                <div key={c.id} className={styles.row}>
                <div className={styles.rowActions} aria-hidden={!swipeOpen}>
                  <button
                    type="button"
                    className={styles.muteAction}
                    disabled={mutingId === c.id}
                    tabIndex={swipeOpen ? 0 : -1}
                    onClick={() => void handleMute(c)}
                    aria-label={t('dm.notificationsAction', { defaultValue: '알림' })}
                  >
                    <BellOff size={22} strokeWidth={2} />
                    <span>{t('dm.notificationsAction', { defaultValue: '알림' })}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.leaveAction}
                    tabIndex={swipeOpen ? 0 : -1}
                    onClick={() => { setOpenSwipeId(null); requestLeave(c); }}
                    aria-label={t('dm.leaveConversationNamed', { name: rowName(c) })}
                  >
                    <Trash2 size={22} strokeWidth={2} />
                    <span>{t('dm.leaveAction', { defaultValue: '나가기' })}</span>
                  </button>
                </div>
                  <div
                    className={styles.rowForeground}
                    data-dragging={dragOffset?.id === c.id || undefined}
                    style={{ transform: `translateX(${offset}px)` }}
                    onPointerDown={(e) => handleSwipeStart(e, c.id)}
                    onPointerMove={handleSwipeMove}
                    onPointerUp={finishSwipe}
                    onPointerCancel={finishSwipe}
                  >
                    <button
                  type="button"
                  className={styles.rowMain}
                  onClick={() => openConversation(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') setOpenSwipeId(c.id);
                    if (e.key === 'ArrowRight') setOpenSwipeId(null);
                  }}
                  aria-expanded={swipeOpen}
                >
                  <Avatar src={rowAvatar(c)} name={rowName(c)} seed={rowSeed(c)} size={48} />
                  <div className={styles.info}>
                    <div className={styles.nameRow}>
                      <span className={styles.name}>
                        {rowName(c)}
                        {c.conversationType !== 'direct' && (
                          <span className={styles.memberCount}> ({c.memberCount})</span>
                        )}
                      </span>
                      <span className={styles.time}>{formatRelativeTime(c.lastMessageAt)}</span>
                    </div>
                    <div className={styles.preview}>
                      {previewText(c)}
                    </div>
                    {c.activeTrades.length > 0 && (
                      <div className={styles.tradeRow}>
                        {c.activeTrades.length === 1 ? (
                          <>
                            <span className={styles.tradeBadge} data-status={c.activeTrades[0].status}>
                              {tradeStatusLabel(c.activeTrades[0].status)}
                            </span>
                            <span className={styles.tradeTitle}>{c.activeTrades[0].listingTitle ?? ''}</span>
                          </>
                        ) : (
                          <span className={styles.tradeTitle}>
                            {t('dm.tradeCount', {
                              count: c.activeTrades.length,
                              defaultValue: '거래 {{count}}건 진행중',
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {c.unreadCount > 0 && <span className={styles.badge}>{c.unreadCount}</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
