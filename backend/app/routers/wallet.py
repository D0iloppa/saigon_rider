import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import verify_user_session
from ..engine_client import engine_client

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


class WalletResponse(BaseModel):
    gold_balance: int
    xp_balance: int


@router.get("/me", response_model=WalletResponse, summary="GOLD/XP 잔액 조회")
async def get_my_wallet(user_id: uuid.UUID = Depends(verify_user_session)):
    try:
        data = await engine_client.get_wallet(str(user_id))
        return WalletResponse(
            gold_balance=data.get("gp_balance", 0),
            xp_balance=data.get("gc_balance", 0),
        )
    except Exception as err:
        raise HTTPException(status_code=502, detail="Engine unavailable") from err
