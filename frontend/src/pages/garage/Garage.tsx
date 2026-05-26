import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchInventory, equipItem, slotLabel } from '@/api/inventory';
import type { InventoryItem } from '@/api/inventory';
import type { ItemRarity } from '@/api/gacha';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { useUserStore } from '@/store/useUserStore';
import { emojiUrl } from '@/lib/emoji';
import { toast } from 'sonner';
import s from './Garage.module.css';

type TabKey = 'rider' | 'bike' | 'effect';
type SortMode = 'rarity' | 'slot' | 'name';

const SLOT_EMOJI: Record<string, string> = {
  HELMET: '1fa96', JACKET: '1f9e5', GLOVES: '1f9e4', BOOTS: '1f97e',
  EYEWEAR: '1f576', NAMEPLATE: '1f3f7',
  BODY_PAINT: '1f3a8', WHEEL: '2699', EXHAUST: '1f525',
  HEADLIGHT: '1f4a1', MIRROR: '1f9f0', DECAL: '1f409',
  FRAME: '1f5bc', BACKDROP: '1f304',
  TITLE_BANNER: '1f3f4', TRAIL: '2728', HORN: '1f514',
};

const RARITY_BG: Record<ItemRarity, string> = {
  C: '#9CA3AF', R: '#3B82F6', E: '#8B5CF6', L: '#F59E0B', M: '#FF2D9C',
};

const RARITY_ORDER: Record<string, number> = { M: 0, L: 1, E: 2, R: 3, C: 4 };

interface SlotDef {
  key: string;
  emoji: string;
  label: string;
  icon: string;
}

interface TabDef {
  i18nKey: string;
  icon: string;
  silhouette: string;
  left: SlotDef[];
  right: SlotDef[];
}

const TABS: Record<TabKey, TabDef> = {
  rider: {
    i18nKey: 'equipPreview.tab_rider',
    icon: '🧑',
    silhouette: '/assets/equip/rider.png',
    left: [
      { key: 'HELMET', emoji: '1fa96', label: 'HELMET', icon: '🪖' },
      { key: 'JACKET', emoji: '1f9e5', label: 'JACKET', icon: '🧥' },
      { key: 'GLOVES', emoji: '1f9e4', label: 'GLOVES', icon: '🧤' },
    ],
    right: [
      { key: 'EYEWEAR', emoji: '1f576', label: 'EYEWEAR', icon: '🕶️' },
      { key: 'BOOTS', emoji: '1f97e', label: 'BOOTS', icon: '🥾' },
    ],
  },
  bike: {
    i18nKey: 'equipPreview.tab_bike',
    icon: '🏍️',
    silhouette: '/assets/equip/bike.png',
    left: [
      { key: 'HEADLIGHT', emoji: '1f4a1', label: 'LIGHT', icon: '💡' },
      { key: 'MIRROR', emoji: '1f9f0', label: 'MIRROR', icon: '🪞' },
      { key: 'WHEEL', emoji: '2699', label: 'WHEEL', icon: '⚙️' },
    ],
    right: [
      { key: 'DECAL', emoji: '1f409', label: 'DECAL', icon: '🐉' },
      { key: 'BODY_PAINT', emoji: '1f3a8', label: 'PAINT', icon: '🎨' },
      { key: 'EXHAUST', emoji: '1f525', label: 'EXHAUST', icon: '🔥' },
    ],
  },
  effect: {
    i18nKey: 'equipPreview.tab_effect',
    icon: '✨',
    silhouette: '/assets/equip/effect.png',
    left: [
      { key: 'TITLE_BANNER', emoji: '1f3f4', label: 'TITLE', icon: '🏴' },
      { key: 'HORN', emoji: '1f514', label: 'HORN', icon: '🔔' },
      { key: 'TRAIL', emoji: '2728', label: 'TRAIL', icon: '✨' },
    ],
    right: [
      { key: 'NAMEPLATE', emoji: '1f3f7', label: 'NAME', icon: '🏷️' },
      { key: 'BACKDROP', emoji: '1f304', label: 'BACKDROP', icon: '🌄' },
    ],
  },
};

const TAB_KEYS: TabKey[] = ['rider', 'bike', 'effect'];

function sortItems(items: InventoryItem[], mode: SortMode): InventoryItem[] {
  const arr = [...items];
  switch (mode) {
    case 'rarity':
      return arr.sort((a, b) => (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9));
    case 'slot':
      return arr.sort((a, b) => a.item_slot.localeCompare(b.item_slot) || (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9));
    case 'name':
      return arr.sort((a, b) => a.item_name.localeCompare(b.item_name, 'ko'));
    default:
      return arr;
  }
}

