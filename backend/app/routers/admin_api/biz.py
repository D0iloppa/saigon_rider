"""admin JSON API — 비즈니스 파트너 (계정 심사 + 광고 소재 심사).

`admin_legacy.py`의 동명 Jinja 라우트(biz-accounts 3682-3963, biz-ads 3966-4131)를
JSON 응답으로 이관한 것 — PENDING-first 큐 정렬·승인/반려·정지·그룹지정 로직은 그대로
옮겼다. 구 `/admin-legacy/*` 라우트는 손대지 않고 병행 유지한다. (SGR-312 §10-1)
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import BusinessGroup, BusinessProfile, User
from ...modules.ads import AdsApplication
from ...modules.ads.application import AdRead, AdsError, OwnerRead
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
    ad_fee: int
    tier_id: uuid.UUID
    tier_name: str
    monthly_price_snapshot_vnd: int


class BizAdExposureUpdateRequest(BaseModel):
    tier_id: uuid.UUID


class AdTierBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    monthly_price_vnd: int = Field(ge=0)
    exposure_weight: int = Field(gt=0)
    is_active: bool = True
    display_order: int = Field(default=0, ge=-32768, le=32767)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name is required")
        return value


class AdTierRow(AdTierBody):
    id: uuid.UUID

    model_config = {"from_attributes": True}


def _validate_status(status: str | None, valid: set[str]) -> None:
    if status is not None and status not in valid:
        raise HTTPException(status_code=400, detail="invalid status")


def _photo_url(bp: BusinessProfile) -> str | None:
    if bp.photo_content and bp.photo_content.file_path:
        return build_imgproxy_url(bp.photo_content.file_path)
    return None


def _ad_image_url(ad: AdRead) -> str | None:
    """contents 중개 이미지 우선, 레거시 image_url 폴백 — schemas.MarketplaceAdOut.resolve_image_and_status 미러.

    레거시 image_url 은 비-http 스토리지 키(예: official/ads/xxx.jpg)인 경우가 있어 그대로 반환하면
    어드민에서 깨진다 — http 로 시작하지 않으면 imgproxy 로 변환한다.
    """
    if ad.image_file_path:
        return build_imgproxy_url(ad.image_file_path)
    if ad.image_url and not ad.image_url.startswith("http"):
        return build_imgproxy_url(ad.image_url)
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


def _ad_row(ad: AdRead, bp: OwnerRead | None) -> BizAdRow:
    return BizAdRow(
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
        ad_fee=ad.ad_fee,
        tier_id=ad.tier_id,
        tier_name=ad.tier_name,
        monthly_price_snapshot_vnd=ad.monthly_price_snapshot_vnd,
    )


def _ads_error(exc: AdsError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/ad-tiers", response_model=list[AdTierRow], summary="광고 티어 정책 목록")
async def list_ad_tiers(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    return await AdsApplication(db).list_tiers()


@router.post("/ad-tiers", response_model=AdTierRow, status_code=201, summary="광고 티어 생성")
async def create_ad_tier(
    body: AdTierBody,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    tier = await AdsApplication(db).create_tier(**body.model_dump())
    await audit(db, session, request, "BIZ_AD_TIER_CREATE", "ad_tier", str(tier.id), body.model_dump())
    await db.commit()
    return tier


@router.put("/ad-tiers/{tier_id}", response_model=AdTierRow, summary="광고 티어 수정/비활성화")
async def update_ad_tier(
    tier_id: uuid.UUID,
    body: AdTierBody,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        tier = await AdsApplication(db).update_tier(tier_id, **body.model_dump())
        await audit(db, session, request, "BIZ_AD_TIER_UPDATE", "ad_tier", str(tier_id), body.model_dump())
        await db.commit()
        return tier
    except AdsError as exc:
        raise _ads_error(exc) from exc


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

    ads = await AdsApplication(db).own_ads(profile_id)
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

    stopped_ads = await AdsApplication(db).stop_profile_ads(profile_id)

    await audit(
        db, session, request, "BIZ_ACCOUNT_SUSPEND", "business_profile", str(profile_id), {"stopped_ads": stopped_ads}
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
    profile_id: uuid.UUID | None = Query(None, description="특정 파트너(business_profile) 소유 광고만"),
    launching: bool | None = Query(None, description="true 면 현재 론칭중(승인+활성+게시기간 내) 광고만"),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_status(status, _AD_STATUSES)
    rows = await AdsApplication(db).list_admin_ads(status, profile_id, launching)
    return [_ad_row(ad, bp) for ad, bp in rows]


@router.get("/ads/{ad_id}", response_model=BizAdRow, summary="광고 소재 상세")
async def get_biz_ad(
    ad_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        ad, bp = await AdsApplication(db).get_ad_with_owner(ad_id)
    except AdsError as exc:
        raise _ads_error(exc) from exc
    return _ad_row(ad, bp)


@router.post("/ads/{ad_id}/approve", summary="광고 소재 승인 (즉시 게시)")
async def approve_biz_ad(
    ad_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        ad, bp = await AdsApplication(db).approve(ad_id)
    except AdsError as exc:
        raise _ads_error(exc) from exc

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

    try:
        ad, bp = await AdsApplication(db).reject(ad_id, reason)
    except AdsError as exc:
        raise _ads_error(exc) from exc

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


@router.post("/ads/{ad_id}/exposure", summary="광고 노출 등급/과금액 설정 (148 가중 노출 산정용, admin 전용)")
async def update_biz_ad_exposure(
    ad_id: uuid.UUID,
    body: BizAdExposureUpdateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        ad = await AdsApplication(db).set_tier(ad_id, body.tier_id)
    except AdsError as exc:
        raise _ads_error(exc) from exc

    await audit(
        db,
        session,
        request,
        "BIZ_AD_EXPOSURE_UPDATE",
        "marketplace_ad",
        str(ad_id),
        {"tier_id": str(ad.tier_id), "ad_fee": ad.ad_fee},
    )
    await db.commit()
    return {"id": ad.id, "tier_id": ad.tier_id, "ad_fee": ad.ad_fee}
