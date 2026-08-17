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


async def _resolve_session_user(
    x_user_id: str | None,
    x_session_token: str | None,
    db: AsyncSession,
) -> tuple[User, uuid.UUID, datetime]:
    """세션 토큰 검증 공통부 — 제재 상태(enforce_account_active) 판단은 호출부 책임."""
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
    return user, uid, now


async def verify_user_session(
    x_user_id: str | None = Header(None),
    x_session_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    user, uid, now = await _resolve_session_user(x_user_id, x_session_token, db)

    dirty = enforce_account_active(user, now)
    if user.last_seen_at is None or now - user.last_seen_at > _LAST_SEEN_THROTTLE:
        user.last_seen_at = now
        dirty = True
    if dirty:
        await db.commit()
    return uid


async def verify_user_session_allow_suspended(
    x_user_id: str | None = Header(None),
    x_session_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """Q-4/D-22(감사 260817): 세션 인증은 그대로 요구하되 제재 상태(enforce_account_active) 는 통과시킨다.

    오신고 등으로 정지/차단된 사용자도 고객센터 티켓은 생성·열람할 수 있어야 한다는 감사 결함(Q-4, D-22) 대응.
    support.py 의 고객센터 라우트 전용 예외다 — 그 외 라우트에는 사용하지 말 것.
    """
    user, uid, now = await _resolve_session_user(x_user_id, x_session_token, db)
    if user.last_seen_at is None or now - user.last_seen_at > _LAST_SEEN_THROTTLE:
        user.last_seen_at = now
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
