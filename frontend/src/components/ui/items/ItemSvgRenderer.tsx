import { PAIR_SLOTS } from '@/lib/items/slotLayout';
import { SLOT_VIEWBOX, slotFromCode } from '@/lib/items/metadata';
import type { ItemSlot } from '@/lib/items/metadata';

const RARITY_COLOR: Record<string, string> = {
  C: '#8A9099',
  R: '#3B82F6',
  E: '#8B5CF6',
  L: '#FFB800',
  M: '#FF2D9C',
};

export interface ItemSvgRendererProps {
  itemCode: string;
  slot?: string;
  size?: number;
  rarity?: 'C' | 'R' | 'E' | 'L' | 'M';
  className?: string;
}

export function ItemSvgRenderer({
  itemCode, slot, size = 80, rarity, className,
}: ItemSvgRendererProps) {
  const filterClass = rarity ? `item-r-${rarity.toLowerCase()}` : '';
  const color = rarity ? RARITY_COLOR[rarity] : undefined;
  const resolvedSlot = (slot ?? slotFromCode(itemCode)) as ItemSlot;
  const itemViewBox = SLOT_VIEWBOX[resolvedSlot] ?? '0 0 100 100';
  const isPair = PAIR_SLOTS.has(resolvedSlot);

  // 심볼마다 intrinsic viewBox 가 달라(60×20 ~ 240×80) 고정 박스에 <use> 하면
  // 작은 심볼이 좌상단 점처럼 찍혀 안 보인다. 심볼 viewBox 로 정규화하고
  // preserveAspectRatio meet 으로 박스 안에 비율 유지·중앙정렬한다.
  if (isPair) {
    // 좌/우 한쌍 (GLOVES·BOOTS·MIRROR). 우측은 좌우반전.
    return (
      <svg
        viewBox="0 0 220 200"
        width={size}
        height={size}
        style={color ? { color } : undefined}
        className={[filterClass, className].filter(Boolean).join(' ')}
      >
        <svg x={10} y={0} width={90} height={200} viewBox={itemViewBox}
             preserveAspectRatio="xMidYMid meet" overflow="visible">
          <use href={`#item-${itemCode}`} />
        </svg>
        <g transform="translate(210,0) scale(-1,1)">
          <svg x={0} y={0} width={90} height={200} viewBox={itemViewBox}
               preserveAspectRatio="xMidYMid meet" overflow="visible">
            <use href={`#item-${itemCode}`} />
          </svg>
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox={itemViewBox}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      style={color ? { color } : undefined}
      className={[filterClass, className].filter(Boolean).join(' ')}
    >
      <use href={`#item-${itemCode}`} />
    </svg>
  );
}
