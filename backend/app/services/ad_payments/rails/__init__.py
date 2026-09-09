"""결제 레일 registry + 토스 웹훅 라우터 (260907_toss_payment_rail_design.md §3, §5-5 D-2).

`RAILS` 는 계약 페이지가 소비하는 `rails[]` 응답(P2-5, routers/ad_contract.py)이 순회하는
단일 SoT. 웹훅은 이 파일이 `router` 로 노출하고 `main.py` 가 1줄로 include 한다(어댑터 파일
안에 라우터를 두는 관례 — design §5-5 D-2).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....database import get_db
from ....models import AdContract, MarketplaceAd
from .. import checkout as checkout_core
from .. import payment_code
from .bank_transfer import BankTransferRail
from .base import CheckoutResult, PaymentRail, RailNotSupported, RailOffer, RailValidationError
from .toss_card import TossCardRail

RAILS: dict[str, PaymentRail] = {
    "bank_transfer": BankTransferRail(),
    "toss_card": TossCardRail(),
}

router = APIRouter(tags=["결제 레일 웹훅 (Payment Rail Webhooks)"])


@router.post("/public/ad-contract/webhooks/toss", summary="토스 웹훅 PAYMENT_STATUS_CHANGED (무인증)")
async def toss_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """서명이 없다(T-10) — 페이로드를 신뢰하지 않고 `paymentKey` 로 시크릿 키 재조회(lookup)만
    검증으로 삼는다. 항상 빨리 200 을 준다(토스는 10초 내 미응답 시 최대 7회 재전송 — 그 재전송도
    같은 paymentKey 라 멱등하게 안전하다)."""
    body = await request.body()
    rail: TossCardRail = RAILS["toss_card"]  # type: ignore[assignment]

    payment_key = rail.parse_webhook(dict(request.headers), body)
    if payment_key is None:
        return {"ok": True}

    try:
        payment = await rail.fetch_payment(ref=payment_key)
    except RailNotSupported:
        # toss_card 가 배선되지 않은 상태(off) — 이 환경에서 토스가 웹훅을 보낼 리 없지만,
        # 방어적으로 200 을 준다(재전송 폭주 방지). 아래 lookup() 도 같은 이유로 감싼다.
        return {"ok": True}
    if payment is None or payment.get("status") != "DONE":
        return {"ok": True}

    order_id = payment.get("orderId")
    if not isinstance(order_id, str):
        return {"ok": True}

    code_part = order_id.rsplit("-", 1)[0]
    code = payment_code.parse_and_validate(code_part)
    if code is None:
        return {"ok": True}

    contract = (await db.execute(select(AdContract).where(AdContract.payment_code == code))).scalar_one_or_none()
    if contract is None:
        return {"ok": True}
    ad = await db.get(MarketplaceAd, contract.ad_id)
    if ad is None:
        return {"ok": True}

    try:
        result = rail.result_from_payment(contract, payment, ref=payment_key)
    except (RailNotSupported, RailValidationError):
        return {"ok": True}
    if result is None:
        return {"ok": True}

    outcome = await checkout_core.complete_checkout(db, contract, ad, result, now=datetime.now(UTC))
    await checkout_core.record_auto_approve_audit(db, outcome)
    return {"ok": True}


__all__ = [
    "RAILS",
    "CheckoutResult",
    "PaymentRail",
    "RailNotSupported",
    "RailOffer",
    "RailValidationError",
    "router",
]
