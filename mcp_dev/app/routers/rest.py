from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import DevContext, DevFeature, DevTodo
from ..schemas import (
    DevContextOut,
    DevContextUpsertRequest,
    DevFeatureCreateRequest,
    DevFeatureOut,
    DevFeatureUpdateRequest,
    DevTodoCreateRequest,
    DevTodoOut,
    DevTodoUpdateRequest,
    Page,
)

router = APIRouter(tags=["__DEV Context"])

_VALID_FEATURE_STATUS = {"PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"}
_VALID_TODO_STATUS = {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}
_VALID_TODO_PRIORITY = {"LOW", "MEDIUM", "HIGH", "URGENT"}


# ── Context ─────────────────────────────────────────────────────


@router.get("/context", response_model=list[DevContextOut])
async def list_context(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(DevContext).order_by(DevContext.key))).scalars().all()
    return rows


@router.get("/context/{key}", response_model=DevContextOut)
async def get_context(key: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(DevContext).where(DevContext.key == key))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Context key not found")
    return row


@router.put("/context", response_model=DevContextOut)
async def upsert_context(body: DevContextUpsertRequest, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(DevContext).where(DevContext.key == body.key))).scalar_one_or_none()
    if row is None:
        row = DevContext(key=body.key, value=body.value, status=body.status or "⏸", meta=body.meta)
        db.add(row)
    else:
        row.value = body.value
        if body.status is not None:
            row.status = body.status
        row.meta = body.meta
        row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/context/{key}")
async def delete_context(key: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(DevContext).where(DevContext.key == key))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Context key not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── Features ────────────────────────────────────────────────────


@router.get("/features", response_model=Page[DevFeatureOut])
async def list_features(
    category: str = "",
    status: str = "",
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
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
        (
            await db.execute(
                stmt.order_by(DevFeature.category, DevFeature.sort_order, DevFeature.id)
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    return Page(items=rows, total=total, page=page, size=size)


@router.post("/features", response_model=DevFeatureOut, status_code=201)
async def create_feature(body: DevFeatureCreateRequest, db: AsyncSession = Depends(get_db)):
    if body.status not in _VALID_FEATURE_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    row = DevFeature(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/features/{feature_id}", response_model=DevFeatureOut)
async def update_feature(feature_id: int, body: DevFeatureUpdateRequest, db: AsyncSession = Depends(get_db)):
    row = await db.get(DevFeature, feature_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in _VALID_FEATURE_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {updates['status']}")
    for k, v in updates.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/features/{feature_id}")
async def delete_feature(feature_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(DevFeature, feature_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── Todos ───────────────────────────────────────────────────────


@router.get("/todos", response_model=Page[DevTodoOut])
async def list_todos(
    status: str = "",
    priority: str = "",
    feature_id: int | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
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
        (
            await db.execute(
                stmt.order_by(DevTodo.status, DevTodo.priority.desc(), DevTodo.created_at.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    return Page(items=rows, total=total, page=page, size=size)


@router.post("/todos", response_model=DevTodoOut, status_code=201)
async def create_todo(body: DevTodoCreateRequest, db: AsyncSession = Depends(get_db)):
    if body.status not in _VALID_TODO_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    if body.priority not in _VALID_TODO_PRIORITY:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {body.priority}")
    row = DevTodo(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/todos/{todo_id}", response_model=DevTodoOut)
async def update_todo(todo_id: int, body: DevTodoUpdateRequest, db: AsyncSession = Depends(get_db)):
    row = await db.get(DevTodo, todo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in _VALID_TODO_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {updates['status']}")
    if "priority" in updates and updates["priority"] not in _VALID_TODO_PRIORITY:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {updates['priority']}")
    for k, v in updates.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(DevTodo, todo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── Summary ─────────────────────────────────────────────────────


@router.get("/summary")
async def dev_summary(db: AsyncSession = Depends(get_db)):
    context_rows = (await db.execute(select(DevContext).order_by(DevContext.key))).scalars().all()
    context = {r.key: {"value": r.value, "status": r.status} for r in context_rows}

    feature_counts = {}
    for st in _VALID_FEATURE_STATUS:
        cnt = (await db.execute(select(func.count()).where(DevFeature.status == st))).scalar_one()
        feature_counts[st] = cnt

    todo_counts = {}
    for st in _VALID_TODO_STATUS:
        cnt = (await db.execute(select(func.count()).where(DevTodo.status == st))).scalar_one()
        todo_counts[st] = cnt

    return {
        "context": context,
        "features": feature_counts,
        "todos": todo_counts,
    }
