import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ChevronDown, Heart, MapPinned, Plus, Search, X } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { Chip } from '@/components/ui/Chip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { toast } from '@/components/ui/Toast';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import type { SelectedRegion } from '@/components/maps/v2/region';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { native } from '@/lib/native';
import { shuffle, randAdBatch } from '@/lib/shuffle';
import { useUserStore } from '@/store/useUserStore';
import { fetchWards, resolveWardByCoords, type Ward } from '@/api/master';
import {
  addKeywordAlert,
  fetchAds,
  fetchKeywordAlerts,
  fetchListings,
  removeKeywordAlert,
  type KeywordAlert,
  type ListingCard as Listing,
  type ListingSort,
  type MarketAd,
} from '@/api/market';
import ListingCard from './ListingCard';
import AdCard from './AdCard';
import styles from './MarketMain.module.css';

const AD_EVERY = 5; // 매물 N개마다 광고 1개 삽입

const SORTS: ListingSort[] = ['recent', 'distance', 'price_low', 'price_high'];

/**
 * 오토바이 라이더 거래 플랫폼 — 동네 피드 (SGR-287)
 * 1열 매물 카드 (REF-02): 실이미지 썸네일 + 제목 + `동네·시간` + 가격(굵게) + ♥.
 * GPS 기반 동네(HCMC 밖이면 폴백) · 정렬 · 거래완료 숨김 · 무한스크롤 · 당겨서 새로고침.
 */
