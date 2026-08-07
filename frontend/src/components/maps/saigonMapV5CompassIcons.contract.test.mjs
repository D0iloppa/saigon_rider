import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// W15 (2026-08-07) 나침반 UI 시각 개편. 대표가 실기기 스크린샷으로 지적한 결함:
// 북향복귀 버튼과 ◎ 의 heading 상태가 **둘 다** `<Navigation rotate(-bearing)>` 이라 주황 버튼
// 두 개가 같은 모양으로 나란히 떠 버그처럼 보였다. 이 파일은 "두 버튼의 형태가 다르다"와
// "◎ 는 회전하지 않고 형태로만 3상태를 구분한다"를 소스 수준에서 못박아 재발을 막는다.
// (이 저장소는 근거 없이 상수/구현을 되돌리는 사고가 반복됐으므로, 되돌리려면 여기 사유를 고칠 것.)

const locateCtrlBlock = (source) => {
  const start = source.indexOf('const followStage:');
  const end = source.indexOf('</div>', start);
  assert.ok(start >= 0 && end > start, 'locate control JSX block not found');
  return source.slice(start, end);
};

test('◎ button distinguishes its 3 stages by icon shape and never rotates the icon', () => {
  const source = read('SaigonMapV5.tsx');
  const block = locateCtrlBlock(source);

  // 나침반 버튼(bearing !== 0 게이트) 부분을 잘라내고 ◎ 버튼만 남긴다 — 회전은 나침반 버튼에만
  // 허용된다.
  const compassBtnStart = block.indexOf('{bearing !== 0 && (');
  const compassBtnEnd = block.indexOf(')}', block.indexOf('</button>', compassBtnStart));
  assert.ok(compassBtnStart >= 0 && compassBtnEnd > compassBtnStart, 'compass (north-reset) button not found inside the locate control');
  const locateBtnBlock = block.slice(compassBtnEnd);

  assert.doesNotMatch(
    locateBtnBlock,
    /rotate\(/,
    '◎ button must not rotate its icon — the 3 stages are distinguished by shape, not by rotation (대표 지시: "나침반이 따라움직이는게 아니라 아이콘순환")',
  );
  assert.match(locateBtnBlock, /followStage === 'heading'\s*\?\s*<HeadingConeIcon/, 'heading stage must use the cone icon');
  assert.match(locateBtnBlock, /followStage === 'camera'\s*\?\s*<LocateFixed/, 'camera-follow stage must use LocateFixed (filled center dot = non-color cue)');
  assert.match(locateBtnBlock, /:\s*<Locate size/, 'free stage must use Locate (hollow center) — the shape difference vs LocateFixed is the non-color cue for the active stage');
});

test('north-reset button uses the compass rose icon, keeps rotate(-bearing), and drops the orange active shell', () => {
  const source = read('SaigonMapV5.tsx');
  const block = locateCtrlBlock(source);
  const start = block.indexOf('{bearing !== 0 && (');
  const end = block.indexOf('</button>', start);
  const compassBtn = block.slice(start, end);

  assert.match(compassBtn, /className=\{styles\.ctrlBtn\}/, 'north-reset button must use the plain .ctrlBtn shell — the orange ctrlBtnActive made two identical-looking orange buttons and killed the red north needle contrast');
  assert.doesNotMatch(compassBtn, /ctrlBtnActive/, 'north-reset button must not use ctrlBtnActive (see above)');
  assert.match(
    compassBtn,
    /<CompassRoseIcon size=\{20\} style=\{\{ transform: `rotate\(\$\{-bearing\}deg\)` \}\} \/>/,
    'north-reset button must render the compass rose rotated by -bearing (its information value is "where is north")',
  );
});

test('CompassRoseIcon draws an N glyph as strokes and a red north needle', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('function CompassRoseIcon(');
  const end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, 'CompassRoseIcon not found');
  const icon = source.slice(start, end);

  // N 은 <text> 가 아니라 스트로크 path 여야 한다 — 16~20px 통에서 폰트 힌팅으로 뭉개지는 것을 막고
  // 높이·굵기를 viewBox 단위로 보장한다.
  assert.doesNotMatch(icon, /<text/, 'the N must be a stroked path, not <text> (font hinting mushes it at 20px)');
  assert.match(icon, /d="M9\.3 6\.3V0\.9l5\.4 5\.4V0\.9" stroke="currentColor" strokeWidth=\{2\} \/>/, 'N glyph path missing/changed — and it must keep the default (angular) stroke caps: round caps on a 5.4-unit glyph at width 2.0 rendered as a zigzag blob in the 1× screenshot comparison');
  assert.match(icon, /fill="#e5342b"/, 'north needle must be red (레퍼런스: 네이버지도)');
  assert.match(icon, /fill="#9ca3af"/, 'south needle must be achromatic for contrast against the red north needle');
});

test('me-dot renders a heading triangle at (compassBearing - bearing), hidden until the first heading value arrives', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('{meLatLng && (() => {');
  const end = source.indexOf('</svg>', start);
  assert.ok(start >= 0 && end > start, 'me-dot render block not found');
  const block = source.slice(start, end);

  assert.match(block, /\{headingKnown && \(\s*<polygon/, 'heading triangle must be gated on headingKnown — drawing the default 0° before any value claims north for an unknown direction and snaps when the first value lands');
  assert.match(
    block,
    /transform=\{`rotate\(\$\{compassBearing - bearing\} \$\{mx\} \$\{my\}\)`\}/,
    'heading triangle angle must be (heading - bearing): north→heading, manual→heading-manual, follow→0 (always screen-up, matching the reference)',
  );
  // 링(r*2) 바깥에 있어야 한다 — 꼭짓점 r*3.35, 밑변 r*2.0.
  assert.match(block, /my - r \* 3\.35/, 'triangle apex must sit outside the meRing (r*2)');
});

test('magnetometer heading is subscribed while the me-dot is visible (not only during heading-follow), and unsubscribed on teardown', () => {
  const source = read('SaigonMapV5.tsx');
  const start = source.indexOf('const unwatch = native.watchCompassHeading(');
  assert.ok(start >= 0, 'native.watchCompassHeading subscription not found');
  const effectStart = source.lastIndexOf('useEffect(() => {', start);
  const effectEnd = source.indexOf('}, [meDotActive]);', start);
  assert.ok(
    effectEnd > start,
    'the magnetometer effect must depend on [meDotActive] — the me-dot heading triangle must point somewhere regardless of the follow stage (대표 결정 2026-08-07). Killswitch is unaffected: with enableFollowCompass=false, compassMode never leaves north so the bearing formula never reads compassBearing.',
  );
  const effect = source.slice(effectStart, effectEnd);
  assert.match(effect, /if \(!meDotActive\) return;/, 'the effect must still no-op on screens that do not show the me-dot (location picker etc.) — the gate moved, it did not disappear');
  assert.match(effect, /compassAvailableRef\.current = false;/, 'compassAvailableRef must be reset per subscription (it means "has this subscription produced a value") so the GPS-course fallback stays correct');
  assert.match(effect, /return \(\) => \{[\s\S]*unwatch\(\);/, 'the subscription must be released on teardown/unmount');
  assert.match(effect, /setHeadingKnown\(true\);/, 'receiving a heading value must flip headingKnown even when the 8° deadzone skips setCompassBearing');
});
