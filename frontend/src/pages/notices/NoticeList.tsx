import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchNotices, type NoticeItem } from '@/api/notices';
import styles from './NoticeList.module.css';

export default function NoticeList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [notices, setNotices] = useState<NoticeItem[]>([]);

  useEffect(() => {
    fetchNotices(i18n.language).then(setNotices).catch(() => {});
  }, [i18n.language]);

  return (
    <>
      <TopBar title={t('notices.title')} />
      <div className={styles.body}>
        {notices.length === 0 ? (
          <p className={styles.empty}>{t('notices.empty')}</p>
        ) : (
          notices.map((n) => (
            <button key={n.id} type="button" className={styles.card} onClick={() => navigate(`/notices/${n.id}`)}>
              <div className={styles.cardTitle}>{n.title}</div>
              <div className={styles.cardMeta}>
                {n.is_pinned && <span className={styles.pinnedBadge}>{t('notices.pinned')}</span>}
                {n.published_at && <span>{new Date(n.published_at).toLocaleDateString()}</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}
