/**
 * DM 메시지 로컬 캐시 (IndexedDB) — 215_dm_message_sync 프론트 짝.
 *
 * DmDetail 진입 시 캐시로 즉시 렌더한 뒤, 캐시의 최대 updatedAt 을 워터마크로
 * 증분 폴링해 id 기준 upsert 한다. 캐시는 best-effort — IndexedDB 를 못 쓰는
 * 환경(프라이빗 모드 등)에서는 조용히 빈 결과로 폴백하고 네트워크 전체 로드로 동작한다.
 */
import type { DmMessage } from '@/api/types';

const DB_NAME = 'sgr-dm-cache';
const DB_VERSION = 1;
const STORE = 'messages';
/** 대화당 로드 상한 — 그 이전 과거분은 위로 스크롤 시 서버 offset 페이지로 다시 받는다. */
const MAX_PER_CONV = 300;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('indexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('byConv', 'conversationId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // 실패한 open 을 캐싱하지 않는다 — 다음 호출에서 재시도
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

/** 대화방의 캐시 메시지 (createdAt 오름차순, 최근 MAX_PER_CONV 건). */
export async function loadCachedMessages(conversationId: string): Promise<DmMessage[]> {
  try {
    const db = await openDb();
    return await new Promise<DmMessage[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).index('byConv').getAll(conversationId);
      req.onsuccess = () => {
        const items = (req.result as DmMessage[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        resolve(items.slice(-MAX_PER_CONV));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** 메시지 upsert 저장 (id 키). 실패는 무시 — 캐시는 없어도 동작에 지장 없다. */
export async function saveCachedMessages(messages: DmMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const m of messages) store.put(m);
      // 쓰기 시점 상한 유지 — 대화가 길어져도 IndexedDB 가 무한 증가하지 않게,
      // 대화별 MAX_PER_CONV 초과분을 오래된 것부터 삭제한다.
      for (const convId of new Set(messages.map((m) => m.conversationId))) {
        const req = store.index('byConv').getAll(convId);
        req.onsuccess = () => {
          const items = (req.result as DmMessage[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          for (const old of items.slice(0, Math.max(0, items.length - MAX_PER_CONV))) store.delete(old.id);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

/** 전체 캐시 파기 — 로그아웃 시 호출 (공유기기에서 다음 로그인 사용자에게 이전 채팅 노출 방지). */
export async function clearAllCachedMessages(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}
