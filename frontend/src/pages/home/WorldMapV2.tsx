import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Megaphone, Newspaper, Package, PackageSearch, Plus, Route } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore, NEARBY_RADIUS_KM } from '@/store/useLocationStore';
import { fetchWallet } from '@/api/wallet';
import { fetchNotifications } from '@/api/notifications';
import { fetchUserStats } from '@/api/profile';
import { weatherApi, floodApi, gasApi, repairApi } from '@/api/info';
import type { WeatherData, FloodReport } from '@/api/info';
import { fetchListings, fetchAds, fetchTrades, localizedName as marketLocalizedName, type ListingCard, type MarketAd } from '@/api/market';
import { fetchBizNewsFeed, type BizNewsFeedItem } from '@/api/biz';
import { fetchFeed } from '@/api/feed';
import type { FeedPost } from '@/api/types';
import { AD_EVERY, ADS_ENABLED } from '@/lib/adPlacement';
import { formatPriceVnd, relativeTime } from '@/pages/market/marketFormat';
import { formatNumber } from '@/lib/format';
import { native } from '@/lib/native';
import { BEN_THANH_FALLBACK } from '@/lib/mapDefaults';
import { apiRegisterDeviceMap } from '@/api/device';
import { fetchWards, resolveWardByCoords, type Ward } from '@/api/master';
import { AppImage } from '@/components/ui/AppImage';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullIndicator } from '@/components/ui/PullIndicator';
import styles from './WorldMapV2.module.css';

// Bến Thành (Quận 1) — 앱 기본 동네
const FALLBACK = { ...BEN_THANH_FALLBACK, name: 'Bến Thành' };

// ── SVG 아이콘 (이모지 대체) ─────────────────────────────────
const IcoSearch = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
  </svg>
);
const IcoFilter = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#5a5a5f" strokeWidth="2" strokeLinecap="round">
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/>
    <circle cx="16" cy="6" r="2" fill="#fff"/><circle cx="8" cy="12" r="2" fill="#fff"/><circle cx="13" cy="18" r="2" fill="#fff"/>
  </svg>
);
const IcoHeart = ({ stroke = '#fff' }: { stroke?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
    <path d="M12 21C-5 11 6-2 12 5 18-2 29 11 12 21z"/>
  </svg>
);
const IcoStar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);
const IcoTrade = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/>
    <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
  </svg>
);
const IcoPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2">
    <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/>
    <circle cx="12" cy="9" r="2.5"/>
  </svg>
);
const IcoVerified = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#1fa463">
    <path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z"/>
    <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoChevron = ({ color = '#f8602a', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6"/>
  </svg>
);
const IcoComment = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" strokeWidth="2">
    <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.5 8.5 0 01-3.7-.8L3 21l1.9-5.3A8.4 8.4 0 0121 11.5z"/>
  </svg>
);
const IcoClock = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5a5a5f" strokeWidth="2">
    <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2" strokeLinecap="round"/>
  </svg>
);
const IcoCommunity = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5a5a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13A4 4 0 0119 7a4 4 0 01-3 3.87"/>
  </svg>
);
const IcoBell = () => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#5a5a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 01-3.46 0"/>
  </svg>
);
const IcoDiamond = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#3aa6e8">
    <path d="M6 3h12l4 6-10 12L2 9l4-6z"/>
    <path d="M6 3l6 6 6-6M2 9h20M12 9l0 12" stroke="#fff" strokeWidth="1" fill="none" opacity="0.5"/>
  </svg>
);
// 정보 섹션 SVG 아이콘 (이모지 대체 — 플랫폼별 렌더링 차이 방지)
const IcoSun = () => (
  <svg width="24" height="24" viewBox="0 0 46 46" fill="none">
    <circle cx="23" cy="23" r="10" fill="#f59e0b"/>
    <g stroke="#f59e0b" strokeWidth="4" strokeLinecap="round">
      <line x1="23" y1="3" x2="23" y2="9"/>
      <line x1="23" y1="37" x2="23" y2="43"/>
      <line x1="3" y1="23" x2="9" y2="23"/>
      <line x1="37" y1="23" x2="43" y2="23"/>
      <line x1="7.5" y1="7.5" x2="11.9" y2="11.9"/>
      <line x1="34.1" y1="34.1" x2="38.5" y2="38.5"/>
      <line x1="38.5" y1="7.5" x2="34.1" y2="11.9"/>
      <line x1="11.9" y1="34.1" x2="7.5" y2="38.5"/>
    </g>
  </svg>
);
const IcoFlood = () => (
  <svg width="24" height="24" viewBox="0 0 46 46" fill="none">
    <path d="M37 22a8.5 8.5 0 00-7.2-8.4A11.5 11.5 0 008.5 19.5a.5.5 0 01-.5.5A6.5 6.5 0 009.5 34.5h25A6.5 6.5 0 0037 22z" fill="#3b82f6"/>
    <g stroke="#3b82f6" strokeWidth="5" strokeLinecap="round">
      <line x1="16" y1="38" x2="14.5" y2="43.5"/>
      <line x1="23" y1="38" x2="21.5" y2="43.5"/>
      <line x1="30" y1="38" x2="28.5" y2="43.5"/>
    </g>
  </svg>
);
const IcoGasStation = () => (
  <svg width="24" height="24" viewBox="0 0 46 46" fill="none">
    <rect x="5" y="8" width="22" height="33" rx="4" fill="#f8602a"/>
    <rect x="9" y="13" width="14" height="10" rx="2.5" fill="rgba(255,255,255,0.5)"/>
    <path d="M27 17 L33 17 Q37 17 37 21 L37 31" stroke="#c94e20" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="31" y="30" width="11" height="7" rx="3.5" fill="#c94e20"/>
  </svg>
);
const IcoGear = () => (
  <svg width="24" height="24" viewBox="0 0 46 46" fill="none">
    <g fill="#9e9e9e">
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(0 23 23)"/>
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(45 23 23)"/>
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(90 23 23)"/>
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(135 23 23)"/>
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(180 23 23)"/>
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(225 23 23)"/>
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(270 23 23)"/>
      <rect x="21" y="3" width="4" height="8" rx="2" transform="rotate(315 23 23)"/>
      <circle cx="23" cy="23" r="14"/>
      <circle cx="23" cy="23" r="6" fill="#f4f4f6"/>
    </g>
  </svg>
);
// ────────────────────────────────────────────────────────────

