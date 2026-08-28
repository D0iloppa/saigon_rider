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
from sqlalchemy import and_, delete, func, literal, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import AsyncSessionLocal
from app.engine_client import engine_client
from app.models import (
    LiveActivityToken,
    MarketplaceKeywordAlert,
    MarketplaceListingLike,
    Notification,
    NotificationOutbox,
    NotificationSettings,
    UserBlock,
)
from app.readiness import check_readiness
from app.services.noti_events import STREAM_KEY
from app.services.ops_alerts import send_ops_alert
from app.services.redis_cache import get_client
from app.services.search_index import reindex_entity
from app.services.search_norm import norm
from app.services.translate import warm_translations

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
OUTBOX_STREAM_MAXLEN = 100_000  # relay 발행 스트림 상한 (publish() 와 동일 취지)
OUTBOX_IDLE_SLEEP_S = 1  # outbox 가 비었을 때 폴링 간격

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


async def _try_push(user_id: str, title: str, body: str, link: str, extra_data: dict[str, str] | None = None) -> None:
    """재시도 가능한 provider 실패만 제한 재시도하고 별도 DLQ로 격리한다.

    extra_data: B-4 음성메시지 알림 액션용 — voice_message 타입일 때만 채워진다(기존 텍스트/이미지
    알림은 navigateTo 만 실리는 기존 포맷 그대로 유지).
    """
    # voice_message 는 엔진이 FCM "notification" 블록 없이(data-only) 보내(항상 onMessageReceived 를
    # 타서 재생 액션 버튼을 그릴 수 있게) title/body 도 data 에 실어줘야 Android 가 복원할 수 있다.
    data = {"navigateTo": link, **(extra_data or {})}
    if extra_data:
        data.setdefault("title", title)
        data.setdefault("body", body)
    for attempt in range(1, MAX_DELIVERIES + 1):
        try:
            await engine_client.notify_user_push(user_id, title=title, body=body, data=data)
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


async def _insert_notification(
    db,
    *,
    source_event_id: str,
    user_id: uuid.UUID,
    notification_type: str,
    title: str,
    body: str | None,
    link: str | None,
) -> bool:
    """Insert once per Redis event and recipient; return whether this delivery created the row.

    Redis redelivery is intentionally push-suppressing for FD-5: a replay that finds this row must not
    enter the push path again. A crash after this row commits but before the provider call can therefore
    leave only the in-app notification. Closing that delivery gap, and provider-level exactly-once delivery,
    requires the separate FD-6 outbox/provider-idempotency work.
    """
    stmt = (
        pg_insert(Notification)
        .values(
            source_event_id=source_event_id,
            user_id=user_id,
            type=notification_type,
            title=title,
            body=body,
            link=link,
            created_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(
            index_elements=[Notification.source_event_id, Notification.user_id],
            index_where=Notification.source_event_id.is_not(None),
        )
        .returning(Notification.id)
    )
    inserted_id = await db.scalar(stmt)
    return inserted_id is not None


async def _handle_dm_message(payload: dict, *, source_event_id: str) -> None:
    # 260827 group/open 확장 (§3.7): recipient_ids(배열) 가 신규 형태. 마이그레이션 기간 호환을
    # 위해 recipient_id(단수, 레거시)도 계속 받는다 — 아직 배포 안 된 다른 발행측 코드 대비.
    if "recipient_ids" in payload:
        recipient_ids = [uuid.UUID(rid) for rid in payload["recipient_ids"]]
    else:
        recipient_ids = [uuid.UUID(payload["recipient_id"])]

    conv_id = payload["conversation_id"]
    title = payload.get("sender_nickname") or "새 메시지"
    body = payload.get("preview") or ""
    link = f"dm&id={conv_id}"

    # B-4: 음성메시지 알림에 "바로 재생" 액션(Android) + 딥링크 자동재생 파라미터를 얹는다.
    # 텍스트/이미지 메시지는 message_type/audio_url 이 없으므로 이 분기를 타지 않는다(포맷 불변).
    extra_data = None
    message_id = payload.get("message_id")
    audio_url = payload.get("audio_url")
    if payload.get("message_type") == "voice" and message_id and audio_url:
        link = f"{link}&voice=1&mid={message_id}"
        extra_data = {
            "type": "voice_message",
            "audioUrl": audio_url,
            "messageId": message_id,
            "conversationId": str(conv_id),
        }

    for recipient_id in recipient_ids:
        async with AsyncSessionLocal() as db:
            inserted = await _insert_notification(
                db,
                source_event_id=source_event_id,
                user_id=recipient_id,
                notification_type="SOCIAL",
                title=title,
                body=body,
                link=link,
            )
            push_ok = inserted and await _push_enabled(db, recipient_id, "chat")
            await db.commit()

        if not inserted:
            log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, recipient_id)
        elif push_ok:
            await _try_push(str(recipient_id), title, body, link, extra_data)
        else:
            log.info("push skipped (chat=off) user=%s conv=%s", recipient_id, conv_id)


