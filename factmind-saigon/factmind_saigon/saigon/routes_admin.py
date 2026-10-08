"""Admin FactMind routes (mounted by backend/app/routers/admin_api/fm.py)."""
import asyncio
import functools
from typing import Literal, Optional

from app.admin_auth import AdminSession, verify_admin_api
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from factmind_saigon.core.fetch import FetchError, fetch_public
from factmind_saigon.core.site_report import diagnose_site

from .constants import BOTS_VN, USER_AGENT

router = APIRouter(prefix="/fm")


class DiagnoseRequest(BaseModel):
    url: str
    name: Optional[str] = None
    locale: Literal["ko-KR", "vi", "en"] = "ko-KR"


@router.post("/diagnose")
async def diagnose(
    body: DiagnoseRequest,
    _session: AdminSession = Depends(verify_admin_api),
):
    reader = functools.partial(fetch_public, user_agent=USER_AGENT)
    try:
        # core collectors use blocking http.client; keep them off the event loop.
        return await asyncio.to_thread(
            diagnose_site, body.url, body.name or body.url, reader,
            locale=body.locale, bots=BOTS_VN,
        )
    except FetchError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "url": body.url})
    except (ValueError, OSError) as e:
        raise HTTPException(status_code=400, detail={"code": "fetch_failed", "message": str(e)[:300]})
