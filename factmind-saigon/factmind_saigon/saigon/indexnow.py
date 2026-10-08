"""IndexNow submission (plan §3.5 M4). A 2xx means "received", never "indexed"; no retries. Empty key = record only."""
from __future__ import annotations

import asyncio
import os
from urllib.parse import urlsplit

from sqlalchemy.ext.asyncio import AsyncSession

from factmind_saigon.core.indexnow import INDEXNOW_ENGINES, INDEXNOW_KEY, indexnow_send

from .constants import USER_AGENT, public_origin
from .storage import record_event


def configured_key() -> str:
    return os.getenv("FM_INDEXNOW_KEY") or ""


async def notify(db: AsyncSession, subject_id, urls: list) -> dict:
    """Send urls to the engines in FM_INDEXNOW_ENGINES (default bing) and record one `index_notified` event. -> {'sent': bool}."""
    key = configured_key()
    if not key or not INDEXNOW_KEY.fullmatch(key):
        reason = "no_key" if not key else "invalid_key"
        await record_event(db, "index_notified", {"skipped": True, "reason": reason, "urls": urls}, subject_id)
        return {"sent": False}
    known = dict(INDEXNOW_ENGINES)
    names = [n.strip().lower() for n in (os.getenv("FM_INDEXNOW_ENGINES") or "bing").split(",") if n.strip()]
    origin = public_origin()
    body = {"host": urlsplit(origin).netloc, "key": key, "keyLocation": origin + "/b/" + key + ".txt", "urlList": urls}
    results = []
    for name in names:
        if name not in known:
            results.append({"engine": name, "ignored": True})
            continue
        try:
            status = await asyncio.to_thread(indexnow_send, known[name], body, user_agent=USER_AGENT)
        except Exception as e:  # network failure is evidence, not an error to raise
            results.append({"engine": name, "status": None, "error": str(e)[:200]})
        else:
            results.append({"engine": name, "status": status})
    await record_event(db, "index_notified", {"urls": urls, "results": results}, subject_id)
    return {"sent": any(200 <= (r.get("status") or 0) < 300 for r in results)}