async def _handle_listing_created(payload: dict, *, source_event_id: str) -> None:
    """매물 제목 키워드 매칭 (market._notify_keyword_matches 이관) — 성조 무관 정규화 매칭,
    등록자 본인 제외. SQL 에서 strpos() 로 매칭까지 끝낸다(기존엔 전체 구독 행을 Python 으로
    끌어와 substring 비교 — W1 §③-1/§④의 풀스캔 지적). LIKE 대신 strpos() 를 쓰는 이유:
    keyword 에 %/_ 가 포함되면 LIKE 는 이를 와일드카드로 오해석하지만 strpos() 는 순수
    substring 이라 이스케이프가 불필요하다(대표 확정 — LIKE 로 되돌리지 말 것).

    F-1 폴백: migration 180 은 keyword_norm 을 NULL 허용으로 추가하지만 백필
    (`scripts/backfill_keyword_alert_norm.py`)은 수동 실행이라, 적용 직후~백필 전까지
    기존 구독은 keyword_norm 이 NULL 이다. keyword_norm 이 있으면 정규화 매칭, 없으면
    원본 keyword 로 대소문자 무관 strpos 매칭(raw fallback)— 백필 전 구독이 조용히
    죽지 않게 한다."""
    listing_title = payload.get("title") or ""
    title_norm = norm(listing_title)
    if not title_norm:
        return
    seller_id = uuid.UUID(payload["seller_id"])
    link = f"market&id={payload['listing_id']}"

    pushes: list[tuple[str, str]] = []
    async with AsyncSessionLocal() as db:
        # FD-9: 판매자와 상호 차단 관계인 유저는 키워드 매칭에서 제외 (market.py 의 block-subquery 패턴 미러)
        blocked_by_seller = select(UserBlock.blocked_id).where(UserBlock.blocker_id == seller_id)
        blocking_seller = select(UserBlock.blocker_id).where(UserBlock.blocked_id == seller_id)
        alerts = (
            (
                await db.execute(
                    select(MarketplaceKeywordAlert).where(
                        MarketplaceKeywordAlert.user_id.notin_(blocked_by_seller),
                        MarketplaceKeywordAlert.user_id.notin_(blocking_seller),
                        MarketplaceKeywordAlert.user_id != seller_id,
                        or_(
                            and_(
                                MarketplaceKeywordAlert.keyword_norm.isnot(None),
                                MarketplaceKeywordAlert.keyword_norm
                                != "",  # strpos(x, '') 는 1(항상 매치) — 빈 정규화 방어
                                func.strpos(literal(title_norm), MarketplaceKeywordAlert.keyword_norm) > 0,
                            ),
                            and_(
                                MarketplaceKeywordAlert.keyword_norm.is_(None),
                                MarketplaceKeywordAlert.keyword != "",  # 빈 정규화 방어(raw 쪽도 동일)
                                func.strpos(
                                    func.lower(literal(listing_title)), func.lower(MarketplaceKeywordAlert.keyword)
                                )
                                > 0,
                            ),
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )
        seen: set[uuid.UUID] = set()
        for alert in alerts:
            if alert.user_id in seen:
                continue
            seen.add(alert.user_id)
            noti_title = f"🔔 {alert.keyword}"
            inserted = await _insert_notification(
                db,
                source_event_id=source_event_id,
                user_id=alert.user_id,
                notification_type="KEYWORD",
                title=noti_title,
                body=listing_title,
                link=link,
            )
            if not inserted:
                log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, alert.user_id)
            elif await _push_enabled(db, alert.user_id, "keyword_alert"):
                pushes.append((str(alert.user_id), noti_title))
            else:
                log.info("push skipped (keyword_alert=off) user=%s listing=%s", alert.user_id, payload["listing_id"])
        await db.commit()

    for user_id, noti_title in pushes:
        await _try_push(user_id, noti_title, listing_title, link)


async def _handle_price_drop(payload: dict, *, source_event_id: str) -> None:
    """016 §4-2 #37 — 찜한 사용자에게 가격 인하 알림. 발행측(market.py update_price)이 이미
    24h 일 상한을 적용해 enqueue 했으므로 여기서는 수신자만 조회한다."""
    listing_id = uuid.UUID(payload["listing_id"])
    listing_title = payload.get("title") or ""
    old_price = payload.get("old_price_vnd")
    new_price = payload.get("new_price_vnd")
    link = f"market&id={listing_id}"
    title = f"💸 {listing_title}"
    body = f"찜한 매물의 가격이 내렸어요: {old_price:,}đ → {new_price:,}đ"

    pushes: list[tuple[str, str]] = []
    async with AsyncSessionLocal() as db:
        likers = (
            (
                await db.execute(
                    select(MarketplaceListingLike.user_id).where(MarketplaceListingLike.listing_id == listing_id)
                )
            )
            .scalars()
            .all()
        )
        for user_id in likers:
            inserted = await _insert_notification(
                db,
                source_event_id=source_event_id,
                user_id=user_id,
                notification_type="PRICE_DROP",
                title=title,
                body=body,
                link=link,
            )
            if inserted and await _push_enabled(db, user_id, "social"):
                pushes.append((str(user_id), title))
        await db.commit()

    for user_id, noti_title in pushes:
        await _try_push(user_id, noti_title, body, link)


_BIZ_RESULT_COPY = {
    "APPROVED": ("비즈니스 파트너 승인", "'{name}' 계정이 승인되었습니다. 지금 바로 광고를 등록해보세요."),
    "REJECTED": ("비즈니스 파트너 반려", "'{name}' 신청이 반려되었습니다. 사유: {reason}"),
    "SUSPENDED": ("비즈니스 계정 정지", "'{name}' 계정이 운영정지되었습니다."),
}


async def _handle_biz_profile_reviewed(payload: dict, *, source_event_id: str) -> None:
    """비즈니스 프로필 심사 결과 통지(SGR-312 BP-3).

    계정 상태 변경(승인/반려/정지)은 트랜잭셔널 알림으로 취급해 푸시 게이트 없이 발송한다 —
    NotificationSettings 의 기존 필드(quest_recommend/quest_expire/event/ride_result/social/keyword_alert/chat)는
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
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=user_id,
            notification_type="BIZ",
            title=title,
            body=body,
            link=link,
        )
        await db.commit()

    if inserted:
        await _try_push(str(user_id), title, body, link)
    else:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, user_id)


_BIZ_AD_RESULT_COPY = {
    "APPROVED": ("광고 심사 승인", "'{title}' 광고가 승인되어 게시가 시작되었습니다."),
    "REJECTED": ("광고 심사 반려", "'{title}' 광고가 반려되었습니다. 사유: {reason}"),
}


async def _handle_biz_ad_reviewed(payload: dict, *, source_event_id: str) -> None:
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
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=user_id,
            notification_type="BIZ",
            title=title,
            body=body,
            link=link,
        )
        await db.commit()

    if inserted:
        await _try_push(str(user_id), title, body, link)
    else:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, user_id)


async def _handle_proximity_hit(payload: dict, *, source_event_id: str) -> None:
    """근접 광고 진입 알림(260806_proximity_ad_design.md §9-5).

    biz.profile_reviewed 와 달리 계정 상태 변경이 아니라 마케팅성 알림이라, 신규 토글을 만들지
    않고 기존 NotificationSettings.event(이벤트성 알림) 토글로 게이트한다(카파시 §2 — 요청 이상
    스키마 확장 금지)."""
    user_id = uuid.UUID(payload["user_id"])
    ad_id = payload["ad_id"]
    title = payload.get("title") or "근처 가게 알림"
    body = payload.get("body") or payload.get("partner_name") or ""
    link = f"bizad&id={ad_id}"

    async with AsyncSessionLocal() as db:
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=user_id,
            notification_type="BIZ",
            title=title,
            body=body,
            link=link,
        )
        push_ok = inserted and await _push_enabled(db, user_id, "event")
        await db.commit()

    if not inserted:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, user_id)
    elif push_ok:
        await _try_push(str(user_id), title, body, link)
    else:
        log.info("push skipped (event=off) user=%s ad=%s", user_id, ad_id)


async def _handle_support_replied(payload: dict, *, source_event_id: str) -> None:
    """고객센터 답변 통지(FD-2/12) — biz.profile_reviewed 와 동일하게 트랜잭셔널 알림으로 취급해
    푸시 게이트 없이 발송한다. 딥링크는 문의 상세(support&id=<ticket_id>)."""
    user_id = uuid.UUID(payload["user_id"])
    ticket_id = payload["ticket_id"]
    preview = payload.get("reply_preview") or ""
    link = f"support&id={ticket_id}"
    title = "고객센터 답변 도착"

    async with AsyncSessionLocal() as db:
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=user_id,
            notification_type="SUPPORT",
            title=title,
            body=preview,
            link=link,
        )
        await db.commit()

    if inserted:
        await _try_push(str(user_id), title, preview, link)
    else:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, user_id)


_COMPLETION_COPY = {
    "market.completion_requested": (
        "거래 완료 요청",
        "'{title}' 구매자가 거래 완료를 요청했습니다. 확인해 주세요.",
    ),
    "market.completion_declined": (
        "거래 완료 요청 거절",
        "'{title}' 판매자가 거래 완료 요청을 거절했습니다.",
    ),
}


async def _handle_completion_request(event_type: str, payload: dict, *, source_event_id: str) -> None:
    """S-16: 거래 완료 요청·거절 통지. 딥링크는 해당 대화(약속 카드가 그 안에 있다).

    biz.profile_reviewed 와 동일하게 **푸시 게이트 없이** 발송한다 — 거래 진행 자체를 막는
    알림이라 chat 토글로 끌 수 있어야 할 성질이 아니다(판매자 미응답이 곧 S-16 의 원인).
    타입은 DM 컨텍스트라 기존 SOCIAL 을 재사용한다(enum 신설 없음).
    """
    recipient_id = uuid.UUID(payload["recipient_id"])
    conv_id = payload["conversation_id"]
    title, body_tpl = _COMPLETION_COPY[event_type]
    body = body_tpl.format(title=payload.get("listing_title") or "")
    link = f"dm&id={conv_id}"

    async with AsyncSessionLocal() as db:
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=recipient_id,
            notification_type="SOCIAL",
            title=title,
            body=body,
            link=link,
        )
        await db.commit()

    if inserted:
        await _try_push(str(recipient_id), title, body, link)
    else:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, recipient_id)


async def _handle_completion_requested(payload: dict, *, source_event_id: str) -> None:
    await _handle_completion_request("market.completion_requested", payload, source_event_id=source_event_id)


async def _handle_completion_declined(payload: dict, *, source_event_id: str) -> None:
    await _handle_completion_request("market.completion_declined", payload, source_event_id=source_event_id)


async def _handle_report_submitted(payload: dict, *, source_event_id: str) -> None:
    """F-17: 신고 접수 운영자 알림. 수신자가 특정 user_id 가 아니라 운영자라 인앱
    Notification 이 아닌 웹훅으로 발행한다(ops_alerts, F-18 과 채널 공유)."""
    await send_ops_alert(
        "[신고 접수] target_type={target_type} reason={reason} report_id={report_id}".format(
            target_type=payload.get("target_type"),
            reason=payload.get("reason"),
            report_id=payload.get("report_id"),
        )
    )


_TITLE_TRANSFER_COPY = {
    "D7": "거래 완료 후 7일이 지났어요. 명의이전 체크리스트를 확인해 보세요.",
    "D25": "명의이전 기한이 얼마 남지 않았어요. 체크리스트를 확인해 보세요.",
}


async def _handle_title_transfer_reminder(payload: dict, *, source_event_id: str) -> None:
    """016 §4-6 #41, D-35=(a) — SOLD 매물 명의이전 D+7/D+25 리마인더.

    biz.profile_reviewed 와 동일하게 트랜잭셔널 알림으로 취급해 푸시 게이트 없이 발송한다.
    payload 는 jobs.title_transfer_reminders 가 수신자 1명씩 개별 enqueue 한다.
    ⚠ L-6 법무 미확인: 문구에 기한·과태료를 단정하지 않는다 — 체크리스트 화면(프론트)이
    "관할 기관 확인 요망" 고지를 갖는다.
    """
    user_id = uuid.UUID(payload["user_id"])
    listing_id = payload["listing_id"]
    reminder_type = payload["reminder_type"]
    title = "명의이전 체크리스트"
    body = _TITLE_TRANSFER_COPY.get(reminder_type, _TITLE_TRANSFER_COPY["D7"])
    link = f"market&id={listing_id}"

    async with AsyncSessionLocal() as db:
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=user_id,
            notification_type="TITLE_TRANSFER",
            title=title,
            body=body,
            link=link,
        )
        await db.commit()

    if inserted:
        await _try_push(str(user_id), title, body, link)
    else:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, user_id)


async def _handle_deal_result_ping(payload: dict, *, source_event_id: str) -> None:
    """016 §4-7 #42 — 문의 후 조용해진 매물 거래 결과 확인 핑.

    title_transfer_reminder 와 동일하게 트랜잭셔널 알림으로 취급해 푸시 게이트 없이 발송한다.
    응답(4지선다)은 프론트가 매물 상세 화면에서 처리하므로 링크는 매물 상세로만 보낸다.
    """
    user_id = uuid.UUID(payload["user_id"])
    listing_id = payload["listing_id"]
    listing_title = payload.get("title") or ""
    title = "거래 결과를 알려주세요"
    body = f"'{listing_title}' 매물, 거래되셨나요? 잠깐 확인해 주세요."
    link = f"market&id={listing_id}"

    async with AsyncSessionLocal() as db:
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=user_id,
            notification_type="DEAL_RESULT_PING",
            title=title,
            body=body,
            link=link,
        )
        await db.commit()

    if inserted:
        await _try_push(str(user_id), title, body, link)
    else:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, user_id)


async def _handle_search_reindex(payload: dict, *, source_event_id: str) -> None:
    """P3: 등록/수정된 엔티티의 번역을 확보(캐시 워밍)하고 search_blob 을 재계산한다.

    멱등: entity_type+entity_id 단위 UPDATE 라 같은 이벤트가 재전달돼도 결과가 같다
    (source_event_id 는 미사용 — Notification insert 와 달리 저장되는 행 자체가 없다).
    """
    entity_type = payload["entity_type"]
    entity_id = uuid.UUID(payload["entity_id"])
    texts = payload.get("texts") or []
    await warm_translations(texts)
    async with AsyncSessionLocal() as db:
        await reindex_entity(db, entity_type, entity_id)
        await db.commit()


async def _handle_feed_comment(payload: dict, *, source_event_id: str) -> None:
    """P4-3: 내 글에 댓글이 달렸을 때 글쓴이에게 알림 (social 토글 게이트)."""
    recipient_id = uuid.UUID(payload["recipient_id"])
    post_id = payload["post_id"]
    title = payload.get("commenter_nickname") or "새 댓글"
    body = payload.get("preview") or ""
    link = f"feed&id={post_id}"

    async with AsyncSessionLocal() as db:
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=recipient_id,
            notification_type="SOCIAL",
            title=title,
            body=body,
            link=link,
        )
        push_ok = inserted and await _push_enabled(db, recipient_id, "social")
        await db.commit()

    if not inserted:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, recipient_id)
    elif push_ok:
        await _try_push(str(recipient_id), title, body, link)


async def _handle_feed_like(payload: dict, *, source_event_id: str) -> None:
    """P4-3: 내 글에 응원(좋아요)이 달렸을 때 글쓴이에게 알림 (social 토글 게이트)."""
    recipient_id = uuid.UUID(payload["recipient_id"])
    post_id = payload["post_id"]
    title = payload.get("liker_nickname") or "새 응원"
    body = "회원님의 글을 응원했습니다"
    link = f"feed&id={post_id}"

    async with AsyncSessionLocal() as db:
        inserted = await _insert_notification(
            db,
            source_event_id=source_event_id,
            user_id=recipient_id,
            notification_type="SOCIAL",
            title=title,
            body=body,
            link=link,
        )
        push_ok = inserted and await _push_enabled(db, recipient_id, "social")
        await db.commit()

    if not inserted:
        log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, recipient_id)
    elif push_ok:
        await _try_push(str(recipient_id), title, body, link)


async def _handle_feed_followed_post(payload: dict, *, source_event_id: str) -> None:
    """P4-3: 팔로우한 사람의 새 글 알림 — 팔로워 전원에게 fan-out (social 토글 게이트)."""
    recipient_ids = [uuid.UUID(rid) for rid in payload["recipient_ids"]]
    post_id = payload["post_id"]
    title = payload.get("author_nickname") or "새 글"
    body = payload.get("preview") or ""
    link = f"feed&id={post_id}"

    for recipient_id in recipient_ids:
        async with AsyncSessionLocal() as db:
            inserted = await _insert_notification(
                db,
                source_event_id=source_event_id,
                user_id=recipient_id,
                notification_type="SOCIAL",
                title=title,
                body=body,
                link=link,
            )
            push_ok = inserted and await _push_enabled(db, recipient_id, "social")
            await db.commit()

        if not inserted:
            log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, recipient_id)
        elif push_ok:
            await _try_push(str(recipient_id), title, body, link)


async def _handle_feed_group_post(payload: dict, *, source_event_id: str) -> None:
    """P4-3: 그룹 새 글 알림 — 그룹 멤버 전원에게 fan-out. notification_settings.group_post 로 게이트."""
    recipient_ids = [uuid.UUID(rid) for rid in payload["recipient_ids"]]
    post_id = payload["post_id"]
    group_name = payload.get("group_name") or "그룹"
    title = f"[{group_name}] {payload.get('author_nickname') or '새 글'}"
    body = payload.get("preview") or ""
    link = f"feed&id={post_id}"

    for recipient_id in recipient_ids:
        async with AsyncSessionLocal() as db:
            inserted = await _insert_notification(
                db,
                source_event_id=source_event_id,
                user_id=recipient_id,
                notification_type="SOCIAL",
                title=title,
                body=body,
                link=link,
            )
            push_ok = inserted and await _push_enabled(db, recipient_id, "group_post")
            await db.commit()

        if not inserted:
            log.info("duplicate notification skipped source_event_id=%s user=%s", source_event_id, recipient_id)
        elif push_ok:
            await _try_push(str(recipient_id), title, body, link)


# 거래 Live Activity 카드 문구 — 클라이언트 i18n(dm.laStatus.*) 과 같은 문장. 서버가 만들어 보내므로
# 토큰 등록 시 저장된 locale 로 고른다. 위젯은 문장을 만들지 않는다(네이티브 무문구 원칙).
_LA_DEAL_STATUS_TEXT = {
    "accepted": {"ko": "약속 확정", "en": "Meetup confirmed", "vi": "Đã chốt hẹn"},
    "completionRequested": {"ko": "완료 요청됨", "en": "Completion requested", "vi": "Đã yêu cầu hoàn tất"},
    "completed": {"ko": "거래 완료", "en": "Deal completed", "vi": "Giao dịch hoàn tất"},
    "cancelled": {"ko": "약속 취소", "en": "Meetup cancelled", "vi": "Đã hủy hẹn"},
}


async def _handle_live_activity_deal_update(payload: dict, *, source_event_id: str) -> None:
    """거래 Live Activity 원격 갱신 (260829 Phase 3). 약속의 등록 토큰 전부에 content-state 를 밀어넣는다.
    완료/취소는 `end`(2분 뒤 소멸), 그 외는 `update`. 멱등 — 같은 상태를 두 번 보내도 결과가 같다.
    APNs 410(토큰 무효)은 행 삭제, 503 은 로그만(다음 상태 변화에서 자연 복구 — 카드는 부가 표면)."""
    appointment_id = uuid.UUID(payload["appointment_id"])
    status = payload.get("status") or "ACCEPTED"
    if status == "COMPLETED":
        kind = "completed"
    elif status == "CANCELLED":
        kind = "cancelled"
    elif payload.get("completion_requested_by") and not payload.get("completion_declined_at"):
        # 거절은 requested_by 를 남긴 채 declined_at 만 찍힌다(market.py decline) — 거절됐으면 '약속 확정' 으로.
        kind = "completionRequested"
    else:
        kind = "accepted"
    when_at = payload.get("when_at")
    when_ms = int(datetime.fromisoformat(when_at).timestamp() * 1000) if when_at else 0
    event = "end" if kind in ("completed", "cancelled") else "update"
    now_s = int(datetime.now(UTC).timestamp())
    dismissal = now_s + 120 if event == "end" else None
    stale = (when_ms // 1000 + 3600) if when_ms else None

    async with AsyncSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(LiveActivityToken).where(
                        LiveActivityToken.kind == "deal", LiveActivityToken.subject_id == appointment_id
                    )
                )
            )
            .scalars()
            .all()
        )
        invalid: list[uuid.UUID] = []
        for row in rows:
            lang = (row.locale or "vi").split("-")[0]
            texts = _LA_DEAL_STATUS_TEXT[kind]
            content_state = {
                "statusText": texts.get(lang, texts["vi"]),
                "statusKind": kind,
                "placeName": payload.get("place_name") or "",
                "appointmentAtMs": when_ms,
                "peerDistanceText": "",
            }
            try:
                await engine_client.push_live_activity(
                    row.push_token, event, content_state, dismissal_date=dismissal, stale_date=stale
                )
                log.info("live activity %s sent appt=%s user=%s", event, appointment_id, row.user_id)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 410:
                    invalid.append(row.id)
                else:
                    log.warning(
                        "live activity push failed appt=%s user=%s status=%d",
                        appointment_id,
                        row.user_id,
                        exc.response.status_code,
                    )
            except httpx.TransportError as exc:
                log.warning("live activity push transport error appt=%s: %s", appointment_id, exc)
        if event == "end":
            # 카드가 끝났으니 토큰도 수명이 끝났다 — 무효 여부와 무관하게 정리.
            await db.execute(delete(LiveActivityToken).where(LiveActivityToken.subject_id == appointment_id))
        elif invalid:
            await db.execute(delete(LiveActivityToken).where(LiveActivityToken.id.in_(invalid)))
        await db.commit()


HANDLERS = {
    "dm.message_sent": _handle_dm_message,
    "live_activity.deal_update": _handle_live_activity_deal_update,
    "feed.comment_created": _handle_feed_comment,
    "feed.post_liked": _handle_feed_like,
    "feed.followed_post_created": _handle_feed_followed_post,
    "feed.group_post_created": _handle_feed_group_post,
    "market.listing_created": _handle_listing_created,
    "market.price_drop": _handle_price_drop,
    "market.completion_requested": _handle_completion_requested,
    "market.completion_declined": _handle_completion_declined,
    "biz.profile_reviewed": _handle_biz_profile_reviewed,
    "biz.ad_reviewed": _handle_biz_ad_reviewed,
    "proximity.hit": _handle_proximity_hit,
    "support.replied": _handle_support_replied,
    "report.submitted": _handle_report_submitted,
    "search.reindex": _handle_search_reindex,
    "market.title_transfer_reminder": _handle_title_transfer_reminder,
    "market.deal_result_ping": _handle_deal_result_ping,
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
    """메시지 단위 격리 처리 — 한 메시지의 실패가 다른 메시지의 ack 을 막지 않는다.

    성공(또는 DLQ 격리)한 메시지만 ack — 처리 직후 즉시 xack 한다(배치 끝까지 미루지 않음).
    배치 끝에서 한 번에 ack 하면 크래시가 배치 중간에 나는 경우 이미 부수효과(DB insert·push)가
    끝난 앞쪽 메시지들까지 PEL 에 남아 재전달→중복 처리되므로(FD-5), per-message ack 으로 그 창을 줄인다.
    실패 메시지는 PEL에 남아 _claim_pending 재클레임으로 재시도되고, MAX_DELIVERIES 도달 시 DLQ 스트림으로 이동한다.
    """
    if not batch:
        return

    r = await get_client()
    acked = 0
    deferred = 0
    for msg_id, fields in batch:
        msg_type = fields.get("type", "")
        handler = HANDLERS.get(msg_type)
        # FD-6: outbox relay 가 실은 event_id(불변 outbox row id)를 멱등키로 우선한다 —
        # stream 재발행 시 msg_id 는 바뀌지만 event_id 는 고정이라 중복 알림이 생기지 않는다.
        # event_id 가 없는 즉시-publish() 이벤트는 기존대로 msg_id 를 사용한다.
        source_event_id = fields.get("event_id") or msg_id
        try:
            if handler:
                await handler(json.loads(fields.get("payload") or "{}"), source_event_id=source_event_id)
            else:
                log.warning("No handler for type=%s id=%s", msg_type, msg_id)
            await r.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
            acked += 1
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
                await r.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)  # 본 스트림 PEL 에서 제거
                acked += 1
            except Exception:
                deferred += 1
                log.exception("DLQ xadd failed id=%s — deferred, batch continues", msg_id)

    if deferred:
        log.info("Processed %d messages (%d deferred for retry)", acked, deferred)
    else:
        log.info("Processed %d messages", acked)


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


async def _drain_outbox_once() -> int:
    """FD-6: notification_outbox 의 미발행 이벤트를 stream 으로 발행하고 published_at 을 찍는다.

    xadd 성공 후 commit 실패/프로세스 종료 시 row 는 미발행으로 남아 재발행되지만, 실은 event_id
    (row.id)로 소비자가 멱등 처리하므로 중복 알림이 생기지 않는다(at-least-once + 멱등 소비 = 실질 1회).
    ``skip_locked`` 로 다중 워커 replica 가 같은 row 를 중복 발행하지 않는다.
    """
    r = await get_client()
    async with AsyncSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(NotificationOutbox)
                    .where(NotificationOutbox.published_at.is_(None))
                    .order_by(NotificationOutbox.id)
                    .limit(BATCH_SIZE)
                    .with_for_update(skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            return 0
        now = datetime.now(UTC)
        for row in rows:
            await r.xadd(
                STREAM_KEY,
                {
                    "type": row.event_type,
                    "payload": json.dumps(row.payload, default=str),
                    "event_id": str(row.id),
                },
                maxlen=OUTBOX_STREAM_MAXLEN,
                approximate=True,
            )
            row.published_at = now
        await db.commit()
        return len(rows)


async def _outbox_relay_loop() -> None:
    log.info("Outbox relay started")
    while not _shutdown:
        try:
            published = await _drain_outbox_once()
        except Exception:
            log.exception("Outbox relay error, retrying in %ds", OUTBOX_IDLE_SLEEP_S)
            published = 0
        if not published:
            await asyncio.sleep(OUTBOX_IDLE_SLEEP_S)


async def _consume_loop() -> None:
    r = await get_client()
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


async def run() -> None:
    await check_readiness()
    await _ensure_consumer_group()

    log.info(
        "Noti worker '%s' started — stream=%s group=%s types=%s",
        CONSUMER_NAME,
        STREAM_KEY,
        CONSUMER_GROUP,
        sorted(HANDLERS),
    )

    # 소비 루프와 outbox relay 를 동시 구동. 하나가 죽으면 전체 종료해 compose 가 재기동한다.
    await asyncio.gather(_consume_loop(), _outbox_relay_loop())

    log.info("Noti worker '%s' stopped", CONSUMER_NAME)


def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    asyncio.run(run())


if __name__ == "__main__":
    main()
