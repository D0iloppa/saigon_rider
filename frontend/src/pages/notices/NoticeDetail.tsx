import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchNotice, type NoticeDetail as NoticeDetailType } from '@/api/notices';
import styles from './NoticeDetail.module.css';

export default function NoticeDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [notice, setNotice] = useState<NoticeDetailType | null>(null);

  useEffect(() => {
    if (id) fetchNotice(id, i18n.language).then(setNotice).catch(() => {});
  }, [id, i18n.language]);

  if (!notice) return <TopBar title={t('notices.title')} />;

  return (
    <>
      <TopBar title={t('notices.title')} />
      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.title}>{notice.title}</div>
          {notice.published_at && (
            <div className={styles.meta}>{new Date(notice.published_at).toLocaleString()}</div>
          )}
          <div className={styles.content}>{notice.body}</div>
        </div>
      </div>
    </>
  );
}
