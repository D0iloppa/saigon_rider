import contextlib
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import RepairReview, RepairShop, RepairShopSubmission
from ..services.redis_cache import cache_get, cache_set

router = APIRouter(prefix="/info/repair", tags=["Info — 정비소"])


# ── XP helper ──────────────────────────────────────────────────────────────


async def _earn_gp_safe(user_id: uuid.UUID, action_code: str, idem_key: str, payload: dict | None = None) -> None:
    with contextlib.suppress(Exception):
        await engine_client.post_event(
            user_uuid=str(user_id),
            action_code=action_code,
            occurred_at=datetime.now(UTC),
            payload=payload or {},
            idem_key=idem_key,
        )


# ── Schemas ─────────────────────────────────────────────────────────────────


class RepairShopReportCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    lat: float
    lng: float
    phone: str | None = Field(None, max_length=30)
    note: str | None = Field(None, max_length=500)


class ReviewCreate(BaseModel):
    shop_id: int
    service_code: str | None = None
    motorcycle_model: str | None = None
    rating: int = Field(..., ge=1, le=5)
    price_vnd: int | None = Field(None, ge=0)
    comment: str | None = Field(None, max_length=500)
    photo_url: str | None = None
    is_anonymous: bool = False


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/nearby")
async def get_nearby_repair_shops(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    service_code: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"repair:nearby:{round(lat, 3)}:{round(lng, 3)}:{radius_km}:{service_code or '_'}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    result = await db.execute(
        text("""
            SELECT
                rs.shop_id,
                rs.name,
                CAST(rs.lat AS FLOAT) AS lat,
                CAST(rs.lng AS FLOAT) AS lng,
                rs.district_code,
                rs.street_name,
                rs.phone,
                rs.opening_hours,
                rs.brand_focus,
                rs.is_verified,
                ST_Distance(
                    rs.geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                ) / 1000.0 AS distance_km,
                COALESCE(st.review_count, 0) AS review_count,
                st.avg_rating,
                st.avg_price,
                st.last_review_at
            FROM repair_shop rs
            LEFT JOIN repair_shop_stats st USING (shop_id)
            WHERE rs.status = 'ACTIVE'
              AND ST_DWithin(
                    rs.geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius_m
                  )
              AND (CAST(:service_code AS TEXT) IS NULL OR EXISTS (
                    SELECT 1 FROM repair_review
                    WHERE shop_id = rs.shop_id AND service_code = CAST(:service_code AS TEXT) AND flagged = FALSE
              ))
            ORDER BY
                COALESCE(st.review_count, 0) DESC,
                distance_km
            LIMIT 300
        """),
        {"lat": lat, "lng": lng, "radius_m": radius_km * 1000, "service_code": service_code},
    )

    shops = []
    for row in result:
        r = dict(row._mapping)
        if r.get("avg_rating") is not None:
            r["avg_rating"] = float(r["avg_rating"])
        if r.get("avg_price") is not None:
            r["avg_price"] = int(r["avg_price"])
        shops.append(r)

    response = {"shops": shops}
    await cache_set(cache_key, response, ttl=600)
    return response


