import type { BusinessAd } from '@/api/biz';

export type BizContractAction = 'contract' | 'detail';

export function bizContractAction(ad: BusinessAd): BizContractAction;
export function runBizContractAction(
  ad: BusinessAd,
  actions: { openContract: (id: string) => void | Promise<void>; openDetail: (id: string) => void },
): Promise<void>;
export function bizContractErrorKey(error: unknown):
  | 'biz.contractLinkNotApproved'
  | 'biz.contractAlreadyInProgress'
  | 'biz.contractLinkError';
