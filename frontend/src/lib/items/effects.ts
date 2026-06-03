import type { InventoryItem } from '@/api/inventory';

export type EffectType = 'RP_MULT' | 'GOLD_MULT' | 'QUEST_SLOT' | 'COST_DISCOUNT';

export interface EffectMeta {
  i18nKey: string;
  emoji: string; // emoji codepoint for emojiUrl()
  unit: 'pct' | 'count';
  sign: '+' | '-';
}

export const EFFECT_META: Record<EffectType, EffectMeta> = {
  RP_MULT: { i18nKey: 'effects.rp', emoji: '1f680', unit: 'pct', sign: '+' },
  GOLD_MULT: { i18nKey: 'effects.gold', emoji: '1fa99', unit: 'pct', sign: '+' },
  QUEST_SLOT: { i18nKey: 'effects.quest_slot', emoji: '1f3af', unit: 'count', sign: '+' },
  COST_DISCOUNT: { i18nKey: 'effects.cost_discount', emoji: '1f4b8', unit: 'pct', sign: '-' },
};

export const EFFECT_ORDER: EffectType[] = ['RP_MULT', 'GOLD_MULT', 'QUEST_SLOT', 'COST_DISCOUNT'];

/** "+7%" / "+2" / "-6%" 형태의 짧은 효과 표기. */
export function formatEffectValue(type: EffectType, value: number): string {
  const meta = EFFECT_META[type];
  const unit = meta.unit === 'pct' ? '%' : '';
  return `${meta.sign}${value}${unit}`;
}

export interface EffectContributor {
  item_code: string;
  item_name: string;
  value: number;
}

export interface AggregatedEffect {
  type: EffectType;
  total: number;
  items: EffectContributor[];
}

/** 착용 중인 아이템의 효과를 effect_type별로 가산 합산한다 (값 0 / 미장착 제외). */
export function aggregateEquippedEffects(items: InventoryItem[]): AggregatedEffect[] {
  const map = new Map<EffectType, AggregatedEffect>();
  for (const it of items) {
    if (!it.is_equipped || !it.effect_type || !it.effect_value) continue;
    const type = it.effect_type as EffectType;
    let agg = map.get(type);
    if (!agg) {
      agg = { type, total: 0, items: [] };
      map.set(type, agg);
    }
    agg.total += it.effect_value;
    agg.items.push({ item_code: it.item_code, item_name: it.item_name, value: it.effect_value });
  }
  return EFFECT_ORDER.filter((t) => map.has(t)).map((t) => map.get(t)!);
}
