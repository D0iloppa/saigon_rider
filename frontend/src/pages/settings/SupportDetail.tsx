import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchTicket, type SupportTicketDetail } from '@/api/support';
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

  useEffect(() => {
    if (id) fetchTicket(id).then(setTicket).catch(() => {});
  }, [id]);

  if (!ticket) return <TopBar title={t('support.title')} />;

  const statusLabel = (s: string) => t(`support.status_${s.toLowerCase()}`, s);

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
      </div>
    </>
  );
}
