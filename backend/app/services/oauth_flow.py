"""Shared, single-use storage for browser/native OAuth redirect flows."""

from __future__ import annotations

import json
import secrets
from dataclasses import dataclass

from .redis_cache import get_client

STATE_TTL_SECONDS = 600
EXCHANGE_TTL_SECONDS = 120

_STATE_PREFIX = "saigon:oauth:state:"
_EXCHANGE_PREFIX = "saigon:oauth:exchange:"


@dataclass(frozen=True)
class OAuthExchangePayload:
    user_id: str
    is_new: bool


async def _issue(prefix: str, payload: dict[str, object], ttl_seconds: int) -> str:
    client = await get_client()
    encoded = json.dumps(payload, separators=(",", ":"))
    for _ in range(3):
        token = secrets.token_urlsafe(32)
        if await client.set(prefix + token, encoded, ex=ttl_seconds, nx=True):
            return token
    raise RuntimeError("could not allocate unique OAuth token")


async def issue_oauth_state(extra: str | None = None) -> str:
    return await _issue(_STATE_PREFIX, {"extra": extra}, STATE_TTL_SECONDS)


async def consume_oauth_state(token: str) -> tuple[bool, str | None]:
    client = await get_client()
    raw = await client.getdel(_STATE_PREFIX + token)
    if raw is None:
        return False, None
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return False, None
    if not isinstance(payload, dict):
        return False, None
    extra = payload.get("extra")
    return True, extra if isinstance(extra, str) else None


async def issue_oauth_exchange(user_id: str, is_new: bool) -> str:
    return await _issue(
        _EXCHANGE_PREFIX,
        {"user_id": user_id, "is_new": is_new},
        EXCHANGE_TTL_SECONDS,
    )


async def consume_oauth_exchange(token: str) -> OAuthExchangePayload | None:
    client = await get_client()
    raw = await client.getdel(_EXCHANGE_PREFIX + token)
    if raw is None:
        return None
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    user_id = payload.get("user_id")
    is_new = payload.get("is_new")
    if not isinstance(user_id, str) or not isinstance(is_new, bool):
        return None
    return OAuthExchangePayload(user_id=user_id, is_new=is_new)
