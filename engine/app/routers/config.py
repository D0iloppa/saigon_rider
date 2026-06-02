"""Ride policy / seed config 라이트 엔드포인트.

BFF 가 라이딩 화면 표시용 정책(체크포인트 도달 반경, 잔여거리 밴드)을 한 번에
받아가기 위한 GET 과, Admin BFF 가 seed_config 값을 튜닝하기 위한 PUT.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.models import SreSeedConfig
from app.services import seed_config as seed_svc

router = APIRouter(prefix="/v1/config", tags=["config"])

_DEFAULT_PROXIMITY_M = 100
_DEFAULT_BANDS: list[dict[str, Any]] = [
    {"code": "BAND_5KM", "thresholdM": 5000},
    {"code": "BAND_1KM", "thresholdM": 1000},
]


class RidePolicyResponse(BaseModel):
    checkpointProximityM: int
    checkpointDistanceBands: list[dict[str, Any]]


class SeedUpdateRequest(BaseModel):
    value_text: str


class SeedUpdateResponse(BaseModel):
    seed_code: str
    value_text: str


class SeedValueResponse(BaseModel):
    seed_code: str
    value_text: str


@router.get(
    "/ride-policy",
    response_model=RidePolicyResponse,
    dependencies=[Depends(verify_service_key)],
)
async def get_ride_policy() -> RidePolicyResponse:
    proximity_m = await seed_svc.get_seed_int(
        "CHECKPOINT_PROXIMITY_M", _DEFAULT_PROXIMITY_M
    )
    bands = await seed_svc.get_seed_json(
        "CHECKPOINT_DISTANCE_BANDS", _DEFAULT_BANDS
    )
    return RidePolicyResponse(
        checkpointProximityM=proximity_m,
        checkpointDistanceBands=bands,
    )


@router.get(
    "/seed/{seed_code}",
    response_model=SeedValueResponse,
    dependencies=[Depends(verify_service_key)],
)
async def get_seed(
    seed_code: str,
    db: AsyncSession = Depends(get_session),
) -> SeedValueResponse:
    row = await db.execute(
        select(SreSeedConfig).where(SreSeedConfig.seed_code == seed_code)
    )
    obj = row.scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"seed_code not found: {seed_code}",
        )
    return SeedValueResponse(seed_code=seed_code, value_text=obj.value_text)


@router.put(
    "/seed/{seed_code}",
    response_model=SeedUpdateResponse,
    dependencies=[Depends(verify_service_key)],
)
async def update_seed(
    seed_code: str,
    body: SeedUpdateRequest,
    db: AsyncSession = Depends(get_session),
) -> SeedUpdateResponse:
    # JSON 형태로 들어오는 경우 파싱 가능 여부만 확인 (검증은 호출 측에서)
    value = body.value_text
    if value.lstrip().startswith(("{", "[")):
        try:
            json.loads(value)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"value_text is not valid JSON: {exc}",
            )

    row = await db.execute(
        select(SreSeedConfig).where(SreSeedConfig.seed_code == seed_code)
    )
    obj = row.scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"seed_code not found: {seed_code}",
        )

    obj.value_text = value
    await db.commit()
    seed_svc.invalidate(seed_code)

    return SeedUpdateResponse(seed_code=seed_code, value_text=value)
