"""admin JSON API — 통합 신고 큐 (reports 테이블: LISTING/USER/DM).

상태머신: PENDING→REVIEWING→RESOLVED/REJECTED (PENDING→종결 직행 허용, 종결 후 역전이 400).
DM 메시지 열람은 신고된 대화(conversation_id 보유)에 한정하며 조회마다 DM_VIEW 감사로그를 남긴다.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import DmMessage, MarketplaceListing, Notification, Report, User, UserSanction
from ...schemas import Page
from ...utils import build_imgproxy_url
from ..dm import _resolve_dm_image
from ._audit import audit

router = APIRouter(prefix="/reports")

_STATUSES = {"PENDING", "REVIEWING", "RESOLVED", "REJECTED"}
_TARGET_TYPES = {"LISTING", "USER", "DM"}
# 종결(RESOLVED/REJECTED) 상태는 키 없음 → 어떤 전이도 400
_ALLOWED_TRANSITIONS = {
    "PENDING": {"REVIEWING", "RESOLVED", "REJECTED"},
    "REVIEWING": {"RESOLVED", "REJECTED"},
}
# §5 #1: 신고자 처리 결과 통보 — 조치 세부(제재 종류·기간)는 노출하지 않는다(법무 미확인).
_REPORT_RESULT_NOTI = {
    "RESOLVED": ("신고가 처리되었습니다", "신고해 주신 내용을 검토했고, 조치했습니다."),
    "REJECTED": ("신고가 처리되었습니다", "신고해 주신 내용을 검토했지만, 조치가 필요하지 않았습니다."),
}

# §5 #3, D-11: 신고 큐 우선순위 정렬 — 컬럼 추가 대신 "사유 가중치(시간 환산) + 대기시간" 정렬식으로
# 해소한다(정본 §3-2). LISTING 신고 사유(market.py `_VALID_REPORT_REASONS`)와 DM 신고 사유
# (dm.ts `REPORT_REASONS`)를 합친 카탈로그 — 사기 계열(FRAUD/SCAM)이 최상위, 스팸/중복이 최하위.
# 가중치는 "시간(hour) 오프셋"으로 표현해 대기시간과 같은 단위로 더한다 — FRAUD 신규 건(오프셋 240h)이
# SPAM 3일 대기 건(오프셋 24h + 대기 72h = 96h)보다 항상 위에 오도록 여유 있게 벌렸다(완료 검증 조건).
# 카탈로그에 없는 값이 들어와도(스키마 드리프트) OTHER 수준(72h)으로 방어.
_REASON_PRIORITY_HOURS = {
    "FRAUD": 240.0,
    "SCAM": 240.0,
    "SEXUAL": 192.0,
    "ABUSE": 168.0,
    "PROHIBITED": 144.0,
    "OTHER": 72.0,
    "DUPLICATE": 48.0,
    "SPAM": 24.0,
}
_DEFAULT_REASON_PRIORITY_HOURS = 72.0


def _priority_score(reason: str, created_at: datetime, *, now: datetime | None = None) -> float:
    """순수 함수(정렬식 단위 테스트용) — SQL 쪽(_priority_score_column)과 같은 가중치 테이블을 쓴다."""
    now = now or datetime.now(UTC)
    wait_hours = (now - created_at).total_seconds() / 3600.0
    return _REASON_PRIORITY_HOURS.get(reason, _DEFAULT_REASON_PRIORITY_HOURS) + wait_hours


def _priority_score_column():
    wait_hours = func.extract("epoch", func.now() - Report.created_at) / 3600.0
    offset = case(
        *[(Report.reason == reason, hours) for reason, hours in _REASON_PRIORITY_HOURS.items()],
        else_=_DEFAULT_REASON_PRIORITY_HOURS,
    )
    return offset + wait_hours


class UserBrief(BaseModel):
    id: uuid.UUID
    nickname: str | None


class ReportedUserBrief(UserBrief):
    status: str
    report_count: int


class ListingBrief(BaseModel):
    id: uuid.UUID
    title: str
    status: str


class ReportRow(BaseModel):
    id: uuid.UUID
    target_type: str
    reason: str
    note: str | None
    status: str
    created_at: datetime
    reporter: UserBrief
    reported_user: ReportedUserBrief
    listing: ListingBrief | None
    conversation_id: uuid.UUID | None
    handled_by: str | None
    handled_at: datetime | None


class ReportStatusUpdate(BaseModel):
    status: str
    resolution_note: str | None = None


class AdminDmMessageRow(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    sender_nickname: str | None
    content: str | None
    message_type: str
    image_url: str | None
    created_at: datetime


async def _report_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    return (
        await db.execute(select(func.count()).select_from(Report).where(Report.reported_user_id == user_id))
    ).scalar_one()


async def _build_rows(db: AsyncSession, reports: list[Report]) -> list[ReportRow]:
    user_ids = {r.reporter_id for r in reports} | {r.reported_user_id for r in reports}
    users: dict[uuid.UUID, User] = {}
    if user_ids:
        users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()}

    listing_ids = {r.listing_id for r in reports if r.listing_id is not None}
    listings: dict[uuid.UUID, MarketplaceListing] = {}
    if listing_ids:
        listings = {
            listing.id: listing
            for listing in (await db.execute(select(MarketplaceListing).where(MarketplaceListing.id.in_(listing_ids))))
            .scalars()
            .all()
        }

    # 누적 피신고수 — 페이지 내 피신고 유저 대상으로 1회 그룹 집계
    reported_ids = {r.reported_user_id for r in reports}
    counts: dict[uuid.UUID, int] = {}
    if reported_ids:
        count_rows = (
            await db.execute(
                select(Report.reported_user_id, func.count())
                .where(Report.reported_user_id.in_(reported_ids))
                .group_by(Report.reported_user_id)
            )
        ).all()
        counts = {rid: cnt for rid, cnt in count_rows}

    rows: list[ReportRow] = []
    for r in reports:
        reporter = users.get(r.reporter_id)
        reported = users.get(r.reported_user_id)
        listing = listings.get(r.listing_id) if r.listing_id else None
        rows.append(
            ReportRow(
                id=r.id,
                target_type=r.target_type,
                reason=r.reason,
                note=r.note,
                status=r.status,
                created_at=r.created_at,
                reporter=UserBrief(id=r.reporter_id, nickname=reporter.nickname if reporter else None),
                reported_user=ReportedUserBrief(
                    id=r.reported_user_id,
                    nickname=reported.nickname if reported else None,
                    status=reported.status if reported else "ACTIVE",
                    report_count=counts.get(r.reported_user_id, 0),
                ),
                listing=ListingBrief(id=listing.id, title=listing.title, status=listing.status) if listing else None,
                conversation_id=r.conversation_id,
                handled_by=r.handled_by,
                handled_at=r.handled_at,
            )
        )
    return rows


async def _get_report_or_404(db: AsyncSession, report_id: uuid.UUID) -> Report:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("", response_model=Page[ReportRow])
async def list_reports(
    target_type: str | None = Query(None),
    status: str | None = Query(None),
    reported_user_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    sort: str = Query("priority", pattern="^(priority|recent)$"),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    q = select(Report)
    count_q = select(func.count()).select_from(Report)
    if target_type:
        if target_type not in _TARGET_TYPES:
            raise HTTPException(status_code=400, detail="invalid target_type")
        q = q.where(Report.target_type == target_type)
        count_q = count_q.where(Report.target_type == target_type)
    if status:
        if status not in _STATUSES:
            raise HTTPException(status_code=400, detail="invalid status")
        q = q.where(Report.status == status)
        count_q = count_q.where(Report.status == status)
    if reported_user_id is not None:
        q = q.where(Report.reported_user_id == reported_user_id)
        count_q = count_q.where(Report.reported_user_id == reported_user_id)

    total = (await db.execute(count_q)).scalar_one()
    if sort == "recent":
        order_cols = (Report.created_at.desc(), Report.id.desc())
    else:
        order_cols = (_priority_score_column().desc(), Report.id.desc())
    reports = (await db.execute(q.order_by(*order_cols).offset((page - 1) * size).limit(size))).scalars().all()
    items = await _build_rows(db, list(reports))
    return Page(items=items, total=total, page=page, size=size)


@router.get("/{report_id}")
async def get_report(
    report_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    report = await _get_report_or_404(db, report_id)
    row = (await _build_rows(db, [report]))[0]

    reported = await db.get(User, report.reported_user_id)
    sanctions = (
        (
            await db.execute(
                select(UserSanction)
                .where(UserSanction.user_id == report.reported_user_id)
                .order_by(UserSanction.created_at.desc())
                .limit(5)
            )
        )
        .scalars()
        .all()
    )
    reported_user_summary = {
        "sanctions": [
            {
                "id": s.id,
                "type": s.type,
                "reason": s.reason,
                "ends_at": s.ends_at,
                "admin_username": s.admin_username,
                "created_at": s.created_at,
            }
            for s in sanctions
        ],
        "report_count": row.reported_user.report_count,
        "manner_temp": float(reported.manner_temp) if reported else None,
        "phone_verified": reported.phone_verified_at is not None if reported else False,
    }

    listing_detail = None
    if report.target_type == "LISTING" and report.listing_id is not None:
        listing = await db.get(MarketplaceListing, report.listing_id)
        if listing is not None:
            listing_detail = {
                "id": listing.id,
                "title": listing.title,
                "description": listing.description,
                "price_vnd": listing.price_vnd,
                "status": listing.status,
                "created_at": listing.created_at,
                "image_urls": [
                    build_imgproxy_url(img.content.file_path)
                    for img in listing.images or []
                    if img.content and img.content.file_path
                ],
            }

    return {
        **row.model_dump(),
        "resolution_note": report.resolution_note,
        "reported_user_summary": reported_user_summary,
        "listing_detail": listing_detail,
    }


@router.patch("/{report_id}")
async def update_report_status(
    report_id: uuid.UUID,
    body: ReportStatusUpdate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if body.status not in {"REVIEWING", "RESOLVED", "REJECTED"}:
        raise HTTPException(status_code=400, detail="invalid status")
    report = await _get_report_or_404(db, report_id)
    if body.status not in _ALLOWED_TRANSITIONS.get(report.status, set()):
        raise HTTPException(status_code=400, detail="invalid status transition")

    prev = report.status
    report.status = body.status
    report.handled_by = session.username
    report.handled_at = datetime.now(UTC)
    if body.resolution_note is not None:
        report.resolution_note = body.resolution_note

    noti = _REPORT_RESULT_NOTI.get(body.status)
    if noti is not None:
        noti_title, noti_body = noti
        db.add(
            Notification(
                user_id=report.reporter_id,
                type="MODERATION",
                title=noti_title,
                body=noti_body,
                link=None,
                created_at=report.handled_at,
            )
        )

    await audit(db, session, request, "REPORT_STATUS", "report", str(report_id), {"from": prev, "to": body.status})
    await db.commit()
    return {
        "id": report.id,
        "status": report.status,
        "handled_by": report.handled_by,
        "handled_at": report.handled_at,
    }


@router.get("/{report_id}/dm-messages", response_model=Page[AdminDmMessageRow])
async def get_report_dm_messages(
    report_id: uuid.UUID,
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    report = await _get_report_or_404(db, report_id)
    # 신고된 대화 한정 열람 원칙 — DM 스코프 아닌 신고로는 메시지 열람 불가 (서버 강제)
    if report.conversation_id is None:
        raise HTTPException(status_code=403, detail={"code": "not_dm_scoped"})

    conv_id = report.conversation_id
    total = (
        await db.execute(select(func.count()).select_from(DmMessage).where(DmMessage.conversation_id == conv_id))
    ).scalar_one()
    msgs = (
        (
            await db.execute(
                select(DmMessage)
                .where(DmMessage.conversation_id == conv_id)
                .order_by(DmMessage.created_at.asc())
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )

    sender_ids = {m.sender_id for m in msgs}
    nicknames: dict[uuid.UUID, str | None] = {}
    if sender_ids:
        nickname_rows = (await db.execute(select(User.id, User.nickname).where(User.id.in_(sender_ids)))).all()
        nicknames = {uid: nick for uid, nick in nickname_rows}

    items = [
        AdminDmMessageRow(
            id=m.id,
            sender_id=m.sender_id,
            sender_nickname=nicknames.get(m.sender_id),
            content=m.content,
            message_type=m.message_type,
            image_url=_resolve_dm_image(m),
            created_at=m.created_at,
        )
        for m in msgs
    ]

    # 열람 감사 — 조회마다 기록
    await audit(
        db,
        session,
        request,
        "DM_VIEW",
        "conversation",
        str(conv_id),
        {"report_id": str(report_id), "conversation_id": str(conv_id), "page": page},
    )
    await db.commit()
    return Page(items=items, total=total, page=page, size=size)