export default function WorldMapV2() {
  const user = useUserStore((s) => s.user);
  const refreshUser = useUserStore((s) => s.refreshUser);
  // 표시 범위 단일 SoT (2026-08-06 통일) — 헤더 표기와 목록 조회가 같은 좌표를 본다.
  const scopeMode = useLocationStore((s) => s.mode);
  const scopeCoords = useLocationStore((s) => s.coords);
  const coordsSource = useLocationStore((s) => s.coordsSource);
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  const setWardName = useLocationStore((s) => s.setWardName);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const didInit = useRef(false);

  const [xp, setXp] = useState(0);
  const [totalKm, setTotalKm] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  // 조회 기준 좌표 — 'gps' 면 내 좌표, '전체'면 도시 기본 중심(FALLBACK).
  // 종전에는 헤더는 GPS, 목록은 저장 위치/FALLBACK 이라 "현재 위치는 Thạnh Mỹ Tây 인데
  // 근처 상품은 전부 Bến Thành" 이 나왔다(대표 캡처 2026-08-06). 이제 한 좌표만 쓴다.
  const coords = useMemo(
    () => (scopeMode === 'gps' && scopeCoords ? scopeCoords : FALLBACK),
    [scopeMode, scopeCoords],
  );
  const [resolvedWard, setResolvedWard] = useState<Ward | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const wardLabel = resolvedWard?.name_vi ?? resolvedWard?.name_en ?? null;

  const [nearbyProducts, setNearbyProducts] = useState<ListingCard[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [recentProducts, setRecentProducts] = useState<ListingCard[]>([]);
  const [recentStatus, setRecentStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [bizNews, setBizNews] = useState<BizNewsFeedItem[]>([]);
  const [bizNewsStatus, setBizNewsStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [communityPosts, setCommunityPosts] = useState<FeedPost[]>([]);
  const [communityStatus, setCommunityStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [dataLoading, setDataLoading] = useState(true);

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherUnavailable, setWeatherUnavailable] = useState(false);
  const [floods, setFloods] = useState<FloodReport[]>([]);
  const [floodStatus, setFloodStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [gasCount, setGasCount] = useState(0);
  const [gasStatus, setGasStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [repairCount, setRepairCount] = useState(0);
  const [repairStatus, setRepairStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const [searchQuery, setSearchQuery] = useState('');
  const [notiUnread, setNotiUnread] = useState(0);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    refreshUser();
    fetchWallet().then((w) => setXp(w.xp_balance)).catch(() => {});
    const uid = useUserStore.getState().user?.id;
    if (uid) {
      fetchUserStats(uid).then((s) => {
        setTotalKm(Number(s.lifetime_km));
        setReviewScore(s.avg_rating ?? null);
      }).catch(() => {});
      fetchTrades(uid).then((t) => setTradeCount(t.length)).catch(() => {});
      // 미읽음 뱃지 — 홈 진입 시 1회 fetch (폴링 없음)
      fetchNotifications(uid, 1, 1).then((r) => setNotiUnread(r.unread_count)).catch(() => {});
      native.getDeviceUUID().then(async (uuid) => {
        if (!uuid) return;
        const fcm = await native.getFCMToken().catch(() => '');
        apiRegisterDeviceMap(uuid, fcm || undefined).catch(() => {});
      }).catch(() => {});
    }
    // 진입 시 측위 — 표시 범위 기본값이 GPS 다(대표 지시 2026-08-06). 스토어가 세션당
    // 1회로 묶고, 실패/권역밖 폴백과 안내 토스트도 스토어가 처리한다.
    void ensureLocation();
  }, [refreshUser, ensureLocation]);

  // 기준 좌표가 정해지면 동 이름을 해석해 스토어에 올린다 — 헤더 표기와 다른 화면들이
  // 같은 라벨을 쓴다. 라벨 전용이며 필터 판정에는 쓰지 않는다.
  useEffect(() => {
    let cancelled = false;
    fetchWards().then((wardList) => {
      if (cancelled) return;
      const ward = resolveWardByCoords(coords.lat, coords.lng, wardList);
      setResolvedWard(ward);
      setWardName(ward?.name_vi ?? ward?.name_en ?? null);
    }).catch(() => { /* 라벨 없이 진행 — 조회 좌표에는 영향 없다 */ })
      .finally(() => { if (!cancelled) setLocationReady(true); });
    return () => { cancelled = true; };
  }, [coords, setWardName]);

  const loadHomeData = useCallback(() => {
    const { lat, lng } = coords;
    const refLat = resolvedWard?.center_lat ?? lat;
    const refLng = resolvedWard?.center_lng ?? lng;
    setFloodStatus('loading');
    setNearbyStatus('loading');
    setRecentStatus('loading');
    setBizNewsStatus('loading');
    setCommunityStatus('loading');
    setGasStatus('loading');
    setRepairStatus('loading');
    fetchAds(null).then(setAds).catch(() => setAds([]));
    return Promise.allSettled([
      // "내 주변 인기 상품" — 'gps' 범위면 반경 안에서만 고른다(대표 지시 2026-08-06).
      // '전체'면 반경 없이 거리순 — 기준점이 도시 중심이라 반경으로 자르면 의미가 없다.
      fetchListings({
        lat, lng, sort: 'distance', size: 8,
        radiusKm: scopeMode === 'gps' ? NEARBY_RADIUS_KM : null,
      })
        .then((p) => { setNearbyProducts(p.items); setNearbyStatus('ready'); })
        .catch(() => { setNearbyProducts([]); setNearbyStatus('unavailable'); }),
      fetchListings({ lat, lng, sort: 'recent', hideSold: true, size: 8 })
        .then((p) => { setRecentProducts(p.items); setRecentStatus('ready'); })
        .catch(() => { setRecentProducts([]); setRecentStatus('unavailable'); }),
      fetchBizNewsFeed(10)
        .then((items) => { setBizNews(items); setBizNewsStatus('ready'); })
        .catch(() => { setBizNews([]); setBizNewsStatus('unavailable'); }),
      weatherApi.get(refLat, refLng).then((value) => {
        setWeather(value);
        setWeatherUnavailable(!value);
      }).catch(() => { setWeather(null); setWeatherUnavailable(true); }),
      floodApi.getActive(refLat, refLng, 3)
        .then((r) => {
          if (!r) throw new Error('flood_unavailable');
          setFloods(r.floods);
          setFloodStatus('ready');
        })
        .catch(() => { setFloods([]); setFloodStatus('unavailable'); }),
      gasApi.getNearby(refLat, refLng, 3)
        .then((r) => {
          if (!r) throw new Error('gas_unavailable');
          setGasCount(r.stations.length);
          setGasStatus('ready');
        })
        .catch(() => { setGasCount(0); setGasStatus('unavailable'); }),
      repairApi.getNearby(refLat, refLng, 3)
        .then((r) => {
          if (!r) throw new Error('repair_unavailable');
          setRepairCount(r.shops.length);
          setRepairStatus('ready');
        })
        .catch(() => { setRepairCount(0); setRepairStatus('unavailable'); }),
      fetchFeed({ filter: 'hot', size: 4 })
        .then((res) => { setCommunityPosts(res.items); setCommunityStatus('ready'); })
        .catch(() => { setCommunityPosts([]); setCommunityStatus('unavailable'); }),
    ]).finally(() => setDataLoading(false));
  }, [coords, resolvedWard, scopeMode]);

  useEffect(() => {
    if (!locationReady) return;
    loadHomeData();
  }, [locationReady, loadHomeData]);

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(async () => { await loadHomeData(); }, [loadHomeData]),
  );

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) navigate(`/market/search?q=${encodeURIComponent(searchQuery.trim())}`);
    else navigate('/market/search');
  }, [searchQuery, navigate]);

  if (!user) return null;

  const activeFloods = floods.filter((f) => f.status === 'ACTIVE');
  const cur = weather?.current;
  const refLat = resolvedWard?.center_lat ?? coords.lat;
  const refLng = resolvedWard?.center_lng ?? coords.lng;
  const infoNavQuery = `?lat=${refLat}&lng=${refLng}`;

  return (
    <div className={styles.root}>
      {/* ── 고정 헤더 ── */}
      <div className={styles.fixedHeader}>
        <div className={styles.profileRow}>
          <button className={styles.avatarBtn} onClick={() => navigate('/profile')}>
            <div className={styles.avatar}>
              {user.avatarUrl
                ? <AppImage src={user.avatarUrl} alt="" className={styles.avatarImg} variant="circle" />
                : <span className={styles.avatarLetter}>{user.nickname.charAt(0).toUpperCase()}</span>
              }
            </div>
            <div className={styles.levelBadge}>Lv.{user.level}</div>
          </button>

          <div className={styles.profileInfo}>
            {/* Row 1: 닉네임 */}
            <div className={styles.profileName}>{user.nickname}</div>
            {/* Row 2: 휴대폰 인증 */}
            {user?.phoneVerified && (
              <div className={styles.profileVerified}>
                <IcoVerified /><span>{t('home.v2.verified')}</span>
              </div>
            )}
            {/* Row 3: 별점 | 거래 n건 */}
            <div className={styles.profileStat}>
              <IcoStar />
              <span>{reviewScore !== null ? reviewScore.toFixed(1) : '—'}</span>
              <span className={styles.statSep}>|</span>
              <IcoTrade />
              <span>{t('home.v2.tradeCount', { count: tradeCount })}</span>
            </div>
          </div>

          {/* 우측: RP 필 + 벨. 위치|누적거리는 아래 전체 폭 행으로 분리했다 — 같은 줄에
              두면 거리 값이 길어질수록(0.00 → 5157.91 km) 닉네임 칸을 잠식해
              이름이 잘리고 헤더 높이가 데이터에 따라 흔들렸다. */}
          <div className={styles.headerRightTop}>
            <button className={styles.xpBtn} onClick={() => navigate('/profile')}>
              <IcoDiamond />
              <span className={styles.xpVal}>{formatNumber(xp)}</span>
              <IcoChevron color="#aeaeb2" size={14} />
            </button>

            <button className={styles.bellBtn} onClick={() => navigate('/notifications')} aria-label={t('noti.title')}>
              <IcoBell />
              {notiUnread > 0 && (
                <span className={styles.bellBadge}>{notiUnread > 99 ? '99+' : notiUnread}</span>
              )}
            </button>
          </div>
        </div>

        {/* 위치|누적거리 — 전체 폭 독립 행 (프로필 행과 가로 공간을 경쟁하지 않는다) */}
        <button
          type="button"
          className={styles.profileLoc}
          onClick={() => navigate('/map')}
          aria-label={t('home.v2.locationCta')}
        >
          <IcoPin />
          <span className={styles.locName}>
            {/* 헤더 표기와 아래 목록이 같은 좌표를 쓴다 — 권역 밖 폴백 중이면 "현재 위치"라고
                쓰지 않고 기본 지역 표기로 내린다(설계도 §4.3 coordsSource). */}
            {scopeMode === 'gps' && coordsSource === 'device' && wardLabel
              ? t('home.v2.currentRegion', { name: wardLabel })
              : t('home.v2.defaultRegion', { name: wardLabel ?? FALLBACK.name })}
          </span>
          <span className={styles.statSep}>|</span>
          <span title={t('home.v2.totalMileage')}>
            <Route size={11} strokeWidth={2} aria-hidden="true" /> {totalKm.toFixed(2)} km
          </span>
        </button>

        <div className={styles.searchWrap}>
          <div className={styles.searchBar}>
            <IcoSearch />
            <input
              className={styles.searchInput}
              placeholder={t('home.v2.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className={styles.searchFilterBtn} onClick={() => navigate('/market/search')}>
              <IcoFilter />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.scroll} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

        {/* ── ① 내 주변 인기 상품 ── */}
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleRow}>
            <Flame size={20} strokeWidth={2} color="#5a5a5f" aria-hidden="true" />
            <span className={styles.sectionTitle}>{t('home.v2.nearbyPopular')}</span>
          </div>
          <button className={styles.moreBtn} onClick={() => navigate(`/market${infoNavQuery}`)}>
            {t('home.seeMore')}<IcoChevron />
          </button>
        </div>
        <div className={styles.hScroll}>
          {dataLoading
            ? [0,1,2,3].map((i) => <div key={i} className={`shimmer ${styles.productSkeleton}`} />)
            : nearbyProducts.length === 0 && (!ADS_ENABLED || ads.length === 0)
              ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}><PackageSearch size={28} strokeWidth={1.6} aria-hidden="true" /></div>
                  <div className={styles.emptyStateMsg}>{nearbyStatus === 'unavailable' ? t('home.v2.sectionUnavailable') : t('home.v2.emptyNearby')}</div>
                  <div className={styles.emptyStateDesc}>{nearbyStatus === 'unavailable' ? t('home.v2.sectionUnavailableDesc') : t('home.v2.emptyNearbyDesc')}</div>
                  {nearbyStatus === 'unavailable' && (
                    <button className={styles.moreBtn} onClick={loadHomeData}>{t('common.retry')}</button>
                  )}
                </div>
              )
              : (nearbyProducts.length > 0 ? nearbyProducts : (ADS_ENABLED ? ads : []).slice(0,4).map((a) => ({
                  id: a.id, title: a.title, thumbnailUrl: a.imageUrl ?? null,
                  priceVnd: 0, district: null, bumpedAt: '', lat: null, lng: null,
                } as ListingCard))).map((p) => (
                <button key={p.id} className={styles.productCard} onClick={() => navigate(`/market/${p.id}`)}>
                  <div className={styles.productThumb}>
                    <AppImage src={p.thumbnailUrl ?? undefined} alt={p.title} className={styles.productThumbImg} />
                    <span className={styles.distBadge}>{marketLocalizedName(p.district) || 'HCMC'}</span>
                    <span className={styles.heartOverlay}><IcoHeart /></span>
                  </div>
                  <div className={styles.productName}>{p.title}</div>
                  <div className={`${styles.productPrice} ${formatPriceVnd(p.priceVnd, t).length > 9 ? styles.productPriceSm : ''}`}>{formatPriceVnd(p.priceVnd, t)}</div>
                  {/* 좋아요 수는 이 데이터 소스에 없음 — 가짜 0 노출 대신 시간만 (업리프트 260706) */}
                  <div className={styles.productMeta}>
                    <span className={styles.condBadge}>{relativeTime(p.bumpedAt, t) || '—'}</span>
                  </div>
                </button>
              ))
          }
        </div>

        {/* ── 업체 소식 ── */}
        {(dataLoading || bizNews.length > 0 || bizNewsStatus === 'unavailable') && (
          <>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitleRow}>
                <Megaphone size={20} strokeWidth={2} color="#5a5a5f" aria-hidden="true" />
                <span className={styles.sectionTitle}>{t('home.v2.bizNews', { defaultValue: '업체 소식' })}</span>
              </div>
            </div>
            <div className={styles.hScroll}>
              {dataLoading
                ? [0,1,2,3].map((i) => <div key={i} className={`shimmer ${styles.bizNewsSkeleton}`} />)
                : bizNewsStatus === 'unavailable'
                ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}><Megaphone size={28} strokeWidth={1.6} aria-hidden="true" /></div>
                    <div className={styles.emptyStateMsg}>{t('home.v2.sectionUnavailable')}</div>
                    <div className={styles.emptyStateDesc}>{t('home.v2.sectionUnavailableDesc')}</div>
                    <button className={styles.moreBtn} onClick={loadHomeData}>{t('common.retry')}</button>
                  </div>
                )
                : bizNews.map((n) => (
                  <button key={n.newsId} className={styles.bizNewsCard} onClick={() => navigate(`/biz/${n.profileId}`)}>
                    <div className={styles.bizNewsThumb}>
                      {(n.photos[0] ?? n.photoUrl)
                        ? <AppImage src={n.photos[0] ?? n.photoUrl ?? undefined} alt={n.title} className={styles.bizNewsThumbImg} />
                        : <span className={styles.bizNewsPlaceholder}><Megaphone size={22} /></span>
                      }
                    </div>
                    <div className={styles.bizNewsBody}>
                      <div className={styles.bizNewsBizName}>{n.profileName}</div>
                      <div className={styles.bizNewsTitle}>{n.title}</div>
                      <div className={styles.bizNewsMeta}>{relativeTime(n.createdAt, t)}</div>
                    </div>
                  </button>
                ))
              }
            </div>
          </>
        )}

        {/* ── ② 최근 등록 상품 ── */}
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleRow}>
            <IcoClock />
            <span className={styles.sectionTitle}>{t('home.v2.recentListings')}</span>
          </div>
          <button className={styles.moreBtn} onClick={() => navigate('/market')}>
            {t('home.seeMore')}<IcoChevron />
          </button>
        </div>
        <div className={styles.hScroll}>
          {dataLoading
            ? [0,1,2,3].map((i) => <div key={i} className={`shimmer ${styles.productSkeleton}`} />)
            : recentProducts.length === 0
              ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}><Package size={28} strokeWidth={1.6} aria-hidden="true" /></div>
                  <div className={styles.emptyStateMsg}>{recentStatus === 'unavailable' ? t('home.v2.sectionUnavailable') : t('home.v2.emptyRecent')}</div>
                  <div className={styles.emptyStateDesc}>{recentStatus === 'unavailable' ? t('home.v2.sectionUnavailableDesc') : t('home.v2.emptyRecentDesc')}</div>
                  {recentStatus === 'unavailable' && (
                    <button className={styles.moreBtn} onClick={loadHomeData}>{t('common.retry')}</button>
                  )}
                </div>
              )
            : recentProducts.map((p, i) => {
              const ord = Math.floor(i / AD_EVERY);
              const ad = ADS_ENABLED && ads.length > 0 && i % AD_EVERY === AD_EVERY - 1 ? ads[ord % ads.length] : null;
              return (
                <Fragment key={p.id}>
                  {ad && (
                    <button key={`${ad.id}-${ord}`} className={styles.productCard} onClick={() => navigate(`/market/ad/${ad.id}`)}>
                      <div className={styles.productThumb}>
                        <AppImage src={ad.imageUrl ?? undefined} alt={ad.title} className={styles.productThumbImg} />
                        <span className={styles.adBadge}>AD</span>
                        <span className={styles.heartOverlay}><IcoHeart /></span>
                      </div>
                      <div className={styles.productName}>{ad.title}</div>
                      <div className={styles.productMeta}><span className={styles.condBadge}>{ad.partnerName}</span></div>
                    </button>
                  )}
                  <button className={styles.productCard} onClick={() => navigate(`/market/${p.id}`)}>
                    <div className={styles.productThumb}>
                      <AppImage src={p.thumbnailUrl ?? undefined} alt={p.title} className={styles.productThumbImg} />
                      {i < 3 && <span className={styles.newBadge}>NEW</span>}
                      <span className={styles.heartOverlay}><IcoHeart /></span>
                    </div>
                    <div className={styles.productName}>{p.title}</div>
                    <div className={`${styles.productPrice} ${formatPriceVnd(p.priceVnd, t).length > 9 ? styles.productPriceSm : ''}`}>{formatPriceVnd(p.priceVnd, t)}</div>
                    <div className={styles.productMetaOnly}>{[marketLocalizedName(p.district), relativeTime(p.bumpedAt, t)].filter(Boolean).join(' · ')}</div>
                  </button>
                </Fragment>
              );
            })
          }
        </div>

        {/* ── ③ 안전거래 가이드 배너 ── */}
        <div className={styles.bannerWrap}>
          <button className={styles.guideBanner} onClick={() => navigate('/guide/safe-trade')}>
            <div className={styles.guideBannerText}>
              <div className={styles.guideBannerSub}>{t('home.v2.guideSub')}</div>
              <div className={styles.guideBannerTitle}>{t('home.v2.guideTitle')}</div>
              <div className={styles.guideBannerCta}>
                {t('home.v2.guideCta')}<IcoChevron color="#e8743a" size={14} />
              </div>
            </div>
            <div className={styles.guideBannerIllo}>
              <svg width="100" height="92" viewBox="0 0 100 92" fill="none">
                <rect x="2" y="14" width="34" height="22" rx="6" fill="#ffb98a"/>
                <rect x="10" y="38" width="26" height="17" rx="5" fill="#ffcfa8"/>
                <path d="M62 6l28 10v22c0 18-12 30-28 36-16-6-28-18-28-36V16L62 6z" fill="#f6913f"/>
                <path d="M62 10l24 8.5V38c0 15.5-10 25.8-24 31-14-5.2-24-15.5-24-31V18.5L62 10z" fill="#ff9d52"/>
                <path d="M52 38l7 7 14-14" stroke="#fff" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="60" y="58" width="30" height="24" rx="6" fill="#e07b2f"/>
                <path d="M67 58v-6a8 8 0 0116 0v6" stroke="#e07b2f" strokeWidth="5" fill="none"/>
                <circle cx="75" cy="69" r="3.5" fill="#fff"/>
              </svg>
            </div>
          </button>
        </div>

        {/* ── ④ 동네 정보 ── */}
        <div className={styles.infoCard}>
          <button className={styles.infoItem} onClick={() => navigate(`/info/weather${infoNavQuery}`)}>
            <div className={`${styles.infoBubble} ${styles.infoBubbleWeather}`}><IcoSun /></div>
            <div className={styles.infoVal}>{cur ? `${cur.temp_c}°C` : '--'}</div>
            <div className={styles.infoSub}>{weatherUnavailable ? t('info.weather.unavailableShort') : weather?.stale ? t('info.weather.staleShort') : cur ? (cur.rain_prob_1h > 0 ? t('home.v2.rainForecast') : t('home.v2.clear')) : '—'}</div>
            <div className={styles.infoLabel}>{t('info.weather.title')}</div>
          </button>
          <div className={styles.infoDivider} />
          <button
            className={`${styles.infoItem} ${floodStatus === 'ready' && activeFloods.length > 0 ? styles.infoItemDanger : ''}`}
            onClick={() => navigate(`/info/flood${infoNavQuery}`)}
          >
            <div className={`${styles.infoBubble} ${styles.infoBubbleFlood}`}><IcoFlood /></div>
            <div className={styles.infoVal}>{floodStatus !== 'ready' ? '—' : activeFloods.length > 0 ? t('info.hub.miniCount', { count: activeFloods.length }) : t('home.v2.floodNone')}</div>
            <div className={styles.infoSub}>{floodStatus === 'loading' ? t('common.loading') : floodStatus === 'unavailable' ? t('info.flood.unavailableShort') : activeFloods.length > 0 ? t('home.v2.floodWarning') : t('home.v2.floodSafe')}</div>
            <div className={styles.infoLabel}>{t('info.flood.title')}</div>
          </button>
          <div className={styles.infoDivider} />
          <button className={styles.infoItem} onClick={() => navigate(`/info/gas${infoNavQuery}&view=map`)}>
            <div className={`${styles.infoBubble} ${styles.infoBubbleGas}`}><IcoGasStation /></div>
            <div className={styles.infoVal}>{gasStatus === 'ready' && gasCount > 0 ? t('info.hub.miniCount', { count: gasCount }) : '--'}</div>
            <div className={styles.infoSub}>{gasStatus === 'loading' ? t('common.loading') : gasStatus === 'unavailable' ? t('info.hub.gasUnavailable') : t('home.v2.withinKm')}</div>
            <div className={styles.infoLabel}>{t('info.gas.title')}</div>
          </button>
          <div className={styles.infoDivider} />
          <button className={styles.infoItem} onClick={() => navigate(`/info/repair${infoNavQuery}&view=map`)}>
            <div className={`${styles.infoBubble} ${styles.infoBubbleRepair}`}><IcoGear /></div>
            <div className={styles.infoVal}>{repairStatus === 'ready' && repairCount > 0 ? t('info.hub.miniCount', { count: repairCount }) : '--'}</div>
            <div className={styles.infoSub}>{repairStatus === 'loading' ? t('common.loading') : repairStatus === 'unavailable' ? t('info.hub.repairUnavailable') : t('home.v2.withinKm')}</div>
            <div className={styles.infoLabel}>{t('info.repair.title')}</div>
          </button>
        </div>

        {/* ── ⑤ 커뮤니티 인기글 ── */}
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitleRow}>
            <IcoCommunity />
            <span className={styles.sectionTitle}>{t('home.v2.communityHot')}</span>
          </div>
          <button className={styles.moreBtn} onClick={() => navigate('/feed?filter=hot')}>
            {t('home.seeMore')}<IcoChevron />
          </button>
        </div>
        <div className={styles.hScroll}>
          {dataLoading
            ? [0,1,2,3].map((i) => <div key={i} className={`shimmer ${styles.commSkeleton}`} />)
            : communityStatus === 'unavailable'
            ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}><Newspaper size={28} strokeWidth={1.6} aria-hidden="true" /></div>
                <div className={styles.emptyStateMsg}>{t('home.v2.sectionUnavailable')}</div>
                <div className={styles.emptyStateDesc}>{t('home.v2.sectionUnavailableDesc')}</div>
                <button className={styles.moreBtn} onClick={loadHomeData}>{t('common.retry')}</button>
              </div>
            )
            : communityPosts.slice(0,6).map((post) => (
              <button key={post.id} className={styles.commCard} onClick={() => navigate(`/feed/post/${post.id}`)}>
                {post.photoUrl
                  ? <div className={styles.commCardThumb}><AppImage src={post.photoUrl} alt="" className={styles.commCardImg} /></div>
                  : <div className={styles.commCardThumb}><span className={styles.commCardPlaceholder}><Newspaper size={22} /></span></div>
                }
                <div className={styles.commCardBody}>
                  <div className={styles.commCardTitle}>{post.caption ?? ''}</div>
                  <div className={styles.commCardMeta}>{post.userNickname ?? ''} · {relativeTime(post.createdAt, t)}</div>
                  <div className={styles.commCardComments}><IcoComment />{post.commentCount}</div>
                </div>
              </button>
            ))
          }
        </div>

        <div className={styles.bottomPad} />
        </div>
      </div>

      {/* 매물 등록 FAB — 홈에 등록 진입점이 없던 갭 보완 (design-uplift-260707 §후속 4의 즉시 적용분.
          탭바 상시 '등록' 탭 개편은 제품 결정 대기) */}
      <button className={styles.writeFab} type="button" onClick={() => navigate('/market/new')} aria-label={t('market.create', { defaultValue: '매물 등록' })}>
        <Plus size={26} strokeWidth={2.4} />
      </button>
    </div>
  );
}
