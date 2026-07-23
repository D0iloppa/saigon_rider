"""admin JSON API — 보상 정책 관리 (Engine reward policy CRUD proxy).

`admin_legacy.py`의 동명 Jinja 라우트(2984-3040, `/admin-legacy/sre/policies` +
`/admin-legacy/api/sre/policies`)를 JSON 응답으로 이관한 것 — 목록/단건 조회/생성/
수정/삭제를 기존 engine_client.admin_get_policies/admin_get_policy/admin_create_policy/
admin_update_policy/admin_delete_policy 그대로 재사용해 프록시한다 (Engine 무변경,
필드/검증/기본값/직렬화 무변경 — 요청 바디를 그대로 전달).
구 `/admin-legacy/sre/policies` 라우트는 손대지 않고 병행 유지한다.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...engine_client import engine_client
from ._audit import audit

router = APIRouter(prefix="/reward-policies")


@router.get("", summary="보상 정책 목록")
async def list_reward_policies(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_get_policies()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/{policy_id}", summary="보상 정책 단건 조회")
async def get_reward_policy(policy_id: int, _session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_get_policy(policy_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("", status_code=201, summary="보상 정책 생성")
async def create_reward_policy(
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    try:
        result = await engine_client.admin_create_policy(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(
        db,
        session,
        request,
        "REWARD_POLICY_CREATE",
        "reward_policy",
        str(result.get("id")),
        {"policy_code": data.get("policy_code")},
    )
    await db.commit()
    return result


@router.put("/{policy_id}", summary="보상 정책 수정")
async def update_reward_policy(
    policy_id: int,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    data = await request.json()
    try:
        result = await engine_client.admin_update_policy(policy_id, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(
        db,
        session,
        request,
        "REWARD_POLICY_UPDATE",
        "reward_policy",
        str(policy_id),
        {"policy_code": data.get("policy_code")},
    )
    await db.commit()
    return result


@router.delete("/{policy_id}", summary="보상 정책 삭제")
async def delete_reward_policy(
    policy_id: int,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await engine_client.admin_delete_policy(policy_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    await audit(db, session, request, "REWARD_POLICY_DELETE", "reward_policy", str(policy_id))
    await db.commit()
    return result
