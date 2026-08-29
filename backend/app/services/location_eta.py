"""실시간 위치공유 채널 ETA/거리 계산 — 서버 계산·서버 방송.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §5, API 계약 `eta` 이벤트.
`routers/location_channels.py` 의 ping/목적지변경 핸들러가 `request_compute()` 를
fire-and-forget 으로 호출한다(응답 지연 없음) — 요청 스코프 db 세션을 넘기지 않고 이 모듈이
직접 `AsyncSessionLocal()` 을 연다(`services/funnel_events.py` 의 독립 세션 패턴과 동일).
예외는 로그만 남기고 삼킨다(ping 성공에 영향 없음).

라우팅 엔진 호출 상한(§5-2, 완료기준3): 세 겹의 방어선으로 보장한다.
1. **핑 시점 스코프 축소** — ping 은 핑한 사용자 1명만 재계산 대상으로 넘긴다(호출부 책임).
   전원 재계산은 목적지가 실제로 바뀌는 순간(dest_set/dest_resolved accepted)에만 1회.
2. **채널 단위 코얼레싱**(`request_compute`) — 같은 채널에 이미 처리 중인 루프가 있으면 새
   요청은 pending 사용자 집합에 합쳐지고, 처리 중인 루프가 끝난 뒤 그 집합을 한 번에
   재계산한다. 짧은 시간에 몰리는 다수의 ping 이 자연스럽게 하나의 배치(N≥3 matrix)로
   뭉친다 — 부하테스트(20명 동시 ping)에서 관측된 thundering herd(초당 수십 회 Valhalla
   호출)의 근본 원인이었다.
3. **사용자별 하드 게이트 + 캐시 키 in-flight 락** — 마지막 계산 후 60초 이내면 격자가
   바뀌었어도 무조건 보간(캐시 히트 여부 무관, §5-2). 60초가 지나 다시 계산이 필요한
   경우에도 같은 격자+목적지 키를 동시에 두 곳에서 계산하지 않도록 키 단위 락을 쥔다.

`compute_and_broadcast`(DB 세션을 여는 진입점)와 `_compute_for_members`(순수 로직 — 이미
로드된 멤버 객체를 받아 mutate + publish 만 한다, DB 세션 불필요)를 분리했다 — Phase 1
`_maybe_end_channel` 이 채널/멤버 객체만으로 판정하는 것과 같은 이유로, 단위테스트가 실 DB
없이 SimpleNamespace 로 이 함수를 직접 검증할 수 있게 한다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import LocationChannel, LocationChannelMember
from ..utils import haversine_m
from . import routing_engine
from .location_channel_broadcast import location_channel_broadcaster
from .redis_cache import get_client

log = logging.getLogger(__name__)

_GRID_METERS = 250.0
_LAT_DEGREE_M = 111_320.0  # 위도 1도 ≈ 111.32km
_CACHE_TTL_SEC = 60
# 이 이상이면 matrix 1회, 이하면 fetch_trip 개별 호출 (§5-3).
_MATRIX_THRESHOLD = 3

# 엔진 호출 횟수 계측(§8 부하테스트) — 이 프로세스는 root logger 에 핸들러가 없어 INFO 는
# lastResort(WARNING 이상만 통과)에 걸러진다(별건 이슈, 여기서 고치지 않는다). 로그 레벨은
# 의미상 올바른 INFO 로 두고, 대신 테스트/운영 확인용 인메모리 카운터를 별도로 유지한다.
# 프로세스 재시작 전까지 누적 — 부하테스트가 전후 스냅샷을 비교하는 용도.
engine_call_counts: dict[str, int] = {"matrix": 0, "route": 0}

# --- 채널 단위 코얼레싱(§완화1, thundering herd 대응) -----------------------
# 같은 채널에 대해 동시에 여러 ETA 계산 루프가 굴러가는 걸 막는다 — 이미 처리 중이면 새
# 요청은 pending 사용자 집합에 합쳐지고, 처리 중인 루프가 끝난 뒤 그 집합을 한 번에
# 재계산한다(아래로 무한정 쌓이지 않음 — 워커가 끝날 때마다 그 시점의 pending 을 통째로 비움).
_channel_pending: dict[uuid.UUID, set[uuid.UUID]] = {}
_channel_worker_active: set[uuid.UUID] = set()

# --- 캐시 키 단위 in-flight 락(§완화2) --------------------------------------
# 채널 단위 코얼레싱이 사실상 이미 "채널당 동시 계산 1개"를 보장하지만, 같은 격자+목적지
# 키를 동시에 두 곳에서 계산하지 않는다는 불변식을 캐시 키 레벨에서도 명시적으로 지킨다
# (Phase 3 다중 워커 확장 시에도 그대로 유효). 키가 많아져도 채널x격자x목적지 조합은
# 실사용 규모에서 무시할 수준이라 별도 청소는 하지 않는다.
_key_locks: dict[str, asyncio.Lock] = {}


def _get_key_lock(key: str) -> asyncio.Lock:
    lock = _key_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _key_locks[key] = lock
    return lock


def grid_key(lat: float, lng: float) -> str:
    """250m 격자 인덱스(§5-2). 경도 스텝은 위도로 cos 보정한다."""
    lat_step = _GRID_METERS / _LAT_DEGREE_M
    lng_step = _GRID_METERS / (_LAT_DEGREE_M * max(math.cos(math.radians(lat)), 0.01))
    return f"{math.floor(lat / lat_step)}:{math.floor(lng / lng_step)}"


def _cache_key(channel_id: uuid.UUID, grid: str, dest_lat: float, dest_lng: float) -> str:
    return f"lc:eta:{channel_id}:{grid}:{dest_lat:.5f}:{dest_lng:.5f}"


async def _get_cache(key: str) -> dict | None:
    try:
        client = await get_client()
        raw = await client.get(key)
        return json.loads(raw) if raw else None
    except Exception as exc:
        log.warning("location_eta cache read failed: %s", exc)
        return None


async def _set_cache(key: str, eta_s: int | None, distance_m: int, at: datetime) -> None:
    try:
        client = await get_client()
        await client.set(
            key, json.dumps({"etaS": eta_s, "distanceM": distance_m, "at": at.isoformat()}), ex=_CACHE_TTL_SEC
        )
    except Exception as exc:
        log.warning("location_eta cache write failed: %s", exc)


async def _apply(channel_id: uuid.UUID, member, eta_s: int | None, distance_m: int, now: datetime) -> None:
    """멤버 객체를 mutate 하고 `eta` 이벤트를 방송한다. commit 은 호출부 책임."""
    member.eta_s = eta_s
    member.distance_m = distance_m
    member.eta_computed_at = now
    envelope = {
        "type": "eta",
        "channelId": str(channel_id),
        "at": now.isoformat(),
        "payload": {
            "userId": str(member.user_id),
            "etaS": eta_s,
            "distanceM": distance_m,
            "computedAt": now.isoformat(),
        },
    }
    await location_channel_broadcaster.publish(str(channel_id), envelope)


async def _fetch_and_apply(
    channel_id: uuid.UUID,
    engine_url: str,
    needs_fetch: list,
    dest_lat: float,
    dest_lng: float,
    now: datetime,
) -> None:
    """캐시 미스 멤버들을 실제 라우팅 엔진으로 계산한다(§5-3: N≥3 matrix 1회 / N≤2 route 개별).

    호출부(`_compute_for_members`)가 이미 각 멤버의 cache_key in-flight 락을 쥔 채로 호출하고,
    호출 후 일괄 해제한다 — 여기서는 락을 신경 쓰지 않는다.
    """
    _t0 = datetime.now(UTC)
    if len(needs_fetch) >= _MATRIX_THRESHOLD:
        sources = [(float(m.lat), float(m.lng)) for m in needs_fetch]
        rows = await routing_engine.fetch_matrix_to_target(engine_url, sources, dest_lat, dest_lng)
        mode = "matrix"
    else:
        rows = []
        for member in needs_fetch:
            trip = await routing_engine.fetch_trip(engine_url, float(member.lat), float(member.lng), dest_lat, dest_lng)
            row = None
            if trip is not None:
                summary = trip.get("summary") or {}
                if summary.get("length") is not None and summary.get("time") is not None:
                    row = {"distance_m": round(summary["length"] * 1000), "duration_s": round(summary["time"])}
            rows.append(row)
        mode = "route"

    engine_call_counts[mode] = engine_call_counts.get(mode, 0) + 1
    log.info(
        "location_eta engine call: mode=%s n=%d elapsed_ms=%d",
        mode,
        len(needs_fetch),
        (datetime.now(UTC) - _t0).total_seconds() * 1000,
    )

    for member, row in zip(needs_fetch, rows, strict=True):
        lat, lng = float(member.lat), float(member.lng)
        cache_key = _cache_key(channel_id, grid_key(lat, lng), dest_lat, dest_lng)
        if row is None:
            # 커버리지 밖(§5-5): ETA NULL, 거리는 haversine 직선거리. W7-P2: 이 결과도 60초
            # 캐시한다 — 캐시하지 않으면 커버리지 밖 지점에서는 매 ping 마다 재호출하게 된다.
            distance_m = round(haversine_m(lat, lng, dest_lat, dest_lng))
            await _set_cache(cache_key, None, distance_m, now)
            await _apply(channel_id, member, None, distance_m, now)
            continue
        eta_s, distance_m = row["duration_s"], row["distance_m"]
        await _set_cache(cache_key, eta_s, distance_m, now)
        await _apply(channel_id, member, eta_s, distance_m, now)


async def _compute_for_members(
    channel_id: uuid.UUID,
    dest_lat: float,
    dest_lng: float,
    members: list,
    engine_url: str,
    now: datetime,
) -> None:
    """이미 로드된 멤버 객체 목록에 대해 하드게이트/캐시/보간/엔진호출을 판정한다. DB 세션 불필요."""
    needs_fetch: list = []
    claimed_locks: list[asyncio.Lock] = []

    for member in members:
        lat, lng = float(member.lat), float(member.lng)
        if member.arrived_at is not None:
            # 도착자는 ETA 계산 생략(§5-4) — 0/0 으로 방송.
            await _apply(channel_id, member, 0, 0, now)
            continue
        if not engine_url:
            await _apply(channel_id, member, None, round(haversine_m(lat, lng, dest_lat, dest_lng)), now)
            continue

        # 하드 게이트(§5-2/완료기준3, W7 대응): 마지막 계산 후 60초 이내면 격자가 바뀌었어도
        # 무조건 보간한다 — 캐시 히트 여부와 무관하게 사용자당 재계산 상한(≤1/60s)을 보장.
        if member.eta_computed_at is not None:
            since = (now - member.eta_computed_at).total_seconds()
            if 0 <= since < _CACHE_TTL_SEC:
                eta_s = member.eta_s
                if eta_s is not None:
                    eta_s = max(0, round(eta_s - since))
                await _apply(channel_id, member, eta_s, member.distance_m or 0, now)
                continue

        cache_key = _cache_key(channel_id, grid_key(lat, lng), dest_lat, dest_lng)
        lock = _get_key_lock(cache_key)
        await lock.acquire()
        cached = await _get_cache(cache_key)
        if cached is not None:
            lock.release()
            cached_at = datetime.fromisoformat(cached["at"])
            elapsed = max(0.0, (now - cached_at).total_seconds())
            eta_s = cached["etaS"]
            if eta_s is not None:
                eta_s = max(0, round(eta_s - elapsed))
            await _apply(channel_id, member, eta_s, cached["distanceM"], now)
            continue
        # 캐시 미스 — 락을 쥔 채로 fetch 대상에 등록한다. 다른 태스크가 같은 키를 요청하면
        # 이 락에서 대기했다가, 아래 배치 fetch 가 캐시를 채운 뒤에야 재확인하게 된다.
        needs_fetch.append(member)
        claimed_locks.append(lock)

    try:
        if needs_fetch:
            await _fetch_and_apply(channel_id, engine_url, needs_fetch, dest_lat, dest_lng, now)
    finally:
        for lock in claimed_locks:
            lock.release()


async def compute_and_broadcast(channel_id: uuid.UUID, user_ids: list[uuid.UUID]) -> None:
    """주어진 사용자 집합의 ETA/거리를 계산해 DB 갱신 + `eta` 이벤트로 방송하는 실행부.

    채널 단위 코얼레싱(`request_compute`)이나 목적지 변경 등 호출부가 이미 "지금 이
    사용자 집합을 한 번에 계산하기로" 정한 뒤 호출한다 — 이 함수 자체는 코얼레싱을 하지
    않는다(그건 `request_compute` 의 책임).

    예외는 전부 로그로 흡수한다(ping 응답 경로와 완전히 분리돼 있어 여기서 올려도 아무도 보지
    않는다 — 조용히 삼키지 않으면 asyncio 가 "Task exception was never retrieved" 만 남긴다).
    """
    try:
        async with AsyncSessionLocal() as db:
            channel = await db.get(LocationChannel, channel_id)
            if channel is None or channel.ended_at is not None or channel.dest_lat is None or channel.dest_lng is None:
                return
            dest_lat, dest_lng = float(channel.dest_lat), float(channel.dest_lng)

            result = await db.execute(
                select(LocationChannelMember).where(
                    LocationChannelMember.channel_id == channel_id,
                    LocationChannelMember.user_id.in_(user_ids),
                    LocationChannelMember.left_at.is_(None),
                )
            )
            members = [m for m in result.scalars().all() if m.lat is not None and m.lng is not None]
            if not members:
                return

            now = datetime.now(UTC)
            engine_url = os.getenv("ROUTING_ENGINE_URL", "").strip()
            await _compute_for_members(channel_id, dest_lat, dest_lng, members, engine_url, now)
            await db.commit()
    except Exception:
        log.exception("location_eta.compute_and_broadcast failed: channel_id=%s", channel_id)


async def request_compute(channel_id: uuid.UUID, user_ids: list[uuid.UUID]) -> None:
    """채널 단위 코얼레싱 진입점(§완화1) — router 의 ping/목적지변경 핸들러가 호출한다.

    이미 이 채널에 대해 처리 중인 루프가 있으면 새 사용자 집합을 pending 에 합치기만 하고
    반환한다(추가 태스크 생성 없음). 처리 중인 루프가 끝나면 그 시점까지 합쳐진 pending 을
    한 번에 재계산한다 — 짧은 시간에 몰리는 여러 ping 이 자연스럽게 하나의 배치(N≥3 matrix)로
    뭉친다.
    """
    pending = _channel_pending.setdefault(channel_id, set())
    pending.update(user_ids)
    if channel_id in _channel_worker_active:
        return
    _channel_worker_active.add(channel_id)
    try:
        while True:
            batch = _channel_pending.pop(channel_id, None)
            if not batch:
                return
            await compute_and_broadcast(channel_id, list(batch))
    finally:
        _channel_worker_active.discard(channel_id)
