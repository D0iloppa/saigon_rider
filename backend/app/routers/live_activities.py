"""iOS Live Activity 푸시토큰 등록 (ai-docs/task/active/260829_live_activity_task.md Phase 3).

앱이 거래 Live Activity 를 만들면 ActivityKit 이 그 Activity 전용 푸시토큰을 내준다 — 여기 등록해두면
약속 상태가 바뀔 때 noti_worker 가 (kind, subject_id) 로 찾아 engine → APNs 로 content-state 를 밀어넣는다.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import LiveActivityToken

router = APIRouter(prefix="/live-activities", tags=["Live Activity"])


class LiveActivityTokenIn(BaseModel):
    kind: str = Field(default="deal", pattern="^(deal|location)$")
    # kind='deal' 이면 약속 id, kind='location' 이면 실시간 위치채널 id — 프론트는 별도
    # channelId 필드 없이 이 값 하나만 보낸다(`lib/liveActivityPush.ts`).
    subjectId: uuid.UUID
    pushToken: str = Field(min_length=16, max_length=512)
    locale: str = Field(default="vi", max_length=8)


@router.post("/token", status_code=204, summary="Live Activity 푸시토큰 등록/갱신")
async def register_token(
    body: LiveActivityTokenIn,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> None:
    now = datetime.now(UTC)
    # kind='location' 은 subjectId 자체가 채널 id — noti_worker 가 조인 없이 (kind, channel_id)
    # 로 바로 필터링할 수 있도록 별도 컬럼에도 같은 값을 넣는다(260829 Phase 3).
    channel_id = body.subjectId if body.kind == "location" else None
    stmt = (
        pg_insert(LiveActivityToken)
        .values(
            user_id=session_uid,
            kind=body.kind,
            subject_id=body.subjectId,
            channel_id=channel_id,
            push_token=body.pushToken,
            locale=body.locale,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            constraint="live_activity_tokens_user_kind_subject_uq",
            set_={"push_token": body.pushToken, "locale": body.locale, "channel_id": channel_id, "updated_at": now},
        )
    )
    await db.execute(stmt)
    await db.commit()


@router.delete("/token", status_code=204, summary="Live Activity 푸시토큰 해제")
async def unregister_token(
    kind: str = Query(pattern="^(deal|location)$"),
    subject_id: uuid.UUID = Query(alias="subjectId"),
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> None:
    await db.execute(
        delete(LiveActivityToken).where(
            LiveActivityToken.user_id == session_uid,
            LiveActivityToken.kind == kind,
            LiveActivityToken.subject_id == subject_id,
        )
    )
    await db.commit()
