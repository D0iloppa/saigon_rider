"""admin JSON API — POI 단건 CRUD + 카테고리 조회.

`/admin-legacy/poi/bulk`(스크립트 전용 upsert, `admin_legacy.py:4452`)는 그대로 유지한다.
이 라우터는 그동안 없었던 "사람이 쓰는" 단건 조회/등록/수정/게시해제만 추가한다
(설계문서 `260720_neighborhood_map_module_task.md` §4.2). 카테고리 생성/수정 API는
범위 밖 — 조회(드롭다운용)만 제공한다.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....admin_auth import AdminSession, verify_admin_api
from ....database import get_db
from ....models import Poi, PoiCategory
from ....schemas import Page
from ....utils import build_imgproxy_url
from .._audit import audit

router = APIRouter()


class PoiCategoryOut(BaseModel):
    code: str
    label_ko: str
    label_vi: str
    label_en: str
    icon: str
    sort_order: int


class PoiRow(BaseModel):
    id: uuid.UUID
    category: str
    name_ko: str
    name_vi: str | None
    name_en: str | None
    description: str | None
    address: str | None
    lat: Decimal
    lng: Decimal
    photo_content_id: uuid.UUID | None
    photo_url: str | None
    published: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class PoiWriteRequest(BaseModel):
    category: str
    name_ko: str
    name_vi: str | None = None
    name_en: str | None = None
    description: str | None = None
    address: str | None = None
    lat: Decimal
    lng: Decimal
    photo_content_id: uuid.UUID | None = None
    published: bool = True
    sort_order: int = 0


def _poi_row(p: Poi) -> PoiRow:
    return PoiRow(
        id=p.id,
        category=p.category,
        name_ko=p.name_ko,
        name_vi=p.name_vi,
        name_en=p.name_en,
        description=p.description,
        address=p.address,
        lat=p.latitude,
        lng=p.longitude,
        photo_content_id=p.photo_content_id,
        photo_url=build_imgproxy_url(p.photo_content.file_path) if p.photo_content else None,
        published=p.published,
        sort_order=p.sort_order,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


async def _validate_category(db: AsyncSession, category: str) -> None:
    if await db.get(PoiCategory, category) is None:
        raise HTTPException(status_code=400, detail="invalid category")


@router.get("/poi-categories", response_model=list[PoiCategoryOut], summary="POI 카테고리 목록 (드롭다운용)")
async def list_poi_categories(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        (await db.execute(select(PoiCategory).where(PoiCategory.is_active == True).order_by(PoiCategory.sort_order)))
        .scalars()
        .all()
    )
    return [
        PoiCategoryOut(
            code=c.code,
            label_ko=c.label_ko,
            label_vi=c.label_vi,
            label_en=c.label_en,
            icon=c.icon,
            sort_order=c.sort_order,
        )
        for c in rows
    ]


@router.get("/poi", response_model=Page[PoiRow], summary="POI 목록")
async def list_poi(
    category: str | None = Query(None),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Poi)
    count_stmt = select(func.count()).select_from(Poi)
    if category:
        stmt = stmt.where(Poi.category == category)
        count_stmt = count_stmt.where(Poi.category == category)
    if q:
        name_filter = or_(Poi.name_ko.ilike(f"%{q}%"), Poi.name_vi.ilike(f"%{q}%"), Poi.name_en.ilike(f"%{q}%"))
        stmt = stmt.where(name_filter)
        count_stmt = count_stmt.where(name_filter)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (
        (await db.execute(stmt.order_by(Poi.created_at.desc(), Poi.id.desc()).offset((page - 1) * size).limit(size)))
        .scalars()
        .all()
    )
    return Page(items=[_poi_row(p) for p in rows], total=total, page=page, size=size)


@router.get("/poi/{poi_id}", response_model=PoiRow, summary="POI 단건 조회")
async def get_poi(
    poi_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    poi = await db.get(Poi, poi_id)
    if poi is None:
        raise HTTPException(status_code=404, detail="POI not found")
    return _poi_row(poi)


@router.post("/poi", response_model=PoiRow, status_code=201, summary="POI 단건 생성")
async def create_poi(
    body: PoiWriteRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    await _validate_category(db, body.category)

    poi = Poi(
        category=body.category,
        name_ko=body.name_ko,
        name_vi=body.name_vi,
        name_en=body.name_en,
        description=body.description,
        address=body.address,
        latitude=body.lat,
        longitude=body.lng,
        photo_content_id=body.photo_content_id,
        published=body.published,
        sort_order=body.sort_order,
    )
    db.add(poi)
    await db.flush()

    await audit(db, session, request, "POI_CREATE", "poi", str(poi.id), {"name_ko": poi.name_ko})
    await db.commit()
    await db.refresh(poi)
    return _poi_row(poi)


@router.put("/poi/{poi_id}", response_model=PoiRow, summary="POI 수정")
async def update_poi(
    poi_id: uuid.UUID,
    body: PoiWriteRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    poi = await db.get(Poi, poi_id)
    if poi is None:
        raise HTTPException(status_code=404, detail="POI not found")
    await _validate_category(db, body.category)

    poi.category = body.category
    poi.name_ko = body.name_ko
    poi.name_vi = body.name_vi
    poi.name_en = body.name_en
    poi.description = body.description
    poi.address = body.address
    poi.latitude = body.lat
    poi.longitude = body.lng
    poi.photo_content_id = body.photo_content_id
    poi.published = body.published
    poi.sort_order = body.sort_order
    poi.updated_at = datetime.now(UTC)

    await audit(db, session, request, "POI_UPDATE", "poi", str(poi_id), {"name_ko": poi.name_ko})
    await db.commit()
    await db.refresh(poi)
    return _poi_row(poi)


@router.put("/poi/{poi_id}/unpublish", response_model=PoiRow, summary="POI 게시 해제 (소프트)")
async def unpublish_poi(
    poi_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    poi = await db.get(Poi, poi_id)
    if poi is None:
        raise HTTPException(status_code=404, detail="POI not found")

    poi.published = False
    poi.updated_at = datetime.now(UTC)

    await audit(db, session, request, "POI_UNPUBLISH", "poi", str(poi_id), None)
    await db.commit()
    await db.refresh(poi)
    return _poi_row(poi)
