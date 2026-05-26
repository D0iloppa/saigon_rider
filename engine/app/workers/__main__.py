"""Worker dispatcher — Redis Streams consumer with agent routing.

Entrypoint: python -m app.workers
Reads messages from the stream, dispatches to registered agents by type.
"""

import asyncio
import logging
import os
import signal
import socket

from app.logging_config import configure_logging
from app.redis_client import (
    CONSUMER_GROUP,
    STREAM_KEY,
    close_redis,
    ensure_consumer_group,
    get_redis,
)
from app.workers.base import BaseAgent
from app.workers.event_agent import EventAgent
from app.workers.gps_agent import GpsAgent
from app.workers.quest_completed_agent import QuestCompletedAgent

configure_logging(os.getenv("SRE_LOG_LEVEL", "INFO"))
log = logging.getLogger(__name__)

BATCH_SIZE = 500
BLOCK_MS = 1000
CONSUMER_NAME = f"worker-{socket.gethostname()}"

_shutdown = False


def _handle_signal(*_):
    global _shutdown  # noqa: PLW0603
    _shutdown = True
    log.info("Shutdown signal received")


def _build_dispatch_table(agents: list[BaseAgent]) -> dict[str, BaseAgent]:
    table: dict[str, BaseAgent] = {}
    for agent in agents:
        for t in agent.message_types:
            table[t] = agent
    return table


AGENTS: list[BaseAgent] = [
    GpsAgent(),
    EventAgent(),
    QuestCompletedAgent(),
]
DISPATCH = _build_dispatch_table(AGENTS)


async def _process_batch(batch: list[tuple[str, dict]]) -> None:
    if not batch:
        return

    for msg_id, fields in batch:
        msg_type = fields.get("type", "")
        agent = DISPATCH.get(msg_type)
        if agent:
            await agent.handle(msg_id, fields)
        else:
            log.warning("No agent for type=%s id=%s", msg_type, msg_id)

    r = await get_redis()
    msg_ids = [msg_id for msg_id, _ in batch]
    await r.xack(STREAM_KEY, CONSUMER_GROUP, *msg_ids)
    log.info("Processed %d messages", len(batch))


async def _claim_pending() -> list[tuple[str, dict]]:
    r = await get_redis()
    pending = await r.xpending_range(
        STREAM_KEY, CONSUMER_GROUP, min="-", max="+", count=BATCH_SIZE
    )
    if not pending:
        return []

    stale_ids = [p["message_id"] for p in pending if p["time_since_delivered"] > 60_000]
    if not stale_ids:
        return []

    claimed = await r.xclaim(
        STREAM_KEY,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        min_idle_time=60_000,
        message_ids=stale_ids,
    )
    return [(msg_id, fields) for msg_id, fields in claimed if fields]


async def run() -> None:
    await ensure_consumer_group()
    r = await get_redis()

    agent_types = sorted({t for a in AGENTS for t in a.message_types})
    log.info(
        "Worker '%s' started — stream=%s group=%s agents=%s",
        CONSUMER_NAME,
        STREAM_KEY,
        CONSUMER_GROUP,
        agent_types,
    )

    while not _shutdown:
        try:
            pending_batch = await _claim_pending()
            if pending_batch:
                await _process_batch(pending_batch)

            results = await r.xreadgroup(
                CONSUMER_GROUP,
                CONSUMER_NAME,
                {STREAM_KEY: ">"},
                count=BATCH_SIZE,
                block=BLOCK_MS,
            )
            if not results:
                continue

            batch = []
            for _stream, messages in results:
                for msg_id, fields in messages:
                    if fields:
                        batch.append((msg_id, fields))

            await _process_batch(batch)

        except Exception:
            log.exception("Worker loop error, retrying in 2s")
            await asyncio.sleep(2)

    await close_redis()
    log.info("Worker '%s' stopped", CONSUMER_NAME)


def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    asyncio.run(run())


main()
