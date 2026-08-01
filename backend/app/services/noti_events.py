"""알림 이벤트 발행 헬퍼 — noti:events Redis Stream (XADD).

두 가지 발행 경로:
  - ``enqueue(db, ...)`` — FD-6 transactional outbox. 도메인 변경과 **같은 트랜잭션**으로
    notification_outbox 에 적재한다(커밋은 호출부). noti_worker relay 가 stream 으로 발행하므로
    Redis 순단·커밋~발행 사이 프로세스 종료에도 유실되지 않는다. DM·매물 등 사용자 대면 이벤트용.
  - ``publish(...)`` — 즉시 XADD(1회 재시도 후 삼킴). 이미 커밋을 마친 운영/어드민 이벤트용
    best-effort 경로. Redis 순단 시 해당 이벤트는 유실될 수 있다(운영자 가시 액션이라 허용).

소비는 noti_worker.
"""

import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import NotificationOutbox
from .redis_cache import get_client

log = logging.getLogger(__name__)

STREAM_KEY = "noti:events"
# 워커 장기 다운 시 스트림 무한 증식 방지 (DLQ maxlen 과 동일 취지)
_MAXLEN = 100_000


def enqueue(db: AsyncSession, event_type: str, payload: dict) -> None:
    """FD-6: 도메인 트랜잭션에 알림 이벤트를 적재한다(커밋은 호출부 책임).

    호출부의 ``db.commit()`` 으로 도메인 변경과 원자적으로 커밋된다. 커밋이 롤백되면 이벤트도
    함께 사라져 '커밋 안 된 알림'이 새지 않는다.
    """
    db.add(NotificationOutbox(event_type=event_type, payload=payload))


async def publish(event_type: str, payload: dict) -> None:
    # 이미 커밋을 마친 운영/어드민 이벤트용 best-effort 발행. Redis 순단 대비 1회 재시도 후에도
    # 실패하면 로그만 남기고 삼킨다(호출 흐름 차단 금지). 유실 없는 durable 경로가 필요한 사용자
    # 대면 이벤트(DM·매물 등)는 transactional outbox 인 enqueue() 를 쓴다(FD-6).
    for attempt in range(2):
        try:
            client = await get_client()
            await client.xadd(
                STREAM_KEY,
                {"type": event_type, "payload": json.dumps(payload, default=str)},
                maxlen=_MAXLEN,
                approximate=True,
            )
            return
        except Exception as e:
            if attempt == 0:
                continue
            log.error("noti event publish failed after retry type=%s: %s", event_type, e)
