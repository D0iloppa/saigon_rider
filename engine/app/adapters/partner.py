"""PartnerAdapter Protocol — 모든 보상 파트너 어댑터의 계약."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable


@dataclass
class VoucherResult:
    success: bool
    voucher_code: Optional[str] = None
    external_response: Optional[dict] = None
    error_message: Optional[str] = None


@runtime_checkable
class PartnerAdapter(Protocol):
    async def issue_voucher(
        self,
        *,
        catalog_item,
        user,
        idempotency_key: str,
    ) -> VoucherResult: ...
