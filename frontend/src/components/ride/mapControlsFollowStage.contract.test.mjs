import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// W17 (2026-08-08) — 길찾기(RideNav)의 ◎ 버튼을 동네지도(SaigonMapV5)와 같은 3상태 순환 "정의"로
// 통일한다: 자유 → 카메라추종 → course-up추종 → 자유 (대표 확정, 재논의 금지). 회전 소스만 다르다
// (동네지도=자력계, 길찾기=경로 스냅 방위/GPS heading) — 코드 공유가 아니라 정의 통일이라 이 파일은
// SaigonMapV5 의 계약 테스트와 별개로 MapControls.tsx 를 직접 검사한다.

test('◎ button cycles free → camera → courseUp → free and never rotates its own icon', () => {
  const source = read('MapControls.tsx');

  assert.match(
    source,
    /type FollowStage = 'free' \| 'camera' \| 'courseUp';/,
    '3-state type must exist verbatim — free/camera/courseUp',
  );

  const cycleStart = source.indexOf('const recenterCurrentContext');
  const cycleEnd = source.indexOf('}, [stage, dotPos, mapRef]);', cycleStart);
  assert.ok(cycleStart >= 0 && cycleEnd > cycleStart, 'recenterCurrentContext (◎ tap handler) not found');
  const cycle = source.slice(cycleStart, cycleEnd);

  assert.match(cycle, /if \(stage === 'free'\)/, "free stage must be handled (transitions to 'camera')");
  assert.match(cycle, /else if \(stage === 'camera'\)/, "camera stage must be handled (transitions to 'courseUp')");
  assert.match(cycle, /setStageState\('camera'\)/, 'free → camera transition missing');
  assert.match(cycle, /setStageState\('courseUp'\)/, 'camera → courseUp transition missing');
  assert.match(cycle, /setStageState\('free'\)/, 'courseUp → free transition missing');

  const iconBlockStart = source.indexOf("{stage === 'courseUp'");
  const iconBlockEnd = source.indexOf('</span>', iconBlockStart);
  assert.ok(iconBlockStart >= 0 && iconBlockEnd > iconBlockStart, '◎ icon block not found');
  const iconBlock = source.slice(iconBlockStart, iconBlockEnd);
  assert.doesNotMatch(
    iconBlock,
    /rotate\(/,
    '◎ icon must not rotate — the 3 stages are distinguished by shape only (동네지도와 동일 정의, 대표 지시)',
  );
  assert.match(iconBlock, /<HeadingConeIcon/, 'courseUp stage must render the shared HeadingConeIcon');
  assert.match(iconBlock, /<LocateFixed/, 'camera stage must render LocateFixed (filled center = non-color cue)');
  assert.match(iconBlock, /<Locate size/, 'free stage must render Locate (hollow center)');
});

test('north-reset button is gated on bearing !== 0 and rotates by -bearing', () => {
  const source = read('MapControls.tsx');
  const start = source.indexOf('{bearing !== 0 && (');
  const end = source.indexOf('</button>', start);
  assert.ok(start >= 0 && end > start, 'bearing-gated compass button not found');
  const block = source.slice(start, end);
  assert.match(
    block,
    /<CompassRoseIcon size=\{22\} style=\{\{ transform: `rotate\(\$\{-bearing\}deg\)` \}\} \/>/,
    'north-reset button must render the shared CompassRoseIcon rotated by -bearing',
  );
});

test('north-reset downgrades courseUp → camera instead of leaving courseUp (would re-rotate on the next position tick)', () => {
  const source = read('MapControls.tsx');
  const start = source.indexOf('const resetNorth = useCallback');
  const end = source.indexOf('}, [stage, mapRef]);', start);
  assert.ok(start >= 0 && end > start, 'resetNorth handler not found');
  const block = source.slice(start, end);
  assert.match(block, /mapRef\.current\?\.resetNorth\(\)/, 'must call MapCanvasHandle.resetNorth()');
  assert.match(
    block,
    /if \(stage === 'courseUp'\) setStageState\('camera'\)/,
    "must downgrade 'courseUp' to 'camera' — otherwise the follow-tick effect keeps passing courseBearingDeg and the very next GPS tick undoes the north reset (③ 확인 사항: MapCanvas.follow() 는 courseBearing!=null 이면 항상 회전을 적용하므로, 이 단계전환이 없으면 결함이 재발한다)",
  );
});

test('a user gesture (pan/zoom/rotate) drops straight to free from either camera or courseUp, keeping whatever bearing MapLibre already has', () => {
  const source = read('MapControls.tsx');
  assert.match(
    source,
    /notifyGesture: \(\) => setStageState\('free'\)/,
    "gesture notification must set stage to 'free' unconditionally — this covers both 카메라추종 해제 and course-up추종 해제(각도는 유지, MapCanvas 가 bearing 을 되돌리지 않으므로 여기서 손대지 않는다)",
  );
});

test('the follow-tick effect only passes courseBearingDeg while stage is courseUp, and does nothing while free', () => {
  const source = read('MapControls.tsx');
  const start = source.indexOf('useEffect(() => {\n    if (stage === \'free\'');
  const end = source.indexOf('}, [dotPos?.lat, dotPos?.lng, stage]);', start);
  assert.ok(start >= 0 && end > start, 'follow-tick effect not found');
  const block = source.slice(start, end);
  assert.match(block, /if \(stage === 'free' \|\| !dotPos\) return;/, "must no-op while stage is 'free'");
  assert.match(
    block,
    /mapRef\.current\?\.follow\(dotPos, stage === 'courseUp' \? courseBearingDeg \?\? null : null\)/,
    "must pass courseBearingDeg only when stage === 'courseUp', null otherwise (camera stage follows without rotating)",
  );
});
