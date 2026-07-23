"""admin JSON API — 라이딩 표시 정책 (checkpoint proximity / distance bands / 일일 퀘스트 기본 슬롯).

`admin_legacy.py`의 동명 Jinja 라우트(3080-3173)를 JSON 응답으로 이관한 것 — 조회/검증/저장 로직은
그대로 옮겼다(engine_client.get_ride_policy / get_seed / update_seed 재사용, Engine 변경 없음).
구 `/admin-legacy/config/ride` 라우트는 손대지 않고 병행 유지한다.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...engine_client import engine_client
from ._audit import audit

router = APIRouter(prefix="/ride-policy")

_log = logging.getLogger(__name__)


class RideBand(BaseModel):
    code: str
    threshold_m: int


class RidePolicyResponse(BaseModel):
    proximity_m: int
    daily_quest_base_slots: int
    bands: list[RideBand]


class RidePolicySaveRequest(BaseModel):
    proximity_m: int = Field(gt=0)
    daily_quest_base_slots: int = Field(ge=1, le=10)
    bands: list[RideBand]


@router.get("", response_model=RidePolicyResponse, summary="라이딩 표시 정책 조회")
async def get_ride_policy_api(_session: AdminSession = Depends(verify_admin_api)):
    try:
        policy = await engine_client.get_ride_policy()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    proximity_m = int(policy.get("checkpointProximityM", 100))
    bands = policy.get("checkpointDistanceBands") or []

    try:
        slot_row = await engine_client.get_seed("DAILY_QUEST_BASE_SLOTS")
        daily_slots = int(slot_row.get("value_text") or 3)
    except Exception:
        daily_slots = 3

    return RidePolicyResponse(
        proximity_m=proximity_m,
        daily_quest_base_slots=daily_slots,
        bands=[RideBand(code=str(b.get("code", "")), threshold_m=int(b.get("thresholdM", 0))) for b in bands],
    )


@router.put("", response_model=RidePolicyResponse, summary="라이딩 표시 정책 저장")
async def save_ride_policy_api(
    body: RidePolicySaveRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    seen_codes: set[str] = set()
    bands: list[dict] = []
    for band in body.bands:
        code = band.code.strip()
        if not code:
            continue
        if band.threshold_m <= 0:
            raise HTTPException(status_code=400, detail="threshold_m 은 0 보다 큰 정수여야 합니다.")
        if code in seen_codes:
            raise HTTPException(status_code=400, detail="밴드 코드가 중복되었습니다.")
        seen_codes.add(code)
        bands.append({"code": code, "thresholdM": band.threshold_m})

    if not bands:
        raise HTTPException(status_code=400, detail="밴드는 1개 이상 필요합니다.")

    bands.sort(key=lambda b: b["thresholdM"], reverse=True)

    try:
        await engine_client.update_seed("CHECKPOINT_PROXIMITY_M", str(body.proximity_m))
        await engine_client.update_seed("CHECKPOINT_DISTANCE_BANDS", json.dumps(bands, ensure_ascii=False))
        await engine_client.update_seed("DAILY_QUEST_BASE_SLOTS", str(body.daily_quest_base_slots))
    except Exception as e:
        _log.exception("ride policy save failed: %s", e)
        raise HTTPException(status_code=502, detail="엔진 호출에 실패했습니다.") from e

    await audit(
        db,
        session,
        request,
        "RIDE_POLICY_SAVE",
        "ride_policy",
        None,
        {
            "proximity_m": body.proximity_m,
            "daily_quest_base_slots": body.daily_quest_base_slots,
            "bands": bands,
        },
    )
    await db.commit()

    return RidePolicyResponse(
        proximity_m=body.proximity_m,
        daily_quest_base_slots=body.daily_quest_base_slots,
        bands=[RideBand(code=b["code"], threshold_m=b["thresholdM"]) for b in bands],
    )
