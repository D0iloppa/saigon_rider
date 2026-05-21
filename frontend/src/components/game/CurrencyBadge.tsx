import { emojiUrl } from '@/lib/emoji';

type Currency = 'GOLD' | 'XP' | 'SXP';

const ICON_CODE: Record<Currency, string> = { GOLD: '1fa99', XP: '1f48e', SXP: '26a1' };
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
      <img src={emojiUrl(ICON_CODE[currency])} width={11} height={11} alt="" style={{ display: 'block' }} />
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
