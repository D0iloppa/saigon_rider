import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppImage } from '@/components/ui/AppImage';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import { regionContains, type SelectedRegion, type MapMarkerV2 } from '@/components/maps/v2/region';
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

/**
 * 동네지도 (SGR-287) — SaigonMapV2(상단)에서 동 선택 → 그 동네 경계 안의 매물/피드를 하단 리스트로.
 * 선택 탭의 마커를 지도에 표시. 피드 카드는 토글로 인라인 확장.
 */
export default function NeighborhoodMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSharedCoords = useLocationStore((s) => s.setCoords);
  const user = useUserStore((s) => s.user);

  const [region, setRegion] = useState<SelectedRegion | null>(null);
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string | number> | null>(null);
  const [wardCountBadges, setWardCountBadges] = useState<DistrictCount[]>([]);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);

  // depth-1 배지: 탭 변경 시 district-counts API 재조회
  useEffect(() => {
    fetchDistrictCounts(tab).then(setWardCountBadges).catch(() => setWardCountBadges([]));
  }, [tab]);

  useEffect(() => {
    fetchAds(null).then(setAds).catch(() => setAds([]));
  }, []);

  const handleRegion = useCallback(
    (r: SelectedRegion) => {
      setRegion(r);
      setSharedCoords({ lat: r.lat, lng: r.lng });
      setExpandedPostId(null);
      setVisibleIds(null);
    },
    [setSharedCoords],
  );

  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    setLoading(true);
    const inWard = (la?: number | null, ln?: number | null) =>
      la != null && ln != null && regionContains(region, la, ln);
    Promise.all([
      fetchListings({ lat: region.lat, lng: region.lng, sort: 'recent', hideSold: true, size: 40 }).catch(() => null),
      fetchFeed({ filter: 'neighborhood', lat: region.lat, lng: region.lng, size: 40 }).catch(() => null),
    ])
      .then(([lp, fp]) => {
        if (cancelled) return;
        setListings((lp?.items ?? []).filter((x) => inWard(x.lat, x.lng)));
        setPosts((fp?.items ?? []).filter((x) => inWard(x.latitude, x.longitude)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [region]);

  // 탭 연동 마커 — 선택된 탭의 ward-filtered 아이템 좌표 (depth-2/3 핀용)
  const markers = useMemo<MapMarkerV2[]>(() => {
    if (tab === 'listings') {
      return listings
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, lat: l.lat!, lng: l.lng! }));
    }
    return posts
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({ id: p.id, lat: p.latitude!, lng: p.longitude! }));
  }, [tab, listings, posts]);

  // depth-3 viewport 필터 — visibleIds가 있을 때만 클라이언트 필터링
  const visibleListings = visibleIds ? listings.filter((l) => visibleIds.has(l.id)) : listings;
  const visiblePosts = visibleIds ? posts.filter((p) => visibleIds.has(p.id)) : posts;

  const count = tab === 'listings' ? visibleListings.length : visiblePosts.length;

  // 지역 미선택 빈 상태 메시지
  const noRegionMsg = t('map.selectRegion', { defaultValue: '지역을 선택해주세요' });
  const emptyListingsMsg = t('map.emptyListings', { defaultValue: '이 동네 매물이 없어요' });
  const emptyFeedMsg = t('map.emptyFeed', { defaultValue: '이 동네 피드가 없어요' });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <StatusBar variant="dark" />
        <h1 className={styles.title}>{region ? region.name : t('tabbar.map', { defaultValue: '동네지도' })}</h1>
      </div>

      <div className={styles.mapWrap}>
        <SaigonMapV2
          height={260}
          locateOnMount
          onRegionSelect={handleRegion}
          markers={markers}
          wardCountBadges={wardCountBadges}
          onVisibleMarkersChange={setVisibleIds}
        />
      </div>

      <div className={styles.segment}>
        {(['listings', 'feed'] as Tab[]).map((tb) => (
          <button
            key={tb}
            className={`${styles.segBtn} ${tab === tb ? styles.segActive : ''}`}
            onClick={() => { setTab(tb); setExpandedPostId(null); }}
          >
            {tb === 'listings' ? t('map.tabListings', { defaultValue: '매물' }) : t('map.tabFeed', { defaultValue: '피드' })}
          </button>
        ))}
        {region && <span className={styles.count}>{t('map.count', { count, defaultValue: `${count}건` })}</span>}
      </div>

      <div className={styles.list}>
        {!region ? (
          <p className={styles.empty}>{noRegionMsg}</p>
        ) : loading ? (
          [0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
        ) : tab === 'listings' ? (
          visibleListings.length === 0 ? (
            <p className={styles.empty}>{emptyListingsMsg}</p>
          ) : (
            visibleListings.map((l, i) => (
              <Fragment key={l.id}>
                <ListingCard listing={l} onClick={() => navigate(`/market/${l.id}`)} />
                {ads.length > 0 && i % AD_EVERY === AD_EVERY - 1 && (() => {
                  const ad = ads[Math.floor(i / AD_EVERY) % ads.length];
                  return <AdCard ad={ad} onClick={() => navigate(`/market/ad/${ad.id}`)} />;
                })()}
              </Fragment>
            ))
          )
        ) : visiblePosts.length === 0 ? (
          <p className={styles.empty}>{emptyFeedMsg}</p>
        ) : (
          visiblePosts.map((p) => {
            const isExpanded = expandedPostId === p.id;
            return (
              <div key={p.id} className={styles.feedCard}>
                {/* 컴팩트 행 */}
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
                      if (user && p.userId === user.id) {
                        navigate('/profile');
                      } else {
                        setProfileCardUserId(p.userId);
                      }
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

                {/* 확장 영역 */}
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
