import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...deps import verify_user_session
from ...models import PlaceSubmission
from ...schemas import PlaceSuggestionCreateRequest, PlaceSuggestionOut

router = APIRouter(prefix="/map", tags=["지도 (Map)"])

# ── 장소 제안 (동네지도 프로필 실배선 P-BE T2) ───────────────────
# biz.py에서 이관 — 장소제보는 비즈니스 파트너 신청과 무관한 지도 도메인이라
# URL도 /api/map/place-suggestions*로 정식화(구 /api/biz/place-suggestions*).


@router.post("/place-suggestions", response_model=PlaceSuggestionOut, status_code=201, summary="장소 제안")
async def create_place_suggestion(
    body: PlaceSuggestionCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    submission = PlaceSubmission(
        name=body.name.strip(),
        category=body.category,
        address=body.address,
        lat=body.lat,
        lng=body.lng,
        note=body.note,
        reporter_user_id=session_uid,
        status="PENDING",
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return submission


@router.get("/place-suggestions/mine", response_model=list[PlaceSuggestionOut], summary="내가 제안한 장소 목록")
async def list_my_place_suggestions(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    rows = (
        (
            await db.execute(
                select(PlaceSubmission)
                .where(PlaceSubmission.reporter_user_id == session_uid)
                .order_by(PlaceSubmission.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return rows
