import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..deps import verify_user_session
from ..engine_client import engine_client

router = APIRouter(prefix="/gacha", tags=["가챠 (Gacha)"])


_CURRENCY_MAP = {"GP": "GOLD", "GC": "RP"}


def _gacha_type(g: dict) -> str:
    currency = g.get("cost_currency", "GP")
    if currency == "GP":
        return "GOLD"
    if g.get("collection_filter"):
        return "SEASON"
    if (g.get("cost_per_pull") or 0) >= 80:
        return "LEGEND"
    return "RP"


def _to_frontend(g: dict) -> dict:
    return {
        "code": g.get("gacha_code", ""),
        "name": g.get("display_name", ""),
        "gacha_type": _gacha_type(g),
        "cost_currency": _CURRENCY_MAP.get(g.get("cost_currency", "GP"), g.get("cost_currency", "GP")),
        "cost_single": g.get("cost_per_pull", 0),
        "cost_10pull": g.get("cost_per_10_pull", 0),
        "pity_hard_ceiling": g.get("pity_threshold") or 0,
        "description": g.get("description"),
        "limited_label": None,
        "expires_at": g.get("ends_at"),
    }


@router.get("/list")
async def list_gacha(
    _uid: uuid.UUID = Depends(verify_user_session),
) -> list[dict]:
    raw = await engine_client.get_gacha_list()
    return [_to_frontend(g) for g in raw]


@router.get("/log")
async def get_pull_log(
    limit: int = 50,
    offset: int = 0,
    uid: uuid.UUID = Depends(verify_user_session),
) -> list[dict]:
    return await engine_client.get_gacha_pull_log(str(uid), limit=limit, offset=offset)


@router.get("/pity/{gacha_code}")
async def get_pity(
    gacha_code: str,
    uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    raw = await engine_client.get_gacha_pity(str(uid), gacha_code)
    # Engine returns pity_count; frontend expects pull_count + pity_hard_ceiling.
    # Fetch gacha list to get the threshold for this code.
    gacha_list = await engine_client.get_gacha_list()
    threshold = next(
        (g.get("pity_threshold") or 0 for g in gacha_list if g.get("gacha_code") == gacha_code),
        0,
    )
    return {
        "gacha_code": raw.get("gacha_code", gacha_code),
        "pull_count": raw.get("pity_count", 0),
        "pity_hard_ceiling": threshold,
    }


@router.get("/eligibility/{gacha_code}")
async def check_gacha_eligibility(
    gacha_code: str,
    uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    try:
        return await engine_client.check_gacha_eligibility(str(uid), gacha_code)
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None


@router.post("/pull")
async def pull_gacha(
    gacha_code: str,
    is_10_pull: bool = False,
    uid: uuid.UUID = Depends(verify_user_session),
) -> dict:
    try:
        raw = await engine_client.pull_gacha(
            user_uuid=str(uid),
            gacha_code=gacha_code,
            is_10_pull=is_10_pull,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code, detail=e.response.json().get("detail", str(e))
        ) from None

    # Engine returns `results` with item_code/rarity only; frontend needs `items` with names.
    items = [
        {
            "item_code": r.get("item_code", ""),
            "item_name": r.get("item_code", ""),
            "rarity": r.get("rarity", "C"),
            "slot": "",
            "is_new": False,
        }
        for r in raw.get("results", [])
    ]
    return {
        "items": items,
        "new_pity_count": raw.get("pity_count_after", 0),
        "ceiling_reset": False,
        "cost_paid": raw.get("cost_amount", 0),
        "currency": _CURRENCY_MAP.get(raw.get("cost_currency", "GP"), raw.get("cost_currency", "GP")),
    }
