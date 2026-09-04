"""admin JSON API — 통합 신고 큐 (reports 테이블: LISTING/USER/DM).

상태머신: PENDING→REVIEWING→RESOLVED/REJECTED (PENDING→종결 직행 허용, 종결 후 역전이 400).
DM 메시지 열람은 신고된 대화(conversation_id 보유)에 한정하며 조회마다 DM_VIEW 감사로그를 남긴다.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import Float, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import DmMessage, MarketplaceListing, Notification, Report, User, UserSanction
from ...schemas import IssueResultCode, Page
from ...utils import build_imgproxy_url
from ..dm import _resolve_dm_image
from ._audit import audit

router = APIRouter(prefix="/reports")

_STATUSES = {"PENDING", "REVIEWING", "RESOLVED", "REJECTED"}
# reports.target_type CHECK(init/209) 8값과 일치시킨다 — 여기가 뒤처지면 운영자가
# "업체 신고만 보기"/"후기 신고만 보기" 같은 필터를 걸 수 없다(필터 없이는 보이므로
# 조용히 불편해지는 종류다). 새 target_type 을 추가하면 이 집합도 같이 갱신하라.
_TARGET_TYPES = {"LISTING", "USER", "DM", "POST", "COMMENT", "REVIEW", "BIZ", "GROUP_MESSAGE"}
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
# #29: STOLEN_GOODS(도난 의심 차량·서류 미비) — SEV1, FRAUD보다도 위(큐 최상단).
_REASON_PRIORITY_HOURS = {
    "STOLEN_GOODS": 480.0,
    "FRAUD": 240.0,
    "SCAM": 240.0,
    # IMPERSONATION(사칭업체, 199 소비자→업체 신고) — 016 §8-2 P-IMPERSONATE 가 SEV1 로 지정한
    # 시나리오라 FRAUD/SCAM 과 동일 가중치.
    "IMPERSONATION": 240.0,
    "SEXUAL": 192.0,
    "HEALTH_SAFETY": 192.0,  # 위생·안전(199) — 소비자 안전 직결이라 SEXUAL 과 동일 가중치
    "ABUSE": 168.0,
    "PROHIBITED": 144.0,
    "FALSE_ADVERTISING": 144.0,  # 허위광고(199) — PROHIBITED 와 동일 가중치
    "OTHER": 72.0,
    "PRICE_MISMATCH": 96.0,  # 표시가격 상이(199)
    "POOR_SERVICE": 48.0,  # 서비스 불량(199) — 사실관계 다툼 소지가 커 우선순위 낮게
    "DUPLICATE": 48.0,
    "SPAM": 24.0,
}
_DEFAULT_REASON_PRIORITY_HOURS = 72.0
_RESULT_CODES = {c.value for c in IssueResultCode}

# 016 §8-3: "SEV1~4를 #3 가중치에 병합 — 신규 코드 아님". 새 컬럼을 만들지 않고 기존
# _REASON_PRIORITY_HOURS 순서를 그대로 SEV1~4 라벨로 매핑해 큐 표시·주간 집계에 재사용한다.
_REASON_SEVERITY = {
    "STOLEN_GOODS": "SEV1",
    "FRAUD": "SEV1",
    "SCAM": "SEV1",
    "IMPERSONATION": "SEV1",  # 199 — 016 §8-2 P-IMPERSONATE(사칭 업체) SEV1 그대로 반영
    "SEXUAL": "SEV2",
    "HEALTH_SAFETY": "SEV2",  # 199 위생·안전
    "ABUSE": "SEV2",
    "PROHIBITED": "SEV3",
    "FALSE_ADVERTISING": "SEV3",  # 199 허위광고
    "OTHER": "SEV3",
    "PRICE_MISMATCH": "SEV3",  # 199 표시가격 상이
    "DUPLICATE": "SEV4",
    "POOR_SERVICE": "SEV4",  # 199 서비스 불량
    "SPAM": "SEV4",
}
_DEFAULT_REASON_SEVERITY = "SEV3"

# R-5(017 §12-B): 신고자별 기각률 — 표본이 적으면 기각률이 우연히 튀므로(신고 2건 중 1건 기각
# → 50%는 무의미) listing_risk.py의 PRICE_ANOMALY_MIN_CATEGORY_SAMPLE(카테고리 표본 20건 미만이면
# 신호를 아예 0으로 두는 것, 016 §4-4)과 같은 논리로 최소 표본 미만이면 rejection_rate를 null로
# 반환한다(가짜 숫자 금지). 분모는 처리 완료(RESOLVED+REJECTED)만 — PENDING/REVIEWING은 아직
# 판정 전이라 분모에 넣으면 최근 신고가 몰린 사용자의 기각률이 인위적으로 낮아진다.
REPORTER_TRUST_MIN_SAMPLE = 5


def reason_severity(reason: str) -> str:
    return _REASON_SEVERITY.get(reason, _DEFAULT_REASON_SEVERITY)


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
    severity: str
    note: str | None
    status: str
    created_at: datetime
    reporter: UserBrief
    reported_user: ReportedUserBrief
    listing: ListingBrief | None
    conversation_id: uuid.UUID | None
    handled_by: str | None
    handled_at: datetime | None
    result_code: str | None = None
    assignee_username: str | None = None


class ReportStatusUpdate(BaseModel):
    status: str
    resolution_note: str | None = None
    result_code: str | None = None
    # R-2(260819 W3) — resolution_note(내부 메모)와 분리된 신고자 공개용 요약 사유.
    # 비어있으면 저장하지 않고 _REPORT_RESULT_NOTI 고정 문구로 폴백(회귀 금지).
    public_resolution_summary: str | None = None


class AssigneeUpdate(BaseModel):
    assignee_username: str | None = None


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
                severity=reason_severity(r.reason),
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
                result_code=r.result_code,
                assignee_username=r.assignee_username,
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
    sort: str | None = Query(None, pattern="^(priority|recent)$"),
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
    # 지적 #9: 종결(RESOLVED/REJECTED) 조회는 처리 이력이라 최신순이 자연스럽다 — 우선순위 점수는
    # 대기시간이 지배해 오래된 건이 위로 오는 역전이 생긴다. 미처리 큐(PENDING/REVIEWING 등)는
    # 종전대로 우선순위 정렬. sort 를 명시하면 그 값이 항상 우선한다(기본값 선택 규칙만 변경).
    effective_sort = sort or ("recent" if status in ("RESOLVED", "REJECTED") else "priority")
    if effective_sort == "recent":
        order_cols = (Report.created_at.desc(), Report.id.desc())
    else:
        order_cols = (_priority_score_column().desc(), Report.id.desc())
    reports = (await db.execute(q.order_by(*order_cols).offset((page - 1) * size).limit(size))).scalars().all()
    items = await _build_rows(db, list(reports))
    return Page(items=items, total=total, page=page, size=size)


class ReporterTrustRow(BaseModel):
    reporter_id: uuid.UUID
    reporter_nickname: str | None
    total_reports: int
    resolved_count: int
    rejected_count: int
    cancelled_count: int  # R-3(017 §12-B): 취소 반복자 추적 — 판정이 아니므로 rejection_rate 분모에서 제외
    rejection_rate: float | None  # 표본(REPORTER_TRUST_MIN_SAMPLE) 미달 시 null — 가짜 숫자 금지
    last_reported_at: datetime


@router.get("/reporters", response_model=Page[ReporterTrustRow])
async def list_reporter_trust(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """R-5(017 §12-B): 신고자별 기각률 조회 전용 — 010 #3 검수 큐 정렬 가중치 참고용.

    🔴 M1(탐지≠검사 차단): 이 응답은 조회 전용이며 어떤 쓰기·제재·접수차단에도 쓰이지 않는다.
    기각률이 높다고 신고 접수를 막지 않는다(016 A2 대칭 — 오탐 1건 = 공급 1건 손실).
    """
    decided = Report.status.in_(("RESOLVED", "REJECTED"))
    resolved_case = case((Report.status == "RESOLVED", 1), else_=0)
    rejected_case = case((Report.status == "REJECTED", 1), else_=0)
    cancelled_case = case((Report.status == "CANCELLED", 1), else_=0)
    decided_case = case((decided, 1), else_=0)

    agg_q = (
        select(
            Report.reporter_id,
            func.count().label("total_reports"),
            func.sum(resolved_case).label("resolved_count"),
            func.sum(rejected_case).label("rejected_count"),
            func.sum(cancelled_case).label("cancelled_count"),
            func.sum(decided_case).label("decided_count"),
            func.max(Report.created_at).label("last_reported_at"),
        )
        .group_by(Report.reporter_id)
        .subquery()
    )

    total = (await db.execute(select(func.count()).select_from(agg_q))).scalar_one()

    rows = (
        await db.execute(
            select(agg_q)
            .order_by(
                # 기각률 내림차순: decided_count=0 이면 나눗셈 회피(0으로 취급) 후 null 로 뒤집는다.
                case(
                    (agg_q.c.decided_count > 0, cast(agg_q.c.rejected_count, Float) / agg_q.c.decided_count),
                    else_=-1,
                ).desc(),
                agg_q.c.reporter_id,
            )
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()

    reporter_ids = {r.reporter_id for r in rows}
    nicknames: dict[uuid.UUID, str | None] = {}
    if reporter_ids:
        nickname_rows = (await db.execute(select(User.id, User.nickname).where(User.id.in_(reporter_ids)))).all()
        nicknames = {uid: nick for uid, nick in nickname_rows}

    items = [
        ReporterTrustRow(
            reporter_id=r.reporter_id,
            reporter_nickname=nicknames.get(r.reporter_id),
            total_reports=r.total_reports,
            resolved_count=r.resolved_count,
            rejected_count=r.rejected_count,
            cancelled_count=r.cancelled_count,
            rejection_rate=(r.rejected_count / r.decided_count)
            if r.decided_count >= REPORTER_TRUST_MIN_SAMPLE
            else None,
            last_reported_at=r.last_reported_at,
        )
        for r in rows
    ]
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
        # R-2(260819 W3) — 어드민이 종결 시 입력할 공개용 요약(재편집 시 프리필용).
        "public_resolution_summary": report.public_resolution_summary,
        "reported_user_summary": reported_user_summary,
        "listing_detail": listing_detail,
        # 대상 식별자 노출(2026-08-18) — listing 은 위 listing_detail 로 이미 나가지만
        # REVIEW/BIZ 는 대응 필드가 없어 **어드민이 조치 대상을 특정할 수 없었다**
        # (후기 신고를 열어도 review_id 를 몰라 운영자가 손으로 입력해야 했다).
        # 상세 객체까지 만들지 않고 id 만 흘려보낸다 — 후기 원문·신고내역은
        # GET /admin/api/reviews/{id} 가 이미 함께 준다(중복 조회 방지).
        "review_id": report.review_id,
        "business_profile_id": report.business_profile_id,
        # 신고 코멘트 + 사진 첨부(197, 대표 지적 2026-08-18) — note 는 이미 row 에 포함, 사진만 추가.
        "report_images": [
            build_imgproxy_url(img.content.file_path)
            for img in report.images or []
            if img.content and img.content.file_path
        ],
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

    # #26 B4: 결과 코드 없이 종결 불가 — RESOLVED/REJECTED 전이 시 result_code 필수.
    if body.status in ("RESOLVED", "REJECTED"):
        result_code = body.result_code if body.result_code is not None else getattr(report, "result_code", None)
        if result_code is None:
            raise HTTPException(
                status_code=422,
                detail={"code": "result_code_required", "message": "종결 전 result_code 입력이 필요합니다."},
            )
        if result_code not in _RESULT_CODES:
            raise HTTPException(status_code=400, detail="invalid result_code")

    prev = report.status
    report.status = body.status
    report.handled_by = session.username
    report.handled_at = datetime.now(UTC)
    if body.resolution_note is not None:
        report.resolution_note = body.resolution_note
    if body.result_code is not None:
        report.result_code = body.result_code
    if body.public_resolution_summary is not None and body.status in ("RESOLVED", "REJECTED"):
        # F1-2: 종결 전이(RESOLVED/REJECTED)일 때만 저장 — REVIEWING 등 미확정 전이에 실려 오면
        # 신고자에게 확정 전 초안이 노출되므로(support.py get 이 그대로 반환) 조용히 무시한다.
        # 공백-only 도 None 처리(strip) — 안 하면 알림 body 에 "사유:    " 꼬리가 남는다.
        report.public_resolution_summary = body.public_resolution_summary.strip() or None

    noti = _REPORT_RESULT_NOTI.get(body.status)
    if noti is not None:
        noti_title, noti_base_body = noti
        # R-2(260819 W3): reviews.py moderate_review 의 "사유: {reason}" 통보 패턴을 미러링.
        # 공개용 요약이 비어있으면 고정 문구로 폴백(기존 동작 회귀 금지) — resolution_note
        # 원본은 여기서 전혀 참조하지 않는다.
        summary = report.public_resolution_summary
        noti_body = f"{noti_base_body} 사유: {summary}" if summary else noti_base_body
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


@router.patch("/{report_id}/assignee")
async def assign_report(
    report_id: uuid.UUID,
    body: AssigneeUpdate,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """담당자 배정(P2). 자동배정·알림 없음 — 누가 볼 것인가만 기록. handled_by(종결 처리자)와 별개."""
    report = await _get_report_or_404(db, report_id)

    prev = report.assignee_username
    new_value = (body.assignee_username or "").strip() or None
    report.assignee_username = new_value

    await audit(db, session, request, "REPORT_ASSIGN", "report", str(report_id), {"from": prev, "to": new_value})
    await db.commit()
    return {"id": report.id, "assignee_username": report.assignee_username}


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
