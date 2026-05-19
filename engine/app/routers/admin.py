from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text as sa_text

from app.database import AsyncSession
from app.deps import get_session, verify_admin_jwt, verify_service_key
from app.enums import TxTypeEnum
from app.exceptions import InsufficientBalanceError
from app.models import (
    ActionDefinition, AuditLog, DailyFeaturedItem, GachaDefinition,
    ItemDefinition, RpTransaction, SreUser, UserTier,
)
from app.schemas import (
    AdminAdjustCreate, AuditEntryRead,
    TransactionRead, UserSummary,
)
from app.services import audit as audit_svc
from app.services import point_ledger

router = APIRouter(prefix="/v1/admin", tags=["admin"])

_admin = Depends(verify_admin_jwt)
_svc = Depends(verify_service_key)


# ── 직렬화 헬퍼 ───────────────────────────────────────────

def _gacha_to_dict(g: GachaDefinition) -> dict:
    return {
        "gacha_code": g.gacha_code,
        "display_name": g.display_name,
        "description": g.description,
        "cost_currency": g.cost_currency,
        "cost_per_pull": g.cost_per_pull,
        "cost_per_10_pull": g.cost_per_10_pull,
        "collection_filter": g.collection_filter,
        "drop_table": g.drop_table,
        "pity_threshold": g.pity_threshold,
        "pity_guarantee_rarity": g.pity_guarantee_rarity.value if g.pity_guarantee_rarity else None,
        "pity_resets_with_season": g.pity_resets_with_season,
        "starts_at": g.starts_at.isoformat() if g.starts_at else None,
        "ends_at": g.ends_at.isoformat() if g.ends_at else None,
        "required_season_code": g.required_season_code,
        "status": g.status.value if g.status else None,
        "is_listed": g.is_listed,
        "sort_order": g.sort_order,
    }


def _item_to_dict(i: ItemDefinition) -> dict:
    return {
        "item_code": i.item_code,
        "display_name": i.display_name,
        "slot": i.slot.value if i.slot else None,
        "rarity": i.rarity.value if i.rarity else None,
        "collection_code": i.collection_code,
        "shop_price_gp": i.shop_price_gp,
        "shop_price_gc": i.shop_price_gc,
        "is_shop_visible": i.is_shop_visible,
        "season_lock": i.season_lock,
        "required_season_code": i.required_season_code,
        "asset_uri": i.asset_uri,
    }


# ── 액션 정의 ─────────────────────────────────────────────


