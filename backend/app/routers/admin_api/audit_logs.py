"""admin JSON API — 감사 로그 열람 (읽기 전용, root 전용).

admin_audit_log 는 전 액션에서 `_audit.py` 를 통해 기록 중 — 여기서는 조회만 제공한다.
읽기 전용이므로 이 조회 자체는 감사 기록을 남기지 않는다.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...models import AdminAuditLog
from ...schemas import Page

router = APIRouter(prefix="/audit-logs")


class AdminAuditLogRow(BaseModel):
    id: int
    admin_username: str
    admin_role: str
    action: str
    target_type: str | None
    target_id: str | None
    detail: dict | None
    ip: str | None
    created_at: datetime


@router.get("", response_model=Page[AdminAuditLogRow])
async def list_audit_logs(
    admin: str | None = Query(None),
    action: str | None = Query(None),
    target_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AdminAuditLog)
    count_stmt = select(func.count()).select_from(AdminAuditLog)
    if admin:
        cond = AdminAuditLog.admin_username.ilike(f"%{admin}%")
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if action:
        stmt = stmt.where(AdminAuditLog.action == action)
        count_stmt = count_stmt.where(AdminAuditLog.action == action)
    if target_type:
        stmt = stmt.where(AdminAuditLog.target_type == target_type)
        count_stmt = count_stmt.where(AdminAuditLog.target_type == target_type)

    total = (await db.execute(count_stmt)).scalar_one()
    logs = (
        (await db.execute(stmt.order_by(AdminAuditLog.created_at.desc()).offset((page - 1) * size).limit(size)))
        .scalars()
        .all()
    )
    return Page(
        items=[AdminAuditLogRow.model_validate(log, from_attributes=True) for log in logs],
        total=total,
        page=page,
        size=size,
    )
