"""admin JSON API — 비즈니스 파트너 (계정 심사 + 광고 소재 심사).

`admin_legacy.py`의 동명 Jinja 라우트(biz-accounts 3682-3963, biz-ads 3966-4131)를
JSON 응답으로 이관한 것 — PENDING-first 큐 정렬·승인/반려·정지·그룹지정 로직은 그대로
옮겼다. 구 `/admin-legacy/*` 라우트는 손대지 않고 병행 유지한다. (SGR-312 §10-1)
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import BusinessGroup, BusinessProfile, MarketplaceAd, User
from ...services import noti_events
from ...utils import build_imgproxy_url
from ._audit import audit

router = APIRouter(prefix="/biz")

_ACCOUNT_STATUSES = {"PENDING", "APPROVED", "REJECTED", "SUSPENDED"}
_AD_STATUSES = {"PENDING", "APPROVED", "REJECTED", "STOPPED"}


class BizGroupBrief(BaseModel):
    id: uuid.UUID
    name: str


class BizAccountAdBrief(BaseModel):
    id: uuid.UUID
    title: str
    review_status: str
    created_at: datetime


class BizAccountRow(BaseModel):
    id: uuid.UUID
    created_at: datetime
    name: str
    category: str | None
    address: str | None
    phone: str | None
    photo_url: str | None
    applicant_id: uuid.UUID
    applicant_nickname: str | None
    status: str
    reject_reason: str | None


class BizAccountDetail(BizAccountRow):
    latitude: float | None
    longitude: float | None
    group_id: uuid.UUID | None
    group_name: str | None
    reviewed_at: datetime | None
    ads: list[BizAccountAdBrief]
    groups: list[BizGroupBrief]


class BizRejectRequest(BaseModel):
    reason: str


class BizGroupAssignRequest(BaseModel):
    group_id: uuid.UUID | None = None
    new_group_name: str | None = None


class BizAdRow(BaseModel):
    id: uuid.UUID
    created_at: datetime
    title: str
    body: str | None
    image_url: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    partner_name: str
    profile_id: uuid.UUID | None
    profile_name: str | None
    profile_status: str | None
    review_status: str
    reject_reason: str | None


def _validate_status(status: str | None, valid: set[str]) -> None:
    if status is not None and status not in valid:
        raise HTTPException(status_code=400, detail="invalid status")


def _photo_url(bp: BusinessProfile) -> str | None:
    if bp.photo_content and bp.photo_content.file_path:
        return build_imgproxy_url(bp.photo_content.file_path)
    return None


def _ad_image_url(ad: MarketplaceAd) -> str | None:
    """contents 중개 이미지 우선, 레거시 image_url(외부 http) 폴백 — admin_legacy._ad_image_url 미러."""
    if ad.image_content and ad.image_content.file_path:
        return build_imgproxy_url(ad.image_content.file_path)
    return ad.image_url


def _account_row(bp: BusinessProfile, nickname: str | None) -> BizAccountRow:
    return BizAccountRow(
        id=bp.id,
        created_at=bp.created_at,
        name=bp.name,
        category=bp.category,
        address=bp.address,
        phone=bp.phone,
        photo_url=_photo_url(bp),
        applicant_id=bp.user_id,
        applicant_nickname=nickname,
        status=bp.status,
        reject_reason=bp.reject_reason,
    )


async def _get_account_or_404(db: AsyncSession, profile_id: uuid.UUID) -> BusinessProfile:
    bp = await db.get(BusinessProfile, profile_id)
    if bp is None:
        raise HTTPException(status_code=404, detail="Business profile not found")
    return bp


# ── 계정 심사 (§10-1 /admin/biz-accounts) ────────────────────────


@router.get("/accounts", response_model=list[BizAccountRow], summary="비즈니스 계정 심사 목록 (PENDING 상단)")
async def list_biz_accounts(
    status: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_status(status, _ACCOUNT_STATUSES)
    stmt = select(BusinessProfile, User.nickname).join(User, User.id == BusinessProfile.user_id)
    if status:
        stmt = stmt.where(BusinessProfile.status == status)
    # PENDING 을 상단으로, 그 안에서는 최신순 (admin_legacy stable-sort 이관)
    stmt = stmt.order_by(case((BusinessProfile.status == "PENDING", 0), else_=1), BusinessProfile.created_at.desc())
    rows = (await db.execute(stmt)).all()
    return [_account_row(bp, nickname) for bp, nickname in rows]


@router.get("/accounts/{profile_id}", response_model=BizAccountDetail, summary="비즈니스 계정 상세")
async def get_biz_account(
    profile_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(BusinessProfile, User.nickname)
            .join(User, User.id == BusinessProfile.user_id)
            .where(BusinessProfile.id == profile_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Business profile not found")
    bp, nickname = row

    ads = (
        (
            await db.execute(
                select(MarketplaceAd)
                .where(MarketplaceAd.owner_business_profile_id == profile_id)
                .order_by(MarketplaceAd.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    groups = (await db.execute(select(BusinessGroup).order_by(BusinessGroup.name))).scalars().all()
    group_name = next((g.name for g in groups if g.id == bp.group_id), None) if bp.group_id else None

    base = _account_row(bp, nickname)
    return BizAccountDetail(
        **base.model_dump(),
        latitude=float(bp.latitude) if bp.latitude is not None else None,
        longitude=float(bp.longitude) if bp.longitude is not None else None,
        group_id=bp.group_id,
        group_name=group_name,
        reviewed_at=bp.reviewed_at,
        ads=[
            BizAccountAdBrief(id=ad.id, title=ad.title, review_status=ad.review_status, created_at=ad.created_at)
            for ad in ads
        ],
        groups=[BizGroupBrief(id=g.id, name=g.name) for g in groups],
    )


@router.post("/accounts/{profile_id}/approve", summary="비즈니스 계정 승인")
async def approve_biz_account(
    profile_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    bp = await _get_account_or_404(db, profile_id)
    if bp.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    bp.status = "APPROVED"
    bp.reviewed_at = datetime.now(UTC)

    await audit(db, session, request, "BIZ_ACCOUNT_APPROVE", "business_profile", str(profile_id))
    await db.commit()

    await noti_events.publish(
        "biz.profile_reviewed",
        {"user_id": str(bp.user_id), "profile_id": str(bp.id), "profile_name": bp.name, "result": "APPROVED"},
    )
    return {"id": bp.id, "status": bp.status}


@router.post("/accounts/{profile_id}/reject", summary="비즈니스 계정 반려")
async def reject_biz_account(
    profile_id: uuid.UUID,
    body: BizRejectRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason is required")

    bp = await _get_account_or_404(db, profile_id)
    if bp.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    bp.status = "REJECTED"
    bp.reject_reason = reason
    bp.reviewed_at = datetime.now(UTC)

    await audit(db, session, request, "BIZ_ACCOUNT_REJECT", "business_profile", str(profile_id), {"reason": reason})
    await db.commit()

    await noti_events.publish(
        "biz.profile_reviewed",
        {
            "user_id": str(bp.user_id),
            "profile_id": str(bp.id),
            "profile_name": bp.name,
            "result": "REJECTED",
            "reject_reason": reason,
        },
    )
    return {"id": bp.id, "status": bp.status, "reject_reason": bp.reject_reason}


@router.post("/accounts/{profile_id}/suspend", summary="비즈니스 계정 정지 (게시중 광고 일괄 중단)")
async def suspend_biz_account(
    profile_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    bp = await _get_account_or_404(db, profile_id)
    if bp.status != "APPROVED":
        raise HTTPException(status_code=409, detail="only approved profiles can be suspended")

    bp.status = "SUSPENDED"
    bp.reviewed_at = datetime.now(UTC)

    live_ads = (
        (
            await db.execute(
                select(MarketplaceAd).where(
                    MarketplaceAd.owner_business_profile_id == profile_id,
                    MarketplaceAd.review_status == "APPROVED",
                )
            )
        )
        .scalars()
        .all()
    )
    for ad in live_ads:
        ad.review_status = "STOPPED"

    await audit(
        db, session, request, "BIZ_ACCOUNT_SUSPEND", "business_profile", str(profile_id), {"stopped_ads": len(live_ads)}
    )
    await db.commit()

    await noti_events.publish(
        "biz.profile_reviewed",
        {"user_id": str(bp.user_id), "profile_id": str(bp.id), "profile_name": bp.name, "result": "SUSPENDED"},
    )
    return {"id": bp.id, "status": bp.status}


@router.post("/accounts/{profile_id}/group", summary="비즈니스 계정 그룹 지정 (D4 — admin 전용, 앱 UI 없음)")
async def assign_biz_account_group(
    profile_id: uuid.UUID,
    body: BizGroupAssignRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    bp = await _get_account_or_404(db, profile_id)

    new_group_name = (body.new_group_name or "").strip()
    if new_group_name:
        group = BusinessGroup(name=new_group_name)
        db.add(group)
        await db.flush()
        bp.group_id = group.id
    elif body.group_id:
        bp.group_id = body.group_id
    else:
        bp.group_id = None

    await audit(
        db,
        session,
        request,
        "BIZ_ACCOUNT_GROUP",
        "business_profile",
        str(profile_id),
        {"group_id": str(bp.group_id) if bp.group_id else None},
    )
    await db.commit()
    return {"id": bp.id, "group_id": bp.group_id}


# ── 광고 소재 심사 (§10-1 /admin/biz-ads) ─────────────────────────


@router.get("/ads", response_model=list[BizAdRow], summary="광고 소재 심사 목록 (PENDING 상단)")
async def list_biz_ads(
    status: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_status(status, _AD_STATUSES)
    stmt = select(MarketplaceAd, BusinessProfile).outerjoin(
        BusinessProfile, BusinessProfile.id == MarketplaceAd.owner_business_profile_id
    )
    if status:
        stmt = stmt.where(MarketplaceAd.review_status == status)
    stmt = stmt.order_by(case((MarketplaceAd.review_status == "PENDING", 0), else_=1), MarketplaceAd.created_at.desc())
    rows = (await db.execute(stmt)).all()
    return [
        BizAdRow(
            id=ad.id,
            created_at=ad.created_at,
            title=ad.title,
            body=ad.body,
            image_url=_ad_image_url(ad),
            starts_at=ad.starts_at,
            ends_at=ad.ends_at,
            partner_name=bp.name if bp else ad.partner_name,
            profile_id=bp.id if bp else None,
            profile_name=bp.name if bp else None,
            profile_status=bp.status if bp else None,
            review_status=ad.review_status,
            reject_reason=ad.reject_reason,
        )
        for ad, bp in rows
    ]


async def _get_ad_or_404(db: AsyncSession, ad_id: uuid.UUID) -> MarketplaceAd:
    ad = await db.get(MarketplaceAd, ad_id)
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    return ad


@router.post("/ads/{ad_id}/approve", summary="광고 소재 승인 (즉시 게시)")
async def approve_biz_ad(
    ad_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    ad = await _get_ad_or_404(db, ad_id)
    if ad.review_status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    bp = await db.get(BusinessProfile, ad.owner_business_profile_id) if ad.owner_business_profile_id else None
    # 정지(SUSPENDED) 등 비활성 프로필의 광고 승인 차단 — resume_ad 가드의 승인 경로 우회 방지
    if bp and bp.status != "APPROVED":
        raise HTTPException(status_code=409, detail="owner profile is not active")

    ad.review_status = "APPROVED"

    await audit(db, session, request, "BIZ_AD_APPROVE", "marketplace_ad", str(ad_id))
    await db.commit()

    if bp:
        await noti_events.publish(
            "biz.ad_reviewed",
            {"user_id": str(bp.user_id), "ad_id": str(ad.id), "ad_title": ad.title, "result": "APPROVED"},
        )
    return {"id": ad.id, "review_status": ad.review_status}


@router.post("/ads/{ad_id}/reject", summary="광고 소재 반려")
async def reject_biz_ad(
    ad_id: uuid.UUID,
    body: BizRejectRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason is required")

    ad = await _get_ad_or_404(db, ad_id)
    if ad.review_status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    ad.review_status = "REJECTED"
    ad.reject_reason = reason
    bp = await db.get(BusinessProfile, ad.owner_business_profile_id) if ad.owner_business_profile_id else None

    await audit(db, session, request, "BIZ_AD_REJECT", "marketplace_ad", str(ad_id), {"reason": reason})
    await db.commit()

    if bp:
        await noti_events.publish(
            "biz.ad_reviewed",
            {
                "user_id": str(bp.user_id),
                "ad_id": str(ad.id),
                "ad_title": ad.title,
                "result": "REJECTED",
                "reject_reason": reason,
            },
        )
    return {"id": ad.id, "review_status": ad.review_status, "reject_reason": ad.reject_reason}
