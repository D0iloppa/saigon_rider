import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { useUserStore } from '@/store/useUserStore';
import { fetchWishlist, localizedName, type ListingCard } from '@/api/market';
import { formatPriceVnd, relativeTime, statusLabelKey } from './marketFormat';
import styles from './MarketMain.module.css';

/** 마이 > 찜한 매물 (놀라움 층, §3) */
export default function MarketWishlist() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);
  const [items, setItems] = useState<ListingCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchWishlist(userId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className={styles.root}>
      <TopBar title={t('market.wishlistTitle', { defaultValue: '찜한 매물' })} />
      <div className={styles.listArea}>
        <div className={styles.listContent}>
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
          ) : items.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyEmoji}>🤍</span>
              <h2 className={styles.emptyTitle}>{t('market.wishlistEmpty', { defaultValue: '찜한 매물이 없어요' })}</h2>
              <p className={styles.emptySub}>{t('market.wishlistEmptySub', { defaultValue: '마음에 드는 매물을 찜해보세요' })}</p>
            </div>
          ) : (
            items.map((l) => (
              <button key={l.id} className={styles.card} type="button" onClick={() => navigate(`/market/${l.id}`)}>
                <span className={styles.thumb}>
                  <AppImage src={l.thumbnailUrl ?? undefined} alt={l.title} className={styles.thumbImg} />
                  {l.status !== 'ON_SALE' && <span className={styles.statusTag}>{t(statusLabelKey(l.status))}</span>}
                </span>
                <div className={styles.cardBody}>
                  <p className={styles.cardTitle}>{l.title}</p>
                  <p className={styles.cardMeta}>
                    {[localizedName(l.district), relativeTime(l.bumpedAt, t)].filter(Boolean).join(' · ')}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
