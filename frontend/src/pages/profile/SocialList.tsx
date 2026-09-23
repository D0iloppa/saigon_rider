import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, UserPlus, Users } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import sys from '@/styles/system.module.css';
import { fetchFollowCounts, fetchFollowers, fetchFollowing, followUser, unfollowUser } from '@/api/follows';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { AppImage } from '@/components/ui/AppImage';
import { DEFAULT_AVATAR_URL } from '@/lib/defaults';
import { formatNumber } from '@/lib/format';
import type { FollowUser } from '@/api/types';
import styles from './FollowList.module.css';

interface Props {
  tab: 'followers' | 'following';
}

/** 팔로워/팔로잉 통합 소셜 목록 — 대표 판정(F-SOC-01): "친구" 개념 없음, 탭 하나로 통합. */
export default function SocialList({ tab }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);
  const isMyList = !!me && userId === me.id;
  const [counts, setCounts] = useState<{ followerCount: number; followingCount: number } | null>(null);
  const [followOverrides, setFollowOverrides] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!userId) return;
    fetchFollowCounts(userId).then(setCounts).catch(() => {});
  }, [userId]);

  useEffect(() => {
    setFollowOverrides(new Map());
  }, [tab, userId]);

  const fetchPage = useCallback(async (page: number) => {
    if (!userId) return { items: [], total: 0, page, size: 20 };
    const fetcher = tab === 'followers' ? fetchFollowers : fetchFollowing;
    const r = await fetcher(userId, page);
    return { items: r.items, total: r.total, page, size: 20 };
  }, [tab, userId]);

  const { items: users, isLoading, isLoadingMore, hasMore, error, sentinelRef, reset, loadMore } =
    useInfiniteScroll<FollowUser>(fetchPage, 20, [tab, userId]);

  const isFollowing = (u: FollowUser) => followOverrides.has(u.id) ? followOverrides.get(u.id)! : u.isFollowing;

  const adjustMyFollowingCount = (delta: number) => {
    if (isMyList) setCounts((c) => c ? { ...c, followingCount: c.followingCount + delta } : c);
  };

  const handleFollow = async (u: FollowUser) => {
    try {
      await followUser(u.id);
      setFollowOverrides((prev) => new Map(prev).set(u.id, true));
      adjustMyFollowingCount(1);
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
          // 행을 지우지 않고 버튼만 [팔로우]로 되돌린다 — 서버가 offset 페이지라 행을 빼면 다음 페이지가
          // 밀려 사람이 누락되고, 남긴 행은 실수 언팔로우의 되돌리기 수단이 된다(F-SOC-01 FR-1).
          setFollowOverrides((prev) => new Map(prev).set(u.id, false));
          adjustMyFollowingCount(-1);
        } catch {
          // 실패 토스트는 api client(realFetch)에서 표시됨
        }
      },
    });
  };

  return (
    <div className={styles.page}>
      <TopBar
        title={t('follow.socialTitle')}
        rightContent={isMyList ? (
          <button
            className={styles.headerBtn}
            onClick={() => navigate('/friends/add')}
            aria-label={t('follow.addFriend')}
          >
            <UserPlus size={20} />
          </button>
        ) : undefined}
      />
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'followers' ? styles.tabActive : ''}`}
          onClick={() => navigate(`/followers/${userId}`, { replace: true })}
        >
          {t('follow.followers')}{counts ? ` ${formatNumber(counts.followerCount)}` : ''}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'following' ? styles.tabActive : ''}`}
          onClick={() => navigate(`/following/${userId}`, { replace: true })}
        >
          {t('follow.following')}{counts ? ` ${formatNumber(counts.followingCount)}` : ''}
        </button>
      </div>
      <div className={styles.body}>
        {isLoading ? (
          <SkeletonRows count={5} />
        ) : users.length === 0 && error ? (
          // F-12: 조회 실패를 "목록 없음"으로 위장하지 않고 구분해 재시도를 제공
          <div className={sys.card} style={{ marginTop: 16 }}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('follow.loadError')}
              actionLabel={t('common.retry')}
              onAction={reset}
            />
          </div>
        ) : users.length === 0 ? (
          <div className={sys.card} style={{ marginTop: 16 }}>
            <StateBlock icon={Users} title={tab === 'followers' ? t('follow.emptyFollowers') : t('follow.emptyFollowing')} />
          </div>
        ) : (
          <>
            {users.map((u) => {
              const following = isFollowing(u);
              return (
                <div key={u.id} className={styles.row}>
                  <button
                    className={styles.userInfo}
                    onClick={() => {
                      if (me && u.id === me.id) {
                        navigate('/profile');
                      } else {
                        navigate(`/profile/${u.id}`);
                      }
                    }}
                  >
                    <AppImage src={u.avatarUrl || DEFAULT_AVATAR_URL} alt="" className={styles.avatar} variant="circle" />
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
            })}
            {error && !isLoadingMore && (
              <div className={styles.moreRetry}>
                <button type="button" className={sys.chipBtn} onClick={loadMore}>{t('common.retry')}</button>
              </div>
            )}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </>
        )}
      </div>
    </div>
  );
}
