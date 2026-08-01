"""admin JSON API — 상점 아이템 · 일일 추천 관리 (Engine shop CRUD proxy).

`admin_legacy.py`의 동명 Jinja 라우트(1892-2069, `/admin-legacy/sre/shop` +
`/admin-legacy/sre/shop/{code}/edit` + `/admin-legacy/sre/daily-featured` +
`/admin-legacy/sre/daily-featured/refresh`)를 JSON 응답으로 이관한 것 — 목록 조회/수정/
이력 조회/갱신을 기존 engine_client.admin_get_shop_items/admin_update_shop_item/
admin_get_daily_featured_history/admin_refresh_daily_featured 그대로 재사용해
프록시한다 (Engine 무변경, 필드/검증/기본값/직렬화 무변경 — 요청 바디를 그대로 전달).
구 `/admin-legacy/sre/shop` · `/admin-legacy/sre/daily-featured` 라우트는 손대지
않고 병행 유지한다.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...engine_client import engine_client
from ._audit import audit

router = APIRouter(prefix="/shop")


@router.get("", summary="상점 아이템 목록")
async def list_shop_items(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_get_shop_items()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.put("/{item_code}", summary="상점 아이템 수정")
async def update_shop_item(
    item_code: str,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    try:
        result = await engine_client.admin_update_shop_item(item_code, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(db, session, request, "SHOP_UPDATE", "shop_item", item_code)
    await db.commit()
    return result


@router.get("/daily-featured", summary="일일 추천 이력")
async def get_daily_featured_history(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_get_daily_featured_history()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/daily-featured/refresh", summary="일일 추천 갱신")
async def refresh_daily_featured(
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    date_str = data.get("date")
    items = data.get("items") or []
    try:
        result = await engine_client.admin_refresh_daily_featured(date_str, items)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(db, session, request, "DAILY_FEATURED_REFRESH", "daily_featured", date_str, {"item_count": len(items)})
    await db.commit()
    return result
