import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_service_key
from ..engine_client import engine_client
from ..models import Badge, Quest, User, UserBadge, UserQuest
from ..utils import apply_quest_reward_multiplier, gain_exp

# 퀘스트 RP 상한(표시=실지급). 일일 총량은 데일리에 한해 engine DAILY_RP_CAP(60)로 별도 제한.
QUEST_RP_CAP = 200

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


@router.get("/mileage-skill-pct")
async def mileage_skill_pct(user_uuid: str, db: AsyncSession = Depends(get_db)):
    """마일리지 보상 증폭 스킬 배율(%) 조회. 단계당 +1% (단계 = skill_mileage_rate // 3, 최대 +3%)."""
    uid = uuid.UUID(user_uuid)
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"pct": (user.skill_mileage_rate // 3) * 1}


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

    # RP(gc) 적립 — 표시값(reward_exp*0.3)을 실제 지급, 퀘스트당 200 상한.
    # 주간/이벤트만 일일캡(60) 면제, 그 외(데일리·미상)는 fail-closed 로 캡 적용.
    # 멱등: 위 status 가드로 1회만 진입 → 실패해도 재시도 안 되므로 침묵 금지(로그 경고).
    rp_grant = min(QUEST_RP_CAP, round(quest.reward_exp * 0.3))
    rp_capped = quest.period not in ("WEEKLY", "EVENT")
    rp_ok = False
    if rp_grant > 0:
        try:
            await engine_client.credit_rp(str(user.id), amount=rp_grant, apply_daily_cap=rp_capped)
            rp_ok = True
        except Exception:
            log.warning(
                "quest-card-completed RP 적립 실패(재시도 안 됨): user_quest=%s rp=%d",
                body.user_quest_id,
                rp_grant,
                exc_info=True,
            )

    log.info(
        "internal quest-card-completed: user_quest=%s quest=%s card=%s +exp=%d +gold=%d +rp=%d(ok=%s,capped=%s)",
        body.user_quest_id,
        body.external_quest_id,
        body.card_id,
        reward_exp,
        reward_gold,
        rp_grant if rp_ok else 0,
        rp_ok,
        rp_capped,
    )
    return GrantResponse(ok=True)
