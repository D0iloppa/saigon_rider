import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, UserPlus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import sys from '@/styles/system.module.css';
import { fetchFollowing, followUser, unfollowUser } from '@/api/follows';
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
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchFollowing(userId).then((r) => {
        setUsers(r.items);
        setFollowedIds(new Set(r.items.filter((u) => u.isFollowing).map((u) => u.id)));
      });
    }
  }, [userId]);

  const handleFollow = async (u: FollowUser) => {
    try {
      await followUser(u.id);
      setFollowedIds((prev) => new Set([...prev, u.id]));
    } catch {
      // 실패 토스트는 api client(realFetch)에서 표시됨
    }
  };

  const handleUnfollow = (u: FollowUser) => {
    useDialogStore.getState().open({
      message: { mode: 'code', value: 'follow.unfollowConfirm' },
      onConfirm: async () => {
        try {
          await unfollowUser(u.id);
          if (isMyList) {
            setUsers((prev) => prev.filter((x) => x.id !== u.id));
          } else {
            setFollowedIds((prev) => {
              const next = new Set(prev);
              next.delete(u.id);
              return next;
            });
          }
        } catch {
          // 실패 토스트는 api client(realFetch)에서 표시됨
        }
      },
    });
  };

  return (
    <div className={styles.page}>
      <TopBar
        title={t('follow.following')}
        rightContent={isMyList ? (
          <button
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center' }}
            onClick={() => navigate('/friends/add')}
            aria-label={t('follow.addFriend')}
          >
            <UserPlus size={20} />
          </button>
        ) : undefined}
      />
      <div className={styles.body}>
        {users.length === 0 ? (
          <div className={sys.card} style={{ marginTop: 16 }}>
            <StateBlock icon={Users} title={t('follow.emptyFollowing')} />
          </div>
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
