import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import (
    CommunityGroupMember,
    Content,
    DmConversation,
    DmConversationBan,
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
    DmBanOut,
    DmBanRequest,
    DmConversationCreateRequest,
    DmConversationOut,
    DmConversationPatchRequest,
    DmGroupConversationCreateRequest,
    DmMemberInviteRequest,
    DmMemberRolePatchRequest,
    DmMessageCreateRequest,
    DmMessageOut,
    DmPresenceOut,
    DmRecordingPresenceRequest,
    DmRecordingUserOut,
    FunnelEventType,
    Page,
    ReportCreateRequest,
)
from ..services import funnel_events, noti_events, walkie_recording_presence
from ..services.banned_keywords import banned_keywords as _banned_keywords
from ..services.dm_policy import (
    require_invite_eligible,
    require_manager,
    require_member,
    require_not_banned,
    require_participant,
    require_unblocked,
    require_unblocked_for_join,
)
from ..utils import build_imgproxy_url, resolve_avatar_url
from ._report_guard import guard_duplicate_report
from .contents import CONTENTS_BASE_PATH, _content_playback_url
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


def _resolve_dm_audio(msg: DmMessage) -> str | None:
    """워키토키 음성메시지 재생URL. 재생완료로 컨텐츠가 삭제된 뒤에는 None."""
    ac = msg.audio_content
    return _content_playback_url(ac) if ac else None


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


async def _require_conv_access(db: AsyncSession, conv: DmConversation, session_uid: uuid.UUID) -> None:
    """direct/group 공통 접근 검증 — presence/recording-presence 엔드포인트용."""
    if conv.conversation_type == "direct":
        other_id = require_participant(conv, session_uid)
        await require_unblocked(db, session_uid, other_id)
    else:
        await require_member(db, conv, session_uid)


# 워키토키(A-7) 채널정보 UX — 최근 5분 내 활성(User.last_seen_at) 인원 / 전체 멤버, + 소프트 녹음중 신호.
_PRESENCE_ACTIVE_WINDOW = timedelta(minutes=5)


