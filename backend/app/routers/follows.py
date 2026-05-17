import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, UserFollow
from ..schemas import FollowCountsOut, FollowRequest, FollowUserOut, Page
from ..utils import resolve_avatar_url

router = APIRouter(tags=["팔로우 (Follow)"])


def _user_to_follow_out(user: User) -> FollowUserOut:
    return FollowUserOut(
        id=user.id,
        nickname=user.nickname,
        avatar_url=resolve_avatar_url(user),
        level=user.level,
    )


@router.post("/follows/{target_user_id}", status_code=201, summary="팔로우")
async def follow_user(
    target_user_id: uuid.UUID,
    body: FollowRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    target = await db.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.get(UserFollow, {"follower_id": body.user_id, "following_id": target_user_id})
    if existing:
        return {"status": "already_following"}

    db.add(UserFollow(follower_id=body.user_id, following_id=target_user_id))
    await db.commit()
    return {"status": "followed"}


@router.delete("/follows/{target_user_id}", summary="언팔로우")
async def unfollow_user(
    target_user_id: uuid.UUID,
    body: FollowRequest,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.get(UserFollow, {"follower_id": body.user_id, "following_id": target_user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not following")
    await db.delete(existing)
    await db.commit()
    return {"status": "unfollowed"}


@router.get("/users/{user_id}/followers", response_model=Page[FollowUserOut], summary="팔로워 목록")
async def get_followers(
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    total = (await db.execute(
        select(func.count()).select_from(UserFollow).where(UserFollow.following_id == user_id)
    )).scalar_one()

    rows = (await db.execute(
        select(User)
        .join(UserFollow, UserFollow.follower_id == User.id)
        .where(UserFollow.following_id == user_id)
        .order_by(UserFollow.created_at.desc())
        .offset(offset).limit(size)
    )).scalars().all()

    return Page(items=[_user_to_follow_out(u) for u in rows], total=total, page=page, size=size)


@router.get("/users/{user_id}/following", response_model=Page[FollowUserOut], summary="팔로잉 목록")
async def get_following(
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    total = (await db.execute(
        select(func.count()).select_from(UserFollow).where(UserFollow.follower_id == user_id)
    )).scalar_one()

    rows = (await db.execute(
        select(User)
        .join(UserFollow, UserFollow.following_id == User.id)
        .where(UserFollow.follower_id == user_id)
        .order_by(UserFollow.created_at.desc())
        .offset(offset).limit(size)
    )).scalars().all()

    return Page(items=[_user_to_follow_out(u) for u in rows], total=total, page=page, size=size)


@router.get("/users/{user_id}/follow-counts", response_model=FollowCountsOut, summary="팔로우 카운트")
async def get_follow_counts(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    follower_count = (await db.execute(
        select(func.count()).select_from(UserFollow).where(UserFollow.following_id == user_id)
    )).scalar_one()
    following_count = (await db.execute(
        select(func.count()).select_from(UserFollow).where(UserFollow.follower_id == user_id)
    )).scalar_one()
    return FollowCountsOut(follower_count=follower_count, following_count=following_count)


@router.get("/users/{user_id}/friends", response_model=Page[FollowUserOut], summary="친구 목록 (상호 팔로우)")
async def get_friends(
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    reverse_follow = aliased(UserFollow)

    total = (await db.execute(
        select(func.count())
        .select_from(UserFollow)
        .join(reverse_follow, (reverse_follow.follower_id == UserFollow.following_id) & (reverse_follow.following_id == user_id))
        .where(UserFollow.follower_id == user_id)
    )).scalar_one()

    rows = (await db.execute(
        select(User)
        .join(UserFollow, UserFollow.following_id == User.id)
        .join(reverse_follow, (reverse_follow.follower_id == User.id) & (reverse_follow.following_id == user_id))
        .where(UserFollow.follower_id == user_id)
        .order_by(UserFollow.created_at.desc())
        .offset(offset).limit(size)
    )).scalars().all()

    return Page(items=[_user_to_follow_out(u) for u in rows], total=total, page=page, size=size)
