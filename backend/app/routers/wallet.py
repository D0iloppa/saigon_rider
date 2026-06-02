import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import verify_user_session
from ..engine_client import engine_client

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


class WalletResponse(BaseModel):
    gold_balance: int
    xp_balance: int


@router.get("/me", response_model=WalletResponse, summary="GOLD/XP 잔액 조회")
async def get_my_wallet(user_id: uuid.UUID = Depends(verify_user_session)):
    try:
        data = await engine_client.get_wallet(str(user_id))
    except httpx.HTTPError as err:
        # 타임아웃·연결 실패·Engine 5xx 등 게이트웨이성 오류만 502 로 변환
        log.warning("wallet engine call failed: %r", err)
        raise HTTPException(status_code=502, detail="Engine unavailable") from err
    return WalletResponse(
        gold_balance=data.get("gp_balance", 0),
        xp_balance=data.get("gc_balance", 0),
    )
