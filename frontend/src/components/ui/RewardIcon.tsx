import { emojiUrl } from '@/lib/emoji';

export type RewardType = 'EXP' | 'XP' | 'GOLD' | 'ITEM';

export const REWARD_EMOJI_CODE: Record<RewardType, string> = {
  EXP:  '2b50',
  XP:   '1f48e',
  GOLD: '1fa99',
  ITEM: '1f381',
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
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function RewardIcon({ type, size = 20, className, style }: RewardIconProps) {
  return (
    <img
      className={className}
      src={emojiUrl(REWARD_EMOJI_CODE[type])}
      width={size}
      height={size}
      alt={REWARD_LABEL[type]}
      style={{ display: 'inline-block', ...style }}
    />
  );
}
