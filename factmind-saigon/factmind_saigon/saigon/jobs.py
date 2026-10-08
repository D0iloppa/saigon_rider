"""fm scheduler jobs (plan §3.7): official bot IP feeds, publication re-verification, bot-visit retention.

Same shape as backend/app/jobs/*: own session, True on success, exception -> log + False.
"""
from __future__ import annotations

import asyncio
import functools
import hashlib
import logging
import urllib.error
import urllib.request
from datetime import timedelta

from app.database import AsyncSessionLocal
from app.models import utcnow
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from factmind_saigon.core.bots import VN_POLICY, load_policy, parse_feed

from . import publishing
from .constants import USER_AGENT
from .indexnow import notify_after_commit
from .storage import FmBotFeed, FmBotVisit, FmSubject

log = logging.getLogger(__name__)

_FEED_TIMEOUT = 10
_FEED_MAX_BYTES = 5_000_000
_VISIT_RETENTION = timedelta(days=30)


_locks: dict = {}


def _single_flight(fn):
    """Per-job guard shared by the scheduler and manual runs: a run that overlaps a running one returns False at once."""
    lock = _locks.setdefault(fn.__name__, asyncio.Lock())

    @functools.wraps(fn)
    async def wrapper():
        if lock.locked():
            log.warning("fm job %s already running; skipped", fn.__name__)
            return False
        async with lock:
            return await fn()

    return wrapper


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # feed URLs are final addresses (bot_policy.json note)
        return None


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.build_opener(_NoRedirect).open(req, timeout=_FEED_TIMEOUT) as resp:
        return resp.read(_FEED_MAX_BYTES)


@_single_flight
async def fm_refresh_bot_feeds() -> bool:
    try:
        feeds = load_policy(VN_POLICY)["feeds"]
        raws = await asyncio.gather(*(asyncio.to_thread(_fetch, spec["url"]) for spec in feeds.values()), return_exceptions=True)
        failed = 0
        async with AsyncSessionLocal() as db:
            for feed_id, raw in zip(feeds, raws):
                try:
                    if isinstance(raw, BaseException):
                        raise raw
                    _created, cidrs = parse_feed(raw)
                except (OSError, urllib.error.URLError, ValueError) as e:  # one bad feed must not block the rest
                    failed += 1
                    log.warning("fm bot feed %s refresh failed: %s", feed_id, e)
                    continue
                stmt = insert(FmBotFeed).values(feed_id=feed_id, networks=cidrs, sha=hashlib.sha256(raw).hexdigest(), refreshed_at=utcnow())
                await db.execute(
                    stmt.on_conflict_do_update(
                        index_elements=["feed_id"],
                        set_={"networks": stmt.excluded.networks, "sha": stmt.excluded.sha, "refreshed_at": stmt.excluded.refreshed_at},
                    )
                )
            await db.commit()
        return failed == 0
    except Exception:
        log.exception("fm bot feed refresh failed")
        return False


@_single_flight
async def fm_reverify() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            ids = (await db.execute(select(FmSubject.id).where(FmSubject.status == "published"))).scalars().all()
        ok = True
        for subject_id in ids:
            try:
                async with AsyncSessionLocal() as db:
                    result = await publishing.verify(db, subject_id)
                    await db.commit()
                    urls = result.get("indexnow_urls") or []
                    if urls:
                        await notify_after_commit(db, subject_id, urls, mark_published=True)
            except Exception:  # one subject failing must not stop the rest
                ok = False
                log.exception("fm reverify failed for subject %s", subject_id)
        return ok
    except Exception:
        log.exception("fm reverify failed")
        return False


@_single_flight
async def fm_purge_bot_visits() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(FmBotVisit).where(FmBotVisit.observed_at < utcnow() - _VISIT_RETENTION))
            await db.commit()
        return True
    except Exception:
        log.exception("fm purge bot visits failed")
        return False


def register_fm_jobs(scheduler) -> None:
    # 보관정책(30일) 정리 — purge_old_notifications(03:20)·purge_old_dm_messages 와 같은 새벽 정리 시간대.
    scheduler.add_job(fm_purge_bot_visits, CronTrigger(hour=3, minute=25), id="fm_purge_bot_visits", max_instances=1, coalesce=True)
    # 봇 공식 IP 피드 — 트래픽 저점, 04:00 유가 수집과 겹치지 않게 40분.
    scheduler.add_job(fm_refresh_bot_feeds, CronTrigger(hour=4, minute=40), id="fm_refresh_bot_feeds", max_instances=1, coalesce=True)
    # 재검증 — 피드 갱신 30분 뒤, 05:30 침수 예측 이전.
    scheduler.add_job(fm_reverify, CronTrigger(hour=5, minute=10), id="fm_reverify", max_instances=1, coalesce=True)
