"""보상 교환 서비스 (business-rules §8)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import RedemptionStatusEnum
from app.exceptions import InsufficientBalanceError, RewardUnavailableError
from app.models import RewardCatalog, RewardRedemption, SreUser
from app.services import xp_ledger


async def redeem(
    db: AsyncSession,
    *,
    user: SreUser,
    catalog_id: int,
    idempotency_key: str,
) -> RewardRedemption:
    # 멱등성: 동일 키로 이미 처리된 요청이면 원본 반환.
    # user 스코프 필수 — 전역 키 조회는 타인의 redemption(바우처 코드)을 반환할 수 있다 (E-12)
    existing = await db.execute(
        select(RewardRedemption).where(
            RewardRedemption.idempotency_key == idempotency_key,
            RewardRedemption.user_id == user.user_id,
        )
    )
    if (existing_row := existing.scalar_one_or_none()) is not None:
        return existing_row

    # 카탈로그 조회 — 행 잠금: 쿼터 검사~monthly_issued 증가가 락 없는 RMW 라
    # 동시 교환 시 월 쿼터 초과 발급 가능했음 (E-6)
    catalog = (
        await db.execute(
            select(RewardCatalog).where(RewardCatalog.catalog_id == catalog_id).with_for_update()
        )
    ).scalar_one_or_none()
    if catalog is None or not catalog.is_active:
        raise RewardUnavailableError("Catalog item not available")

    # monthly_quota 검사
    if catalog.monthly_quota is not None and catalog.monthly_issued >= catalog.monthly_quota:
        raise RewardUnavailableError("Monthly quota exceeded")

    # 잔액 검사
    balance = await xp_ledger.lock_balance(db, user.user_id)
    if balance.gc_balance < catalog.required_xp:
        raise InsufficientBalanceError(
            f"Required {catalog.required_xp} RP but balance is {balance.gc_balance}"
        )

    # 어댑터 선택 및 바우처 발급
    from app.adapters.stub import get_adapter
    partner = await db.get(__import__("app.models", fromlist=["RewardPartner"]).RewardPartner, catalog.partner_id)
    adapter = get_adapter(partner.integration_type.value, partner.partner_code)
    voucher = await adapter.issue_voucher(
        catalog_item=catalog,
        user=user,
        idempotency_key=idempotency_key,
    )

    # RP(GC) 차감 — 쿠폰은 RP(gc_balance)로 구매. 골드(current_balance)와 별개.
    balance.gc_balance -= catalog.required_xp

    # monthly_issued 증가
    catalog.monthly_issued += 1

    # redemption 레코드 생성
    now = datetime.now(timezone.utc)
    redemption = RewardRedemption(
        user_id=user.user_id,
        catalog_id=catalog_id,
        xp_transaction_id=None,
        status=(
            RedemptionStatusEnum.FULFILLED
            if voucher.voucher_code else RedemptionStatusEnum.REQUESTED
        ),
        voucher_code=voucher.voucher_code,
        external_response=voucher.external_response,
        idempotency_key=idempotency_key,
        requested_at=now,
        fulfilled_at=now if voucher.voucher_code else None,
    )
    db.add(redemption)
    await db.flush()

    # ENG-10: RP(gc) 차감 원장 기록 — 쿠폰 교환 감사/검증. lock_balance 는 위에서 이미 보유.
    from app.enums import TxTypeEnum
    await xp_ledger.record_gc_tx(
        db,
        user_id=user.user_id,
        amount=catalog.required_xp,
        balance_after=balance.gc_balance,
        source_type="REDEMPTION",
        source_id=redemption.redemption_id,
        memo=f"쿠폰 교환: catalog#{catalog_id}",
        tx_type=TxTypeEnum.REDEEM,
    )

    from app.services import audit
    await audit.record(
        db,
        entity_type="reward_redemption",
        entity_id=redemption.redemption_id,
        actor_user_id=user.user_id,
        action_code="REDEEM",
        after={
            "catalog_id": catalog_id,
            "xp_spent": catalog.required_xp,
            "status": redemption.status.value,
        },
    )

    await db.commit()
    return redemption
