"""Seed config — DB 기반 튜닝 파라미터 조회."""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import SreSeedConfig

log = logging.getLogger(__name__)

_cache: dict[str, str] = {}


async def get_seed(seed_code: str, default: str = "") -> str:
    if seed_code in _cache:
        return _cache[seed_code]

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SreSeedConfig.value_text)
            .where(SreSeedConfig.seed_code == seed_code)
        )
        row = result.scalar_one_or_none()

    value = row if row is not None else default
    _cache[seed_code] = value
    return value


async def get_seed_int(seed_code: str, default: int = 0) -> int:
    raw = await get_seed(seed_code, str(default))
    return int(raw)


async def get_seed_json(seed_code: str, default: Any = None) -> Any:
    raw = await get_seed(seed_code, "null")
    parsed = json.loads(raw)
    return parsed if parsed is not None else default


def invalidate(seed_code: str | None = None) -> None:
    """seed_code 단건 또는 전체 캐시 무효화. Admin 의 PUT 핸들러에서 호출."""
    if seed_code is None:
        _cache.clear()
    else:
        _cache.pop(seed_code, None)
