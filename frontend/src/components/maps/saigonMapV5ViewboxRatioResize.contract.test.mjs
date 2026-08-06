import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// D-A(260806_svg_map_v6_rotation_design.md §2.3, §7 step 4): 루트 <svg preserveAspectRatio="none">
// 이므로 vb.h = vb.w × 컨테이너비율(ar) 불변식이 깨지면 회전이 전단(shear)으로 보인다. 카메라
// 함수(applyZoom/focusLatLng/fitToPoints/zoomInRef)는 호출 시점의 ar을 반영하지만, 호출 없이
// 컨테이너만 리사이즈되면(iOS는 orientation lock 미적용 — 세로+가로 모두 허용) vb가 낡은 비율로
// 남는다. 이 계약은 그 간극을 메우는 ResizeObserver 보정 경로가 존재함을 고정한다.
test('SaigonMapV5 recalculates vb.h = vb.w * ar on container resize (ResizeObserver)', () => {
  const source = read('SaigonMapV5.tsx');

  assert.match(
    source,
    /const ro = new ResizeObserver\(\(\) => \{/,
    'no ResizeObserver wired to recompute the vb aspect-ratio invariant on container resize',
  );

  // 보정 결과가 clampVB/setVBAttr/onViewportChange/setVbSnap 을 거쳐야 다른 카메라 경로와
  // 동일한 방식으로 반영된다(기존 패턴과 다른 새 갱신 경로를 만들지 않는다).
  assert.match(
    source,
    /vbRef\.current = clampVB\(\{ \.\.\.v, y: v\.y - \(expectedH - v\.h\) \/ 2, h: expectedH \}\);\s*setVBAttr\(\);\s*onViewportChange\(\);\s*setVbSnap\(\(n\) => n \+ 1\);/,
    'resize correction path must update vb through clampVB/setVBAttr/onViewportChange/setVbSnap',
  );

  assert.match(source, /ro\.observe\(el\);/, 'ResizeObserver is not observing the container element');
});
