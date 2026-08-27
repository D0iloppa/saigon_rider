import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import (
    CommunityGroupMember,
    DmConversation,
    DmConversationMember,
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
    DmConversationPatchRequest,
    DmGroupConversationCreateRequest,
    DmMemberInviteRequest,
    DmMessageCreateRequest,
    DmMessageOut,
    FunnelEventType,
    Page,
    ReportCreateRequest,
)
from ..services import funnel_events, noti_events
from ..services.banned_keywords import banned_keywords as _banned_keywords
from ..services.dm_policy import require_member, require_participant, require_unblocked, require_unblocked_for_join
from ..utils import build_imgproxy_url, resolve_avatar_url
from ._report_guard import guard_duplicate_report
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


def _resolve_conv_photo(conv: DmConversation) -> str | None:
    content = conv.photo_content
    if content and content.file_path:
        return build_imgproxy_url(content.file_path)
    return None


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

    # 그룹/오픈톡방 §3.3(c): last_read_at 이 unread 계산의 SoT (direct 도 백필로 이 값을 쓴다).
    member_rows = (
        await db.execute(
            select(DmConversationMember.conversation_id, DmConversationMember.last_read_at).where(
                DmConversationMember.user_id == user_id,
                DmConversationMember.left_at.is_(None),
            )
        )
    ).all()
    last_read_map = {conv_id: last_read_at for conv_id, last_read_at in member_rows}

    rows = (
        (
            await db.execute(
                select(DmConversation)
                .where(
                    or_(
                        DmConversation.participant_1 == user_id,
                        DmConversation.participant_2 == user_id,
                        DmConversation.id.in_(last_read_map.keys()),
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
        is_direct = conv.conversation_type == "direct"
        other_id = _other_user_id(conv, user_id) if is_direct else None
        if is_direct and other_id in blocked_ids:
            continue
        other_user = await db.get(User, other_id) if other_id else None

        last_msg = (
            await db.execute(
                select(DmMessage)
                .where(DmMessage.conversation_id == conv.id)
                .order_by(DmMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        last_read_at = last_read_map.get(conv.id)
        unread = (
            (
                await db.execute(
                    select(func.count())
                    .select_from(DmMessage)
                    .where(
                        DmMessage.conversation_id == conv.id,
                        DmMessage.sender_id != user_id,
                        DmMessage.created_at > last_read_at,
                    )
                )
            ).scalar_one()
            if last_read_at is not None
            else 0
        )

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
                conversation_type=conv.conversation_type,
                title=conv.title,
                photo_url=_resolve_conv_photo(conv),
                member_count=conv.member_count,
                community_group_id=conv.community_group_id,
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

    if conv.conversation_type != "direct":
        await require_member(db, conv, _session_uid)
        return DmConversationOut(
            id=conv.id,
            last_message_preview=None,
            last_message_at=conv.last_message_at,
            unread_count=0,
            conversation_type=conv.conversation_type,
            title=conv.title,
            photo_url=_resolve_conv_photo(conv),
            member_count=conv.member_count,
            community_group_id=conv.community_group_id,
        )

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
        # 정본 §5 #5: "문의" = 매물에 연결된 신규 대화 생성. 기존 대화 재사용(existing)이나
        # 매물과 무관한 대화는 퍼널 대상이 아니다.
        if body.context_type == "listing":
            await funnel_events.record(db, FunnelEventType.INQUIRY, user_id=_session_uid, entity_id=body.context_id)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            # rollback() 은 세션의 모든 persistent 객체(other_user 포함, 위에서 이미 로드됨)를
            # expire 시킨다 — refresh 없이 아래에서 other_user.nickname 에 접근하면 그레코드가
            # await 밖에서 lazy-load 를 시도해 MissingGreenlet 으로 죽는다(코드리뷰 HIGH #2 관련
            # 레이스 복구 경로에서 실제로 재현됨).
            await db.refresh(other_user)
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
    if conv.conversation_type == "direct":
        require_participant(conv, _session_uid)
        await require_unblocked(db, conv.participant_1, conv.participant_2)
    else:
        await require_member(db, conv, _session_uid)

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
    if conv.conversation_type == "direct":
        require_participant(conv, _session_uid)
        await require_unblocked(db, conv.participant_1, conv.participant_2)
    else:
        await require_member(db, conv, _session_uid)

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
    # §3.7: recipient_ids 배열 — direct 는 상대 1명, group/open 은 활성 멤버 중 muted 제외 전원.
    if conv.conversation_type == "direct":
        recipient_ids = [_other_user_id(conv, _session_uid)]
    else:
        recipient_ids = (
            (
                await db.execute(
                    select(DmConversationMember.user_id).where(
                        DmConversationMember.conversation_id == conv_id,
                        DmConversationMember.user_id != _session_uid,
                        DmConversationMember.left_at.is_(None),
                        DmConversationMember.muted_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
    sender = await db.get(User, _session_uid)
    preview = body.content[:50] if body.content else "사진을 보냈습니다"
    if recipient_ids:
        noti_events.enqueue(
            db,
            "dm.message_sent",
            {
                "conversation_id": str(conv_id),
                "sender_id": str(_session_uid),
                "recipient_ids": [str(rid) for rid in recipient_ids],
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

    now = datetime.now(UTC)

    if conv.conversation_type == "direct":
        require_participant(conv, _session_uid)
        await require_unblocked(db, conv.participant_1, conv.participant_2)
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
        marked = len(unread)
    else:
        member = await require_member(db, conv, _session_uid)
        marked = (
            await db.execute(
                select(func.count())
                .select_from(DmMessage)
                .where(
                    DmMessage.conversation_id == conv_id,
                    DmMessage.sender_id != _session_uid,
                    DmMessage.created_at > member.last_read_at,
                )
            )
        ).scalar_one()

    # §3.3(c) unread SoT — 종류 무관하게 last_read_at 을 갱신한다 (direct 도 통일).
    member_row = (
        await db.execute(
            select(DmConversationMember).where(
                DmConversationMember.conversation_id == conv_id,
                DmConversationMember.user_id == _session_uid,
            )
        )
    ).scalar_one_or_none()
    if member_row is not None:
        member_row.last_read_at = now

    await db.commit()
    return {"marked": marked}


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
    await guard_duplicate_report(
        db,
        Report.target_type == "DM",
        Report.conversation_id == conv_id,
        Report.reporter_id == session_uid,
    )

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


def _group_conv_out(conv: DmConversation) -> DmConversationOut:
    """group/open 대화방 응답 조립 — 이 항목들은 other_user_* 를 채우지 않는다."""
    return DmConversationOut(
        id=conv.id,
        last_message_preview=None,
        last_message_at=conv.last_message_at,
        unread_count=0,
        conversation_type=conv.conversation_type,
        title=conv.title,
        photo_url=_resolve_conv_photo(conv),
        member_count=conv.member_count,
        community_group_id=conv.community_group_id,
    )


@router.post("/conversations/group", response_model=DmConversationOut, status_code=201, summary="그룹톡방 개설")
async def create_group_conversation(
    body: DmGroupConversationCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    member_ids = {uid for uid in body.member_ids if uid != _session_uid}
    if not member_ids:
        raise HTTPException(status_code=400, detail="member_ids must include at least one other user")

    users = (await db.execute(select(User).where(User.id.in_(member_ids), User.status == "ACTIVE"))).scalars().all()
    if len(users) != len(member_ids):
        raise HTTPException(status_code=404, detail="User not found")
    for uid in member_ids:
        await require_unblocked(db, _session_uid, uid)

    now = datetime.now(UTC)
    conv = DmConversation(
        conversation_type="group",
        title=body.title,
        photo_content_id=body.photo_content_id,
        created_by=_session_uid,
        member_count=len(member_ids) + 1,
        last_message_at=now,
    )
    db.add(conv)
    await db.flush()

    db.add(DmConversationMember(conversation_id=conv.id, user_id=_session_uid, role="owner"))
    for uid in member_ids:
        db.add(DmConversationMember(conversation_id=conv.id, user_id=uid, role="member"))
    await db.commit()
    await db.refresh(conv)
    return _group_conv_out(conv)


@router.post("/conversations/{conv_id}/members", response_model=DmConversationOut, summary="멤버 초대")
async def invite_members(
    conv_id: uuid.UUID,
    body: DmMemberInviteRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type != "group":
        raise HTTPException(status_code=400, detail="Only group conversations support invites")
    await require_member(db, conv, _session_uid)  # group 은 멤버 누구나 초대 가능 (§3.5)

    invite_ids = {uid for uid in body.user_ids if uid != _session_uid}
    if not invite_ids:
        raise HTTPException(status_code=400, detail="user_ids must include at least one other user")

    users = (await db.execute(select(User).where(User.id.in_(invite_ids), User.status == "ACTIVE"))).scalars().all()
    if len(users) != len(invite_ids):
        raise HTTPException(status_code=404, detail="User not found")

    existing_rows = (
        (
            await db.execute(
                select(DmConversationMember).where(
                    DmConversationMember.conversation_id == conv_id,
                    DmConversationMember.user_id.in_(invite_ids),
                )
            )
        )
        .scalars()
        .all()
    )
    existing_by_uid = {m.user_id: m for m in existing_rows}

    now = datetime.now(UTC)
    added = 0
    for uid in invite_ids:
        await require_unblocked_for_join(db, conv_id, uid)
        member = existing_by_uid.get(uid)
        if member is None:
            db.add(DmConversationMember(conversation_id=conv_id, user_id=uid, role="member"))
            added += 1
        elif member.left_at is not None:
            member.left_at = None
            member.joined_at = now
            member.last_read_at = now
            added += 1

    conv.member_count += added
    await db.commit()
    await db.refresh(conv)
    return _group_conv_out(conv)


@router.delete("/conversations/{conv_id}/members/{user_id}", summary="멤버 나가기/강퇴")
async def remove_member(
    conv_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations have no members endpoint")

    actor = await require_member(db, conv, _session_uid)
    if user_id != _session_uid and actor.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owner/admin can remove other members")

    target = (
        await db.execute(
            select(DmConversationMember).where(
                DmConversationMember.conversation_id == conv_id,
                DmConversationMember.user_id == user_id,
                DmConversationMember.left_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")

    target.left_at = datetime.now(UTC)
    conv.member_count = max(conv.member_count - 1, 0)
    await db.commit()
    return {"ok": True}


@router.post("/conversations/{conv_id}/join", response_model=DmConversationOut, summary="오픈톡방 입장")
async def join_open_conversation(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type != "open":
        raise HTTPException(status_code=400, detail="Not an open conversation")
    if conv.community_group_id is None:
        raise HTTPException(status_code=400, detail="Open conversation missing community group")
    # Phase2(204_community_group.sql) 완료 — 커뮤니티 그룹의 실제 멤버인지 검증(§3.5 join 명세).
    # 그룹 가입은 POST /community/groups/{id}/join 이 정본 경로이고, 여기서는 그 결과(ACTIVE 멤버십)만
    # 확인한다 — private/approval 그룹의 오픈톡방을 이 엔드포인트로 우회 입장하는 사고를 막는다.
    group_member = (
        await db.execute(
            select(CommunityGroupMember).where(
                CommunityGroupMember.group_id == conv.community_group_id,
                CommunityGroupMember.user_id == _session_uid,
                CommunityGroupMember.status == "ACTIVE",
            )
        )
    ).scalar_one_or_none()
    if group_member is None:
        raise HTTPException(status_code=403, detail="Not an active member of this group")

    now = datetime.now(UTC)
    member = (
        await db.execute(
            select(DmConversationMember).where(
                DmConversationMember.conversation_id == conv_id,
                DmConversationMember.user_id == _session_uid,
            )
        )
    ).scalar_one_or_none()
    if member is None:
        # 오픈톡방은 기본 muted 로 가입 (§3.7)
        db.add(
            DmConversationMember(
                conversation_id=conv_id,
                user_id=_session_uid,
                role="member",
                joined_at=now,
                last_read_at=now,
                muted_at=now,
            )
        )
        conv.member_count += 1
    elif member.left_at is not None:
        member.left_at = None
        member.joined_at = now
        member.last_read_at = now
        member.muted_at = now
        conv.member_count += 1
    # else: 이미 활성 멤버 — 멱등하게 no-op

    await db.commit()
    await db.refresh(conv)
    return _group_conv_out(conv)


@router.patch("/conversations/{conv_id}", response_model=DmConversationOut, summary="방 제목·사진 수정")
async def update_conversation(
    conv_id: uuid.UUID,
    body: DmConversationPatchRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations cannot be edited")

    actor = await require_member(db, conv, _session_uid)
    if actor.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owner/admin can edit this conversation")

    if body.title is not None:
        conv.title = body.title
    if body.photo_content_id is not None:
        conv.photo_content_id = body.photo_content_id
    await db.commit()
    await db.refresh(conv)
    return _group_conv_out(conv)


@router.post("/conversations/{conv_id}/mute", summary="방별 알림 토글")
async def toggle_mute(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    member = await require_member(db, conv, _session_uid)
    member.muted_at = None if member.muted_at is not None else datetime.now(UTC)
    await db.commit()
    return {"muted": member.muted_at is not None}
