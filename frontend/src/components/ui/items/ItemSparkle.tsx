import type { CSSProperties } from 'react';

export interface ItemSparkleProps {
  style?: CSSProperties;
  delay?: number;
  color?: string;
  size?: number;
}

export function ItemSparkle({
  style, delay = 0, color = '#FFB800', size = 6,
}: ItemSparkleProps) {
  return (
    <span
      className="item-sparkle"
      style={{
        ...style,
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 ${size * 1.3}px ${size * 0.5}px ${color}80`,
        animationDelay: `${delay}s`,
        position: 'absolute',
      }}
    />
  );
}
