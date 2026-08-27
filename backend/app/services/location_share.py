"""거래 위치공유(marketplace_location_shares) 수명주기 헬퍼.

정밀도 판정(블러 등)은 별도 담당(location_privacy) 소관 — 이 모듈은
실시간 좌표 공유 행의 만료 판정과 약속 상태전이 시 삭제만 다룬다.
"""

import uuid
from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import MarketplaceLocationShare


def is_location_share_expired(share: MarketplaceLocationShare, now: datetime) -> bool:
    """expires_at 경과 여부. 옵트아웃(revoked_at)된 행도 만료로 취급한다."""
    if share.revoked_at is not None:
        return True
    return now >= share.expires_at


async def purge_location_shares(db: AsyncSession, appointment_id: uuid.UUID) -> None:
    """약속 상태가 COMPLETED/CANCELLED 로 전이될 때 해당 약속의 실시간 위치공유 행을 즉시 삭제한다.

    약속 핀(place_lat/lng)은 건드리지 않는다 — 삭제 대상은 이 테이블 행뿐이다.
    """
    await db.execute(delete(MarketplaceLocationShare).where(MarketplaceLocationShare.appointment_id == appointment_id))
