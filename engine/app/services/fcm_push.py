"""FCM v1 HTTP API 발송 + Redis badge 카운터 관리."""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Literal

import httpx
import jwt

from app.config import settings
from app.redis_client import get_redis

log = logging.getLogger(__name__)

PREFIX = "saigon:push:"

# ── Access Token 캐시 ────────────────────────────────────────

_cached_token: str | None = None
_token_expires_at: float = 0
_credentials: dict[str, Any] | None = None


def _load_credentials() -> dict[str, Any]:
    global _credentials
    if _credentials is None:
        path = settings.firebase_credentials_json
        import os
        if not os.path.isfile(path):
            raise FileNotFoundError(
                f"Firebase credentials not found: {path}. "
                "Place the service account JSON file and set FIREBASE_CREDENTIALS_JSON."
            )
        with open(path, encoding="utf-8") as f:
            _credentials = json.load(f)
    return _credentials


async def _get_access_token() -> str:
    global _cached_token, _token_expires_at

    now = time.time()
    if _cached_token and now < _token_expires_at - 60:
        return _cached_token

    creds = _load_credentials()
    payload = {
        "iss": creds["client_email"],
        "scope": "https://www.googleapis.com/auth/firebase.messaging",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": int(now),
        "exp": int(now) + 3600,
    }
    jwt_token = jwt.encode(payload, creds["private_key"], algorithm="RS256")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt_token,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    _cached_token = data["access_token"]
    _token_expires_at = now + data.get("expires_in", 3600)
    return _cached_token


# ── FCM 발송 ─────────────────────────────────────────────────


async def _send_single(
    *,
    fcm_token: str,
    title: str,
    body: str,
    badge: int,
    data: dict[str, str] | None = None,
) -> bool:
    creds = _load_credentials()
    project_id = creds["project_id"]
    access_token = await _get_access_token()

    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    capped_badge = min(badge, 999)

    message: dict[str, Any] = {
        "token": fcm_token,
        "notification": {"title": title, "body": body},
        "android": {
            "priority": "high",
            "notification": {"sound": "default"},
        },
        "apns": {
            "headers": {"apns-priority": "10"},
            "payload": {
                "aps": {
                    "alert": {"title": title, "body": body},
                    "sound": "default",
                    "badge": capped_badge,
                },
            },
        },
        "data": data or {},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"message": message},
            timeout=10.0,
        )

    if resp.status_code == 200:
        return True

    log.warning("FCM send failed token=%s…: %d %s", fcm_token[:20], resp.status_code, resp.text)
    return False


# ── Redis badge ──────────────────────────────────────────────

_ttl_seconds: int | None = None


def _get_ttl() -> int:
    global _ttl_seconds
    if _ttl_seconds is None:
        _ttl_seconds = settings.fcm_push_history_ttl_days * 86400
    return _ttl_seconds


async def incr_badge(user_id: int) -> int:
    r = await get_redis()
    key = f"{PREFIX}badge:{user_id}"
    count = await r.incr(key)
    await r.expire(key, _get_ttl())
    return int(count)


async def get_badge(user_id: int) -> int:
    r = await get_redis()
    val = await r.get(f"{PREFIX}badge:{user_id}")
    return min(int(val), 999) if val else 0


async def reset_badge(user_id: int) -> None:
    r = await get_redis()
    await r.delete(f"{PREFIX}badge:{user_id}")


async def get_all_badges() -> dict[int, int]:
    """미열람 카운트가 1 이상인 전체 유저의 badge 현황."""
    r = await get_redis()
    result: dict[int, int] = {}
    async for key in r.scan_iter(match=f"{PREFIX}badge:*", count=200):
        uid_str = key.rsplit(":", 1)[-1]
        val = await r.get(key)
        if val and int(val) > 0:
            result[int(uid_str)] = min(int(val), 999)
    return result


async def count_badges() -> int:
    """미열람 badge 키 총 개수 (빠른 카운트)."""
    r = await get_redis()
    count = 0
    async for _ in r.scan_iter(match=f"{PREFIX}badge:*", count=500):
        count += 1
    return count


# ── 발송 이력 (Redis) ────────────────────────────────────────


async def _save_log(
    message_id: str,
    *,
    title: str,
    body: str,
    mode: str,
    sent_count: int,
    failed_count: int,
    sender: str,
    recipient_ids: list[int],
) -> None:
    r = await get_redis()
    ttl = _get_ttl()
    key = f"{PREFIX}log:{message_id}"
    await r.hset(key, mapping={
        "message_id": message_id,
        "title": title,
        "body": body,
        "mode": mode,
        "sent_count": str(sent_count),
        "failed_count": str(failed_count),
        "sender": sender,
        "sent_at": str(int(time.time())),
        "recipients": json.dumps(recipient_ids),
    })
    await r.expire(key, ttl)
    await r.lpush(f"{PREFIX}log_index", message_id)
    await r.expire(f"{PREFIX}log_index", ttl)


async def get_push_history(limit: int = 50) -> list[dict[str, Any]]:
    r = await get_redis()
    ids = await r.lrange(f"{PREFIX}log_index", 0, limit - 1)
    results = []
    for mid in ids:
        data = await r.hgetall(f"{PREFIX}log:{mid}")
        if data:
            results.append(data)
    return results


async def get_push_log(message_id: str) -> dict[str, Any] | None:
    r = await get_redis()
    data = await r.hgetall(f"{PREFIX}log:{message_id}")
    return data or None


# ── 메인 발송 함수 ───────────────────────────────────────────


class PushResult:
    def __init__(self, sent: int = 0, failed: int = 0) -> None:
        self.sent = sent
        self.failed = failed

    def to_dict(self) -> dict[str, Any]:
        return {"sent_count": self.sent, "failed_count": self.failed}


async def send_push(
    *,
    title: str,
    body: str,
    mode: Literal["broadcast", "individual"],
    targets: list[dict[str, Any]],
    data: dict[str, str] | None = None,
    sender: str = "admin",
    log_history: bool = True,
) -> PushResult:
    """FCM 발송.

    targets: list of {"user_id": int, "fcm_token": str}
    log_history: False 면 발송 이력(_save_log) 적재를 건너뛴다 (DM 등 고빈도 발송용). badge 증가는 유지.
    """
    result = PushResult()
    message_id = uuid.uuid4().hex[:12]

    for t in targets:
        user_id = t["user_id"]
        fcm_token = t.get("fcm_token")
        if not fcm_token:
            result.failed += 1
            continue

        badge = await incr_badge(user_id)
        ok = await _send_single(
            fcm_token=fcm_token,
            title=title,
            body=body,
            badge=badge,
            data=data,
        )
        if ok:
            result.sent += 1
        else:
            result.failed += 1

    if log_history:
        await _save_log(
            message_id,
            title=title,
            body=body,
            mode=mode,
            sent_count=result.sent,
            failed_count=result.failed,
            sender=sender,
            recipient_ids=[t["user_id"] for t in targets],
        )

    log.info("push %s: sent=%d failed=%d id=%s", mode, result.sent, result.failed, message_id)
    return result
