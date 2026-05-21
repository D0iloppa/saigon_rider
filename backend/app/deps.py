import os
import uuid

from fastapi import Depends, Header, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User

HTTP_419_SESSION_EXPIRED = 419

_BFF_SERVICE_KEY = os.getenv("ENGINE_SERVICE_KEY", "")
_service_key_header = APIKeyHeader(name="X-Service-Key", auto_error=False)


async def verify_service_key(key: str = Security(_service_key_header)) -> None:
    if not key or key != _BFF_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Service-Key",
        )


async def verify_user_session(
    x_user_id: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    if not x_user_id:
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired")
    try:
        uid = uuid.UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired") from None
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired")
    return uid
