"""StubPartnerAdapter — 외부 파트너 v1 stub (큐 적재, 수동 발급).

실제 외부 호출 없이 REQUESTED 상태로 보류.
운영자가 수동으로 voucher_code 입력 후 FULFILLED 처리.
"""
from __future__ import annotations

from app.adapters.partner import VoucherResult


class StubPartnerAdapter:
    def __init__(self, partner_code: str) -> None:
        self._partner_code = partner_code

    async def issue_voucher(
        self,
        *,
        catalog_item,
        user,
        idempotency_key: str,
    ) -> VoucherResult:
        # v1: 외부 호출 없이 pending 상태 반환
        return VoucherResult(
            success=True,
            voucher_code=None,
            external_response={
                "partner": self._partner_code,
                "status": "QUEUED",
                "idempotency_key": idempotency_key,
            },
        )


def get_adapter(integration_type: str, partner_code: str):
    """integration_type에 따라 적절한 어댑터 반환."""
    from app.adapters.internal import InternalAdapter
    if integration_type == "INTERNAL":
        return InternalAdapter()
    return StubPartnerAdapter(partner_code=partner_code)
