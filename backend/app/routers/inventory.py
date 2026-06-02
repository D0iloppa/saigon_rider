import asyncio
import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import verify_user_session
from ..engine_client import engine_client

log = logging.getLogger(__name__)

router = APIRouter(prefix="/inventory", tags=["인벤토리 (Inventory)"])


class EquipRequest(BaseModel):
    item_code: str


_RARITY_RANK = {"C": 0, "R": 1, "E": 2, "L": 3, "M": 4}
_RANK_RARITY = ["C", "R", "E", "L", "M"]


def _avg_rarity(items: list[dict]) -> str:
    if not items:
        return "C"
    ranks = [_RARITY_RANK.get((i.get("item_def") or i.get("item") or {}).get("rarity", "C"), 0) for i in items]
    avg = sum(ranks) / len(ranks)
    return _RANK_RARITY[round(avg)]


@router.get("/items")
async def get_items(
    uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    uid_str = str(uid)
    try:
        items_raw, equip_raw, coll_raw = await asyncio.gather(
            engine_client.get_inventory(uid_str),
            engine_client.get_equipment(uid_str),
            engine_client.get_collection_progress(uid_str),
        )
    except httpx.HTTPError as err:
        # 타임아웃·연결 실패·Engine 5xx 등 게이트웨이성 오류만 502 로 변환
        log.warning("inventory engine call failed: %r", err)
        raise HTTPException(status_code=502, detail="Engine unavailable") from err

    equipped_codes = {e["item_code"] for e in equip_raw if e.get("item_code")}

    items: list[dict] = []
    for raw in items_raw:
        defn = raw.get("item_def") or raw.get("item") or {}
        items.append(
            {
                "user_item_id": str(raw.get("user_item_id", "")),
                "item_code": raw.get("item_code", ""),
                "item_name": defn.get("display_name", raw.get("item_code", "")),
                "item_slot": defn.get("slot", ""),
                "rarity": defn.get("rarity", "C"),
                "collection_code": defn.get("collection_code"),
                "is_equipped": raw.get("item_code") in equipped_codes,
                "is_new": False,
                "acquired_at": str(raw.get("acquired_at", ""))[:10],
            }
        )

    total_catalog = sum(c.get("total_items", 0) for c in coll_raw)
    completed = sum(1 for c in coll_raw if c.get("owned_items", 0) >= c.get("total_items", 1) > 0)

    return {
        "stats": {
            "total_owned": len(items),
            "total_catalog": total_catalog or 213,
            "avg_rarity": _avg_rarity(items_raw),
            "completed_collections": completed,
            "total_collections": len(coll_raw),
        },
        "items": items,
    }


@router.get("/equipment")
async def get_equipment(
    uid: uuid.UUID = Depends(verify_user_session),
) -> list[dict]:
    return await engine_client.get_equipment(str(uid))


@router.put("/equip")
async def equip_item(
    payload: EquipRequest,
    uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    try:
        return await engine_client.equip_item(str(uid), payload.item_code)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None


@router.get("/collection-progress")
async def get_collection_progress(
    uid: uuid.UUID = Depends(verify_user_session),
) -> list[dict]:
    return await engine_client.get_collection_progress(str(uid))


@router.delete("/equip/{slot}", status_code=204)
async def unequip_slot(
    slot: str,
    uid: uuid.UUID = Depends(verify_user_session),
) -> None:
    try:
        await engine_client.unequip_slot(str(uid), slot)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None
