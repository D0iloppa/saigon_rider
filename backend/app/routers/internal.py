import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_service_key
from ..models import Badge, Quest, User, UserBadge, UserQuest
from ..utils import apply_quest_reward_multiplier, gain_exp

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(verify_service_key)])
log = logging.getLogger(__name__)


class GrantExpRequest(BaseModel):
    user_uuid: str
    amount: int


class GrantGoldRequest(BaseModel):
    user_uuid: str
    amount: int


class GrantBadgeRequest(BaseModel):
    user_uuid: str
    badge_id: str


class GrantResponse(BaseModel):
    ok: bool
    detail: str | None = None


@router.post("/grant-exp", response_model=GrantResponse)
async def grant_exp(body: GrantExpRequest, db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(body.user_uuid)
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    gained = await gain_exp(db, user, body.amount)
    await db.commit()
    log.info(
        "internal grant-exp: user=%s +%d → level=%d exp=%d (+%d levels)",
        body.user_uuid,
        body.amount,
        user.level,
        user.exp,
        gained,
    )
    return GrantResponse(ok=True)


@router.post("/grant-gold", response_model=GrantResponse)
async def grant_gold(body: GrantGoldRequest, db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(body.user_uuid)
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.gold += body.amount
    await db.commit()
    log.info("internal grant-gold: user=%s +%d → %d", body.user_uuid, body.amount, user.gold)
    return GrantResponse(ok=True)


@router.post("/grant-badge", response_model=GrantResponse)
async def grant_badge(body: GrantBadgeRequest, db: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(body.user_uuid)
    badge_uid = uuid.UUID(body.badge_id)

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    badge = await db.get(Badge, badge_uid)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")

    existing = await db.get(UserBadge, (uid, badge_uid))
    if existing:
        return GrantResponse(ok=True, detail="already_owned")

    db.add(UserBadge(user_id=uid, badge_id=badge_uid))
    await db.commit()
    log.info("internal grant-badge: user=%s badge=%s", body.user_uuid, body.badge_id)
    return GrantResponse(ok=True)


class QuestCardCompletedRequest(BaseModel):
    user_quest_id: str
    external_quest_id: str | None = None
    card_id: int | None = None
    card_type: str | None = None


@router.post("/quest-card-completed", response_model=GrantResponse)
async def quest_card_completed(
    body: QuestCardCompletedRequest,
    db: AsyncSession = Depends(get_db),
):
    """Engine 워커가 quest_completed 이벤트 수신 시 호출.
    UserQuest 를 COMPLETED 로 갱신하고 reward_exp/gold 를 지급한다 (멱등)."""
    try:
        uq_uid = uuid.UUID(body.user_quest_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid user_quest_id") from None

    uq = await db.get(UserQuest, uq_uid)
    if uq is None:
        raise HTTPException(status_code=404, detail="user_quest not found")

    if uq.status == "COMPLETED":
        return GrantResponse(ok=True, detail="already_completed")

    quest = await db.get(Quest, uq.quest_id)
    user = await db.get(User, uq.user_id)
    if quest is None or user is None:
        raise HTTPException(status_code=404, detail="quest/user not found")

    # 실지급 = base * (1 + 아이템% + 스킬%). 공용 헬퍼로 ride/quests 와 동일 적용.
    reward_exp, reward_gold = await apply_quest_reward_multiplier(db, user, quest.reward_exp, quest.reward_gold)
    uq.status = "COMPLETED"
    uq.completed_at = datetime.now(UTC)
    user.gold += reward_gold
    await gain_exp(db, user, reward_exp)
    await db.commit()
    log.info(
        "internal quest-card-completed: user_quest=%s quest=%s card=%s +exp=%d +gold=%d",
        body.user_quest_id,
        body.external_quest_id,
        body.card_id,
        reward_exp,
        reward_gold,
    )
    return GrantResponse(ok=True)
