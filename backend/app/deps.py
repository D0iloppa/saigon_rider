import os
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User

HTTP_419_SESSION_EXPIRED = 419

_BFF_SERVICE_KEY = os.getenv("ENGINE_SERVICE_KEY", "")
_service_key_header = APIKeyHeader(name="X-Service-Key", auto_error=False)
_session_pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

_LAST_SEEN_THROTTLE = timedelta(minutes=10)  # DAU 소스 — 쓰기 스로틀


async def verify_service_key(key: str = Security(_service_key_header)) -> None:
    if not key or key != _BFF_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Service-Key",
        )


def enforce_account_active(user: User, now: datetime) -> bool:
    """제재 상태 차단 — BANNED/SUSPENDED 는 403 (419 는 프론트 로그아웃 처리라 사용 금지).

    만료된 정지는 lazy-lift(ACTIVE 복귀)하고 True 반환 — 커밋은 호출부 책임.
    """
    if user.status == "BANNED":
        raise HTTPException(status_code=403, detail={"code": "account_banned"})
    if user.status == "SUSPENDED":
        if user.suspended_until is not None and user.suspended_until <= now:
            user.status = "ACTIVE"
            user.suspended_until = None
            return True
        raise HTTPException(
            status_code=403,
            detail={
                "code": "account_suspended",
                "until": user.suspended_until.isoformat() if user.suspended_until else None,
            },
        )
    if user.status != "ACTIVE":
        raise HTTPException(status_code=403, detail={"code": "account_inactive"})
    return False


async def verify_user_session(
    x_user_id: str | None = Header(None),
    x_session_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    if not x_user_id or not x_session_token:
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired")
    try:
        uid = uuid.UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired") from None
    user = await db.get(User, uid)
    try:
        token_valid = bool(user and user.passcode_hash and _session_pwd_ctx.verify(x_session_token, user.passcode_hash))
    except (TypeError, ValueError):
        token_valid = False
    now = datetime.now(UTC)
    if (
        not token_valid
        or user.deleted_at is not None
        or user.session_expires_at is None
        or user.session_expires_at <= now
    ):
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired")

    dirty = enforce_account_active(user, now)
    if user.last_seen_at is None or now - user.last_seen_at > _LAST_SEEN_THROTTLE:
        user.last_seen_at = now
        dirty = True
    if dirty:
        await db.commit()
    return uid


async def optional_user_session(
    x_user_id: str | None = Header(None),
    x_session_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID | None:
    """공개 API용 principal. 헤더가 모두 없을 때만 익명이며, 불완전·위조 세션은 거절한다."""
    if x_user_id is None and x_session_token is None:
        return None
    return await verify_user_session(x_user_id, x_session_token, db)
