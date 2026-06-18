import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppImage } from '@/components/ui/AppImage';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import { regionContains, type SelectedRegion } from '@/components/maps/v2/region';
import { useLocationStore } from '@/store/useLocationStore';
import { fetchListings, type ListingCard as Listing } from '@/api/market';
import { fetchFeed } from '@/api/feed';
import type { FeedPost } from '@/api/types';
import ListingCard from '@/pages/market/ListingCard';
import styles from './NeighborhoodMap.module.css';

type Tab = 'listings' | 'feed';

/**
 * 동네지도 (SGR-287) — SaigonMapV2(상단)에서 동 선택 → 그 동네 경계 안의 매물/피드를 하단 리스트로.
 * Info 페이지(지도+지역필터 리스트) 패턴 재사용. 선택 위치는 useLocationStore 로 앱 전역 공유.
 */
export default function NeighborhoodMap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSharedCoords = useLocationStore((s) => s.setCoords);

  const [region, setRegion] = useState<SelectedRegion | null>(null);
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRegion = useCallback(
    (r: SelectedRegion) => {
      setRegion(r);
      setSharedCoords({ lat: r.lat, lng: r.lng });
    },
    [setSharedCoords],
  );

  // 선택 동 경계 내부의 매물·피드 (홈과 동일하게 regionContains 로 클립)
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
    return () => {
      cancelled = true;
    };
  }, [region]);

  const count = tab === 'listings' ? listings.length : posts.length;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <StatusBar variant="dark" />
        <h1 className={styles.title}>{region ? region.name : t('tabbar.map', { defaultValue: '동네지도' })}</h1>
      </div>

      <div className={styles.mapWrap}>
        <SaigonMapV2 height={260} locateOnMount onRegionSelect={handleRegion} />
      </div>

      <div className={styles.segment}>
        {(['listings', 'feed'] as Tab[]).map((tb) => (
          <button key={tb} className={`${styles.segBtn} ${tab === tb ? styles.segActive : ''}`} onClick={() => setTab(tb)}>
            {tb === 'listings' ? t('map.tabListings', { defaultValue: '매물' }) : t('map.tabFeed', { defaultValue: '피드' })}
          </button>
        ))}
        <span className={styles.count}>{t('map.count', { count, defaultValue: `${count}건` })}</span>
      </div>

      <div className={styles.list}>
        {loading ? (
          [0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
        ) : tab === 'listings' ? (
          listings.length === 0 ? (
            <p className={styles.empty}>{t('map.emptyListings', { defaultValue: '이 동네 매물이 없어요' })}</p>
          ) : (
            listings.map((l) => <ListingCard key={l.id} listing={l} onClick={() => navigate(`/market/${l.id}`)} />)
          )
        ) : posts.length === 0 ? (
          <p className={styles.empty}>{t('map.emptyFeed', { defaultValue: '이 동네 피드가 없어요' })}</p>
        ) : (
          posts.map((p) => (
            <button key={p.id} type="button" className={styles.feedRow} onClick={() => navigate('/feed')}>
              <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.feedAvatar} variant="circle" />
              <div className={styles.feedBody}>
                <span className={styles.feedName}>{p.userNickname ?? '—'}</span>
                {p.caption && <p className={styles.feedCaption}>{p.caption}</p>}
              </div>
              {p.photoUrl && <AppImage src={p.photoUrl} alt="" className={styles.feedThumb} />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
