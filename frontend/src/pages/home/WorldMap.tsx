import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore } from '@/store/useLocationStore';
import { fetchWallet } from '@/api/wallet';
import { fetchUserStats } from '@/api/profile';
import { weatherApi, floodApi, gasApi, repairApi } from '@/api/info';
import type { WeatherData, FloodReport } from '@/api/info';
import { fetchListings, localizedName as marketLocalizedName, type ListingCard } from '@/api/market';
import { formatPriceVnd, relativeTime } from '@/pages/market/marketFormat';
import { formatNumber } from '@/lib/format';
import { native } from '@/lib/native';
import { apiRegisterDeviceMap } from '@/api/device';
import { AppImage } from '@/components/ui/AppImage';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { emojiUrl } from '@/lib/emoji';
import { expToNextLevel } from '@/lib/rewards';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import { regionContains, type SelectedRegion } from '@/components/maps/v2/region';
import styles from './WorldMap.module.css';

export default function WorldMap() {
  const user = useUserStore((s) => s.user);
  const refreshUser = useUserStore((s) => s.refreshUser);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [products, setProducts] = useState<ListingCard[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [gold, setGold] = useState(0);
  const [xp, setXp] = useState(0);
  const [totalKm, setTotalKm] = useState(0);
  const didInit = useRef(false);

  const [infoWeather, setInfoWeather] = useState<WeatherData | null>(null);
  const [infoFloods, setInfoFloods] = useState<FloodReport[]>([]);
  const [infoGasCount, setInfoGasCount] = useState(0);
  const [infoRepairCount, setInfoRepairCount] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const setSharedCoords = useLocationStore((s) => s.setCoords);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    refreshUser();
    const uid = useUserStore.getState().user?.id;
    if (uid) {
      native.getDeviceUUID()
        .then(async (deviceUuid) => {
          if (!deviceUuid) {
            console.warn('[device-map] home: getDeviceUUID empty — skip', {
              isNative: native.isNative,
              platform: native.platform,
            });
            return;
          }
          const fcmToken = await native.getFCMToken().catch(() => '');
          apiRegisterDeviceMap(deviceUuid, uid, fcmToken || undefined).catch((e) =>
            console.warn('[device-map] home re-register failed', e),
          );
        })
        .catch((e) => console.error('[device-map] home getDeviceUUID threw', e));
    }
    fetchWallet().then((w) => {
      setGold(w.gold_balance);
      setXp(w.xp_balance);
    }).catch(() => {});
    if (uid) {
      fetchUserStats(uid).then((s) => {
        setTotalKm(Number(s.lifetime_km));
      }).catch(() => {});
    }
  }, [refreshUser]);

  // info API 는 선택된 동(ward) 의 centroid 좌표 기준. 동 선택은 SaigonMapV2 가 onRegionSelect 로 emit
  // (탭/성공 locate/마운트 default). 대표지역 default 는 페이지가 defaultWardSlug 로 지정.
  const activeCoords: { lat: number; lng: number } | null = selectedRegion
    ? { lat: selectedRegion.lat, lng: selectedRegion.lng }
    : null;

  const infoNavQuery = activeCoords ? `?lat=${activeCoords.lat}&lng=${activeCoords.lng}` : '';

  useEffect(() => {
    if (!selectedRegion) return;
    const { lat, lng } = selectedRegion;
    // 5km 로 받아오되, 선택 동(경계 폴리곤) 내부 항목만 노출.
    const inSel = (la: number, ln: number) => regionContains(selectedRegion, la, ln);
    Promise.allSettled([
      weatherApi.get(lat, lng).then((w) => {
        setInfoWeather(w);
      }),
      floodApi.getActive(lat, lng, 5).then((r) => r && setInfoFloods(r.floods.filter((f) => inSel(f.lat, f.lng)))),
      gasApi.getNearby(lat, lng, 5).then((r) => {
        if (!r) return;
        const inDist = r.stations.filter((s) => inSel(s.lat, s.lng));
        setInfoGasCount(inDist.length);
      }),
      repairApi.getNearby(lat, lng, 5).then((r) => {
        if (!r) return;
        const shops = r.shops.filter((s) => inSel(s.lat, s.lng));
        setInfoRepairCount(shops.length);
      }),
    ]);
  }, [selectedRegion]);

  // 선택 동(depth1) 경계 내부의 최신 상품 6개 — Home 추천. 동 변경 시 갱신(상세는 마켓에서).
  useEffect(() => {
    if (!selectedRegion) return;
    const region = selectedRegion;
    setProductsLoading(true);
    fetchListings({ lat: region.lat, lng: region.lng, sort: 'recent', hideSold: true, size: 40 })
      .then((p) => {
        const inWard = p.items.filter((it) => it.lat != null && it.lng != null && regionContains(region, it.lat, it.lng));
        setProducts(inWard.slice(0, 6));
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [selectedRegion]);

  // v2 지도가 선택 동(이름+centroid+경계)을 emit → 상단 라벨·info 좌표·영역 필터에 그대로 사용.
  const handleRegionSelect = useCallback((region: SelectedRegion) => {
    setSelectedRegion(region);
    setSharedCoords({ lat: region.lat, lng: region.lng });
  }, [setSharedCoords]);

  const selectedDistrictName = selectedRegion?.name ?? null;

  if (!user) return null;

  const activeFloods = infoFloods.filter((f) => f.status === 'ACTIVE');

  const cur = infoWeather?.current;
  const district = infoWeather?.location?.district ?? 'District 1';

  return (
    <div className={styles.root}>
      {/* ── Profile Header ── */}
      {(() => {
        const TOTAL_KM_GOAL = 500;
        const ringPct = Math.min(totalKm / TOTAL_KM_GOAL, 1);
        const RING_R = 28;
        const RING_C = 2 * Math.PI * RING_R;
        return (
      <div className={styles.header}>
        <div className={styles.avatarWrap} onClick={() => navigate('/profile')}>
          <svg className={styles.ring} viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r={RING_R} className={styles.ringTrack} />
            <circle
              cx="32" cy="32" r={RING_R}
              className={styles.ringFill}
              strokeDasharray={`${ringPct * RING_C} ${RING_C}`}
              transform="rotate(-90 32 32)"
            />
          </svg>
          <div className={styles.avatarCircle}>
            {user.avatarUrl ? (
              <AppImage src={user.avatarUrl} alt="" className={styles.avatar} variant="circle" />
            ) : (
              <span className={styles.avatarLetter}>{user.nickname.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <LevelBadge level={user.level} className={styles.levelOverlay} />
          <div className={styles.mileageLabel}>
            <span className={`mono ${styles.mileageValue}`}>{totalKm.toFixed(2)}</span>
            <span className={styles.mileageUnit}>km</span>
          </div>
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.headerTop}>
            <div className={styles.userName}>{user.nickname}</div>
            <div className={styles.walletRow}>
              {/* SGR-287: Gold 숨김, RP만 노출(코드 보존) */}
              <div className={styles.walletChip} style={{ display: 'none' }}>
                <img src={emojiUrl('1fa99')} width={14} height={14} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className={`mono ${styles.goldValue}`}>{formatNumber(gold)}</span>
              </div>
              <div className={styles.walletChip}>
                <img src={emojiUrl('1f48e')} width={14} height={14} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className={`mono ${styles.xpValue}`}>{formatNumber(xp)}</span>
              </div>
            </div>
          </div>
          <div className={styles.xpBarWrap}>
            <div className={styles.xpBar}>
              <div className={styles.xpBarFill} style={{ width: `${expToNextLevel(user.levelExp, user.level).progress * 100}%` }} />
            </div>
            <span className={`mono ${styles.xpBarLabel}`}>
              {formatNumber(user.levelExp)} / {formatNumber(user.levelExp + expToNextLevel(user.levelExp, user.level).needed)}
            </span>
          </div>
        </div>
      </div>
        );
      })()}

      {/* Scrollable content */}
      <div className={styles.scroll}>
        {/* ── INFO Strip ── */}
        <div className={styles.infoSection}>
          <div className={styles.infoSectionHeader}>
            <span className={styles.infoSectionLabel}>
              📍 {selectedDistrictName ?? district} — {t('info.hub.currentSituation')}
            </span>
            {!selectedRegion && activeFloods.length > 0 && (
              <span className={styles.infoBadgeDanger}>{t('info.hub.floodDangerBadge', { count: activeFloods.length })}</span>
            )}
          </div>
        </div>

        {/* ── District Map (v2: OSM 실측 3-depth 드릴다운) ── */}
        <div className={styles.mapSection}>
          <SaigonMapV2 height={188} onRegionSelect={handleRegionSelect} locateOnMount defaultWardSlug="ben-thanh" />
        </div>

        {/* ── INFO Strip (지도 아래) ── */}
        <div className={styles.infoSection}>
          <div className={styles.infoStrip}>
            <button className={styles.miniCard} onClick={() => navigate(`/info/weather${infoNavQuery}`)}>
              <div className={styles.miniHeader}>
                <div className={styles.miniIcon}>{cur?.emoji ?? '🌡'}</div>
                <div className={styles.miniTitle}>{t('info.hub.miniWeather')}</div>
              </div>
              <div className={styles.miniValue}>{cur ? `${cur.temp_c}°C` : '--'}</div>
              <div className={styles.miniSub}>
                {cur && cur.rain_prob_1h > 0 ? t('info.hub.miniRainIn1h', { prob: cur.rain_prob_1h }) : cur ? t('info.hub.miniClear') : t('info.hub.miniLoading')}
              </div>
            </button>
            <button
              className={`${styles.miniCard} ${activeFloods.length > 0 ? styles.miniCardDanger : ''}`}
              onClick={() => navigate(`/info/flood${infoNavQuery}`)}
            >
              <div className={styles.miniHeader}>
                <div className={styles.miniIcon}>🌊</div>
                <div className={styles.miniTitle}>{t('info.hub.miniFlood')}</div>
              </div>
              <div className={`${styles.miniValue} ${activeFloods.length > 0 ? styles.miniValueDanger : ''}`}>
                {activeFloods.length > 0 ? t('info.hub.miniFloodActive', { count: activeFloods.length }) : t('info.hub.floodNoIssue')}
              </div>
              <div className={`${styles.miniSub} ${activeFloods.length > 0 ? styles.miniSubDanger : ''}`}>
                {activeFloods.length > 0 ? (activeFloods[0].district_code ?? '') : t('info.hub.miniFloodNone')}
              </div>
            </button>
            <button className={styles.miniCard} onClick={() => navigate(`/info/gas${infoNavQuery}`)}>
              <div className={styles.miniHeader}>
                <div className={styles.miniIcon}>⛽</div>
                <div className={styles.miniTitle}>{t('info.hub.miniGas')}</div>
              </div>
              <div className={styles.miniValue}>
                {infoGasCount > 0 ? t('info.hub.miniCount', { count: infoGasCount }) : '--'}
              </div>
            </button>
            <button className={styles.miniCard} onClick={() => navigate(`/info/repair${infoNavQuery}`)}>
              <div className={styles.miniHeader}>
                <div className={styles.miniIcon}>🔧</div>
                <div className={styles.miniTitle}>{t('info.hub.miniRepair')}</div>
              </div>
              <div className={styles.miniValue}>
                {infoRepairCount > 0 ? t('info.hub.miniCount', { count: infoRepairCount }) : '--'}
              </div>
            </button>
          </div>
        </div>

        {/* ── 선택 지역 최신 상품 (마켓 추천) ── */}
        <div className={styles.productSection}>
          <div className={styles.productHeader}>
            <span className={styles.sectionLabel}>🛒 {selectedDistrictName ? `${selectedDistrictName} · ` : ''}{t('home.nearbyProducts')}</span>
            <button className={styles.seeMore} onClick={() => navigate(`/market${infoNavQuery}`)}>{t('home.seeMore')} ›</button>
          </div>
          {productsLoading ? (
            <div className={styles.productList}>
              {[0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.productSkeleton}`} />)}
            </div>
          ) : products.length === 0 ? (
            <div className={styles.productEmpty}>
              <p className={styles.productEmptyText}>{t('home.noProductsHere')}</p>
              <button className={styles.productEmptyCta} onClick={() => navigate(`/market${infoNavQuery}`)}>{t('home.browseMarket')} ›</button>
            </div>
          ) : (
            <div className={styles.productList}>
              {products.map((p) => (
                <button key={p.id} type="button" className={styles.productCard} onClick={() => navigate(`/market/${p.id}`)}>
                  <span className={styles.productThumb}>
                    <AppImage src={p.thumbnailUrl ?? undefined} alt={p.title} className={styles.productThumbImg} />
                  </span>
                  <div className={styles.productBody}>
                    <p className={styles.productTitle}>{p.title}</p>
                    <p className={styles.productMeta}>
                      {[marketLocalizedName(p.district), relativeTime(p.bumpedAt, t)].filter(Boolean).join(' · ')}
                    </p>
                    <span className={styles.productPrice}>{formatPriceVnd(p.priceVnd, t)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
