import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import esbuild from '../../node_modules/esbuild/lib/main.js';

const here = dirname(fileURLToPath(import.meta.url));

// appVersion.ts also imports `./client` (api fetch wrapper) and `@/lib/native`
// (Capacitor bridge) for its network-calling exports (fetchAppConfig,
// fetchCurrentVersion). Those aren't exercised here — this test targets only
// the pure fail-open decision logic (shouldForceUpdate/compareVersions) — so
// both are stubbed out via an esbuild plugin to avoid pulling in Vite's
// `import.meta.env` (which explodes under plain node).
const stubPlugin = {
  name: 'stub-app-deps',
  setup(build) {
    build.onResolve({ filter: /^\.\/client$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
    build.onResolve({ filter: /^@\/lib\/native$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const api = {}; export const native = {};',
      loader: 'js',
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [join(here, 'appVersion.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  plugins: [stubPlugin],
});
const outDir = mkdtempSync(join(tmpdir(), 'app-version-'));
const outFile = join(outDir, 'appVersion.mjs');
writeFileSync(outFile, result.outputFiles[0].text);
const { shouldForceUpdate } = await import(pathToFileURL(outFile).href);

const forceInfo = { id: 1, version: '2.0.0', platform: 'android', buildNumber: null, releaseNote: null, isForceUpdate: true, isActive: true, releasedAt: null };

test('F-19 fail-open: unresolved installed version ("unknown") never blocks, even when server demands force update', () => {
  assert.equal(shouldForceUpdate('unknown', forceInfo), false);
});

test('F-19 fail-open: no matching platform release info never blocks', () => {
  assert.equal(shouldForceUpdate('1.0.0', null), false);
});

test('F-19 fail-open: server release not flagged force-update never blocks', () => {
  const nonForce = { ...forceInfo, isForceUpdate: false };
  assert.equal(shouldForceUpdate('1.0.0', nonForce), false);
});

test('F-19 fail-open: unparsable installed version string never blocks', () => {
  assert.equal(shouldForceUpdate('not-a-version', forceInfo), false);
});

test('F-19 positive case still fires when everything is resolvable and stale', () => {
  assert.equal(shouldForceUpdate('1.0.0', forceInfo), true);
});

test('F-19 positive case does not fire when installed version already meets the floor', () => {
  assert.equal(shouldForceUpdate('2.0.0', forceInfo), false);
});
