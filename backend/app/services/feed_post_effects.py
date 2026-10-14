"""피드 글 작성 부수효과 공용 로직 — 앱(`routers/feed.py`)과 관리자 콘솔(`admin_api/feed.py`)이 공유."""

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CommunityGroup, CommunityGroupMember, PostHashtag, User, UserFollow
from . import noti_events

_HASHTAG_PATTERN = re.compile(r"#(\w+)")


def extract_hashtags(content: str | None) -> list[str]:
    """본문에서 #태그 를 파싱한다. 대소문자 무시(소문자 정규화) + 중복 제거."""
    if not content:
        return []
    return sorted({tag.lower()[:50] for tag in _HASHTAG_PATTERN.findall(content)})


async def apply_post_created_effects(
    db: AsyncSession,
    *,
    post_id: uuid.UUID,
    author_id: uuid.UUID,
    content: str | None,
    group: CommunityGroup | None,
) -> None:
    """해시태그·그룹 post_count·팔로워/그룹멤버 알림·검색 재색인. flush 이후 호출, commit 은 호출자 몫."""
    for tag in extract_hashtags(content):
        db.add(PostHashtag(post_id=post_id, tag=tag))

    if group is not None:
        group.post_count += 1

    # P4-3: 팔로우한 사람의 새 글 / 그룹 새 글 알림 — 대상이 있을 때만 author 를 조회한다.
    follower_ids = (
        (await db.execute(select(UserFollow.follower_id).where(UserFollow.following_id == author_id))).scalars().all()
    )
    group_member_ids: list[uuid.UUID] = []
    if group is not None:
        group_member_ids = (
            (
                await db.execute(
                    select(CommunityGroupMember.user_id).where(
                        CommunityGroupMember.group_id == group.id,
                        CommunityGroupMember.status == "ACTIVE",
                        CommunityGroupMember.user_id != author_id,
                    )
                )
            )
            .scalars()
            .all()
        )
    if follower_ids or group_member_ids:
        author = await db.get(User, author_id)
        preview = (content or "")[:100]
        if follower_ids:
            noti_events.enqueue(
                db,
                "feed.followed_post_created",
                {
                    "recipient_ids": [str(fid) for fid in follower_ids],
                    "post_id": str(post_id),
                    "author_nickname": author.nickname if author else None,
                    "preview": preview,
                },
            )
        if group_member_ids:
            noti_events.enqueue(
                db,
                "feed.group_post_created",
                {
                    "recipient_ids": [str(mid) for mid in group_member_ids],
                    "post_id": str(post_id),
                    "group_id": str(group.id),
                    "group_name": group.name,
                    "author_nickname": author.nickname if author else None,
                    "preview": preview,
                },
            )

    if content:
        noti_events.enqueue(
            db, "search.reindex", {"entity_type": "feed", "entity_id": str(post_id), "texts": [content]}
        )
