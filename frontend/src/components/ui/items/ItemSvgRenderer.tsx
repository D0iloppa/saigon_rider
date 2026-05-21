// 신규 카탈로그(251종)는 모든 아이템이 결합 스프라이트(saigon-rider-items.svg)에
// 전용 <symbol id="item-{CODE}"> 를 가진다 → 항상 #item-{CODE} 를 참조한다.
// (구버전의 #base-{SLOT} 실루엣 폴백은 제거됨)

// rarity 별 틴트 (스프라이트 누락 시 빈 렌더 방지용 배경 색상에는 사용하지 않음)
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
  itemCode, size = 80, rarity, className,
}: ItemSvgRendererProps) {
  const filterClass = rarity ? `item-r-${rarity.toLowerCase()}` : '';
  const color = rarity ? RARITY_COLOR[rarity] : undefined;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={color ? { color } : undefined}
      className={[filterClass, className].filter(Boolean).join(' ')}
    >
      <use href={`#item-${itemCode}`} />
    </svg>
  );
}
