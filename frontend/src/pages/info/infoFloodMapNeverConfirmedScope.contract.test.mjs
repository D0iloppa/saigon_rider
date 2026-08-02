import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// F-11 잔여 갭: 한 번도 예측이 성공한 적 없는 구역("확인 불가")은 초록 "안전"으로 렌더되면
// 안 되고(fail-closed), hasStaleRisk 와 동일한 필터 스코프 함정을 피해야 한다 —
// 'report'/'hotspot' 필터에서는(risk 와 무관) 적용되지 않아야 진짜 빈 상태(정상)를
// 장애로 오인하지 않는다.
test('hasUnconfirmedRisk is scoped to the risk filter, mirroring hasStaleRisk', () => {
  const source = read('InfoFloodMap.tsx');

  const decl = source.match(/const hasUnconfirmedRisk = useMemo\(([\s\S]*?)\),\s*\[([^\]]*)\],?\s*\);/);
  assert.ok(decl, 'hasUnconfirmedRisk useMemo declaration not found');
  const [, body, deps] = decl;

  assert.match(
    body,
    /floodFilter === null[\s\S]*?['"]risk['"]/,
    'hasUnconfirmedRisk must scope to floodFilter === null || floodFilter === "risk", same as hasStaleRisk',
  );
  assert.match(deps, /floodFilter/, 'hasUnconfirmedRisk deps must include floodFilter');

  // 판정은 additive 필드 never_confirmed 의 엄격한 === true 비교여야 한다 — 필드가 없는(구버전
  // 캐시 응답 등) undefined 는 truthy 취급되면 안 된다(과차단 방지, 기존 동작 유지).
  assert.match(
    body,
    /never_confirmed === true/,
    'hasUnconfirmedRisk must use a strict === true check on the additive never_confirmed field',
  );
});

// 초록 "안전"으로 렌더되면 안 된다 — hasStaleRisk 와 동일하게 neutral tone 의 unavailable
// 블록(AlertCircle · unavailableTitle)에 합류해야 한다. 새로운 별도 상태/컴포넌트를
// 만들지 않고 기존 경로를 재사용하는지 정적으로 고정.
test('hasUnconfirmedRisk feeds the existing unavailable (neutral) render path, not a new one', () => {
  const source = read('InfoFloodMap.tsx');

  assert.match(
    source,
    /filteredFloodEntries\.length === 0 && \(hasStaleRisk \|\| hasUnconfirmedRisk\)/,
    'the empty-state branch must combine hasStaleRisk and hasUnconfirmedRisk into the same unavailable render',
  );
});
