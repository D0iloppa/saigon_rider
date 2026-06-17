import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Heart, Plus, X } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { Chip } from '@/components/ui/Chip';
import { AppImage } from '@/components/ui/AppImage';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { toast } from '@/components/ui/Toast';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { native } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import { fetchDistricts, type District } from '@/api/master';
import {
  addKeywordAlert,
  fetchCategories,
  fetchKeywordAlerts,
  fetchListings,
  localizedName,
  removeKeywordAlert,
  resolveDistrict,
  type KeywordAlert,
  type ListingCard,
  type ListingSort,
  type MarketCategory,
} from '@/api/market';
import { formatDistance, formatPriceVnd, relativeTime, statusLabelKey } from './marketFormat';
import styles from './MarketMain.module.css';

const SORTS: ListingSort[] = ['recent', 'distance', 'price_low', 'price_high'];

/**
 * 오토바이 라이더 거래 플랫폼 — 동네 피드 (SGR-287)
 * 1열 매물 카드 (REF-02): 실이미지 썸네일 + 제목 + `동네·시간` + 가격(굵게) + ♥.
 * GPS 기반 동네(HCMC 밖이면 폴백) · 정렬 · 거래완료 숨김 · 무한스크롤 · 당겨서 새로고침.
 */
export default function MarketMain() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);

  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alerts, setAlerts] = useState<KeywordAlert[]>([]);
  const [newKw, setNewKw] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sort, setSort] = useState<ListingSort>('recent');
  const [hideSold, setHideSold] = useState(false);
  const [district, setDistrict] = useState<District | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // GPS → 동네(구) 해석. HCMC 밖이거나 권한 거부 시 Bình Thạnh 폴백.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const districts = await fetchDistricts().catch(() => [] as District[]);
      const fallback = districts.find((d) => d.code === 'BINH_THANH') ?? districts[0] ?? null;
      try {
        await native.ensureLocationPermission();
        const pos = await native.getLocation();
        if (cancelled) return;
        setCoords({ lat: pos.lat, lng: pos.lng });
        setDistrict(resolveDistrict(pos.lat, pos.lng, districts) ?? fallback);
      } catch {
        if (!cancelled) setDistrict(fallback);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    (page: number) =>
      fetchListings({ category: cat, sort, hideSold, lat: coords?.lat, lng: coords?.lng, page, size: 20 }),
    [cat, sort, hideSold, coords],
  );

  const { items: listings, isLoading, isLoadingMore, hasMore, sentinelRef, reset } =
    useInfiniteScroll<ListingCard>(fetchPage, 20, [cat, sort, hideSold, coords]);

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
          <div>
            <h1 className={styles.title}>
              {district ? localizedName(district) : t('market.district', { defaultValue: 'Bình Thạnh' })}{' '}
              <span className={styles.caret}>▾</span>
            </h1>
            <p className={styles.tagline}>{t('market.tagline', { defaultValue: '내 근처 라이더 장터' })}</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.wishlistBtn} onClick={openAlerts} aria-label={t('market.keywordAlerts', { defaultValue: '키워드 알림' })}>
              <Bell size={23} strokeWidth={2} />
            </button>
            <button className={styles.wishlistBtn} onClick={() => navigate('/market/wishlist')} aria-label={t('market.wishlist', { defaultValue: '찜' })}>
              <Heart size={24} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Category chips (DB master) */}
        <div className={styles.filterRow}>
          <Chip variant={cat === 'all' ? 'dark' : 'surface'} onClick={() => setCat('all')} style={{ cursor: 'pointer' }}>
            {t('market.catAll', { defaultValue: '전체' })}
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.code}
              variant={cat === c.code ? 'dark' : 'surface'}
              onClick={() => setCat(c.code)}
              style={{ cursor: 'pointer' }}
            >
              {localizedName(c)}
            </Chip>
          ))}
        </div>

        {/* Sort + hide-sold controls */}
        <div className={styles.controlRow}>
          <div className={styles.sortGroup}>
            {SORTS.map((s) => (
              <button
                key={s}
                className={`${styles.sortBtn} ${sort === s ? styles.sortBtnActive : ''}`}
                onClick={() => setSort(s)}
              >
                {t(`market.sort_${s}`)}
              </button>
            ))}
          </div>
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
      <div className={styles.listArea} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div className={styles.listContent} style={contentStyle}>
          <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
          {isLoading ? (
            [1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
          ) : listings.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>🏍️</span>
              <h2 className={styles.emptyTitle}>{t('market.emptyTitle', { defaultValue: '근처에 매물이 없어요' })}</h2>
              <p className={styles.emptySub}>{t('market.emptySub', { defaultValue: '첫 매물을 등록해보세요' })}</p>
            </div>
          ) : (
            <>
              {listings.map((l) => (
                <button key={l.id} className={styles.card} type="button" onClick={() => navigate(`/market/${l.id}`)}>
                  <span className={styles.thumb}>
                    <AppImage src={l.thumbnailUrl ?? undefined} alt={l.title} className={styles.thumbImg} />
                    {l.status !== 'ON_SALE' && <span className={styles.statusTag}>{t(statusLabelKey(l.status))}</span>}
                  </span>
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{l.title}</p>
                    <p className={styles.cardMeta}>
                      {[localizedName(l.district), formatDistance(l.distanceM), relativeTime(l.bumpedAt, t)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <div className={styles.cardFooter}>
                      <span className={styles.price}>
                        {l.originalPriceVnd != null && l.originalPriceVnd > l.priceVnd && (
                          <span className={styles.dropBadge}>{t('market.priceDrop', { defaultValue: '가격내림' })}</span>
                        )}
                        {formatPriceVnd(l.priceVnd, t)}
                      </span>
                      <span className={styles.likes}>♥ {l.likeCount}</span>
                    </div>
                  </div>
                </button>
              ))}
              <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
            </>
          )}
        </div>
      </div>

      {/* 글쓰기 FAB */}
      <button className={styles.writeFab} type="button" onClick={() => navigate('/market/new')} aria-label={t('market.create', { defaultValue: '매물 등록' })}>
        <Plus size={26} strokeWidth={2.4} />
      </button>

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
