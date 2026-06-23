import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '@/api/market';
import styles from './BlockedUsers.module.css';

/** 차단 사용자 관리 — 차단 목록 조회 + 해제. */
export default function BlockedUsers() {
  const { t } = useTranslation();
  const [list, setList] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchBlockedUsers().then(setList).catch(() => setList([])).finally(() => setLoading(false));
  }, []);

  const handleUnblock = async (userId: string) => {
    if (busy) return;
    setBusy(userId);
    try {
      await unblockUser(userId);
      setList((prev) => prev.filter((b) => b.userId !== userId));
      toast.success(t('market.unblockDone', { defaultValue: '차단을 해제했어요' }));
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('settings.blockedUsers', { defaultValue: '차단 사용자 관리' })} />
      <div className={styles.list}>
        {loading ? (
          [0, 1].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
        ) : list.length === 0 ? (
          <p className={styles.empty}>{t('settings.noBlocked', { defaultValue: '차단한 사용자가 없어요' })}</p>
        ) : (
          list.map((b) => (
            <div key={b.userId} className={styles.row}>
              <AppImage src={b.avatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
              <span className={styles.name}>{b.nickname ?? '—'}</span>
              <button
                type="button"
                className={styles.unblockBtn}
                disabled={busy === b.userId}
                onClick={() => handleUnblock(b.userId)}
              >
                {t('market.unblock', { defaultValue: '차단 해제' })}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
