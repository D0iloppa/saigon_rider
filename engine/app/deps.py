from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
import jwt

from app.config import settings
from app.database import AsyncSession, get_db

_service_key_header = APIKeyHeader(name="X-Service-Key", auto_error=False)
_admin_jwt_header = APIKeyHeader(name="X-Admin-Token", auto_error=False)


async def verify_service_key(key: str = Security(_service_key_header)) -> None:
    if not key or key != settings.engine_service_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Service-Key",
        )


async def verify_admin_jwt(token: str = Security(_admin_jwt_header)) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing admin token")
    try:
        payload = jwt.decode(
            token,
            settings.engine_admin_jwt_secret,
            algorithms=["HS256"],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")


# DB 세션 재수출 (라우터에서 단일 임포트)
async def get_session() -> AsyncSession:
    async for session in get_db():
        yield session