@router.get("/action-definitions", dependencies=[_admin])
async def list_action_definitions(
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    result = await db.execute(select(ActionDefinition))
    defs = result.scalars().all()
    return [
        {
            "action_code": d.action_code,
            "category_code": d.category_code,
            "display_name": d.display_name,
            "base_rp": d.base_rp,
            "daily_count_limit": d.daily_count_limit,
            "is_active": d.is_active,
            "metadata_schema": d.metadata_schema,
            "updated_at": d.updated_at,
        }
        for d in defs
    ]


@router.post("/action-definitions", status_code=status.HTTP_201_CREATED,
             dependencies=[_admin])
async def create_action_definition(
    data: dict,
    db: AsyncSession = Depends(get_session),
) -> dict:
    action = ActionDefinition(**data)
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return {"action_code": action.action_code, "created": True}


@router.put("/action-definitions/{action_code}", dependencies=[_admin])
async def update_action_definition(
    action_code: str,
    data: dict,
    db: AsyncSession = Depends(get_session),
) -> dict:
    action = await db.get(ActionDefinition, action_code)
    if action is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    for k, v in data.items():
        if hasattr(action, k) and k != "action_code":
            setattr(action, k, v)
    await db.commit()
    return {"action_code": action_code, "updated": True}


# ── 사용자 조회 ───────────────────────────────────────────


@router.get("/users/{user_id}", response_model=UserSummary,
            dependencies=[_admin])
async def get_user_summary(
    user_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.models import RpBalance
    user = await db.get(SreUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    balance = await db.get(RpBalance, user_id)
    tier = await db.get(UserTier, user_id)
    return {
        "user_id": user.user_id,
        "external_user_uuid": user.external_user_uuid,
        "account_type": user.account_type,
        "is_driver_verified": user.is_driver_verified,
        "status": user.status,
        "created_at": user.created_at,
        "current_balance": balance.current_balance if balance else 0,
        "current_tier_code": tier.current_tier_code if tier else None,
    }


# ── RP 조정 ───────────────────────────────────────────────


@router.post("/users/{user_id}/adjust", response_model=TransactionRead,
             dependencies=[_admin])
async def adjust_balance(
    user_id: int,
    data: AdminAdjustCreate,
    admin: dict = _admin,
    db: AsyncSession = Depends(get_session),
) -> RpTransaction:
    if data.tx_type not in (TxTypeEnum.ADJUST_PLUS, TxTypeEnum.ADJUST_MINUS):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="tx_type must be ADJUST_PLUS or ADJUST_MINUS")
    try:
        tx = await point_ledger.admin_adjust(
            db,
            user_id=user_id,
            amount=data.amount,
            tx_type=data.tx_type,
            actor_user_id=admin.get("sub"),
            memo=data.memo,
        )
        await audit_svc.record(
            db,
            entity_type="rp_balance",
            entity_id=user_id,
            actor_user_id=admin.get("sub"),
            action_code=data.tx_type.value,
            after={"amount": data.amount, "memo": data.memo},
        )
        await db.commit()
        return tx
    except InsufficientBalanceError as e:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(e))


# ── 감사 로그 ─────────────────────────────────────────────


@router.get("/audit-logs", response_model=list[AuditEntryRead],
            dependencies=[_admin])
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list:
    query = select(AuditLog)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    query = query.order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


# ── 가챠 관리 (BFF admin 전용, service key 인증) ──────────────────


@router.get("/gacha/definitions", dependencies=[_svc])
async def admin_gacha_list(db: AsyncSession = Depends(get_session)) -> list[dict]:
    result = await db.execute(
        select(GachaDefinition).order_by(
            GachaDefinition.sort_order.nullslast(), GachaDefinition.created_at
        )
    )
    return [_gacha_to_dict(g) for g in result.scalars().all()]


@router.put("/gacha/definitions/{gacha_code}", dependencies=[_svc])
async def admin_gacha_update(
    gacha_code: str,
    data: dict,
    db: AsyncSession = Depends(get_session),
) -> dict:
    g = await db.get(GachaDefinition, gacha_code)
    if g is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gacha not found")
    _EDITABLE_GACHA = {
        "display_name", "description", "cost_per_pull", "cost_per_10_pull",
        "drop_table", "pity_threshold", "starts_at", "ends_at",
        "status", "is_listed", "sort_order",
    }
    for k, v in data.items():
        if k in _EDITABLE_GACHA:
            setattr(g, k, v)
    await db.commit()
    await db.refresh(g)
    return _gacha_to_dict(g)


# ── 아이템 정의 CRUD ──────────────────────────────────────────────

_ITEM_EDITABLE = {
    "display_name", "slot", "rarity", "collection_code", "asset_uri",
    "shop_price_gp", "shop_price_gc", "is_shop_visible", "season_lock",
    "required_season_code",
}


@router.get("/items", dependencies=[_svc])
async def admin_item_list(db: AsyncSession = Depends(get_session)) -> list[dict]:
    result = await db.execute(
        select(ItemDefinition).order_by(
            ItemDefinition.collection_code.nullslast(),
            ItemDefinition.rarity,
            ItemDefinition.item_code,
        )
    )
    return [_item_to_dict(i) for i in result.scalars().all()]


@router.get("/items/{item_code}", dependencies=[_svc])
async def admin_item_get(item_code: str, db: AsyncSession = Depends(get_session)) -> dict:
    item = await db.get(ItemDefinition, item_code)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return _item_to_dict(item)


@router.post("/items", status_code=status.HTTP_201_CREATED, dependencies=[_svc])
async def admin_item_create(data: dict, db: AsyncSession = Depends(get_session)) -> dict:
    if not data.get("item_code"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="item_code required")
    if await db.get(ItemDefinition, data["item_code"]) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="item_code already exists")
    allowed = {"item_code"} | _ITEM_EDITABLE
    item = ItemDefinition(**{k: v for k, v in data.items() if k in allowed})
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _item_to_dict(item)


