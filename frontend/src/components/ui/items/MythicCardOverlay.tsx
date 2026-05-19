export interface MythicCardOverlayProps {
  variant?: 'full' | 'subtle';
}

export function MythicCardOverlay({ variant = 'full' }: MythicCardOverlayProps) {
  const opacity = variant === 'subtle' ? 0.5 : 1;

  return (
    <span
      aria-hidden
      className="absolute pointer-events-none animate-[item-mythic-spin_6s_linear_infinite]"
      style={{
        inset: '-50%',
        borderRadius: '50%',
        opacity,
        background:
          'conic-gradient(from 0deg, rgba(255,45,156,.15), rgba(255,116,56,.10), rgba(255,184,0,.12), rgba(0,240,255,.12), rgba(182,255,28,.10), rgba(139,92,246,.15), rgba(255,45,156,.15))',
      }}
    />
  );
}
