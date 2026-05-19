import type { ReactNode } from 'react';
import type { ItemRarity } from '@/lib/items';
import { MythicCardOverlay } from './MythicCardOverlay';

export interface InventoryCellProps {
  rarity: ItemRarity;
  children: ReactNode;
  empty?: boolean;
  locked?: boolean;
  onClick?: () => void;
  className?: string;
}

export function InventoryCell({
  rarity, children, empty, locked, onClick, className,
}: InventoryCellProps) {
  return (
    <button
      data-r={rarity}
      onClick={onClick}
      disabled={empty || locked}
      className={`inv-cell ${empty ? 'opacity-30' : ''} ${className ?? ''}`}
    >
      {rarity === 'M' && !empty && <MythicCardOverlay variant="subtle" />}
      <div className="relative z-10">{children}</div>
      {locked && (
        <div className="absolute inset-0 bg-black/60 grid place-items-center text-white text-xs">
          🔒
        </div>
      )}
    </button>
  );
}
