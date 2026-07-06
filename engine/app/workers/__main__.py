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
DLQ_STREAM_KEY = f"{STREAM_KEY}:dlq"
MAX_DELIVERIES = 5  # 이 횟수 이상 실패한 메시지는 DLQ로 격리 (포이즌 메시지 무한 재처리 차단)
HEARTBEAT_KEY = "sre:worker:heartbeat"
HEARTBEAT_TTL_S = 30

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


async def _process_batch(batch: list[tuple[str, dict]], deliveries: dict[str, int] | None = None) -> None:
    """메시지 단위 격리 처리 — 한 메시지의 실패가 배치 전체 xack 을 막지 않는다.

    성공(또는 DLQ 격리)한 메시지만 ack. 실패 메시지는 PEL에 남아 _claim_pending
    재클레임으로 재시도되고, MAX_DELIVERIES 도달 시 DLQ 스트림으로 이동한다.
    (과거 장애: 포이즌 1건이 배치 ack 을 막아 커밋 완료된 마일리지가 이중 적립됨)
    """
    if not batch:
        return

    r = await get_redis()
    ack_ids: list[str] = []
    deferred = 0
    for msg_id, fields in batch:
        msg_type = fields.get("type", "")
        agent = DISPATCH.get(msg_type)
        try:
            if agent:
                await agent.handle(msg_id, fields)
            else:
                log.warning("No agent for type=%s id=%s", msg_type, msg_id)
            ack_ids.append(msg_id)
        except Exception:
            n = (deliveries or {}).get(msg_id, 1)
            if n < MAX_DELIVERIES:
                deferred += 1
                log.exception(
                    "Message failed id=%s type=%s delivery=%d/%d — retry via reclaim",
                    msg_id, msg_type, n, MAX_DELIVERIES,
                )
                continue
            log.exception(
                "Poison message id=%s type=%s deliveries=%d → DLQ %s",
                msg_id, msg_type, n, DLQ_STREAM_KEY,
            )
            try:
                await r.xadd(
                    DLQ_STREAM_KEY,
                    {**fields, "orig_id": msg_id, "deliveries": str(n)},
                    maxlen=10_000,
                    approximate=True,  # 장기 장애 시 무한 증식 방지
                )
                ack_ids.append(msg_id)  # 본 스트림 PEL 에서 제거
            except Exception:
                # DLQ 기록 실패(Redis 순단)가 배치를 중단시키면 커밋 완료된 선행
                # 메시지들이 ack 없이 재실행(이중 적립)된다 — 이 메시지만 보류하고 계속
                deferred += 1
                log.exception("DLQ xadd failed id=%s — deferred, batch continues", msg_id)

    if ack_ids:
        await r.xack(STREAM_KEY, CONSUMER_GROUP, *ack_ids)
    if deferred:
        log.info("Processed %d messages (%d deferred for retry)", len(ack_ids), deferred)
    else:
        log.info("Processed %d messages", len(ack_ids))


async def _claim_pending() -> tuple[list[tuple[str, dict]], dict[str, int]]:
    r = await get_redis()
    pending = await r.xpending_range(
        STREAM_KEY, CONSUMER_GROUP, min="-", max="+", count=BATCH_SIZE
    )
    if not pending:
        return [], {}

    stale = [p for p in pending if p["time_since_delivered"] > 60_000]
    if not stale:
        return [], {}

    # xclaim 이 delivery 카운터를 +1 하므로 이번 시도의 횟수는 times_delivered + 1
    counts = {p["message_id"]: p["times_delivered"] + 1 for p in stale}
    claimed = await r.xclaim(
        STREAM_KEY,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        min_idle_time=60_000,
        message_ids=[p["message_id"] for p in stale],
    )
    # 스트림에서 트림된(fields 없는) 메시지는 처리 불가 — ack 해서 PEL 누수 방지.
    # Redis 7+ 는 XCLAIM 이 트림 메시지를 PEL 에서 지워 반환하지 않으므로 사실상 방어 코드.
    # redis-py 가 nil 엔트리를 (None, None) 으로 파싱하므로 msg_id None 은 반드시 걸러야
    # 한다 (xack(None) 은 DataError → 루프 정지 livelock).
    tombstones = [msg_id for msg_id, fields in claimed if msg_id and not fields]
    if tombstones:
        await r.xack(STREAM_KEY, CONSUMER_GROUP, *tombstones)
        log.warning("Acked %d trimmed messages stuck in PEL", len(tombstones))
    return [(msg_id, fields) for msg_id, fields in claimed if fields], counts


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
            pending_batch, pending_deliveries = await _claim_pending()
            if pending_batch:
                await _process_batch(pending_batch, pending_deliveries)

            results = await r.xreadgroup(
                CONSUMER_GROUP,
                CONSUMER_NAME,
                {STREAM_KEY: ">"},
                count=BATCH_SIZE,
                block=BLOCK_MS,
            )
            if results:
                batch = []
                for _stream, messages in results:
                    for msg_id, fields in messages:
                        if fields:
                            batch.append((msg_id, fields))
                await _process_batch(batch)

            # liveness 신호 — 사이클 정상 완료 시에만 갱신해 반복 예외(livelock)를
            # TTL 만료 = unhealthy 로 노출한다. (idle 시에도 block 1s 후 매번 도달.
            # 초대형 배치가 TTL(30s)×retries(3) = 90s 를 넘기면 일시 unhealthy 로
            # 보일 수 있으나 compose 는 재시작하지 않으므로 경보 신호로만 작동)
            await r.setex(HEARTBEAT_KEY, HEARTBEAT_TTL_S, CONSUMER_NAME)

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
