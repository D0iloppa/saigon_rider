import logging
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import Quest, RideSession, RideStreak, User, UserQuest
from ..schemas import (
    Page,
    RideResultOut,
    RideSessionOut,
    RideStreakOut,
    RideSubmitRequest,
    SafetyGradeRequest,
    SafetyGradeResponse,
)
from ..utils import APP_TZ, gain_exp

log = logging.getLogger(__name__)
router = APIRouter(prefix="/ride", tags=["라이딩 (Ride)"])


def _calc_safety_grade(avg_speed_kmh: float, braking_count: int) -> str:
    score = 0
    if avg_speed_kmh > 50:
        score += 2
    elif avg_speed_kmh > 35:
        score += 1
    if braking_count > 10:
        score += 2
    elif braking_count > 5:
        score += 1
    if score >= 3:
        return "C"
    if score >= 1:
        return "B"
    return "A"


async def _upsert_streak(db: AsyncSession, user_id: uuid.UUID) -> None:
    today = datetime.now(APP_TZ).date()
    streak = await db.get(RideStreak, user_id)

    if streak is None:
        db.add(RideStreak(user_id=user_id, current_streak=1, longest_streak=1, last_ride_date=today))
        return

    if streak.last_ride_date == today:
        return

    yesterday = today - timedelta(days=1)
    if streak.last_ride_date == yesterday:
        streak.current_streak += 1
    else:
        streak.current_streak = 1

    streak.longest_streak = max(streak.longest_streak, streak.current_streak)
    streak.last_ride_date = today


# R-1
@router.post("/submit", response_model=RideResultOut, status_code=201, summary="라이딩 결과 제출")
async def submit_ride(
    body: RideSubmitRequest, db: AsyncSession = Depends(get_db), _session_uid: uuid.UUID = Depends(verify_user_session)
):
    now = datetime.now(UTC)

    uq = await db.get(UserQuest, body.user_quest_id)
    if uq is None:
        raise HTTPException(status_code=404, detail="UserQuest not found")

    quest = await db.get(Quest, body.quest_id)
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")

    reward_exp = quest.reward_exp if body.is_success else 0
    reward_gold = quest.reward_gold if body.is_success else 0
    reward_item = quest.reward_item if body.is_success else None

    session = RideSession(
        user_quest_id=body.user_quest_id,
        user_id=body.user_id,
        quest_id=body.quest_id,
        distance_km=body.distance_km,
        duration_sec=body.duration_sec,
        avg_speed_kmh=body.avg_speed_kmh,
        safety_grade=body.safety_grade,
        reward_exp=reward_exp,
        reward_gold=reward_gold,
        reward_item=reward_item,
        is_success=body.is_success,
        fail_reason=body.fail_reason,
        created_at=now,
    )
    db.add(session)
    await db.flush()

    if body.is_success:
        uq.status = "COMPLETED"
        uq.completed_at = now

        user = await db.get(User, body.user_id)
        if user:
            user.gold += reward_gold
            await gain_exp(db, user, reward_exp)

        await _upsert_streak(db, body.user_id)

    await db.commit()
    await db.refresh(session)

    # Engine 이벤트 발행 (실패해도 라이딩 기록은 보존)
    try:
        await engine_client.post_event(
            user_uuid=str(body.user_id),
            action_code="RIDE_KM",
            occurred_at=now,
            payload={"distance_km": float(body.distance_km), "ride_id": str(session.id)},
            idem_key=f"ride-{session.id}-km",
        )
        if body.is_success:
            await engine_client.post_event(
                user_uuid=str(body.user_id),
                action_code="QUEST_COMPLETE",
                occurred_at=now,
                payload={
                    "quest_id": str(body.quest_id),
                    "ride_id": str(session.id),
                    # SGR-228: 데일리 퀘스트 RP 적립 0. RP 수급은 이벤트 퀘스트로만(재고 예측).
                    # 경제밸런스 확정 후 이벤트 퀘 한정 도입 예정(분기 미구현, 현재는 일괄 0).
                    "rp": 0,
                },
                idem_key=f"ride-{session.id}-quest-{body.quest_id}",
            )
    except (httpx.HTTPError, httpx.RequestError) as exc:
        log.warning("Engine event failed for ride %s: %s", session.id, exc)

    return RideResultOut(
        session_id=session.id,
        is_success=session.is_success,
        distance_km=session.distance_km,
        duration_sec=session.duration_sec,
        safety_grade=session.safety_grade,
        reward_exp=session.reward_exp,
        reward_gold=session.reward_gold,
        reward_item=session.reward_item,
        created_at=session.created_at,
    )


# R-2
@router.get("/streak", response_model=RideStreakOut, summary="라이딩 스트릭 조회")
async def get_ride_streak(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    streak = await db.get(RideStreak, user_id)
    if streak is None:
        return RideStreakOut(user_id=user_id, current_streak=0, longest_streak=0, last_ride_date=None)
    return RideStreakOut.model_validate(streak)


# R-3
@router.get("/history", response_model=Page[RideSessionOut], summary="라이딩 이력 (페이지네이션)")
async def get_ride_history(
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    total_result = await db.execute(select(func.count()).where(RideSession.user_id == user_id))
    total = total_result.scalar_one()

    sessions = (
        (
            await db.execute(
                select(RideSession)
                .where(RideSession.user_id == user_id)
                .order_by(RideSession.created_at.desc())
                .offset(offset)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )

    return Page(
        items=[RideSessionOut.model_validate(s) for s in sessions],
        total=total,
        page=page,
        size=size,
    )


# R-4
@router.post("/safety-grade", response_model=SafetyGradeResponse, summary="안전등급 계산")
async def calc_safety_grade(body: SafetyGradeRequest):
    grade = _calc_safety_grade(body.avg_speed_kmh, body.braking_count)
    return SafetyGradeResponse(grade=grade)


@router.get("/policy", summary="라이딩 화면 정책 (체크포인트 반경/잔여거리 밴드)")
async def get_ride_policy(
    user_id: uuid.UUID = Depends(verify_user_session),
):
    return await engine_client.get_ride_policy()
