import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(mkdtempSync(join(tmpdir(), 'request-policy-')), 'requestPolicy.mjs');
execFileSync(join(here, '../../node_modules/.bin/esbuild'), [
  join(here, 'requestPolicy.ts'),
  '--format=esm',
  '--platform=node',
  `--outfile=${output}`,
]);
const { TimeoutError, createAttemptSignal, retryCount } = await import(pathToFileURL(output).href);

test('only GET and HEAD are retried, with a bounded count', () => {
  assert.equal(retryCount('GET'), 1);
  assert.equal(retryCount('HEAD', 9), 2);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(retryCount(method, 9), 0);
  }
});

test('external abort remains AbortError', async () => {
  const external = new AbortController();
  const attempt = createAttemptSignal(external.signal, 1000);
  external.abort();
  assert.equal(attempt.signal.reason.name, 'AbortError');
  assert.equal(attempt.didTimeout(), false);
  attempt.cleanup();
});

test('internal deadline is distinguishable as TimeoutError', async () => {
  const attempt = createAttemptSignal(undefined, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(attempt.signal.reason instanceof TimeoutError);
  assert.equal(attempt.didTimeout(), true);
  attempt.cleanup();
});
