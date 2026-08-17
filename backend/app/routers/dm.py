import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import (
    DmConversation,
    DmMessage,
    MarketplaceAppointment,
    MarketplaceListing,
    MarketplacePriceOffer,
    Report,
    User,
    UserBlock,
)
from ..schemas import (
    DmConversationCreateRequest,
    DmConversationOut,
    DmMessageCreateRequest,
    DmMessageOut,
    Page,
    ReportCreateRequest,
)
from ..services import noti_events
from ..services.banned_keywords import banned_keywords as _banned_keywords
from ..services.dm_policy import require_participant, require_unblocked
from ..utils import resolve_avatar_url
from .market import _appointment_unlocked, _appt_out, _offer_out
from .market import _card as _market_card

router = APIRouter(prefix="/dm", tags=["DM (Direct Message)"])


async def _listing_context(db: AsyncSession, listing_id: uuid.UUID | None):
    """대화에 연결된 매물 카드(brief). 없으면 None."""
    if listing_id is None:
        return None
    listing = (
        await db.execute(select(MarketplaceListing).where(MarketplaceListing.id == listing_id))
    ).scalar_one_or_none()
    return _market_card(listing) if listing else None


def _resolve_dm_image(msg: DmMessage) -> str | None:
    ic = msg.image_content
    if ic and ic.file_path:
        from ..utils import build_imgproxy_url

        return build_imgproxy_url(ic.file_path)
    return None


def _other_user_id(conv: DmConversation, me: uuid.UUID) -> uuid.UUID:
    return conv.participant_2 if conv.participant_1 == me else conv.participant_1


