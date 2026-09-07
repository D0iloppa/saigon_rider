"""seam-C 포트 — 결제 개시 (260907_toss_payment_rail_design.md §3-2).

`PaymentRail` 은 "결제 개시가 있는 레일"과 "없는 레일"(계좌이체)을 같은 프로토콜로 표현한다.
능력 플래그를 두지 않는다 — `offer()` 가 `instructions`(계좌) 를 채우느냐 `checkout`(결제창) 을
채우느냐가 이미 능력 표현이고, 결제 개시가 없는 레일은 `confirm/lookup/refund/parse_webhook` 에서
`RailNotSupported` 를 던지는 null-object 다(§3-2).

원장·대조·승인·노출은 이 포트가 무엇인지 모른다 — 산출물은 오직 `DepositObservation` 하나이고,
그것을 seam-B(`port.ingest_deposit`)에 넣는다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..port import DepositObservation


@dataclass(frozen=True)
class RailOffer:
    """계약 페이지가 광고주에게 보여줄 결제수단 1개. 값이 아니라 '무엇을 보여줄지'."""

    rail: str  # "bank_transfer" | "toss_card"
    wired: bool  # 배선됐는가 (미배선이면 아래 필드는 전부 None)
    instructions: dict | None = None  # bank_transfer: {name, account_no, holder, payment_code, due_at}
    checkout: dict | None = None  # toss_card: {client_key, order_id, order_name, amount, success_url, fail_url, ...}


@dataclass(frozen=True)
class CheckoutResult:
    """결제 개시가 있는 레일이 confirm/웹훅/재조회로 얻은 확정 결과.

    seam-B 로 넘길 관측(`observation`) 1개 + 원본 스냅샷(`charge_snapshot`, §3-4 ad_deposits 컬럼용).
    """

    observation: DepositObservation
    charge_snapshot: dict
    already_final: bool  # PSP 쪽에서 이미 DONE 이었나(중복 confirm 등) — 로그용


class RailNotSupported(Exception):
    """결제 개시가 없는 레일(bank_transfer)의 confirm/lookup/refund/parse_webhook 호출."""


class RailValidationError(Exception):
    """스냅샷 대조 실패·잘못된 orderId 등 클라이언트 입력 오류 — 라우터가 4xx 로 변환한다."""


class PaymentRail(Protocol):
    key: str

    def wired(self) -> bool: ...

    def offer(self, contract, ad, tier, *, now) -> RailOffer: ...

    # ── 아래 넷은 "결제 개시가 있는 레일"만 의미가 있다. 없는 레일은 RailNotSupported.
    async def confirm(self, contract, *, params: dict) -> CheckoutResult: ...

    async def lookup(self, contract, *, ref: str) -> CheckoutResult | None: ...

    async def refund(self, contract, *, ref: str, amount_vnd: int | None, reason: str) -> CheckoutResult: ...

    def parse_webhook(self, headers: dict, body: bytes) -> str | None: ...