export default function MarketMain() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);

  const [alertOpen, setAlertOpen] = useState(false);
  const [alerts, setAlerts] = useState<KeywordAlert[]>([]);
  const [newKw, setNewKw] = useState('');
  const [sort, setSort] = useState<ListingSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [hideSold, setHideSold] = useState(false);
  const [ward, setWard] = useState<Ward | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMode, setLocationMode] = useState<'all' | 'gps' | 'region'>('all');
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [allWards, setAllWards] = useState<Ward[]>([]);
  const [locMapOpen, setLocMapOpen] = useState(false);
  const [regionLabel, setRegionLabel] = useState<string | null>(null);
  const [draftLocationMode, setDraftLocationMode] = useState<'all' | 'gps' | 'region'>('all');
  const [draftWard, setDraftWard] = useState<Ward | null>(null);
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [draftRegionLabel, setDraftRegionLabel] = useState<string | null>(null);
  const [adLimit, setAdLimit] = useState(randAdBatch); // 광고 3~4개로 시작, 스크롤 시 증가
  // 제휴 광고(지역 타게팅) — 동네/언어 확정 후 로드. 셔플해 랜덤 노출. 피드 중간 삽입용.
  useEffect(() => {
    fetchAds(ward?.district?.id ?? null).then((a) => setAds(shuffle(a))).catch(() => setAds([]));
    setAdLimit(randAdBatch());
  }, [ward?.district?.id, i18n.language]);

  // 마켓 기본 진입은 항상 전체 지역.
  // GPS 자동 실행 없음 — 사용자가 시트에서 명시적으로 선택한 경우에만 위치 반영.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wards = await fetchWards().catch(() => [] as Ward[]);
      if (cancelled) return;
      setAllWards(wards);
    })();
    return () => { cancelled = true; };
  }, []);

  const handlePickGPS = async () => {
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      const pickedCoords = { lat: pos.lat, lng: pos.lng };
      const w = resolveWardByCoords(pos.lat, pos.lng, allWards);
      setCoords(pickedCoords);
      setWard(w ?? null);
      setLocationMode('gps');
      setRegionLabel(null);
      setLocMapOpen(false);
    } catch {
      toast.error(t('market.locationError', { defaultValue: '위치를 가져올 수 없어요' }));
    }
  };

  const handleDraftRegion = (region: SelectedRegion) => {
    const nextCoords = { lat: region.lat, lng: region.lng };
    const matched = resolveWardByCoords(nextCoords.lat, nextCoords.lng, allWards);
    setDraftLocationMode('region');
    setDraftWard(matched ?? null);
    setDraftRegionLabel(matched ? null : region.name);
    setDraftCoords(nextCoords);
  };

  const handleApplyLocation = async () => {
    if (draftLocationMode === 'all') {
      setWard(null);
      setCoords(null);
      setRegionLabel(null);
      setLocationMode('all');
      setLocMapOpen(false);
      return;
    }
    if (draftLocationMode === 'gps') {
      await handlePickGPS();
      return;
    }
    setWard(draftWard);
    setCoords(draftCoords);
    setRegionLabel(draftRegionLabel);
    setLocationMode('region');
    setLocMapOpen(false);
  };

  const openLocationSheet = () => {
    setDraftLocationMode(locationMode);
    setDraftWard(ward);
    setDraftCoords(coords);
    setDraftRegionLabel(regionLabel);
    setLocMapOpen(true);
  };

  const currentRegionName = ward ? `${ward.name_vi}${ward.district ? ` (${ward.district.name_vi})` : ''}` : regionLabel;
  const currentLocationTitle = locationMode === 'all'
    ? t('market.allAreas')
    : currentRegionName ?? t('market.currentLocation');
  const currentLocationMeta = locationMode === 'all'
    ? t('market.locationMetaAll')
    : locationMode === 'gps'
      ? t('market.locationMetaGps')
      : t('market.locationMetaRegion');
  const draftRegionName = draftWard ? `${draftWard.name_vi}${draftWard.district ? ` (${draftWard.district.name_vi})` : ''}` : draftRegionLabel;
  const canApplyLocation = draftLocationMode === 'all' || draftLocationMode === 'gps' || !!draftCoords;

  const fetchPage = useCallback(
    (page: number) =>
      fetchListings({
        sort, hideSold,
        lat: coords?.lat, lng: coords?.lng,
        wardId: ward?.id ?? null,
        districtId: null,
        viewerId: userId, page, size: 20,
      }),
    [sort, hideSold, coords, ward?.id, userId],
  );

  const { items: listings, isLoading, isLoadingMore, hasMore, sentinelRef, reset } =
    useInfiniteScroll<Listing>(fetchPage, 20, [sort, hideSold, coords, ward?.id, userId]);

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(async () => reset(), [reset]),
  );

  const openAlerts = () => {
    setAlertOpen(true);
    if (userId) fetchKeywordAlerts(userId).then(setAlerts).catch(() => setAlerts([]));
  };

  const handleAddKw = async () => {
    const kw = newKw.trim();
    if (!kw || !userId) return;
    try {
      const a = await addKeywordAlert(userId, kw);
      setAlerts((prev) => (prev.some((x) => x.id === a.id) ? prev : [a, ...prev]));
      setNewKw('');
    } catch {
      toast.error(t('market.alertError', { defaultValue: '알림 처리 실패' }));
    }
  };

  const handleRemoveKw = async (id: string) => {
    if (!userId) return;
    try {
      await removeKeywordAlert(id, userId);
      setAlerts((prev) => prev.filter((x) => x.id !== id));
    } catch {
      toast.error(t('market.alertError', { defaultValue: '알림 처리 실패' }));
    }
  };

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <StatusBar variant="dark" />
        </div>
        <div className={styles.headerRow}>
          <button className={styles.locationBtn} onClick={openLocationSheet}>
            <h1 className={styles.title}>
              {currentLocationTitle}{' '}
              <span className={styles.caret}>▾</span>
            </h1>
            <p className={styles.tagline}>{t('market.tagline', { defaultValue: '내 근처 라이더 장터' })}</p>
          </button>
          <div className={styles.headerActions}>
            <button className={styles.wishlistBtn} onClick={() => navigate('/market/search')} aria-label={t('market.search', { defaultValue: '검색' })}>
              <Search size={23} strokeWidth={2} />
            </button>
            <button className={styles.wishlistBtn} onClick={openAlerts} aria-label={t('market.keywordAlerts', { defaultValue: '키워드 알림' })}>
              <Bell size={23} strokeWidth={2} />
            </button>
            <button className={styles.wishlistBtn} onClick={() => navigate('/market/wishlist')} aria-label={t('market.wishlist', { defaultValue: '찜' })}>
              <Heart size={24} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Sort (bottom sheet) + hide-sold toggle */}
        <div className={styles.controlRow}>
          <button className={styles.sortSelect} onClick={() => setSortOpen(true)}>
            {t(`market.sort_${sort}`)}
            <ChevronDown size={16} strokeWidth={2.2} />
          </button>
          <Chip
            variant={hideSold ? 'dark' : 'surface'}
            onClick={() => setHideSold((v) => !v)}
            style={{ cursor: 'pointer' }}
          >
            {t('market.hideSold', { defaultValue: '거래완료 숨기기' })}
          </Chip>
        </div>
      </div>

      {/* Listing feed */}
      <div
        className={styles.listArea}
        ref={containerRef as React.RefObject<HTMLDivElement>}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) setAdLimit((p) => p + randAdBatch());
        }}
      >
        <div className={styles.listContent} style={contentStyle}>
          <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
          {isLoading ? (
            [1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
          ) : listings.length === 0 ? (
            <>
              {/* 매물이 없어도 제휴광고는 노출 — 단 한도(3~4개, 스크롤 시 증가)만 */}
              {ads.slice(0, adLimit).map((ad) => (
                <AdCard key={ad.id} ad={ad} onClick={() => navigate(`/market/ad/${ad.id}`)} />
              ))}
              <div className={styles.empty}>
                <span className={styles.emptyEmoji}>🏍️</span>
                <h2 className={styles.emptyTitle}>{t('market.emptyTitle', { defaultValue: '근처에 매물이 없어요' })}</h2>
                <p className={styles.emptySub}>{t('market.emptySub', { defaultValue: '첫 매물을 등록해보세요' })}</p>
              </div>
            </>
          ) : (
            <>
              {listings.map((l, i) => {
                const ord = i / AD_EVERY; // 광고 순번(정수일 때만 삽입)
                const showAd = ads.length > 0 && i % AD_EVERY === 0 && ord < adLimit;
                const ad = showAd ? ads[ord % ads.length] : null;
                return (
                  <Fragment key={l.id}>
                    <ListingCard listing={l} onClick={() => navigate(`/market/${l.id}`)} />
                    {ad && <AdCard ad={ad} onClick={() => navigate(`/market/ad/${ad.id}`)} />}
                  </Fragment>
                );
              })}
              <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
            </>
          )}
        </div>
      </div>

      {/* 글쓰기 FAB */}
      <button className={styles.writeFab} type="button" onClick={() => navigate('/market/new')} aria-label={t('market.create', { defaultValue: '매물 등록' })}>
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {/* 정렬 시트 */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)}>
        <div className={styles.sortSheet}>
          <h2 className={styles.sortSheetTitle}>{t('market.sortTitle', { defaultValue: '정렬' })}</h2>
          {SORTS.map((s) => (
            <button
              key={s}
              className={`${styles.sortOption} ${sort === s ? styles.sortOptionActive : ''}`}
              onClick={() => {
                setSort(s);
                setSortOpen(false);
              }}
            >
              {t(`market.sort_${s}`)}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 지역 선택 시트 */}
      <BottomSheet open={locMapOpen} onClose={() => setLocMapOpen(false)}>
        <div className={styles.locSheet}>
          <div className={styles.locHeader}>
            <span className={styles.locEyebrow}>{t('market.locationScope')}</span>
            <strong className={styles.locCurrent}>{currentLocationTitle}</strong>
            <p className={styles.locDesc}>{currentLocationMeta}</p>
          </div>

          <button
            className={`${styles.locCard} ${draftLocationMode === 'all' ? styles.locCardActive : ''}`}
            onClick={() => setDraftLocationMode('all')}
          >
            <span className={styles.locCardIcon}>🌐</span>
            <span className={styles.locCardBody}>
              <strong className={styles.locCardTitle}>{t('market.allAreas')}</strong>
              <span className={styles.locCardText}>{t('market.locationMetaAll')}</span>
            </span>
            <span className={styles.locCardCheck}>{draftLocationMode === 'all' ? '●' : '○'}</span>
          </button>

          <button
            className={`${styles.locCard} ${draftLocationMode === 'gps' ? styles.locCardActive : ''}`}
            onClick={() => setDraftLocationMode('gps')}
          >
            <span className={styles.locCardIcon}>📍</span>
            <span className={styles.locCardBody}>
              <strong className={styles.locCardTitle}>{t('market.currentLocation')}</strong>
              <span className={styles.locCardText}>{t('market.locationMetaGps')}</span>
            </span>
            <span className={styles.locCardCheck}>{draftLocationMode === 'gps' ? '●' : '○'}</span>
          </button>

          <button
            className={`${styles.locCard} ${draftLocationMode === 'region' ? styles.locCardActive : ''}`}
            onClick={() => setDraftLocationMode('region')}
          >
            <span className={styles.locCardIcon}>🗺️</span>
            <span className={styles.locCardBody}>
              <strong className={styles.locCardTitle}>{t('market.selectArea')}</strong>
              <span className={styles.locCardText}>
                {draftRegionName ?? t('market.locationMetaPick')}
              </span>
            </span>
            <span className={styles.locCardCheck}>{draftLocationMode === 'region' ? '●' : '○'}</span>
          </button>

          {draftLocationMode === 'region' && (
            <div className={styles.locMapPanel}>
              <div className={styles.locMapCaption}>
                <MapPinned size={16} />
                <span>{draftRegionName ?? t('market.pickAreaOnMap')}</span>
              </div>
              <div className={styles.locMapInner}>
              <SaigonMapV2
                height={280}
                initialGps={draftCoords ?? coords ?? undefined}
                onRegionSelect={handleDraftRegion}
              />
            </div>
            </div>
          )}

          <div className={styles.locActions}>
            <Button variant="ghost" size="md" fullWidth={false} onClick={() => setLocMapOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="md" fullWidth={false} onClick={() => void handleApplyLocation()} disabled={!canApplyLocation}>
              {t('market.applyLocation')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* 키워드 알림 관리 시트 */}
      <BottomSheet open={alertOpen} onClose={() => setAlertOpen(false)}>
        <div className={styles.alertSheet}>
          <h2 className={styles.alertTitle}>🔔 {t('market.keywordAlerts', { defaultValue: '키워드 알림' })}</h2>
          <p className={styles.alertDesc}>{t('market.keywordAlertsDesc', { defaultValue: '키워드와 맞는 매물이 올라오면 알려드려요' })}</p>
          <div className={styles.alertInputRow}>
            <input
              className={styles.alertInput}
              value={newKw}
              onChange={(e) => setNewKw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKw()}
              placeholder={t('market.keywordPlaceholder', { defaultValue: '예: 헬멧, 타이어' })}
              maxLength={60}
            />
            <Button onClick={handleAddKw} fullWidth={false} disabled={!newKw.trim()}>
              {t('market.keywordAdd', { defaultValue: '추가' })}
            </Button>
          </div>
          <div className={styles.alertChips}>
            {alerts.length === 0 ? (
              <p className={styles.alertEmpty}>{t('market.keywordEmpty', { defaultValue: '등록한 키워드가 없어요' })}</p>
            ) : (
              alerts.map((a) => (
                <span key={a.id} className={styles.alertChip}>
                  {a.keyword}
                  <button className={styles.alertChipX} onClick={() => handleRemoveKw(a.id)} aria-label={t('market.keywordRemove', { defaultValue: '삭제' })}>
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
