"""admin JSON API — 제보심사 3종 (장소 제안 / 주유소 제보 / 정비소 제보).

`admin_legacy.py`의 동명 Jinja 라우트(장소 3572-3661, 주유소 3299-3417, 정비소
3440-3557 부근)를 JSON 응답으로 이관한 것 — PENDING→CONFIRMED/REJECTED 상태
전이 로직은 그대로 옮겼다. 구 `/admin-legacy/*` 라우트는 손대지 않고 병행 유지한다.

- 장소 제안 승인은 상태 전환만 한다(`PlaceSubmission` docstring 그대로 — Poi 자동
  승격은 이번 범위 밖).
- 주유소/정비소 제보 승인은 기존과 동일하게 canonical 테이블(`GasStation`/`RepairShop`)
  row를 실제로 생성한다.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ....admin_auth import AdminSession, verify_admin_api
from ....database import get_db
from ....models import GasStation, GasStationSubmission, PlaceSubmission, RepairShop, RepairShopSubmission
from ....schemas import PlaceSuggestionOut
from .._audit import audit

router = APIRouter()

_SUBMISSION_STATUSES = {"PENDING", "CONFIRMED", "REJECTED"}


class PlaceSuggestionRejectRequest(BaseModel):
    review_note: str


class SubmissionRejectRequest(BaseModel):
    review_note: str | None = None


class GasSubmissionRow(BaseModel):
    submission_id: int
    name: str
    lat: Decimal
    lng: Decimal
    phone: str | None
    brand: str | None
    brand_normalized: str | None
    district_code: str | None
    note: str | None
    reporter_user_id: uuid.UUID | None
    status: str
    review_note: str | None
    reviewed_at: datetime | None
    resulting_station_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RepairSubmissionRow(BaseModel):
    submission_id: int
    name: str
    lat: Decimal
    lng: Decimal
    phone: str | None
    district_code: str | None
    note: str | None
    reporter_user_id: uuid.UUID | None
    status: str
    review_note: str | None
    reviewed_at: datetime | None
    resulting_shop_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


def _validate_status(status: str | None) -> None:
    if status is not None and status not in _SUBMISSION_STATUSES:
        raise HTTPException(status_code=400, detail="invalid status")


# ── 장소 제안 ─────────────────────────────────────────────────────


@router.get("/place-suggestions", response_model=list[PlaceSuggestionOut], summary="장소 제안 목록")
async def list_place_suggestions(
    status: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_status(status)
    stmt = select(PlaceSubmission)
    if status:
        stmt = stmt.where(PlaceSubmission.status == status)
    rows = (await db.execute(stmt.order_by(PlaceSubmission.created_at.desc()))).scalars().all()
    return rows


async def _get_place_submission_or_404(db: AsyncSession, submission_id: int) -> PlaceSubmission:
    sub = await db.get(PlaceSubmission, submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Place suggestion not found")
    return sub


@router.post("/place-suggestions/{submission_id}/confirm", response_model=PlaceSuggestionOut, summary="장소 제안 승인")
async def confirm_place_suggestion(
    submission_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_place_submission_or_404(db, submission_id)
    if sub.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    sub.status = "CONFIRMED"
    sub.reviewed_at = datetime.now(UTC)

    await audit(db, session, request, "PLACE_SUGGESTION_CONFIRM", "place_submission", str(submission_id))
    await db.commit()
    await db.refresh(sub)
    return sub


@router.post("/place-suggestions/{submission_id}/reject", response_model=PlaceSuggestionOut, summary="장소 제안 반려")
async def reject_place_suggestion(
    submission_id: int,
    body: PlaceSuggestionRejectRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if not body.review_note.strip():
        raise HTTPException(status_code=400, detail="review_note is required")

    sub = await _get_place_submission_or_404(db, submission_id)
    if sub.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    sub.status = "REJECTED"
    sub.review_note = body.review_note.strip()
    sub.reviewed_at = datetime.now(UTC)

    await audit(
        db,
        session,
        request,
        "PLACE_SUGGESTION_REJECT",
        "place_submission",
        str(submission_id),
        {"review_note": sub.review_note},
    )
    await db.commit()
    await db.refresh(sub)
    return sub


# ── 주유소 제보 ───────────────────────────────────────────────────


@router.get("/gas-submissions", response_model=list[GasSubmissionRow], summary="주유소 제보 목록")
async def list_gas_submissions(
    status: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_status(status)
    stmt = select(GasStationSubmission)
    if status:
        stmt = stmt.where(GasStationSubmission.status == status)
    rows = (await db.execute(stmt.order_by(GasStationSubmission.created_at.desc()))).scalars().all()
    return rows


async def _get_gas_submission_or_404(db: AsyncSession, submission_id: int) -> GasStationSubmission:
    sub = await db.get(GasStationSubmission, submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Gas station submission not found")
    return sub


@router.post(
    "/gas-submissions/{submission_id}/confirm",
    response_model=GasSubmissionRow,
    summary="주유소 제보 승인 (GasStation 생성)",
)
async def confirm_gas_submission(
    submission_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_gas_submission_or_404(db, submission_id)
    if sub.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    # 기존 admin_legacy.admin_gas_submission_confirm 로직 그대로 이관 — canonical upsert
    station = GasStation(
        name=sub.name,
        lat=sub.lat,
        lng=sub.lng,
        phone=sub.phone,
        brand=sub.brand,
        brand_normalized=sub.brand_normalized,
        district_code=sub.district_code,
        source_type="USER_REPORTED",
        status="ACTIVE",
        verified_at=datetime.now(UTC),
    )
    db.add(station)
    await db.flush()

    sub.status = "CONFIRMED"
    sub.resulting_station_id = station.station_id
    sub.reviewed_at = datetime.now(UTC)

    await audit(
        db,
        session,
        request,
        "GAS_SUBMISSION_CONFIRM",
        "gas_station_submission",
        str(submission_id),
        {"resulting_station_id": station.station_id},
    )
    await db.commit()
    await db.refresh(sub)
    return sub


@router.post("/gas-submissions/{submission_id}/reject", response_model=GasSubmissionRow, summary="주유소 제보 반려")
async def reject_gas_submission(
    submission_id: int,
    body: SubmissionRejectRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_gas_submission_or_404(db, submission_id)
    if sub.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    sub.status = "REJECTED"
    sub.review_note = (body.review_note or "").strip() or "반려"
    sub.reviewed_at = datetime.now(UTC)

    await audit(
        db,
        session,
        request,
        "GAS_SUBMISSION_REJECT",
        "gas_station_submission",
        str(submission_id),
        {"review_note": sub.review_note},
    )
    await db.commit()
    await db.refresh(sub)
    return sub


# ── 정비소 제보 ───────────────────────────────────────────────────


@router.get("/repair-submissions", response_model=list[RepairSubmissionRow], summary="정비소 제보 목록")
async def list_repair_submissions(
    status: str | None = Query(None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_status(status)
    stmt = select(RepairShopSubmission)
    if status:
        stmt = stmt.where(RepairShopSubmission.status == status)
    rows = (await db.execute(stmt.order_by(RepairShopSubmission.created_at.desc()))).scalars().all()
    return rows


async def _get_repair_submission_or_404(db: AsyncSession, submission_id: int) -> RepairShopSubmission:
    sub = await db.get(RepairShopSubmission, submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Repair shop submission not found")
    return sub


@router.post(
    "/repair-submissions/{submission_id}/confirm",
    response_model=RepairSubmissionRow,
    summary="정비소 제보 승인 (RepairShop 생성)",
)
async def confirm_repair_submission(
    submission_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_repair_submission_or_404(db, submission_id)
    if sub.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    # 기존 admin_legacy.admin_repair_submission_confirm 로직 그대로 이관 — canonical upsert
    shop = RepairShop(
        name=sub.name,
        lat=sub.lat,
        lng=sub.lng,
        phone=sub.phone,
        district_code=sub.district_code,
        is_verified=True,
        status="ACTIVE",
        added_by_user_id=sub.reporter_user_id,
    )
    db.add(shop)
    await db.flush()

    sub.status = "CONFIRMED"
    sub.resulting_shop_id = shop.shop_id
    sub.reviewed_at = datetime.now(UTC)

    await audit(
        db,
        session,
        request,
        "REPAIR_SUBMISSION_CONFIRM",
        "repair_shop_submission",
        str(submission_id),
        {"resulting_shop_id": shop.shop_id},
    )
    await db.commit()
    await db.refresh(sub)
    return sub


@router.post(
    "/repair-submissions/{submission_id}/reject", response_model=RepairSubmissionRow, summary="정비소 제보 반려"
)
async def reject_repair_submission(
    submission_id: int,
    body: SubmissionRejectRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_repair_submission_or_404(db, submission_id)
    if sub.status != "PENDING":
        raise HTTPException(status_code=409, detail="already processed")

    sub.status = "REJECTED"
    sub.review_note = (body.review_note or "").strip() or "반려"
    sub.reviewed_at = datetime.now(UTC)

    await audit(
        db,
        session,
        request,
        "REPAIR_SUBMISSION_REJECT",
        "repair_shop_submission",
        str(submission_id),
        {"review_note": sub.review_note},
    )
    await db.commit()
    await db.refresh(sub)
    return sub
