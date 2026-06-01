import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchInventory, equipItem, unequipSlot, slotLabel } from '@/api/inventory';
import type { InventoryItem } from '@/api/inventory';
import type { ItemRarity } from '@/api/gacha';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { RiderComposite } from '@/components/equip/RiderComposite';
import { BikeComposite } from '@/components/equip/BikeComposite';
import { useUserStore } from '@/store/useUserStore';
import { useConfirmStore } from '@/store/useConfirmStore';
import { emojiUrl } from '@/lib/emoji';
import { toast } from 'sonner';
import s from './Garage.module.css';

type TabKey = 'rider' | 'bike' | 'effect';
type SortMode = 'rarity' | 'slot' | 'name';

const SLOT_EMOJI: Record<string, string> = {
  // Rider
  HELMET: '26d1', JACKET: '1f9e5', GLOVES: '1f9e4', BOOTS: '1f97e', EYEWEAR: '1f576',
  // Motorcycle
  BODY: '1f3cd', SEAT: '1f4ba', STICKER: '1f4a0', HANDLE: '2699',
  TAIL: '1f534', ENGINE: '2699', LIGHT: '1f4a1',
  MIRROR: '1f9f0', NUMBER: '1f522',
  // Profile
  NAME: '1f3f7', RANK: '1faaa', FRAME: '1f5bc', BACKDROP: '1f304', TITLE: '1f451',
  // Effect
  TRAIL: '2728', HORN: '1f514', START: '1f3ac',
  // Social
  EMOTE: '1f600', BANNER: '1f3f3', PET: '1f436',
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
  top?: SlotDef[];
  bottom?: SlotDef[];
}

const TABS: Record<TabKey, TabDef> = {
  rider: {
    i18nKey: 'equipPreview.tab_rider',
    icon: '🧑',
    silhouette: '/assets/equip/rider.png',
    left: [
      { key: 'HELMET', emoji: '26d1', label: 'HELMET', icon: '⛑️' },
      { key: 'JACKET', emoji: '1f9e5', label: 'JACKET', icon: '🧥' },
      { key: 'GLOVES', emoji: '1f9e4', label: 'GLOVES', icon: '🧤' },
    ],
    right: [
      { key: 'EYEWEAR', emoji: '1f576', label: 'EYEWEAR', icon: '🕶️' },
      { key: 'NAME', emoji: '1f3f7', label: 'NAME', icon: '🏷️' },
      { key: 'BOOTS', emoji: '1f97e', label: 'BOOTS', icon: '🥾' },
    ],
  },
  bike: {
    i18nKey: 'equipPreview.tab_bike',
    icon: '🏍️',
    silhouette: '/assets/equip/bike.png',
    top: [
      { key: 'HANDLE', emoji: '2699', label: 'HANDLE', icon: '⚙️' },
      { key: 'MIRROR', emoji: '1f9f0', label: 'MIRROR', icon: '🪞' },
      { key: 'LIGHT', emoji: '1f4a1', label: 'LIGHT', icon: '💡' },
    ],
    left: [
      { key: 'BODY', emoji: '1f3cd', label: 'BODY', icon: '🏍️' },
      { key: 'SEAT', emoji: '1f4ba', label: 'SEAT', icon: '💺' },
    ],
    right: [
      { key: 'NUMBER', emoji: '1f522', label: 'NUMBER', icon: '🔢' },
      { key: 'TAIL', emoji: '1f534', label: 'TAIL', icon: '🔴' },
    ],
    bottom: [
      { key: 'ENGINE', emoji: '2699', label: 'ENGINE', icon: '⚙️' },
      { key: 'STICKER', emoji: '1f4a0', label: 'STICKER', icon: '💠' },
    ],
  },
  effect: {
    i18nKey: 'equipPreview.tab_effect',
    icon: '✨',
    silhouette: '/assets/equip/effect.png',
    top: [
      { key: 'TITLE', emoji: '1f451', label: 'TITLE', icon: '👑' },
      { key: 'RANK', emoji: '1faaa', label: 'RANK', icon: '🪪' },
      { key: 'FRAME', emoji: '1f5bc', label: 'FRAME', icon: '🖼️' },
    ],
    left: [
      { key: 'TRAIL', emoji: '2728', label: 'TRAIL', icon: '✨' },
      { key: 'HORN', emoji: '1f514', label: 'HORN', icon: '🔔' },
    ],
    right: [
      { key: 'START', emoji: '1f3ac', label: 'START', icon: '🎬' },
      { key: 'BANNER', emoji: '1f3f3', label: 'BANNER', icon: '🏳️' },
    ],
    bottom: [
      { key: 'BACKDROP', emoji: '1f304', label: 'BACKDROP', icon: '🌄' },
      { key: 'EMOTE', emoji: '1f600', label: 'EMOTE', icon: '😀' },
      { key: 'PET', emoji: '1f436', label: 'PET', icon: '🐶' },
    ],
  },
};

