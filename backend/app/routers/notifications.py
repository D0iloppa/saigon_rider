import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Notification, NotificationSettings, User
from ..schemas import (
    NotificationListResponse,
    NotificationOut,
    NotificationSettingsOut,
    NotificationSettingsUpdate,
)

router = APIRouter(prefix="/notifications", tags=["알림 (Notifications)"])


async def _get_user_or_404(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# N-1
@router.get("", response_model=NotificationListResponse, summary="알림 목록 조회")
async def list_notifications(
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(user_id, db)

    offset = (page - 1) * limit

    total_result = await db.execute(select(func.count()).where(Notification.user_id == user_id))
    total = total_result.scalar_one()

    unread_result = await db.execute(
        select(func.count()).where(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
    )
    unread_count = unread_result.scalar_one()

    items_result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    items = items_result.scalars().all()

    return NotificationListResponse(
        items=[NotificationOut.model_validate(n) for n in items],
        unread_count=unread_count,
        total=total,
        page=page,
        size=limit,
    )


# N-2
@router.get("/settings", response_model=NotificationSettingsOut, summary="알림 설정 조회")
async def get_notification_settings(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(user_id, db)

    result = await db.execute(select(NotificationSettings).where(NotificationSettings.user_id == user_id))
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = NotificationSettings(
            user_id=user_id,
            updated_at=datetime.now(UTC),
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return NotificationSettingsOut.model_validate(settings)


# N-3
@router.put("/settings", response_model=NotificationSettingsOut, summary="알림 설정 저장")
async def update_notification_settings(
    body: NotificationSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(body.user_id, db)

    result = await db.execute(select(NotificationSettings).where(NotificationSettings.user_id == body.user_id))
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = NotificationSettings(user_id=body.user_id)
        db.add(settings)

    settings.quest_recommend = body.quest_recommend
    settings.quest_expire = body.quest_expire
    settings.event = body.event
    settings.ride_result = body.ride_result
    settings.social = body.social
    settings.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(settings)

    return NotificationSettingsOut.model_validate(settings)
