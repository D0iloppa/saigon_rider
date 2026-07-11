import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { AppImage } from '@/components/ui/AppImage';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import { fetchWishlist, type ListingCard } from '@/api/market';
import ListingCardComp from '@/pages/market/ListingCard';
import {
  fetchBizFavorites,
  removeBizFavorite,
  fetchBizCategories,
  bizCategoryLabel,
  type BizFavorite,
  type BizCategory,
} from '@/api/biz';
import styles from './MapFavorites.module.css';

type Tab = 'listings' | 'biz';

/** 관심목록 통합 탭 — [매물 | 업체] (P-FE 동네지도 프로필 실배선, 대표 결정 2). */
export default function MapFavorites() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);
  const [tab, setTab] = useState<Tab>('listings');

  const [listings, setListings] = useState<ListingCard[]>([]);
  // 비로그인(userId 없음)이면 로딩 없이 곧장 빈 상태 — effect 내 동기 setState 회피
  const [listingsLoading, setListingsLoading] = useState(!!userId);

  const [bizFavorites, setBizFavorites] = useState<BizFavorite[]>([]);
  const [bizLoading, setBizLoading] = useState(true);
  const [categories, setCategories] = useState<BizCategory[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetchWishlist(userId).then(setListings).catch(() => setListings([])).finally(() => setListingsLoading(false));
  }, [userId]);

  useEffect(() => {
    fetchBizFavorites().then(setBizFavorites).catch(() => setBizFavorites([])).finally(() => setBizLoading(false));
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  function catLabel(code: string | null) {
    if (!code) return '';
    const cat = categories.find((c) => c.code === code);
    return cat ? bizCategoryLabel(cat, i18n.language) : code;
  }

  async function handleUnfavorite(id: string) {
    setBizFavorites((prev) => prev.filter((b) => b.id !== id));
    try {
      await removeBizFavorite(id);
    } catch {
      // 실패 시에도 목록 화면에서는 재조회하지 않는다 — 다음 진입 시 서버 상태로 정정
    }
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft size={28} />
        </button>
        <h1>{t('map.favorites.title')}</h1>
      </header>

      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === 'listings' ? styles.tabActive : ''}`} onClick={() => setTab('listings')}>
          {t('map.favorites.tabListings')}
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'biz' ? styles.tabActive : ''}`} onClick={() => setTab('biz')}>
          {t('map.favorites.tabBiz')}
        </button>
      </div>

      {tab === 'listings' ? (
        listingsLoading ? (
          <div className={styles.listArea}>
            {[1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}
          </div>
        ) : listings.length === 0 ? (
          <p className={styles.empty}>{t('map.favorites.emptyListings')}</p>
        ) : (
          <div className={styles.listArea}>
            {listings.map((l) => (
              <ListingCardComp key={l.id} listing={l} onClick={() => navigate(`/market/${l.id}`)} />
            ))}
          </div>
        )
      ) : bizLoading ? (
        <div className={styles.listArea}>
          {[1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}
        </div>
      ) : bizFavorites.length === 0 ? (
        <p className={styles.empty}>{t('map.favorites.emptyBiz')}</p>
      ) : (
        <div className={styles.bizList}>
          {bizFavorites.map((b) => (
            <div key={b.id} className={styles.bizCard} onClick={() => navigate(`/biz/${b.id}`)}>
              <AppImage src={b.photoUrl ?? undefined} alt="" className={styles.bizThumb} />
              <div className={styles.bizBody}>
                <span className={styles.bizName}>{b.name}</span>
                <span className={styles.bizMeta}>
                  {b.category && <span className={styles.bizCat}><BizCatIcon category={b.category} size={12} />{catLabel(b.category)}</span>}
                  {b.address && <span className={styles.bizAddress}>{b.address}</span>}
                </span>
                {b.latestNews && <p className={styles.bizNews}>{b.latestNews.title}</p>}
              </div>
              <button
                type="button"
                className={styles.heartBtn}
                aria-label={t('common.remove', { defaultValue: '삭제' })}
                onClick={(e) => { e.stopPropagation(); handleUnfavorite(b.id); }}
              >
                <Heart size={20} fill="currentColor" strokeWidth={0} />
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
