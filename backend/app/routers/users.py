import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Badge, RideSession, UserBadge, UserQuest, User
from ..schemas import BadgeOut, UserBadgeOut, UserExportResponse, UserStatsOut
from ..utils import APP_TZ

router = APIRouter(prefix="/users", tags=["유저 (Users)"])

_GRADE_SCORE = {"A": 3, "B": 2, "C": 1}


def _score_to_grade(score: float) -> str:
    if score >= 2.5:
        return "A"
    if score >= 1.5:
        return "B"
    return "C"


def _month_bounds() -> tuple[datetime, datetime]:
    """APP_TZ 기준 이번 달 시작/끝(UTC aware)을 반환."""
    now_local = datetime.now(APP_TZ)
    month_start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now_local.month == 12:
        month_end_local = month_start_local.replace(year=now_local.year + 1, month=1)
    else:
        month_end_local = month_start_local.replace(month=now_local.month + 1)
    return (
        month_start_local.astimezone(timezone.utc),
        month_end_local.astimezone(timezone.utc),
    )


async def _get_user_or_404(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# U-1
@router.get("/me/stats", response_model=UserStatsOut, summary="이번 달 누적 통계 조회")
async def get_user_stats(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(user_id, db)

    month_start, month_end = _month_bounds()
    now_local = datetime.now(APP_TZ)
    month_label = now_local.strftime("%Y-%m")

    # 이번 달 라이딩 합산
    ride_result = await db.execute(
        select(
            func.coalesce(func.sum(RideSession.distance_km), 0).label("total_km"),
        ).where(
            RideSession.user_id == user_id,
            RideSession.created_at >= month_start,
            RideSession.created_at < month_end,
        )
    )
    ride_row = ride_result.one()
    total_km = Decimal(str(ride_row.total_km))

    # 완료 퀘스트 수
    quest_result = await db.execute(
        select(func.count()).where(
            UserQuest.user_id == user_id,
            UserQuest.status == "COMPLETED",
            UserQuest.completed_at >= month_start,
            UserQuest.completed_at < month_end,
        )
    )
    quest_count = quest_result.scalar_one()

    # 평균 안전도: 등급을 점수로 변환 후 평균 → 다시 등급화
    grades_result = await db.execute(
        select(RideSession.safety_grade).where(
            RideSession.user_id == user_id,
            RideSession.safety_grade.isnot(None),
            RideSession.created_at >= month_start,
            RideSession.created_at < month_end,
        )
    )
    grades = [row[0] for row in grades_result.all()]
    if grades:
        avg_score = sum(_GRADE_SCORE.get(g, 0) for g in grades) / len(grades)
        avg_safety_grade = _score_to_grade(avg_score)
    else:
        avg_safety_grade = None

    return UserStatsOut(
        month=month_label,
        total_km=total_km,
        quest_count=quest_count,
        avg_safety_grade=avg_safety_grade,
    )


# U-3
@router.get("/me/badges", response_model=list[UserBadgeOut], summary="내 배지 목록 조회")
async def get_my_badges(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(user_id, db)

    result = await db.execute(
        select(UserBadge, Badge)
        .join(Badge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.acquired_at.desc())
    )
    rows = result.all()

    return [
        UserBadgeOut(badge=BadgeOut.model_validate(badge), acquired_at=ub.acquired_at)
        for ub, badge in rows
    ]


# A-3
@router.delete("/me", status_code=204, summary="계정 탈퇴 (hard delete)")
async def delete_account(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await _get_user_or_404(user_id, db)
    await db.delete(user)
    await db.commit()
    return Response(status_code=204)


# A-4
@router.post("/export", response_model=UserExportResponse, summary="데이터 내보내기 요청 (stub)")
async def export_user_data(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_user_or_404(user_id, db)
    return UserExportResponse(
        request_id=str(uuid.uuid4()),
        status="QUEUED",
        estimated_ready_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
