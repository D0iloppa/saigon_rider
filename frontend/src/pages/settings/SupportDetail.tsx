import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { toast } from '@/components/ui/Toast';
import { fetchTicket, createReply, type SupportTicketDetail } from '@/api/support';
import styles from './SupportDetail.module.css';

const STATUS_CLASS: Record<string, string> = {
  OPEN: styles.badgeOpen,
  IN_PROGRESS: styles.badgeInProgress,
  RESOLVED: styles.badgeResolved,
};

export default function SupportDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  // FR-1 제안② — ticket===null 이 로딩과 실패를 구분 못 하던 것을 나눈다.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const loadTicket = () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    fetchTicket(id)
      .then(setTicket)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <>
        <TopBar title={t('support.title')} />
        <div className={styles.body}>
          <SkeletonRows count={4} />
        </div>
      </>
    );
  }

  if (error || !ticket) {
    return (
      <>
        <TopBar title={t('support.title')} />
        <div className={styles.body}>
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('support.detailLoadError')}
            actionLabel={t('common.retry')}
            onAction={loadTicket}
          />
        </div>
      </>
    );
  }

  const statusLabel = (s: string) => t(`support.status_${s.toLowerCase()}`, s);
  const isClosed = ticket.status === 'RESOLVED';

  // F-CS-02 FR-1 제안① — 답글 API는 이미 있었다(backend/app/routers/support.py:117). 성공 시
  // 낙관적 append 없이 티켓을 재조회해 버블 목록을 갱신한다.
  const handleSendReply = async () => {
    if (!id || !replyBody.trim()) return;
    setSendingReply(true);
    try {
      const updated = await createReply(id, replyBody.trim());
      setTicket(updated);
      setReplyBody('');
    } catch {
      toast.error(t('support.replySendError'));
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <>
      <TopBar title={ticket.title} />
      <div className={styles.body}>
        <div className={styles.originalCard}>
          <span className={`${styles.badge} ${STATUS_CLASS[ticket.status] ?? ''}`}>
            {statusLabel(ticket.status)}
          </span>
          <div className={styles.originalTitle}>{ticket.title}</div>
          <div className={styles.originalBody}>{ticket.body}</div>
          <div className={styles.originalMeta}>
            {new Date(ticket.created_at).toLocaleString()}
          </div>
        </div>

        <div className={styles.replies}>
          <p className={styles.replySectionTitle}>{t('support.replies')}</p>

          {ticket.replies.length === 0 ? (
            <p className={styles.noReply}>{t('support.noReply')}</p>
          ) : (
            ticket.replies.map((r) => (
              <div key={r.id} className={`${styles.replyBubble} ${r.author_type === 'admin' ? styles.replyAdmin : styles.replyUser}`}>
                <div className={styles.replyMeta}>
                  {r.author_type === 'admin' ? t('support.adminLabel') : t('support.userLabel')}
                  {' · '}
                  {new Date(r.created_at).toLocaleString()}
                </div>
                {r.body}
              </div>
            ))
          )}
        </div>

        {isClosed ? (
          <p className={styles.replyClosedNotice}>{t('support.replyClosedNotice')}</p>
        ) : (
          <div className={styles.replyBar}>
            <input
              className={styles.replyInput}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={t('support.replyPlaceholder')}
              disabled={sendingReply}
            />
            <button
              type="button"
              className={styles.replySendBtn}
              onClick={handleSendReply}
              disabled={sendingReply || !replyBody.trim()}
            >
              {t('support.replySend')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
