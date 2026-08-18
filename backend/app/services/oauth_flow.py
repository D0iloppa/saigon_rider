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


async def issue_oauth_state(extra: str | None = None, ref: str | None = None) -> str:
    """ref = 유입 귀속 코드(016 §6-2 #30) — redirect flow는 start→callback 사이 요청이 끊겨
    쿼리파라미터를 직접 못 들고 다니므로, PKCE verifier(extra)와 같은 방식으로 state에 실어 나른다."""
    return await _issue(_STATE_PREFIX, {"extra": extra, "ref": ref}, STATE_TTL_SECONDS)


async def consume_oauth_state(token: str) -> tuple[bool, str | None, str | None]:
    client = await get_client()
    raw = await client.getdel(_STATE_PREFIX + token)
    if raw is None:
        return False, None, None
    try:
        payload = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return False, None, None
    if not isinstance(payload, dict):
        return False, None, None
    extra = payload.get("extra")
    ref = payload.get("ref")
    return (
        True,
        extra if isinstance(extra, str) else None,
        ref if isinstance(ref, str) else None,
    )


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