@router.get("/conversations/{conv_id}/presence", response_model=DmPresenceOut, summary="대화방 참석/녹음 현황")
async def get_conversation_presence(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await _require_conv_access(db, conv, _session_uid)

    if conv.conversation_type == "direct":
        member_ids = [uid for uid in (conv.participant_1, conv.participant_2) if uid is not None]
    else:
        member_ids = (
            (
                await db.execute(
                    select(DmConversationMember.user_id).where(
                        DmConversationMember.conversation_id == conv.id,
                        DmConversationMember.left_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )

    active_members = 0
    if member_ids:
        threshold = datetime.now(UTC) - _PRESENCE_ACTIVE_WINDOW
        active_members = (
            await db.execute(
                select(func.count()).select_from(User).where(User.id.in_(member_ids), User.last_seen_at >= threshold)
            )
        ).scalar_one()

    recorder_ids = await walkie_recording_presence.get_active_recorders(str(conv.id))
    recording_users: list[DmRecordingUserOut] = []
    if recorder_ids:
        rows = (
            (await db.execute(select(User).where(User.id.in_([uuid.UUID(uid) for uid in recorder_ids]))))
            .scalars()
            .all()
        )
        recording_users = [DmRecordingUserOut(id=u.id, nickname=u.nickname) for u in rows]

    return DmPresenceOut(
        total_members=len(member_ids),
        active_members=active_members,
        recording_users=recording_users,
    )


@router.post(
    "/conversations/{conv_id}/recording-presence",
    status_code=204,
    summary="워키토키 녹음 시작/종료 소프트 신호",
)
async def set_recording_presence(
    conv_id: uuid.UUID,
    body: DmRecordingPresenceRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await _require_conv_access(db, conv, _session_uid)

    if body.action == "start":
        await walkie_recording_presence.mark_recording(str(conv.id), str(_session_uid))
    else:
        await walkie_recording_presence.clear_recording(str(conv.id), str(_session_uid))


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

    async def _appt_for(m: DmMessage):
        if m.message_type == "appointment" and m.meta and m.meta.get("appointmentId"):
            a = appts.get(uuid.UUID(m.meta["appointmentId"]))
            return await _appt_out(db, a, seller_id) if a else None
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
            audio_url=_resolve_dm_audio(m),
            read_at=m.read_at,
            created_at=m.created_at,
            message_type=m.message_type,
            meta=m.meta,
            appointment=await _appt_for(m),
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

    if body.content is None and body.image_content_id is None and body.audio_content_id is None:
        raise HTTPException(status_code=400, detail="content, image_content_id or audio_content_id is required")

    # 금칙어 차단 — 텍스트 타입 메시지에만 적용 (부분문자열, 대소문자 무시)
    if (body.message_type or "text") == "text" and body.content:
        content_lower = body.content.lower()
        if any(kw in content_lower for kw in await _banned_keywords(db)):
            raise HTTPException(status_code=400, detail={"code": "banned_keyword"})

    # 워키토키 음성메시지(A-3) — audio_content_id 동봉 시 message_type 을 강제로 'voice' 로
    message_type = "voice" if body.audio_content_id is not None else (body.message_type or "text")

    now = datetime.now(UTC)
    msg = DmMessage(
        conversation_id=conv_id,
        sender_id=_session_uid,
        content=body.content,
        message_type=message_type,
        meta=body.meta,
        image_content_id=body.image_content_id,
        audio_content_id=body.audio_content_id,
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
    if body.content:
        preview = body.content[:50]
    elif body.audio_content_id is not None:
        preview = "음성 메시지를 보냈습니다"
    elif message_type == "walkie_invite":
        preview = "워키토키 채널을 열었어요"
    else:
        preview = "사진을 보냈습니다"
    if recipient_ids:
        noti_payload = {
            "conversation_id": str(conv_id),
            "sender_id": str(_session_uid),
            "recipient_ids": [str(rid) for rid in recipient_ids],
            "sender_nickname": sender.nickname if sender and sender.nickname else "",
            "preview": preview,
        }
        # B-4: 음성메시지는 수신 알림에 "바로 재생" 액션을 붙이기 위해 재생 URL/메시지 ID 를 동봉한다.
        if message_type == "voice":
            noti_payload["message_type"] = "voice"
            noti_payload["message_id"] = str(msg.id)
            noti_payload["audio_url"] = f"/api/bff/contents/{body.audio_content_id}/raw"
        noti_events.enqueue(db, "dm.message_sent", noti_payload)
    await db.commit()

    msg = (await db.execute(select(DmMessage).where(DmMessage.id == msg.id))).scalar_one()

    return DmMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        content=msg.content,
        image_url=_resolve_dm_image(msg),
        audio_url=_resolve_dm_audio(msg),
        read_at=msg.read_at,
        created_at=msg.created_at,
        message_type=msg.message_type,
        meta=msg.meta,
    )


@router.post(
    "/conversations/{conv_id}/messages/{message_id}/played",
    response_model=DmMessageOut,
    summary="음성메시지 재생완료",
)
async def mark_voice_played(
    conv_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """D-6 확정: 1:1 DM 음성메시지는 수신자가 재생완료하면 즉시 파일을 삭제한다.
    발신자 본인의 재생은 삭제를 유발하지 않는다(그룹채널은 범위 밖 — §5-3)."""
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type != "direct":
        raise HTTPException(status_code=400, detail="Voice playback deletion is direct-DM only")
    require_participant(conv, _session_uid)
    await require_unblocked(db, conv.participant_1, conv.participant_2)

    msg = (
        await db.execute(select(DmMessage).where(DmMessage.id == message_id, DmMessage.conversation_id == conv_id))
    ).scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.message_type != "voice":
        raise HTTPException(status_code=400, detail="Not a voice message")

    if msg.sender_id != _session_uid and msg.audio_content_id is not None:
        content = await db.get(Content, msg.audio_content_id)
        if content is not None:
            abs_path = CONTENTS_BASE_PATH / content.file_path
            if await asyncio.to_thread(abs_path.is_file):
                await asyncio.to_thread(abs_path.unlink)
            await db.delete(content)
        msg.audio_content_id = None
        msg.meta = {**(msg.meta or {}), "playedAt": datetime.now(UTC).isoformat()}
        await db.commit()
        await db.refresh(msg)

    return DmMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        content=msg.content,
        image_url=_resolve_dm_image(msg),
        audio_url=_resolve_dm_audio(msg),
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


_GROUP_MESSAGE_REPORT_REASONS = {"ABUSE", "SCAM", "SEXUAL", "SPAM", "OTHER"}


# P5-5(260827, Q-3 확정) — 그룹/오픈톡방 신고는 방 전체가 아니라 특정 메시지 단위.
@router.post("/conversations/{conv_id}/messages/{message_id}/report", status_code=201, summary="그룹 메시지 신고")
async def report_group_message(
    conv_id: uuid.UUID,
    message_id: uuid.UUID,
    body: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.reason not in _GROUP_MESSAGE_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="invalid reason")
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Use the conversation report endpoint for direct DM")
    await require_member(db, conv, session_uid)

    msg = (
        await db.execute(select(DmMessage).where(DmMessage.id == message_id, DmMessage.conversation_id == conv_id))
    ).scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id == session_uid:
        raise HTTPException(status_code=400, detail="cannot report your own message")

    # 중복 판정 — reports 부분 유니크(uq_reports_group_message_once: group_message_id x reporter_id WHERE GROUP_MESSAGE)와 동일 조건
    await guard_duplicate_report(
        db,
        Report.target_type == "GROUP_MESSAGE",
        Report.group_message_id == message_id,
        Report.reporter_id == session_uid,
    )

    db.add(
        Report(
            target_type="GROUP_MESSAGE",
            reporter_id=session_uid,
            reported_user_id=msg.sender_id,
            group_message_id=message_id,
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
        # 초대 자격 — 내가 팔로우하는 사람만 (대표 지시 2026-08-28, 맞팔은 부분집합이라 포함).
        await require_invite_eligible(db, _session_uid, uid)

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
        member = existing_by_uid.get(uid)
        # 이미 활성 멤버면 아무 것도 하지 않는다 — 여기에 자격검사를 걸면, 클라이언트가 원하는
        # 멤버 집합을 통째로 POST 하거나 남이 초대해둔 사람을 다시 넣을 때 배치 전체가 403 이 된다
        # (예외가 트랜잭션을 끊어 아무도 추가되지 않는다).
        if member is not None and member.left_at is None:
            continue
        await require_unblocked_for_join(db, conv_id, uid)
        # 밴은 재초대로도 뚫리지 않는다(강퇴와의 차이).
        await require_not_banned(db, conv_id, uid)
        # 자격(초대자의 팔로잉)은 **처음 들어오는 사람에게만** 요구한다. 강퇴당했다가 돌아오는
        # 경우까지 요구하면, 남은 운영진 중 그를 팔로우하는 사람이 없을 때 "강퇴는 재초대로 복귀
        # 가능"이라는 규칙(service-rules.md)이 성립하지 않는다.
        if member is None:
            await require_invite_eligible(db, _session_uid, uid)
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


@router.patch(
    "/conversations/{conv_id}/members/{user_id}/role",
    summary="관리자 임명/해임",
)
async def set_member_role(
    conv_id: uuid.UUID,
    user_id: uuid.UUID,
    body: DmMemberRolePatchRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """개설자(owner)만 관리자(admin)를 임명·해임한다.

    운영진 구분(대표 지시 2026-08-28): owner 는 방을 만든 1명으로 고정이고 위임·강등되지 않는다.
    admin 은 owner 가 임명하며 강퇴·밴 권한을 갖는다(`require_manager`).
    """
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations have no roles")

    actor = await require_member(db, conv, _session_uid)
    if actor.role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can change roles")
    if user_id == _session_uid:
        raise HTTPException(status_code=400, detail="Owner role cannot be changed")

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
    if target.role == "owner":
        raise HTTPException(status_code=400, detail="Owner role cannot be changed")

    target.role = body.role
    await db.commit()
    return {"ok": True, "role": target.role}


@router.get("/conversations/{conv_id}/bans", response_model=list[DmBanOut], summary="블랙리스트 목록")
async def list_bans(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    actor = await require_member(db, conv, _session_uid)
    require_manager(actor)

    rows = (
        await db.execute(
            select(DmConversationBan, User)
            .join(User, User.id == DmConversationBan.user_id)
            .where(DmConversationBan.conversation_id == conv_id)
            .order_by(DmConversationBan.created_at.desc())
        )
    ).all()
    return [
        DmBanOut(
            user_id=ban.user_id,
            nickname=user.nickname,
            avatar_url=resolve_avatar_url(user),
            banned_by=ban.banned_by,
            reason=ban.reason,
            created_at=ban.created_at,
        )
        for ban, user in rows
    ]


@router.post("/conversations/{conv_id}/bans", status_code=201, summary="블랙리스트 등록")
async def ban_member(
    conv_id: uuid.UUID,
    body: DmBanRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """운영진(owner/admin)이 블랙리스트에 등록한다. 활성 멤버면 즉시 퇴장까지 함께 처리한다.

    강퇴(`DELETE .../members/{id}`)와의 차이: 강퇴는 재초대로 복귀 가능하지만 밴은 해제 전까지
    초대·입장 모두 막힌다.
    """
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations have no bans")

    actor = await require_member(db, conv, _session_uid)
    require_manager(actor)
    if body.user_id == _session_uid:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    # 대상 존재 확인 — 없는 UUID 면 FK 위반(IntegrityError → 500) 대신 404 로 답한다
    # (invite_members 와 동일 관례).
    target_user = (await db.execute(select(User.id).where(User.id == body.user_id, User.status == "ACTIVE"))).first()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    target = (
        await db.execute(
            select(DmConversationMember).where(
                DmConversationMember.conversation_id == conv_id,
                DmConversationMember.user_id == body.user_id,
            )
        )
    ).scalar_one_or_none()
    # 운영진끼리는 서로 밴할 수 없다 — owner 는 누구도 밴하지 못하고, admin 은 admin 을 밴하지 못한다.
    if target is not None and target.role == "owner":
        raise HTTPException(status_code=403, detail="Owner cannot be banned")
    if target is not None and target.role == "admin" and actor.role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can ban an admin")

    # 조회-후-삽입은 원자적이지 않다 — 두 운영진이 같은 사용자를 동시에 밴하면 둘 다 없다고 보고
    # 삽입해 PK 충돌(500)이 난다. 멱등하게 upsert 한다.
    await db.execute(
        pg_insert(DmConversationBan)
        .values(
            conversation_id=conv_id,
            user_id=body.user_id,
            banned_by=_session_uid,
            reason=body.reason,
        )
        .on_conflict_do_nothing(index_elements=["conversation_id", "user_id"])
    )
    # 활성 멤버였다면 함께 퇴장 처리 (밴만 걸고 방에 남아있는 상태가 되지 않도록)
    if target is not None and target.left_at is None:
        target.left_at = datetime.now(UTC)
        conv.member_count = max(conv.member_count - 1, 0)

    await db.commit()
    return {"ok": True}


@router.delete("/conversations/{conv_id}/bans/{user_id}", summary="블랙리스트 해제")
async def unban_member(
    conv_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    actor = await require_member(db, conv, _session_uid)
    require_manager(actor)

    ban = (
        await db.execute(
            select(DmConversationBan).where(
                DmConversationBan.conversation_id == conv_id,
                DmConversationBan.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if ban is None:
        raise HTTPException(status_code=404, detail="Ban not found")
    await db.delete(ban)
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
    # 오픈톡방도 방 단위 블랙리스트는 그대로 적용된다 — 커뮤니티 그룹 멤버라도 이 방에서 밴됐으면 못 들어온다.
    await require_not_banned(db, conv_id, _session_uid)

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
