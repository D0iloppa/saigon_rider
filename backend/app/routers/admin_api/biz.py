"""admin JSON API — 비즈니스 파트너 (계정 심사 + 광고 소재 심사).

`admin_legacy.py`의 동명 Jinja 라우트(biz-accounts 3682-3963, biz-ads 3966-4131)를
JSON 응답으로 이관한 것 — PENDING-first 큐 정렬·승인/반려·정지·그룹지정 로직은 그대로
옮겼다. 구 `/admin-legacy/*` 라우트는 손대지 않고 병행 유지한다. (SGR-312 §10-1)
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import BusinessCategory, BusinessGroup, BusinessProfile, Content, MarketplaceAd, Notification, User
from ...modules.ads import AdsApplication
from ...modules.ads.application import AdRead, AdsError, OwnerRead
from ...schemas import BusinessCategoryOut, ContentOut
from ...services import noti_events
from ...services.search_index import immediate_blob
from ...services.translate import warm_translations
from ...utils import build_imgproxy_url
from ..contents import ALLOWED_MIME_TYPES, CONTENTS_BASE_PATH, MAX_UPLOAD_BYTES, _sniff_mime
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
    applicant_id: uuid.UUID | None
    applicant_nickname: str | None
    status: str
    reject_reason: str | None
    verification_status: str = "pending"


class BizAccountDetail(BizAccountRow):
    latitude: float | None
    longitude: float | None
    group_id: uuid.UUID | None
    group_name: str | None
    reviewed_at: datetime | None
    # 검증축 (init/151) — 민감 문서는 admin 심사용 imgproxy URL 로만 노출.
    rep_name: str | None
    biz_license_url: str | None
    signboard_url: str | None
    verified_at: datetime | None
    verification_reject_reason: str | None
    ads: list[BizAccountAdBrief]
    groups: list[BizGroupBrief]


class BizAccountCreateRequest(BaseModel):
    """관리자 직접 등록 — routers/biz.py `BusinessProfileApplyRequest` 와 필드 집합 동일(소유자만 없음)."""

    name: str
    category: str | None = None
    address: str
    latitude: Decimal
    longitude: Decimal
    phone: str
    photo_content_id: uuid.UUID | None = None
    intro: str | None = Field(default=None, max_length=500)


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
    is_ongoing: bool = True
    subscription_status: str = "pending_payment"
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
    features_json: list[str] | None = None  # 플랜 피처 목록 (프론트 플랜피커용, init/151)

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
        verification_status=bp.verification_status,
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
        is_ongoing=ad.is_ongoing,
        subscription_status=ad.subscription_status,
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


async def _require_content(db: AsyncSession, content_id: uuid.UUID | None) -> None:
    """content_id 존재 검증 — routers/biz.py 동명 헬퍼 미러(소유권은 미검사, 존재만)."""
    if content_id is not None and await db.get(Content, content_id) is None:
        raise HTTPException(status_code=400, detail="Invalid content_id")


# ── 계정 심사 (§10-1 /admin/biz-accounts) ────────────────────────


@router.get("/accounts", response_model=list[BizAccountRow], summary="비즈니스 계정 심사 목록 (PENDING 상단)")
async def list_biz_accounts(
    status: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_status(status, _ACCOUNT_STATUSES)
    # isouter=True 필수 — 관리자 직접 등록 프로필은 user_id 가 NULL(소유자 미연결)이라
    # INNER JOIN 이면 목록에서 통째로 사라진다 (init/168).
    stmt = select(BusinessProfile, User.nickname).join(User, User.id == BusinessProfile.user_id, isouter=True)
    if status:
        stmt = stmt.where(BusinessProfile.status == status)
    # PENDING 을 상단으로, 그 안에서는 최신순 (admin_legacy stable-sort 이관)
    stmt = stmt.order_by(case((BusinessProfile.status == "PENDING", 0), else_=1), BusinessProfile.created_at.desc())
    rows = (await db.execute(stmt)).all()
    return [_account_row(bp, nickname) for bp, nickname in rows]


@router.post(
    "/accounts", response_model=BizAccountRow, status_code=201, summary="비즈니스 계정 직접 등록 (admin, 즉시 승인)"
)
async def create_biz_account(
    body: BizAccountCreateRequest,
    background: BackgroundTasks,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """영업으로 확보한 업체를 심사 대기 없이 즉시 등록 — 관리자가 곧 승인권자라 PENDING 큐를
    거치는 것은 자기승인 루프에 불과하다(대표 결정). 소유자(user_id)는 아직 없다(init/168) —
    나중에 실제 사업자가 앱 계정을 만들면 연결하는 기능은 후속(미구현, 대표 판단 필요)."""
    name = body.name.strip()
    address = body.address.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not address:
        raise HTTPException(status_code=400, detail="Address is required")
    await _require_content(db, body.photo_content_id)

    intro = body.intro.strip() if body.intro else None
    now = datetime.now(UTC)
    bp = BusinessProfile(
        user_id=None,
        name=name,
        category=body.category,
        address=address,
        intro=intro,
        latitude=body.latitude,
        longitude=body.longitude,
        phone=body.phone,
        photo_content_id=body.photo_content_id,
        status="APPROVED",
        reviewed_at=now,
        created_at=now,
        updated_at=now,
        # 원문만으로 즉시 검색 가능(번역 대기 없음) — routers/biz.py apply() 미러
        search_blob=immediate_blob([name, address, intro]),
    )
    db.add(bp)
    await db.flush()
    noti_events.enqueue(
        db, "search.reindex", {"entity_type": "biz", "entity_id": str(bp.id), "texts": [name, address, intro]}
    )
    await audit(
        db, session, request, "BIZ_ACCOUNT_CREATE", "business_profile", str(bp.id), {"name": name, "status": "APPROVED"}
    )
    await db.commit()
    await db.refresh(bp)
    background.add_task(warm_translations, [name, address, intro or ""])
    return _account_row(bp, None)


@router.post(
    "/upload",
    response_model=ContentOut,
    status_code=status.HTTP_201_CREATED,
    summary="업체 대표사진 업로드 (admin, owner_type=system)",
)
async def upload_biz_photo(
    file: UploadFile = File(...),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """어드민은 `/admin/api/*` 밖(예: 앱 전용 `POST /contents/upload`, `verify_user_session` 필요)을
    호출할 수 없어 별도 경로가 필요하다. `routers/contents.py` 의 매직넘버 검증(`_sniff_mime`)을
    그대로 재사용하고, owner_type 만 관리자 업로드에 맞게 'system'으로 둔다(`admin_legacy.py`
    `_save_uploaded_image` 와 동일한 관례)."""
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {file.content_type}")

    ext = Path(file.filename or "file").suffix.lower() or ".bin"
    content_id = uuid.uuid4()
    filename = f"{content_id}{ext}"
    abs_dir = CONTENTS_BASE_PATH / "system"
    abs_path = abs_dir / filename
    file_path = f"system/{filename}"

    await asyncio.to_thread(abs_dir.mkdir, parents=True, exist_ok=True)

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)}MB)")
    if _sniff_mime(data) != file.content_type:
        raise HTTPException(status_code=400, detail="File content does not match declared content type")
    await asyncio.to_thread(abs_path.write_bytes, data)

    content = Content(
        id=content_id,
        owner_type="system",
        owner_id=None,
        file_path=file_path,
        mime_type=file.content_type,
        original_filename=file.filename,
        file_size=len(data),
        is_private=False,
    )
    db.add(content)
    await db.commit()
    await db.refresh(content)

    return ContentOut(
        id=content.id,
        owner_type=content.owner_type,
        owner_id=content.owner_id,
        file_path=content.file_path,
        mime_type=content.mime_type,
        original_filename=content.original_filename,
        file_size=content.file_size,
        imgproxy_url=build_imgproxy_url(content.file_path),
        created_at=content.created_at,
    )


@router.get(
    "/categories",
    response_model=list[BusinessCategoryOut],
    summary="업체 카테고리 목록 (routers/biz.py 공개 목록 미러)",
)
async def list_biz_categories(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        (
            await db.execute(
                select(BusinessCategory)
                .where(BusinessCategory.is_active == True)
                .order_by(BusinessCategory.group_sort_order, BusinessCategory.sort_order)
            )
        )
        .scalars()
        .all()
    )
    return rows


@router.get("/accounts/{profile_id}", response_model=BizAccountDetail, summary="비즈니스 계정 상세")
async def get_biz_account(
    profile_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(BusinessProfile, User.nickname)
            .join(User, User.id == BusinessProfile.user_id, isouter=True)
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
        rep_name=bp.rep_name,
        biz_license_url=(
            build_imgproxy_url(bp.biz_license_content.file_path)
            if bp.biz_license_content and bp.biz_license_content.file_path
            else None
        ),
        signboard_url=(
            build_imgproxy_url(bp.signboard_content.file_path)
            if bp.signboard_content and bp.signboard_content.file_path
            else None
        ),
        verified_at=bp.verified_at,
        verification_reject_reason=bp.verification_reject_reason,
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

    if bp.user_id is not None:  # 관리자 직접 등록 프로필은 소유자가 없어 알릴 대상이 없다 (init/168)
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


# ── 검증 심사 (init/151 — 계정 승인축과 별개의 verification 축) ────


@router.post("/accounts/{profile_id}/verify", summary="비즈니스 검증 승인 (문서 확인)")
async def verify_biz_account(
    profile_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    bp = await _get_account_or_404(db, profile_id)
    if bp.verification_status == "verified":
        raise HTTPException(status_code=409, detail="already verified")

    bp.verification_status = "verified"
    bp.verified_at = datetime.now(UTC)
    bp.verification_reject_reason = None

    await audit(db, session, request, "BIZ_ACCOUNT_VERIFY", "business_profile", str(profile_id))
    await db.commit()
    return {"id": bp.id, "verification_status": bp.verification_status, "verified_at": bp.verified_at}


@router.post("/accounts/{profile_id}/reject-verification", summary="비즈니스 검증 반려")
async def reject_biz_verification(
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
    if bp.verification_status == "verified":
        raise HTTPException(status_code=409, detail="already verified")

    bp.verification_status = "rejected"
    bp.verification_reject_reason = reason
    bp.verified_at = None

    await audit(
        db, session, request, "BIZ_ACCOUNT_REJECT_VERIFICATION", "business_profile", str(profile_id), {"reason": reason}
    )
    await db.commit()
    return {
        "id": bp.id,
        "verification_status": bp.verification_status,
        "verification_reject_reason": bp.verification_reject_reason,
    }


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


class AdMakegoodRequest(BaseModel):
    """#28(013/016 §8-5, D-29=(a)) — 기간 연장 보전만. 현금 환불은 대표 승인 건별 예외로만 다루며
    이 API 로 자동화하지 않는다(SOP-3 참조)."""

    reason: str
    extend_days: int = Field(gt=0, le=90)


@router.post("/ads/{ad_id}/makegood", summary="광고 노출 보전 — 계약 기간 연장 (#28, 플랫폼 귀책 미노출 전용)")
async def makegood_ad(
    ad_id: uuid.UUID,
    body: AdMakegoodRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    ad = await db.get(MarketplaceAd, ad_id)
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    if ad.ends_at is None:
        raise HTTPException(status_code=400, detail="ad has no ends_at to extend")

    prev_ends_at = ad.ends_at
    ad.ends_at = prev_ends_at + timedelta(days=body.extend_days)

    await audit(
        db,
        session,
        request,
        "BIZ_AD_MAKEGOOD",
        "marketplace_ad",
        str(ad_id),
        {
            "reason": body.reason,
            "extend_days": body.extend_days,
            "prev_ends_at": prev_ends_at.isoformat(),
            "new_ends_at": ad.ends_at.isoformat(),
            "approved_by": session.username,
        },
    )
    if ad.owner_id is not None:
        db.add(
            Notification(
                user_id=ad.owner_id,
                type="BIZ",
                title="광고 게재기간이 연장되었습니다",
                body=f"{body.reason} — {body.extend_days}일 연장 (신규 종료일: {ad.ends_at.date().isoformat()})",
            )
        )
    await db.commit()
    return {"id": ad.id, "prev_ends_at": prev_ends_at, "ends_at": ad.ends_at}


@router.post("/ads/{ad_id}/activate-subscription", summary="월구독 입금확인 후 게시 활성 (admin 전용)")
async def activate_biz_ad_subscription(
    ad_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        ad, bp = await AdsApplication(db).activate_subscription(ad_id)
    except AdsError as exc:
        raise _ads_error(exc) from exc

    await audit(db, session, request, "BIZ_AD_ACTIVATE_SUBSCRIPTION", "marketplace_ad", str(ad_id))
    await db.commit()

    if bp:
        await noti_events.publish(
            "biz.ad_reviewed",
            {"user_id": str(bp.user_id), "ad_id": str(ad.id), "ad_title": ad.title, "result": "SUBSCRIPTION_ACTIVE"},
        )
    return {"id": ad.id, "subscription_status": ad.subscription_status}
