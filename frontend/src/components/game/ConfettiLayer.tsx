const COLORS = ['#FF2D9C', '#00F0FF', '#FFB800', '#B65EFF', '#FF5A1F'];

interface ConfettiLayerProps {
  count?: number;
  className?: string;
}

export function ConfettiLayer({ count = 30, className }: ConfettiLayerProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 375 270"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '46%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const x = (i * 37 + 15) % 375;
        const y = (i * 23 + 10) % 260;
        const c = COLORS[i % COLORS.length];
        const size = 4 + (i % 5);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={size}
            height={size * 0.6}
            fill={c}
            opacity={0.6 + (i % 4) * 0.1}
            transform={`rotate(${(i * 47) % 360} ${x + size / 2} ${y + size * 0.3})`}
          />
        );
      })}
    </svg>
  );
}
