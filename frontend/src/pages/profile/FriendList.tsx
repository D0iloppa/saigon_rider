import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, UserPlus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import sys from '@/styles/system.module.css';
import { fetchFriends } from '@/api/follows';
import { createConversation } from '@/api/dm';
import { useUserStore } from '@/store/useUserStore';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import type { FollowUser } from '@/api/types';
import styles from './FollowList.module.css';

export default function FriendList() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const me = useUserStore((s) => s.user);
  const [users, setUsers] = useState<FollowUser[]>([]);

  useEffect(() => {
    if (userId) fetchFriends(userId).then((r) => setUsers(r.items));
  }, [userId]);

  const handleDm = async (u: FollowUser) => {
    try {
      const conv = await createConversation(u.id);
      navigate(`/dm/${conv.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  const rightContent = (
    <button
      style={{ background: 'none', border: 'none', color: 'var(--brand-500)', display: 'flex', alignItems: 'center', padding: '4px 8px', cursor: 'pointer' }}
      onClick={() => navigate('/friends/add')}
      aria-label={t('follow.addFriend')}
    >
      <UserPlus size={20} />
    </button>
  );

  return (
    <div className={styles.page}>
      <TopBar title={t('follow.friends')} rightContent={rightContent} />
      <div className={styles.body}>
        {users.length === 0 ? (
          <div className={sys.card} style={{ marginTop: 16 }}>
            <StateBlock icon={Users} title={t('follow.emptyFriends')} />
          </div>
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
                <Button size="sm" variant="secondary" onClick={() => handleDm(u)}>
                  {t('dm.button')}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
