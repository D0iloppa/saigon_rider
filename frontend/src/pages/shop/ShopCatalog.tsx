import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchShopItems, fetchDailyFeatured, slotLabel } from '@/api/shop';
import type { ShopItem, DailyFeaturedItem } from '@/api/shop';
import { useUserStore } from '@/store/useUserStore';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { emojiUrl } from '@/lib/emoji';
import styles from './ShopCatalog.module.css';

const SLOT_FILTERS = ['all', 'HELMET', 'JACKET', 'BODY_PAINT', 'WHEEL', 'EXHAUST', 'DECAL'] as const;
const SLOT_I18N: Record<string, string> = {
  all: 'shop.filter_all',
  HELMET: 'equipPreview.tab_rider',
  JACKET: 'equipPreview.tab_rider',
  BODY_PAINT: 'equipPreview.tab_bike',
  WHEEL: 'equipPreview.tab_bike',
  EXHAUST: 'equipPreview.tab_bike',
  DECAL: 'equipPreview.tab_effect',
};
const SLOT_LABEL: Record<string, string> = {
  all: 'All', HELMET: 'Helmet', JACKET: 'Jacket', BODY_PAINT: 'Paint',
  WHEEL: 'Wheel', EXHAUST: 'Exhaust', DECAL: 'Decal',
};

function useCountdown(targetIso: string) {
  const [remaining, setRemaining] = useState('');
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function tick() {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setRemaining('00:00:00'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      rafRef.current = window.setTimeout(tick, 1000);
    }
    tick();
    return () => clearTimeout(rafRef.current);
  }, [targetIso]);

  return remaining;
}

function FeaturedCard({ item }: { item: DailyFeaturedItem }) {
  const timer = useCountdown(item.featured_until);
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div
      className={styles.featuredCard}
      onClick={() => navigate(`/shop/item/${item.item_code}`)}
      style={{ cursor: 'pointer' }}
    >
      <div className={styles.featuredGlow} />

      <div className={styles.featuredThumb}>
        <ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={64} rarity={item.rarity} className={styles.itemThumbImg} />
      </div>

      <div className={styles.featuredInfo}>
        <div className={styles.featuredBadge}>
          <span className={styles.featuredBadgeText}>
            TODAY · {item.discount_percent}% OFF
          </span>
        </div>
        <div className={styles.featuredTimer}>⏰ {timer}</div>
        <div className={styles.featuredName}><ItemName code={item.item_code} fallback={item.item_name} /></div>
        <span className="rarity-chip" data-r={item.rarity}>LEGENDARY</span>
        <div className={styles.featuredPrices}>
          {item.original_price_gold && (
            <span className={styles.originalPrice}>
              {t('currency.gold')} {item.original_price_gold.toLocaleString()}
            </span>
          )}
          <span className={styles.discountPrice}>
            {t('currency.gold')} {item.price_gold?.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ShopCatalog() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const [featured, setFeatured] = useState<DailyFeaturedItem | null>(null);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [activeSlot, setActiveSlot] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (slot: string) => {
    setLoading(true);
    try {
      const slotKey = slot === 'all' ? undefined : slot;
      const [feat, shopItems] = await Promise.all([
        featured === null ? fetchDailyFeatured() : Promise.resolve(featured),
        fetchShopItems(slotKey ? { slot: slotKey } : undefined),
      ]);
      setFeatured(feat);
      setItems(shopItems);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(activeSlot); }, [activeSlot]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.page}>
      {/* Hero Header */}
      <div className={styles.header}>
        <div className={styles.headerBg} />
        <div className={styles.headerTitle}>{t('shop.title')}</div>
        <div className={styles.headerUser}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} className={styles.headerAvatar} alt="" />
          ) : (
            <div className={styles.headerAvatar} />
          )}
          <span className={styles.headerNickname}>{user?.nickname ?? '---'}</span>
        </div>
        <div className={styles.headerBalance}>
          <div className={styles.balanceRow}>
            <img
              src={emojiUrl('1fa99')}
              className={styles.balanceIcon} alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className={styles.balanceGp}>
              {t('currency.gold')} {(user?.gold ?? 0).toLocaleString()}
            </span>
          </div>
          <div className={styles.balanceRow}>
            <img
              src={emojiUrl('1f48e')}
              className={styles.balanceIcon} alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className={styles.balanceGc}>XP 240</span>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {/* Featured */}
        {featured && <FeaturedCard item={featured} />}

        {/* Category chips */}
        <div className={styles.chips}>
          {SLOT_FILTERS.map((f) => (
            <button
              key={f}
              className={`${styles.chip} ${activeSlot === f ? styles.chipActive : styles.chipInactive}`}
              onClick={() => setActiveSlot(f)}
            >
              {f === 'all' ? t('shop.filter_all') : slotLabel(f)}
            </button>
          ))}
        </div>

        {/* Item Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '32px 0' }}>
            {t('common.loading')}
          </div>
        ) : (
          <div className={styles.itemGrid}>
            {items.map((item) => (
              <div
                key={item.item_code}
                className={`rarity-card ${styles.itemCard}`}
                data-r={item.rarity}
                style={{ position: 'relative', cursor: 'pointer' }}
                onClick={() => navigate(`/shop/item/${item.item_code}`)}
              >
                {item.is_owned && (
                  <div className={styles.ownedOverlay}>
                    <span className={styles.ownedLabel}>✓ OWNED</span>
                  </div>
                )}

                <div className={`rarity-chip ${styles.itemRarityBadge}`} data-r={item.rarity}>
                  {item.rarity}
                </div>

                {item.limited_label && (
                  <span className={styles.itemLimitedBadge}>{item.limited_label}</span>
                )}

                <div className={styles.itemThumb}>
                  <ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={64} rarity={item.rarity} className={styles.itemThumbImg} />
                </div>
                <div className={styles.itemName}><ItemName code={item.item_code} fallback={item.item_name} /></div>
                <div className={styles.itemSlot}>{slotLabel(item.item_slot)}</div>

                <div className={styles.itemFooter}>
                  {item.price_gold ? (
                    <span className={styles.priceGp}>
                      {item.price_gold.toLocaleString()} {t('currency.gold')}
                    </span>
                  ) : (
                    <span className={styles.priceGc}>
                      {item.price_xp} XP
                    </span>
                  )}
                  {!item.is_owned && (
                    <button
                      className={styles.addBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/shop/item/${item.item_code}`);
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Gacha Banner */}
        <div
          className={styles.gachaBanner}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/gacha')}
        >
          <div className={styles.gachaBannerBg} />
          <div className={styles.gachaBannerBorder} />
          <img
            src={emojiUrl('1f48e')}
            className={styles.gachaBannerIcon} alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className={styles.gachaBannerText}>
            <div className={styles.gachaBannerTitle}>{t('shop.gacha_banner_title')}</div>
            <div className={styles.gachaBannerSub}>{t('shop.gacha_banner_sub')}</div>
          </div>
          <div className={styles.gachaBannerArrow}>↗</div>
        </div>
      </div>
    </div>
  );
}
