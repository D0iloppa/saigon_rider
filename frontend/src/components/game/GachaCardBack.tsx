interface GachaCardBackProps {
  width?: number;
  label?: string;
  className?: string;
}

const cardStyle = (width: number): React.CSSProperties => ({
  width,
  aspectRatio: '3/4',
  borderRadius: 20,
  background: `
    radial-gradient(at 50% 30%, rgba(255,90,31,.18), transparent 50%),
    repeating-linear-gradient(
      135deg,
      #1A1D2A 0px, #1A1D2A 8px,
      #11131C 8px, #11131C 16px
    )`,
  border: '2px solid rgba(255,255,255,.08)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.1), 0 20px 50px rgba(0,0,0,.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  animation: 'gacha-card-flip 1.2s ease-in-out infinite',
});

const labelStyle: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 32,
  fontWeight: 700,
  color: 'rgba(255,255,255,.07)',
  letterSpacing: '-0.04em',
  userSelect: 'none',
};

export function GachaCardBack({ width = 140, label = '?', className }: GachaCardBackProps) {
  return (
    <div className={className} style={cardStyle(width)}>
      <span style={labelStyle}>{label}</span>
    </div>
  );
}
