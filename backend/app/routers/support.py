import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import verify_user_session_allow_suspended
from ..models import Report, SupportReply, SupportTicket, User
from ..schemas import (
    ReportOut,
    SupportReplyCreateRequest,
    SupportTicketCreate,
    SupportTicketDetail,
    SupportTicketOut,
)
from .market import MarketplaceListing, _thumbnail_url

router = APIRouter(prefix="/support", tags=["고객센터 (Support)"])

# R-1(260817 §12-B) — DB status(PENDING/REVIEWING/RESOLVED/REJECTED) → 사용자 노출 3단계.
# result_code/resolution_note 는 여기서 전혀 참조하지 않는다(원본 미노출).
_REPORT_STATUS_DISPLAY = {
    "PENDING": "REVIEWING",
    "REVIEWING": "REVIEWING",
    "RESOLVED": "RESOLVED",
    "REJECTED": "REJECTED",
}


@router.post("/tickets", response_model=SupportTicketOut, summary="문의 등록")
async def create_ticket(
    body: SupportTicketCreate,
    # Q-4(감사 260817): 정지/차단된 사용자도 이의제기 티켓은 만들 수 있어야 한다 — 세션 인증은 유지.
    user_id: uuid.UUID = Depends(verify_user_session_allow_suspended),
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
    # D-22(감사 260817): 정지 사용자도 자기 티켓은 열람할 수 있어야 이의제기 구제가 완결된다.
    user_id: uuid.UUID = Depends(verify_user_session_allow_suspended),
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
    # D-22(감사 260817): 정지 사용자도 자기 티켓 상세(답변 포함)는 열람할 수 있어야 한다.
    user_id: uuid.UUID = Depends(verify_user_session_allow_suspended),
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


# FD-2 사용자 답글 (본인 문의만)
@router.post("/tickets/{ticket_id}/replies", response_model=SupportTicketDetail, summary="문의 답글 작성 (본인)")
async def create_reply(
    ticket_id: uuid.UUID,
    body: SupportReplyCreateRequest,
    # D-22(감사 260817): 정지 사용자도 자기 티켓에 소명을 추가할 수 있어야 한다.
    user_id: uuid.UUID = Depends(verify_user_session_allow_suspended),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).options(selectinload(SupportTicket.replies)).where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None or ticket.user_id != user_id:
        raise HTTPException(status_code=404, detail="Ticket not found")

    reply_body = body.body.strip()
    if not reply_body:
        raise HTTPException(status_code=400, detail="content is required")

    db.add(SupportReply(ticket_id=ticket_id, author_type="user", body=reply_body))
    ticket.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(ticket)

    out = _to_out(ticket, reply_count=len(ticket.replies))
    return SupportTicketDetail(
        **out.model_dump(),
        replies=[r for r in ticket.replies],
    )


@router.get("/reports", response_model=list[ReportOut], summary="내 신고 목록")
async def list_reports(
    # 정지된 사용자도 자기 신고 이력은 열람할 수 있어야 이의제기 구제가 완결된다(D-22 동일 원칙).
    user_id: uuid.UUID = Depends(verify_user_session_allow_suspended),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        # 소유권 필터 — 본인이 신고자인 건만 (남의 신고는 절대 노출 금지)
        select(Report).where(Report.reporter_id == user_id).order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()
    if not reports:
        return []

    listing_ids = {r.listing_id for r in reports if r.target_type == "LISTING" and r.listing_id}
    listings: dict[uuid.UUID, MarketplaceListing] = {}
    if listing_ids:
        listing_rows = await db.execute(select(MarketplaceListing).where(MarketplaceListing.id.in_(listing_ids)))
        listings = {listing.id: listing for listing in listing_rows.scalars().all()}

    user_ids = {r.reported_user_id for r in reports if r.target_type != "LISTING"}
    users: dict[uuid.UUID, User] = {}
    if user_ids:
        user_rows = await db.execute(select(User).where(User.id.in_(user_ids)))
        users = {u.id: u for u in user_rows.scalars().all()}

    return [_to_report_out(r, listings, users) for r in reports]


def _to_report_out(
    report: Report,
    listings: dict[uuid.UUID, MarketplaceListing],
    users: dict[uuid.UUID, User],
) -> ReportOut:
    target_title: str | None = None
    target_thumbnail_url: str | None = None
    if report.target_type == "LISTING":
        listing = listings.get(report.listing_id) if report.listing_id else None
        if listing is not None:
            target_title = listing.title
            target_thumbnail_url = _thumbnail_url(listing)
    else:
        target_user = users.get(report.reported_user_id)
        if target_user is not None:
            target_title = target_user.nickname

    return ReportOut(
        id=report.id,
        target_type=report.target_type,
        reason=report.reason,
        status=_REPORT_STATUS_DISPLAY.get(report.status, "REVIEWING"),
        created_at=report.created_at,
        handled_at=report.handled_at,
        listing_id=report.listing_id,
        target_title=target_title,
        target_thumbnail_url=target_thumbnail_url,
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
