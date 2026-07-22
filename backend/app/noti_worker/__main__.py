"""알림 워커 — noti:events Redis Streams consumer.

Entrypoint: python -m app.noti_worker
BFF 요청 경로가 발행한 알림 이벤트를 소비해 파이프라인을 수행한다:
타입 분기 → (키워드 매칭) → notification_settings 푸시 게이트 → notifications INSERT → FCM 푸시.
인앱 notifications row 는 항상 기록하고, 설정 토글은 푸시만 게이트한다.

소비 루프(xreadgroup / xpending+xclaim 재할당 / DLQ / graceful shutdown)는
engine/app/workers/__main__.py 의 검증된 패턴을 미러링한다.
"""

import asyncio
import json
import logging
import os
import signal
import socket
import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.engine_client import engine_client
from app.models import MarketplaceKeywordAlert, Notification, NotificationSettings
from app.services.noti_events import STREAM_KEY
from app.services.redis_cache import get_client

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger(__name__)

CONSUMER_GROUP = "noti-workers"
CONSUMER_NAME = f"noti-worker-{socket.gethostname()}"
DLQ_STREAM_KEY = f"{STREAM_KEY}:dlq"
BATCH_SIZE = 100
BLOCK_MS = 1000
MAX_DELIVERIES = 5  # 이 횟수 이상 실패한 메시지는 DLQ로 격리 (포이즌 메시지 무한 재처리 차단)
HEARTBEAT_KEY = "noti:worker:heartbeat"
HEARTBEAT_TTL_S = 30

_shutdown = False


def _handle_signal(*_):
    global _shutdown
    _shutdown = True
    log.info("Shutdown signal received")


# ── 파이프라인 헬퍼 ─────────────────────────────────────────


async def _push_enabled(db, user_id: uuid.UUID, field: str) -> bool:
    """notification_settings 푸시 게이트 — row 없는 유저는 default true 의미론."""
    row = await db.get(NotificationSettings, user_id)
    return bool(getattr(row, field)) if row else True


async def _try_push(user_id: str, title: str, body: str, link: str) -> None:
    """재시도 가능한 provider 실패만 제한 재시도하고 별도 DLQ로 격리한다."""
    for attempt in range(1, MAX_DELIVERIES + 1):
        try:
            await engine_client.notify_user_push(user_id, title=title, body=body, data={"navigateTo": link})
            log.info("push sent user=%s link=%s", user_id, link)
            return
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 503:
                log.warning("permanent push failure user=%s status=%d", user_id, exc.response.status_code)
                return
        except httpx.TransportError:
            pass
        except Exception as exc:
            log.warning("permanent push failure user=%s: %s", user_id, exc)
            return
        if attempt < MAX_DELIVERIES:
            await asyncio.sleep(min(2 ** (attempt - 1), 8))

    r = await get_client()
    await r.xadd(
        DLQ_STREAM_KEY,
        {
            "type": "push_failed",
            "payload": json.dumps({"user_id": user_id, "title": title, "body": body, "link": link}),
            "deliveries": str(MAX_DELIVERIES),
        },
        maxlen=10_000,
        approximate=True,
    )
    log.error("retryable push failure moved to DLQ user=%s", user_id)


# ── 타입별 핸들러 ───────────────────────────────────────────


async def _handle_dm_message(payload: dict) -> None:
    recipient_id = uuid.UUID(payload["recipient_id"])
    conv_id = payload["conversation_id"]
    title = payload.get("sender_nickname") or "새 메시지"
    body = payload.get("preview") or ""
    link = f"dm&id={conv_id}"

    async with AsyncSessionLocal() as db:
        db.add(
            Notification(
                user_id=recipient_id, type="SOCIAL", title=title, body=body, link=link, created_at=datetime.now(UTC)
            )
        )
        push_ok = await _push_enabled(db, recipient_id, "social")
        await db.commit()

    if push_ok:
        await _try_push(str(recipient_id), title, body, link)
    else:
        log.info("push skipped (social=off) user=%s conv=%s", recipient_id, conv_id)


