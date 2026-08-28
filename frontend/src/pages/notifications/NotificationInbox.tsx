import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, MessageCircle } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationDto } from '@/api/notifications';
import { TopBar } from '@/components/layout/TopBar';
import { relativeTime } from '@/pages/market/marketFormat';
import styles from './NotificationInbox.module.css';

const PAGE_SIZE = 20;

export default function NotificationInbox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useUserStore((s) => s.user?.id);

  const [items, setItems] = useState<NotificationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setLoadError(false);
    fetchNotifications(userId, 1, PAGE_SIZE)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [userId, reloadSeq]);

  const hasMore = items.length < total;

  function loadMore() {
    if (!userId || loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    fetchNotifications(userId, next, PAGE_SIZE)
      .then((r) => { setItems((prev) => [...prev, ...r.items]); setTotal(r.total); setPage(next); })
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
                <button
                  key={n.id}
                  className={`${styles.row} ${n.is_read ? '' : styles.rowUnread}`}
                  onClick={() => handleClick(n)}
                >
                  <div className={`${styles.iconBubble} ${n.type === 'KEYWORD' ? styles.iconKeyword : styles.iconSocial}`}>
                    {n.type === 'KEYWORD' ? <Bell size={18} /> : <MessageCircle size={18} />}
                  </div>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitleLine}>
                      <span className={styles.rowTitle}>{n.title}</span>
                      <span className={styles.rowTime}>{relativeTime(n.created_at, t)}</span>
                    </div>
                    {n.body && <div className={styles.rowText}>{n.body}</div>}
                  </div>
                  {!n.is_read && <span className={styles.unreadDot} />}
                </button>
              ))}
            </div>
            {hasMore && (
              <button className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
                {t('noti.loadMore')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
