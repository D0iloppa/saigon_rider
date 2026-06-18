import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Search, SlidersHorizontal, X } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useUserStore } from '@/store/useUserStore';
import {
  fetchCategories,
  fetchListings,
  localizedName,
  type ListingCard as Listing,
  type MarketCategory,
} from '@/api/market';
import CategoryPickerSheet from './CategoryPickerSheet';
import ListingCard from './ListingCard';
import styles from './MarketSearch.module.css';

/**
 * 매물 검색 (SGR-299) — 키워드 + 카테고리 트리(subtree) 필터.
 * 카테고리는 상단 노출 대신 검색 화면에서만 트리 드릴다운으로 선택.
 */
export default function MarketSearch() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);

  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [category, setCategory] = useState<MarketCategory | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // 키워드 디바운스(300ms)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(keyword.trim()), 300);
    return () => clearTimeout(id);
  }, [keyword]);

  const active = debounced.length > 0 || category !== null;

  const fetchPage = useCallback(
    (page: number) =>
      fetchListings({ q: debounced, categoryId: category?.id ?? null, hideSold: true, viewerId: userId, page, size: 20 }),
    [debounced, category, userId],
  );

  const { items, isLoading, isLoadingMore, hasMore, sentinelRef } = useInfiniteScroll<Listing>(
    fetchPage,
    20,
    [debounced, category],
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <StatusBar variant="dark" />
        <div className={styles.searchRow}>
          <button className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back', { defaultValue: '뒤로' })}>
            <ChevronLeft size={24} strokeWidth={2.2} />
          </button>
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
        </div>
        <button
          className={`${styles.catFilter} ${category ? styles.catFilterActive : ''}`}
          onClick={() => setCatSheetOpen(true)}
        >
          <SlidersHorizontal size={15} strokeWidth={2.2} />
          {category ? localizedName(category) : t('market.catFilter', { defaultValue: '카테고리' })}
        </button>
      </div>

      <div className={styles.results}>
        {!active ? (
          <div className={styles.hint}>
            <Search size={48} className={styles.hintIcon} />
            <p>{t('market.searchHint', { defaultValue: '키워드나 카테고리로 매물을 찾아보세요' })}</p>
          </div>
        ) : isLoading ? (
          [1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyEmoji}>🔍</span>
            <h2 className={styles.emptyTitle}>{t('market.searchEmptyTitle', { defaultValue: '검색 결과가 없어요' })}</h2>
            <p className={styles.emptySub}>{t('market.searchEmptySub', { defaultValue: '다른 키워드나 카테고리로 찾아보세요' })}</p>
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

      <CategoryPickerSheet
        open={catSheetOpen}
        onClose={() => setCatSheetOpen(false)}
        categories={categories}
        selectedId={category?.id ?? null}
        onSelect={setCategory}
        allowClear
      />
    </div>
  );
}
