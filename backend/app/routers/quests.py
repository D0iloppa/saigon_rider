import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from passlib.context import CryptContext
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Bookmark, Quest, User, UserQuest
from ..schemas import (
    BookmarkToggleRequest,
    BookmarkToggleResponse,
    Page,
    QuestAcceptRequest,
    QuestAcceptResponse,
    QuestCompleteRequest,
    QuestCompleteResponse,
    QuestOut,
    QuestParticipantOut,
    QuestPinOut,
)
from ..utils import APP_TZ, MOCK_IMG_ENDPOINT, build_imgproxy_url, resolve_avatar_url

_pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


async def _verify_passcode(
    user_id: uuid.UUID,
    x_passcode: str,
    db: AsyncSession,
) -> None:
    user = await db.get(User, user_id)
    if not user or not user.passcode_hash or not _pwd_ctx.verify(x_passcode, user.passcode_hash):
        raise HTTPException(status_code=401, detail="인증 실패")


def _calc_period_key(period: str) -> str:
    today = datetime.now(APP_TZ).date()
    if period == "DAILY":
        return today.isoformat()
    if period == "WEEKLY":
        iso = today.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    return "ONCE"


router = APIRouter(prefix="/quests", tags=["퀘스트 (Quest)"])


def _to_out(quest: Quest) -> QuestOut:
    out = QuestOut.model_validate(quest)
    # 퀘스트 썸네일 우선순위 (모두 contents 테이블 중개):
    #   1. 자체 등록 이미지 (quests.thumbnail_content_id)
    #   2. district 대표 이미지 (districts.image_content_id)
    #   3. mockup 이미지
    if quest.thumbnail_content and quest.thumbnail_content.file_path:
        out.thumbnail_url = build_imgproxy_url(quest.thumbnail_content.file_path)
    elif quest.district and quest.district.image_content and quest.district.image_content.file_path:
        out.thumbnail_url = build_imgproxy_url(quest.district.image_content.file_path)
    else:
        out.thumbnail_url = f"{MOCK_IMG_ENDPOINT}?seed={quest.id}"
    return out


async def _get_quest_or_404(quest_id: uuid.UUID, db: AsyncSession) -> Quest:
    result = await db.execute(select(Quest).where(Quest.id == quest_id))
    quest = result.scalar_one_or_none()
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    return quest


# Q-1
@router.get("", response_model=Page[QuestOut], summary="퀘스트 목록")
async def get_quests(
    period: str | None = None,
    district_id: int | None = None,
    rider_type_id: int | None = None,
    badge: str | None = None,
    safety_grade_id: int | None = None,
    user_id: uuid.UUID | None = Query(None),
    exclude_completed: bool = Query(False),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Quest.is_active == True]

    if period:
        conditions.append(Quest.period == period.upper())
    if district_id:
        conditions.append(or_(Quest.district_id == district_id, Quest.district_id.is_(None)))
    if rider_type_id:
        conditions.append(or_(Quest.rider_type_id == rider_type_id, Quest.rider_type_id.is_(None)))
    if badge:
        conditions.append(Quest.badge == badge.upper())
    if safety_grade_id:
        conditions.append(or_(Quest.min_safety_grade_id == safety_grade_id, Quest.min_safety_grade_id.is_(None)))

    if exclude_completed and user_id and period:
        period_key = _calc_period_key(period.upper())
        completed_subq = (
            select(UserQuest.quest_id)
            .where(UserQuest.user_id == user_id, UserQuest.period_key == period_key)
            .scalar_subquery()
        )
        conditions.append(Quest.id.not_in(completed_subq))

    total = (await db.execute(select(func.count()).select_from(Quest).where(*conditions))).scalar_one()

    offset = (page - 1) * size
    stmt = select(Quest).where(*conditions).order_by(Quest.created_at.desc()).offset(offset).limit(size)
    result = await db.execute(stmt)
    items = [_to_out(q) for q in result.scalars().all()]
    return Page(items=items, total=total, page=page, size=size)


