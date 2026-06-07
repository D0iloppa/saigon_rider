"""UserQuest 라이프사이클 — 수행 시작 / 수행 중단 / 수령 포기."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import Quest, UserQuest

log = logging.getLogger(__name__)

router = APIRouter(prefix="/user-quests", tags=["UserQuest 라이프사이클"])


def _calc_card_expires_from_quest(quest: Quest) -> str | None:
    # 수행 시작 시 card 만료는 quest.ends_at 또는 자정(VN) 으로 BFF 카드 생성 시 결정.
    # 단순화를 위해 ends_at 만 사용 — DAILY 자정 만료는 별도 배치가 처리.
    return quest.ends_at.isoformat() if quest.ends_at else None


class StartRideResponse(BaseModel):
    user_quest_id: uuid.UUID
    card_id: int | None = None


@router.post("/{user_quest_id}/start-ride", response_model=StartRideResponse, summary="수행 시작 — Engine 카드 생성")
async def start_ride(
    user_quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
) -> StartRideResponse:
    uq = await db.get(UserQuest, user_quest_id)
    if uq is None:
        raise HTTPException(status_code=404, detail="user_quest not found")
    if uq.status != "ACCEPTED":
        raise HTTPException(status_code=409, detail=f"수행할 수 없는 상태입니다 ({uq.status})")

    quest = await db.get(Quest, uq.quest_id)
    if quest is None:
        raise HTTPException(status_code=404, detail="quest not found")

    # 수행가능 시간대 게이트 (ICT 로컬시각, 둘 다 있으면 검사). 자정 미교차 가정.
    if quest.available_from is not None and quest.available_to is not None:
        now_ict = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).time()
        if not (quest.available_from <= now_ict <= quest.available_to):
            raise HTTPException(
                status_code=409,
                detail=f"수행 가능 시간이 아닙니다 ({quest.available_from:%H:%M}~{quest.available_to:%H:%M})",
            )

    expires_at = _calc_card_expires_from_quest(quest)
    try:
        if quest.card_type == "CHECKPOINT":
            criteria = {
                "target_lat": float(quest.target_lat) if quest.target_lat is not None else None,
                "target_lng": float(quest.target_lng) if quest.target_lng is not None else None,
            }
        elif quest.card_type in ("COUNT_EVENT", "COUNT_DISTINCT"):
            # 비-GPS 검증형 — 목표 파라미터(action_code/target_count/distinct_key)는 quest.criteria 에 저장.
            criteria = quest.criteria or {}
        else:
            criteria = {
                "target_distance_m": int(quest.target_distance_km * 1000) if quest.target_distance_km else None,
            }
        resp = await engine_client.create_quest_card(
            user_uuid=str(uq.user_id),
            external_quest_id=str(quest.id),
            user_quest_id=str(uq.id),
            card_type=quest.card_type or "DISTANCE",
            criteria=criteria,
            expires_at=expires_at,
        )
    except Exception as exc:
        log.warning("Engine card creation failed for user_quest=%s: %s", user_quest_id, exc)
        raise HTTPException(status_code=502, detail="Engine 카드 생성 실패") from exc

    return StartRideResponse(user_quest_id=uq.id, card_id=resp.get("card_id"))


@router.post("/{user_quest_id}/abandon-ride", summary="수행 중단 — 카드만 취소, UserQuest는 ACCEPTED 유지")
async def abandon_ride(
    user_quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    uq = await db.get(UserQuest, user_quest_id)
    if uq is None:
        raise HTTPException(status_code=404, detail="user_quest not found")

    try:
        card = await engine_client.get_card_by_user_quest(str(user_quest_id))
        if card.get("status") == "ACTIVE":
            await engine_client.cancel_quest_card(card["card_id"])
    except Exception:
        log.info("No active card to cancel for user_quest=%s", user_quest_id)

    return {"ok": True, "user_quest_id": str(uq.id), "status": uq.status}


@router.delete("/{user_quest_id}", summary="수령 포기 — UserQuest ABANDONED, 슬롯 환불")
async def drop_accepted_quest(
    user_quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    uq = await db.get(UserQuest, user_quest_id)
    if uq is None:
        raise HTTPException(status_code=404, detail="user_quest not found")
    if uq.status != "ACCEPTED":
        raise HTTPException(status_code=409, detail=f"포기할 수 없는 상태입니다 ({uq.status})")

    try:
        card = await engine_client.get_card_by_user_quest(str(user_quest_id))
        if card.get("status") == "ACTIVE":
            await engine_client.cancel_quest_card(card["card_id"])
    except Exception:
        pass

    uq.status = "ABANDONED"
    await db.commit()
    return {"ok": True, "user_quest_id": str(uq.id), "status": "ABANDONED"}
