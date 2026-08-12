import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'adPlacement.ts'), 'utf8');

test('launch build disables all ad slots', () => {
  assert.match(source, /export const ADS_ENABLED = false;/);
  assert.match(
    source,
    /export function adAtIndex[\s\S]*?if \(!ADS_ENABLED \|\| ads\.length === 0 \|\| i % AD_EVERY !== 0\) return null;/,
  );
});