@router.put("/items/{item_code}", dependencies=[_svc])
async def admin_item_update(
    item_code: str, data: dict, db: AsyncSession = Depends(get_session)
) -> dict:
    item = await db.get(ItemDefinition, item_code)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    for k, v in data.items():
        if k in _ITEM_EDITABLE:
            setattr(item, k, v)
    await db.commit()
    await db.refresh(item)
    return _item_to_dict(item)


@router.delete("/items/{item_code}", dependencies=[_svc])
async def admin_item_delete(item_code: str, db: AsyncSession = Depends(get_session)) -> dict:
    from app.models import UserItem  # noqa: PLC0415
    item = await db.get(ItemDefinition, item_code)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    owned = (await db.execute(select(func.count()).where(UserItem.item_code == item_code))).scalar() or 0
    if owned > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete: {owned} user(s) own this item",
        )
    await db.delete(item)
    await db.commit()
    return {"deleted": True, "item_code": item_code}


# ── 상점 관리 (BFF admin 전용) ────────────────────────────────────


@router.get("/shop/items", dependencies=[_svc])
async def admin_shop_items(db: AsyncSession = Depends(get_session)) -> list[dict]:
    result = await db.execute(
        select(ItemDefinition).order_by(
            ItemDefinition.collection_code, ItemDefinition.rarity, ItemDefinition.item_code
        )
    )
    return [_item_to_dict(i) for i in result.scalars().all()]


@router.put("/shop/items/{item_code}", dependencies=[_svc])
async def admin_shop_item_update(
    item_code: str,
    data: dict,
    db: AsyncSession = Depends(get_session),
) -> dict:
    item = await db.get(ItemDefinition, item_code)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    _EDITABLE_ITEM = {
        "shop_price_gp", "shop_price_gc", "is_shop_visible",
        "season_lock", "required_season_code",
    }
    for k, v in data.items():
        if k in _EDITABLE_ITEM:
            setattr(item, k, v)
    await db.commit()
    await db.refresh(item)
    return _item_to_dict(item)


# ── 일일 추천 관리 ────────────────────────────────────────────────


@router.get("/shop/daily-featured", dependencies=[_svc])
async def admin_daily_featured_history(db: AsyncSession = Depends(get_session)) -> list[dict]:
    result = await db.execute(
        select(DailyFeaturedItem)
        .order_by(DailyFeaturedItem.featured_date.desc(), DailyFeaturedItem.sort_order)
        .limit(60)
    )
    return [
        {
            "featured_date": str(r.featured_date),
            "item_code": r.item_code,
            "discount_pct": r.discount_pct,
            "sort_order": r.sort_order,
            "item_name": r.item_def.display_name if r.item_def else r.item_code,
        }
        for r in result.scalars().all()
    ]