@router.get("/conversations", response_model=list[DmConversationOut], summary="대화방 목록")
async def get_conversations(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 본인 대화 목록만 — 타인 user_id 로 대화·미리보기 열람 차단
    if user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    block_rows = (
        await db.execute(
            select(UserBlock.blocker_id, UserBlock.blocked_id).where(
                or_(UserBlock.blocker_id == _session_uid, UserBlock.blocked_id == _session_uid)
            )
        )
    ).all()
    blocked_ids = {blocked_id if blocker_id == _session_uid else blocker_id for blocker_id, blocked_id in block_rows}
    rows = (
        (
            await db.execute(
                select(DmConversation)
                .where(
                    or_(
                        DmConversation.participant_1 == user_id,
                        DmConversation.participant_2 == user_id,
                    )
                )
                .order_by(DmConversation.last_message_at.desc())
            )
        )
        .scalars()
        .all()
    )

    result = []
    for conv in rows:
        other_id = _other_user_id(conv, user_id)
        if other_id in blocked_ids:
            continue
        other_user = await db.get(User, other_id)

        last_msg = (
            await db.execute(
                select(DmMessage)
                .where(DmMessage.conversation_id == conv.id)
                .order_by(DmMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        unread = (
            await db.execute(
                select(func.count())
                .select_from(DmMessage)
                .where(
                    DmMessage.conversation_id == conv.id,
                    DmMessage.sender_id != user_id,
                    DmMessage.read_at.is_(None),
                )
            )
        ).scalar_one()

        # price_offer/appointment 은 content(한국어 하드코딩) 대신 도메인 엔티티 기반 메타를 내려
        # 프론트가 뷰어 로케일로 미리보기를 조립한다 (DM-5)
        last_message_meta = None
        if last_msg and last_msg.message_type == "price_offer" and last_msg.meta and last_msg.meta.get("priceOfferId"):
            offer = await db.get(MarketplacePriceOffer, uuid.UUID(last_msg.meta["priceOfferId"]))
            if offer:
                last_message_meta = {"amount": offer.amount}
        elif (
            last_msg and last_msg.message_type == "appointment" and last_msg.meta and last_msg.meta.get("appointmentId")
        ):
            appt = await db.get(MarketplaceAppointment, uuid.UUID(last_msg.meta["appointmentId"]))
            if appt:
                last_message_meta = {"when": appt.when_at.isoformat(), "place": appt.place_name}

        result.append(
            DmConversationOut(
                id=conv.id,
                other_user_id=other_id,
                other_user_nickname=other_user.nickname if other_user else None,
                other_user_avatar_url=resolve_avatar_url(other_user) if other_user else None,
                last_message_preview=last_msg.content[:50] if last_msg and last_msg.content else None,
                last_message_type=last_msg.message_type if last_msg else None,
                last_message_meta=last_message_meta,
                last_message_at=conv.last_message_at,
                unread_count=unread,
                context_type=conv.context_type,
                context_id=conv.context_id,
            )
        )
    return result


@router.get("/conversations/{conv_id}", response_model=DmConversationOut, summary="대화방 단건 조회")
async def get_conversation(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    other_id = require_participant(conv, _session_uid)
    await require_unblocked(db, _session_uid, other_id)
    other_user = await db.get(User, other_id)
    return DmConversationOut(
        id=conv.id,
        other_user_id=other_id,
        other_user_nickname=other_user.nickname if other_user else None,
        other_user_avatar_url=resolve_avatar_url(other_user) if other_user else None,
        last_message_preview=None,
        last_message_at=conv.last_message_at,
        unread_count=0,
        context_type=conv.context_type,
        context_id=conv.context_id,
        context_listing=await _listing_context(db, conv.context_id) if conv.context_type == "listing" else None,
        appointment_unlocked=await _appointment_unlocked(db, conv, _session_uid),
    )


@router.post("/conversations", response_model=DmConversationOut, status_code=201, summary="대화방 생성/조회")
async def create_conversation(
    body: DmConversationCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if _session_uid == body.other_user_id:
        raise HTTPException(status_code=400, detail="Cannot create conversation with yourself")

    other_user = await db.get(User, body.other_user_id)
    if other_user is None or other_user.status != "ACTIVE":
        raise HTTPException(status_code=404, detail="User not found")
    await require_unblocked(db, _session_uid, body.other_user_id)

    if body.context_type is not None and body.context_type != "listing":
        raise HTTPException(status_code=400, detail="Unsupported conversation context")
    if body.context_type == "listing":
        listing = await db.get(MarketplaceListing, body.context_id)
        if listing is None or listing.seller_id != body.other_user_id or listing.status in ("HIDDEN", "REMOVED"):
            raise HTTPException(status_code=404, detail="Listing not found")

    p1, p2 = sorted([_session_uid, body.other_user_id])

    context_filter = (
        (DmConversation.context_type == body.context_type) & (DmConversation.context_id == body.context_id)
        if body.context_id is not None
        else DmConversation.context_id.is_(None)
    )

    existing = (
        await db.execute(
            select(DmConversation).where(
                DmConversation.participant_1 == p1,
                DmConversation.participant_2 == p2,
                context_filter,
            )
        )
    ).scalar_one_or_none()

    if existing:
        conv = existing
    else:
        conv = DmConversation(
            participant_1=p1, participant_2=p2, context_type=body.context_type, context_id=body.context_id
        )
        db.add(conv)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            conv = (
                await db.execute(
                    select(DmConversation).where(
                        DmConversation.participant_1 == p1,
                        DmConversation.participant_2 == p2,
                        context_filter,
                    )
                )
            ).scalar_one()
        await db.refresh(conv)

    return DmConversationOut(
        id=conv.id,
        other_user_id=body.other_user_id,
        other_user_nickname=other_user.nickname if other_user else None,
        other_user_avatar_url=resolve_avatar_url(other_user) if other_user else None,
        last_message_preview=None,
        last_message_at=conv.last_message_at,
        unread_count=0,
        context_type=conv.context_type,
        context_id=conv.context_id,
        context_listing=await _listing_context(db, conv.context_id) if conv.context_type == "listing" else None,
        appointment_unlocked=await _appointment_unlocked(db, conv, _session_uid),
    )


@router.get("/conversations/{conv_id}/messages", response_model=Page[DmMessageOut], summary="메시지 목록")
async def get_messages(
    conv_id: uuid.UUID,
    page: int = 1,
    size: int = 50,
    after: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    require_participant(conv, _session_uid)
    await require_unblocked(db, conv.participant_1, conv.participant_2)

    base = select(DmMessage).where(DmMessage.conversation_id == conv_id)
    if after:
        base = base.where(DmMessage.created_at > after)

    total = (
        await db.execute(
            select(func.count())
            .select_from(DmMessage)
            .where(DmMessage.conversation_id == conv_id, *([] if not after else [DmMessage.created_at > after]))
        )
    ).scalar_one()

    offset = (page - 1) * size
    rows = (await db.execute(base.order_by(DmMessage.created_at.asc()).offset(offset).limit(size))).scalars().all()

    # 약속/가격제안 메시지의 임베드 (상태를 매 폴링마다 최신으로) — 배치 조회
    appt_ids = [
        uuid.UUID(m.meta["appointmentId"])
        for m in rows
        if m.message_type == "appointment" and m.meta and m.meta.get("appointmentId")
    ]
    offer_ids = [
        uuid.UUID(m.meta["priceOfferId"])
        for m in rows
        if m.message_type == "price_offer" and m.meta and m.meta.get("priceOfferId")
    ]

    # 대화의 매물 판매자 — 카드 액션 권한(판매자 전용) 판별용. 임베드 대상이 있을 때 1회만 조회
    seller_id: uuid.UUID | None = None
    if (appt_ids or offer_ids) and conv.context_type == "listing" and conv.context_id is not None:
        listing = await db.get(MarketplaceListing, conv.context_id)
        seller_id = listing.seller_id if listing else None

    appts: dict[uuid.UUID, MarketplaceAppointment] = {}
    if appt_ids:
        appt_rows = (
            (await db.execute(select(MarketplaceAppointment).where(MarketplaceAppointment.id.in_(appt_ids))))
            .scalars()
            .all()
        )
        appts = {a.id: a for a in appt_rows}

    def _appt_for(m: DmMessage):
        if m.message_type == "appointment" and m.meta and m.meta.get("appointmentId"):
            a = appts.get(uuid.UUID(m.meta["appointmentId"]))
            return _appt_out(a, seller_id) if a else None
        return None

    offers: dict[uuid.UUID, MarketplacePriceOffer] = {}
    if offer_ids:
        offer_rows = (
            (await db.execute(select(MarketplacePriceOffer).where(MarketplacePriceOffer.id.in_(offer_ids))))
            .scalars()
            .all()
        )
        offers = {o.id: o for o in offer_rows}

    def _offer_for(m: DmMessage):
        if m.message_type == "price_offer" and m.meta and m.meta.get("priceOfferId"):
            o = offers.get(uuid.UUID(m.meta["priceOfferId"]))
            return _offer_out(o, seller_id) if o else None
        return None

    items = [
        DmMessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_id=m.sender_id,
            content=m.content,
            image_url=_resolve_dm_image(m),
            read_at=m.read_at,
            created_at=m.created_at,
            message_type=m.message_type,
            meta=m.meta,
            appointment=_appt_for(m),
            price_offer=_offer_for(m),
        )
        for m in rows
    ]

    return Page(items=items, total=total, page=page, size=size)


@router.post("/conversations/{conv_id}/messages", response_model=DmMessageOut, status_code=201, summary="메시지 전송")
async def send_message(
    conv_id: uuid.UUID,
    body: DmMessageCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    require_participant(conv, _session_uid)
    await require_unblocked(db, conv.participant_1, conv.participant_2)

    # 도메인 엔티티가 뒤따르는 타입은 전용 엔드포인트로만 — meta id 위조로 검증 우회 차단
    if body.message_type in ("appointment", "price_offer"):
        raise HTTPException(status_code=400, detail="Use the dedicated endpoint for this message type")

    if body.content is None and body.image_content_id is None:
        raise HTTPException(status_code=400, detail="content or image_content_id is required")

    # 금칙어 차단 — 텍스트 타입 메시지에만 적용 (부분문자열, 대소문자 무시)
    if (body.message_type or "text") == "text" and body.content:
        content_lower = body.content.lower()
        if any(kw in content_lower for kw in await _banned_keywords(db)):
            raise HTTPException(status_code=400, detail={"code": "banned_keyword"})

    now = datetime.now(UTC)
    msg = DmMessage(
        conversation_id=conv_id,
        sender_id=_session_uid,
        content=body.content,
        message_type=body.message_type or "text",
        meta=body.meta,
        image_content_id=body.image_content_id,
        created_at=now,
    )
    db.add(msg)
    conv.last_message_at = now

    # 수신자 푸시·인앱 알림은 noti_worker 로 이관. FD-6: 메시지 저장과 같은 트랜잭션에 이벤트를
    # 적재해(relay 가 발행) 커밋~발행 사이 유실을 막는다.
    recipient_id = _other_user_id(conv, _session_uid)
    sender = await db.get(User, _session_uid)
    preview = body.content[:50] if body.content else "사진을 보냈습니다"
    noti_events.enqueue(
        db,
        "dm.message_sent",
        {
            "conversation_id": str(conv_id),
            "sender_id": str(_session_uid),
            "recipient_id": str(recipient_id),
            "sender_nickname": sender.nickname if sender and sender.nickname else "",
            "preview": preview,
        },
    )
    await db.commit()

    msg = (await db.execute(select(DmMessage).where(DmMessage.id == msg.id))).scalar_one()

    return DmMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        content=msg.content,
        image_url=_resolve_dm_image(msg),
        read_at=msg.read_at,
        created_at=msg.created_at,
        message_type=msg.message_type,
        meta=msg.meta,
    )


@router.post("/conversations/{conv_id}/read", summary="읽음 처리")
async def mark_read(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    require_participant(conv, _session_uid)
    await require_unblocked(db, conv.participant_1, conv.participant_2)

    now = datetime.now(UTC)
    unread = (
        (
            await db.execute(
                select(DmMessage).where(
                    DmMessage.conversation_id == conv_id,
                    DmMessage.sender_id != _session_uid,
                    DmMessage.read_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )

    for msg in unread:
        msg.read_at = now
    await db.commit()
    return {"marked": len(unread)}


_DM_REPORT_REASONS = {"ABUSE", "SCAM", "SEXUAL", "SPAM", "OTHER"}


@router.post("/conversations/{conv_id}/report", status_code=201, summary="대화 신고")
async def report_conversation(
    conv_id: uuid.UUID,
    body: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.reason not in _DM_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="invalid reason")
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if session_uid not in (conv.participant_1, conv.participant_2):
        raise HTTPException(status_code=403, detail="Not a participant")

    # 중복 판정 — reports 부분 유니크(uq_reports_dm_once: conversation_id x reporter_id WHERE DM)와 동일 조건
    dup = (
        await db.execute(
            select(Report.id).where(
                Report.target_type == "DM",
                Report.conversation_id == conv_id,
                Report.reporter_id == session_uid,
            )
        )
    ).first()
    if dup is not None:
        raise HTTPException(status_code=409, detail="already reported")

    db.add(
        Report(
            target_type="DM",
            reporter_id=session_uid,
            reported_user_id=_other_user_id(conv, session_uid),
            conversation_id=conv_id,
            reason=body.reason,
            note=(body.note or None),
        )
    )
    await db.commit()
    return {"ok": True}
