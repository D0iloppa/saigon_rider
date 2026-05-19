import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchInventory, slotLabel, rarityLabel } from '@/api/inventory';
import type { InventoryItem, InventoryResponse } from '@/api/inventory';
import type { ItemRarity } from '@/api/gacha';
import { useUserStore } from '@/store/useUserStore';
import { InventoryCell } from '@/components/ui/items/InventoryCell';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { emojiUrl } from '@/lib/emoji';
import styles from './Inventory.module.css';

function ItemImg({ item }: { item: InventoryItem }) {
  return (
    <ItemSvgRenderer
      itemCode={item.item_code}
      slot={item.item_slot}
      size={72}
      rarity={item.rarity}
      className={styles.itemImg}
    />
  );
}

type FilterType = 'all' | 'rarity' | 'slot' | 'new';

const RARITY_ORDER: Record<ItemRarity, number> = { M: 0, L: 1, E: 2, R: 3, C: 4 };

function applyFilter(items: InventoryItem[], filter: FilterType): InventoryItem[] {
  if (filter === 'new') {
    return [...items].sort((a, b) => {
      if (a.is_new !== b.is_new) return a.is_new ? -1 : 1;
      return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
    });
  }
  if (filter === 'rarity') {
    return [...items].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
  }
  if (filter === 'slot') {
    return [...items].sort((a, b) => a.item_slot.localeCompare(b.item_slot));
  }
  return [...items].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
}

export default function Inventory() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const result = await fetchInventory(user.id);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const displayItems = data ? applyFilter(data.items, filter) : [];
  const stats = data?.stats;
  const collPct = stats ? (stats.completed_collections / stats.total_collections) * 100 : 0;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(-1)}>←</button>
        <div className={styles.headerTitle}>{t('inventory.title')}</div>
        <button className={styles.headerSearch}>
          <img
            src={emojiUrl('1f50d')}
            width={24} height={24} alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </button>
      </div>

      <div className={styles.body}>
        {/* Bento Stats */}
        {stats && (
          <div className={styles.bento}>
            {/* 보유 아이템 */}
            <div className={styles.bentoCount}>
              <div className={styles.bentoLabel}>{t('inventory.stats_owned')}</div>
              <div className={styles.bentoNumber}>{stats.total_owned}</div>
              <div className={styles.bentoCatalog}>{t('inventory.stats_catalog', { count: stats.total_catalog })}</div>
            </div>

            {/* 등급 평균 */}
            <div className={styles.bentoSmall}>
              <div className={styles.bentoLabel}>{t('inventory.stats_avg_rarity')}</div>
              <span className="rarity-chip" data-r={stats.avg_rarity}>
                {rarityLabel(stats.avg_rarity)}+
              </span>
            </div>

            {/* 컬렉션 완성 */}
            <div className={styles.bentoSmall}>
              <div className={styles.bentoLabel}>{t('inventory.stats_collections')}</div>
              <div className={styles.bentoCollRow}>
                <div className={styles.bentoCollNum}>
                  {stats.completed_collections} / {stats.total_collections}
                </div>
              </div>
              <div className={styles.bentoCollBar}>
                <div
                  className={styles.bentoCollFill}
                  style={{ width: `${collPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Filter Chips */}
        <div className={styles.filters}>
          <button
            className={`${styles.filterBtn} ${filter === 'all' ? styles.filterActive : styles.filterInactive}`}
            onClick={() => setFilter('all')}
          >
            {t('inventory.filter_all')}
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'rarity' ? styles.filterActive : styles.filterInactive}`}
            onClick={() => setFilter('rarity')}
          >
            {t('inventory.filter_rarity')}
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'slot' ? styles.filterActive : styles.filterInactive}`}
            onClick={() => setFilter('slot')}
          >
            {t('inventory.filter_slot')}
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'new' ? styles.filterNewFirst : styles.filterInactive}`}
            onClick={() => setFilter(filter === 'new' ? 'all' : 'new')}
          >
            {filter === 'new' ? t('inventory.filter_new_active') : t('inventory.filter_new')}
          </button>
        </div>

        {/* Item Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '32px 0' }}>
            {t('common.loading')}
          </div>
        ) : displayItems.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📦</div>
            <div className={styles.emptyTitle}>{t('inventory.empty_title')}</div>
            <div className={styles.emptySub}>{t('inventory.empty_sub')}</div>
            <button className={styles.emptyBtn} onClick={() => navigate('/shop')}>
              {t('inventory.empty_btn')}
            </button>
          </div>
        ) : (
          <div className={styles.itemGrid}>
            {displayItems.map((item) => (
              <InventoryCell
                key={item.user_item_id}
                rarity={item.rarity}
                onClick={() => navigate(`/inventory/item/${item.item_code}`)}
                className={`rarity-card ${styles.itemCell}`}
              >
                {item.is_equipped && (
                  <span className={styles.itemEquippedBadge}>{t('inventory.badge_equipped')}</span>
                )}
                {item.is_new && !item.is_equipped && (
                  <span className={styles.itemNewBadge}>{t('inventory.badge_new')}</span>
                )}
                {!item.is_new && !item.is_equipped && (
                  <span className={`rarity-chip ${styles.itemRarityPos}`} data-r={item.rarity}>
                    {item.rarity}
                  </span>
                )}

                <ItemImg item={item} />
                <div className={styles.itemName}>{item.item_name}</div>
                <div className={styles.itemSlot}>{slotLabel(item.item_slot)}</div>
              </InventoryCell>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
