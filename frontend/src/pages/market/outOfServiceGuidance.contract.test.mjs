import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 출시감사 S-3: 서비스 경계(14.4x14.5km, 37개 동) 밖 사용자는 매물 등록/약속 위치
// 지정이 막힌다. "왜 막히는지" 를 알려야 하고(경계 안내), 위치 미확정(권한 미허용·GPS
// 미해상) 상태에서는 절대 경고가 뜨면 안 된다(ADR: GPS 를 첫 화면에 요구하지 않는다).
//
// 정적 소스 검사로 두 계약을 고정한다:
//  1) 경계 밖일 때 안내(outOfServiceDetail)가 렌더된다 — outOfArea 조건부 분기 존재.
//  2) outOfArea 자체가 `!!picked && ...` 로 위치 확정 전에는 항상 false 다
//     (판정 불가 상태에서 과잉 차단 없음).
for (const [label, relPath] of [
  ['LocationPickerSheet', 'LocationPickerSheet.tsx'],
  ['MarkerLocationPicker', '../../components/maps/MarkerLocationPicker.tsx'],
]) {
  test(`${label}: renders out-of-service-area guidance only after a location is picked`, () => {
    const source = read(relPath);

    assert.match(
      source,
      /const outOfArea = !!picked && !inServiceArea\(picked\.lat, picked\.lng\)/,
      `${label} must derive outOfArea from picked so it stays false while location is still unresolved (no premature warning)`,
    );

    assert.match(
      source,
      /outOfArea[\s\S]{0,80}t\('market\.outOfServiceDetail'/,
      `${label} must show the boundary-explanation copy (market.outOfServiceDetail) when outOfArea is true`,
    );
  });
}

test('outOfServiceDetail / outOfService / outsideArea are localized in ko/en/vi (not placeholder-only)', () => {
  for (const lang of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${lang}/translation.json`));

    assert.ok(
      typeof json.market?.outOfServiceDetail === 'string' && json.market.outOfServiceDetail.length > 0,
      `${lang}: market.outOfServiceDetail must be a real localized string`,
    );
    assert.ok(
      typeof json.market?.outOfService === 'string' && json.market.outOfService.length > 0,
      `${lang}: market.outOfService must be a real localized string`,
    );
    // 경계(37개 동) 설명은 **시트 문구(outOfServiceDetail)** 가 맡는다 — 위에서 이미 검증했다.
    // 토스트(outsideArea)는 짧아야 한다: 길면 어절 중간에서 줄바꿈된다(대표 지적 2026-08-06).
    // 종전 계약은 토스트에도 "37" 을 요구해 문구가 두 줄로 깨졌다.
    assert.ok(
      typeof json.map?.outsideArea === 'string' && json.map.outsideArea.length > 0,
      `${lang}: map.outsideArea must be a real localized string`,
    );
    assert.ok(
      json.map.outsideArea.length <= 60 && !/37/.test(json.map.outsideArea),
      `${lang}: map.outsideArea must stay a short one-liner (no ward-count jargon) — got ${json.map.outsideArea.length} chars`,
    );
    assert.ok(
      /37/.test(json.market.outOfServiceDetail),
      `${lang}: the 37-ward boundary explanation belongs in market.outOfServiceDetail`,
    );
  }
});
