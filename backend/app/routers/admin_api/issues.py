"""admin JSON API — 통합 이슈 큐 (013/016 §8 L5, #25 통합 인테이크 · #26 사고 유형·결과 코드).

D-27=(a): 신규 incident 테이블을 만들지 않고, reports(신고)와 support_tickets(문의·외부 수기
등록·업체 채널)를 이 계층에서 애플리케이션 레벨 UNION 으로 병합한다. 현 운영 규모(0.5~2인,
저볼륨)에서는 DB VIEW/UNION SQL 보다 두 쿼리를 각각 우선순위 정렬해 가져온 뒤 파이썬에서
병합하는 편이 더 단순하다(카파시 원칙 — Simplicity First). 규모가 커지면 재검토.

완료 검증 조건(016 §9 #25): 신고·티켓·수기 등록 건이 하나의 큐에 심각도 순으로 정렬되어
표시되고 source 로 필터된다.
완료 검증 조건(#26): "최근 7일 유형별 건수·중위 처리시간"이 어드민에서 표시된다.
"""

import statistics
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import Report, SupportTicket
from .reports import _priority_score as _report_priority_score
from .reports import reason_severity

router = APIRouter(prefix="/issues")

_SOURCES = {"REPORT", "APP", "BIZ", "EXTERNAL"}
_SEVERITY_RANK = {"SEV1": 0, "SEV2": 1, "SEV3": 2, "SEV4": 3}


class IssueRow(BaseModel):
    kind: str  # "REPORT" | "TICKET"
    id: uuid.UUID
    source: str  # REPORT 는 신고 버튼 유입이라 source="REPORT" 고정, 티켓은 APP/BIZ/EXTERNAL
    persona: str | None
    category: str  # 신고는 reason, 티켓은 category(미분류면 null 대체 문자열)
    severity: str
    status: str
    created_at: datetime
    title: str | None
    priority_score: float
    assignee_username: str | None


def _ticket_severity(t: SupportTicket) -> str:
    return t.severity or "SEV3"


async def _fetch_report_rows(
    db: AsyncSession, limit: int, assignee_username: str | None, unassigned: bool
) -> list[IssueRow]:
    q = select(Report)
    if unassigned:
        q = q.where(Report.assignee_username.is_(None))
    elif assignee_username is not None:
        q = q.where(Report.assignee_username == assignee_username)
    reports = (await db.execute(q.order_by(Report.created_at.desc()).limit(limit))).scalars().all()
    now = datetime.now(UTC)
    return [
        IssueRow(
            kind="REPORT",
            id=r.id,
            source="REPORT",
            persona=None,
            category=r.reason,
            severity=reason_severity(r.reason),
            status=r.status,
            created_at=r.created_at,
            title=None,
            priority_score=_report_priority_score(r.reason, r.created_at, now=now),
            assignee_username=r.assignee_username,
        )
        for r in reports
    ]


async def _fetch_ticket_rows(
    db: AsyncSession, limit: int, assignee_username: str | None, unassigned: bool
) -> list[IssueRow]:
    q = select(SupportTicket)
    if unassigned:
        q = q.where(SupportTicket.assignee_username.is_(None))
    elif assignee_username is not None:
        q = q.where(SupportTicket.assignee_username == assignee_username)
    tickets = (await db.execute(q.order_by(SupportTicket.created_at.desc()).limit(limit))).scalars().all()
    now = datetime.now(UTC)
    rows = []
    for t in tickets:
        severity = _ticket_severity(t)
        wait_hours = (now - t.created_at).total_seconds() / 3600.0
        # reports 와 동일한 정렬 단위(시간 오프셋 + 대기시간)로 맞춘다 — SEV1이 항상 최상단.
        offset_hours = {"SEV1": 480.0, "SEV2": 240.0, "SEV3": 72.0, "SEV4": 24.0}[severity]
        rows.append(
            IssueRow(
                kind="TICKET",
                id=t.id,
                source=t.source,
                persona=t.persona,
                category=t.category or "UNCLASSIFIED",
                severity=severity,
                status=t.status,
                created_at=t.created_at,
                title=t.title,
                priority_score=offset_hours + wait_hours,
                assignee_username=t.assignee_username,
            )
        )
    return rows


@router.get("", response_model=list[IssueRow])
async def list_issues(
    source: str | None = Query(None),
    assignee: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """#25 통합 큐 — reports + support_tickets 를 심각도(대기시간 병합 점수) 순으로 병합 정렬."""
    if source is not None and source not in _SOURCES:
        raise HTTPException(status_code=400, detail="invalid source")

    # 지적 6: assignee 필터는 fetch 이후 파이썬이 아니라 DB 쿼리(WHERE)에서 적용한다 — 좁은 필터에서
    # fetch_limit 을 넘는 매칭 행이 잘려나가 under-fill 되는 것을 막는다. "me"는 호출 시점 username 으로
    # 치환, "unassigned"는 IS NULL 로 변환. source 필터는 기존대로 파이썬 레벨 유지(이번 범위 밖).
    unassigned = assignee == "unassigned"
    assignee_username = None
    if assignee and not unassigned:
        assignee_username = session.username if assignee == "me" else assignee

    # 병합 전 후보군을 넉넉히 가져와 정렬 후 자른다(현 규모에서는 limit*4 정도로도 충분).
    fetch_limit = max(limit * 4, 200)
    rows: list[IssueRow] = []
    if source is None or source == "REPORT":
        rows += await _fetch_report_rows(db, fetch_limit, assignee_username, unassigned)
    if source is None or source in {"APP", "BIZ", "EXTERNAL"}:
        ticket_rows = await _fetch_ticket_rows(db, fetch_limit, assignee_username, unassigned)
        if source is not None:
            ticket_rows = [r for r in ticket_rows if r.source == source]
        rows += ticket_rows

    rows.sort(key=lambda r: r.priority_score, reverse=True)
    return rows[:limit]


class CategoryStat(BaseModel):
    category: str
    count: int
    median_resolution_hours: float | None


@router.get("/weekly-summary", response_model=list[CategoryStat])
async def weekly_summary(
    days: int = Query(7, ge=1, le=30),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """#26 — 최근 N일(기본 7일) 유형별 건수·중위 처리시간. 학습 단계(013 §3) 유일한 원료."""
    since = datetime.now(UTC) - timedelta(days=days)

    reports = (await db.execute(select(Report).where(Report.created_at >= since))).scalars().all()
    tickets = (await db.execute(select(SupportTicket).where(SupportTicket.created_at >= since))).scalars().all()

    buckets: dict[str, list[tuple[datetime, datetime | None]]] = {}
    for r in reports:
        buckets.setdefault(r.reason, []).append((r.created_at, r.handled_at))
    for t in tickets:
        category = t.category or "UNCLASSIFIED"
        resolved_at = t.updated_at if t.status == "RESOLVED" else None
        buckets.setdefault(category, []).append((t.created_at, resolved_at))

    stats: list[CategoryStat] = []
    for category, entries in buckets.items():
        resolution_hours = [
            (resolved - created).total_seconds() / 3600.0 for created, resolved in entries if resolved is not None
        ]
        stats.append(
            CategoryStat(
                category=category,
                count=len(entries),
                median_resolution_hours=statistics.median(resolution_hours) if resolution_hours else None,
            )
        )
    stats.sort(key=lambda s: s.count, reverse=True)
    return stats
