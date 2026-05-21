"""퀘스트 카드 — 생성·조회·취소·슬롯 확인."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_session, verify_service_key
from app.enums import QuestCardStatusEnum, QuestCardTypeEnum
from app.models import SreQuestCard, SreUser
from app.schemas import DailySlotInfo, QuestCardCreate, QuestCardRead
from app.services import quest_tracker

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["quest-cards"])


@router.post(
    "/quest-cards",
    response_model=QuestCardRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_service_key)],
)
async def create_quest_card(
    body: QuestCardCreate,
    db: AsyncSession = Depends(get_session),
) -> SreQuestCard:
    result = await db.execute(
        select(SreUser).where(SreUser.external_user_uuid == body.user_uuid)
    )
    sre_user = result.scalar_one_or_none()
    if sre_user is None:
        raise HTTPException(status_code=404, detail="SRE user not found")

    if body.card_type == QuestCardTypeEnum.DISTANCE and body.target_distance_m is None:
        raise HTTPException(status_code=422, detail="DISTANCE requires target_distance_m")
    if body.card_type == QuestCardTypeEnum.CHECKPOINT and (body.target_lat is None or body.target_lng is None):
        raise HTTPException(status_code=422, detail="CHECKPOINT requires target_lat and target_lng")

    card = SreQuestCard(
        user_id=sre_user.user_id,
        external_quest_id=body.external_quest_id,
        user_quest_id=body.user_quest_id,
        card_type=body.card_type,
        target_distance_m=body.target_distance_m,
        target_lat=body.target_lat,
        target_lng=body.target_lng,
        expires_at=body.expires_at,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


@router.get(
    "/users/{user_id}/quest-cards",
    response_model=list[QuestCardRead],
    dependencies=[Depends(verify_service_key)],
)
async def list_quest_cards(
    user_id: int,
    card_status: QuestCardStatusEnum = Query(QuestCardStatusEnum.ACTIVE, alias="status"),
    db: AsyncSession = Depends(get_session),
) -> list[SreQuestCard]:
    result = await db.execute(
        select(SreQuestCard).where(
            SreQuestCard.user_id == user_id,
            SreQuestCard.status == card_status,
        ).order_by(SreQuestCard.accepted_at.desc())
    )
    return list(result.scalars().all())


@router.get(
    "/users/{user_id}/quest-cards/completed",
    response_model=list[QuestCardRead],
    dependencies=[Depends(verify_service_key)],
)
async def get_completed_cards(
    user_id: int,
    db: AsyncSession = Depends(get_session),
) -> list[SreQuestCard]:
    result = await db.execute(
        select(SreQuestCard).where(
            SreQuestCard.user_id == user_id,
            SreQuestCard.status == QuestCardStatusEnum.COMPLETED,
        ).order_by(SreQuestCard.completed_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/quest-cards/{card_id}/cancel",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_service_key)],
)
async def cancel_quest_card(
    card_id: int,
    db: AsyncSession = Depends(get_session),
) -> None:
    card = await db.get(SreQuestCard, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    if card.status != QuestCardStatusEnum.ACTIVE:
        raise HTTPException(status_code=409, detail="Only ACTIVE cards can be cancelled")
    card.status = QuestCardStatusEnum.CANCELLED
    await db.commit()


@router.get(
    "/users/{user_id}/daily-quest-slots",
    response_model=DailySlotInfo,
    dependencies=[Depends(verify_service_key)],
)
async def get_daily_slots(
    user_id: int,
    db: AsyncSession = Depends(get_session),
) -> DailySlotInfo:
    return await quest_tracker.calc_daily_slots(db, user_id)


@router.get(
    "/quest-cards/daily-slots",
    response_model=DailySlotInfo,
    dependencies=[Depends(verify_service_key)],
)
async def get_daily_slots_by_uuid(
    user_uuid: str = Query(...),
    db: AsyncSession = Depends(get_session),
) -> DailySlotInfo:
    result = await db.execute(
        select(SreUser).where(SreUser.external_user_uuid == user_uuid)
    )
    sre_user = result.scalar_one_or_none()
    if sre_user is None:
        raise HTTPException(status_code=404, detail="SRE user not found")
    return await quest_tracker.calc_daily_slots(db, sre_user.user_id)
