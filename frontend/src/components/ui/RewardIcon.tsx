export type RewardType = 'EXP' | 'XP' | 'GOLD' | 'ITEM';

export const REWARD_ICON: Record<RewardType, string> = {
  EXP:  '⭐',
  XP:   '💎',
  GOLD: '🪙',
  ITEM: '🎁',
};

export const REWARD_COLOR: Record<RewardType, string> = {
  EXP:  'var(--exp)',
  XP:   'var(--gc)',
  GOLD: 'var(--gold)',
  ITEM: '#F59E0B',
};

export const REWARD_LABEL: Record<RewardType, string> = {
  EXP:  'EXP',
  XP:   'XP',
  GOLD: 'GOLD',
  ITEM: 'Item',
};

interface RewardIconProps {
  type: RewardType;
  /** 이모지만 표시 (default: true) */
  iconOnly?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function RewardIcon({ type, iconOnly: _iconOnly = true, size = 20, className, style }: RewardIconProps) {
  return (
    <span
      className={className}
      style={{ fontSize: size, lineHeight: 1, display: 'inline-block', ...style }}
      role="img"
      aria-label={REWARD_LABEL[type]}
    >
      {REWARD_ICON[type]}
    </span>
  );
}
