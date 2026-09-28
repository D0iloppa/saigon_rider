import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, MessageCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { fetchListingChats, type ListingChatCounterpart } from '@/api/market';
import { relativeTime } from './marketFormat';
import styles from './ListingRequests.module.css';

/** F-S0-02 FR-6: 이 매물로 대화중인 채팅 목록 (판매자 전용, 열람 모드) */
export default function ListingChats() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [items, setItems] = useState<ListingChatCounterpart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    fetchListingChats(id)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={styles.root}>
      <TopBar title={t('market.chatsTitle', { defaultValue: '대화중인 채팅 목록' })} />
      <div className={styles.scroll}>
        {loading ? (
          <div className={`shimmer ${styles.rowSkeleton}`} />
        ) : error ? (
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('market.loadError', { defaultValue: '불러오지 못했어요' })}
            actionLabel={t('common.retry')}
            onAction={load}
          />
        ) : items.length === 0 ? (
          <StateBlock
            icon={MessageCircle}
            title={t('market.chatsEmpty', { defaultValue: '아직 대화중인 채팅이 없어요' })}
          />
        ) : (
          items.map((c) => (
            <button
              key={c.conversationId}
              className={styles.chatRow}
              type="button"
              onClick={() => navigate(`/dm/${c.conversationId}`)}
            >
              <AppImage src={c.counterpartAvatarUrl ?? undefined} alt="" className={styles.chatAvatar} variant="circle" />
              <div className={styles.chatBody}>
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>{c.counterpartNickname ?? '—'}</span>
                  {c.lastMessageAt && <span className={styles.chatTime}>{relativeTime(c.lastMessageAt, t)}</span>}
                </div>
                {c.setSummary && <p className={styles.chatPreview}>{c.setSummary}</p>}
                <div className={styles.badgeRow}>
                  {c.hasOffer && <span className={styles.badge}>{t('market.badgeOffer', { defaultValue: '제안' })}</span>}
                  {c.hasAppointment && <span className={styles.badge}>{t('market.badgeAppointment', { defaultValue: '약속' })}</span>}
                  {c.itemStatus === 'RESERVED' && <span className={styles.badge}>{t('market.statusReserved', { defaultValue: '예약중' })}</span>}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
