"""실시간 위치공유 채널 이벤트 브로드캐스트.

워키토키(`d_modules/WalkieTalkie/packages/server/walkie_talkie/broadcast.py`)와 같은
프로세스-내 pub/sub 패턴을 따르되, 이 채널은 이벤트 봉투에 좌표 등 **페이로드를 직접 싣는다**
(설계 SoT §3-4, D3 — 워키토키의 "무페이로드" 원칙은 이 채널에 적용하지 않는다).

`close_for_user`: 특정 사용자가 나갔는데(leave) 그 사용자의 SSE 연결이 아직 열려 있는 경우,
채널 전체 브로드캐스트(`publish`)와 별개로 **그 사용자의 구독 큐만** 즉시 종료 신호를 넣는다
(P1 — 핸드셰이크 때만 멤버십을 검사하면 나간 뒤에도 계속 수신하는 문제).

**단일 워커 전제** — 워커를 2개 이상으로 늘리면 이 브로드캐스터로는 인스턴스 간 이벤트가
전달되지 않는다. 그때는 Redis 등으로 교체한다(Phase 3, 태스크 문서 §4 "공통 부채").
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import Any

# 특정 사용자의 구독만 즉시 끊을 때 큐에 넣는 종료 신호(§P1). 브로드캐스트 이벤트 스키마 밖의
# 내부 신호이므로 클라이언트에는 절대 전달되지 않는다 — 스트림 소비 루프가 감지 즉시 반환한다.
STREAM_CLOSED_SIGNAL: dict[str, Any] = {"type": "_stream_closed"}


class InProcessLocationChannelBroadcaster:
    def __init__(self, max_queue: int = 64) -> None:
        self._subs: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._user_subs: dict[tuple[str, str], set[asyncio.Queue[dict[str, Any]]]] = {}
        self._max_queue = max_queue

    async def publish(self, channel_id: str, event: dict[str, Any]) -> None:
        # 느린 구독자 때문에 발행이 막히면 안 된다 — 재연결 시 GET state 로 재동기화된다.
        for q in list(self._subs.get(channel_id, ())):
            with suppress(asyncio.QueueFull):
                q.put_nowait(event)

    async def close_for_user(self, channel_id: str, user_id: str) -> None:
        """이 사용자의 이 채널 구독 큐(들)에 종료 신호를 넣는다 — 즉시 나가게(leave) 됐을 때 사용."""
        for q in list(self._user_subs.get((channel_id, user_id), ())):
            with suppress(asyncio.QueueFull):
                q.put_nowait(STREAM_CLOSED_SIGNAL)

    @asynccontextmanager
    async def subscribe(
        self, channel_id: str, user_id: str | None = None
    ) -> AsyncIterator["asyncio.Queue[dict[str, Any]]"]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=self._max_queue)
        self._subs.setdefault(channel_id, set()).add(q)
        user_key = (channel_id, user_id) if user_id is not None else None
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
            if user_key is not None:
                user_subs = self._user_subs.get(user_key)
                if user_subs is not None:
                    user_subs.discard(q)
                    if not user_subs:
                        self._user_subs.pop(user_key, None)

    @property
    def subscriber_count(self) -> int:
        return sum(len(v) for v in self._subs.values())


location_channel_broadcaster = InProcessLocationChannelBroadcaster()