export default function Garage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((st) => st.user);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TabKey>('rider');
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [currentSort, setCurrentSort] = useState<SortMode>('rarity');
  const [animKey, setAnimKey] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { items: all } = await fetchInventory(user.id);
      setItems(all);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const tab = TABS[currentTab];
  const allSlots = useMemo(() => [...tab.left, ...tab.right], [tab]);
  const tabSlotKeys = useMemo(() => new Set(allSlots.map((sl) => sl.key)), [allSlots]);

  const equippedMap = useMemo(() => {
    const map: Record<string, InventoryItem> = {};
    for (const item of items) {
      if (item.is_equipped) map[item.item_slot] = item;
    }
    return map;
  }, [items]);

  const slotItems = useMemo(() => {
    if (!activeSlot) return [];
    return sortItems(
      items.filter((it) => it.item_slot === activeSlot),
      currentSort,
    );
  }, [items, activeSlot, currentSort]);

  const equippedSlots = useMemo(
    () => allSlots.filter((sl) => equippedMap[sl.key]),
    [allSlots, equippedMap],
  );

  const PLACEHOLDER_COUNT = 10;
  const emptyCardCount = activeSlot
    ? Math.max(0, PLACEHOLDER_COUNT - slotItems.length)
    : 0;

  function handleTabChange(key: TabKey) {
    setCurrentTab(key);
    setActiveSlot(null);
    setAnimKey((k) => k + 1);
  }

  function handleSlotClick(slotKey: string) {
    setActiveSlot((prev) => (prev === slotKey ? null : slotKey));
  }

  async function handleEquip(item: InventoryItem) {
    if (!user?.id) return;
    if (item.is_equipped) return;
    try {
      await equipItem(user.id, item.item_code);
      toast.success(t('equipPreview.equip_done', { slot: slotLabel(item.item_slot) }));
      setItems((prev) =>
        prev.map((i) =>
          i.item_slot === item.item_slot
            ? { ...i, is_equipped: i.item_code === item.item_code }
            : i,
        ),
      );
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  }

  function renderSlotCard(slot: SlotDef) {
    const equipped = equippedMap[slot.key];
    const isActive = activeSlot === slot.key;
    const rarity = equipped?.rarity ?? '';

    const cardClasses = [
      s.slotCard,
      isActive ? s.slotCardActive : '',
      equipped ? s.slotCardEquipped : s.slotCardEmpty,
    ].filter(Boolean).join(' ');

    return (
      <button
        key={slot.key}
        className={cardClasses}
        data-r={rarity}
        onClick={() => handleSlotClick(slot.key)}
      >
        <div className={s.slotThumb}>
          {equipped ? (
            <ItemSvgRenderer itemCode={equipped.item_code} slot={slot.key} size={32} rarity={equipped.rarity} />
          ) : (
            <span className={s.slotSilhouette}>{slot.icon}</span>
          )}
          {equipped && (
            <span className={s.slotRarity} style={{ background: RARITY_BG[equipped.rarity] }}>
              {equipped.rarity}
            </span>
          )}
        </div>
        <div className={s.slotMeta}>
          <span className={s.slotLabel}>{slot.label}</span>
          {equipped && <span className={s.slotStat}>{slotLabel(slot.key)}</span>}
        </div>
      </button>
    );
  }

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <button className={s.headerBack} onClick={() => navigate(-1)}>←</button>
        <span className={s.headerTitle}>{t('gameHub.garage')}</span>
      </div>

      {/* Category Tabs */}
      <div className={s.catTabs}>
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            className={`${s.catTab} ${key === currentTab ? s.catTabActive : ''}`}
            onClick={() => handleTabChange(key)}
          >
            {TABS[key].icon} {t(TABS[key].i18nKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={s.loadingMsg}>{t('common.loading')}</div>
      ) : (
        <>
          {/* Stage */}
          <div className={`${s.stage} ${s.stageAnim}`} key={animKey}>
            <div className={`${s.side} ${s.sideL}`}>
              {tab.left.map(renderSlotCard)}
            </div>
            <div className={s.center}>
              <img className={s.silImg} src={tab.silhouette} alt="" />
            </div>
            <div className={`${s.side} ${s.sideR}`}>
              {tab.right.map(renderSlotCard)}
            </div>
          </div>

          {/* Stats Bar */}
          <div className={s.statsBar}>
            {equippedSlots.length > 0 ? (
              <>
                {equippedSlots.slice(0, 3).map((sl) => {
                  const item = equippedMap[sl.key]!;
                  return (
                    <div key={sl.key} className={s.statChip}>
                      <img
                        src={emojiUrl(SLOT_EMOJI[sl.key] ?? '1f4e6')}
                        width={16}
                        height={16}
                        alt=""
                        className={s.statEmoji}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <span className={s.statVal}><ItemName code={item.item_code} fallback={item.item_name} /></span>
                    </div>
                  );
                })}
                {equippedSlots.length > 3 && (
                  <div className={s.statChip} style={{ color: 'var(--text-3)' }}>
                    +{equippedSlots.length - 3}
                  </div>
                )}
              </>
            ) : (
              <span className={s.statsEmpty}>{t('equipPreview.no_equipped')}</span>
            )}
          </div>

          {/* Item Grid */}
          <div className={s.gridSection}>
            {activeSlot ? (
              <>
                <div className={s.gridToolbar}>
                  <span className={s.gridTitle}>{slotLabel(activeSlot)}</span>
                  <div className={s.sortPills}>
                    {(['rarity', 'slot', 'name'] as SortMode[]).map((mode) => (
                      <button
                        key={mode}
                        className={`${s.sortPill} ${currentSort === mode ? s.sortPillActive : ''}`}
                        onClick={() => setCurrentSort(mode)}
                      >
                        {t(`equipPreview.sort_${mode}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={s.gridScroll}>
                  <div className={s.grid}>
                    {slotItems.map((item) => (
                      <button
                        key={item.user_item_id}
                        className={`${s.gridItem} ${item.is_equipped ? s.gridItemEquipped : ''}`}
                        data-r={item.rarity}
                        onClick={() => handleEquip(item)}
                      >
                        {item.is_equipped && <span className={s.equippedBadge}>E</span>}
                        <div className={s.gridItemIcon}>
                          <ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={32} rarity={item.rarity} />
                        </div>
                        <span className={s.gridItemName}><ItemName code={item.item_code} fallback={item.item_name} /></span>
                        <span className={s.rarityChip} data-r={item.rarity}>{item.rarity}</span>
                      </button>
                    ))}
                    {Array.from({ length: emptyCardCount }, (_, i) => (
                      <div key={`ph-${i}`} className={s.gridItemEmpty} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className={s.gridPlaceholder}>
                <span className={s.gridPlaceholderText}>
                  {t('equipPreview.select_slot')}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
