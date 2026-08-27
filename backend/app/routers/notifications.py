import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import Notification, NotificationSettings
from ..schemas import (
    NotificationListResponse,
    NotificationOut,
    NotificationSettingsOut,
    NotificationSettingsUpdate,
)

router = APIRouter(prefix="/notifications", tags=["알림 (Notifications)"])


# N-1
@router.get("", response_model=NotificationListResponse, summary="알림 목록 조회")
async def list_notifications(
    user_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 본인 알림만 열람 가능 — 타 유저 스코프는 404 (존재 은닉)
    if user_id != session_uid:
        raise HTTPException(status_code=404, detail="User not found")

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


# N-4 — 읽음 처리는 개별(클릭=읽음)만 제공. read-all 은 현 UX(목록 클릭 이동)에 필요 근거가 없어 미구현 (Simplicity First).
@router.put("/{notification_id}/read", response_model=NotificationOut, summary="알림 개별 읽음 처리")
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notification = result.scalar_one_or_none()
    # 타인 소유는 존재 자체를 숨긴다 (404)
    if notification is None or notification.user_id != session_uid:
        raise HTTPException(status_code=404, detail="Notification not found")

    if not notification.is_read:
        notification.is_read = True
        await db.commit()
        await db.refresh(notification)

    return NotificationOut.model_validate(notification)


# N-2
@router.get("/settings", response_model=NotificationSettingsOut, summary="알림 설정 조회")
async def get_notification_settings(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 본인 설정만 열람 가능 — 타 유저 스코프는 404 (존재 은닉)
    if user_id != session_uid:
        raise HTTPException(status_code=404, detail="User not found")

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
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 본인 설정만 저장 가능 — 타 유저 스코프는 404 (존재 은닉)
    if body.user_id != session_uid:
        raise HTTPException(status_code=404, detail="User not found")

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
    settings.keyword_alert = body.keyword_alert
    settings.chat = body.chat
    settings.group_post = body.group_post
    settings.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(settings)

    return NotificationSettingsOut.model_validate(settings)