async def _handle_listing_created(payload: dict) -> None:
    """매물 제목 키워드 매칭 (market._notify_keyword_matches 이관) — 대소문자 무시, 등록자 본인 제외."""
    listing_title = payload.get("title") or ""
    title_lower = listing_title.lower()
    if not title_lower:
        return
    seller_id = uuid.UUID(payload["seller_id"])
    link = f"market&id={payload['listing_id']}"

    pushes: list[tuple[str, str]] = []
    async with AsyncSessionLocal() as db:
        alerts = (await db.execute(select(MarketplaceKeywordAlert))).scalars().all()
        seen: set[uuid.UUID] = set()
        for alert in alerts:
            if alert.user_id == seller_id or alert.user_id in seen:
                continue
            if alert.keyword.lower() not in title_lower:
                continue
            seen.add(alert.user_id)
            noti_title = f"🔔 {alert.keyword}"
            db.add(
                Notification(
                    user_id=alert.user_id,
                    type="KEYWORD",
                    title=noti_title,
                    body=listing_title,
                    link=link,
                    created_at=datetime.now(UTC),
                )
            )
            if await _push_enabled(db, alert.user_id, "keyword_alert"):
                pushes.append((str(alert.user_id), noti_title))
            else:
                log.info("push skipped (keyword_alert=off) user=%s listing=%s", alert.user_id, payload["listing_id"])
        await db.commit()

    for user_id, noti_title in pushes:
        await _try_push(user_id, noti_title, listing_title, link)


_BIZ_RESULT_COPY = {
    "APPROVED": ("비즈니스 파트너 승인", "'{name}' 계정이 승인되었습니다. 지금 바로 광고를 등록해보세요."),
    "REJECTED": ("비즈니스 파트너 반려", "'{name}' 신청이 반려되었습니다. 사유: {reason}"),
    "SUSPENDED": ("비즈니스 계정 정지", "'{name}' 계정이 운영정지되었습니다."),
}


async def _handle_biz_profile_reviewed(payload: dict) -> None:
    """비즈니스 프로필 심사 결과 통지(SGR-312 BP-3).

    계정 상태 변경(승인/반려/정지)은 트랜잭셔널 알림으로 취급해 푸시 게이트 없이 발송한다 —
    NotificationSettings 의 기존 필드(quest_recommend/quest_expire/event/ride_result/social/keyword_alert)는
    전부 다른 목적이라 신규 토글을 만들지 않고 게이트 자체를 생략한다(Simplicity First).
    """
    user_id = uuid.UUID(payload["user_id"])
    profile_id = payload["profile_id"]
    name = payload.get("profile_name") or ""
    result = payload.get("result", "")
    reason = payload.get("reject_reason") or ""
    link = f"biz&id={profile_id}"

    title, body_tpl = _BIZ_RESULT_COPY.get(result, ("비즈니스 계정 알림", "'{name}' 계정 상태가 변경되었습니다."))
    body = body_tpl.format(name=name, reason=reason)

    async with AsyncSessionLocal() as db:
        db.add(
            Notification(user_id=user_id, type="BIZ", title=title, body=body, link=link, created_at=datetime.now(UTC))
        )
        await db.commit()

    await _try_push(str(user_id), title, body, link)


_BIZ_AD_RESULT_COPY = {
    "APPROVED": ("광고 심사 승인", "'{title}' 광고가 승인되어 게시가 시작되었습니다."),
    "REJECTED": ("광고 심사 반려", "'{title}' 광고가 반려되었습니다. 사유: {reason}"),
}


async def _handle_biz_ad_reviewed(payload: dict) -> None:
    """광고 소재 심사 결과 통지(SGR-312 BP-4) — biz.profile_reviewed 와 동일하게
    트랜잭셔널 알림으로 취급해 푸시 게이트 없이 발송한다. 딥링크는 광고 상세(/biz/ads/<id>)."""
    user_id = uuid.UUID(payload["user_id"])
    ad_id = payload["ad_id"]
    ad_title = payload.get("ad_title") or ""
    result = payload.get("result", "")
    reason = payload.get("reject_reason") or ""
    link = f"bizad&id={ad_id}"

    title, body_tpl = _BIZ_AD_RESULT_COPY.get(result, ("광고 알림", "'{title}' 광고 상태가 변경되었습니다."))
    body = body_tpl.format(title=ad_title, reason=reason)

    async with AsyncSessionLocal() as db:
        db.add(
            Notification(user_id=user_id, type="BIZ", title=title, body=body, link=link, created_at=datetime.now(UTC))
        )
        await db.commit()

    await _try_push(str(user_id), title, body, link)


