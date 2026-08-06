import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// D-F(260806_svg_map_v6_rotation_design.md §6/§7 step 2): focusLatLng 의 `selectRegion: false` 는
// 과거 onRegionSelect 콜백만 건너뛰고 setSelWard/loadWardData 는 무조건 실행했다. follow(카메라
// 추종)가 GPS 틱마다 focusLatLng 를 부르는 경로가 생기기 전에, 동 경계를 넘을 때마다 ward 데이터
// fetch 가 발화하는 걸 막기 위해 선행 수정한다. `selectRegion: false` 면 setSelWard/loadWardData
// 도 함께 건너뛰어야 한다 — 즉 idx>=0 분기가 하나뿐이고 selectRegion !== false 일 때만 타야 한다.
test('SaigonMapV5 focusLatLng skips setSelWard/loadWardData too when selectRegion:false', () => {
  const source = read('SaigonMapV5.tsx');

  // idx>=0 이면서 selectRegion:false 인 경우를 위한 별도 setSelWard/loadWardData 분기가
  // 더 이상 존재하지 않는다 — idx>=0 갈래는 selectRegion !== false 조건 하나뿐이어야 한다.
  assert.doesNotMatch(
    source,
    /\} else if \(idx >= 0\) \{\s*setSelWard\(idx\);/,
    'a second idx>=0 branch still unconditionally calls setSelWard/loadWardData regardless of selectRegion:false',
  );

  // 유일한 setSelWard 호출 분기는 selectRegion !== false 조건과 함께 있어야 한다.
  assert.match(
    source,
    /if \(idx >= 0 && opts\?\.selectRegion !== false\) \{\s*setSelWard\(idx\);\s*const slug = depth1\.wards\[idx\]\.slug as string \| undefined;\s*if \(slug\) void loadWardData\(slug, false\);\s*const region = buildWardRegion\(idx\);\s*if \(region\) onRegionSelect\?\.\(region\);\s*\} else if \(idx < 0 && !opts\?\.silent\) \{/,
    'focusLatLng idx>=0 branch no longer gates setSelWard/loadWardData/onRegionSelect together on selectRegion !== false',
  );

  // idx<0(위치 못 찾음) 안내 토스트는 그대로 유지 — idx<0 조건이 명시적으로 남아있어야 한다
  // (그렇지 않으면 idx>=0 && selectRegion:false 케이스에서 엉뚱하게 "위치를 찾을 수 없어요" 토스트가 뜬다).
  assert.match(
    source,
    /else if \(idx < 0 && !opts\?\.silent\) \{\s*toast\.neutral\(t\('map\.locateNotFound'/,
    'idx<0 locateNotFound toast branch regressed — must still fire only when no ward matched',
  );

  // 카메라 중심 이동(vbRef/setVBAttr/onViewportChange/setVbSnap)은 selectRegion 값과 무관하게
  // 항상 실행돼야 한다 — 이 수정은 지역 선택 상태만 바꾸고 카메라 동작은 바꾸지 않는다.
  // 그 호출들이 setSelWard 분기보다 앞서(무조건) 나온다는 순서를 고정한다.
  assert.match(
    source,
    /setVBAttr\(\);\s*onViewportChange\(opts\?\.suppressBbox\);\s*setVbSnap\(\(n\) => n \+ 1\);\s*\s*if \(idx >= 0 && opts\?\.selectRegion !== false\) \{/,
    'camera-center calls (setVBAttr/onViewportChange/setVbSnap) must run unconditionally before the selectRegion branch',
  );
});
