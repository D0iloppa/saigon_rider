import { BIKE_VIEWBOX, BIKE_BASE_SYMBOL, BIKE_LAYOUT } from '@/lib/items/slotLayout';
import type { SlotAttachment } from '@/lib/items/slotLayout';

interface Props {
  equipment: Partial<Record<string, string>>;
  className?: string;
}

function SlotLayer({ itemCode, point, spin }: { itemCode: string; point: SlotAttachment; spin?: boolean }) {
  const use = <use href={`#item-${itemCode}`} className={spin ? 'sr-wheel-spin' : undefined} />;
  if (point.mirror) {
    return (
      <g transform={`translate(${point.x + point.w},${point.y}) scale(-1,1)`}>
        <svg x={0} y={0} width={point.w} height={point.h}
             viewBox={point.viewBox} overflow="visible">
          {use}
        </svg>
      </g>
    );
  }
  return (
    <svg x={point.x} y={point.y} width={point.w} height={point.h}
         viewBox={point.viewBox} overflow="visible">
      {use}
    </svg>
  );
}

export function BikeComposite({ equipment, className }: Props) {
  return (
    <svg viewBox={BIKE_VIEWBOX} className={className} overflow="visible">
      {/* WHEEL 장착 시 제자리 회전(공회전 느낌) — 프리뷰 한정, 그리드 렌더러엔 미적용 */}
      <style>{'@keyframes sr-wheel-spin{to{transform:rotate(-360deg)}}.sr-wheel-spin{transform-box:fill-box;transform-origin:center;animation:sr-wheel-spin 1.4s linear infinite}'}</style>
      <use href={`#${BIKE_BASE_SYMBOL}`} />
      {/* zOrder 순 페인트: WHEEL(0)이 최하단 → 그 위로 BODY(1) 축이 올라와 바퀴를 고정 */}
      {[...BIKE_LAYOUT].sort((a, b) => a.zOrder - b.zOrder).map(({ slot, points }) => {
        const code = equipment[slot];
        if (!code) return null;
        return points.map((pt, i) => (
          <SlotLayer key={`${slot}-${i}`} itemCode={code} point={pt} spin={slot === 'WHEEL'} />
        ));
      })}
    </svg>
  );
}
