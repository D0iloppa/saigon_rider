import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Badge, RideSession, User, UserBadge, UserFollow, UserQuest
from ..schemas import BadgeOut, FollowUserOut, UserBadgeOut, UserExportResponse, UserProfileOut, UserStatsOut
from ..utils import APP_TZ, resolve_avatar_url

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
        month_start_local.astimezone(UTC),
        month_end_local.astimezone(UTC),
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

    return [UserBadgeOut(badge=BadgeOut.model_validate(badge), acquired_at=ub.acquired_at) for ub, badge in rows]


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
        estimated_ready_at=datetime.now(UTC) + timedelta(hours=24),
    )


@router.get("/{user_id}/profile", response_model=UserProfileOut, summary="타유저 공개 프로필 조회")
async def get_user_profile(
    user_id: uuid.UUID,
    requester_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(user_id, db)

    follower_count = (
        await db.execute(select(func.count()).select_from(UserFollow).where(UserFollow.following_id == user_id))
    ).scalar_one()
    following_count = (
        await db.execute(select(func.count()).select_from(UserFollow).where(UserFollow.follower_id == user_id))
    ).scalar_one()

    is_following = False
    if requester_id and requester_id != user_id:
        existing = await db.get(UserFollow, {"follower_id": requester_id, "following_id": user_id})
        is_following = existing is not None

    rider_style = user.rider_type.slug if user.rider_type else None

    return UserProfileOut(
        id=user.id,
        nickname=user.nickname,
        avatar_url=resolve_avatar_url(user),
        level=user.level,
        rider_style=rider_style,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
    )


@router.get("/search", response_model=list[FollowUserOut], summary="유저 검색 (닉네임 또는 전화번호)")
async def search_users(
    query: str,
    db: AsyncSession = Depends(get_db),
):
    if not query or len(query.strip()) < 2:
        return []

    query = query.strip()
    result = await db.execute(
        select(User).where((User.nickname.ilike(f"%{query}%")) | (User.phone.ilike(f"%{query}%"))).limit(20)
    )
    rows = result.scalars().all()

    return [
        FollowUserOut(
            id=u.id,
            nickname=u.nickname,
            avatar_url=resolve_avatar_url(u),
            level=u.level,
        )
        for u in rows
    ]
