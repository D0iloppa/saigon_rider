import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Search, SearchX, X } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import StateBlock from '@/components/ui/StateBlock';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import sys from '@/styles/system.module.css';
import {
  bizCategoryLabel,
  fetchBizCategories,
  fetchBizMapItems,
  type BizCategory,
  type BizMapItem,
} from '@/api/biz';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import BizRichCard from './BizRichCard';
import styles from './MapSearch.module.css';

const HCMC_BBOX = { minLat: 10.40, maxLat: 11.10, minLng: 106.40, maxLng: 107.00 };
// N-2: 100 이면 101번째부터 검색결과에서 조용히 사라진다 — NeighborhoodMap 과 동일하게 상향.
const BIZ_MAX_ITEMS = 1000;

/**
 * 동네지도 가게 검색 — 헤더 검색 아이콘 진입 (마켓 /market/search 와 동일 문법:
 * 뒤로가기 + 검색입력 + 필터칩 + StateBlock). 조회는 기존 동네지도 업체 조회
 * (fetchBizMapItems, HCMC bbox + q + category) 를 그대로 재사용한다.
 */
export default function MapSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [items, setItems] = useState<BizMapItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // 키워드 디바운스(300ms) — 마켓 검색과 동일
  useEffect(() => {
    const id = setTimeout(() => setDebounced(keyword.trim()), 300);
    return () => clearTimeout(id);
  }, [keyword]);

  const active = debounced.length > 0 || category != null;

  useEffect(() => {
    if (!active) {
      setItems([]);
      setLoading(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetchBizMapItems({
      ...HCMC_BBOX,
      category: category ?? undefined,
      q: debounced || undefined,
      signal: controller.signal,
      maxItems: BIZ_MAX_ITEMS,
    })
      .then(setItems)
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, debounced, category, reloadKey, i18n.language]);

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(() => setReloadKey((v) => v + 1), []),
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <StatusBar variant="dark" />
        <div className={styles.searchRow}>
          <button className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
            <ChevronLeft size={24} strokeWidth={2.2} />
          </button>
          <div className={styles.searchBox}>
            <Search size={18} className={styles.searchIcon} />
            <input
              className={styles.input}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('map.listFirst.searchBiz')}
              aria-label={t('map.listFirst.searchBiz')}
              autoFocus
              maxLength={60}
            />
            {keyword && (
              <button className={styles.clear} onClick={() => setKeyword('')} aria-label={t('map.listFirst.clearSearch')}>
                <X size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
        <div className={styles.filterRow}>
          <button
            className={`${styles.filterChip} ${category == null ? styles.filterChipActive : ''}`}
            onClick={() => setCategory(null)}
          >
            {t('map.bizCategoryAll')}
          </button>
          {categories.map((c) => (
            <button
              key={c.code}
              className={`${styles.filterChip} ${category === c.code ? styles.filterChipActive : ''}`}
              onClick={() => setCategory(c.code)}
            >
              <BizCatIcon category={c.code} size={14} />
              {bizCategoryLabel(c, i18n.language)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.results} ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div style={contentStyle}>
        <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {!active ? (
          <div className={styles.stateWrap}>
            <StateBlock
              icon={Search}
              title={t('map.mapSearch.hint', { defaultValue: '가게 이름이나 업종으로 찾아보세요' })}
            />
          </div>
        ) : loading && items.length === 0 ? (
          [1, 2, 3].map((i) => (
            <div key={i} className={styles.skelCard}>
              <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
              <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              <div className={`shimmer ${styles.skelRail}`} />
            </div>
          ))
        ) : error ? (
          <div className={styles.stateWrap}>
            <StateBlock
              icon={SearchX}
              tone="error"
              title={t('map.loadError')}
              actionLabel={t('common.retry')}
              onAction={() => setReloadKey((v) => v + 1)}
            />
          </div>
        ) : items.length === 0 ? (
          <div className={styles.stateWrap}>
            <StateBlock
              icon={SearchX}
              title={t('map.emptySearch')}
              desc={t('map.listFirst.emptySearchHint')}
            />
          </div>
        ) : (
          items.map((biz) => {
            const cat = categories.find((c) => c.code === biz.category);
            return (
              <BizRichCard
                key={biz.id}
                biz={biz}
                categoryLabel={cat ? bizCategoryLabel(cat, i18n.language) : undefined}
                onClick={() => navigate(`/biz/${biz.id}`, { state: { backgroundLocation: location } })}
              />
            );
          })
        )}
        </div>
      </div>
    </div>
  );
}
