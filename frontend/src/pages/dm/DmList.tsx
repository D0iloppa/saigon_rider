import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchConversations } from '@/api/dm';
import { formatRelativeTime } from '@/lib/format';
import type { DmConversation } from '@/api/types';
import styles from './DmList.module.css';

export default function DmList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<DmConversation[]>([]);

  useEffect(() => {
    fetchConversations().then(setConversations);
  }, []);

  return (
    <div className={styles.page}>
      <TopBar title={t('dm.title')} />

      <div className={styles.body}>
        {conversations.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>✉️</span>
            <p>{t('dm.empty')}</p>
          </div>
        ) : (
          <div className={styles.list}>
            {conversations.map((c) => (
              <button
                key={c.id}
                className={styles.row}
                onClick={() => navigate(`/dm/${c.id}`, { state: { conv: c } })}
              >
                <img
                  src={c.otherUserAvatarUrl ?? undefined}
                  alt=""
                  className={styles.avatar}
                />
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{c.otherUserNickname ?? 'Unknown'}</span>
                    <span className={styles.time}>{formatRelativeTime(c.lastMessageAt)}</span>
                  </div>
                  <div className={styles.preview}>
                    {c.lastMessagePreview ?? ''}
                  </div>
                </div>
                {c.unreadCount > 0 && (
                  <span className={styles.badge}>{c.unreadCount}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
