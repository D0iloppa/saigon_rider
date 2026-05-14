from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.enums import RedemptionStatusEnum
from app.exceptions import InsufficientBalanceError, RewardUnavailableError
from app.models import RewardRedemption, SreUser
from app.schemas import RedemptionCreate, RedemptionRead
from app.services import reward as reward_svc

router = APIRouter(prefix="/v1/users", tags=["rewards"])


@router.post("/{user_id}/redemptions", response_model=RedemptionRead,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(verify_service_key)])
async def create_redemption(
    user_id: int,
    data: RedemptionCreate,
    db: AsyncSession = Depends(get_session),
) -> RewardRedemption:
    user = await db.get(SreUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    try:
        return await reward_svc.redeem(
            db,
            user=user,
            catalog_id=data.catalog_id,
            idempotency_key=data.idempotency_key,
        )
    except InsufficientBalanceError as e:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(e))
    except RewardUnavailableError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get("/{user_id}/redemptions", response_model=list[RedemptionRead],
            dependencies=[Depends(verify_service_key)])
async def list_redemptions(
    user_id: int,
    redemption_status: Optional[RedemptionStatusEnum] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> list[RewardRedemption]:
    query = select(RewardRedemption).where(RewardRedemption.user_id == user_id)
    if redemption_status:
        query = query.where(RewardRedemption.status == redemption_status)
    query = query.order_by(RewardRedemption.requested_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{user_id}/redemptions/{redemption_id}", response_model=RedemptionRead,
            dependencies=[Depends(verify_service_key)])
async def get_redemption(
    user_id: int,
    redemption_id: int,
    db: AsyncSession = Depends(get_session),
) -> RewardRedemption:
    redemption = await db.get(RewardRedemption, redemption_id)
    if redemption is None or redemption.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Redemption not found")
    return redemption
