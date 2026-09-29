import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Heart, PenLine, UsersRound } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { listGroups } from '@/api/community_groups';
import type { CommunityGroup } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { GroupCard } from './GroupCard';
import feedStyles from '@/pages/feed/FeedList.module.css';
import styles from './Community.module.css';

// 내 커뮤니티 허브 (F-CM-03 r13) — ☰ 진입. 내가 쓴 글·좋아요한 글·내 그룹 모음.
export default function CommunityMe() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const groupsRef = useRef<HTMLDivElement>(null);

  const loadGroups = () => {
    setLoading(true);
    setError(false);
    listGroups('mine', 1, 50)
      .then((r) => setGroups(r.items))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(loadGroups, []);

  return (
    <div className={styles.page}>
      <TopBar title={t('communityGroup.hubTitle')} />
      <div className={styles.scroll}>
        <button type="button" className={styles.profileRow} data-testid="hub-profile" onClick={() => navigate('/profile')}>
          <AppImage src={user?.avatarUrl} alt="" className={`${feedStyles.avatar} ${styles.profileAvatar}`} variant="circle" />
          <span className={styles.profileName}>{user?.nickname}</span>
        </button>

        <div className={styles.shortcuts}>
          <button type="button" className={styles.shortcut} data-testid="hub-my-posts" onClick={() => navigate(`/profile/${user?.id}/posts`)}>
            <PenLine size={22} />
            {t('communityGroup.myPosts')}
          </button>
          <button type="button" className={styles.shortcut} data-testid="hub-liked" onClick={() => navigate('/community/me/liked')}>
            <Heart size={22} />
            {t('communityGroup.likedPosts')}
          </button>
          <button
            type="button"
            className={styles.shortcut}
            data-testid="hub-my-groups"
            onClick={() => groupsRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            <UsersRound size={22} />
            {t('communityGroup.myGroups')}
          </button>
        </div>

        <div ref={groupsRef} className={styles.sectionTitle}>{t('communityGroup.myGroups')}</div>
        {error ? (
          <StateBlock icon={AlertCircle} tone="error" title={t('feed.loadError')} actionLabel={t('common.retry')} onAction={loadGroups} />
        ) : !loading && groups.length === 0 ? (
          <div className={styles.empty}>
            <StateBlock icon={UsersRound} title={t('communityGroup.myGroupsEmpty')} />
            <Button onClick={() => navigate('/community/groups', { replace: true })}>
              {t('communityGroup.browseTitle')}
            </Button>
          </div>
        ) : (
          <div className={styles.cardList} data-testid="hub-group-list">
            {groups.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        )}
      </div>
    </div>
  );
}
