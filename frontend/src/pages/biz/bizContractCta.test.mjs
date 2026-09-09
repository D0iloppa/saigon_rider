import assert from 'node:assert/strict';
import test from 'node:test';
import { bizContractAction, runBizContractAction } from './bizContractCta.js';

const ad = (reviewStatus, subscriptionStatus) => ({ id: 'ad-1', reviewStatus, subscriptionStatus });

test('PENDING + pending_payment click opens details without requesting a contract link', async () => {
  const calls = [];
  await runBizContractAction(ad('PENDING', 'pending_payment'), {
    openContract: async () => calls.push('contract'),
    openDetail: () => calls.push('detail'),
  });
  assert.deepEqual(calls, ['detail']);
});

test('REJECTED + pending_payment click opens details without requesting a contract link', async () => {
  const calls = [];
  await runBizContractAction(ad('REJECTED', 'pending_payment'), {
    openContract: async () => calls.push('contract'),
    openDetail: () => calls.push('detail'),
  });
  assert.deepEqual(calls, ['detail']);
});

test('only APPROVED + pending_payment click requests the contract link', async () => {
  const calls = [];
  const approved = ad('APPROVED', 'pending_payment');
  assert.equal(bizContractAction(approved), 'contract');
  await runBizContractAction(approved, {
    openContract: async () => calls.push('contract'),
    openDetail: () => calls.push('detail'),
  });
  assert.deepEqual(calls, ['contract']);
});
