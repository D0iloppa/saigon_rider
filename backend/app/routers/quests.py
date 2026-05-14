import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Bookmark, Quest, User, UserQuest
from ..schemas import (
    BookmarkToggleRequest,
    BookmarkToggleResponse,
    QuestAcceptRequest,
    QuestAcceptResponse,
    QuestOut,
    QuestParticipantOut,
    QuestPinOut,
)

router = APIRouter(prefix="/quests", tags=["퀘스트 (Quest)"])


async def _get_quest_or_404(quest_id: uuid.UUID, db: AsyncSession) -> Quest:
    result = await db.execute(select(Quest).where(Quest.id == quest_id))
    quest = result.scalar_one_or_none()
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    return quest


# Q-1
@router.get("", response_model=list[QuestOut], summary="퀘스트 목록")
async def get_quests(
    period: str | None = None,
    district: str | None = None,
    badge: str | None = None,
    safety_grade: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Quest).where(Quest.is_active == True)

    if period:
        stmt = stmt.where(Quest.period == period.upper())
    if district:
        stmt = stmt.where(Quest.district == district)
    if badge:
        stmt = stmt.where(Quest.badge == badge.upper())
    if safety_grade:
        stmt = stmt.where(Quest.min_safety_grade == safety_grade.upper())

    stmt = stmt.order_by(Quest.created_at.desc())
    result = await db.execute(stmt)
    return [QuestOut.model_validate(q) for q in result.scalars().all()]


# Q-2
@router.get("/pins", response_model=list[QuestPinOut], summary="월드맵 핀 좌표 목록")
async def get_quest_pins(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            text("""
                SELECT qp.id, qp.quest_id,
                       ST_Y(qp.location::geometry) AS lat,
                       ST_X(qp.location::geometry) AS lng
                FROM quest_pins qp
                JOIN quests q ON qp.quest_id = q.id
                WHERE q.is_active = TRUE
            """)
        )
    ).all()
    return [QuestPinOut(id=r.id, quest_id=r.quest_id, lat=r.lat, lng=r.lng) for r in rows]


# Q-3
@router.get("/recommended", response_model=QuestOut | None, summary="Tonight's Pick 추천 퀘스트")
async def get_recommended_quest(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Quest)
        .where(
            Quest.is_active == True,
            Quest.period == "DAILY",
        )
        .order_by((Quest.reward_exp + Quest.reward_gold).desc())
        .limit(1)
    )
    quest = result.scalar_one_or_none()
    return QuestOut.model_validate(quest) if quest else None


# Q-4
@router.get("/{quest_id}", response_model=QuestOut, summary="퀘스트 상세")
async def get_quest_detail(quest_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    quest = await _get_quest_or_404(quest_id, db)
    return QuestOut.model_validate(quest)


# Q-5
@router.post("/{quest_id}/accept", response_model=QuestAcceptResponse, summary="퀘스트 수락")
async def accept_quest(
    quest_id: uuid.UUID,
    body: QuestAcceptRequest,
    db: AsyncSession = Depends(get_db),
):
    quest = await _get_quest_or_404(quest_id, db)

    user_quest = UserQuest(
        user_id=body.user_id,
        quest_id=quest.id,
        status="ACCEPTED",
    )
    db.add(user_quest)
    await db.commit()
    await db.refresh(user_quest)

    return QuestAcceptResponse(session_id=user_quest.id, user_quest_id=user_quest.id)


# Q-6
@router.post("/{quest_id}/bookmark", response_model=BookmarkToggleResponse, summary="북마크 토글")
async def toggle_bookmark(
    quest_id: uuid.UUID,
    body: BookmarkToggleRequest,
    db: AsyncSession = Depends(get_db),
):
    await _get_quest_or_404(quest_id, db)

    existing = await db.get(Bookmark, {"user_id": body.user_id, "quest_id": quest_id})
    if existing:
        await db.delete(existing)
        await db.commit()
        return BookmarkToggleResponse(bookmarked=False)

    bookmark = Bookmark(user_id=body.user_id, quest_id=quest_id)
    db.add(bookmark)
    await db.commit()
    return BookmarkToggleResponse(bookmarked=True)


# Q-7
@router.get("/{quest_id}/participants", response_model=list[QuestParticipantOut], summary="퀘스트 참여자 목록")
async def get_quest_participants(quest_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_quest_or_404(quest_id, db)

    result = await db.execute(
        select(User)
        .join(UserQuest, UserQuest.user_id == User.id)
        .where(
            UserQuest.quest_id == quest_id,
            UserQuest.status.in_(["ACCEPTED", "ACTIVE"]),
        )
        .order_by(UserQuest.accepted_at.desc())
        .limit(50)
    )
    users = result.scalars().all()
    return [
        QuestParticipantOut(
            user_id=u.id,
            nickname=u.nickname,
            avatar_url=u.avatar_url,
        )
        for u in users
    ]
