import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Camera, Flame, Globe, MapPin, MessageCircle, Newspaper, Plus, Send, UserRound, Users, type LucideIcon } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import sys from '@/styles/system.module.css';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { fetchFeed, toggleCheer, fetchStories } from '@/api/feed';
import type { StoryItem } from '@/api/feed';
import { formatRelativeTime } from '@/lib/format';
import type { FeedPost } from '@/api/types';
import { StoryAvatar } from '@/components/ui/StoryAvatar';
import { AppImage } from '@/components/ui/AppImage';
import { Chip } from '@/components/ui/Chip';
import { useUserStore } from '@/store/useUserStore';
import { useDmStore } from '@/store/useDmStore';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from '@/components/ui/Toast';
import { resolveUsableLocation } from '@/lib/serviceLocation';
import { ProfileCard } from '@/components/ProfileCard';
import styles from './FeedList.module.css';

type FilterKey = 'all' | 'neighborhood' | 'friends' | 'hot';

// ImageViewer 는 src/components/ui/ImageViewer.tsx 로 승격됨 (2026-07-27).
// 기존 import 경로(`from './FeedList'`)를 쓰는 코드와의 하위호환을 위해 re-export 유지.
export { ImageViewer } from '@/components/ui/ImageViewer';

// ─── FeedList ────────────────────────────────────────────────────────────────
export default function FeedList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const totalUnread = useDmStore((s) => s.totalUnread);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  // neighborhood 필터용 현재 위치 (state — 도착 시 재fetch 트리거)
  const [neighborhoodLoc, setNeighborhoodLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [neighborhoodRequest, setNeighborhoodRequest] = useState(0);

  useEffect(() => { fetchStories().then(setStories); }, []);

  // [내 동네]를 누를 때마다 현재 위치를 측정하고 서비스 밖이면 벤탄 좌표로 필터한다.
  useEffect(() => {
    if (filter !== 'neighborhood') return;
    let cancelled = false;
    resolveUsableLocation()
      .then((location) => {
        if (cancelled) return;
        if (location.source === 'fallback') {
          toast.neutral(t('map.outsideArea', { defaultValue: '서비스 지역 밖이에요 · 호치민 중심을 보여드려요' }));
        }
        setNeighborhoodLoc(location.coords);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(t('feedCreate.locationError'));
        setFilter('all');
      });
    return () => { cancelled = true; };
  }, [filter, neighborhoodRequest, t]);

  const fetchPage = useCallback(async (page: number) => {
    if (filter === 'neighborhood') {
      // 위치 확보 전엔 빈 페이지 — 위치 도착 시 deps 변경으로 재fetch
      if (!neighborhoodLoc) return { items: [], total: 0, page, size: 20 };
      return fetchFeed({ filter, lat: neighborhoodLoc.lat, lng: neighborhoodLoc.lng, userId: user?.id, page });
    }
    if (filter === 'friends' && user) {
      return fetchFeed({ filter, userId: user.id, page });
    }
    return fetchFeed({ filter, page });
  }, [filter, user, neighborhoodLoc]);

  const { items: posts, setItems: setPosts, isLoading, isLoadingMore, hasMore, error: postsError, sentinelRef, reset } =
    useInfiniteScroll<FeedPost>(fetchPage, 20, [filter, user?.id, neighborhoodLoc]);

  const { containerRef: scrollBodyRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(reset);

  const FILTERS: { key: FilterKey; label: string; Icon: LucideIcon }[] = [
    { key: 'all',          label: t('feed.filterAll'),          Icon: Globe },
    { key: 'neighborhood', label: t('feed.filterNeighborhood'), Icon: MapPin },
    { key: 'friends',      label: t('feed.filterFriends'),      Icon: Users },
    { key: 'hot',          label: t('feed.filterHot'),          Icon: Flame },
  ];

  const handleCheer = async (p: FeedPost, e: React.MouseEvent) => {
    e.stopPropagation();
    const { cheered, count } = await toggleCheer(p.id);
    setPosts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, iCheered: cheered, cheerCount: count } : x))
    );
  };

  return (
    <div className={styles.page}>
      <TopBar
        title={t('feed.title')}
        showBack={false}
        leftContent={
          <button className={styles.iconBtn} onClick={() => navigate('/feed/new')} aria-label={t('feedCreate.title')}>
            <Plus size={24} strokeWidth={2.2} />
          </button>
        }
        rightContent={
          <>
            <button className={styles.iconBtn} onClick={() => navigate('/profile')} aria-label={t('tabbar.profile')}>
              <UserRound size={23} strokeWidth={2} />
            </button>
            <button className={styles.iconBtn} onClick={() => navigate('/dm')} aria-label={t('dm.title')} style={{ position: 'relative' }}>
              <Send size={22} strokeWidth={2} />
              {totalUnread > 0 && <span className={styles.unreadDot} />}
            </button>
          </>
        }
      />

      <div className={styles.scrollBody} ref={scrollBodyRef as React.RefObject<HTMLDivElement>}>
      <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div className={styles.body}>
        {/* Story strip — 추후 구현 예정, 임시 숨김 */}
        <div className={styles.storyRow} style={{ display: 'none' }}>
          <div className={`${styles.story} ${styles.storyMe}`}>
            <StoryAvatar label={t('feed.myStory')} isMe />
          </div>
          {stories.map((s) => (
            <div key={s.userId} className={styles.story}>
              <StoryAvatar src={s.avatarUrl ?? undefined} label={`@${s.nickname}`} hasStory />
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className={styles.filterRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              variant={filter === f.key ? 'dark' : 'surface'}
              onClick={() => {
                if (f.key === 'neighborhood') {
                  setNeighborhoodLoc(null);
                  setNeighborhoodRequest((request) => request + 1);
                }
                setFilter(f.key);
              }}
              style={{ cursor: 'pointer' }}
            >
              <f.Icon size={13} strokeWidth={2.2} />
              {f.label}
            </Chip>
          ))}
        </div>

        {/* Posts */}
        {!isLoading && posts.length === 0 && postsError ? (
          // F-12: 조회 실패를 "게시물 없음"으로 위장하지 않고 구분해 재시도를 제공
          <div className={styles.stateCard}>
            <div className={sys.card}>
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('feed.loadError', { defaultValue: '피드를 불러오지 못했어요' })}
                actionLabel={t('common.retry')}
                onAction={reset}
              />
            </div>
          </div>
        ) : !isLoading && posts.length === 0 ? (
          <div className={styles.stateCard}>
            <div className={sys.card}>
              <StateBlock
                icon={Camera}
                title={t('feed.emptyTitle')}
                desc={t('feed.emptySub')}
              />
            </div>
          </div>
        ) : (
          <div className={styles.feed}>
            {isLoading && posts.length === 0 ? (
              /* 그리드 카드 골격 미러 스켈레톤 (스피너 단독 금지 — design-system §5) */
              <div className={styles.feedGrid}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={styles.feedCard}>
                    <div className={styles.feedThumb}><div className={`shimmer ${styles.feedPhoto}`} /></div>
                    <div className={styles.feedBody}>
                      <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                      <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.feedGrid}>
                {posts.map((p) => (
                  <article
                    key={p.id}
                    className={styles.feedCard}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/feed/post/${p.id}`)}
                    onKeyDown={(e) => {
                      // 내부 아바타/응원 버튼에서 버블링된 키다운은 무시 (그 버튼 자체가 반응한다)
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/feed/post/${p.id}`);
                      }
                    }}
                  >
                    <div className={styles.feedThumb}>
                      {p.photoUrl ? (
                        <AppImage src={p.photoUrl} alt="" className={styles.feedPhoto} />
                      ) : (
                        <span className={styles.feedPlaceholder}><Newspaper size={22} /></span>
                      )}
                    </div>
                    <span className={styles.feedBody}>
                      <span className={styles.feedAuthor}>
                        <button
                          type="button"
                          className={styles.avatarBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (user && p.userId === user.id) {
                              navigate('/profile');
                            } else {
                              setProfileCardUserId(p.userId);
                            }
                          }}
                        >
                          <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
                        </button>
                        <strong>{p.userNickname ?? '—'}</strong>
                        <small>{formatRelativeTime(p.createdAt)}</small>
                      </span>
                      <span className={styles.feedCaption}>{p.caption ?? t('feed.noCaption')}</span>
                      <span className={styles.feedMeta}>
                        <button
                          type="button"
                          className={`${styles.cheerBtn} ${p.iCheered ? styles.cheerBtnActive : ''}`}
                          onClick={(e) => handleCheer(p, e)}
                        >
                          <Flame size={12} />
                          {p.cheerCount > 0 && <span>{p.cheerCount}</span>}
                        </button>
                        {p.commentCount > 0 && <span><MessageCircle size={12} />{p.commentCount}</span>}
                      </span>
                    </span>
                  </article>
                ))}
              </div>
            )}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </div>
        )}
      </div>
      </div>{/* contentStyle wrapper */}
      </div>{/* scrollBody */}

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />
    </div>
  );
}
