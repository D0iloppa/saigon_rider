import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 리뷰 지적 1: hasStaleRisk 가 floodFilter 와 무관하게 전체 risks 배열을 검사해, "신고"/"상습" 필터가
// 켜진 화면에서도(진짜 0건이라 정상인데) provider 장애로 stale 한 risk 항목 하나만 있으면
// "위험 예보 확인 불가" 배너가 뜬다 — 빈 상태를 장애로 오인하는 실패 표현 규약 위반.
// hasStaleRisk 는 floodFilter 가 null(전체) 이거나 'risk' 일 때만 적용돼야 한다.
test('hasStaleRisk is scoped to the risk filter — a stale risk must not surface as unavailable under report/hotspot filters', () => {
  const source = read('InfoFloodMap.tsx');

  const decl = source.match(/const hasStaleRisk = useMemo\(([\s\S]*?)\),\s*\[([^\]]*)\],?\s*\);/);
  assert.ok(decl, 'hasStaleRisk useMemo declaration not found');
  const [, body, deps] = decl;

  assert.match(
    body,
    /floodFilter === null[\s\S]*?['"]risk['"]/,
    'hasStaleRisk no longer scopes to floodFilter === null || floodFilter === "risk" — regressed to checking the full risks array unconditionally',
  );
  assert.match(deps, /floodFilter/, 'hasStaleRisk deps must include floodFilter now that its result depends on it');
});
