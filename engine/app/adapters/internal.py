"""InternalAdapter — 즉시 발급 (뱃지, 프로필 프레임 등)."""
from __future__ import annotations

import uuid

from app.adapters.partner import VoucherResult


class InternalAdapter:
    async def issue_voucher(
        self,
        *,
        catalog_item,
        user,
        idempotency_key: str,
    ) -> VoucherResult:
        # 내부 아이템은 UUID를 바우처 코드로 즉시 발급
        voucher_code = f"INT-{uuid.uuid4().hex[:16].upper()}"
        return VoucherResult(
            success=True,
            voucher_code=voucher_code,
            external_response={"catalog_id": catalog_item.catalog_id, "issued_at": "now"},
        )
