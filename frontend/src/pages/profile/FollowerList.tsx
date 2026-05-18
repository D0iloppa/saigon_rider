import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchFollowers, followUser, unfollowUser } from '@/api/follows';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { AppImage } from '@/components/ui/AppImage';
import { ProfileCard } from '@/components/ProfileCard';
import type { FollowUser } from '@/api/types';
import styles from './FollowList.module.css';

export default function FollowerList() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);

  useEffect(() => {
    if (userId) fetchFollowers(userId).then((r) => setUsers(r.items));
  }, [userId]);

  const handleFollow = async (u: FollowUser) => {
    try {
      await followUser(u.id);
      setFollowedIds((prev) => new Set([...prev, u.id]));
    } catch {
      // already following or error
    }
  };

  const handleUnfollow = (u: FollowUser) => {
    useDialogStore.getState().open({
      message: { mode: 'code', value: 'follow.unfollowConfirm' },
      onConfirm: async () => {
        await unfollowUser(u.id);
        setFollowedIds((prev) => {
          const next = new Set(prev);
          next.delete(u.id);
          return next;
        });
      },
    });
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('follow.followers')} />
      <div className={styles.body}>
        {users.length === 0 ? (
          <div className={styles.empty}>{t('follow.emptyFollowers')}</div>
        ) : (
          users.map((u) => {
            const following = followedIds.has(u.id);
            return (
              <div key={u.id} className={styles.row}>
                <button
                  className={styles.userInfo}
                  onClick={() => setProfileCardUserId(u.id)}
                >
                  <AppImage src={u.avatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
                  <span className={styles.name}>
                    {u.nickname ?? 'Unknown'}
                    <LevelBadge level={u.level} />
                  </span>
                </button>
                {me && u.id !== me.id && (
                  <button
                    className={following ? styles.unfollowBtn : styles.followBtn}
                    onClick={() => following ? handleUnfollow(u) : handleFollow(u)}
                  >
                    {following ? t('follow.unfollowBtn') : t('follow.followBtn')}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />
    </div>
  );
}