@router.post("/shop/daily-featured/refresh", dependencies=[_svc])
async def admin_daily_featured_refresh(
    data: dict,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """특정 날짜의 일일 추천 아이템 교체.
    body: {"date": "YYYY-MM-DD", "items": [{"item_code": ..., "discount_pct": 30, "sort_order": 0}]}
    """
    target_date = date.fromisoformat(data["date"])
    items = data.get("items", [])
    await db.execute(
        DailyFeaturedItem.__table__.delete().where(
            DailyFeaturedItem.featured_date == target_date
        )
    )
    for idx, item_data in enumerate(items):
        db.add(
            DailyFeaturedItem(
                featured_date=target_date,
                item_code=item_data["item_code"],
                discount_pct=item_data.get("discount_pct", 30),
                sort_order=item_data.get("sort_order", idx),
            )
        )
    await db.commit()
    return {"date": str(target_date), "count": len(items)}


# ── 운영 대시보드 쿼리 (기획서 §7) ───────────────────────────────


@router.get("/ops/daily-net", dependencies=[_svc])
async def admin_ops_daily_net(db: AsyncSession = Depends(get_session)) -> list[dict]:
    """일일 GP/GC 발행/소모 — 인플레 모니터링 (최근 7일)."""
    sql = sa_text("""
        SELECT
          DATE(occurred_at) AS day,
          currency,
          SUM(amount) FILTER (WHERE tx_type = 'EARN')  AS earned,
          SUM(amount) FILTER (WHERE tx_type = 'SPEND') AS spent,
          SUM(amount) FILTER (WHERE tx_type = 'EARN')
            - SUM(amount) FILTER (WHERE tx_type = 'SPEND') AS net
        FROM rp_transaction
        WHERE occurred_at >= NOW() - INTERVAL '7 days'
        GROUP BY day, currency
        ORDER BY day DESC, currency
    """)
    result = await db.execute(sql)
    return [
        {
            "day": str(row.day),
            "currency": row.currency,
            "earned": int(row.earned or 0),
            "spent": int(row.spent or 0),
            "net": int(row.net or 0),
        }
        for row in result.all()
    ]


@router.get("/ops/gacha-roi", dependencies=[_svc])
async def admin_ops_gacha_roi(db: AsyncSession = Depends(get_session)) -> list[dict]:
    """가챠별 ROI 분석 (최근 30일)."""
    sql = sa_text("""
        SELECT
          gacha_code,
          COUNT(*) AS pulls,
          COUNT(DISTINCT user_id) AS unique_users,
          ROUND(AVG(CASE picked_rarity
            WHEN 'C' THEN 1 WHEN 'R' THEN 2 WHEN 'E' THEN 3
            WHEN 'L' THEN 4 WHEN 'M' THEN 5 END)::numeric, 2) AS avg_rarity_score,
          SUM(CASE WHEN was_pity_hit THEN 1 ELSE 0 END) AS pity_hits,
          SUM(CASE WHEN was_duplicate THEN 1 ELSE 0 END) AS duplicates,
          ROUND(
            100.0 * SUM(CASE WHEN was_duplicate THEN 1 ELSE 0 END) / COUNT(*)::numeric,
            1
          ) AS dup_rate_pct
        FROM gacha_pull_log
        WHERE pulled_at >= NOW() - INTERVAL '30 days'
        GROUP BY gacha_code
        ORDER BY pulls DESC
    """)
    result = await db.execute(sql)
    return [
        {
            "gacha_code": row.gacha_code,
            "pulls": row.pulls,
            "unique_users": row.unique_users,
            "avg_rarity_score": float(row.avg_rarity_score or 0),
            "pity_hits": row.pity_hits,
            "duplicates": row.duplicates,
            "dup_rate_pct": float(row.dup_rate_pct or 0),
        }
        for row in result.all()
    ]


@router.get("/ops/channel-ratio", dependencies=[_svc])
async def admin_ops_channel_ratio(db: AsyncSession = Depends(get_session)) -> list[dict]:
    """가챠 vs 상점 사용 비율 (최근 30일)."""
    sql = sa_text("""
        SELECT source, COUNT(*) AS purchases, COUNT(DISTINCT user_id) AS users
        FROM (
          SELECT user_id, 'GACHA' AS source
            FROM gacha_pull_log
           WHERE pulled_at >= NOW() - INTERVAL '30 days'
          UNION ALL
          SELECT user_id, 'SHOP' AS source
            FROM shop_purchase_log
           WHERE purchased_at >= NOW() - INTERVAL '30 days'
        ) t
        GROUP BY source
    """)
    result = await db.execute(sql)
    return [
        {"source": row.source, "purchases": row.purchases, "users": row.users}
        for row in result.all()
    ]


@router.get("/ops/pity-distribution", dependencies=[_svc])
async def admin_ops_pity_distribution(db: AsyncSession = Depends(get_session)) -> list[dict]:
    """천장 도달자 분포 — 도박성 보호 정책 효과 측정."""
    sql = sa_text("""
        SELECT gacha_code, pity_count, COUNT(*) AS users
        FROM user_gacha_pity
        WHERE total_pulls > 0
        GROUP BY gacha_code, pity_count
        ORDER BY gacha_code, pity_count DESC
    """)
    result = await db.execute(sql)
    return [
        {"gacha_code": row.gacha_code, "pity_count": row.pity_count, "users": row.users}
        for row in result.all()
    ]
