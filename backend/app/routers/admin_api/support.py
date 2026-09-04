"""admin JSON API — 고객센터 (support_tickets/support_replies 테이블).

legacy `admin_legacy.py` `/admin-legacy/support` 구간의 쿼리·시퀀스를 그대로 JSON API 화한 것.
정렬: created_at desc 만 (legacy 도 OPEN 우선 정렬은 하지 않음 — 그대로 유지).

013/016 §8(L5 이슈) #25~#27 확장 (init/185): category·severity·source·persona·result_code·
contract_context. #26 B4 원칙 — RESOLVED 전이 시 severity·result_code 미입력이면 422.
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
from ...schemas import ISSUE_CATEGORY_SEVERITY, IssueResultCode, Page
from ...services import noti_events
from ._audit import audit
from .accounts import AssigneeUpdate, resolve_assignee_update

router = APIRouter(prefix="/support")

_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED"}
_SOURCES = {"APP", "BIZ", "EXTERNAL"}
_RESULT_CODES = {c.value for c in IssueResultCode}


class UserBrief(BaseModel):
    id: uuid.UUID | None
    nickname: str | None


class TicketRow(BaseModel):
    id: uuid.UUID
    title: str
    user: UserBrief
    status: str
    has_unread_reply: bool
    created_at: datetime
    last_reply_at: datetime | None
    category: str | None
    severity: str | None
    source: str
    persona: str
    result_code: str | None
    contract_context: dict | None = None
    assignee_username: str | None = None


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
    # #26 — RESOLVED 전이 시 필수(미입력이면 422). 이미 트리아지 단계에서 지정돼 있으면 생략 가능.
    severity: str | None = None
    result_code: str | None = None


class TriageUpdate(BaseModel):
    """#25/#26 — 접수 직후 분류(triage). category 만 주면 severity 는 기본값을 자동 파생한다."""

    category: str | None = None
    severity: str | None = None


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
    source: str | None = Query(None),
    assignee: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    q = select(SupportTicket).options(selectinload(SupportTicket.user))
    count_q = select(func.count()).select_from(SupportTicket)
    if status:
        if status not in _STATUSES:
            raise HTTPException(status_code=400, detail="invalid status")
        q = q.where(SupportTicket.status == status)
        count_q = count_q.where(SupportTicket.status == status)
    if source:
        # #25: source 필터 (통합 큐 완료 검증 조건)
        if source not in _SOURCES:
            raise HTTPException(status_code=400, detail="invalid source")
        q = q.where(SupportTicket.source == source)
        count_q = count_q.where(SupportTicket.source == source)
    if assignee:
        # 담당자 배정(P2) — "me"=본인, "unassigned"=미배정, 그 외 값은 정확매칭.
        if assignee == "me":
            assignee_filter = SupportTicket.assignee_username == session.username
        elif assignee == "unassigned":
            assignee_filter = SupportTicket.assignee_username.is_(None)
        else:
            assignee_filter = SupportTicket.assignee_username == assignee
        q = q.where(assignee_filter)
        count_q = count_q.where(assignee_filter)

    total = (await db.execute(count_q)).scalar_one()
    tickets = (
        (await db.execute(q.order_by(SupportTicket.created_at.desc()).offset((page - 1) * size).limit(size)))
        .scalars()
        .all()
    )

    last_reply_ats = await _last_reply_ats(db, [t.id for t in tickets])
    items = [_to_row(t, last_reply_ats.get(t.id)) for t in tickets]
    return Page(items=items, total=total, page=page, size=size)


def _to_row(ticket: SupportTicket, last_reply_at: datetime | None) -> TicketRow:
    return TicketRow(
        id=ticket.id,
        title=ticket.title,
        user=UserBrief(id=ticket.user_id, nickname=ticket.user.nickname if ticket.user else None),
        status=ticket.status,
        has_unread_reply=ticket.has_unread_reply,
        created_at=ticket.created_at,
        last_reply_at=last_reply_at,
        category=ticket.category,
        severity=ticket.severity,
        source=ticket.source,
        persona=ticket.persona,
        result_code=ticket.result_code,
        contract_context=ticket.contract_context,
        assignee_username=ticket.assignee_username,
    )


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
    row = _to_row(ticket, last_reply_at)
    return TicketDetail(
        **row.model_dump(),
        body=ticket.body,
        replies=[
            ReplyOut(id=r.id, author_type=r.author_type, body=r.body, created_at=r.created_at) for r in ticket.replies
        ],
    )


@router.patch("/tickets/{ticket_id}/triage", response_model=TicketDetail)
async def triage_ticket(
    ticket_id: uuid.UUID,
    body: TriageUpdate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """#25/#26 — 분류(category·severity 지정). category 만 주면 taxonomy 기본 심각도를 파생한다."""
    ticket = await _get_ticket_or_404(db, ticket_id)

    if body.category is not None:
        ticket.category = body.category
        if body.severity is None:
            ticket.severity = ISSUE_CATEGORY_SEVERITY.get(body.category)
    if body.severity is not None:
        ticket.severity = body.severity

    await audit(
        db,
        session,
        request,
        "SUPPORT_TRIAGE",
        "support_ticket",
        str(ticket_id),
        {"category": ticket.category, "severity": ticket.severity},
    )
    await db.commit()
    return await get_ticket(ticket_id, session, db)


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
    # FD-12: 유저에게 인앱/푸시 알림 (noti_worker 의 support.replied 핸들러가 소비)
    # #25 EXTERNAL 채널은 user_id 가 없을 수 있다 — 알림 대상 자체가 없으니 발행 생략.
    if ticket.user_id is not None:
        await noti_events.publish(
            "support.replied",
            {"user_id": str(ticket.user_id), "ticket_id": str(ticket_id), "reply_preview": reply_body[:200]},
        )
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

    if body.severity is not None:
        ticket.severity = body.severity
    if body.result_code is not None:
        if body.result_code not in _RESULT_CODES:
            raise HTTPException(status_code=400, detail="invalid result_code")
        ticket.result_code = body.result_code

    # #26 B4: 결과 코드 없이 종결 불가 — RESOLVED 전이 시 severity·result_code 둘 다 확정돼 있어야 한다.
    if body.status == "RESOLVED" and (ticket.severity is None or ticket.result_code is None):
        raise HTTPException(
            status_code=422,
            detail={"code": "result_code_required", "message": "종결 전 severity·result_code 입력이 필요합니다."},
        )

    prev = ticket.status
    ticket.status = body.status

    await audit(
        db, session, request, "SUPPORT_STATUS", "support_ticket", str(ticket_id), {"from": prev, "to": body.status}
    )
    await db.commit()
    return await get_ticket(ticket_id, session, db)


@router.patch("/tickets/{ticket_id}/assignee", response_model=TicketDetail)
async def assign_ticket(
    ticket_id: uuid.UUID,
    body: AssigneeUpdate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """담당자 배정(P2). 자동배정·알림 없음 — 누가 볼 것인가만 기록."""
    ticket = await _get_ticket_or_404(db, ticket_id)

    prev, new_value = await resolve_assignee_update(db, ticket.assignee_username, body.assignee_username)
    ticket.assignee_username = new_value

    await audit(
        db, session, request, "SUPPORT_ASSIGN", "support_ticket", str(ticket_id), {"from": prev, "to": new_value}
    )
    await db.commit()
    return await get_ticket(ticket_id, session, db)
