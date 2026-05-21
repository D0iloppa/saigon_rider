import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { emojiUrl } from '@/lib/emoji';

interface CurrencyHUDProps {
  gold?: number;
  xp?: number;
  className?: string;
}

const baseStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
};

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: 99,
  background: 'rgba(255,255,255,.08)',
  border: '1px solid rgba(255,255,255,.1)',
  backdropFilter: 'blur(12px)',
  cursor: 'pointer',
  textDecoration: 'none',
};

const numStyle: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: 12,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: 'rgba(255,255,255,.9)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '.06em',
  color: 'rgba(255,255,255,.4)',
};

function formatCurrency(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  return n.toLocaleString();
}

export function CurrencyHUD({ gold = 0, xp = 0, className }: CurrencyHUDProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div style={baseStyle} className={className}>
      <div
        style={pillStyle}
        role="button"
        tabIndex={0}
        onClick={() => navigate('/shop')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/shop')}
        aria-label={`${t('currency.gold')} ${gold.toLocaleString()}`}
      >
        <img src={emojiUrl('1fa99')} width={14} height={14} alt="" style={{ display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <span style={numStyle}>{formatCurrency(gold)}</span>
        <span style={labelStyle}>{t('currency.gold')}</span>
      </div>
      <div
        style={pillStyle}
        role="button"
        tabIndex={0}
        onClick={() => navigate('/shop')}
        onKeyDown={(e) => e.key === 'Enter' && navigate('/shop')}
        aria-label={`${t('currency.xp')} ${xp.toLocaleString()}`}
      >
        <img src={emojiUrl('1f48e')} width={14} height={14} alt="" style={{ display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <span style={numStyle}>{formatCurrency(xp)}</span>
        <span style={labelStyle}>{t('currency.xp')}</span>
      </div>
    </div>
  );
}
