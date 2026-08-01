"""admin JSON API — 가챠 정의 관리 (Engine gacha definition CRUD proxy).

`admin_legacy.py`의 동명 Jinja 라우트(1769-1889, `/admin-legacy/sre/gacha` +
`/admin-legacy/sre/gacha/{code}/edit`)를 JSON 응답으로 이관한 것 — 목록 조회/수정을
기존 engine_client.admin_get_gacha_definitions/admin_update_gacha_definition 그대로
재사용해 프록시한다 (Engine 무변경, 필드/검증/기본값/직렬화 무변경 — 요청 바디를
그대로 전달). 구 `/admin-legacy/sre/gacha` 라우트는 손대지 않고 병행 유지한다.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...engine_client import engine_client
from ._audit import audit

router = APIRouter(prefix="/gacha")


@router.get("", summary="가챠 정의 목록")
async def list_gacha_definitions(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_get_gacha_definitions()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.put("/{gacha_code}", summary="가챠 정의 수정")
async def update_gacha_definition(
    gacha_code: str,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    try:
        result = await engine_client.admin_update_gacha_definition(gacha_code, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(db, session, request, "GACHA_UPDATE", "gacha", gacha_code)
    await db.commit()
    return result