@router.post("/report", status_code=201)
async def report_new_shop(
    body: RepairShopReportCreate,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    """신규 정비소 제보. repair_shop 에 직접 쓰지 않고 대기큐(PENDING)에 적재 →
    admin 수동 검증(confirm) 시에만 repair_shop 으로 upsert."""
    submission = RepairShopSubmission(
        name=body.name.strip(),
        lat=body.lat,
        lng=body.lng,
        phone=body.phone,
        note=body.note,
        reporter_user_id=user_id,
        status="PENDING",
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return {"submission_id": submission.submission_id, "status": submission.status}


@router.get("/{shop_id}")
async def get_repair_shop_detail(
    shop_id: int,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    shop = await db.get(RepairShop, shop_id)
    if not shop:
        raise HTTPException(404, "Shop not found")

    # Stats from materialized view
    stats_row = await db.execute(
        text("SELECT * FROM repair_shop_stats WHERE shop_id = :shop_id"),
        {"shop_id": shop_id},
    )
    stats_data = stats_row.mappings().first()
    stats: dict | None = dict(stats_data) if stats_data else None
    if stats:
        if stats.get("avg_rating") is not None:
            stats["avg_rating"] = float(stats["avg_rating"])
        if stats.get("avg_price") is not None:
            stats["avg_price"] = int(stats["avg_price"])

    # Price by service (median, last 1 year)
    price_rows = await db.execute(
        text("""
            SELECT service_code,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY price_vnd) AS median_price
            FROM repair_review
            WHERE shop_id = :shop_id AND price_vnd IS NOT NULL
              AND reviewed_at > NOW() - INTERVAL '1 year'
              AND flagged = FALSE
            GROUP BY service_code
        """),
        {"shop_id": shop_id},
    )
    price_by_service = {
        row.service_code: (float(row.median_price) if row.median_price is not None else None) for row in price_rows
    }

    # Recent reviews (limit 10)
    review_rows = await db.execute(
        text("""
            SELECT rr.review_id, rr.service_code, rr.motorcycle_model,
                   rr.rating, rr.price_vnd, rr.comment, rr.photo_url,
                   rr.is_anonymous, rr.reviewed_at, rr.upvotes,
                   CASE WHEN rr.is_anonymous THEN NULL ELSE u.nickname END AS reviewer_nickname
            FROM repair_review rr
            LEFT JOIN users u ON u.id = rr.reviewer_user_id
            WHERE rr.shop_id = :shop_id AND rr.flagged = FALSE
            ORDER BY rr.reviewed_at DESC
            LIMIT 10
        """),
        {"shop_id": shop_id},
    )
    recent_reviews = [dict(row._mapping) for row in review_rows]

    shop_dict = {
        "shop_id": int(shop.shop_id),
        "name": shop.name,
        "lat": float(shop.lat),
        "lng": float(shop.lng),
        "district_code": shop.district_code,
        "street_name": shop.street_name,
        "phone": shop.phone,
        "opening_hours": shop.opening_hours,
        "brand_focus": shop.brand_focus,
        "is_verified": shop.is_verified,
        "status": shop.status,
    }

    return {
        "shop": shop_dict,
        "stats": stats,
        "price_by_service": price_by_service,
        "recent_reviews": recent_reviews,
    }


@router.get("/{shop_id}/reviews")
async def list_repair_shop_reviews(
    shop_id: int,
    limit: int = 20,
    offset: int = 0,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    """정비소 전체 리뷰 목록 (페이지네이션). 상세 화면의 '전체 보기'에서 사용."""
    limit = max(1, min(limit, 50))
    offset = max(0, offset)
    total = (
        await db.scalar(
            select(func.count())
            .select_from(RepairReview)
            .where(RepairReview.shop_id == shop_id, RepairReview.flagged == False)
        )
        or 0
    )

    rows = await db.execute(
        text("""
            SELECT rr.review_id, rr.service_code, rr.motorcycle_model,
                   rr.rating, rr.price_vnd, rr.comment, rr.photo_url,
                   rr.is_anonymous, rr.reviewed_at, rr.upvotes,
                   CASE WHEN rr.is_anonymous THEN NULL ELSE u.nickname END AS reviewer_nickname
            FROM repair_review rr
            LEFT JOIN users u ON u.id = rr.reviewer_user_id
            WHERE rr.shop_id = :shop_id AND rr.flagged = FALSE
            ORDER BY rr.reviewed_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"shop_id": shop_id, "limit": limit, "offset": offset},
    )
    reviews = [dict(row._mapping) for row in rows]
    return {
        "reviews": reviews,
        "total": int(total),
        "has_more": offset + len(reviews) < int(total),
    }


@router.post("/review", status_code=201)
async def create_repair_review(
    body: ReviewCreate,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
):
    # Duplicate check
    existing = await db.scalar(
        select(RepairReview).where(
            RepairReview.shop_id == body.shop_id,
            RepairReview.reviewer_user_id == user_id,
            RepairReview.service_code == body.service_code,
        )
    )
    if existing:
        raise HTTPException(409, "Already reviewed this shop for this service")

    review = RepairReview(
        shop_id=body.shop_id,
        reviewer_user_id=user_id,
        service_code=body.service_code,
        motorcycle_model=body.motorcycle_model,
        rating=body.rating,
        price_vnd=body.price_vnd,
        comment=body.comment,
        photo_url=body.photo_url,
        is_anonymous=body.is_anonymous,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)

    # Refresh materialized view (best-effort)
    try:
        await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY repair_shop_stats"))
        await db.commit()
    except Exception:
        pass

    # RP(gc) 적립 — action_definition.rp_grant 기반 (sre051: REVIEW 50 / PHOTO 10 / PRICE 10)
    rp_earned = 0

    await _earn_gp_safe(
        user_id,
        "INFO_REPAIR_REVIEW",
        f"repair-review-{user_id}-{review.review_id}",
    )
    rp_earned = 50

    if body.photo_url:
        await _earn_gp_safe(
            user_id,
            "INFO_REPAIR_PHOTO",
            f"repair-photo-{user_id}-{review.review_id}",
        )
        rp_earned += 10

    if body.price_vnd is not None:
        await _earn_gp_safe(
            user_id,
            "INFO_REPAIR_PRICE",
            f"repair-price-{user_id}-{review.review_id}",
        )
        rp_earned += 10

    return {"review_id": review.review_id, "rp_earned": rp_earned}
