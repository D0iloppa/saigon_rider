import uuid

from fastapi import APIRouter, Depends

from ..deps import verify_user_session
from ..engine_client import engine_client

router = APIRouter(prefix="/ride", tags=["라이딩 (Ride)"])


@router.get("/policy", summary="라이딩 화면 정책 (체크포인트 반경/잔여거리 밴드)")
async def get_ride_policy(
    user_id: uuid.UUID = Depends(verify_user_session),
):
    return await engine_client.get_ride_policy()
