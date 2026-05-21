import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import verify_user_session
from ..models import SupportReply, SupportTicket
from ..schemas import SupportTicketCreate, SupportTicketDetail, SupportTicketOut

router = APIRouter(prefix="/support", tags=["고객센터 (Support)"])


@router.post("/tickets", response_model=SupportTicketOut, summary="문의 등록")
async def create_ticket(
    body: SupportTicketCreate,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    ticket = SupportTicket(
        user_id=user_id,
        title=body.title.strip(),
        body=body.body.strip(),
        status="OPEN",
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return _to_out(ticket, reply_count=0)


@router.get("/tickets", response_model=list[SupportTicketOut], summary="내 문의 목록")
async def list_tickets(
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).where(SupportTicket.user_id == user_id).order_by(SupportTicket.created_at.desc())
    )
    tickets = result.scalars().all()

    counts = {}
    if tickets:
        ids = [t.id for t in tickets]
        cnt_result = await db.execute(
            select(SupportReply.ticket_id, func.count())
            .where(SupportReply.ticket_id.in_(ids))
            .group_by(SupportReply.ticket_id)
        )
        counts = dict(cnt_result.all())

    return [_to_out(t, reply_count=counts.get(t.id, 0)) for t in tickets]


@router.get("/tickets/{ticket_id}", response_model=SupportTicketDetail, summary="문의 상세")
async def get_ticket(
    ticket_id: uuid.UUID,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).options(selectinload(SupportTicket.replies)).where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None or ticket.user_id != user_id:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.has_unread_reply:
        ticket.has_unread_reply = False
        ticket.updated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(ticket)

    out = _to_out(ticket, reply_count=len(ticket.replies))
    return SupportTicketDetail(
        **out.model_dump(),
        replies=[r for r in ticket.replies],
    )


def _to_out(ticket: SupportTicket, *, reply_count: int) -> SupportTicketOut:
    return SupportTicketOut(
        id=ticket.id,
        title=ticket.title,
        body=ticket.body,
        status=ticket.status,
        has_unread_reply=ticket.has_unread_reply,
        reply_count=reply_count,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )
