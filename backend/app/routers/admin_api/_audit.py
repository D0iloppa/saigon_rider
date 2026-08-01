"""admin 감사 로그 공용 헬퍼 — insert 만 수행, 커밋은 호출부 트랜잭션에 편승."""

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession
from ...models import AdminAuditLog


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


async def audit(
    db: AsyncSession,
    session: AdminSession,
    request: Request,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    detail: dict | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            admin_username=session.username,
            admin_role=session.role,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
            ip=_client_ip(request),
        )
    )
