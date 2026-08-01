from datetime import UTC, datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from .. import plane_client as plane
from ..models import DevFeature, DevTodo
from ..schemas import (
    DevContextUpsertRequest,
    DevFeatureCreateRequest,
    DevFeatureOut,
    DevFeatureUpdateRequest,
    DevTodoCreateRequest,
    DevTodoOut,
    DevTodoUpdateRequest,
    Page,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["__DEV Context"])

_VALID_FEATURE_STATUS = {"PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"}
_VALID_TODO_STATUS = {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}
_VALID_TODO_PRIORITY = {"LOW", "MEDIUM", "HIGH", "URGENT"}


# ── Context (key-value) — Plane (ctx 라벨) ──────────────────────


@router.get("/context")
async def list_context():
    return await plane.list_context()


@router.get("/context/{key}")
async def get_context(key: str):
    ctx = await plane.get_context(key)
    if ctx is None:
        raise HTTPException(status_code=404, detail="Context key not found")
    return ctx


@router.put("/context")
async def upsert_context(body: DevContextUpsertRequest):
    return await plane.upsert_context(body.key, body.value or "", body.status or "⏸")


@router.delete("/context/{key}")
async def delete_context(key: str):
    ok = await plane.delete_context(key)
    if not ok:
        raise HTTPException(status_code=404, detail="Context key not found")
    return {"ok": True}


# ── Features — Plane 우선, DB 폴백 ─────────────────────────────


@router.get("/features", response_model=Page[DevFeatureOut])
async def list_features(
    category: str = "",
    status: str = "",
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await plane.list_features(category=category, status=status, page=page, size=size)
    except Exception:
        logger.warning("Plane API failed for list_features, falling back to DB", exc_info=True)

    stmt = select(DevFeature)
    count_stmt = select(func.count()).select_from(DevFeature)
    if category:
        stmt = stmt.where(DevFeature.category == category)
        count_stmt = count_stmt.where(DevFeature.category == category)
    if status and status in _VALID_FEATURE_STATUS:
        stmt = stmt.where(DevFeature.status == status)
        count_stmt = count_stmt.where(DevFeature.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (
        (await db.execute(
            stmt.order_by(DevFeature.category, DevFeature.sort_order, DevFeature.id)
            .offset((page - 1) * size).limit(size)
        )).scalars().all()
    )
    return Page(items=rows, total=total, page=page, size=size)


@router.post("/features", response_model=DevFeatureOut, status_code=201)
async def create_feature(body: DevFeatureCreateRequest, db: AsyncSession = Depends(get_db)):
    if body.status not in _VALID_FEATURE_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    try:
        issue = await plane.create_issue(body.name, description=body.description, state=body.status, label=body.category)
        return plane._issue_to_feature(issue)
    except Exception:
        logger.warning("Plane API failed for create_feature, falling back to DB", exc_info=True)

    row = DevFeature(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/features/{feature_id}", response_model=DevFeatureOut)
async def update_feature(feature_id: int, body: DevFeatureUpdateRequest, db: AsyncSession = Depends(get_db)):
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in _VALID_FEATURE_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {updates['status']}")

    try:
        issue = await plane.get_issue_by_sequence_id(feature_id)
        if issue:
            result = await plane.update_issue(issue["id"], **updates)
            if result:
                return plane._issue_to_feature(result)
    except Exception:
        logger.warning("Plane API failed for update_feature, falling back to DB", exc_info=True)

    row = await db.get(DevFeature, feature_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    for k, v in updates.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/features/{feature_id}")
async def delete_feature(feature_id: int, db: AsyncSession = Depends(get_db)):
    try:
        issue = await plane.get_issue_by_sequence_id(feature_id)
        if issue:
            await plane.delete_issue(issue["id"])
            return {"ok": True}
    except Exception:
        logger.warning("Plane API failed for delete_feature, falling back to DB", exc_info=True)

    row = await db.get(DevFeature, feature_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── Todos — Plane 우선, DB 폴백 ────────────────────────────────


@router.get("/todos", response_model=Page[DevTodoOut])
async def list_todos(
    status: str = "",
    priority: str = "",
    feature_id: int | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await plane.list_todos(status=status, priority=priority, page=page, size=size)
    except Exception:
        logger.warning("Plane API failed for list_todos, falling back to DB", exc_info=True)

    stmt = select(DevTodo)
    count_stmt = select(func.count()).select_from(DevTodo)
    if status and status in _VALID_TODO_STATUS:
        stmt = stmt.where(DevTodo.status == status)
        count_stmt = count_stmt.where(DevTodo.status == status)
    if priority and priority in _VALID_TODO_PRIORITY:
        stmt = stmt.where(DevTodo.priority == priority)
        count_stmt = count_stmt.where(DevTodo.priority == priority)
    if feature_id is not None:
        stmt = stmt.where(DevTodo.feature_id == feature_id)
        count_stmt = count_stmt.where(DevTodo.feature_id == feature_id)

    total = (await db.execute(count_stmt)).scalar_one()
    rows = (
        (await db.execute(
            stmt.order_by(DevTodo.status, DevTodo.priority.desc(), DevTodo.created_at.desc())
            .offset((page - 1) * size).limit(size)
        )).scalars().all()
    )
    return Page(items=rows, total=total, page=page, size=size)


@router.post("/todos", response_model=DevTodoOut, status_code=201)
async def create_todo(body: DevTodoCreateRequest, db: AsyncSession = Depends(get_db)):
    if body.status not in _VALID_TODO_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    if body.priority not in _VALID_TODO_PRIORITY:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {body.priority}")
    try:
        issue = await plane.create_issue(
            body.title, description=body.description, state=body.status, priority=body.priority,
            due_date=str(body.due_date) if body.due_date else None,
        )
        return plane._issue_to_todo(issue)
    except Exception:
        logger.warning("Plane API failed for create_todo, falling back to DB", exc_info=True)

    row = DevTodo(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/todos/{todo_id}", response_model=DevTodoOut)
async def update_todo(todo_id: int, body: DevTodoUpdateRequest, db: AsyncSession = Depends(get_db)):
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in _VALID_TODO_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {updates['status']}")
    if "priority" in updates and updates["priority"] not in _VALID_TODO_PRIORITY:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {updates['priority']}")

    plane_updates = {}
    if "title" in updates:
        plane_updates["name"] = updates.pop("title")
    if "due_date" in updates:
        plane_updates["due_date"] = str(updates.pop("due_date")) if updates["due_date"] else None
    plane_updates.update(updates)

    try:
        issue = await plane.get_issue_by_sequence_id(todo_id)
        if issue:
            result = await plane.update_issue(issue["id"], **plane_updates)
            if result:
                return plane._issue_to_todo(result)
    except Exception:
        logger.warning("Plane API failed for update_todo, falling back to DB", exc_info=True)

    row = await db.get(DevTodo, todo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    orig_updates = body.model_dump(exclude_unset=True)
    for k, v in orig_updates.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: int, db: AsyncSession = Depends(get_db)):
    try:
        issue = await plane.get_issue_by_sequence_id(todo_id)
        if issue:
            await plane.delete_issue(issue["id"])
            return {"ok": True}
    except Exception:
        logger.warning("Plane API failed for delete_todo, falling back to DB", exc_info=True)

    row = await db.get(DevTodo, todo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── Summary — Plane 전용 ───────────────────────────────────────


@router.get("/summary")
async def dev_summary():
    context_list = await plane.list_context()
    context = {c["key"]: {"value": c["value"], "status": c["status"]} for c in context_list}
    plane_summary = await plane.get_summary()
    return {"context": context, **plane_summary}
