import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 215_dm_message_sync code-review 회귀 계약 —
// (1) 5초 폴링으로 도착한 **신규** 메시지 수만큼 totalRef 도 전진해야 한다. 안 하면
//     loadOlder 의 "안 받은 과거분 = total - 보유건수" 페이지 계산이 뒤로 밀려
//     과거 메시지 구간을 영구히 건너뛴다.
// (2) 낙관적 공감/삭제 반영은 updatedAt 도 함께 올려 폴링 워터마크가 후퇴하지 않아야 한다.

test('polling tick advances totalRef by the count of genuinely new messages', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /const fresh = res\.items\.filter\(\(m\) => !knownIds\.has\(m\.id\)\);/);
  assert.match(detail, /if \(fresh\.length > 0 && totalRef\.current !== null\) totalRef\.current \+= fresh\.length;/);
});

test('optimistic reaction/delete updates bump local updatedAt so the watermark cannot regress', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /applyIncoming\(\[\{ \.\.\.m, reactions, updatedAt: new Date\(\)\.toISOString\(\) \}\]\);/);
  assert.match(detail, /deletedAt: new Date\(\)\.toISOString\(\), updatedAt: new Date\(\)\.toISOString\(\)/);
});

// (3) IndexedDB 캐시는 쓰기 시점에 대화별 MAX_PER_CONV 상한을 유지해야 한다 — 읽기 시점
//     slice 만으로는 저장소가 무한 증가한다.
// (4) 로그아웃(clearSession)은 DM 캐시 전체를 파기해야 한다 — 공유기기에서 다음 로그인
//     사용자에게 이전 사용자의 채팅이 노출되지 않게.

test('saveCachedMessages trims each conversation to MAX_PER_CONV at write time', () => {
  const cache = read('../../lib/dmCache.ts');
  const save = cache.slice(cache.indexOf('export async function saveCachedMessages'), cache.indexOf('export async function clearAllCachedMessages'));
  assert.match(save, /new Set\(messages\.map\(\(m\) => m\.conversationId\)\)/);
  assert.match(save, /items\.slice\(0, Math\.max\(0, items\.length - MAX_PER_CONV\)\)/);
  assert.match(save, /store\.delete\(old\.id\)/);
});

test('clearSession purges the whole DM cache', () => {
  const cache = read('../../lib/dmCache.ts');
  assert.match(cache, /export async function clearAllCachedMessages/);
  const session = read('../../lib/session.ts');
  const clear = session.slice(session.indexOf('export function clearSession'));
  assert.match(clear, /void clearAllCachedMessages\(\);/);
});
