"""admin JSON API — 관리자 계정 관리 (admin_accounts 테이블, root/admin 전용).

legacy 콘솔(admin_legacy.py `/admins/*`)의 CRUD 를 JSON 으로 포팅했다. root(.env `ADMIN_USER`) 는
DB 행이 아니라 목록에 나타나지 않으며, 신규 계정의 아이디로 root 와 동일한 값은 거부한다
(`_validate_username`, legacy 의 root_collision 규칙과 동일). 수정/삭제 대상은 항상 DB 조회로
얻으므로 root 는 애초에 대상이 될 수 없다. DB 행의 role 은 'admin'(root 동등) | 'manager' 만 허용.
"""

import re
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import ADMIN_USER, AdminSession, hash_password, verify_root_api
from ...database import get_db
from ...models import AdminAccount
from ._audit import audit

router = APIRouter(prefix="/accounts")

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,50}$")


class AdminAccountRow(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    username: str
    role: str
    note: str | None
    created_at: datetime
    updated_at: datetime


class AdminAccountCreate(BaseModel):
    username: str
    password: str
    role: Literal["admin", "manager"] = "manager"
    note: str | None = Field(None, max_length=200)


class AdminAccountUpdate(BaseModel):
    role: Literal["admin", "manager"] | None = None
    note: str | None = Field(None, max_length=200)
    password: str | None = None


def _validate_username(username: str) -> None:
    if not _USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail="아이디 형식이 올바르지 않습니다 (영문/숫자/._- 3~50자).")
    if username == ADMIN_USER:
        raise HTTPException(status_code=400, detail="root 관리자(.env)와 동일한 아이디는 사용할 수 없습니다.")


async def _get_account_or_404(db: AsyncSession, account_id: uuid.UUID) -> AdminAccount:
    account = await db.get(AdminAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Admin account not found")
    return account


@router.get("", response_model=list[AdminAccountRow])
async def list_accounts(
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    accounts = (await db.execute(select(AdminAccount).order_by(AdminAccount.created_at.desc()))).scalars().all()
    return [AdminAccountRow.model_validate(a) for a in accounts]


@router.post("", response_model=AdminAccountRow)
async def create_account(
    body: AdminAccountCreate,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    username = body.username.strip()
    _validate_username(username)
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="비밀번호는 6자 이상이어야 합니다.")

    exists = (await db.execute(select(AdminAccount).where(AdminAccount.username == username))).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다.")

    account = AdminAccount(
        username=username,
        password_hash=hash_password(body.password),
        role=body.role,
        note=(body.note or "").strip() or None,
    )
    db.add(account)
    await db.flush()
    await audit(
        db,
        session,
        request,
        "ADMIN_ACCOUNT_CREATE",
        "admin_account",
        str(account.id),
        {"username": username, "role": body.role},
    )
    await db.commit()
    await db.refresh(account)
    return AdminAccountRow.model_validate(account)


@router.put("/{account_id}", response_model=AdminAccountRow)
async def update_account(
    account_id: uuid.UUID,
    body: AdminAccountUpdate,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account_or_404(db, account_id)

    account.note = (body.note or "").strip() or None
    if body.role is not None:
        account.role = body.role
    password_changed = False
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="비밀번호는 6자 이상이어야 합니다.")
        account.password_hash = hash_password(body.password)
        password_changed = True

    await audit(
        db,
        session,
        request,
        "ADMIN_ACCOUNT_UPDATE",
        "admin_account",
        str(account_id),
        {"password_changed": password_changed, "role": account.role},
    )
    await db.commit()
    await db.refresh(account)
    return AdminAccountRow.model_validate(account)


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account_or_404(db, account_id)
    username = account.username
    await db.delete(account)
    await audit(db, session, request, "ADMIN_ACCOUNT_DELETE", "admin_account", str(account_id), {"username": username})
    await db.commit()
