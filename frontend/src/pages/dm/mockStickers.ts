// Mockup 스티커 — 실제 애셋/스티커 시스템 도입 전 기능 테스트용.
// 외부 URL/바이너리 애셋 없이 인라인 SVG data URI 로 대체 (CSP-safe).
// 실제 시스템에서는 stickerId 로 서버 스티커팩을 조회하도록 교체.

export interface MockSticker {
  id: string;
  uri: string;
}

function svgSticker(emoji: string, bg: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
    `<rect width='160' height='160' rx='28' fill='${bg}'/>` +
    `<text x='50%' y='52%' font-size='96' text-anchor='middle' dominant-baseline='central'>${emoji}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const MOCK_STICKERS: MockSticker[] = [
  { id: 'st_hi', uri: svgSticker('🐰', '#FDE68A') },
  { id: 'st_love', uri: svgSticker('😍', '#FBCFE8') },
  { id: 'st_ok', uri: svgSticker('👌', '#BBF7D0') },
  { id: 'st_thanks', uri: svgSticker('🙏', '#BFDBFE') },
  { id: 'st_lol', uri: svgSticker('🤣', '#FED7AA') },
  { id: 'st_cool', uri: svgSticker('😎', '#DDD6FE') },
  { id: 'st_cry', uri: svgSticker('😭', '#A5F3FC') },
  { id: 'st_fire', uri: svgSticker('🔥', '#FECACA') },
];

export function findSticker(id: string | undefined): MockSticker | undefined {
  if (!id) return undefined;
  return MOCK_STICKERS.find((s) => s.id === id);
}
