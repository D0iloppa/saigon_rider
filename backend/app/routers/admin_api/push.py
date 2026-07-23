"""admin JSON API — FCM 푸시 관리 (Engine push 프록시).

`admin_legacy.py`의 동명 라우트(4355-4491, `/admin-legacy/push` +
`/admin-legacy/push/search-users`, `/admin-legacy/push/send`)를 JSON 응답으로
이관한 것 — 유저 검색/발송 이력/발송을 기존 engine_client.push_user_list/
push_history/send_push 그대로 재사용해 프록시한다 (Engine 무변경). 대량 발송이라
`verify_admin_session`(manager 포함)보다 좁힌 `verify_root_api`(root/admin만)로
게이트를 강화했다. `push_log_detail`/`push_badges` 서브라우트는 이번 이식 범위
밖(parity gap). 구 `/admin-legacy/push` 라우트는 손대지 않고 병행 유지한다.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...engine_client import engine_client
from ...models import User
from ._audit import audit

router = APIRouter(prefix="/push")


@router.get("/users", summary="FCM 토큰 보유 유저 검색")
async def search_push_users(
    q: str = Query(""),
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        engine_users = await engine_client.push_user_list(q=q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    uuids = [eu.get("external_user_uuid") for eu in engine_users if eu.get("external_user_uuid")]
    if uuids:
        rows = (await db.execute(select(User.id, User.nickname).where(User.id.in_(uuids)))).all()
        nick_map = {str(u.id): u.nickname for u in rows}
        for eu in engine_users:
            eu["nickname"] = nick_map.get(eu.get("external_user_uuid"), "")
    return engine_users


@router.get("/history", summary="최근 발송 이력")
async def get_push_history(
    limit: int = Query(50, ge=1, le=200),
    _session: AdminSession = Depends(verify_root_api),
):
    try:
        return await engine_client.push_history(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/send", summary="푸시 발송 (전체/개인)")
async def send_push(
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    body["sender"] = session.username
    try:
        result = await engine_client.send_push(body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(db, session, request, "PUSH_SEND", "push", None, {"mode": body.get("mode"), "title": body.get("title")})
    await db.commit()
    return result
