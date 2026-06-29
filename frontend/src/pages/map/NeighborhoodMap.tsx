import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LocateFixed, MapPin, RotateCw, X } from 'lucide-react';
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
type BrowseMode = 'viewport' | 'region';
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
  const storedCoords = useLocationStore((s) => s.coords);
  const storedWardName = useLocationStore((s) => s.wardName);
  const setSharedCoords = useLocationStore((s) => s.setCoords);
  const setSharedWardName = useLocationStore((s) => s.setWardName);
  const user = useUserStore((s) => s.user);

  const [mode, setMode] = useState<BrowseMode>('viewport');
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [districtCounts, setDistrictCounts] = useState<DistrictCount[]>([]);
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [adLimit, setAdLimit] = useState(randAdBatch);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(0);

  const sheetRef = useRef<DraggableSheetHandle>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const locateRef = useRef<(() => void) | null>(null);
  const [viewportBbox, setViewportBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleBboxChange = useCallback((bbox: { N: number; S: number; E: number; W: number }) => {
    clearTimeout(bboxTimerRef.current);
    bboxTimerRef.current = setTimeout(() => setViewportBbox(bbox), 500);
  }, []);

  // polyActive=true(내 위치 필터 ON)에는 선택 ward polygon 필터를 사용하고,
  // OFF 상태에서는 현재 지도 viewport 기준으로 주변 동네까지 함께 노출한다.
  const bboxFilter = useMemo(() => (mode === 'viewport' ? viewportBbox : null), [mode, viewportBbox]);

  useEffect(() => {
    fetchAds(null).then((a) => setAds(shuffle(a))).catch(() => setAds([]));
  }, []);

  useEffect(() => { setAdLimit(randAdBatch()); }, [tab, mode, selectedRegion?.name]);

  useEffect(() => {
    fetchDistrictCounts(tab).then(setDistrictCounts).catch(() => setDistrictCounts([]));
  }, [tab]);

  // 매물·피드 조회 — ward 선택 시 또는 뷰포트가 크게 넓어질 때
  useEffect(() => {
    const center = bboxFilter
      ? { lat: (bboxFilter.N + bboxFilter.S) / 2, lng: (bboxFilter.E + bboxFilter.W) / 2 }
      : selectedRegion ? { lat: selectedRegion.lat, lng: selectedRegion.lng } : null;
    if (!center) return;
    const size = bboxFilter ? 50 : 40;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    Promise.allSettled([
      fetchListings({ lat: center.lat, lng: center.lng, sort: 'recent', hideSold: true, size }),
      fetchFeed({ filter: 'neighborhood', lat: center.lat, lng: center.lng, size }),
    ]).then(([lp, fp]) => {
      if (cancelled) return;
      const listingsOk = lp.status === 'fulfilled';
      const feedOk = fp.status === 'fulfilled';
      setListings(listingsOk ? lp.value.items ?? [] : []);
      setPosts(feedOk ? fp.value.items ?? [] : []);
      setLoadError(!listingsOk && !feedOk);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bboxFilter, reloadSeq, selectedRegion]);

  const visibleListings = useMemo(() => {
    if (bboxFilter) {
      return listings.filter((l) =>
        l.lat != null && l.lng != null &&
        l.lat >= bboxFilter.S && l.lat <= bboxFilter.N &&
        l.lng >= bboxFilter.W && l.lng <= bboxFilter.E,
      );
    }
    if (!selectedRegion) return listings;
    return listings.filter((l) => l.lat != null && l.lng != null && regionContains(selectedRegion, l.lat!, l.lng!));
  }, [bboxFilter, listings, selectedRegion]);

  const visiblePosts = useMemo(() => {
    if (bboxFilter) {
      return posts.filter((p) =>
        p.latitude != null && p.longitude != null &&
        p.latitude >= bboxFilter.S && p.latitude <= bboxFilter.N &&
        p.longitude >= bboxFilter.W && p.longitude <= bboxFilter.E,
      );
    }
    if (!selectedRegion) return posts;
    return posts.filter((p) => p.latitude != null && p.longitude != null && regionContains(selectedRegion, p.latitude!, p.longitude!));
  }, [bboxFilter, posts, selectedRegion]);

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
    setMode('region');
    setSelectedRegion(region);
    setViewportBbox(null);
    clearTimeout(bboxTimerRef.current);
    setSelectedId(null);
    setExpandedPostId(null);
    setSharedCoords({ lat: region.lat, lng: region.lng });
    setSharedWardName(region.name);
    sheetRef.current?.snapToMid();
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

  const retryLoad = () => setReloadSeq((n) => n + 1);
  const resetToViewport = () => {
    setMode('viewport');
    setSelectedRegion(null);
    setSelectedId(null);
    setExpandedPostId(null);
    sheetRef.current?.snapToMid();
  };
  const switchToViewport = () => {
    resetToViewport();
  };
  const clearRegionFilter = () => {
    resetToViewport();
  };

  const visibleCount = tab === 'listings' ? visibleListings.length : visiblePosts.length;
  const totalCount = districtCounts.reduce((s, d) => s + d.count, 0);
  const headerCount = mode === 'region' ? visibleCount : (bboxFilter ? visibleCount : totalCount);

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
      <div className={styles.sheetTop}>
        <div className={styles.segment}>
          {(['listings', 'feed'] as Tab[]).map((tb) => (
            <button
              key={tb}
              type="button"
              className={`${styles.segBtn} ${tab === tb ? styles.segActive : ''}`}
              onClick={() => switchTab(tb)}
            >
              {tb === 'listings' ? t('map.tabListings') : t('map.tabFeed')}
            </button>
          ))}
        </div>
        <span className={styles.count}>
          {mode === 'region'
            ? t('map.count', { count: visibleCount })
            : t('map.totalCount', { count: headerCount })}
        </span>
      </div>
    </div>
  );

  const renderBody = () => {
    if (mode === 'viewport' && !bboxFilter) {
      return (
        <div className={styles.guideWrap}>
          <p className={styles.guide}>
            {t('map.selectArea')}
          </p>
          <button type="button" className={styles.guideAction} onClick={() => locateRef.current?.()}>
            <LocateFixed size={15} />
            <span>{t('map.locateMe')}</span>
          </button>
        </div>
      );
    }
    const hasData = tab === 'listings' ? listings.length > 0 : posts.length > 0;
    if (loading && !hasData) {
      return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
    }
    if (loadError) {
      return (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            {t('map.loadError')}
          </p>
          <p className={styles.emptyBody}>
            {t('map.loadErrorDesc')}
          </p>
          <button type="button" className={styles.emptyAction} onClick={retryLoad}>
            <RotateCw size={15} />
            <span>{t('common.retry', { defaultValue: '다시 시도' })}</span>
          </button>
        </div>
      );
    }
    const emptyMsg = tab === 'listings'
      ? t('map.emptyListings')
      : t('map.emptyFeed');

    if (tab === 'listings') {
      return visibleListings.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{emptyMsg}</p>
          <p className={styles.emptyBody}>
            {mode === 'region' ? t('map.emptyWardHint') : t('map.emptyViewportHint')}
          </p>
          {mode === 'region' ? (
            <button type="button" className={styles.emptyAction} onClick={switchToViewport}>
              {t('map.scopeViewport')}
            </button>
          ) : (
            <button type="button" className={styles.emptyGhost} onClick={() => locateRef.current?.()}>
              {t('map.locateMe')}
            </button>
          )}
        </div>
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
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>{emptyMsg}</p>
        <p className={styles.emptyBody}>
          {mode === 'region' ? t('map.emptyWardHint') : t('map.emptyViewportHint')}
        </p>
        {mode === 'region' ? (
          <button type="button" className={styles.emptyAction} onClick={switchToViewport}>
            {t('map.scopeViewport')}
          </button>
        ) : (
          <button type="button" className={styles.emptyGhost} onClick={() => locateRef.current?.()}>
            {t('map.locateMe')}
          </button>
        )}
      </div>
    ) : (
      visiblePosts.map((p, i) => {
        const isExpanded = expandedPostId === p.id;
        return (
          <Fragment key={p.id}>
            <div
              ref={(el) => { itemRefs.current[p.id] = el; }}
              className={`${styles.feedCard} ${p.id === selectedId ? styles.selected : ''}`}
            >
              <div
                className={styles.feedRow}
                role="button"
                tabIndex={0}
                onClick={() => setExpandedPostId(isExpanded ? null : p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedPostId(isExpanded ? null : p.id);
                  }
                }}
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
              </div>
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
        initialGps={storedCoords ?? undefined}
        locateOnMount={!storedCoords}
        markers={markers}
        districtBadges={districtCounts}
        onRegionSelect={handleRegionSelect}
        onBboxChange={handleBboxChange}
        locateRef={locateRef}
        polyActive={mode === 'region'}
        onLocate={mode === 'region' ? resetToViewport : undefined}
        selectRegionOnLocate={false}
        bottomInsetPx={sheetVisibleHeight}
      />

      <DraggableSheet
        ref={sheetRef}
        header={sheetHeader}
        initialCollapsed
        embedded
        floatingTopLeft={mode === 'region' && selectedRegion ? (
          <button
            type="button"
            className={styles.filterChip}
            onClick={clearRegionFilter}
          >
            <MapPin size={14} strokeWidth={2.2} />
            <span>{selectedRegion.name}</span>
            <X size={14} />
          </button>
        ) : undefined}
        maxHeight="65vh"
        midHeight="42vh"
        lockHeight
        onVisibleHeightChange={setSheetVisibleHeight}
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
