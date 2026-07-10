import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import BusinessProfile
from ..schemas import BusinessProfileApplyRequest, BusinessProfileOut, BusinessProfileUpdateRequest
from ..utils import build_imgproxy_url

router = APIRouter(prefix="/biz", tags=["비즈니스 파트너 (Business Partner)"])

# D2: 1계정 N프로필 상한 (당근 벤치마크 — REJECTED 는 카운트에서 제외)
MAX_PROFILES_PER_USER = 3


def _out(p: BusinessProfile) -> BusinessProfileOut:
    photo_url = build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None
    return BusinessProfileOut(
        id=p.id,
        name=p.name,
        category=p.category,
        address=p.address,
        latitude=p.latitude,
        longitude=p.longitude,
        phone=p.phone,
        photo_content_id=p.photo_content_id,
        photo_url=photo_url,
        status=p.status,
        reject_reason=p.reject_reason,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


async def _get_own_profile(db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID) -> BusinessProfile:
    profile = await db.get(BusinessProfile, profile_id)
    if profile is None or profile.user_id != user_id:
        raise HTTPException(status_code=404, detail="Business profile not found")
    return profile


@router.post("/apply", response_model=BusinessProfileOut, status_code=201, summary="비즈니스 파트너 신청")
async def apply(
    body: BusinessProfileApplyRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    active_count = (
        await db.execute(
            select(func.count())
            .select_from(BusinessProfile)
            .where(BusinessProfile.user_id == session_uid, BusinessProfile.status != "REJECTED")
        )
    ).scalar_one()
    if active_count >= MAX_PROFILES_PER_USER:
        raise HTTPException(status_code=409, detail="Business profile limit reached (max 3)")

    now = datetime.now(UTC)
    profile = BusinessProfile(
        user_id=session_uid,
        name=body.name.strip(),
        category=body.category,
        address=body.address,
        latitude=body.latitude,
        longitude=body.longitude,
        phone=body.phone,
        photo_content_id=body.photo_content_id,
        status="PENDING",
        created_at=now,
        updated_at=now,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _out(profile)


@router.get("/profiles", response_model=list[BusinessProfileOut], summary="내 비즈니스 프로필 목록")
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profiles = (
        (
            await db.execute(
                select(BusinessProfile)
                .where(BusinessProfile.user_id == session_uid)
                .order_by(BusinessProfile.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_out(p) for p in profiles]


@router.get("/profiles/{profile_id}", response_model=BusinessProfileOut, summary="내 비즈니스 프로필 상세")
async def get_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await _get_own_profile(db, profile_id, session_uid)
    return _out(profile)


@router.put("/profiles/{profile_id}", response_model=BusinessProfileOut, summary="비즈니스 프로필 수정/재신청")
async def update_profile(
    profile_id: uuid.UUID,
    body: BusinessProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    profile = await _get_own_profile(db, profile_id, session_uid)
    if profile.status == "PENDING":
        raise HTTPException(status_code=409, detail="Profile under review — cannot edit")

    profile.name = body.name.strip()
    profile.category = body.category
    profile.address = body.address
    profile.latitude = body.latitude
    profile.longitude = body.longitude
    profile.phone = body.phone
    profile.photo_content_id = body.photo_content_id
    profile.updated_at = datetime.now(UTC)

    # REJECTED 재신청 → 재심사 큐로 (APPROVED 는 정보 수정만, 상태 유지)
    if profile.status == "REJECTED":
        profile.status = "PENDING"
        profile.reject_reason = None
        profile.reviewed_at = None

    await db.commit()
    await db.refresh(profile)
    return _out(profile)
