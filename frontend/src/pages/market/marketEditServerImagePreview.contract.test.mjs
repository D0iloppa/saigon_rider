import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// 리뷰 지적 5(nit): 기존 사진(서버/imgproxy URL)까지 <img> 로 직접 렌더하면 CLAUDE.md 의 "동적
// 이미지는 <AppImage> 로 래핑" 규약을 벗어난다. 로컬 blob 미리보기(MarketCreate.tsx 선례)는
// <img> 유지가 맞지만, MarketEdit 은 서버에서 불러온 기존 사진에도 같은 <img> 를 쓴다 — 로컬
// blob 과 서버 URL 을 구분해 서버 URL 쪽만 AppImage 로 렌더해야 한다.
test('MarketEdit renders existing server-loaded photos with AppImage, keeping local blob previews as <img>', () => {
  const source = read('MarketEdit.tsx');

  assert.match(source, /import\s*\{\s*AppImage\s*\}\s*from\s*'@\/components\/ui\/AppImage'/, 'MarketEdit must import AppImage to render server-loaded previews');
  assert.match(source, /<AppImage[^>]*src=\{img\.preview\}/, 'MarketEdit must render server-loaded image previews via <AppImage>, not a raw <img>');
});
