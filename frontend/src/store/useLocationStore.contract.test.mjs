import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'useLocationStore.ts'), 'utf8');
/** 주석을 걷어낸 실행 코드 — "폐기됐다"는 설명이 폐기 검사에 걸리지 않게 한다. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// 대표 지시 2026-08-06 ("기본을 다 GPS로 / 안잡히면 전체지역으로 / 2개로만해") 를 코드 계약으로
// 고정한다. 설계도: ai-docs/260806_gps_scope_unification_design.md
//
// 회귀 배경: 종전에는 위치 SoT 가 3벌(홈 FALLBACK / 마켓 독자 localStorage / useLocationStore)로
// 갈려 있었고, 측위 실패 시 좌표를 BEN_THANH_FALLBACK 으로 채웠다. 그래서 GPS 가 Thạnh Mỹ Tây
// 를 잡아도 목록·지도·정보 화면은 전부 Bến Thành 을 보여줬다(대표 캡처 2026-08-06).

test('mode 는 gps|all 2개뿐 — region 모드는 폐기됐다', () => {
  assert.match(
    source,
    /export type LocationMode = 'gps' \| 'all'/,
    "LocationMode must be exactly 'gps' | 'all' (대표 지시 '2개로만해')",
  );
  assert.doesNotMatch(
    code,
    /'region'/,
    "'region' mode must be gone — 화면별 기준 분기의 원인이었다",
  );
  assert.doesNotMatch(
    code,
    /selectRegion|useSelectedRegion|SelectedRegion/,
    'region 선택 API(selectRegion/useSelectedRegion)는 제거돼야 한다',
  );
});

test('기본 모드는 gps 다', () => {
  assert.match(
    source,
    /mode: 'gps',/,
    "초기 상태의 mode 는 'gps' 여야 한다 (대표 지시 '기본을 다 gps로')",
  );
});

test('반경 상수는 3km 이고 export 된다', () => {
  assert.match(
    source,
    /export const NEARBY_RADIUS_KM = 3\b/,
    'NEARBY_RADIUS_KM 은 3 (대표 확정 2026-08-06) 이며 화면들이 공유하도록 export 돼야 한다',
  );
});

test('coords 는 persist 되지 않는다 — 어제 좌표로 오늘의 근처를 계산하면 안 된다', () => {
  const partialize = source.match(/partialize: \(state\) => \(\{[\s\S]*?\}\)/);
  assert.ok(partialize, 'persist partialize 블록이 있어야 한다');
  assert.doesNotMatch(
    partialize[0],
    /coords|wardName/,
    'coords/wardName 은 partialize 에 들어가면 안 된다 (세션마다 재측위)',
  );
  assert.match(partialize[0], /mode: state\.mode/, 'mode 는 persist 돼야 한다');
});

test('persist version 4 로 올리고 구버전 값은 통째로 버린다', () => {
  assert.match(
    source,
    /version: 4/,
    "v3(mode:'all'|'region') 값이 살아남으면 첫 진입이 깨진다 — version 을 4로 올려야 한다",
  );
  assert.match(
    source,
    /migrate: \(\) => \(\{[\s\S]*?mode: 'gps'/,
    "migrate 는 구버전 상태를 버리고 mode:'gps' 로 초기화해야 한다",
  );
});

test('권역밖은 중심가 폴백 + 토스트 — 측위 실패와 다른 사건이다', () => {
  // 대표 확인 2026-08-06: "권역밖은 기존에는 HCMC를 벗어났다고 토스트 주고 대표지역 폴백이었어."
  // 어디 있는지 알지만 서비스 범위 밖일 뿐이므로, 전체 지역으로 떨어뜨리지 않고 중심가로 안내한다.
  const outside = code.match(
    /if \(!inServiceArea\(pos\.lat, pos\.lng\)\) \{[\s\S]*?return;\s*\}/,
  );
  assert.ok(outside, '권역밖 분기가 있어야 한다');
  assert.match(outside[0], /mode: 'gps'/, "권역밖도 mode 는 'gps' — 반경 필터가 그대로 걸려 목록이 비지 않는다");
  assert.match(outside[0], /BEN_THANH_FALLBACK/, '기준 좌표는 중심가(Bến Thành)로 대체한다');
  assert.match(outside[0], /coordsSource: 'fallback'/, '출처를 fallback 으로 표시해야 화면이 라벨을 정직하게 쓴다');
  assert.match(outside[0], /notifyFallback\(\s*'map\.outsideArea'/, '권역밖임을 토스트로 알려야 한다');
});

test('측위 실패는 all 폴백 — 중심가로 보내지 않는다', () => {
  const failure = code.match(/\.catch\(\(err: unknown\) => \{[\s\S]*?\}\)/);
  assert.ok(failure, 'catch 분기가 있어야 한다');
  assert.match(
    failure[0],
    /set\(\{ mode: 'all', coords: null, wardName: null, coordsSource: null \}\)/,
    '어디 있는지 모르는 상태에서 중심가로 보내면 "왜 여기냐"는 근거가 없다 — all 로 간다',
  );
  assert.doesNotMatch(
    failure[0],
    /BEN_THANH_FALLBACK/,
    '측위 실패에까지 Bến Thành 을 채우면 모든 화면이 조용히 Bến Thành 으로 수렴한다 (2026-08-06 회귀 원인)',
  );
});

test('권역밖과 측위실패가 같은 화면이 되면 안 된다 (V8b)', () => {
  // 두 경로의 결과 mode 가 갈리는지 — 하나라도 같아지면 사용자가 원인을 구분할 수 없다.
  const outside = code.match(/if \(!inServiceArea\(pos\.lat, pos\.lng\)\) \{[\s\S]*?return;\s*\}/);
  const failure = code.match(/\.catch\(\(err: unknown\) => \{[\s\S]*?\}\)/);
  assert.ok(outside && failure);
  assert.ok(
    outside[0].includes("mode: 'gps'") && failure[0].includes("mode: 'all'"),
    "권역밖은 'gps'(중심가 기준), 측위실패는 'all'(전체) 로 서로 달라야 한다",
  );
});

test('폴백 토스트는 세션당 1회 — 화면 5개가 각자 띄우면 안 된다', () => {
  assert.match(source, /let fallbackToastShown = false/, '세션 플래그가 있어야 한다');
  assert.match(
    source,
    /function notifyFallback[\s\S]*?if \(fallbackToastShown\) return;[\s\S]*?fallbackToastShown = true;/,
    'notifyFallback 은 첫 호출에서만 토스트를 띄워야 한다',
  );
});

test('권한거부(1)·타임아웃(3)·측정불가를 구분해 안내한다', () => {
  for (const [code, key] of [
    ['1', 'map.listFirst.nearMeDenied'],
    ['3', 'map.listFirst.nearMeTimeout'],
  ]) {
    assert.ok(
      source.includes(`code === ${code}`) && source.includes(key),
      `code ${code} 는 ${key} 로 안내해야 한다`,
    );
  }
  assert.match(source, /map\.listFirst\.nearMeUnavailable/, '그 외 실패는 nearMeUnavailable');
  assert.match(
    source,
    /code === 1\)[\s\S]{0,120}permissionIntent: 'declined'/,
    '권한 거부는 declined 로 기록해 재요청하지 않아야 한다',
  );
});

test('측위는 세션당 1회 — 동시 호출은 같은 Promise 를 공유한다', () => {
  assert.match(source, /let inflight: Promise<void> \| null = null/, 'in-flight 공유 변수가 있어야 한다');
  assert.match(source, /if \(inflight\) return inflight;/, '진행 중이면 같은 Promise 를 반환해야 한다');
  assert.match(
    source,
    /if \(state\.mode === 'gps' && state\.coords\) return Promise\.resolve\(\);/,
    '이미 좌표가 있으면 재측위하지 않아야 한다',
  );
});

test('권한 프리프롬프트는 미결정(prompt) 상태에서만 뜬다', () => {
  // 설계도 §5 — 표시범위 기본값이 GPS 가 되면서 진입만으로 시스템 권한창이 뜬다. 맥락 없이
  // 뜨는 창은 반사적 거부를 부르고, 한 번 거부되면 앱에서 되돌릴 수 없다.
  assert.match(code, /function preflightPermission\(\): Promise<boolean>/, '프리프롬프트 함수가 있어야 한다');
  assert.match(
    code,
    /native\s*\.checkLocationPermission\(\)/,
    '현재 권한 상태를 먼저 확인해야 한다 — 이미 결정된 사용자에게 다시 묻지 않는다',
  );
  assert.match(
    code,
    /if \(status !== 'prompt'\) return true;/,
    "허용/거부가 이미 결정된 상태('prompt' 가 아님)면 묻지 않고 그대로 진행해야 한다",
  );
  assert.match(code, /useConfirmStore\.getState\(\)\.open\(/, '기존 전역 ConfirmDialog 를 재사용한다');
});

test('프리프롬프트 "나중에"는 시스템 권한창을 띄우지 않고 all 로 확정한다', () => {
  const branch = code.match(/if \(!allowed\) \{[\s\S]*?return null;\s*\}/);
  assert.ok(branch, '거절 분기가 있어야 한다');
  assert.match(branch[0], /mode: 'all'/, '전체 지역으로 간다');
  assert.match(
    branch[0],
    /permissionIntent: 'declined'/,
    "'나중에'는 declined 로 기록해 다음 세션에 다시 묻지 않아야 한다",
  );
  assert.doesNotMatch(
    branch[0],
    /ensureLocationPermission/,
    '거절했는데 시스템 권한창을 띄우면 프리프롬프트의 의미가 없다',
  );
});

test('프리프롬프트를 취소(백드롭/ESC)해도 매달리지 않는다', () => {
  assert.match(
    code,
    /useConfirmStore\.subscribe\(\(s\) => \{[\s\S]*?if \(!s\.isOpen\) \{ unsub\(\); resolve\(false\); \}/,
    '다이얼로그가 닫히면 "나중에"로 확정해야 한다 — 아니면 ensureLocation 이 영원히 pending 이다',
  );
});

test('프리프롬프트 문구는 3개 언어에 모두 있다', async () => {
  const { readFileSync } = await import('node:fs');
  for (const lang of ['ko', 'en', 'vi']) {
    const dict = JSON.parse(readFileSync(join(here, `../locales/${lang}/translation.json`), 'utf8'));
    for (const key of ['permissionRationale', 'permissionAllow', 'permissionLater']) {
      assert.ok(
        typeof dict.map?.[key] === 'string' && dict.map[key].trim().length > 0,
        `${lang}: map.${key} 가 비어 있으면 안 된다`,
      );
    }
  }
});

test('wardName 은 라벨 전용임이 명시돼 있다', () => {
  assert.match(
    source,
    /표시 라벨 전용[\s\S]{0,80}필터 판정에는 절대 쓰지 않는다/,
    'wardName 을 필터 판정에 쓰면 폴리곤 미커버 지역(Thủ Đức 등)에서 결과가 비게 된다',
  );
});
