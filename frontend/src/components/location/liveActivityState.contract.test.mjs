import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const source = read('liveActivityState.ts');
/** 주석 제외 실행 코드 — 설명 문구가 검사에 걸리지 않게 한다. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// SoT: ai-docs/task/active/260829_live_location_channel_task.md §Phase 3 (A-2).
// statusKind 정의가 헷갈리기 쉬워 대표 지시로 고정됐다 — 이 파일이 그 정의를 코드 계약으로 굳힌다.

test('둘 다 도착하면 arrived 다', () => {
  assert.match(
    code,
    /myArrived && peerArrived \? 'arrived'/,
    "myArrived && peerArrived → 'arrived' 분기가 있어야 한다",
  );
});

test('나만 도착하면 waiting 이다 (상대를 기다리는 상태)', () => {
  assert.match(
    code,
    /myArrived && !peerArrived \? 'waiting'/,
    "myArrived && !peerArrived → 'waiting' 분기가 있어야 한다",
  );
});

test('그 외(둘 다 이동 중이거나 상대만 도착)는 moving 이다 — 기본값', () => {
  const ternary = code.match(/const statusKind: LocationChannelStatusKind =\s*\n?\s*myArrived[\s\S]*?;/);
  assert.ok(ternary, 'statusKind 삼항식이 있어야 한다');
  assert.match(ternary[0], /: 'moving';\s*$/, "마지막 분기(기본값)는 'moving' 이어야 한다");
});

test('상대 선택은 나를 제외한, 나가지 않은, 좌표 있는 후보만 대상으로 한다', () => {
  assert.match(
    code,
    /m\.userId !== meUserId && !m\.leftAt && m\.lat != null && m\.lng != null/,
    '후보 필터에 본인 제외/이탈 제외/좌표 존재 조건이 모두 있어야 한다',
  );
  assert.match(
    source,
    /candidates\.length === 1 \|\| !meCoords\) return candidates\[0\]/,
    '후보가 1명뿐이거나 내 좌표를 모르면(측위 전) 거리 랭킹 없이 그대로 반환해야 한다',
  );
});

test('후보가 없으면 상대·거리·ETA가 모두 null 이다', () => {
  assert.match(source, /if \(candidates\.length === 0\) return null;/, 'selectLocationChannelPeer 는 후보가 없으면 null 을 반환해야 한다');
  assert.match(
    code,
    /peerEtaS: peer\?\.etaS \?\? null,/,
    'peer 가 null 이면 peerEtaS 도 null 로 떨어져야 한다(옵셔널 체이닝)',
  );
  assert.match(
    code,
    /peerToMeDistanceM: meCoords && peerCoords \? haversineM\(meCoords, peerCoords\) : null,/,
    '두 좌표가 모두 있을 때만 peerToMeDistanceM 을 계산해야 한다 — 하나라도 없으면 null',
  );
});
