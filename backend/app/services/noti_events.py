"""알림 이벤트 발행 헬퍼 — noti:events Redis Stream (XADD).

요청 경로는 발행만 한다. 발행 실패는 로그만 남기고 예외를 전파하지 않는다
(Redis 순단이 DM 전송·매물 등록을 실패시키면 안 된다). 소비는 noti_worker.
"""

import json
import logging

from .redis_cache import get_client

log = logging.getLogger(__name__)

STREAM_KEY = "noti:events"
# 워커 장기 다운 시 스트림 무한 증식 방지 (DLQ maxlen 과 동일 취지)
_MAXLEN = 100_000


async def publish(event_type: str, payload: dict) -> None:
    # FD-6: Redis 순단 등 일시 장애 대비 1회 재시도 후에도 실패하면 로그만 남기고 삼킨다(호출 흐름 차단 금지).
    # 완전한 유실 방지(durable outbox — DB 적재 후 재발행)는 더 큰 설계 변경이 필요해 별도 과제로 분리.
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
