export function bizContractAction(ad) {
  return ad.reviewStatus === 'APPROVED' && ad.subscriptionStatus === 'pending_payment'
    ? 'contract'
    : 'detail';
}

export async function runBizContractAction(ad, actions) {
  if (bizContractAction(ad) === 'contract') {
    await actions.openContract(ad.id);
    return;
  }
  actions.openDetail(ad.id);
}

export function bizContractErrorKey(error) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Ad is not approved yet')) return 'biz.contractLinkNotApproved';
  if (message.includes('A contract is already in progress for this ad')) return 'biz.contractAlreadyInProgress';
  return 'biz.contractLinkError';
}
