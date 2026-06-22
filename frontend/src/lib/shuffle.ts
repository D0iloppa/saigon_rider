/** Fisher–Yates 셔플 — 원본 불변, 새 배열 반환. (광고 랜덤 노출 등) */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 광고 노출 배치 크기(3~4개). */
export const randAdBatch = () => 3 + Math.floor(Math.random() * 2);
