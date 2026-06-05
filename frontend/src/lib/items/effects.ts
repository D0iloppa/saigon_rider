import type { InventoryItem } from '@/api/inventory';
import type { SkillKey } from '@/api/types';

export type EffectType = 'RP_MULT' | 'GOLD_MULT' | 'QUEST_SLOT' | 'COST_DISCOUNT';

/** 효과 축 ↔ 스킬 1:1 매핑. value(lv)는 SkillTree.tsx 의 SKILLS 와 동일해야 함(드리프트 금지). */
const SKILL_BY_EFFECT: Record<EffectType, { key: SkillKey; value: (lv: number) => number }> = {
  RP_MULT: { key: 'distance_rider', value: (lv) => lv * 5 },
  GOLD_MULT: { key: 'gold_hunter', value: (lv) => lv * 5 },
  QUEST_SLOT: { key: 'quest_slot', value: (lv) => (lv >= 3 ? 1 : 0) },
  COST_DISCOUNT: { key: 'cost_discount', value: (lv) => lv * 2 },
};

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

// 합계 안전캡 — 백엔드(utils.REWARD_PCT_CAP=50, 엔진 비용할인 cap=30)와 일치. QUEST_SLOT은 개수라 캡 없음.
const EFFECT_CAP: Partial<Record<EffectType, number>> = { RP_MULT: 50, GOLD_MULT: 50, COST_DISCOUNT: 30 };

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
  is_skill?: boolean;    // 스킬 기여 row (아이템과 구분 표시)
  skill_i18n?: string;   // 스킬명 i18n 키 (is_skill 일 때)
}

export interface AggregatedEffect {
  type: EffectType;
  total: number;
  items: EffectContributor[];
}

/**
 * 착용 아이템 + 스킬 효과를 effect_type별로 가산 합산한다 (값 0 / 미장착 제외).
 * skills 가 주어지면 각 축의 스킬 기여를 섹션 맨 끝 row 로 추가한다(레벨 0 / 기여 0 은 제외).
 */
export function aggregateEquippedEffects(
  items: InventoryItem[],
  skills?: Partial<Record<SkillKey, number>>,
): AggregatedEffect[] {
  const map = new Map<EffectType, AggregatedEffect>();
  const ensure = (type: EffectType): AggregatedEffect => {
    let agg = map.get(type);
    if (!agg) {
      agg = { type, total: 0, items: [] };
      map.set(type, agg);
    }
    return agg;
  };

  for (const it of items) {
    if (!it.is_equipped || !it.effect_type || !it.effect_value) continue;
    const type = it.effect_type as EffectType;
    const agg = ensure(type);
    agg.total += it.effect_value;
    agg.items.push({ item_code: it.item_code, item_name: it.item_name, value: it.effect_value });
  }

  if (skills) {
    for (const type of EFFECT_ORDER) {
      const axis = SKILL_BY_EFFECT[type];
      const value = axis.value(skills[axis.key] ?? 0);
      if (value <= 0) continue;
      const agg = ensure(type);
      agg.total += value;
      agg.items.push({
        item_code: axis.key,
        item_name: axis.key,
        value,
        is_skill: true,
        skill_i18n: `skill.${axis.key}.name`,
      });
    }
  }

  return EFFECT_ORDER.filter((t) => map.has(t)).map((t) => {
    const agg = map.get(t)!;
    // 백엔드 안전캡과 동일하게 합계 상한 적용(개별 기여 row 는 실값 유지). 표시=실지급.
    const cap = EFFECT_CAP[t];
    if (cap !== undefined && agg.total > cap) agg.total = cap;
    return agg;
  });
}
