import type { ItemRarity } from '@/lib/items';

const RARITY_LABEL: Record<ItemRarity, string> = {
  C: 'COMMON',
  R: 'RARE',
  E: 'EPIC',
  L: 'LEGENDARY',
  M: 'MYTHIC',
};

interface RarityChipProps {
  rarity: ItemRarity;
  label?: string;
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function RarityChip({ rarity, label, count, className, style }: RarityChipProps) {
  const text = label ?? RARITY_LABEL[rarity];

  return (
    <span
      className={`rarity-chip ${className ?? ''}`}
      data-r={rarity}
      style={style}
    >
      {text}
      {count != null && count > 0 && <> &times;{count}</>}
    </span>
  );
}
