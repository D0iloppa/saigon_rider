import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import resolve_tracking_ids, unpack_tracking_ids, verify_user_session
from ..models import (
    CommunityGroupMember,
    Content,
    DmConversation,
    DmConversationBan,
    DmConversationMember,
    DmMessage,
    DmMessageReaction,
    FunnelEvent,
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
    DmConversationActiveTradeOut,
    DmConversationCreateRequest,
    DmConversationNoticeRequest,
    DmConversationOut,
    DmConversationPatchRequest,
    DmGroupConversationCreateRequest,
    DmMemberInviteRequest,
    DmMemberOut,
    DmMemberRolePatchRequest,
    DmMessageCreateRequest,
    DmMessageEditRequest,
    DmMessageOut,
    DmNoticeOut,
    DmPresenceOut,
    DmReactionOut,
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
from .market import _thumbnail_url as _market_thumbnail_url

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


# 공감 고정 팔레트 (Slack 스타일) — 자유 이모지는 받지 않는다 (범위 확정, 215_dm_message_sync)
_DM_REACTION_EMOJIS = ("👍", "❤️", "😂", "😮", "😢", "🙏")


async def _reactions_map(
    db: AsyncSession, message_ids: list[uuid.UUID], me: uuid.UUID
) -> dict[uuid.UUID, list[DmReactionOut]]:
    """메시지들의 이모지별 공감 집계 — N+1 없이 GROUP BY 한 번."""
    if not message_ids:
        return {}
    rows = (
        await db.execute(
            select(
                DmMessageReaction.message_id,
                DmMessageReaction.emoji,
                func.count(),
                func.bool_or(DmMessageReaction.user_id == me),
            )
            .where(DmMessageReaction.message_id.in_(message_ids))
            .group_by(DmMessageReaction.message_id, DmMessageReaction.emoji)
        )
    ).all()
    result: dict[uuid.UUID, list[DmReactionOut]] = {}
    for message_id, emoji, count, reacted_by_me in rows:
        result.setdefault(message_id, []).append(DmReactionOut(emoji=emoji, count=count, reacted_by_me=reacted_by_me))
    # 팔레트 순서로 정렬 — 클라이언트 렌더 순서 안정화
    for items in result.values():
        items.sort(key=lambda r: _DM_REACTION_EMOJIS.index(r.emoji) if r.emoji in _DM_REACTION_EMOJIS else 99)
    return result


def _other_user_id(conv: DmConversation, me: uuid.UUID) -> uuid.UUID:
    return conv.participant_2 if conv.participant_1 == me else conv.participant_1


def _resolve_conv_photo(conv: DmConversation) -> str | None:
    content = conv.photo_content
    if content and content.file_path:
        return build_imgproxy_url(content.file_path)
    return None


async def _resolve_notice(db: AsyncSession, conv: DmConversation) -> DmNoticeOut | None:
    """방 공지(217) 조립 — 원본이 소프트삭제됐으면 공지가 없는 것으로 본다."""
    if conv.notice_message_id is None:
        return None
    msg = await db.get(DmMessage, conv.notice_message_id)
    if msg is None or msg.deleted_at is not None:
        return None
    setter = await db.get(User, conv.notice_set_by) if conv.notice_set_by else None
    return DmNoticeOut(
        message_id=msg.id,
        content=msg.content,
        set_by=conv.notice_set_by,
        set_by_nickname=setter.nickname if setter else None,
        set_at=conv.notice_set_at,
    )


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

    # init/214: 방이 상대당 1개로 합쳐졌으므로 매물 구분은 진행 중 거래 목록으로 드러낸다.
    # 대화방 수만큼 쿼리를 늘리지 않도록 IN 절 한 번으로 배치 조회한다.
    active_trades_map: dict[uuid.UUID, list[DmConversationActiveTradeOut]] = {}
    if rows:
        trade_rows = (
            await db.execute(
                select(MarketplaceAppointment, MarketplaceListing)
                .join(MarketplaceListing, MarketplaceListing.id == MarketplaceAppointment.listing_id)
                .where(
                    MarketplaceAppointment.conversation_id.in_([c.id for c in rows]),
                    MarketplaceAppointment.status.in_(("PROPOSED", "ACCEPTED")),
                )
                .order_by(MarketplaceAppointment.created_at.asc())
            )
        ).all()
        for appt, listing in trade_rows:
            active_trades_map.setdefault(appt.conversation_id, []).append(
                DmConversationActiveTradeOut(
                    appointment_id=appt.id,
                    listing_id=listing.id,
                    listing_title=listing.title,
                    thumbnail_url=_market_thumbnail_url(listing),
                    status=appt.status,
                )
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
                        # 소프트 삭제된 메시지는 안읽음으로 세지 않는다 (215_dm_message_sync)
                        DmMessage.deleted_at.is_(None),
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
                # 소프트 삭제된 마지막 메시지는 콘텐츠 대신 플레이스홀더 (DmDetail 의 dm.deletedMessage 와 동일 문구)
                last_message_preview=(
                    "삭제된 메시지입니다"
                    if last_msg is not None and last_msg.deleted_at is not None
                    else last_msg.content[:50]
                    if last_msg and last_msg.content
                    else None
                ),
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
                active_trades=active_trades_map.get(conv.id, []),
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
        return _group_conv_out(conv, await _resolve_notice(db, conv))

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
    tracking_ids: tuple = Depends(resolve_tracking_ids),
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

    # init/214: 상대 1명당 direct 대화는 1개 — 매물 컨텍스트로 방을 가르지 않는다(리스트 중복방 제거).
    # context_type/context_id 는 "가장 최근 문의한 매물" 기록으로만 남는다(deprecate, 드롭 안 함).
    pair_filter = (
        DmConversation.participant_1 == p1,
        DmConversation.participant_2 == p2,
        DmConversation.conversation_type == "direct",
    )

    # 정본 §5 #5: "문의" 퍼널은 (문의자, 매물) 조합의 첫 문의 1회만. init/214 이전에는 "매물별 대화방
    # 신규 생성"이 그 대리지표였는데, 방이 상대당 1개로 합쳐지면서 그 기준이 성립하지 않는다.
    is_first_inquiry = False
    if body.context_type == "listing":
        is_first_inquiry = (
            await db.execute(
                select(FunnelEvent.id)
                .where(
                    FunnelEvent.event_type == FunnelEventType.INQUIRY.value,
                    FunnelEvent.user_id == _session_uid,
                    FunnelEvent.entity_id == body.context_id,
                )
                .limit(1)
            )
        ).scalar_one_or_none() is None

    existing = (await db.execute(select(DmConversation).where(*pair_filter))).scalar_one_or_none()

    if existing:
        conv = existing
        # 새 매물 문의로 들어온 재사용이면 컨텍스트만 최신값으로 갱신
        if body.context_type == "listing" and conv.context_id != body.context_id:
            conv.context_type = body.context_type
            conv.context_id = body.context_id
            await db.commit()
            await db.refresh(conv)
    else:
        conv = DmConversation(
            participant_1=p1, participant_2=p2, context_type=body.context_type, context_id=body.context_id
        )
        db.add(conv)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            # rollback() 은 세션의 모든 persistent 객체(other_user 포함, 위에서 이미 로드됨)를
            # expire 시킨다 — refresh 없이 아래에서 other_user.nickname 에 접근하면 그레코드가
            # await 밖에서 lazy-load 를 시도해 MissingGreenlet 으로 죽는다(코드리뷰 HIGH #2 관련
            # 레이스 복구 경로에서 실제로 재현됨).
            await db.refresh(other_user)
            conv = (await db.execute(select(DmConversation).where(*pair_filter))).scalar_one()
        await db.refresh(conv)

    if is_first_inquiry:
        await funnel_events.record(
            db,
            FunnelEventType.INQUIRY,
            user_id=_session_uid,
            entity_id=body.context_id,
            anon_id=unpack_tracking_ids(tracking_ids)[0],
            session_id=unpack_tracking_ids(tracking_ids)[1],
        )

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
    """메시지 목록.

    `after` 커서는 **`updated_at` 워터마크**다 (215_dm_message_sync) — 신규 메시지뿐 아니라
    수정/소프트삭제/공감변경으로 `updated_at` 이 bump 된 메시지가 전부 실려 온다.
    클라이언트는 로컬 캐시에 id 로 upsert 만 하면 된다. (커서 없는 요청은 종전대로
    `created_at` 순 offset 페이지네이션 — 과거분 로드용.)

    ⚠️ `after`(커서)를 준 요청에서 **`total` 은 "커서 이후 전체 개수"가 아니라 이번 응답의 건수**다.
    폴링 경로의 COUNT(*) 를 없애면서 생긴 의도적 차이다(성능). 따라서 커서 요청에는
    `acc.length >= total` 같은 페이징 관용구를 쓰면 안 된다 — 그런 계산이 필요하면 커서 없이
    조회해 정확한 total 을 받는다. 또한 커서 이후 `size` 를 넘는 메시지가 쌓였는지 알 수 없으므로,
    폴링 소비처는 커서를 계속 전진시켜 다음 tick 에 나머지를 받아야 한다.
    """
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
        # 워터마크 커서 — 커서 전진이 성립하려면 정렬도 updated_at 기준이어야 한다
        base = base.where(DmMessage.updated_at > after).order_by(DmMessage.updated_at.asc())
    else:
        base = base.order_by(DmMessage.created_at.asc())

    offset = (page - 1) * size
    rows = (await db.execute(base.offset(offset).limit(size))).scalars().all()

    # `after` 커서가 있는 요청은 **폴링**이다(DmDetail·워키토키 캡슐이 5초마다 호출). 이 경로에서
    # COUNT(*) 는 매 tick 마다 전체 스캔을 한 번 더 거는데, 소비처가 하나도 없다 — 폴링 응답에서
    # total 은 "커서 이후 개수"일 뿐이고 프론트는 items 만 쓴다. 유휴 폴링의 DB 쿼리를 절반으로
    # 줄이기 위해 이 경우 COUNT 를 생략하고 반환 건수를 그대로 싣는다.
    # (커서 없는 최초 로드/페이지 이동은 종전대로 정확한 total 을 계산한다 — 워키토키 캡슐이
    #  마지막 페이지 번호를 total 로 계산하므로 이쪽 정확도는 유지해야 한다.)
    if after is not None:
        total = len(rows)
    else:
        total = (
            await db.execute(select(func.count()).select_from(DmMessage).where(DmMessage.conversation_id == conv_id))
        ).scalar_one()

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

    reactions = await _reactions_map(db, [m.id for m in rows], _session_uid)

    items = [
        DmMessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_id=m.sender_id,
            # 소프트 삭제된 메시지는 콘텐츠를 노출하지 않는다 — 클라이언트는 deleted_at 로 플레이스홀더 렌더
            content=None if m.deleted_at else m.content,
            image_url=None if m.deleted_at else _resolve_dm_image(m),
            audio_url=None if m.deleted_at else _resolve_dm_audio(m),
            read_at=m.read_at,
            created_at=m.created_at,
            message_type=m.message_type,
            meta=None if m.deleted_at else m.meta,
            appointment=await _appt_for(m),
            price_offer=_offer_for(m),
            updated_at=m.updated_at,
            edited_at=m.edited_at,
            deleted_at=m.deleted_at,
            reply_to_message_id=m.reply_to_message_id,
            reply_preview=None if m.deleted_at else m.reply_preview,
            reactions=reactions.get(m.id, []),
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

    # 답장 앵커 (215_dm_message_sync) — 서버가 전송 시점에 원본을 조회해 스냅샷을 만든다.
    # 원본이 나중에 보관기간 만료·소프트삭제돼도 답장 버블은 이 스냅샷만으로 렌더된다.
    reply_preview: dict | None = None
    if body.reply_to_message_id is not None:
        original = (
            await db.execute(
                select(DmMessage).where(DmMessage.id == body.reply_to_message_id, DmMessage.conversation_id == conv_id)
            )
        ).scalar_one_or_none()
        if original is None:
            raise HTTPException(status_code=404, detail="Reply target message not found")
        if original.deleted_at is not None:
            raise HTTPException(status_code=400, detail="Cannot reply to a deleted message")
        original_sender = await db.get(User, original.sender_id)
        reply_preview = {
            "senderId": str(original.sender_id),
            "senderNickname": original_sender.nickname if original_sender else None,
            "content": original.content[:80] if original.content else None,
            # content 없는 원본(이미지/음성/약속/가격제안)에 답장해도 프론트가
            # "[사진]" 같은 대체 라벨을 만들 수 있게 원본 타입을 함께 스냅샷한다.
            "messageType": original.message_type,
        }

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
        updated_at=now,
        reply_to_message_id=body.reply_to_message_id,
        reply_preview=reply_preview,
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
        updated_at=msg.updated_at,
        reply_to_message_id=msg.reply_to_message_id,
        reply_preview=msg.reply_preview,
    )


async def _require_message_access(
    db: AsyncSession, conv_id: uuid.UUID, message_id: uuid.UUID, session_uid: uuid.UUID
) -> DmMessage:
    """수정/삭제/공감 공통 — 대화방 접근 검증 후 해당 방의 메시지를 반환한다."""
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await _require_conv_access(db, conv, session_uid)
    msg = (
        await db.execute(select(DmMessage).where(DmMessage.id == message_id, DmMessage.conversation_id == conv_id))
    ).scalar_one_or_none()
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return msg


@router.patch(
    "/conversations/{conv_id}/messages/{message_id}",
    response_model=DmMessageOut,
    summary="메시지 수정 (본인 텍스트 메시지만)",
)
async def edit_message(
    conv_id: uuid.UUID,
    message_id: uuid.UUID,
    body: DmMessageEditRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    msg = await _require_message_access(db, conv_id, message_id, _session_uid)
    if msg.sender_id != _session_uid:
        raise HTTPException(status_code=403, detail="Not your message")
    if msg.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot edit a deleted message")
    if msg.message_type != "text":
        raise HTTPException(status_code=400, detail="Only text messages can be edited")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="content is required")

    # 금칙어 차단 — 전송과 동일 규칙 (수정으로 우회 불가)
    content_lower = body.content.lower()
    if any(kw in content_lower for kw in await _banned_keywords(db)):
        raise HTTPException(status_code=400, detail={"code": "banned_keyword"})

    now = datetime.now(UTC)
    msg.content = body.content
    msg.edited_at = now
    msg.updated_at = now  # 워터마크 bump — 상대 클라이언트 폴링에 실린다
    await db.commit()
    await db.refresh(msg)

    reactions = await _reactions_map(db, [msg.id], _session_uid)
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
        updated_at=msg.updated_at,
        edited_at=msg.edited_at,
        reply_to_message_id=msg.reply_to_message_id,
        reply_preview=msg.reply_preview,
        reactions=reactions.get(msg.id, []),
    )


@router.delete("/conversations/{conv_id}/messages/{message_id}", summary="메시지 삭제 (소프트)")
async def delete_message(
    conv_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """본인 메시지 소프트 삭제 — deleted_at 마킹만 하고 행은 남긴다("나에게만 삭제"는 범위 밖).
    약속/가격제안 카드는 도메인 엔티티의 취소 플로우가 따로 있어 여기서 지우지 않는다."""
    msg = await _require_message_access(db, conv_id, message_id, _session_uid)
    if msg.sender_id != _session_uid:
        raise HTTPException(status_code=403, detail="Not your message")
    if msg.message_type in ("appointment", "price_offer"):
        raise HTTPException(status_code=400, detail="Use the dedicated cancel flow for this message type")

    if msg.deleted_at is None:  # 이미 삭제됐으면 멱등 no-op
        now = datetime.now(UTC)
        msg.deleted_at = now
        msg.updated_at = now
        await db.commit()
    return {"ok": True}


@router.post(
    "/conversations/{conv_id}/messages/{message_id}/reactions/{emoji}",
    response_model=list[DmReactionOut],
    status_code=201,
    summary="공감 추가",
)
async def add_reaction(
    conv_id: uuid.UUID,
    message_id: uuid.UUID,
    emoji: str,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if emoji not in _DM_REACTION_EMOJIS:
        raise HTTPException(status_code=400, detail="Unsupported reaction emoji")
    msg = await _require_message_access(db, conv_id, message_id, _session_uid)
    if msg.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Cannot react to a deleted message")

    # 이중 탭/동시 요청에도 유니크 제약(PK) 위반 없이 멱등 — 실제 추가됐을 때만 워터마크 bump
    result = await db.execute(
        pg_insert(DmMessageReaction)
        .values(message_id=message_id, user_id=_session_uid, emoji=emoji)
        .on_conflict_do_nothing(index_elements=["message_id", "user_id", "emoji"])
    )
    if result.rowcount:
        msg.updated_at = datetime.now(UTC)  # 공감 변경도 상대 폴링에 실린다
    await db.commit()
    return (await _reactions_map(db, [message_id], _session_uid)).get(message_id, [])


@router.delete(
    "/conversations/{conv_id}/messages/{message_id}/reactions/{emoji}",
    response_model=list[DmReactionOut],
    summary="공감 제거",
)
async def remove_reaction(
    conv_id: uuid.UUID,
    message_id: uuid.UUID,
    emoji: str,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    msg = await _require_message_access(db, conv_id, message_id, _session_uid)
    reaction = (
        await db.execute(
            select(DmMessageReaction).where(
                DmMessageReaction.message_id == message_id,
                DmMessageReaction.user_id == _session_uid,
                DmMessageReaction.emoji == emoji,
            )
        )
    ).scalar_one_or_none()
    if reaction is not None:
        await db.delete(reaction)
        msg.updated_at = datetime.now(UTC)
        await db.commit()
    return (await _reactions_map(db, [message_id], _session_uid)).get(message_id, [])


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
        now = datetime.now(UTC)
        msg.audio_content_id = None
        msg.meta = {**(msg.meta or {}), "playedAt": now.isoformat()}
        msg.updated_at = now  # 워터마크 bump — 재생완료(파일 삭제)도 상대 폴링에 실린다
        await db.commit()
        await db.refresh(msg)

    reactions = await _reactions_map(db, [msg.id], _session_uid)
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
        updated_at=msg.updated_at,
        edited_at=msg.edited_at,
        deleted_at=msg.deleted_at,
        reply_to_message_id=msg.reply_to_message_id,
        reply_preview=msg.reply_preview,
        reactions=reactions.get(msg.id, []),
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


def _group_conv_out(conv: DmConversation, notice: DmNoticeOut | None = None) -> DmConversationOut:
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
        notice=notice,
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


@router.get("/conversations/{conv_id}/members", response_model=list[DmMemberOut], summary="멤버 목록")
async def list_members(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """활성 멤버와 역할. 그룹 설정 화면(운영진 임명·강퇴)이 이 목록 위에서 동작한다."""
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations have no members endpoint")
    await require_member(db, conv, _session_uid)

    rows = (
        await db.execute(
            select(DmConversationMember, User)
            .join(User, User.id == DmConversationMember.user_id)
            .where(
                DmConversationMember.conversation_id == conv_id,
                DmConversationMember.left_at.is_(None),
            )
            .order_by(DmConversationMember.joined_at.asc())
        )
    ).all()
    return [
        DmMemberOut(
            user_id=member.user_id,
            nickname=user.nickname,
            avatar_url=resolve_avatar_url(user),
            role=member.role,
            joined_at=member.joined_at,
        )
        for member, user in rows
    ]


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
    return _group_conv_out(conv, await _resolve_notice(db, conv))


@router.put("/conversations/{conv_id}/notice", response_model=DmConversationOut, summary="방 공지 등록")
async def set_conversation_notice(
    conv_id: uuid.UUID,
    body: DmConversationNoticeRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """방마다 활성 공지 1건(217) — 새로 등록하면 이전 공지를 덮어쓴다. 멤버 누구나 등록할 수 있다."""
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations cannot have a notice")
    await require_member(db, conv, _session_uid)

    msg = (
        await db.execute(select(DmMessage).where(DmMessage.id == body.message_id, DmMessage.conversation_id == conv_id))
    ).scalar_one_or_none()
    if msg is None or msg.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Message not found")
    # 배너는 본문 텍스트만 렌더한다 — 스티커·사진·시스템 메시지를 걸면 빈 배너가 된다
    if msg.message_type != "text" or not (msg.content or "").strip():
        raise HTTPException(status_code=400, detail="Only text messages can be pinned as notice")

    now = datetime.now(UTC)
    conv.notice_message_id = msg.id
    conv.notice_set_by = _session_uid
    conv.notice_set_at = now

    # 등록 사실을 타임라인에 남긴다. created_at=updated_at=now 라 상대 클라이언트의
    # 워터마크 폴링(after=updated_at)에 이 시스템 메시지가 그대로 실린다.
    setter = await db.get(User, _session_uid)
    db.add(
        DmMessage(
            conversation_id=conv_id,
            sender_id=_session_uid,
            content="",
            message_type="system",
            meta={
                "kind": "notice_set",
                "noticeMessageId": str(msg.id),
                "setByName": setter.nickname if setter else "",
            },
            created_at=now,
            updated_at=now,
        )
    )
    conv.last_message_at = now
    await db.commit()
    await db.refresh(conv)
    return _group_conv_out(conv, await _resolve_notice(db, conv))


@router.delete("/conversations/{conv_id}/notice", response_model=DmConversationOut, summary="방 공지 내리기")
async def clear_conversation_notice(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """내리기는 등록자 본인 또는 운영진(owner/admin)만 (대표 판단 2026-08-29)."""
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations cannot have a notice")
    actor = await require_member(db, conv, _session_uid)
    if conv.notice_set_by != _session_uid and actor.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only the setter or owner/admin can clear the notice")

    conv.notice_message_id = None
    conv.notice_set_by = None
    conv.notice_set_at = None
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
