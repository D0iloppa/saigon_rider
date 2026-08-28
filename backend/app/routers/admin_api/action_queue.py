"""admin JSON API — 오늘의 조치 큐 (신고/문의/파트너승인/광고승인/완료요청/제보 6종 통합 요약).

각 대기열의 실제 조회(쿼리·정렬)는 이 파일에서 새로 작성하지 않는다 — 이미
reports.py/support.py/biz.py/trades.py/map/submissions.py 에 있는 엔드포인트 함수를
그대로 import 해서 호출한다. FastAPI 의 `@router.get(...)` 데코레이터는 함수 자체를
감싸지 않고 라우팅 테이블에 등록만 하므로, 그 함수들은 평범한 async 함수로 그대로
재사용 가능하다(Query/Depends 파라미터는 여기서 실제 값을 넘겨 호출하므로 FastAPI
요청 파이프라인 없이도 그대로 동작한다). 이 파일은 그 결과를 한 응답으로 묶기만 한다
(요약 — 전체 목록 재구현 아님).

각 6종의 "미해결" 정의:
- 신고: PENDING + REVIEWING (RESOLVED/REJECTED 는 종결)
- 문의: OPEN + IN_PROGRESS (RESOLVED 는 종결)
- 파트너 계정 승인: PENDING
- 광고 소재 승인: PENDING
- 거래 완료 이의: state="all" (트레이드 라우터 정의상 ACCEPTED 인 것만 — 이미 완료/취소 제외)
- 제보(장소/주유소/정비소 3종): 각각 PENDING, 하나의 섹션으로 합산
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from .biz import list_biz_accounts, list_biz_ads
from .map.submissions import list_gas_submissions, list_place_suggestions, list_repair_submissions
from .reports import list_reports
from .support import list_tickets
from .trades import list_completion_requests

router = APIRouter(prefix="/action-queue")

_PREVIEW_SIZE = 5


class QueueItem(BaseModel):
    id: str
    title: str
    subtitle: str | None
    created_at: datetime
    route: str


class QueueSection(BaseModel):
    key: str
    label: str
    count: int
    items: list[QueueItem]


class ActionQueueSummary(BaseModel):
    sections: list[QueueSection]


async def _report_section(session: AdminSession, db: AsyncSession) -> QueueSection:
    pending = await list_reports(
        target_type=None,
        status="PENDING",
        reported_user_id=None,
        page=1,
        size=_PREVIEW_SIZE,
        sort="priority",
        _session=session,
        db=db,
    )
    reviewing = await list_reports(
        target_type=None,
        status="REVIEWING",
        reported_user_id=None,
        page=1,
        size=_PREVIEW_SIZE,
        sort="priority",
        _session=session,
        db=db,
    )
    merged = sorted(pending.items + reviewing.items, key=lambda r: r.created_at)[:_PREVIEW_SIZE]
    items = [
        QueueItem(
            id=str(r.id),
            title=r.reason,
            subtitle=f"{r.target_type} · {r.status}",
            created_at=r.created_at,
            route=f"/reports/{r.id}",
        )
        for r in merged
    ]
    return QueueSection(key="report", label="신고", count=pending.total + reviewing.total, items=items)


async def _ticket_section(session: AdminSession, db: AsyncSession) -> QueueSection:
    open_page = await list_tickets(status="OPEN", source=None, page=1, size=_PREVIEW_SIZE, _session=session, db=db)
    progress_page = await list_tickets(
        status="IN_PROGRESS", source=None, page=1, size=_PREVIEW_SIZE, _session=session, db=db
    )
    merged = sorted(open_page.items + progress_page.items, key=lambda t: t.created_at)[:_PREVIEW_SIZE]
    items = [
        QueueItem(
            id=str(t.id),
            title=t.title,
            subtitle=f"{t.category or 'UNCLASSIFIED'} · {t.status}",
            created_at=t.created_at,
            route=f"/support/{t.id}",
        )
        for t in merged
    ]
    return QueueSection(key="ticket", label="문의", count=open_page.total + progress_page.total, items=items)


async def _biz_account_section(session: AdminSession, db: AsyncSession) -> QueueSection:
    rows = await list_biz_accounts(status="PENDING", _session=session, db=db)
    items = [
        QueueItem(
            id=str(r.id),
            title=r.name,
            subtitle=r.category,
            created_at=r.created_at,
            route=f"/biz/accounts/{r.id}",
        )
        for r in rows[:_PREVIEW_SIZE]
    ]
    return QueueSection(key="biz_account", label="파트너승인", count=len(rows), items=items)


async def _biz_ad_section(session: AdminSession, db: AsyncSession) -> QueueSection:
    rows = await list_biz_ads(status="PENDING", profile_id=None, launching=None, _session=session, db=db)
    items = [
        QueueItem(
            id=str(r.id),
            title=r.title,
            subtitle=r.partner_name,
            created_at=r.created_at,
            route=f"/biz/ads/{r.id}",
        )
        for r in rows[:_PREVIEW_SIZE]
    ]
    return QueueSection(key="biz_ad", label="광고승인", count=len(rows), items=items)


async def _completion_request_section(session: AdminSession, db: AsyncSession) -> QueueSection:
    page = await list_completion_requests(
        state="all", min_pending_hours=0, page=1, size=_PREVIEW_SIZE, _session=session, db=db
    )
    items = [
        QueueItem(
            id=str(r.appointment_id),
            title=r.listing_title,
            subtitle=f"대기 {r.pending_hours}h",
            created_at=r.completion_requested_at,
            route="/trades/completion-requests",
        )
        for r in page.items
    ]
    return QueueSection(key="trade_completion", label="완료요청", count=page.total, items=items)


async def _field_report_section(session: AdminSession, db: AsyncSession) -> QueueSection:
    places = await list_place_suggestions(status="PENDING", _session=session, db=db)
    gas = await list_gas_submissions(status="PENDING", _session=session, db=db)
    repairs = await list_repair_submissions(status="PENDING", _session=session, db=db)

    candidates = (
        [
            (
                p.created_at,
                QueueItem(
                    id=str(p.id),
                    title=p.name,
                    subtitle="장소 제보",
                    created_at=p.created_at,
                    route="/map/place-suggestions",
                ),
            )
            for p in places
        ]
        + [
            (
                g.created_at,
                QueueItem(
                    id=str(g.submission_id),
                    title=g.name,
                    subtitle="주유소 제보",
                    created_at=g.created_at,
                    route="/map/gas-submissions",
                ),
            )
            for g in gas
        ]
        + [
            (
                rp.created_at,
                QueueItem(
                    id=str(rp.submission_id),
                    title=rp.name,
                    subtitle="정비소 제보",
                    created_at=rp.created_at,
                    route="/map/repair-submissions",
                ),
            )
            for rp in repairs
        ]
    )
    candidates.sort(key=lambda c: c[0])
    items = [item for _, item in candidates[:_PREVIEW_SIZE]]
    return QueueSection(key="field_report", label="제보", count=len(places) + len(gas) + len(repairs), items=items)


@router.get("/summary", response_model=ActionQueueSummary, summary="오늘의 조치 큐 — 6종 대기열 요약")
async def get_action_queue_summary(
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    sections = [
        await _report_section(session, db),
        await _ticket_section(session, db),
        await _biz_account_section(session, db),
        await _biz_ad_section(session, db),
        await _completion_request_section(session, db),
        await _field_report_section(session, db),
    ]
    return ActionQueueSummary(sections=sections)
