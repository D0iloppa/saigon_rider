import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchShopItems, fetchDailyFeatured, slotLabel } from '@/api/shop';
import type { ShopItem, DailyFeaturedItem } from '@/api/shop';
import { useUserStore } from '@/store/useUserStore';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { emojiUrl } from '@/lib/emoji';
import styles from './ShopCatalog.module.css';

const SLOT_FILTERS = ['전체', '헬멧', '자켓', '페인트', '휠', '머플러', '데칼'];
const SLOT_MAP: Record<string, string> = {
  '헬멧': 'HELMET', '자켓': 'JACKET', '페인트': 'BODY_PAINT',
  '휠': 'WHEEL', '머플러': 'EXHAUST', '데칼': 'DECAL',
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
        <div className={styles.featuredName}>{item.item_name}</div>
        <span className="rarity-chip" data-r={item.rarity}>LEGENDARY</span>
        <div className={styles.featuredPrices}>
          {item.original_price_gold && (
            <span className={styles.originalPrice}>
              GOLD {item.original_price_gold.toLocaleString()}
            </span>
          )}
          <span className={styles.discountPrice}>
            GOLD {item.price_gold?.toLocaleString()}
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
  const [activeSlot, setActiveSlot] = useState('전체');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (slot: string) => {
    setLoading(true);
    try {
      const slotKey = SLOT_MAP[slot];
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
        <div className={styles.headerTitle}>사이공 마켓</div>
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
              GOLD {(user?.gold ?? 0).toLocaleString()}
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
              {f}
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
                <div className={styles.itemName}>{item.item_name}</div>
                <div className={styles.itemSlot}>{slotLabel(item.item_slot)}</div>

                <div className={styles.itemFooter}>
                  {item.price_gold ? (
                    <span className={styles.priceGp}>
                      {item.price_gold.toLocaleString()} GOLD
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
            <div className={styles.gachaBannerTitle}>더 짜릿한 한 방?</div>
            <div className={styles.gachaBannerSub}>5종 가챠가 기다린다</div>
          </div>
          <div className={styles.gachaBannerArrow}>↗</div>
        </div>
      </div>
    </div>
  );
}
