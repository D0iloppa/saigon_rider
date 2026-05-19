import type { CollectionCode } from '@/lib/items';

const LABEL: Record<CollectionCode, string> = {
  STREET_CLASSIC:   'Street Classic',
  NEON_SAIGON:      'Neon Saigon',
  TET_FESTIVAL:     'Tết Festival',
  MEKONG_DELTA:     'Mekong Delta',
  DELIVERY_HUSTLE:  'Delivery Hustle',
  SAIGON_GHOST:     'Saigon Ghost',
  LEGEND_OF_SAIGON: 'Legend of Saigon',
};

export interface CollectionChipProps {
  collection: CollectionCode;
  size?: 'sm' | 'md';
}

export function CollectionChip({ collection, size = 'md' }: CollectionChipProps) {
  return (
    <span
      data-col={collection}
      className={`col-chip ${size === 'sm' ? 'text-[9px]' : ''}`}
    >
      {LABEL[collection]}
    </span>
  );
}
