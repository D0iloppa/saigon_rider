import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Camera, Flame, Globe, MapPin, MessageCircle, Newspaper, Plus, Send, UserRound, Users, UsersRound, type LucideIcon } from 'lucide-react';
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
import styles from './FeedList.module.css';

type FilterKey = 'all' | 'neighborhood' | 'friends' | 'hot' | 'groups';
const FILTER_KEYS: FilterKey[] = ['all', 'neighborhood', 'friends', 'hot', 'groups'];
// 탭 전환으로 언마운트돼도 스크롤 위치가 살아있게(P2-11) — URL 에 넣기 부적절한 값이라
// sessionStorage 를 쓴다(MarketMain 의 scrollTop 저장 패턴과 동일 결).
const FEED_SCROLL_KEY = 'feed_scroll_v1';

// ImageViewer 는 src/components/ui/ImageViewer.tsx 로 승격됨 (2026-07-27).
// 기존 import 경로(`from './FeedList'`)를 쓰는 코드와의 하위호환을 위해 re-export 유지.
export { ImageViewer } from '@/components/ui/ImageViewer';

// ─── FeedList ────────────────────────────────────────────────────────────────
export default function FeedList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const totalUnread = useDmStore((s) => s.totalUnread);
  const [searchParams, setSearchParams] = useSearchParams();
  // 필터를 URL 쿼리로 보존한다(P2-11). 단 'neighborhood' 복원은 제외 — 이 필터는 GPS
  // 요청을 트리거하는 effect(아래)에 걸려 있어서, 저장된 값을 그대로 복원하면 화면
  // 진입만으로 위치 재요청이 발생한다(service-rules.md — 진입 시 자동 GPS 금지와 동치).
  const [filter, setFilter] = useState<FilterKey>(() => {
    const q = searchParams.get('filter');
    return q && FILTER_KEYS.includes(q as FilterKey) && q !== 'neighborhood' ? (q as FilterKey) : 'all';
  });
  const [stories, setStories] = useState<StoryItem[]>([]);
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
          toast.neutral(t('map.outsideArea', { defaultValue: '서비스 지역 밖이라 중심가 기준으로 보여드려요' }));
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

  // 필터 변경을 URL 쿼리로 되쓴다(P2-11) — replace 만 사용해 히스토리 엔트리를 늘리지 않는다.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (filter === 'all') next.delete('filter'); else next.set('filter', filter);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [filter, searchParams, setSearchParams]);

  // 스크롤 위치 저장 — 스크롤 중 계속 갱신(가벼운 값 저장이라 쓰로틀 없이도 무해).
  useEffect(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    const onScroll = () => sessionStorage.setItem(FEED_SCROLL_KEY, String(el.scrollTop));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollBodyRef]);

  // 스크롤 위치 복원 — 마운트 후 첫 로드가 끝났을 때 1회만. 이후 필터 변경으로 목록이
  // 새로고침돼도 다시 복원하지 않는다(새 필터는 처음부터 보여야 한다 — MarketMain 과 동일 원칙).
  const restoredScrollRef = useRef(false);
  useEffect(() => {
    if (restoredScrollRef.current || isLoading || posts.length === 0) return;
    restoredScrollRef.current = true;
    const el = scrollBodyRef.current;
    const saved = Number(sessionStorage.getItem(FEED_SCROLL_KEY));
    if (el && Number.isFinite(saved) && saved > 0) el.scrollTop = saved;
  }, [isLoading, posts.length, scrollBodyRef]);

  const FILTERS: { key: FilterKey; label: string; Icon: LucideIcon }[] = [
    { key: 'all',          label: t('feed.filterAll'),          Icon: Globe },
    { key: 'neighborhood', label: t('feed.filterNeighborhood'), Icon: MapPin },
    { key: 'friends',      label: t('feed.filterFriends'),      Icon: Users },
    { key: 'hot',          label: t('feed.filterHot'),          Icon: Flame },
    { key: 'groups',       label: t('feed.filterGroups'),       Icon: UsersRound },
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
            <button
              className={styles.iconBtn}
              onClick={() => navigate('/dm')}
              aria-label={totalUnread > 0 ? `${t('dm.title')} (${totalUnread})` : t('dm.title')}
              style={{ position: 'relative' }}
            >
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
        <div className={styles.filterRow} role="radiogroup" aria-label={t('feed.filterGroupLabel', { defaultValue: '피드 필터' })}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              as="button"
              variant={filter === f.key ? 'dark' : 'surface'}
              role="radio"
              aria-checked={filter === f.key}
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
                              navigate(`/profile/${p.userId}`);
                            }
                          }}
                        >
                          <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
                        </button>
                        {/* 닉네임도 프로필 진입점 — 아바타만 탭 가능한 건 인스타·Threads 관례와
                            어긋나고 히트 영역이 22px 로 작다(2026-08-13). */}
                        <strong
                          role="button"
                          tabIndex={0}
                          className={styles.nickBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(user && p.userId === user.id ? '/profile' : `/profile/${p.userId}`);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(user && p.userId === user.id ? '/profile' : `/profile/${p.userId}`);
                          }}
                        >{p.userNickname ?? '—'}</strong>
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

    </div>
  );
}
