import type { ReactNode } from 'react';
import type { ItemRarity } from '@/lib/items';
import { MythicCardOverlay } from '@/components/ui/items/MythicCardOverlay';
import { ItemSparkle } from '@/components/ui/items/ItemSparkle';

export interface RarityCardProps {
  rarity: ItemRarity;
  children: ReactNode;
  /**
   * 'light' → 앱 chrome 위 (.rarity-card[data-r])
   * 'dark'  → 게임 UI 위 (.item-card[data-r]) — Mythic/Legendary 효과 풀 렌더
   */
  surface?: 'light' | 'dark';
  className?: string;
}

export function RarityCard({
  rarity, children, surface = 'light', className,
}: RarityCardProps) {
  const baseClass = surface === 'dark' ? 'item-card' : 'rarity-card';

  return (
    <div
      data-r={rarity}
      className={`${baseClass} relative overflow-hidden ${className ?? ''}`}
    >
      {surface === 'dark' && rarity === 'M' && <MythicCardOverlay />}
      {surface === 'dark' && rarity === 'L' && (
        <>
          <ItemSparkle style={{ top: 12, left: 16 }} />
          <ItemSparkle style={{ top: 24, right: 20 }} delay={0.5} />
          <ItemSparkle style={{ bottom: 16, left: 28 }} delay={1.0} />
          <ItemSparkle style={{ bottom: 20, right: 12 }} delay={1.5} />
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
