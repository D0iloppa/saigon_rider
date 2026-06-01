import { BIKE_VIEWBOX, BIKE_BASE_SYMBOL, BIKE_LAYOUT } from '@/lib/items/slotLayout';
import type { SlotAttachment } from '@/lib/items/slotLayout';

interface Props {
  equipment: Partial<Record<string, string>>;
  className?: string;
}

function SlotLayer({ itemCode, point }: { itemCode: string; point: SlotAttachment }) {
  if (point.mirror) {
    return (
      <g transform={`translate(${point.x + point.w},${point.y}) scale(-1,1)`}>
        <svg x={0} y={0} width={point.w} height={point.h}
             viewBox={point.viewBox} overflow="visible">
          <use href={`#item-${itemCode}`} />
        </svg>
      </g>
    );
  }
  return (
    <svg x={point.x} y={point.y} width={point.w} height={point.h}
         viewBox={point.viewBox} overflow="visible">
      <use href={`#item-${itemCode}`} />
    </svg>
  );
}

export function BikeComposite({ equipment, className }: Props) {
  return (
    <svg viewBox={BIKE_VIEWBOX} className={className} overflow="visible">
      <use href={`#${BIKE_BASE_SYMBOL}`} />
      {BIKE_LAYOUT.map(({ slot, points }) => {
        const code = equipment[slot];
        if (!code) return null;
        return points.map((pt, i) => (
          <SlotLayer key={`${slot}-${i}`} itemCode={code} point={pt} />
        ));
      })}
    </svg>
  );
}
