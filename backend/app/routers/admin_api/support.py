"""admin JSON API — 고객센터 (support_tickets/support_replies 테이블).

legacy `admin_legacy.py` `/admin-legacy/support` 구간의 쿼리·시퀀스를 그대로 JSON API 화한 것.
정렬: created_at desc 만 (legacy 도 OPEN 우선 정렬은 하지 않음 — 그대로 유지).
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import SupportReply, SupportTicket
from ...schemas import Page
from ._audit import audit

router = APIRouter(prefix="/support")

_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED"}


class UserBrief(BaseModel):
    id: uuid.UUID
    nickname: str | None


class TicketRow(BaseModel):
    id: uuid.UUID
    title: str
    user: UserBrief
    status: str
    has_unread_reply: bool
    created_at: datetime
    last_reply_at: datetime | None


class ReplyOut(BaseModel):
    id: int
    author_type: str
    body: str
    created_at: datetime


class TicketDetail(TicketRow):
    body: str
    replies: list[ReplyOut]


class ReplyCreate(BaseModel):
    body: str


class StatusUpdate(BaseModel):
    status: str


async def _get_ticket_or_404(db: AsyncSession, ticket_id: uuid.UUID) -> SupportTicket:
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


async def _last_reply_ats(db: AsyncSession, ticket_ids: list[uuid.UUID]) -> dict[uuid.UUID, datetime]:
    if not ticket_ids:
        return {}
    rows = (
        await db.execute(
            select(SupportReply.ticket_id, func.max(SupportReply.created_at))
            .where(SupportReply.ticket_id.in_(ticket_ids))
            .group_by(SupportReply.ticket_id)
        )
    ).all()
    return {tid: last_at for tid, last_at in rows}


@router.get("/tickets", response_model=Page[TicketRow])
async def list_tickets(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    q = select(SupportTicket).options(selectinload(SupportTicket.user))
    count_q = select(func.count()).select_from(SupportTicket)
    if status:
        if status not in _STATUSES:
            raise HTTPException(status_code=400, detail="invalid status")
        q = q.where(SupportTicket.status == status)
        count_q = count_q.where(SupportTicket.status == status)

    total = (await db.execute(count_q)).scalar_one()
    tickets = (
        (await db.execute(q.order_by(SupportTicket.created_at.desc()).offset((page - 1) * size).limit(size)))
        .scalars()
        .all()
    )

    last_reply_ats = await _last_reply_ats(db, [t.id for t in tickets])
    items = [
        TicketRow(
            id=t.id,
            title=t.title,
            user=UserBrief(id=t.user_id, nickname=t.user.nickname if t.user else None),
            status=t.status,
            has_unread_reply=t.has_unread_reply,
            created_at=t.created_at,
            last_reply_at=last_reply_ats.get(t.id),
        )
        for t in tickets
    ]
    return Page(items=items, total=total, page=page, size=size)


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
async def get_ticket(
    ticket_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.replies), selectinload(SupportTicket.user))
        .where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    last_reply_at = max((r.created_at for r in ticket.replies), default=None)
    return TicketDetail(
        id=ticket.id,
        title=ticket.title,
        user=UserBrief(id=ticket.user_id, nickname=ticket.user.nickname if ticket.user else None),
        status=ticket.status,
        has_unread_reply=ticket.has_unread_reply,
        created_at=ticket.created_at,
        last_reply_at=last_reply_at,
        body=ticket.body,
        replies=[
            ReplyOut(id=r.id, author_type=r.author_type, body=r.body, created_at=r.created_at) for r in ticket.replies
        ],
    )


@router.post("/tickets/{ticket_id}/replies", response_model=TicketDetail)
async def create_reply(
    ticket_id: uuid.UUID,
    body: ReplyCreate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _get_ticket_or_404(db, ticket_id)

    reply_body = body.body.strip()
    if not reply_body:
        raise HTTPException(status_code=400, detail="답변 내용을 입력하세요.")

    reply = SupportReply(ticket_id=ticket_id, author_type="admin", body=reply_body)
    db.add(reply)
    ticket.has_unread_reply = True
    if ticket.status == "OPEN":
        ticket.status = "IN_PROGRESS"

    await audit(db, session, request, "SUPPORT_REPLY", "support_ticket", str(ticket_id), {"body": reply_body})
    await db.commit()
    return await get_ticket(ticket_id, session, db)


@router.patch("/tickets/{ticket_id}", response_model=TicketDetail)
async def update_status(
    ticket_id: uuid.UUID,
    body: StatusUpdate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in _STATUSES:
        raise HTTPException(status_code=400, detail="invalid status")
    ticket = await _get_ticket_or_404(db, ticket_id)

    prev = ticket.status
    ticket.status = body.status

    await audit(
        db, session, request, "SUPPORT_STATUS", "support_ticket", str(ticket_id), {"from": prev, "to": body.status}
    )
    await db.commit()
    return await get_ticket(ticket_id, session, db)
