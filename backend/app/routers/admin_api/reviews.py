"""admin JSON API — 업체 후기 모더레이션 (HIDE/RESTORE).

대표 지적(2026-08-18): 업체가 정당한 1점 후기를 "악성리뷰"로 신고해도 운영자가 실제로
조치할 수단이 없었다(business_review 에 숨김/상태 컬럼 자체가 없었음). admin_api/listings.py
의 _apply_moderation 과 같은 원리 — 신고는 큐에 적재만(M1, 탐지≠차단), 숨김은 운영자가
명시적으로 조치할 때만 일어난다. 조치 시 작성자에게 사유 포함 인앱 통보 + 감사로그 기록을
단일 트랜잭션으로 커밋한다.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import BusinessReview, Notification, Report, User
from ._audit import audit

router = APIRouter(prefix="/reviews")

_MODERATE_ACTIONS = {"HIDE", "RESTORE"}
# O-1(260827) — 사장님 노출용 사유 코드. 신고 사유(BizReviewReportReason, frontend/src/api/biz.ts)와
# 동일 코드셋 재사용. 원문(reason, 자유텍스트)은 계속 admin 전용으로만 저장·노출한다.
_HIDDEN_REASON_CODES = {"SPAM", "ABUSE", "INAPPROPRIATE", "OTHER"}


class ReviewModerateRequest(BaseModel):
    action: str
    reason: str
    reason_code: str | None = None
    report_id: uuid.UUID | None = None


@router.get("/{review_id}")
async def get_review(
    review_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    review = await db.get(BusinessReview, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")

    reports = (
        (await db.execute(select(Report).where(Report.review_id == review_id).order_by(Report.created_at.desc())))
        .scalars()
        .all()
    )
    reporter_ids = {r.reporter_id for r in reports}
    nicknames: dict[uuid.UUID, str | None] = {}
    if reporter_ids:
        nickname_rows = (await db.execute(select(User.id, User.nickname).where(User.id.in_(reporter_ids)))).all()
        nicknames = {uid: nick for uid, nick in nickname_rows}

    return {
        "id": review.id,
        "profile_id": review.profile_id,
        "user_id": review.user_id,
        "rating": review.rating,
        "body": review.body,
        "owner_reply": review.owner_reply,
        "owner_replied_at": review.owner_replied_at,
        "created_at": review.created_at,
        "hidden_at": review.hidden_at,
        "hidden_reason": review.hidden_reason,
        "hidden_reason_code": review.hidden_reason_code,
        "hidden_by": review.hidden_by,
        "reports": [
            {
                "id": r.id,
                "reporter": {"id": r.reporter_id, "nickname": nicknames.get(r.reporter_id)},
                "reason": r.reason,
                "note": r.note,
                "status": r.status,
                "created_at": r.created_at,
            }
            for r in reports
        ],
    }


@router.post("/{review_id}/moderate")
async def moderate_review(
    review_id: uuid.UUID,
    body: ReviewModerateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if body.action not in _MODERATE_ACTIONS:
        raise HTTPException(status_code=400, detail="invalid action")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if body.report_id is not None and await db.get(Report, body.report_id) is None:
        raise HTTPException(status_code=400, detail="report not found")

    review = await db.get(BusinessReview, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")

    now = datetime.now(UTC)
    reason = body.reason.strip()

    if body.action == "HIDE":
        review.hidden_at = now
        review.hidden_reason = reason
        review.hidden_reason_code = body.reason_code if body.reason_code in _HIDDEN_REASON_CODES else "OTHER"
        review.hidden_by = session.username
        noti_title = "후기 비공개 처리 안내"
    else:  # RESTORE — S-APPEAL 이의제기가 인용된 경우도 이 경로로 처리(별도 경로 없음)
        review.hidden_at = None
        review.hidden_reason = None
        review.hidden_reason_code = None
        review.hidden_by = None
        noti_title = "후기 공개 복원 안내"

    # 후기 작성자 통보 — 조치 사유를 반드시 포함(이의제기가 성립하려면 왜 내려갔는지 알아야 한다)
    db.add(
        Notification(
            user_id=review.user_id,
            type="MODERATION",
            title=noti_title,
            body=f"작성하신 후기가 운영정책에 따라 처리되었습니다. 사유: {reason}",
            link=f"biz&id={review.profile_id}",
            created_at=now,
        )
    )
    await audit(
        db,
        session,
        request,
        f"REVIEW_{body.action}",
        "review",
        str(review_id),
        {
            "reason": reason,
            "reason_code": review.hidden_reason_code,
            "report_id": str(body.report_id) if body.report_id else None,
        },
    )
    await db.commit()
    return {
        "id": review.id,
        "hidden_at": review.hidden_at,
        "hidden_reason": review.hidden_reason,
        "hidden_reason_code": review.hidden_reason_code,
    }
