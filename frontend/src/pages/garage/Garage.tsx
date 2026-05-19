import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchInventory, slotLabel } from '@/api/inventory';
import type { InventoryItem } from '@/api/inventory';
import type { ItemRarity } from '@/api/gacha';
import { useUserStore } from '@/store/useUserStore';
import { emojiUrl } from '@/lib/emoji';
import styles from './Garage.module.css';

const SLOT_EMOJI: Record<string, string> = {
  HELMET: '1fa96', JACKET: '1f9e5', GLOVES: '1f9e4', BOOTS: '1f97e',
  EYEWEAR: '1f576', NAMEPLATE: '1f3f7',
  BODY_PAINT: '1f3a8', WHEEL: '2699', EXHAUST: '1f525',
  HEADLIGHT: '1f4a1', MIRROR: '1f9f0', DECAL: '1f409', NUMBER_PLATE: '1f522',
  FRAME: '1f5bc', BACKDROP: '1f304',
  TITLE_BANNER: '1f3f4', TRAIL: '2728', HORN: '1f514',
};

const RARITY_COLOR: Record<ItemRarity, string> = {
  C: '#6b7280', R: '#3b82f6', E: '#8b5cf6', L: '#f59e0b', M: '#ef4444',
};

const SECTIONS: { label: string; slots: string[] }[] = [
  {
    label: '라이더 장비',
    slots: ['HELMET', 'JACKET', 'GLOVES', 'BOOTS', 'EYEWEAR'],
  },
  {
    label: '바이크 커스텀',
    slots: ['BODY_PAINT', 'WHEEL', 'EXHAUST', 'HEADLIGHT', 'MIRROR', 'DECAL'],
  },
  {
    label: '이펙트',
    slots: ['TITLE_BANNER', 'TRAIL', 'HORN', 'BACKDROP', 'NAMEPLATE'],
  },
];

export default function Garage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const [equippedMap, setEquippedMap] = useState<Record<string, InventoryItem>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { items } = await fetchInventory(user.id);
      const map: Record<string, InventoryItem> = {};
      for (const item of items) {
        if (item.is_equipped) map[item.item_slot] = item;
      }
      setEquippedMap(map);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const equippedCount = Object.keys(equippedMap).length;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(-1)}>←</button>
        <div className={styles.headerTitle}>{t('gameHub.garage')}</div>
        <div style={{ width: 28 }} />
      </div>

      <div className={styles.body}>
        {/* Summary bar */}
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryNum}>{equippedCount}</span>
            <span className={styles.summaryLabel}>장착 중</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryItem}>
            <span className={styles.summaryNum}>{16 - equippedCount}</span>
            <span className={styles.summaryLabel}>빈 슬롯</span>
          </div>
          <div className={styles.summaryDivider} />
          <button className={styles.summaryLink} onClick={() => navigate('/inventory')}>
            전체 인벤토리 →
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingMsg}>{t('common.loading')}</div>
        ) : (
          SECTIONS.map((section) => (
            <div key={section.label} className={styles.section}>
              <div className={styles.sectionTitle}>{section.label}</div>
              <div className={styles.slotGrid}>
                {section.slots.map((slot) => {
                  const item = equippedMap[slot];
                  return (
                    <button
                      key={slot}
                      className={`${styles.slotCard} ${item ? styles.slotCardEquipped : styles.slotCardEmpty}`}
                      onClick={() => navigate(`/inventory/equip-preview?slot=${slot}`)}
                    >
                      <img
                        src={emojiUrl(SLOT_EMOJI[slot] ?? '1f4e6')}
                        width={32}
                        height={32}
                        alt=""
                        className={styles.slotEmoji}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div className={styles.slotLabel}>{slotLabel(slot)}</div>
                      {item ? (
                        <>
                          <div className={styles.itemName}>{item.item_name}</div>
                          <span
                            className={styles.rarityDot}
                            style={{ background: RARITY_COLOR[item.rarity] }}
                          />
                        </>
                      ) : (
                        <div className={styles.emptyLabel}>미착용</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
