/** 주유소 혼잡도 제보 쿨다운(서버 규약 30분)의 클라이언트 미러.
 *  서버가 여전히 source of truth(429) — 여기선 선제적으로 버튼을 막아 UX 개선만 담당. */
const COOLDOWN_MS = 30 * 60 * 1000;
const KEY = 'gas:waitReported';

type Store = Record<string, number>; // station_id → reported_at(ms)

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

/** 제보 성공 시 호출 → 쿨다운 시작. */
export function markWaitReported(stationId: number): void {
  try {
    const store = read();
    store[String(stationId)] = Date.now();
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
}

/** 쿨다운 중이면 남은 분(올림), 아니면 null. */
export function waitCooldownMinutes(stationId: number): number | null {
  const reportedAt = read()[String(stationId)];
  if (!reportedAt) return null;
  const remaining = COOLDOWN_MS - (Date.now() - reportedAt);
  if (remaining <= 0) return null;
  return Math.ceil(remaining / 60000);
}
