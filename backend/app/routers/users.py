import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..engine_client import engine_client
from ..models import Badge, Quest, RideSession, User, UserBadge, UserFollow, UserQuest
from ..schemas import (
    BadgeOut,
    FollowUserOut,
    Page,
    QuestHistoryOut,
    UserBadgeOut,
    UserOut,
    UserProfileOut,
    UserStatsOut,
)
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


# SGR-209 A3: 스킬 키 → users 컬럼
_SKILL_COLUMN = {
    "distance_rider": "skill_distance_rider",
    "gold_hunter": "skill_gold_hunter",
    "quest_slot": "skill_quest_slot",
    "cost_discount": "skill_cost_discount",
}


@router.post("/me/skills/{skill_key}/invest", response_model=UserOut, summary="스킬 투자 (SP 1 차감, 서브포인트 +1)")
async def invest_skill(
    skill_key: str,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    # SGR-280: 스킬은 0~9 서브포인트, 단계 = //3. 클릭당 SP 1 차감·서브포인트 +1 (한 단계 = 3 SP).
    col = _SKILL_COLUMN.get(skill_key)
    if col is None:
        raise HTTPException(status_code=422, detail="invalid skill_key")
    user = await _get_user_or_404(user_id, db)
    if user.skill_pt < 1:
        raise HTTPException(status_code=409, detail="insufficient skill points")
    if getattr(user, col) >= 9:
        raise HTTPException(status_code=409, detail="skill at max level")
    user.skill_pt -= 1
    setattr(user, col, getattr(user, col) + 1)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


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

    # GPS 마일리지: 이번 달(total_km) + 평생 누적(lifetime_km) 둘 다 Engine 에서 조회
    try:
        mileage = await engine_client.get_mileage(str(user_id), since=month_start.isoformat())
        period_m = int(mileage.get("period_distance_m", 0))
        lifetime_m = int(mileage.get("total_distance_m", 0))
    except Exception:
        period_m = 0
        lifetime_m = 0
    total_km = Decimal(period_m) / Decimal(1000)
    lifetime_km = Decimal(lifetime_m) / Decimal(1000)

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
        lifetime_km=lifetime_km,
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


@router.get("/me/quest-history", response_model=Page[QuestHistoryOut], summary="퀘스트 완료 이력")
async def get_quest_history(
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(user_id, db)
    offset = (page - 1) * size

    base_filter = [
        UserQuest.user_id == user_id,
        UserQuest.status == "COMPLETED",
    ]

    total_result = await db.execute(select(func.count()).where(*base_filter))
    total = total_result.scalar_one()

    rows = (
        await db.execute(
            select(UserQuest, Quest, RideSession)
            .join(Quest, UserQuest.quest_id == Quest.id)
            .outerjoin(
                RideSession,
                (RideSession.user_quest_id == UserQuest.id) & (RideSession.is_success == True),
            )
            .where(*base_filter)
            .order_by(UserQuest.completed_at.desc())
            .offset(offset)
            .limit(size)
        )
    ).all()

    items = []
    for uq, quest, ride in rows:
        items.append(
            QuestHistoryOut(
                id=uq.id,
                quest_id=quest.id,
                quest_title=quest.title_ko or quest.title_en or quest.title_vi,
                distance_km=ride.distance_km if ride else None,
                safety_grade=ride.safety_grade if ride else None,
                reward_exp=quest.reward_exp,
                reward_gold=quest.reward_gold,
                completed_at=uq.completed_at,
            )
        )

    return Page(items=items, total=total, page=page, size=size)


# A-3
@router.delete("/me", status_code=204, summary="계정 탈퇴 (논리 삭제)")
async def delete_account(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await _get_user_or_404(user_id, db)
    now = datetime.now(UTC)
    user.deleted_at = now
    ts_hex = f"{int(now.timestamp()):x}"
    user.phone = f"del_{ts_hex}"
    if user.nickname:
        user.nickname = f"del_{ts_hex}"
    user.passcode_hash = None
    await db.commit()
    return Response(status_code=204)


# A-4
@router.get("/me/export", summary="내 데이터 JSON 다운로드")
async def export_user_data(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await _get_user_or_404(user_id, db)

    rides_result = await db.execute(
        select(RideSession).where(RideSession.user_id == user_id).order_by(RideSession.created_at.desc())
    )
    rides = [
        {
            "date": r.created_at.isoformat(),
            "distance_km": float(r.distance_km),
            "duration_sec": r.duration_sec,
            "avg_speed_kmh": float(r.avg_speed_kmh) if r.avg_speed_kmh else None,
            "safety_grade": r.safety_grade,
            "reward_exp": r.reward_exp,
            "reward_gold": r.reward_gold,
        }
        for r in rides_result.scalars()
    ]

    quests_result = await db.execute(
        select(UserQuest).where(UserQuest.user_id == user_id).order_by(UserQuest.accepted_at.desc())
    )
    quests = [
        {
            "quest_id": str(q.quest_id),
            "status": q.status,
            "accepted_at": q.accepted_at.isoformat(),
            "completed_at": q.completed_at.isoformat() if q.completed_at else None,
        }
        for q in quests_result.scalars()
    ]

    badges_result = await db.execute(select(UserBadge).where(UserBadge.user_id == user_id))
    badges = [{"badge_id": str(b.badge_id), "earned_at": b.earned_at.isoformat()} for b in badges_result.scalars()]

    data = {
        "profile": {
            "id": str(user.id),
            "phone": user.phone,
            "nickname": user.nickname,
            "level": user.level,
            "exp": user.exp,
            "xp": user.xp,
            "gold": user.gold,
            "created_at": user.created_at.isoformat(),
        },
        "rides": rides,
        "quests": quests,
        "badges": badges,
        "exported_at": datetime.now(UTC).isoformat(),
    }
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": "attachment; filename=saigon_rider_data.json"},
    )


@router.get("/{user_id}/profile", response_model=UserProfileOut, summary="타유저 공개 프로필 조회")
async def get_user_profile(
    user_id: uuid.UUID,
    requester_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).options(selectinload(User.rider_type)).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

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

    rider_style = user.rider_type.code if user.rider_type else None

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
