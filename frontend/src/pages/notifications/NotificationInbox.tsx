import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  type NotificationDto,
} from '@/api/notifications';
import { TopBar } from '@/components/layout/TopBar';
import { NotificationRow } from './NotificationRow';
import styles from './NotificationInbox.module.css';

const PAGE_SIZE = 20;

export default function NotificationInbox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useUserStore((s) => s.user?.id);

  const [items, setItems] = useState<NotificationDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    fetchNotifications(userId, PAGE_SIZE)
      .then((r) => { setItems(r.items); setHasMore(r.has_more); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [userId, reloadSeq]);

  function loadMore() {
    if (!userId || loadingMore) return;
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    fetchNotifications(userId, PAGE_SIZE, { created_at: last.created_at, id: last.id })
      .then((r) => {
        setItems((prev) => [...prev, ...r.items]);
        setHasMore(r.has_more);
      })
      .finally(() => setLoadingMore(false));
  }

  function handleClick(n: NotificationDto) {
    if (!n.is_read) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, is_read: true } : it)));
      markNotificationRead(n.id).catch(() => {
        setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, is_read: false } : it)));
      });
    }
    // link 는 LinkRouter 쿼리 규약 그대로 저장됨 (NotificationBridge 와 동일 경로)
    if (n.link) navigate(`/link?action=${n.link}`);
  }

  function handleDelete(id: number) {
    const prevItems = items;
    setItems((prev) => prev.filter((it) => it.id !== id));
    deleteNotification(id).catch(() => setItems(prevItems));
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  function handleMarkAllRead() {
    if (!userId || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    markAllNotificationsRead(userId)
      .then(() => setItems((prev) => prev.map((it) => ({ ...it, is_read: true }))))
      .finally(() => setMarkingAll(false));
  }

  return (
    <div className={styles.page}>
      {/* W2 §① 진입점 지도 3번째 배선(2026-08-17) — KEYWORD 알림을 받고 온 사용자가
          바로 관리 화면으로 이동할 수 있게. */}
      <TopBar
        title={t('noti.title')}
        onBack={() => navigate(-1)}
        rightContent={
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button
                type="button"
                className={styles.markAllBtn}
                onClick={handleMarkAllRead}
                disabled={markingAll}
              >
                {t('noti.markAllRead')}
              </button>
            )}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => navigate('/market/keyword-alerts')}
              aria-label={t('market.keywordAlerts', { defaultValue: '키워드 알림' })}
            >
              <Bell size={20} strokeWidth={2} />
            </button>
          </div>
        }
      />
      <div className={styles.scroll}>
        {loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
        ) : loadError ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><Bell size={38} strokeWidth={1.6} /></div>
            <div className={styles.emptyMsg}>{t('noti.loadError')}</div>
            <div className={styles.emptyDesc}>{t('noti.loadErrorDesc')}</div>
            <button className={styles.loadMore} onClick={() => setReloadSeq((n) => n + 1)}>
              {t('common.retry')}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><Bell size={38} strokeWidth={1.6} /></div>
            <div className={styles.emptyMsg}>{t('noti.empty')}</div>
            <div className={styles.emptyDesc}>{t('noti.emptyDesc')}</div>
          </div>
        ) : (
          <>
            <div className={styles.list}>
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onClick={() => handleClick(n)}
                  onDelete={() => handleDelete(n.id)}
                />
              ))}
            </div>
            {hasMore && (
              <button className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t('common.loading') : t('noti.loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
