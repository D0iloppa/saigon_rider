import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Heart } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { useUserStore } from '@/store/useUserStore';
import { fetchWishlist, type ListingCard } from '@/api/market';
import ListingCardComp from './ListingCard';
import sys from '@/styles/system.module.css';
import styles from './MarketMain.module.css';

/** 마이 > 찜한 매물 (놀라움 층, §3) */
export default function MarketWishlist() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);
  const [items, setItems] = useState<ListingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetchWishlist(userId)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [userId, refreshKey]);

  return (
    <div className={styles.root}>
      <TopBar title={t('market.wishlistTitle', { defaultValue: '찜한 매물' })} />
      <div className={styles.listArea}>
        <div className={styles.listContent}>
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className={styles.skelCard}>
                <div className={`shimmer ${styles.skelThumb}`} />
                <div className={styles.skelBody}>
                  <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                  <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
                </div>
              </div>
            ))
          ) : error ? (
            <div className={styles.emptyWrap}>
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('market.loadError', { defaultValue: '매물을 불러오지 못했어요' })}
                actionLabel={t('common.retry')}
                onAction={() => setRefreshKey((k) => k + 1)}
              />
            </div>
          ) : items.length === 0 ? (
            <div className={styles.emptyWrap}>
              <StateBlock
                icon={Heart}
                title={t('market.wishlistEmpty', { defaultValue: '찜한 매물이 없어요' })}
                desc={t('market.wishlistEmptySub', { defaultValue: '마음에 드는 매물을 찜해보세요' })}
              />
            </div>
          ) : (
            items.map((l) => (
              <ListingCardComp key={l.id} listing={l} onClick={() => navigate(`/market/${l.id}`)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
