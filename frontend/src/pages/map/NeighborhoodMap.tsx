import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SaigonMapV5 from '@/components/maps/SaigonMapV5';
import { regionContains, type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
import DraggableSheet, { type DraggableSheetHandle } from '@/components/ride/DraggableSheet';
import { AppImage } from '@/components/ui/AppImage';
import { shuffle, randAdBatch } from '@/lib/shuffle';
import { useLocationStore } from '@/store/useLocationStore';
import { useUserStore } from '@/store/useUserStore';
import { fetchListings, fetchAds, type ListingCard as Listing, type MarketAd } from '@/api/market';
import { fetchFeed } from '@/api/feed';
import { fetchDistrictCounts, type DistrictCount } from '@/api/map';
import type { FeedPost } from '@/api/types';
import ListingCard from '@/pages/market/ListingCard';
import AdCard from '@/pages/market/AdCard';
import { ProfileCard } from '@/components/ProfileCard';
import { formatRelativeTime } from '@/lib/format';
import styles from './NeighborhoodMap.module.css';

type Tab = 'listings' | 'feed';
const AD_EVERY = 4;
const LISTING_COLOR = '#ff6f3c';
const FEED_COLOR = '#3b82f6';

/**
 * 동네지도 v4 (SGR-287) — SaigonMapV4 풀스크린 + 하단 드래거블 시트.
 * GPS 기준 동 자동 진입 → 전체 depth3 오버레이 → 블록 탭으로 구역 필터링.
 */
export default function NeighborhoodMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSharedCoords = useLocationStore((s) => s.setCoords);
  const setSharedWardName = useLocationStore((s) => s.setWardName);
  const user = useUserStore((s) => s.user);

  const [wardRegion, setWardRegion] = useState<SelectedRegion | null>(null);
  const blockRegion = null;
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [districtCounts, setDistrictCounts] = useState<DistrictCount[]>([]);
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [adLimit, setAdLimit] = useState(randAdBatch);

  const sheetRef = useRef<DraggableSheetHandle>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetchAds(null).then((a) => setAds(shuffle(a))).catch(() => setAds([]));
  }, []);

  useEffect(() => { setAdLimit(randAdBatch()); }, [tab, blockRegion]);

  useEffect(() => {
    fetchDistrictCounts(tab).then(setDistrictCounts).catch(() => setDistrictCounts([]));
  }, [tab]);

  // ward 로드 시 매물·피드 조회
  useEffect(() => {
    if (!wardRegion) return;
    const { lat, lng } = wardRegion;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchListings({ lat, lng, sort: 'recent', hideSold: true, size: 40 }).catch(() => null),
      fetchFeed({ filter: 'neighborhood', lat, lng, size: 40 }).catch(() => null),
    ]).then(([lp, fp]) => {
      if (cancelled) return;
      setListings(lp?.items ?? []);
      setPosts(fp?.items ?? []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [wardRegion]);

  // 활성 영역: 블록 선택 있으면 블록, 없으면 ward 전체
  const activeRegion = blockRegion ?? wardRegion;

  const visibleListings = useMemo(() => {
    if (!activeRegion) return [];
    return listings.filter((l) => l.lat != null && l.lng != null && regionContains(activeRegion, l.lat!, l.lng!));
  }, [listings, activeRegion]);

  const visiblePosts = useMemo(() => {
    if (!activeRegion) return [];
    return posts.filter((p) => p.latitude != null && p.longitude != null && regionContains(activeRegion, p.latitude!, p.longitude!));
  }, [posts, activeRegion]);

  // depth2/3 마커 (선택 영역 기준)
  const markers = useMemo<MapMarkerV2[]>(() => {
    const color = tab === 'listings' ? LISTING_COLOR : FEED_COLOR;
    if (tab === 'listings') {
      return visibleListings
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng!, color, onClick: () => handleMarkerClick(l.id) }));
    }
    return visiblePosts
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({ id: p.id, lat: p.latitude!, lng: p.longitude!, color, onClick: () => handleMarkerClick(p.id) }));
  }, [tab, visibleListings, visiblePosts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegionSelect = (region: SelectedRegion) => {
    setWardRegion(region);
    setSelectedId(null);
    setExpandedPostId(null);
    setSharedCoords({ lat: region.lat, lng: region.lng });
    setSharedWardName(region.name);
  };

  const handleMarkerClick = (id: string) => {
    setSelectedId(id);
    if (tab === 'feed') setExpandedPostId(id);
    sheetRef.current?.expand();
    requestAnimationFrame(() => {
      itemRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const switchTab = (tb: Tab) => {
    setTab(tb);
    setExpandedPostId(null);
    setSelectedId(null);
  };

  const visibleCount = tab === 'listings' ? visibleListings.length : visiblePosts.length;
  const totalCount = districtCounts.reduce((s, d) => s + d.count, 0);

  const adAt = (i: number) => {
    if (ads.length === 0 || i % AD_EVERY !== 0) return null;
    const ord = Math.floor(i / AD_EVERY);
    if (ord >= adLimit) return null;
    const ad = ads[ord % ads.length];
    return <AdCard ad={ad} onClick={() => navigate(`/market/ad/${ad.id}`)} />;
  };

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setAdLimit((prev) => prev + randAdBatch());
    }
  };

  const sheetHeader = (
    <div className={styles.sheetHead}>
      <div className={styles.segment}>
        {(['listings', 'feed'] as Tab[]).map((tb) => (
          <button
            key={tb}
            type="button"
            className={`${styles.segBtn} ${tab === tb ? styles.segActive : ''}`}
            onClick={() => switchTab(tb)}
          >
            {tb === 'listings' ? t('map.tabListings', { defaultValue: '상품' }) : t('map.tabFeed', { defaultValue: '피드' })}
          </button>
        ))}
      </div>
      <span className={styles.count}>
        {wardRegion
          ? t('map.count', { count: visibleCount, defaultValue: `${visibleCount}건` })
          : t('map.totalCount', { count: totalCount, defaultValue: `총 ${totalCount}건` })}
      </span>
    </div>
  );

  const renderBody = () => {
    if (!wardRegion) {
      return (
        <p className={styles.guide}>
          📍 {t('map.locating', { defaultValue: '내 위치를 확인 중입니다…' })}
        </p>
      );
    }
    if (loading) {
      return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
    }
    const emptyMsg = tab === 'listings'
      ? t('map.emptyListings', { defaultValue: '이 동네 매물이 없어요' })
      : t('map.emptyFeed', { defaultValue: '이 동네 피드가 없어요' });

    if (tab === 'listings') {
      return visibleListings.length === 0 ? (
        <p className={styles.empty}>{emptyMsg}</p>
      ) : (
        visibleListings.map((l, i) => (
          <Fragment key={l.id}>
            <div
              ref={(el) => { itemRefs.current[l.id] = el; }}
              className={l.id === selectedId ? styles.selected : undefined}
            >
              <ListingCard listing={l} onClick={() => navigate(`/market/${l.id}`)} />
            </div>
            {adAt(i)}
          </Fragment>
        ))
      );
    }

    return visiblePosts.length === 0 ? (
      <p className={styles.empty}>{emptyMsg}</p>
    ) : (
      visiblePosts.map((p, i) => {
        const isExpanded = expandedPostId === p.id;
        return (
          <Fragment key={p.id}>
            <div
              ref={(el) => { itemRefs.current[p.id] = el; }}
              className={`${styles.feedCard} ${p.id === selectedId ? styles.selected : ''}`}
            >
              <button
                type="button"
                className={styles.feedRow}
                onClick={() => setExpandedPostId(isExpanded ? null : p.id)}
              >
                <button
                  type="button"
                  className={styles.feedAvatarBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (user && p.userId === user.id) navigate('/profile');
                    else setProfileCardUserId(p.userId);
                  }}
                >
                  <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.feedAvatar} variant="circle" />
                </button>
                <div className={styles.feedBody}>
                  <span className={styles.feedName}>{p.userNickname ?? '—'}</span>
                  {p.caption && <p className={styles.feedCaption}>{p.caption}</p>}
                </div>
                {p.photoUrl && !isExpanded && (
                  <div className={styles.feedThumbWrap}>
                    <AppImage src={p.photoUrl} alt="" className={styles.feedThumbImg} />
                  </div>
                )}
                <span className={styles.feedChevron}>{isExpanded ? '▲' : '▽'}</span>
              </button>
              {isExpanded && (
                <div className={styles.feedExpanded}>
                  {p.photoUrl && (
                    <div className={styles.feedExpandedImgWrap}>
                      <AppImage src={p.photoUrl} alt="" />
                    </div>
                  )}
                  {p.caption && <p className={styles.feedExpandedCaption}>{p.caption}</p>}
                  {p.hashtags.length > 0 && (
                    <div className={styles.feedHashtags}>
                      {p.hashtags.map((tag) => (
                        <span key={tag} className={styles.feedHashtag}>#{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className={styles.feedMeta}>
                    <span>🔥 {p.cheerCount}</span>
                    <span>💬 {p.commentCount}</span>
                    <span className={styles.feedTime}>{formatRelativeTime(p.createdAt)}</span>
                  </div>
                </div>
              )}
            </div>
            {adAt(i)}
          </Fragment>
        );
      })
    );
  };

  return (
    <div className={styles.root}>
      <SaigonMapV5
        className={styles.map}
        height="100%"
        locateOnMount
        markers={markers}
        onRegionSelect={handleRegionSelect}
      />

      <DraggableSheet
        ref={sheetRef}
        header={sheetHeader}
        initialCollapsed
        embedded
        midSnap={0.5}
      >
        <div className={styles.list} onScroll={handleListScroll}>{renderBody()}</div>
      </DraggableSheet>

      <ProfileCard
        userId={profileCardUserId}
        open={!!profileCardUserId}
        onClose={() => setProfileCardUserId(null)}
      />
    </div>
  );
}
