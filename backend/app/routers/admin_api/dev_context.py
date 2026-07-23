"""admin JSON API — DEV Context (__DEV_context KV + dev Features + dev Todos).

`dev_context.py`(`/admin-legacy/dev`)를 JSON 응답으로 이관한 것 — Plane API 프록시
(`plane_client`)와 Plane 우선/DB 폴백 판단 로직(`_admin_features_from_plane` /
`_admin_todos_from_plane`)을 그대로 재사용한다 (Engine 무변경). 뮤테이션(생성/상태순환/삭제)도
레거시에서 추출한 공용 헬퍼(`do_feature_create` 등)를 그대로 호출 — 동작 무변경. 구
`/admin-legacy/dev` 라우트는 손대지 않고 병행 유지한다.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import DevFeature, DevTodo
from ...services import plane_client as plane
from ..dev_context import (
    _VALID_FEATURE_STATUS,
    _VALID_TODO_PRIORITY,
    _VALID_TODO_STATUS,
    _admin_features_from_plane,
    _admin_todos_from_plane,
    do_feature_create,
    do_feature_cycle,
    do_feature_delete,
    do_todo_create,
    do_todo_cycle,
    do_todo_delete,
)
from ._audit import audit

router = APIRouter(prefix="/dev-context")


def _feature_to_dict(f: DevFeature) -> dict:
    return {
        "id": f.id,
        "category": f.category,
        "name": f.name,
        "description": f.description,
        "status": f.status,
        "sort_order": f.sort_order,
        "created_at": f.created_at,
        "updated_at": f.updated_at,
    }


def _todo_to_dict(t: DevTodo) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "priority": t.priority,
        "status": t.status,
        "feature_id": t.feature_id,
        "feature": _feature_to_dict(t.feature) if t.feature else None,
        "due_date": t.due_date,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


# ── Context KV ──────────────────────────────────────────────────


@router.get("/context", summary="DEV Context KV 목록")
async def list_context(_session: AdminSession = Depends(verify_admin_api)):
    try:
        return await plane.list_context()
    except Exception:
        return []


@router.post("/context", status_code=201, summary="DEV Context KV 추가/수정")
async def upsert_context(
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    key = (body.get("key") or "").strip()
    value = (body.get("value") or "").strip()
    status = (body.get("status") or "").strip() or "⏸"
    result = await plane.upsert_context(key, value, status)
    await audit(db, session, request, "DEV_CONTEXT_UPSERT", "dev_context", key)
    await db.commit()
    return result


@router.post("/context/{key}/status-cycle", summary="DEV Context 상태 순환")
async def cycle_context(
    key: str,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    result = await plane.cycle_context_status(key)
    await audit(db, session, request, "DEV_CONTEXT_CYCLE", "dev_context", key)
    await db.commit()
    return result


@router.delete("/context/{key}", summary="DEV Context 삭제")
async def delete_context(
    key: str,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    deleted = await plane.delete_context(key)
    await audit(db, session, request, "DEV_CONTEXT_DELETE", "dev_context", key)
    await db.commit()
    return {"deleted": deleted}


# ── Features ────────────────────────────────────────────────────


@router.get("/features", summary="dev Features 목록")
async def list_features(
    status: str = Query(""),
    category: str = Query(""),
    db: AsyncSession = Depends(get_db),
    _session: AdminSession = Depends(verify_admin_api),
):
    plane_result = await _admin_features_from_plane(status, category)
    if plane_result is not None:
        items, total, categories = plane_result
        return {"items": items, "total": total, "categories": categories}

    stmt = select(DevFeature)
    count_stmt = select(func.count()).select_from(DevFeature)
    if status and status in _VALID_FEATURE_STATUS:
        stmt = stmt.where(DevFeature.status == status)
        count_stmt = count_stmt.where(DevFeature.status == status)
    if category:
        stmt = stmt.where(DevFeature.category == category)
        count_stmt = count_stmt.where(DevFeature.category == category)

    total = (await db.execute(count_stmt)).scalar_one()
    features = (
        (await db.execute(stmt.order_by(DevFeature.category, DevFeature.sort_order, DevFeature.id))).scalars().all()
    )
    categories = (
        (await db.execute(select(DevFeature.category).distinct().order_by(DevFeature.category))).scalars().all()
    )
    return {"items": [_feature_to_dict(f) for f in features], "total": total, "categories": categories}


@router.post("/features", status_code=201, summary="dev Feature 추가")
async def create_feature(
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    category = (body.get("category") or "").strip()
    name = (body.get("name") or "").strip()
    status = (body.get("status") or "PLANNED").strip()
    await do_feature_create(db, category, name, status)
    await audit(db, session, request, "DEV_FEATURE_CREATE", "dev_feature", name)
    await db.commit()
    return {"ok": True}


@router.post("/features/{feature_id}/cycle", summary="dev Feature 상태 순환")
async def cycle_feature(
    feature_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    await do_feature_cycle(db, feature_id)
    await audit(db, session, request, "DEV_FEATURE_CYCLE", "dev_feature", str(feature_id))
    await db.commit()
    return {"ok": True}


@router.delete("/features/{feature_id}", summary="dev Feature 삭제")
async def delete_feature(
    feature_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    await do_feature_delete(db, feature_id)
    await audit(db, session, request, "DEV_FEATURE_DELETE", "dev_feature", str(feature_id))
    await db.commit()
    return {"ok": True}


# ── Todos ───────────────────────────────────────────────────────


@router.get("/todos", summary="dev Todos 목록")
async def list_todos(
    status: str = Query(""),
    priority: str = Query(""),
    db: AsyncSession = Depends(get_db),
    _session: AdminSession = Depends(verify_admin_api),
):
    plane_result = await _admin_todos_from_plane(status, priority)
    if plane_result is not None:
        items, total = plane_result
        return {"items": items, "total": total}

    stmt = select(DevTodo)
    count_stmt = select(func.count()).select_from(DevTodo)
    if status and status in _VALID_TODO_STATUS:
        stmt = stmt.where(DevTodo.status == status)
        count_stmt = count_stmt.where(DevTodo.status == status)
    if priority and priority in _VALID_TODO_PRIORITY:
        stmt = stmt.where(DevTodo.priority == priority)
        count_stmt = count_stmt.where(DevTodo.priority == priority)

    total = (await db.execute(count_stmt)).scalar_one()
    todos = (
        (await db.execute(stmt.order_by(DevTodo.status, DevTodo.priority.desc(), DevTodo.created_at.desc())))
        .scalars()
        .all()
    )
    return {"items": [_todo_to_dict(t) for t in todos], "total": total}


@router.post("/todos", status_code=201, summary="dev Todo 추가")
async def create_todo(
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    title = (body.get("title") or "").strip()
    priority = (body.get("priority") or "MEDIUM").strip()
    feature_id = str(body.get("feature_id") or "")
    await do_todo_create(db, title, priority, feature_id)
    await audit(db, session, request, "DEV_TODO_CREATE", "dev_todo", title)
    await db.commit()
    return {"ok": True}


@router.post("/todos/{todo_id}/cycle", summary="dev Todo 상태 순환")
async def cycle_todo(
    todo_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    await do_todo_cycle(db, todo_id)
    await audit(db, session, request, "DEV_TODO_CYCLE", "dev_todo", str(todo_id))
    await db.commit()
    return {"ok": True}


@router.delete("/todos/{todo_id}", summary="dev Todo 삭제")
async def delete_todo(
    todo_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    await do_todo_delete(db, todo_id)
    await audit(db, session, request, "DEV_TODO_DELETE", "dev_todo", str(todo_id))
    await db.commit()
    return {"ok": True}
