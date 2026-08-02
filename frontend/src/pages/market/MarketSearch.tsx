import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, Plus, Search, SearchX, SlidersHorizontal, Store, X } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import StateBlock from '@/components/ui/StateBlock';
import { PullIndicator } from '@/components/ui/PullIndicator';
import sys from '@/styles/system.module.css';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useUserStore } from '@/store/useUserStore';
import {
  fetchCategories,
  fetchListings,
  localizedName,
  type ListingCard as Listing,
  type ListingSort,
  type MarketCategory,
} from '@/api/market';
import CategoryPickerSheet from './CategoryPickerSheet';
import ListingCard from './ListingCard';
import styles from './MarketSearch.module.css';

const SORTS: ListingSort[] = ['recent', 'price_low', 'price_high'];

const PRICE_PRESETS = [
  { labelKey: 'market.pricePreset1', label: '5만 이하',    min: null,      max: 50_000 },
  { labelKey: 'market.pricePreset2', label: '5~20만',     min: 50_000,    max: 200_000 },
  { labelKey: 'market.pricePreset3', label: '20~50만',    min: 200_000,   max: 500_000 },
  { labelKey: 'market.pricePreset4', label: '50만~200만', min: 500_000,   max: 2_000_000 },
  { labelKey: 'market.pricePreset5', label: '200만 이상', min: 2_000_000, max: null },
] as const;

/**
 * 매물 검색 (SGR-299) — 키워드 + 카테고리 트리(subtree) 필터.
 * 카테고리는 상단 노출 대신 검색 화면에서만 트리 드릴다운으로 선택.
 */
