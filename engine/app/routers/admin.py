from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.database import AsyncSession
from app.deps import get_session, verify_admin_jwt
from app.enums import TxTypeEnum
from app.exceptions import InsufficientBalanceError
from app.models import (
    ActionDefinition, AuditLog, RpTransaction, SreUser, UserTier,
)
from app.schemas import (
    AdminAdjustCreate, AuditEntryRead,
    TransactionRead, UserSummary,
)
from app.services import audit as audit_svc
from app.services import point_ledger

router = APIRouter(prefix="/v1/admin", tags=["admin"])

_admin = Depends(verify_admin_jwt)


# ── 액션 정의 ─────────────────────────────────────────────


@router.get("/action-definitions", dependencies=[_admin])
async def list_action_definitions(
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    result = await db.execute(select(ActionDefinition))
    defs = result.scalars().all()
    return [
        {
            "action_code": d.action_code,
            "category_code": d.category_code,
            "display_name": d.display_name,
            "base_rp": d.base_rp,
            "daily_count_limit": d.daily_count_limit,
            "is_active": d.is_active,
            "metadata_schema": d.metadata_schema,
            "updated_at": d.updated_at,
        }
        for d in defs
    ]


@router.post("/action-definitions", status_code=status.HTTP_201_CREATED,
             dependencies=[_admin])
async def create_action_definition(
    data: dict,
    db: AsyncSession = Depends(get_session),
) -> dict:
    action = ActionDefinition(**data)
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return {"action_code": action.action_code, "created": True}


@router.put("/action-definitions/{action_code}", dependencies=[_admin])
async def update_action_definition(
    action_code: str,
    data: dict,
    db: AsyncSession = Depends(get_session),
) -> dict:
    action = await db.get(ActionDefinition, action_code)
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    for k, v in data.items():
        if hasattr(action, k) and k != "action_code":
            setattr(action, k, v)
    await db.commit()
    return {"action_code": action_code, "updated": True}


# ── 사용자 조회 ───────────────────────────────────────────


@router.get("/users/{user_id}", response_model=UserSummary,
            dependencies=[_admin])
async def get_user_summary(
    user_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.models import RpBalance
    user = await db.get(SreUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    balance = await db.get(RpBalance, user_id)
    tier = await db.get(UserTier, user_id)
    return {
        "user_id": user.user_id,
        "external_user_uuid": user.external_user_uuid,
        "account_type": user.account_type,
        "is_driver_verified": user.is_driver_verified,
        "status": user.status,
        "created_at": user.created_at,
        "current_balance": balance.current_balance if balance else 0,
        "current_tier_code": tier.current_tier_code if tier else None,
    }


# ── RP 조정 ───────────────────────────────────────────────


@router.post("/users/{user_id}/adjust", response_model=TransactionRead,
             dependencies=[_admin])
async def adjust_balance(
    user_id: int,
    data: AdminAdjustCreate,
    admin: dict = _admin,
    db: AsyncSession = Depends(get_session),
) -> RpTransaction:
    if data.tx_type not in (TxTypeEnum.ADJUST_PLUS, TxTypeEnum.ADJUST_MINUS):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="tx_type must be ADJUST_PLUS or ADJUST_MINUS")
    try:
        tx = await point_ledger.admin_adjust(
            db,
            user_id=user_id,
            amount=data.amount,
            tx_type=data.tx_type,
            actor_user_id=admin.get("sub"),
            memo=data.memo,
        )
        await audit_svc.record(
            db,
            entity_type="rp_balance",
            entity_id=user_id,
            actor_user_id=admin.get("sub"),
            action_code=data.tx_type.value,
            after={"amount": data.amount, "memo": data.memo},
        )
        await db.commit()
        return tx
    except InsufficientBalanceError as e:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(e))


# ── 감사 로그 ─────────────────────────────────────────────


@router.get("/audit-logs", response_model=list[AuditEntryRead],
            dependencies=[_admin])
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list:
    query = select(AuditLog)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    query = query.order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()
