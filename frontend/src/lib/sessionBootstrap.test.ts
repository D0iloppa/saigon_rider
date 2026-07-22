import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapSession, leaveBootstrapForLogin } from './sessionBootstrap';

const session = { userId: 'user-1', sessionToken: 'token-1' };

function deps(verify: () => Promise<{ id: string }>) {
  const calls: string[] = [];
  return {
    calls,
    value: {
      session,
      verify,
      login: () => { calls.push('login'); },
      clear: () => { calls.push('clear'); },
      logout: () => { calls.push('logout'); },
      isExpired: (error: unknown) => error === 'expired',
      isRestricted: (error: unknown) => error === 'restricted',
    },
  };
}

test('retry succeeds without discarding the saved session', async () => {
  const failed = deps(async () => { throw new Error('offline'); });
  assert.equal(await bootstrapSession(failed.value), 'retryable-error');
  assert.deepEqual(failed.calls, []);

  const retried = deps(async () => ({ id: 'user-1' }));
  assert.equal(await bootstrapSession(retried.value), 'ready');
  assert.deepEqual(retried.calls, ['login']);
});

test('expired session moves to logged-out boot', async () => {
  const expired = deps(async () => { throw 'expired'; });
  assert.equal(await bootstrapSession(expired.value), 'ready');
  assert.deepEqual(expired.calls, ['clear', 'logout']);
});

test('missing session boots normally without a request', async () => {
  let verified = false;
  const missing = deps(async () => { verified = true; return { id: 'user-1' }; });
  assert.equal(await bootstrapSession({ ...missing.value, session: null }), 'ready');
  assert.equal(verified, false);
});

test('login action clears the unusable session before navigation', () => {
  const calls: string[] = [];
  leaveBootstrapForLogin(
    () => calls.push('clear'),
    () => calls.push('logout'),
    () => calls.push('navigate:/auth/oauth'),
  );
  assert.deepEqual(calls, ['clear', 'logout', 'navigate:/auth/oauth']);
});
