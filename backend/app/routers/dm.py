import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import DmConversation, DmMessage, User
from ..schemas import (
    DmConversationCreateRequest,
    DmConversationOut,
    DmMarkReadRequest,
    DmMessageCreateRequest,
    DmMessageOut,
    Page,
)
from ..utils import resolve_avatar_url, resolve_feed_image_url

router = APIRouter(prefix="/dm", tags=["DM (Direct Message)"])


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
):
    rows = (await db.execute(
        select(DmConversation)
        .where(or_(
            DmConversation.participant_1 == user_id,
            DmConversation.participant_2 == user_id,
        ))
        .order_by(DmConversation.last_message_at.desc())
    )).scalars().all()

    result = []
    for conv in rows:
        other_id = _other_user_id(conv, user_id)
        other_user = await db.get(User, other_id)

        last_msg = (await db.execute(
            select(DmMessage)
            .where(DmMessage.conversation_id == conv.id)
            .order_by(DmMessage.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        unread = (await db.execute(
            select(func.count()).select_from(DmMessage)
            .where(
                DmMessage.conversation_id == conv.id,
                DmMessage.sender_id != user_id,
                DmMessage.read_at.is_(None),
            )
        )).scalar_one()

        result.append(DmConversationOut(
            id=conv.id,
            other_user_id=other_id,
            other_user_nickname=other_user.nickname if other_user else None,
            other_user_avatar_url=resolve_avatar_url(other_user) if other_user else None,
            last_message_preview=last_msg.content[:50] if last_msg and last_msg.content else None,
            last_message_at=conv.last_message_at,
            unread_count=unread,
        ))
    return result


@router.post("/conversations", response_model=DmConversationOut, status_code=201, summary="대화방 생성/조회")
async def create_conversation(
    body: DmConversationCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.user_id == body.other_user_id:
        raise HTTPException(status_code=400, detail="Cannot create conversation with yourself")

    p1, p2 = sorted([body.user_id, body.other_user_id])

    existing = (await db.execute(
        select(DmConversation).where(
            DmConversation.participant_1 == p1,
            DmConversation.participant_2 == p2,
        )
    )).scalar_one_or_none()

    if existing:
        conv = existing
    else:
        conv = DmConversation(participant_1=p1, participant_2=p2)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

    other_user = await db.get(User, body.other_user_id)
    return DmConversationOut(
        id=conv.id,
        other_user_id=body.other_user_id,
        other_user_nickname=other_user.nickname if other_user else None,
        other_user_avatar_url=resolve_avatar_url(other_user) if other_user else None,
        last_message_preview=None,
        last_message_at=conv.last_message_at,
        unread_count=0,
    )


@router.get("/conversations/{conv_id}/messages", response_model=Page[DmMessageOut], summary="메시지 목록")
async def get_messages(
    conv_id: uuid.UUID,
    page: int = 1,
    size: int = 50,
    after: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    base = select(DmMessage).where(DmMessage.conversation_id == conv_id)
    if after:
        base = base.where(DmMessage.created_at > after)

    total = (await db.execute(
        select(func.count()).select_from(DmMessage).where(
            DmMessage.conversation_id == conv_id,
            *([] if not after else [DmMessage.created_at > after])
        )
    )).scalar_one()

    offset = (page - 1) * size
    rows = (await db.execute(
        base.order_by(DmMessage.created_at.asc()).offset(offset).limit(size)
    )).scalars().all()

    items = [DmMessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        sender_id=m.sender_id,
        content=m.content,
        image_url=_resolve_dm_image(m),
        read_at=m.read_at,
        created_at=m.created_at,
    ) for m in rows]

    return Page(items=items, total=total, page=page, size=size)


@router.post("/conversations/{conv_id}/messages", response_model=DmMessageOut, status_code=201, summary="메시지 전송")
async def send_message(
    conv_id: uuid.UUID,
    body: DmMessageCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if body.content is None and body.image_content_id is None:
        raise HTTPException(status_code=400, detail="content or image_content_id is required")

    now = datetime.now(timezone.utc)
    msg = DmMessage(
        conversation_id=conv_id,
        sender_id=body.sender_id,
        content=body.content,
        image_content_id=body.image_content_id,
        created_at=now,
    )
    db.add(msg)
    conv.last_message_at = now
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
    )


@router.post("/conversations/{conv_id}/read", summary="읽음 처리")
async def mark_read(
    conv_id: uuid.UUID,
    body: DmMarkReadRequest,
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    now = datetime.now(timezone.utc)
    unread = (await db.execute(
        select(DmMessage).where(
            DmMessage.conversation_id == conv_id,
            DmMessage.sender_id != body.user_id,
            DmMessage.read_at.is_(None),
        )
    )).scalars().all()

    for msg in unread:
        msg.read_at = now
    await db.commit()
    return {"marked": len(unread)}
