import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const source = read('clusterPoints.ts');
/** 주석 제외 실행 코드 — "구 단위는 폐기됐다"는 설명이 폐기 검사에 걸리지 않게 한다. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// 대표 지적 2026-08-06: 주유소·정비소 지도의 줌아웃 그루핑이 어색하다.
// 원인은 클러스터링이 아니라 **구(district) 단위 집계 배지**였다는 것 —
//  1) 배지가 구 중심점에 찍혀 실제 지점 위치와 어긋나고,
//  2) 합계가 목록 건수와 안 맞고(8+5+5=18 vs 목록 39),
//  3) 기준 단위가 구(22개 레거시)라 지도 폴리곤·필터의 동(37개)과 격자가 다르다.
// 뷰포트 격자 클러스터링으로 교체했고, 이 파일이 그 성질을 고정한다.

test('클러스터 좌표는 구성원 무게중심이다 — 행정구역 중심점이 아니다', () => {
  assert.match(
    source,
    /lat: b\.lat \/ b\.count,\s*lng: b\.lng \/ b\.count/,
    '합산 좌표를 count 로 나눠 무게중심을 내야 한다',
  );
  assert.doesNotMatch(code, /district|findNearestDistrict/i, '행정구역 의존은 폐기됐다');
});

test('모든 지점이 정확히 한 버킷에 들어간다 — 합계가 목록 건수와 일치해야 한다', () => {
  // 조기 return(continue/skip)이 있으면 그 지점이 어느 클러스터에도 안 잡혀 합계가 깨진다.
  const loop = source.match(/for \(const p of points\) \{[\s\S]*?\n {2}\}/);
  assert.ok(loop, '지점 순회 루프가 있어야 한다');
  assert.doesNotMatch(
    loop[0],
    /\bcontinue\b|\breturn\b/,
    '순회 중 건너뛰는 분기가 있으면 합계가 목록 건수와 어긋난다(종전 결함의 핵심)',
  );
});

test('격자 원점은 절대좌표 — 팬(pan) 할 때마다 재편성되면 안 된다', () => {
  assert.match(
    source,
    /Math\.floor\(p\.lat \/ cellLat\)[\s\S]{0,80}Math\.floor\(p\.lng \/ cellLng\)/,
    '버킷 인덱스를 뷰포트 원점이 아니라 절대좌표로 계산해야 한다',
  );
  assert.doesNotMatch(
    source,
    /p\.lat - bbox\.[NS]|p\.lng - bbox\.[EW]/,
    '뷰포트 기준 오프셋으로 버킷을 나누면 팬 할 때마다 칸 경계가 움직여 깜빡인다',
  );
});

test('뷰포트를 모르면 묶지 않는다', () => {
  assert.match(
    source,
    /if \(!bbox\) return points\.map/,
    '임의 격자로 묶으면 클러스터 위치가 엉뚱해진다 — 각자 1건으로 둔다',
  );
});

test('주유소·정비소가 구 집계 대신 이 클러스터를 쓴다', () => {
  for (const p of ['../pages/info/InfoGasList.tsx', '../pages/info/InfoRepairList.tsx']) {
    const screen = read(p);
    assert.match(screen, /clusterByViewport\(/, `${p}: 클러스터 헬퍼를 써야 한다`);
    assert.match(screen, /districtBadges=\{clusters\}/, `${p}: 배지 소스가 클러스터여야 한다`);
    assert.doesNotMatch(screen, /findNearestDistrict/, `${p}: 구 단위 집계는 폐기됐다`);
    // 클러스터 탭 → 그 지점으로 확대(개별 dot 이 보이는 깊이까지).
    assert.match(screen, /onBadgeClick=\{\(b\) => zoomInRef\.current\?\.\(/, `${p}: 배지 탭 확대 배선`);
  }
});
