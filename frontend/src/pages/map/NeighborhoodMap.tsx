import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LocateFixed } from 'lucide-react';
import OsmMap, { type OsmMarker, type OsmCountBadge, type Viewport } from '@/components/maps/OsmMap';
import DraggableSheet, { type DraggableSheetHandle } from '@/components/ride/DraggableSheet';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { inServiceArea } from '@/lib/serviceArea';
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
const DEFAULT_CENTER = { lat: 10.7769, lng: 106.7009 }; // 호치민 도심
const LISTING_COLOR = '#ff6f3c';
const FEED_COLOR = '#3b82f6';
// 이 줌 미만이면 카드 대신 집계 배지 + 확대 가이드
const ZOOM_NARROW = 13;

const inService = inServiceArea;

/**
 * 동네지도 v2 (SGR-287) — OpenStreetMap(OpenFreeMap 타일) 풀스크린 + 하단 드래거블 시트.
 * 현재 지도 뷰포트 내 매물/피드만 점·카드로. 너무 넓게 보면 집계 배지 + "확대" 가이드.
 * 서비스 지역(HCMC) 밖이면 리스트에 안내. 내 위치 버튼으로 실제 위치 이동.
 */
export default function NeighborhoodMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storeCoords = useLocationStore((s) => s.coords);
  const setSharedCoords = useLocationStore((s) => s.setCoords);
  const user = useUserStore((s) => s.user);

  // 초기 중심: 저장 좌표가 서비스 지역(HCMC) 안일 때만, 아니면 대표 도심
  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    storeCoords && inService(storeCoords.lat, storeCoords.lng) ? storeCoords : DEFAULT_CENTER,
  );
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [districtCounts, setDistrictCounts] = useState<DistrictCount[]>([]);
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  // 광고 노출 한도(3~4개로 시작, 스크롤 내리면 += 3~4). 카드 사이 광고가 무제한 누적되지 않게.
  const [adLimit, setAdLimit] = useState(randAdBatch);

  const sheetRef = useRef<DraggableSheetHandle>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 진입 시 현재 위치로 보정. 단 HCMC 밖이면 대표 도심 유지(서비스 지역 안에서 시작).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await native.ensureLocationPermission();
        const pos = await native.getLocation();
        if (cancelled) return;
        const c = { lat: pos.lat, lng: pos.lng };
        setMyLocation(c);
        if (inService(c.lat, c.lng)) {
          setCenter(c);
          setSharedCoords(c);
        }
        // 밖이면 center 는 대표 도심(DEFAULT_CENTER) 그대로 — 진입 폴백
      } catch {
        /* GPS 불가 — 대표 도심 그대로 */
      }
    })();
    return () => { cancelled = true; };
  }, [setSharedCoords]);

  // 광고 로드 시 셔플(랜덤 노출). 탭/지역 바뀌면 광고 한도 초기화.
  useEffect(() => {
    fetchAds(null).then((a) => setAds(shuffle(a))).catch(() => setAds([]));
  }, []);

  useEffect(() => { setAdLimit(randAdBatch()); }, [tab, center]); // eslint-disable-line react-hooks/exhaustive-deps

  // 집계 배지용 동네별 건수 (탭별)
  useEffect(() => {
    fetchDistrictCounts(tab).then(setDistrictCounts).catch(() => setDistrictCounts([]));
  }, [tab]);

  // 중심 기준 매물·피드 조회 (서버 반경 필터)
  useEffect(() => {
    const c = center ?? DEFAULT_CENTER;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchListings({ lat: c.lat, lng: c.lng, sort: 'recent', hideSold: true, size: 40 }).catch(() => null),
      fetchFeed({ filter: 'neighborhood', lat: c.lat, lng: c.lng, size: 40 }).catch(() => null),
    ])
      .then(([lp, fp]) => {
        if (cancelled) return;
        setListings(lp?.items ?? []);
        setPosts(fp?.items ?? []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [center]);

  // 서비스 지역 / 줌 모드 판정 (뷰포트 중심 기준)
  const vpCenter = viewport
    ? { lat: (viewport.north + viewport.south) / 2, lng: (viewport.east + viewport.west) / 2 }
    : center ?? DEFAULT_CENTER;
  const serviceArea = inService(vpCenter.lat, vpCenter.lng);
  const wideMode = !viewport || viewport.zoom < ZOOM_NARROW;

  // 현재 뷰포트 내 아이템만
  const inView = (lat?: number | null, lng?: number | null) => {
    if (lat == null || lng == null) return false;
    if (!viewport) return true;
    return lat <= viewport.north && lat >= viewport.south && lng <= viewport.east && lng >= viewport.west;
  };
  const visibleListings = useMemo(
    () => listings.filter((l) => inView(l.lat, l.lng)),
    [listings, viewport],
  );
  const visiblePosts = useMemo(
    () => posts.filter((p) => inView(p.latitude, p.longitude)),
    [posts, viewport],
  );

  // 마커: 서비스지역 & 좁게 볼 때만 개별 핀, 넓게 볼 때는 집계 배지
  const markers = useMemo<OsmMarker[]>(() => {
    if (!serviceArea || wideMode) return [];
    const items = tab === 'listings'
      ? visibleListings.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng }))
      : visiblePosts.map((p) => ({ id: p.id, lat: p.latitude, lng: p.longitude }));
    const color = tab === 'listings' ? LISTING_COLOR : FEED_COLOR;
    return items
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) => ({ id: m.id, lat: m.lat!, lng: m.lng!, color }));
  }, [serviceArea, wideMode, tab, visibleListings, visiblePosts]);

  const countBadges = useMemo<OsmCountBadge[]>(() => {
    if (!serviceArea || !wideMode) return [];
    const color = tab === 'listings' ? LISTING_COLOR : FEED_COLOR;
    return districtCounts
      .filter((d) => d.count > 0)
      .map((d) => ({ id: d.district_id, lat: d.lat, lng: d.lng, count: d.count, color }));
  }, [serviceArea, wideMode, tab, districtCounts]);

  const visibleCount = tab === 'listings' ? visibleListings.length : visiblePosts.length;
  const totalCount = districtCounts.reduce((s, d) => s + d.count, 0);
  const headerCount = !serviceArea ? 0 : wideMode ? totalCount : visibleCount;

  // 점 탭 → 시트 펼침 + 해당 카드로 스크롤·하이라이트
  const handleMarkerClick = (id: string) => {
    setSelectedId(id);
    if (tab === 'feed') setExpandedPostId(id);
    sheetRef.current?.expand();
    requestAnimationFrame(() => {
      itemRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleLocate = async () => {
    if (locating) return;
    setLocating(true);
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      const c = { lat: pos.lat, lng: pos.lng };
      setMyLocation(c);
      setCenter(c);
      setSharedCoords(c);
    } catch {
      toast.error(t('map.locateFailed', { defaultValue: '위치를 가져올 수 없어요' }));
    } finally {
      setLocating(false);
    }
  };

  const switchTab = (tb: Tab) => {
    setTab(tb);
    setExpandedPostId(null);
    setSelectedId(null);
  };

  const emptyMsg = tab === 'listings'
    ? t('map.emptyListings', { defaultValue: '이 동네 매물이 없어요' })
    : t('map.emptyFeed', { defaultValue: '이 동네 피드가 없어요' });

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
      {serviceArea && <span className={styles.count}>{t('map.count', { count: headerCount, defaultValue: `${headerCount}건` })}</span>}
    </div>
  );

  // 매물·피드 공통: 첫 카드 뒤(인덱스 0)부터 AD_EVERY 간격으로 광고 삽입. 단 adLimit 까지만(스크롤 시 증가).
  const adAt = (i: number) => {
    if (ads.length === 0 || i % AD_EVERY !== 0) return null;
    const ord = Math.floor(i / AD_EVERY); // 광고 순번
    if (ord >= adLimit) return null;
    const ad = ads[ord % ads.length];
    return <AdCard ad={ad} onClick={() => navigate(`/market/ad/${ad.id}`)} />;
  };

  // 리스트 스크롤이 바닥 근처면 광고 한도 += 3~4 (무한 스크롤 추가 노출)
  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setAdLimit((prev) => prev + randAdBatch());
    }
  };

  // 시트 본문: 서비스밖 → 안내 / 넓게 → 확대 가이드 / 좁게 → 카드
  const renderBody = () => {
    if (!serviceArea) {
      return <p className={styles.empty}>{t('map.outOfService', { defaultValue: '서비스 지역이 아닙니다 (호치민에서 이용 가능)' })}</p>;
    }
    if (loading) {
      return <>{[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}</>;
    }
    if (wideMode) {
      return (
        <p className={styles.guide}>
          🔍 {t('map.zoomInGuide', { defaultValue: '지도를 확대해 동네를 좁혀주세요' })}
          <br />
          <span className={styles.guideSub}>{t('map.zoomInGuideSub', { count: totalCount, defaultValue: `현재 영역에 ${totalCount}건` })}</span>
        </p>
      );
    }
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
      <OsmMap
        className={styles.map}
        center={center}
        markers={markers}
        countBadges={countBadges}
        myLocation={myLocation}
        selectedId={selectedId}
        onMarkerClick={handleMarkerClick}
        onViewportChange={setViewport}
      />

      <DraggableSheet
        ref={sheetRef}
        header={sheetHeader}
        initialCollapsed
        embedded
        midSnap={0.5}
        floatingTopRight={
          <button
            type="button"
            className={styles.locateBtn}
            onClick={handleLocate}
            disabled={locating}
            aria-label={t('map.locate', { defaultValue: '내 위치로' })}
          >
            <LocateFixed size={20} />
          </button>
        }
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