# Q-1b
@router.get("/completed-ids", response_model=list[str], summary="현재 주기 완료된 퀘스트 ID 목록")
async def get_completed_ids(
    user_id: uuid.UUID,
    period: str = "DAILY",
    db: AsyncSession = Depends(get_db),
):
    period_key = _calc_period_key(period.upper())
    result = await db.execute(
        select(UserQuest.quest_id).where(
            UserQuest.user_id == user_id,
            UserQuest.status == "COMPLETED",
            UserQuest.period_key == period_key,
        )
    )
    return [str(r) for r in result.scalars().all()]


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
    return _to_out(quest) if quest else None


# Q-4
@router.get("/{quest_id}", response_model=QuestOut, summary="퀘스트 상세")
async def get_quest_detail(quest_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    quest = await _get_quest_or_404(quest_id, db)
    return _to_out(quest)


# Q-5
@router.post("/{quest_id}/accept", response_model=QuestAcceptResponse, summary="퀘스트 수락")
async def accept_quest(
    quest_id: uuid.UUID,
    body: QuestAcceptRequest,
    db: AsyncSession = Depends(get_db),
):
    quest = await _get_quest_or_404(quest_id, db)

    period_key = _calc_period_key(quest.period)

    existing = await db.execute(
        select(UserQuest).where(
            UserQuest.user_id == body.user_id,
            UserQuest.quest_id == quest.id,
            UserQuest.period_key == period_key,
            UserQuest.status == "COMPLETED",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 완료한 퀘스트입니다.")

    user_quest = UserQuest(
        user_id=body.user_id,
        quest_id=quest.id,
        status="ACCEPTED",
        period_key=period_key,
    )
    db.add(user_quest)
    await db.commit()
    await db.refresh(user_quest)

    return QuestAcceptResponse(session_id=user_quest.id, user_quest_id=user_quest.id)


# Q-5b [DBG] 퀘스트 강제 완료 처리 (디버그용)
@router.post("/{quest_id}/complete", response_model=QuestCompleteResponse, summary="[DBG] 퀘스트 완료 처리")
async def complete_quest(
    quest_id: uuid.UUID,
    body: QuestCompleteRequest,
    x_passcode: str = Header(..., alias="X-Passcode"),
    db: AsyncSession = Depends(get_db),
):
    await _verify_passcode(body.user_id, x_passcode, db)
    quest = await _get_quest_or_404(quest_id, db)
    period_key = _calc_period_key(quest.period)

    result = await db.execute(
        select(UserQuest).where(
            UserQuest.user_id == body.user_id,
            UserQuest.quest_id == quest.id,
            UserQuest.period_key == period_key,
        )
    )
    uq = result.scalar_one_or_none()

    already_completed = uq and uq.status == "COMPLETED"

    if uq:
        uq.status = "COMPLETED"
        uq.completed_at = datetime.now(UTC)
    else:
        uq = UserQuest(
            user_id=body.user_id,
            quest_id=quest.id,
            status="COMPLETED",
            period_key=period_key,
            completed_at=datetime.now(UTC),
        )
        db.add(uq)

    # 이미 완료된 경우 보상 중복 지급 방지
    if not already_completed:
        user = await db.get(User, body.user_id)
        if user:
            user.exp += quest.reward_exp
            user.gold += quest.reward_gold

    await db.commit()
    await db.refresh(uq)
    return QuestCompleteResponse(
        quest_id=quest.id,
        user_quest_id=uq.id,
        status=uq.status,
        reward_exp=quest.reward_exp if not already_completed else 0,
        reward_gold=quest.reward_gold if not already_completed else 0,
        reward_item=quest.reward_item if not already_completed else None,
    )


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
            avatar_url=resolve_avatar_url(u),
        )
        for u in users
    ]