HANDLERS = {
    "dm.message_sent": _handle_dm_message,
    "market.listing_created": _handle_listing_created,
    "biz.profile_reviewed": _handle_biz_profile_reviewed,
    "biz.ad_reviewed": _handle_biz_ad_reviewed,
}


# ── 소비 루프 (engine worker 패턴 미러) ─────────────────────


async def _ensure_consumer_group() -> None:
    r = await get_client()
    try:
        await r.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        log.info("Created consumer group '%s' on stream '%s'", CONSUMER_GROUP, STREAM_KEY)
    except Exception as e:
        if "BUSYGROUP" in str(e):
            pass
        else:
            raise


async def _process_batch(batch: list[tuple[str, dict]], deliveries: dict[str, int] | None = None) -> None:
    """메시지 단위 격리 처리 — 한 메시지의 실패가 배치 전체 xack 을 막지 않는다.

    성공(또는 DLQ 격리)한 메시지만 ack. 실패 메시지는 PEL에 남아 _claim_pending
    재클레임으로 재시도되고, MAX_DELIVERIES 도달 시 DLQ 스트림으로 이동한다.
    """
    if not batch:
        return

    r = await get_client()
    ack_ids: list[str] = []
    deferred = 0
    for msg_id, fields in batch:
        msg_type = fields.get("type", "")
        handler = HANDLERS.get(msg_type)
        try:
            if handler:
                await handler(json.loads(fields.get("payload") or "{}"))
            else:
                log.warning("No handler for type=%s id=%s", msg_type, msg_id)
            ack_ids.append(msg_id)
        except Exception:
            n = (deliveries or {}).get(msg_id, 1)
            if n < MAX_DELIVERIES:
                deferred += 1
                log.exception(
                    "Message failed id=%s type=%s delivery=%d/%d — retry via reclaim",
                    msg_id,
                    msg_type,
                    n,
                    MAX_DELIVERIES,
                )
                continue
            log.exception(
                "Poison message id=%s type=%s deliveries=%d → DLQ %s",
                msg_id,
                msg_type,
                n,
                DLQ_STREAM_KEY,
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
                deferred += 1
                log.exception("DLQ xadd failed id=%s — deferred, batch continues", msg_id)

    if ack_ids:
        await r.xack(STREAM_KEY, CONSUMER_GROUP, *ack_ids)
    if deferred:
        log.info("Processed %d messages (%d deferred for retry)", len(ack_ids), deferred)
    else:
        log.info("Processed %d messages", len(ack_ids))


async def _claim_pending() -> tuple[list[tuple[str, dict]], dict[str, int]]:
    r = await get_client()
    pending = await r.xpending_range(STREAM_KEY, CONSUMER_GROUP, min="-", max="+", count=BATCH_SIZE)
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
    # 스트림에서 트림된(fields 없는) 메시지는 ack 해서 PEL 누수 방지.
    # msg_id None 은 반드시 걸러야 한다 (xack(None) 은 DataError → 루프 정지 livelock).
    tombstones = [msg_id for msg_id, fields in claimed if msg_id and not fields]
    if tombstones:
        await r.xack(STREAM_KEY, CONSUMER_GROUP, *tombstones)
        log.warning("Acked %d trimmed messages stuck in PEL", len(tombstones))
    return [(msg_id, fields) for msg_id, fields in claimed if fields], counts


async def run() -> None:
    await _ensure_consumer_group()
    r = await get_client()

    log.info(
        "Noti worker '%s' started — stream=%s group=%s types=%s",
        CONSUMER_NAME,
        STREAM_KEY,
        CONSUMER_GROUP,
        sorted(HANDLERS),
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

            # liveness 신호 — 사이클 정상 완료 시에만 갱신 (compose healthcheck 가 TTL 로 판정)
            await r.set(HEARTBEAT_KEY, CONSUMER_NAME, ex=HEARTBEAT_TTL_S)

        except Exception:
            log.exception("Worker loop error, retrying in 2s")
            await asyncio.sleep(2)

    log.info("Noti worker '%s' stopped", CONSUMER_NAME)


def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    asyncio.run(run())


main()
