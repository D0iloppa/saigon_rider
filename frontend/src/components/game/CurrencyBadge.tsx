type Currency = 'GOLD' | 'XP' | 'SXP';

const ICON: Record<Currency, string> = { GOLD: '🪙', XP: '💎', SXP: '⚡' };
const COLOR: Record<Currency, string> = {
  GOLD: 'var(--gold)',
  XP:   'var(--gc)',
  SXP:  'var(--neon-lime)',
};

interface CurrencyBadgeProps {
  currency: Currency;
  amount: number;
  surface?: 'light' | 'dark';
  className?: string;
}

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  return n.toLocaleString();
}

export function CurrencyBadge({
  currency,
  amount,
  surface = 'light',
  className,
}: CurrencyBadgeProps) {
  const dark = surface === 'dark';

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 99,
        background: dark ? 'rgba(255,255,255,.08)' : 'var(--surface-2)',
        border: dark
          ? '1px solid rgba(255,255,255,.1)'
          : '1px solid var(--line)',
        fontSize: 12,
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: dark ? 'rgba(255,255,255,.9)' : 'var(--text)',
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 11 }}>{ICON[currency]}</span>
      <span>{fmt(amount)}</span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '.06em',
          color: dark ? 'rgba(255,255,255,.4)' : COLOR[currency],
        }}
      >
        {currency}
      </span>
    </span>
  );
}
