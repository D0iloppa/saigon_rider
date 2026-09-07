"""코어 — 결제 개시가 있는 레일의 확정 결과를 원장·승인·노출까지 잇는다
(260907_toss_payment_rail_design.md §3-6).

**자동 승인은 어댑터가 아니라 코어가 한다** — 어댑터(`rails/*.py`)는 `CheckoutResult` 를 돌려줄
뿐 `contracts.approve()`·`ad.paid_until`·상태값을 직접 만지지 않는다. `constants.AUTO_APPROVE_SOURCES`
에 있는 소스만, 그리고 대조 결과가 정확히 `paid` 일 때만 즉시 승인한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ...models import AdContract, AdDeposit, AdminAuditLog, MarketplaceAd
from .. import noti_events
from . import constants
from . import contracts as contract_fsm
from .rails.base import CheckoutResult

_PRE_APPROVE_ALLOWED_STATUSES = ("accepted", "awaiting_payment", "paid")


@dataclass(frozen=True)
class CompleteCheckoutOutcome:
    ingest_duplicate: bool
    ingest_status: str | None
    approved: bool
    period_start: datetime | None
    period_end: datetime | None
    audit_detail: dict | None  # None 이면 승인 없음 — 감사로그를 쓰지 않는다


async def complete_checkout(
    db, contract: AdContract, ad: MarketplaceAd, result: CheckoutResult, *, now: datetime
) -> CompleteCheckoutOutcome:
    """① ingest_deposit(observation) → ② 조건부 approve(actor='system:<source>').

    ②의 조건: 중복이 아니고, 대조 결과가 정확히 `paid` 이고, ingest 이전 계약 상태가
    `{accepted, awaiting_payment, paid}` 중 하나이고(이미 active/취소/환불된 계약이 아님),
    관측의 `source` 가 `constants.AUTO_APPROVE_SOURCES` 에 있을 때만.
    """
    # 지연 import — rails.* → checkout 은 import 하지 않으므로 순환은 없지만, port 를 모듈
    # 최상단에서 들여오면 이 파일이 seam-B 코어에 대한 위치를 오해하기 쉬워 함수 안에서 명시한다.
    from . import port as deposit_port

    pre_status = contract.status
    ingest_result = await deposit_port.ingest_deposit(db, result.observation, actor=f"rail:{result.observation.source}")

    if not ingest_result.duplicate:
        deposit = await db.get(AdDeposit, ingest_result.deposit_id)
        if deposit is not None:
            deposit.charge_snapshot = result.charge_snapshot
            await db.commit()

    approved = False
    period_start = period_end = None
    audit_detail: dict | None = None

    should_approve = (
        not ingest_result.duplicate
        and ingest_result.status == "paid"
        and pre_status in _PRE_APPROVE_ALLOWED_STATUSES
        and result.observation.source in constants.AUTO_APPROVE_SOURCES
    )
    if should_approve:
        actor = f"system:{result.observation.source}"
        period_start, period_end = contract_fsm.approve(contract, ad, actor=actor, now=now)
        approved = True
        audit_detail = {
            "contract_id": str(contract.id),
            "ad_id": str(ad.id),
            "auto": True,
            "rail": result.observation.source,
            "payment_key": result.observation.source_ref,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
        }
        await db.commit()

    return CompleteCheckoutOutcome(
        ingest_duplicate=ingest_result.duplicate,
        ingest_status=ingest_result.status,
        approved=approved,
        period_start=period_start,
        period_end=period_end,
        audit_detail=audit_detail,
    )


async def record_auto_approve_audit(db, outcome: CompleteCheckoutOutcome) -> None:
    """`outcome.approved` 일 때만 감사로그 삽입 + 광고주 알림 발행. 두 호출부(공개 confirm
    엔드포인트·토스 웹훅 라우터)가 공유 — 관리자 세션이 없는 시스템 액션이라 admin_api._audit.audit()
    (AdminSession 필요) 대신 여기서 직접 AdminAuditLog 를 쓴다."""
    if not outcome.approved or outcome.audit_detail is None:
        return
    db.add(
        AdminAuditLog(
            admin_username="system:toss",
            admin_role="system",
            action="BIZ_AD_CONTRACT_APPROVE",
            target_type="ad_contract",
            target_id=outcome.audit_detail["contract_id"],
            detail=outcome.audit_detail,
        )
    )
    await db.commit()

    ad = await db.get(MarketplaceAd, outcome.audit_detail["ad_id"])
    if ad is None or ad.owner_business_profile_id is None:
        return
    from ...models import BusinessProfile

    owner_bp = await db.get(BusinessProfile, ad.owner_business_profile_id)
    if owner_bp is None:
        return
    await noti_events.publish(
        "biz.ad_reviewed",
        {
            "user_id": str(owner_bp.user_id),
            "ad_id": str(ad.id),
            "ad_title": ad.title,
            "result": "SUBSCRIPTION_ACTIVE",
        },
    )
