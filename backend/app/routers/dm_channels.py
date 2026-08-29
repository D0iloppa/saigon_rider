"""대화방 게시판 — 방 안의 Discord 식 채널 + 글 (218_dm_channel_board.sql, P1).

권한 요약 (대표/감독 판단 2026-08-29):
- 게시판은 **direct 가 아닌 모든 방**(group/open)에 열린다 — community_group 연결 여부와 무관.
- 읽기·쓰기 모두 방의 활성 멤버만(`require_member`). 밴된 사용자는 `require_not_banned` 로 차단.
- 채널 생성·이름변경·순서변경·삭제는 운영진(owner/admin)만 — `dm.py` 의 방 정보 수정과 동일 기준.
- 글 작성은 멤버 누구나, 글 삭제는 작성자 또는 운영진.
- 본문에는 dm.py 와 **동일한** 금칙어 프리필터를 건다 (400 `{"code":"banned_keyword"}`).

댓글(P2, 219_dm_channel_post_comments.sql)도 같은 권한 축을 따른다 — 방 멤버만 읽기·쓰기,
삭제는 작성자 또는 운영진, 본문에 같은 금칙어 프리필터.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import (
    Content,
    DmChannelPost,
    DmChannelPostComment,
    DmConversation,
    DmConversationChannel,
    DmConversationMember,
    User,
)
from ..schemas import (
    DmChannelCommentCreateRequest,
    DmChannelCommentOut,
    DmChannelCreateRequest,
    DmChannelOut,
    DmChannelPatchRequest,
    DmChannelPostCreateRequest,
    DmChannelPostOut,
    Page,
)
from ..services.banned_keywords import banned_keywords as _banned_keywords
from ..services.dm_policy import require_member, require_not_banned
from ..utils import build_imgproxy_url, resolve_avatar_url

router = APIRouter(prefix="/dm", tags=["DM (Direct Message)"])


async def _board_conversation(
    db: AsyncSession, conv_id: uuid.UUID, uid: uuid.UUID
) -> tuple[DmConversation, DmConversationMember]:
    """게시판을 쓸 수 있는 방인지 + 내가 그 방의 (밴되지 않은) 활성 멤버인지. 멤버십은 호출부가 재사용한다."""
    conv = await db.get(DmConversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.conversation_type == "direct":
        raise HTTPException(status_code=400, detail="Direct conversations have no board")
    member = await require_member(db, conv, uid)
    await require_not_banned(db, conv_id, uid)
    return conv, member


def _require_manager(member: DmConversationMember) -> None:
    """채널 관리(생성·수정·삭제)는 운영진 전용 — dm.py:1612 의 방 정보 수정과 같은 기준."""
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owner/admin can manage channels")


async def _guard_banned_keyword(db: AsyncSession, body: str) -> None:
    lowered = body.lower()
    if any(kw in lowered for kw in await _banned_keywords(db)):
        raise HTTPException(status_code=400, detail={"code": "banned_keyword"})


async def _get_channel(db: AsyncSession, conv_id: uuid.UUID, channel_id: uuid.UUID) -> DmConversationChannel:
    channel = (
        await db.execute(
            select(DmConversationChannel).where(
                DmConversationChannel.id == channel_id,
                DmConversationChannel.conversation_id == conv_id,
            )
        )
    ).scalar_one_or_none()
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


async def _ordered_channels(db: AsyncSession, conv_id: uuid.UUID) -> list[DmConversationChannel]:
    """방의 채널을 화면과 같은 순서(position, created_at)로 — 목록 조회와 순서변경이 함께 쓴다."""
    rows = (
        (
            await db.execute(
                select(DmConversationChannel)
                .where(DmConversationChannel.conversation_id == conv_id)
                .order_by(DmConversationChannel.position.asc(), DmConversationChannel.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


def _channel_out(channel: DmConversationChannel) -> DmChannelOut:
    return DmChannelOut(
        id=channel.id,
        conversation_id=channel.conversation_id,
        name=channel.name,
        position=channel.position,
        created_at=channel.created_at,
    )


async def _post_out_batch(db: AsyncSession, posts: list[DmChannelPost]) -> list[DmChannelPostOut]:
    """작성자·첨부 이미지를 배치 조회해 조립한다 (글 수만큼 쿼리하지 않는다)."""
    if not posts:
        return []
    authors = {
        u.id: u
        for u in (await db.execute(select(User).where(User.id.in_({p.author_id for p in posts})))).scalars().all()
    }
    content_ids: set[uuid.UUID] = set()
    for p in posts:
        for cid in p.image_content_ids or []:
            content_ids.add(uuid.UUID(str(cid)))
    paths: dict[uuid.UUID, str] = {}
    if content_ids:
        rows = (await db.execute(select(Content).where(Content.id.in_(content_ids)))).scalars().all()
        paths = {c.id: c.file_path for c in rows if c.file_path}

    def _urls(p: DmChannelPost) -> list[str]:
        out = []
        for cid in p.image_content_ids or []:
            path = paths.get(uuid.UUID(str(cid)))
            if path:
                out.append(build_imgproxy_url(path))
        return out

    return [
        DmChannelPostOut(
            id=p.id,
            channel_id=p.channel_id,
            author_id=p.author_id,
            author_nickname=authors[p.author_id].nickname if p.author_id in authors else None,
            author_avatar_url=resolve_avatar_url(authors[p.author_id]) if p.author_id in authors else None,
            body=p.body,
            image_urls=_urls(p),
            comment_count=p.comment_count,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in posts
    ]


# ── 채널 ──────────────────────────────────────────────────────────


@router.get("/conversations/{conv_id}/channels", response_model=list[DmChannelOut], summary="게시판 채널 목록")
async def list_channels(
    conv_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _board_conversation(db, conv_id, _session_uid)
    return [_channel_out(c) for c in await _ordered_channels(db, conv_id)]


@router.post(
    "/conversations/{conv_id}/channels", response_model=DmChannelOut, status_code=201, summary="게시판 채널 생성"
)
async def create_channel(
    conv_id: uuid.UUID,
    body: DmChannelCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    _conv, member = await _board_conversation(db, conv_id, _session_uid)
    _require_manager(member)

    next_position = (
        await db.execute(
            select(func.coalesce(func.max(DmConversationChannel.position), -1) + 1).where(
                DmConversationChannel.conversation_id == conv_id
            )
        )
    ).scalar_one()
    channel = DmConversationChannel(
        conversation_id=conv_id,
        name=body.name.strip(),
        position=next_position,
        created_by=_session_uid,
        created_at=datetime.now(UTC),
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return _channel_out(channel)


@router.patch(
    "/conversations/{conv_id}/channels/{channel_id}", response_model=DmChannelOut, summary="채널 이름·순서 수정"
)
async def update_channel(
    conv_id: uuid.UUID,
    channel_id: uuid.UUID,
    body: DmChannelPatchRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    _conv, member = await _board_conversation(db, conv_id, _session_uid)
    _require_manager(member)
    channel = await _get_channel(db, conv_id, channel_id)

    if body.name is not None:
        channel.name = body.name.strip()
    if body.position is not None:
        # position 은 "옮길 자리(index)" 다 — 목록에서 빼서 그 자리에 끼우고 0..n-1 로 다시 번호를 매긴다.
        # 한 트랜잭션 안에서 전체를 재번호하므로 중복·구멍이 남지 않는다(클라이언트가 두 번 PATCH 하지 않아도 된다).
        siblings = [c for c in await _ordered_channels(db, conv_id) if c.id != channel.id]
        index = max(0, min(body.position, len(siblings)))
        siblings.insert(index, channel)
        for i, c in enumerate(siblings):
            c.position = i
    await db.commit()
    await db.refresh(channel)
    return _channel_out(channel)


@router.delete("/conversations/{conv_id}/channels/{channel_id}", status_code=204, summary="채널 삭제")
async def delete_channel(
    conv_id: uuid.UUID,
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """채널을 지우면 그 안의 글도 함께 사라진다 (FK ON DELETE CASCADE)."""
    _conv, member = await _board_conversation(db, conv_id, _session_uid)
    _require_manager(member)
    channel = await _get_channel(db, conv_id, channel_id)
    await db.delete(channel)
    await db.commit()


# ── 글 ────────────────────────────────────────────────────────────


@router.get(
    "/conversations/{conv_id}/channels/{channel_id}/posts",
    response_model=Page[DmChannelPostOut],
    summary="채널 글 목록",
)
async def list_posts(
    conv_id: uuid.UUID,
    channel_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _board_conversation(db, conv_id, _session_uid)
    await _get_channel(db, conv_id, channel_id)

    where = (DmChannelPost.channel_id == channel_id, DmChannelPost.deleted_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(DmChannelPost).where(*where))).scalar_one()
    rows = (
        (
            await db.execute(
                select(DmChannelPost)
                .where(*where)
                .order_by(DmChannelPost.created_at.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    return Page(items=await _post_out_batch(db, list(rows)), total=total, page=page, size=size)


@router.post(
    "/conversations/{conv_id}/channels/{channel_id}/posts",
    response_model=DmChannelPostOut,
    status_code=201,
    summary="채널 글 작성",
)
async def create_post(
    conv_id: uuid.UUID,
    channel_id: uuid.UUID,
    body: DmChannelPostCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _board_conversation(db, conv_id, _session_uid)
    await _get_channel(db, conv_id, channel_id)
    await _guard_banned_keyword(db, body.body)

    now = datetime.now(UTC)
    post = DmChannelPost(
        channel_id=channel_id,
        author_id=_session_uid,
        body=body.body,
        image_content_ids=[str(cid) for cid in body.image_content_ids],
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return (await _post_out_batch(db, [post]))[0]


async def _get_post(db: AsyncSession, conv_id: uuid.UUID, post_id: uuid.UUID) -> DmChannelPost:
    """글은 채널을 통해 방에 속한다 — 남의 방 글 id 로는 조회되지 않도록 조인으로 방을 확인한다."""
    post = (
        await db.execute(
            select(DmChannelPost)
            .join(DmConversationChannel, DmConversationChannel.id == DmChannelPost.channel_id)
            .where(
                DmChannelPost.id == post_id,
                DmChannelPost.deleted_at.is_(None),
                DmConversationChannel.conversation_id == conv_id,
            )
        )
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.get("/conversations/{conv_id}/posts/{post_id}", response_model=DmChannelPostOut, summary="채널 글 상세")
async def get_post(
    conv_id: uuid.UUID,
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _board_conversation(db, conv_id, _session_uid)
    post = await _get_post(db, conv_id, post_id)
    return (await _post_out_batch(db, [post]))[0]


@router.delete("/conversations/{conv_id}/posts/{post_id}", status_code=204, summary="채널 글 삭제")
async def delete_post(
    conv_id: uuid.UUID,
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """소프트삭제 — 작성자 본인 또는 운영진(owner/admin)."""
    _conv, member = await _board_conversation(db, conv_id, _session_uid)
    post = await _get_post(db, conv_id, post_id)
    if post.author_id != _session_uid and member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only the author or owner/admin can delete this post")

    post.deleted_at = datetime.now(UTC)
    post.updated_at = post.deleted_at
    await db.commit()


# ── 댓글 (219) ────────────────────────────────────────────────────


async def _comment_out_batch(db: AsyncSession, comments: list[DmChannelPostComment]) -> list[DmChannelCommentOut]:
    """작성자를 배치 조회해 조립한다. 삭제된 댓글은 본문·작성자를 비운 자리표시로 내린다."""
    if not comments:
        return []
    authors = {
        u.id: u
        for u in (
            await db.execute(select(User).where(User.id.in_({c.author_id for c in comments if c.deleted_at is None})))
        )
        .scalars()
        .all()
    }
    out = []
    for c in comments:
        gone = c.deleted_at is not None
        author = authors.get(c.author_id)
        out.append(
            DmChannelCommentOut(
                id=c.id,
                post_id=c.post_id,
                author_id=c.author_id,
                author_nickname=None if gone or author is None else author.nickname,
                author_avatar_url=None if gone or author is None else resolve_avatar_url(author),
                parent_id=c.parent_id,
                body="" if gone else c.body,
                deleted=gone,
                created_at=c.created_at,
            )
        )
    return out


@router.get(
    "/conversations/{conv_id}/posts/{post_id}/comments",
    response_model=list[DmChannelCommentOut],
    summary="채널 글 댓글 목록",
)
async def list_comments(
    conv_id: uuid.UUID,
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """평면 목록(작성순) — 답글은 parent_id 로만 표현한다.

    삭제된 댓글은 원칙적으로 빠지지만, 살아있는 답글이 달려 있으면 답글이 고아가 되지 않도록
    본문 없는 자리표시로 남긴다.
    """
    await _board_conversation(db, conv_id, _session_uid)
    await _get_post(db, conv_id, post_id)

    rows = list(
        (
            await db.execute(
                select(DmChannelPostComment)
                .where(DmChannelPostComment.post_id == post_id)
                .order_by(DmChannelPostComment.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    parents_with_live_replies = {c.parent_id for c in rows if c.deleted_at is None and c.parent_id is not None}
    visible = [c for c in rows if c.deleted_at is None or c.id in parents_with_live_replies]
    return await _comment_out_batch(db, visible)


@router.post(
    "/conversations/{conv_id}/posts/{post_id}/comments",
    response_model=DmChannelCommentOut,
    status_code=201,
    summary="채널 글 댓글 작성",
)
async def create_comment(
    conv_id: uuid.UUID,
    post_id: uuid.UUID,
    body: DmChannelCommentCreateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _board_conversation(db, conv_id, _session_uid)
    post = await _get_post(db, conv_id, post_id)
    await _guard_banned_keyword(db, body.body)

    parent_id = None
    if body.parent_id is not None:
        parent = (
            await db.execute(
                select(DmChannelPostComment).where(
                    DmChannelPostComment.id == body.parent_id,
                    DmChannelPostComment.post_id == post_id,
                    DmChannelPostComment.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if parent is None:
            raise HTTPException(status_code=400, detail="Parent comment does not belong to this post")
        # 답글의 답글은 같은 1단으로 접는다 — 화면이 들여쓰기 한 단계만 그린다.
        parent_id = parent.parent_id or parent.id

    comment = DmChannelPostComment(
        post_id=post_id,
        author_id=_session_uid,
        parent_id=parent_id,
        body=body.body,
        created_at=datetime.now(UTC),
    )
    db.add(comment)
    # 읽고-더해-쓰기(read-modify-write)는 동시 작성 시 카운트를 잃는다 — DB 쪽에서 더하게 한다.
    post.comment_count = DmChannelPost.comment_count + 1
    await db.commit()
    await db.refresh(comment)
    return (await _comment_out_batch(db, [comment]))[0]


@router.delete(
    "/conversations/{conv_id}/posts/{post_id}/comments/{comment_id}", status_code=204, summary="채널 글 댓글 삭제"
)
async def delete_comment(
    conv_id: uuid.UUID,
    post_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """소프트삭제 — 작성자 본인 또는 운영진(owner/admin). 글의 댓글 수도 함께 줄인다."""
    _conv, member = await _board_conversation(db, conv_id, _session_uid)
    post = await _get_post(db, conv_id, post_id)
    comment = (
        await db.execute(
            select(DmChannelPostComment).where(
                DmChannelPostComment.id == comment_id,
                DmChannelPostComment.post_id == post_id,
                DmChannelPostComment.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != _session_uid and member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only the author or owner/admin can delete this comment")

    comment.deleted_at = datetime.now(UTC)
    post.comment_count = func.greatest(DmChannelPost.comment_count - 1, 0)
    await db.commit()
