"""admin JSON API — 유가 관리 (fuel_price_snapshot / fuel_price_fetch_log).

`admin_legacy.py`의 동명 Jinja 라우트(3190-3344)를 JSON 응답으로 이관한 것 —
ACTIVE 참고가 목록 조회, 수집 파이프라인 상태(노후도·fetch_log 이력), 운영자
수동 입력(upsert) 로직은 그대로 옮겼다. 구 `/admin-legacy/fuel` 라우트는 손대지
않고 병행 유지한다.
"""

from datetime import UTC, date, datetime, time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...jobs.fetch_fuel_prices import is_fetch_running, run_fetch_cycle
from ...models import FuelPriceFetchLog, FuelPriceSnapshot
from ...services.fuel_price_service import FUEL_BRANDS, FUEL_TYPES, upsert_fuel_price
from ._audit import audit

router = APIRouter(prefix="/fuel")


class FuelPriceRow(BaseModel):
    model_config = {"from_attributes": True}

    brand: str
    fuel_type: str
    price_vnd: int
    effective_date: date
    source: str


class FuelPriceUpsertRequest(BaseModel):
    brand: str
    fuel_type: str
    price_vnd: int = Field(ge=10_000, le=60_000)
    effective_date: date | None = None


class FuelFetchLogRow(BaseModel):
    model_config = {"from_attributes": True}

    source: str
    scheduled_at: datetime
    finished_at: datetime | None
    status: str | None
    items_found: int
    items_inserted: int
    error_message: str | None


class FuelPipelineHealth(BaseModel):
    stale_days: int | None
    latest_effective_date: date | None
    last_success_at: datetime | None
    consecutive_failures: int
    logs: list[FuelFetchLogRow]


@router.get("/meta", summary="브랜드/연료종류 허용값")
async def get_fuel_meta(_session: AdminSession = Depends(verify_admin_api)):
    return {"brands": list(FUEL_BRANDS), "fuel_types": list(FUEL_TYPES)}


@router.get("/prices", response_model=list[FuelPriceRow], summary="ACTIVE 참고가 목록")
async def list_fuel_prices(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        (
            await db.execute(
                select(FuelPriceSnapshot)
                .where(FuelPriceSnapshot.status == "ACTIVE")
                .order_by(FuelPriceSnapshot.brand, FuelPriceSnapshot.fuel_type)
            )
        )
        .scalars()
        .all()
    )
    return [FuelPriceRow.model_validate(r) for r in rows]


@router.post("/prices", response_model=FuelPriceRow, summary="유가 참고가 등록/수정 (upsert)")
async def upsert_fuel_price_api(
    body: FuelPriceUpsertRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if body.brand not in FUEL_BRANDS:
        raise HTTPException(status_code=400, detail=f"invalid brand (allowed: {list(FUEL_BRANDS)})")
    if body.fuel_type not in FUEL_TYPES:
        raise HTTPException(status_code=400, detail=f"invalid fuel_type (allowed: {list(FUEL_TYPES)})")

    effective_time = datetime.combine(body.effective_date, time.min, tzinfo=UTC) if body.effective_date else None

    await audit(
        db,
        session,
        request,
        "FUEL_PRICE_UPSERT",
        "fuel_price_snapshot",
        f"{body.brand}:{body.fuel_type}",
        {"price_vnd": body.price_vnd, "effective_date": str(body.effective_date) if body.effective_date else None},
    )
    # upsert_fuel_price 가 자체적으로 commit 함 — audit insert 도 같은 트랜잭션에 편승
    await upsert_fuel_price(
        db,
        brand=body.brand,
        fuel_type=body.fuel_type,
        price_vnd=body.price_vnd,
        effective_time=effective_time,
    )

    effective = effective_time or datetime.now(UTC)
    return FuelPriceRow(
        brand=body.brand,
        fuel_type=body.fuel_type,
        price_vnd=body.price_vnd,
        effective_date=effective.date(),
        source="manual:admin",
    )


@router.post("/refresh", status_code=202, summary="유가 수집 온디맨드 트리거")
async def trigger_fuel_refresh(
    background_tasks: BackgroundTasks,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """자동 수집 사이클(run_fetch_cycle)을 즉시 백그라운드로 1회 실행.

    이미 실행 중(스케줄러 or 다른 관리자 트리거)이면 409 — 동시실행 가드.
    """
    if is_fetch_running():
        raise HTTPException(status_code=409, detail="이미 수집이 진행 중입니다")

    await audit(db, session, request, "FUEL_FETCH_TRIGGER")
    await db.commit()

    background_tasks.add_task(run_fetch_cycle)
    return {"started": True}


@router.get("/pipeline-health", response_model=FuelPipelineHealth, summary="수집 파이프라인 상태")
async def get_fuel_pipeline_health(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """ACTIVE 참고가 최신 노후도 + fetch_log 성패 이력 (legacy 카드와 동일 로직)."""
    latest_eff = (
        await db.execute(select(func.max(FuelPriceSnapshot.effective_date)).where(FuelPriceSnapshot.status == "ACTIVE"))
    ).scalar_one_or_none()
    stale_days = (datetime.now(UTC).date() - latest_eff).days if latest_eff else None

    logs = (
        (await db.execute(select(FuelPriceFetchLog).order_by(FuelPriceFetchLog.scheduled_at.desc()).limit(8)))
        .scalars()
        .all()
    )
    last_success_at = next((lg.scheduled_at for lg in logs if lg.status == "SUCCESS"), None)
    consecutive_failures = 0
    for lg in logs:
        if lg.status == "SUCCESS":
            break
        consecutive_failures += 1

    return FuelPipelineHealth(
        stale_days=stale_days,
        latest_effective_date=latest_eff,
        last_success_at=last_success_at,
        consecutive_failures=consecutive_failures,
        logs=[FuelFetchLogRow.model_validate(lg) for lg in logs],
    )
