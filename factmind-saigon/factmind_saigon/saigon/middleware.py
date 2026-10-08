"""Bot-visit recording (plan §3.5 M1, C7). Only requests whose UA nominates a bot are recorded; ip/ua are kept for VERIFIED visits only."""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import re
import time
from typing import Optional

from app.database import AsyncSessionLocal
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware

from factmind_saigon.core.bots import VN_POLICY, Resolver, classify, load_policy, verify

from .storage import FmBotFeed, FmBotVisit

log = logging.getLogger(__name__)

POLICY = load_policy(VN_POLICY)
RESOLVER = Resolver()
_FEEDS_TTL = 600
_VERDICT_TTL = 3600
_VERDICT_MAX = 5000
_FM_PREFIXES = ("/b/", "/l/", "/ko/l/", "/en/l/")
_KEY_FILE = re.compile(r"^/[A-Za-z0-9-]+\.txt$")


def _trusted_proxies() -> list:
    nets = []
    for part in (os.getenv("FM_TRUSTED_PROXIES") or "").split(","):
        if part.strip():
            try:
                nets.append(ipaddress.ip_network(part.strip(), strict=False))
            except ValueError:
                log.warning("FM_TRUSTED_PROXIES: ignored invalid CIDR %r", part.strip())
    return nets


TRUSTED = _trusted_proxies()


def _client_ip(remote_addr, headers, trusted) -> Optional[str]:
    """Client address behind trusted hops. X-Real-IP is ignored (the container nginx overwrites it with the gateway address);
    X-Forwarded-For is walked right to left, skipping trusted hops, and the first untrusted address wins."""
    try:
        peer = ipaddress.ip_address(remote_addr or "")
    except ValueError:
        return None
    if not any(peer in net for net in trusted):
        return str(peer)  # no proxy in front of us
    for token in reversed((headers.get("X-Forwarded-For") or "").split(",")):
        try:
            hop = ipaddress.ip_address(token.strip())
        except ValueError:
            continue
        if not any(hop in net for net in trusted):
            return str(hop)
    return None


def path_kind(path: str) -> Optional[str]:
    """fm path -> profile|facts|list|sitemap|rss|key, None when the path is not an fm public path."""
    if path in ("/sitemap.xml", "/sitemap-fm.xml"):
        return "sitemap"
    if path == "/rss.xml":
        return "rss"
    if _KEY_FILE.match(path) and path != "/robots.txt":
        return "key"
    for prefix in _FM_PREFIXES:
        if path.startswith(prefix) or path == prefix.rstrip("/"):
            rest = path[len(prefix):]
            if prefix == "/b/":
                return "facts" if rest.endswith("facts.json") else "profile"
            if rest == "":
                return "profile"  # platform hub
            return "facts" if rest == "facts.json" else "list"
    return None


_feeds_cache: dict = {"at": float("-inf"), "value": {}}
_feeds_lock = asyncio.Lock()
_verdicts: dict = {}


async def _feeds() -> dict:
    """{feed_id: ([networks], sha, 'ok')} in the shape core.verify expects, cached in memory."""
    if time.monotonic() - _feeds_cache["at"] < _FEEDS_TTL:
        return _feeds_cache["value"]
    async with _feeds_lock:  # one coroutine reloads, the rest wait and reuse its result
        if time.monotonic() - _feeds_cache["at"] < _FEEDS_TTL:
            return _feeds_cache["value"]
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(FmBotFeed))).scalars().all()
        value = {r.feed_id: ([ipaddress.ip_network(n) for n in r.networks], r.sha, "ok") for r in rows}
        _feeds_cache.update(at=time.monotonic(), value=value)
        return value


async def _verdict(bot: dict, ip: Optional[str]) -> tuple:
    """-> (verdict, {method feed|rdns|none, reason, evidence}); cached per (bot, ip) for an hour."""
    key = (bot["id"], ip)
    hit = _verdicts.get(key)
    if hit and time.monotonic() - hit[0] < _VERDICT_TTL:
        return hit[1]
    verdict, reason, how, evidence = await asyncio.to_thread(verify, bot, ip, await _feeds(), RESOLVER)
    result = (verdict, {"method": {"ip_feed": "feed", "reverse_dns": "rdns"}.get(how, "none"), "reason": reason, "evidence": evidence})
    if len(_verdicts) >= _VERDICT_MAX:
        _verdicts.clear()
    _verdicts[key] = (time.monotonic(), result)
    return result


async def _record(bot: dict, kind: str, path: str, method: str, ua: str, remote_addr, headers, status_code: int) -> None:
    try:
        ip = _client_ip(remote_addr, headers, TRUSTED)
        verdict, why = await _verdict(bot, ip)
        verified = verdict == "VERIFIED"
        async with AsyncSessionLocal() as db:
            db.add(FmBotVisit(
                bot_id=bot["id"], verdict=verdict, path=path[:500], path_kind=kind, method=method,
                ip=ip if verified else None, ua=ua[:500] if verified else None,
                evidence={**why, "bot_class": bot.get("class"), "status_code": status_code},
            ))
            await db.commit()
    except Exception:
        log.exception("fm bot visit record failed")


_tasks: set = set()


class FmBotVisitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        kind = path_kind(request.url.path)
        if kind is None:
            return await call_next(request)
        ua = request.headers.get("user-agent") or ""
        status, bot = classify(ua, POLICY)
        response = await call_next(request)
        if status == "bot":
            task = asyncio.create_task(_record(
                bot, kind, request.url.path, request.method, ua,
                request.client.host if request.client else None, request.headers, response.status_code,
            ))
            _tasks.add(task)  # keep a reference until done
            task.add_done_callback(_tasks.discard)
        return response
