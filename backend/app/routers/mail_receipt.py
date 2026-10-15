"""공개 수신확인 픽셀 — 관리자 메일함(admin_api/mailbox.py)이 보낸 메일의 열람 기록.

그룹웨어 DESIGN-MAIL-read-receipt.md 와 같은 규칙:
- 인증 없음(외부 수신자는 세션이 없다). 유효/무효 토큰 모두 200 + 동일 1x1 GIF, no-store (R9).
- IP/User-Agent 는 저장하지 않는다 (D2) — 열람 여부/최초 시각/횟수만.
- 발송 후 10초 이내 첫 요청은 보안 게이트웨이 사전 스캔으로 간주해 기록하지 않는다 (D3).
- admin_session 쿠키가 있으면 발신자(콘솔) 본인 열람으로 보고 기록하지 않는다 (R7).

경로: GET /api/mail/r/{token}.gif → nginx 를 거친 공개 URL 은 `${BFF_PUBLIC_URL}/mail/r/{token}.gif`.
"""

import base64
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..admin_auth import COOKIE as ADMIN_COOKIE
from ..database import get_db
from ..models import AdminMailReadReceipt

router = APIRouter(prefix="/mail", include_in_schema=False)

_GIF = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
_PRESCAN_WINDOW = timedelta(seconds=10)
_HEADERS = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0"}


@router.get("/r/{token}.gif")
async def read_receipt_pixel(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token_uuid = uuid.UUID(token)
    except ValueError:
        token_uuid = None
    if token_uuid is not None and not request.cookies.get(ADMIN_COOKIE):
        row = (
            await db.execute(select(AdminMailReadReceipt).where(AdminMailReadReceipt.token == token_uuid))
        ).scalar_one_or_none()
        now = datetime.now(UTC)
        if row is not None and now - row.sent_at >= _PRESCAN_WINDOW:
            row.open_count += 1
            if row.first_opened_at is None:
                row.first_opened_at = now
            await db.commit()
    return Response(content=_GIF, media_type="image/gif", headers=_HEADERS)
