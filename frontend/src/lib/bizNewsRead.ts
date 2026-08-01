/** 업체 새소식 읽음 추적 — localStorage 미러 (W4).
 *  값은 "읽은 시각"이 아니라 그 뉴스의 createdAt — 클라·서버 시계 차이(skew)에 안전. */
const KEY = 'sgr.biz.readNews';
const MAX_ENTRIES = 200;

type Store = Record<string, string>; // bizId → 마지막으로 읽은 news 의 createdAt(ISO)

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

export function isNewsUnread(bizId: string, newsCreatedAt: string | null | undefined): boolean {
  if (!newsCreatedAt) return false;
  const readAt = read()[bizId];
  return !readAt || new Date(newsCreatedAt) > new Date(readAt);
}

export function markBizNewsRead(bizId: string, newsCreatedAt: string): void {
  try {
    const store = read();
    store[bizId] = newsCreatedAt;
    const entries = Object.entries(store);
    const trimmed = entries.length > MAX_ENTRIES
      ? Object.fromEntries(entries.sort((a, b) => a[1].localeCompare(b[1])).slice(entries.length - MAX_ENTRIES))
      : store;
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* quota — 무시 */
  }
}