const TAB_KEYS: TabKey[] = ['rider', 'bike', 'effect'];

function sortItems(items: InventoryItem[], mode: SortMode): InventoryItem[] {
  const byMode = (a: InventoryItem, b: InventoryItem): number => {
    switch (mode) {
      case 'rarity':
        return (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9);
      case 'slot':
        return a.item_slot.localeCompare(b.item_slot) || (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9);
      case 'name':
        return a.item_name.localeCompare(b.item_name, 'ko');
      default:
        return 0;
    }
  };
  // 착용 중인 아이템을 항상 최상단으로 (선택된 정렬 기준보다 우선)
  return [...items].sort((a, b) =>
    (a.is_equipped === b.is_equipped ? 0 : a.is_equipped ? -1 : 1) || byMode(a, b),
  );
}

function findTabForSlot(slot: string | null): TabKey | null {
  if (!slot) return null;
  for (const k of TAB_KEYS) {
    const t = TABS[k];
    if ([...(t.top ?? []), ...t.left, ...t.right, ...(t.bottom ?? [])].some((s) => s.key === slot)) return k;
  }
  return null;
}

export default function Garage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const user = useUserStore((st) => st.user);
  const openConfirm = useConfirmStore((st) => st.open);

  const initSlot = searchParams.get('slot');
  const initTab = findTabForSlot(initSlot) ?? 'rider';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TabKey>(initTab);
  const [activeSlot, setActiveSlot] = useState<string | null>(initSlot);
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
  const allSlots = useMemo(() => [...(tab.top ?? []), ...tab.left, ...tab.right, ...(tab.bottom ?? [])], [tab]);
  const tabSlotKeys = useMemo(() => new Set(allSlots.map((sl) => sl.key)), [allSlots]);

  const equippedMap = useMemo(() => {
    const map: Record<string, InventoryItem> = {};
    for (const item of items) {
      if (item.is_equipped) map[item.item_slot] = item;
    }
    return map;
  }, [items]);

  const equippedCodeMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [slot, item] of Object.entries(equippedMap)) {
      map[slot] = item.item_code;
    }
    return map;
  }, [equippedMap]);

  const displayItems = useMemo(() => {
    const base = activeSlot
      ? items.filter((it) => it.item_slot === activeSlot)
      : items.filter((it) => tabSlotKeys.has(it.item_slot));
    return sortItems(base, currentSort);
  }, [items, activeSlot, tabSlotKeys, currentSort]);

  const equippedSlots = useMemo(
    () => allSlots.filter((sl) => equippedMap[sl.key]),
    [allSlots, equippedMap],
  );

  const PLACEHOLDER_COUNT = 10;
  const emptyCardCount = activeSlot
    ? Math.max(0, PLACEHOLDER_COUNT - displayItems.length)
    : 0;

  function handleTabChange(key: TabKey) {
    setCurrentTab(key);
    setActiveSlot(null);
    setAnimKey((k) => k + 1);
  }

  function handleSlotClick(slotKey: string) {
    setActiveSlot((prev) => (prev === slotKey ? null : slotKey));
  }

  async function performUnequip(item: InventoryItem) {
    try {
      await unequipSlot(item.item_slot);
      setItems((prev) =>
        prev.map((i) =>
          i.item_slot === item.item_slot ? { ...i, is_equipped: false } : i,
        ),
      );
      toast.success(t('equipPreview.unequip_done', { slot: slotLabel(item.item_slot) }));
    } catch {
      toast.error(t('common.errorUnexpected'));
    }
  }

  async function handleEquip(item: InventoryItem) {
    if (!user?.id) return;
    if (item.is_equipped) {
      openConfirm(
        {
          mode: 'text',
          value: t('equipPreview.unequip_confirm', { slot: slotLabel(item.item_slot) }),
        },
        () => { void performUnequip(item); },
        {
          confirmLabel: { mode: 'code', value: 'equipPreview.unequip_action' },
        },
      );
      return;
    }
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
              {tab.top && tab.top.length > 0 && (
                <div className={s.topRow}>{tab.top.map(renderSlotCard)}</div>
              )}
              {currentTab === 'rider' ? (
                <RiderComposite equipment={equippedCodeMap} className={s.compositeImg} />
              ) : currentTab === 'bike' ? (
                <BikeComposite equipment={equippedCodeMap} className={s.compositeImg} />
              ) : (
                <img className={s.silImg} src={tab.silhouette} alt="" />
              )}
              {tab.bottom && tab.bottom.length > 0 && (
                <div className={s.bottomRow}>{tab.bottom.map(renderSlotCard)}</div>
              )}
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
            {activeSlot || displayItems.length > 0 ? (
              <>
                <div className={s.gridToolbar}>
                  <span className={s.gridTitle}>{activeSlot ? slotLabel(activeSlot) : t('equipPreview.all_items')}</span>
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
                    {displayItems.map((item) => (
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
