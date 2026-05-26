from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.enums import TxTypeEnum
from app.models import UserMileageLog, XpBalance, XpExpirationSchedule, XpTransaction, SreUser
from app.schemas import BalanceRead, ExpirationItemRead, TransactionRead, WalletRead
from app.services.xp_ledger import get_or_create_user

router = APIRouter(prefix="/v1/users", tags=["balance"])


@router.get("/{user_uuid}/wallet", response_model=WalletRead,
            dependencies=[Depends(verify_service_key)])
async def get_wallet(
    user_uuid: str,
    db: AsyncSession = Depends(get_session),
) -> dict:
    user = await get_or_create_user(db, user_uuid)
    balance = await db.get(XpBalance, user.user_id)
    gp = int(balance.current_balance) if balance else 0
    gc = int(balance.gc_balance) if balance else 0
    return {"user_uuid": user_uuid, "gp_balance": gp, "gc_balance": gc}


@router.get("/{user_id}/balance", response_model=BalanceRead,
            dependencies=[Depends(verify_service_key)])
async def get_balance(
    user_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict:
    user = await db.get(SreUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    balance = await db.get(XpBalance, user_id)
    if balance is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Balance not found")

    # 30일 내 만료 예정 RP
    threshold = datetime.now(timezone.utc) + timedelta(days=30)
    from sqlalchemy import func
    from app.enums import ExpireStatusEnum
    expiring_result = await db.execute(
        select(func.coalesce(func.sum(XpExpirationSchedule.remaining_amount), 0)).where(
            XpExpirationSchedule.user_id == user_id,
            XpExpirationSchedule.expires_at <= threshold,
            XpExpirationSchedule.expires_at > datetime.now(timezone.utc),
            XpExpirationSchedule.status.in_([ExpireStatusEnum.PENDING, ExpireStatusEnum.PARTIALLY_USED]),
        )
    )
    expiring_in_30d = expiring_result.scalar_one() or 0

    tier = user.tier
    tier_code = tier.current_tier_code if tier else None

    return {
        "user_id": balance.user_id,
        "current_balance": balance.current_balance,
        "lifetime_earned": balance.lifetime_earned,
        "lifetime_spent": balance.lifetime_spent,
        "expiring_in_30d": expiring_in_30d,
        "tier": tier_code,
        "last_recalculated_at": balance.last_recalculated_at,
    }


@router.get("/{user_id}/transactions", response_model=list[TransactionRead],
            dependencies=[Depends(verify_service_key)])
async def list_transactions(
    user_id: int,
    tx_type: Optional[TxTypeEnum] = Query(None),
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> list[XpTransaction]:
    query = select(XpTransaction).where(XpTransaction.user_id == user_id)
    if tx_type:
        query = query.where(XpTransaction.tx_type == tx_type)
    if from_dt:
        query = query.where(XpTransaction.occurred_at >= from_dt)
    if to_dt:
        query = query.where(XpTransaction.occurred_at <= to_dt)
    query = query.order_by(XpTransaction.occurred_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{user_uuid}/mileage", dependencies=[Depends(verify_service_key)])
async def get_mileage(
    user_uuid: str,
    since: Optional[str] = Query(None, description="ISO8601 UTC. 미지정 시 전체 누적만 반환"),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """GPS 누적 마일리지. since 가 주어지면 그 시점 이후 합도 함께 반환."""
    from sqlalchemy import func

    user = await get_or_create_user(db, user_uuid)

    total = user.total_distance_m or 0
    period_m = 0
    if since:
        since_dt = datetime.fromisoformat(since)
        if since_dt.tzinfo is None:
            since_dt = since_dt.replace(tzinfo=timezone.utc)
        result = await db.execute(
            select(func.coalesce(func.sum(UserMileageLog.distance_m), 0)).where(
                UserMileageLog.user_id == user.user_id,
                UserMileageLog.recorded_at >= since_dt,
            )
        )
        period_m = int(result.scalar_one() or 0)

    return {
        "user_uuid": user_uuid,
        "total_distance_m": int(total),
        "period_distance_m": period_m,
    }


@router.get("/{user_id}/expirations", response_model=list[ExpirationItemRead],
            dependencies=[Depends(verify_service_key)])
async def list_expirations(
    user_id: int,
    within_days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_session),
) -> list[XpExpirationSchedule]:
    from app.enums import ExpireStatusEnum
    threshold = datetime.now(timezone.utc) + timedelta(days=within_days)
    result = await db.execute(
        select(XpExpirationSchedule).where(
            XpExpirationSchedule.user_id == user_id,
            XpExpirationSchedule.expires_at <= threshold,
            XpExpirationSchedule.expires_at > datetime.now(timezone.utc),
            XpExpirationSchedule.status.in_([ExpireStatusEnum.PENDING, ExpireStatusEnum.PARTIALLY_USED]),
        ).order_by(XpExpirationSchedule.expires_at.asc())
    )
    return result.scalars().all()
