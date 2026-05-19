interface PityBarProps {
  current: number;
  ceiling: number;
  dark?: boolean;
  className?: string;
}

export function PityBar({ current, ceiling, dark, className }: PityBarProps) {
  const pct = ceiling > 0 ? Math.round((current / ceiling) * 100) : 0;
  const isNear = pct >= 80;
  const remaining = ceiling - current;

  return (
    <div className={className}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span
          style={{
            fontSize: 11,
            color: dark ? 'rgba(255,255,255,.45)' : 'var(--text-3)',
          }}
        >
          천장까지 {remaining}회 남음
        </span>
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 10,
            color: dark ? 'rgba(255,255,255,.4)' : 'var(--text-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {current} / {ceiling}
        </span>
      </div>
      <div
        className="pity-bar"
        style={{ background: dark ? 'rgba(255,255,255,.1)' : undefined }}
      >
        <div
          className="pity-bar-fill"
          data-near={isNear ? 'true' : 'false'}
          style={{
            width: `${pct}%`,
            background: dark
              ? 'linear-gradient(90deg, #FFB800, #FF5A1F)'
              : undefined,
          }}
        />
      </div>
    </div>
  );
}
