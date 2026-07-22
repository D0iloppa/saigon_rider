import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('full-page OAuth fallback exchanges a one-time code once under StrictMode', () => {
  const source = readFileSync(join(here, 'OAuthResult.tsx'), 'utf8');
  const guard = 'if (exchangeStartedRef.current) return;';
  const markStarted = 'exchangeStartedRef.current = true;';
  const exchange = 'await apiOAuthExchange(code);';

  assert.match(source, /const exchangeStartedRef = useRef\(false\)/);
  assert.ok(source.indexOf(guard) < source.indexOf(markStarted));
  assert.ok(source.indexOf(markStarted) < source.indexOf(exchange));
});
