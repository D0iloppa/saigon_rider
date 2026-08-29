"""다중 워커 이벤트 브로드캐스터 — Redis pub/sub 구현 (Phase 3, 260829 SoT §4 "공통 부채"/§8 Phase 3-C).

워키토키(`d_modules/.../broadcast.py`)와 위치채널(`services/location_channel_broadcast.py`)은
지금까지 프로세스 내 pub/sub(`InProcess*`)만 있어 워커를 2개 이상으로 늘리면 인스턴스 간 이벤트가
전달되지 않는다. `RedisBroadcaster` 는 두 채널이 공유하는 범용 구현이다 — 실제 redis pubsub
채널 하나(`{prefix}{channel_id}`)당 이 프로세스의 리스너 태스크 1개가 로컬 구독 큐들에 팬아웃한다.

`close_for_user`: 이 프로세스에 로컬로 열린 (channel_id, user_id) 큐에는 즉시 `signal` 을 넣고,
다른 워커 프로세스의 동일 구독자를 위해 컨트롤 메시지(`{"type": "_close", "userId": ...}`)를
같은 redis 채널에 publish 한다 — 모든 워커의 리스너가 이를 받아 각자 로컬에 있는 (channel_id,
userId) 큐에만 `signal` 을 전달하고, 채널 전체로는 팬아웃하지 않는다.

선택은 env `REALTIME_BROADCAST`(`redis` | `inprocess`, 기본 `inprocess`) — 호출부(`location_channel_
broadcast.py`, `walkie_module.py`)가 이 값을 보고 어떤 구현을 쓸지 고른다. 이 모듈 자체는 항상
`RedisBroadcaster` 를 정의만 하고, 실제 선택은 하지 않는다.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Protocol, runtime_checkable

from .redis_cache import get_client

log = logging.getLogger(__name__)

_CONTROL_CLOSE = "__lc_close__"


@runtime_checkable
class Broadcaster(Protocol):
    async def publish(self, channel_id: str, event: Any) -> None: ...

    def subscribe(self, channel_id: str, subscriber_id: str | None = None): ...

    @property
    def subscriber_count(self) -> int: ...


class RedisBroadcaster:
    """redis PUBLISH/SUBSCRIBE 기반. 워커 프로세스마다 redis 채널당 리스너 태스크 1개를 두고,
    수신한 이벤트를 이 프로세스 안의 로컬 asyncio.Queue 들에 팬아웃한다."""

    def __init__(self, prefix: str, max_queue: int = 64) -> None:
        self._prefix = prefix
        self._max_queue = max_queue
        self._subs: dict[str, set[asyncio.Queue]] = {}
        self._user_subs: dict[tuple[str, str], set[asyncio.Queue]] = {}
        self._listener_tasks: dict[str, asyncio.Task] = {}

    def _redis_channel(self, channel_id: str) -> str:
        return f"{self._prefix}{channel_id}"

    async def publish(self, channel_id: str, event: Any) -> None:
        client = await get_client()
        await client.publish(self._redis_channel(channel_id), json.dumps(event, default=str))

    async def close_for_user(self, channel_id: str, user_id: str, signal: Any = None) -> None:
        """`user_id` 의 이 채널 로컬 구독 큐에만 `signal`(기본값: 제너릭 close 신호)을 전달한다.
        다른 워커의 동일 구독자를 위해 컨트롤 메시지를 publish 한다(로컬 팬아웃과는 별개 채널
        타입 판정 — `_listen` 이 이를 일반 이벤트와 구분해 처리한다)."""
        if signal is None:
            signal = {"type": "_close", "userId": user_id}
        self._deliver_to_user(channel_id, user_id, signal)
        client = await get_client()
        await client.publish(
            self._redis_channel(channel_id),
            json.dumps({"__control__": _CONTROL_CLOSE, "userId": user_id, "signal": signal}, default=str),
        )

    def _deliver_to_user(self, channel_id: str, user_id: str, signal: Any) -> None:
        for q in list(self._user_subs.get((channel_id, user_id), ())):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(signal)

    def _fanout(self, channel_id: str, event: Any) -> None:
        for q in list(self._subs.get(channel_id, ())):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(event)

    async def _listen(self, channel_id: str) -> None:
        client = await get_client()
        pubsub = client.pubsub()
        redis_channel = self._redis_channel(channel_id)
        try:
            await pubsub.subscribe(redis_channel)
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    event = json.loads(message["data"])
                except (TypeError, ValueError):
                    continue
                if isinstance(event, dict) and event.get("__control__") == _CONTROL_CLOSE:
                    self._deliver_to_user(channel_id, event.get("userId"), event.get("signal"))
                    continue
                self._fanout(channel_id, event)
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("realtime_broadcast listener failed channel=%s", channel_id)
        finally:
            with contextlib.suppress(Exception):
                await pubsub.unsubscribe(redis_channel)
                await pubsub.close()

    def _ensure_listener(self, channel_id: str) -> None:
        if channel_id in self._listener_tasks:
            return
        self._listener_tasks[channel_id] = asyncio.create_task(self._listen(channel_id))

    @asynccontextmanager
    async def subscribe(self, channel_id: str, subscriber_id: str | None = None) -> AsyncIterator[asyncio.Queue]:
        self._ensure_listener(channel_id)
        q: asyncio.Queue = asyncio.Queue(maxsize=self._max_queue)
        self._subs.setdefault(channel_id, set()).add(q)
        user_key = (channel_id, subscriber_id) if subscriber_id is not None else None
        if user_key is not None:
            self._user_subs.setdefault(user_key, set()).add(q)
        try:
            yield q
        finally:
            subs = self._subs.get(channel_id)
            if subs is not None:
                subs.discard(q)
                if not subs:
                    self._subs.pop(channel_id, None)
                    task = self._listener_tasks.pop(channel_id, None)
                    if task is not None:
                        task.cancel()
            if user_key is not None:
                user_subs = self._user_subs.get(user_key)
                if user_subs is not None:
                    user_subs.discard(q)
                    if not user_subs:
                        self._user_subs.pop(user_key, None)

    @property
    def subscriber_count(self) -> int:
        return sum(len(v) for v in self._subs.values())
