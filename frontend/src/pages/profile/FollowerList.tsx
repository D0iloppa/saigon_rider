import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchFollowers, followUser, unfollowUser } from '@/api/follows';
import { useUserStore } from '@/store/useUserStore';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { AppImage } from '@/components/ui/AppImage';
import type { FollowUser } from '@/api/types';
import styles from './FollowList.module.css';

export default function FollowerList() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);
  const [users, setUsers] = useState<FollowUser[]>([]);

  useEffect(() => {
    if (userId) fetchFollowers(userId).then((r) => setUsers(r.items));
  }, [userId]);

  const handleToggle = async (u: FollowUser) => {
    try {
      await followUser(u.id);
    } catch {
      await unfollowUser(u.id);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('follow.followers')} />
      <div className={styles.body}>
        {users.length === 0 ? (
          <div className={styles.empty}>{t('follow.emptyFollowers')}</div>
        ) : (
          users.map((u) => (
            <div key={u.id} className={styles.row}>
              <AppImage src={u.avatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
              <div className={styles.info}>
                <span className={styles.name}>
                  {u.nickname ?? 'Unknown'}
                  <LevelBadge level={u.level} />
                </span>
              </div>
              {me && u.id !== me.id && (
                <button className={styles.followBtn} onClick={() => handleToggle(u)}>
                  {t('follow.followBtn')}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
