import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchFollowing, unfollowUser } from '@/api/follows';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { AppImage } from '@/components/ui/AppImage';
import { ProfileCard } from '@/components/ProfileCard';
import type { FollowUser } from '@/api/types';
import styles from './FollowList.module.css';

export default function FollowingList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);
  const isMyList = me && userId === me.id;
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);

  useEffect(() => {
    if (userId) fetchFollowing(userId).then((r) => setUsers(r.items));
  }, [userId]);

  const handleUnfollow = (u: FollowUser) => {
    useDialogStore.getState().open({
      message: { mode: 'code', value: 'follow.unfollowConfirm' },
      onConfirm: async () => {
        await unfollowUser(u.id);
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
      },
    });
  };

  return (
    <div className={styles.page}>
      <TopBar
        title={t('follow.following')}
        rightContent={isMyList ? (
          <button
            style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '1.5rem', cursor: 'pointer', padding: '4px 8px' }}
            onClick={() => navigate('/friends/add')}
            aria-label={t('follow.addFriend')}
          >
            +
          </button>
        ) : undefined}
      />
      <div className={styles.body}>
        {users.length === 0 ? (
          <div className={styles.empty}>{t('follow.emptyFollowing')}</div>
        ) : (
          users.map((u) => (
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
                <button className={styles.unfollowBtn} onClick={() => handleUnfollow(u)}>
                  {t('follow.unfollowBtn')}
                </button>
              )}
            </div>
          ))
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
