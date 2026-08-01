"""admin JSON API — 아이템 관리 (Engine item definition CRUD proxy).

`admin_legacy.py`의 동명 Jinja 라우트(2142-2485, `/admin-legacy/sre/items` +
`/admin-legacy/sre/items/{new,edit,delete}`)를 JSON 응답으로 이관한 것 — 목록/단건 조회/
생성/수정/삭제를 기존 engine_client.admin_get_items/admin_get_item/admin_create_item/
admin_update_item/admin_delete_item 그대로 재사용해 프록시한다 (Engine 무변경,
필드/검증/기본값/직렬화 무변경 — 요청 바디를 그대로 전달).
구 `/admin-legacy/sre/items` 라우트는 손대지 않고 병행 유지한다.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...engine_client import engine_client
from ._audit import audit

router = APIRouter(prefix="/items")


@router.get("", summary="아이템 목록")
async def list_items(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_get_items()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/{item_code}", summary="아이템 단건 조회")
async def get_item(item_code: str, _session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_get_item(item_code)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("", status_code=201, summary="아이템 등록")
async def create_item(
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    if not data.get("collection_code"):
        raise HTTPException(status_code=400, detail="collection_code는 필수입니다")
    try:
        result = await engine_client.admin_create_item(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(db, session, request, "ITEM_CREATE", "item", str(data.get("item_code")))
    await db.commit()
    return result


@router.put("/{item_code}", summary="아이템 수정")
async def update_item(
    item_code: str,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    try:
        result = await engine_client.admin_update_item(item_code, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(db, session, request, "ITEM_UPDATE", "item", item_code)
    await db.commit()
    return result


@router.delete("/{item_code}", summary="아이템 삭제")
async def delete_item(
    item_code: str,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await engine_client.admin_delete_item(item_code)
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    await audit(db, session, request, "ITEM_DELETE", "item", item_code)
    await db.commit()
    return result
