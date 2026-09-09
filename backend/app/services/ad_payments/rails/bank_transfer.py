"""bank_transfer 레일 — 결제 개시가 없는 어댑터의 null-object 표현 (design §3-2/§3-3).

기존 seam-A(계좌 배선, `config.bank_wiring_ready()`)를 그대로 감싼다 — 계좌 안내 자체의 동작은
바뀌지 않는다(라우터가 `contracts.issue_instructions()` 를 여전히 GET 에서 호출해 멱등 발급한다).
`confirm/lookup/refund/parse_webhook` 은 이 레일에 의미가 없으므로 전부 `RailNotSupported`.
"""

from __future__ import annotations

from datetime import timedelta

from .. import config as bank_config
from .. import constants as payment_constants
from .base import CheckoutResult, RailNotSupported, RailOffer


class BankTransferRail:
    key = "bank_transfer"

    def wired(self) -> bool:
        return bank_config.bank_wiring_ready()

    def offer(self, contract, ad, tier, *, now) -> RailOffer:
        bank_info = bank_config.get_bank_info()
        if bank_info is None:
            return RailOffer(rail=self.key, wired=False)
        due_at = None
        if contract.payment_instructions_issued_at is not None:
            due_at = contract.payment_instructions_issued_at + timedelta(days=payment_constants.PAYMENT_DUE_DAYS)
        return RailOffer(
            rail=self.key,
            wired=True,
            instructions={
                "name": bank_info["name"],
                "account_no": bank_info["account_no"],
                "holder": bank_info["holder"],
                "payment_code": contract.payment_code,
                "due_at": due_at.isoformat() if due_at else None,
            },
        )

    async def confirm(self, contract, *, params: dict) -> CheckoutResult:
        raise RailNotSupported("bank_transfer 는 결제 개시를 지원하지 않는다")

    async def lookup(self, contract, *, ref: str) -> CheckoutResult | None:
        raise RailNotSupported("bank_transfer 는 결제 개시를 지원하지 않는다")

    async def refund(
        self,
        contract,
        *,
        ref: str,
        amount_vnd: int | None,
        reason: str,
        idempotency_seed: str,
        remaining_amount_vnd: int | None = None,
    ) -> CheckoutResult:
        raise RailNotSupported("bank_transfer 환불은 계좌 송금(관리자 manual 입금건 등록)으로 처리한다")

    def parse_webhook(self, headers: dict, body: bytes) -> str | None:
        raise RailNotSupported("bank_transfer 는 웹훅을 지원하지 않는다")