export default function MarketSearch() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);

  const isMine = useMemo(() => new URLSearchParams(search).get('mine') === '1', []);
  const initialQ = useMemo(() => new URLSearchParams(search).get('q') ?? '', []);
  const [keyword, setKeyword] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [category, setCategory] = useState<MarketCategory | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [sort, setSort] = useState<ListingSort>('recent');
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // 키워드 디바운스(300ms)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(keyword.trim()), 300);
    return () => clearTimeout(id);
  }, [keyword]);

  const active = isMine || debounced.length > 0 || category !== null;

  const fetchPage = useCallback(
    (page: number) =>
      fetchListings({
        q: debounced,
        categoryId: category?.id ?? null,
        sort,
        hideSold: isMine ? false : true,
        priceMin,
        priceMax,
        viewerId: userId,
        sellerId: isMine ? userId : null,
        page,
        size: 20,
      }),
    [debounced, category, sort, priceMin, priceMax, userId, isMine],
  );

  const { items, isLoading, isLoadingMore, hasMore, error: listError, sentinelRef, reset } = useInfiniteScroll<Listing>(
    fetchPage,
    20,
    [debounced, category, sort, priceMin, priceMax, isMine],
  );

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(async () => reset(), [reset]),
  );

  const priceLabel = priceMin != null || priceMax != null
    ? `₫${(priceMin ?? 0).toLocaleString('vi-VN')} – ${priceMax != null ? `₫${priceMax.toLocaleString('vi-VN')}` : '∞'}`
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <StatusBar variant="dark" />
        <div className={styles.searchRow}>
          <button className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back', { defaultValue: '뒤로' })}>
            <ChevronLeft size={24} strokeWidth={2.2} />
          </button>
          {isMine ? (
            <span className={styles.mineTitle}>
              {t('profile.tabMyListings')}
            </span>
          ) : (
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} />
            <input
              className={styles.input}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('market.searchPlaceholder', { defaultValue: '찾는 물건을 검색해보세요' })}
              autoFocus
              maxLength={60}
            />
            {keyword && (
              <button className={styles.clear} onClick={() => setKeyword('')} aria-label={t('market.searchClear', { defaultValue: '지우기' })}>
                <X size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>
          )}
        </div>
        <div className={styles.filterRow}>
          <button
            className={`${styles.filterChip} ${category ? styles.filterChipActive : ''}`}
            onClick={() => setCatSheetOpen(true)}
          >
            <SlidersHorizontal size={14} strokeWidth={2.2} />
            {category ? localizedName(category) : t('market.catFilter', { defaultValue: '카테고리' })}
          </button>

          <button
            className={`${styles.filterChip} ${priceLabel ? styles.filterChipActive : ''}`}
            onClick={() => setFilterOpen(true)}
          >
            {priceLabel ?? t('market.priceFilter', { defaultValue: '가격대' })}
          </button>

          <button
            className={`${styles.filterChip} ${sort !== 'recent' ? styles.filterChipActive : ''}`}
            onClick={() => setSortOpen(true)}
          >
            {t(`market.sort_${sort}`)}
          </button>
        </div>
      </div>

      <div className={styles.results} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {!active ? (
          <div className={styles.stateWrap}>
            <StateBlock
              icon={Search}
              title={t('market.searchHint', { defaultValue: '키워드나 카테고리로 매물을 찾아보세요' })}
            />
          </div>
        ) : isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className={styles.skelCard}>
              <div className={`shimmer ${styles.skelThumb}`} />
              <div className={styles.skelBody}>
                <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              </div>
            </div>
          ))
        ) : items.length === 0 && listError ? (
          // F-12: 조회 실패를 "결과 없음"으로 위장하지 않고 구분해 재시도를 제공
          <div className={styles.stateWrap}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('market.loadError', { defaultValue: '매물을 불러오지 못했어요' })}
              actionLabel={t('common.retry')}
              onAction={reset}
            />
          </div>
        ) : items.length === 0 ? (
          <div className={styles.stateWrap}>
            <StateBlock
              icon={isMine ? Store : SearchX}
              title={isMine ? t('profile.emptyMyListings') : t('market.searchEmptyTitle')}
              desc={isMine ? t('profile.emptyMyListingsSub') : t('market.searchEmptySub')}
            />
          </div>
        ) : (
          <>
            {items.map((l) => (
              <ListingCard key={l.id} listing={l} onClick={() => navigate(`/market/${l.id}`)} />
            ))}
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </>
        )}
        </div>
      </div>

      {isMine && (
        <button
          type="button"
          className={styles.writeFab}
          onClick={() => navigate('/market/new')}
          aria-label={t('market.createListing')}
        >
          <Plus size={26} strokeWidth={2.4} />
        </button>
      )}

      <CategoryPickerSheet
        open={catSheetOpen}
        onClose={() => setCatSheetOpen(false)}
        categories={categories}
        selectedId={category?.id ?? null}
        onSelect={setCategory}
        allowClear
      />

      {/* 가격대 필터 시트 */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className={styles.filterSheet}>
          <h2 className={styles.sheetTitle}>{t('market.priceFilter', { defaultValue: '가격대' })}</h2>
          <div className={styles.presetRow}>
            {PRICE_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`${styles.presetChip} ${priceMin === p.min && priceMax === p.max ? styles.presetChipActive : ''}`}
                onClick={() => { setPriceMin(p.min); setPriceMax(p.max); setFilterOpen(false); }}
              >
                {t(p.labelKey, { defaultValue: p.label })}
              </button>
            ))}
          </div>
          <div className={styles.priceInputRow}>
            <input
              className={styles.priceInput}
              type="number"
              placeholder={t('market.priceMinPlaceholder', { defaultValue: '₫ 최소' })}
              value={priceMin ?? ''}
              onChange={(e) => setPriceMin(e.target.value ? Number(e.target.value) : null)}
            />
            <span className={styles.priceSep}>–</span>
            <input
              className={styles.priceInput}
              type="number"
              placeholder={t('market.priceMaxPlaceholder', { defaultValue: '₫ 최대' })}
              value={priceMax ?? ''}
              onChange={(e) => setPriceMax(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <Button onClick={() => setFilterOpen(false)} fullWidth>{t('common.apply', { defaultValue: '적용' })}</Button>
          {(priceMin != null || priceMax != null) && (
            <button className={styles.clearBtn} onClick={() => { setPriceMin(null); setPriceMax(null); }}>
              {t('market.filterClear', { defaultValue: '초기화' })}
            </button>
          )}
        </div>
      </BottomSheet>

      {/* 정렬 시트 */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)}>
        <div className={styles.filterSheet}>
          <h2 className={styles.sheetTitle}>{t('market.sortTitle', { defaultValue: '정렬' })}</h2>
          {SORTS.map((s) => (
            <button
              key={s}
              className={`${styles.sortOption} ${sort === s ? styles.sortOptionActive : ''}`}
              onClick={() => { setSort(s); setSortOpen(false); }}
            >
              {t(`market.sort_${s}`)}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
