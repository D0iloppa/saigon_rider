import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchInventory, equipItem, slotLabel } from '@/api/inventory';
import type { InventoryItem } from '@/api/inventory';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { useUserStore } from '@/store/useUserStore';
import { toast } from 'sonner';
import s from './EquipPreview.module.css';

const SLOTS = [
  // Rider
  'GLOVES', 'BOOTS', 'EYEWEAR', 'NAMEPLATE',
  // Motorcycle
  'MOTORCYCLE_BODY', 'SEAT', 'STICKER', 'HANDLEBAR', 'TAIL_LIGHT',
  'ENGINE_COVER', 'HEADLIGHT', 'MIRROR', 'NUMBER',
  // Profile
  'RANK_CARD', 'FRAME', 'BACKDROP', 'TITLE',
  // Effect
  'TRAIL', 'HORN', 'START_ANIM',
  // Social
  'EMOTE', 'BANNER', 'PET',
];

export default function EquipPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);

  const initSlot = searchParams.get('slot') ?? SLOTS[0];
  const initCode = searchParams.get('code');
  const [activeSlot, setActiveSlot] = useState(initSlot);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(initCode);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetchInventory(user.id).then(({ items: all }) => {
      setItems(all);
    });
  }, [user?.id]);

  const slotItems = items.filter((i) => i.item_slot === activeSlot);
  const equippedItem = slotItems.find((i) => i.is_equipped) ?? null;
  const previewItem = selectedCode
    ? slotItems.find((i) => i.item_code === selectedCode) ?? equippedItem
    : equippedItem;

  async function handleSave() {
    if (!user?.id || !selectedCode || saving) return;
    setSaving(true);
    try {
      await equipItem(user.id, selectedCode);
      toast.success(t('equipPreview.equip_done', { slot: slotLabel(activeSlot) }));
      setItems((prev) =>
        prev.map((i) =>
          i.item_slot === activeSlot
            ? { ...i, is_equipped: i.item_code === selectedCode }
            : i,
        ),
      );
      setSelectedCode(null);
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSaving(false);
    }
  }

  const hasChange = selectedCode !== null && selectedCode !== equippedItem?.item_code;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <button className={s.backBtn} onClick={() => navigate(-1)}>‹</button>
        <span className={s.title}>{t('equipPreview.title')}</span>
      </div>

      {/* Slot tabs */}
      <div className={s.slotTabs}>
        {SLOTS.map((slot) => (
          <button
            key={slot}
            className={`${s.slotTab} ${slot === activeSlot ? s.slotTabActive : ''}`}
            onClick={() => { setActiveSlot(slot); setSelectedCode(null); }}
          >
            {slotLabel(slot)}
          </button>
        ))}
      </div>

      {/* Preview hero */}
      <div className={s.previewHero}>
        <div className={s.previewGlow} />
        {previewItem ? (
          <div className={s.previewItem}>
            <ItemSvgRenderer itemCode={previewItem.item_code} size={120} rarity={previewItem.rarity} />
          </div>
        ) : (
          <div className={s.previewEmpty}>{t('equipPreview.slot_empty')}</div>
        )}
      </div>

      {previewItem && (
        <div className={s.equippedLabel}>
          <ItemName code={previewItem.item_code} fallback={previewItem.item_name} /> · <span className="rarity-chip" data-r={previewItem.rarity} style={{ fontSize: 9 }}>{previewItem.rarity}</span>
        </div>
      )}

      {/* Item list */}
      <div className={s.itemList}>
        {slotItems.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 13, marginTop: 24 }}>
            {t('equipPreview.no_items', { slot: slotLabel(activeSlot) })}
          </div>
        ) : (
          slotItems.map((item) => {
            const isSelected = selectedCode === item.item_code;
            const isEquipped = item.is_equipped;
            return (
              <div
                key={item.user_item_id}
                className={`${s.itemRow} ${isSelected ? s.itemRowSelected : ''} ${isEquipped && !isSelected ? s.itemRowEquipped : ''}`}
                onClick={() => setSelectedCode(isSelected ? null : item.item_code)}
              >
                <div className={`${s.itemRowIcon} rarity-card`} data-r={item.rarity}>
                  <ItemSvgRenderer itemCode={item.item_code} size={36} rarity={item.rarity} />
                </div>
                <div className={s.itemRowInfo}>
                  <div className={s.itemRowName}><ItemName code={item.item_code} fallback={item.item_name} /></div>
                  <div className={s.itemRowMeta}>
                    <span className="rarity-chip" data-r={item.rarity} style={{ fontSize: 9 }}>{item.rarity}</span>
                    {isEquipped && <span className={s.equippedBadge}>EQUIPPED</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom save bar */}
      <div className={s.bottomBar}>
        <button
          className={`${s.btnSave} ${!hasChange ? s.btnSaveDisabled : ''}`}
          onClick={handleSave}
          disabled={!hasChange || saving}
        >
          {saving ? t('equipPreview.saving') : hasChange ? t('equipPreview.save') : t('equipPreview.no_change')}
        </button>
      </div>
    </div>
  );
}
