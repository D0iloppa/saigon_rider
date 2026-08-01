/** sessionStorage 기반 SWR 캐시 (info 목록 등 공용). 5분 TTL. */
const SWR_TTL_MS = 5 * 60 * 1000;

export function swrRead<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - ts > SWR_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export function swrWrite<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* quota — ignore */
  }
}
