import { USE_MOCK, api } from './client';

export interface WalletBalance {
  gold_balance: number;
  xp_balance: number;
}

const MOCK_WALLET: WalletBalance = { gold_balance: 1820, xp_balance: 240 };

export async function fetchWallet(): Promise<WalletBalance> {
  if (USE_MOCK) return api.delay(MOCK_WALLET, 150);
  return api.realFetch<WalletBalance>('/wallet/me');
}
