import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchFollowing, unfollowUser } from '@/api/follows';
import { useUserStore } from '@/store/useUserStore';
import { LevelBadge } from '@/components/ui/LevelBadge';
import type { FollowUser } from '@/api/types';
import styles from './FollowList.module.css';

export default function FollowingList() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);
  const [users, setUsers] = useState<FollowUser[]>([]);

  useEffect(() => {
    if (userId) fetchFollowing(userId).then((r) => setUsers(r.items));
  }, [userId]);

  const handleUnfollow = async (u: FollowUser) => {
    await unfollowUser(u.id);
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('follow.following')} />
      <div className={styles.body}>
        {users.length === 0 ? (
          <div className={styles.empty}>{t('follow.emptyFollowing')}</div>
        ) : (
          users.map((u) => (
            <div key={u.id} className={styles.row}>
              <img src={u.avatarUrl ?? undefined} alt="" className={styles.avatar} />
              <div className={styles.info}>
                <span className={styles.name}>
                  {u.nickname ?? 'Unknown'}
                  <LevelBadge level={u.level} />
                </span>
              </div>
              {me && u.id !== me.id && (
                <button className={styles.unfollowBtn} onClick={() => handleUnfollow(u)}>
                  {t('follow.unfollowBtn')}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
