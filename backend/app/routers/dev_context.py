from datetime import UTC, datetime
from html import escape as h
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import RedirectResponse
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
from .admin import AdminSession, _render_page, verify_admin_session

router = APIRouter(tags=["__DEV Context"])

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "admin"

_VALID_FEATURE_STATUS = {"PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"}
_VALID_TODO_STATUS = {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}
_VALID_TODO_PRIORITY = {"LOW", "MEDIUM", "HIGH", "URGENT"}


# ── API: Context (key-value) ────────────────────────────────────


@router.get("/dev/context", response_model=list[DevContextOut])
async def list_context(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(DevContext).order_by(DevContext.key))).scalars().all()
    return rows


@router.get("/dev/context/{key}", response_model=DevContextOut)
async def get_context(key: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(DevContext).where(DevContext.key == key))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Context key not found")
    return row


@router.put("/dev/context", response_model=DevContextOut)
async def upsert_context(body: DevContextUpsertRequest, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(DevContext).where(DevContext.key == body.key))).scalar_one_or_none()
    if row is None:
        row = DevContext(key=body.key, value=body.value, meta=body.meta)
        db.add(row)
    else:
        row.value = body.value
        row.meta = body.meta
        row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/dev/context/{key}")
async def delete_context(key: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(DevContext).where(DevContext.key == key))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Context key not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── API: Features ───────────────────────────────────────────────


@router.get("/dev/features", response_model=Page[DevFeatureOut])
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


@router.post("/dev/features", response_model=DevFeatureOut, status_code=201)
async def create_feature(body: DevFeatureCreateRequest, db: AsyncSession = Depends(get_db)):
    if body.status not in _VALID_FEATURE_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
    row = DevFeature(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/dev/features/{feature_id}", response_model=DevFeatureOut)
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


@router.delete("/dev/features/{feature_id}")
async def delete_feature(feature_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(DevFeature, feature_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── API: Todos ──────────────────────────────────────────────────


@router.get("/dev/todos", response_model=Page[DevTodoOut])
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


@router.post("/dev/todos", response_model=DevTodoOut, status_code=201)
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


@router.patch("/dev/todos/{todo_id}", response_model=DevTodoOut)
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


@router.delete("/dev/todos/{todo_id}")
async def delete_todo(todo_id: int, db: AsyncSession = Depends(get_db)):
    row = await db.get(DevTodo, todo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ── API: Summary (위키/대시보드 용 통합 조회) ───────────────────


@router.get("/dev/summary")
async def dev_summary(db: AsyncSession = Depends(get_db)):
    context_rows = (await db.execute(select(DevContext).order_by(DevContext.key))).scalars().all()
    context = {r.key: r.value for r in context_rows}

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


# ── Admin HTML Pages ────────────────────────────────────────────

admin_router = APIRouter(prefix="/admin", tags=["관리자 (Admin)"])


def _status_pill(status: str) -> str:
    return f'<span class="pill status-{h(status)}" style="font-size:10px;">{h(status)}</span>'


@admin_router.get("/dev", include_in_schema=False)
async def admin_dev_page(
    f_status: str = "",
    f_category: str = "",
    t_status: str = "",
    t_priority: str = "",
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    # Context rows
    ctx_rows = (await db.execute(select(DevContext).order_by(DevContext.key))).scalars().all()
    ctx_html = []
    for r in ctx_rows:
        ctx_html.append(
            f"<tr>"
            f'<td class="kv-key">{h(r.key)}</td>'
            f'<td class="kv-value">{h(r.value or "")}</td>'
            f'<td class="kv-time">{r.updated_at.strftime("%m-%d %H:%M")}</td>'
            f'<td class="kv-actions">'
            f'<form method="post" action="/admin/dev/context/{h(r.key)}/delete" style="display:inline;"'
            f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
            f'<button type="submit" class="btn btn-danger btn-sm">삭제</button></form>'
            f"</td></tr>"
        )
    if not ctx_html:
        ctx_html.append('<tr><td colspan="4" class="empty">등록된 컨텍스트가 없습니다.</td></tr>')

    # Features
    f_stmt = select(DevFeature)
    f_count_stmt = select(func.count()).select_from(DevFeature)
    if f_status and f_status in _VALID_FEATURE_STATUS:
        f_stmt = f_stmt.where(DevFeature.status == f_status)
        f_count_stmt = f_count_stmt.where(DevFeature.status == f_status)
    if f_category:
        f_stmt = f_stmt.where(DevFeature.category == f_category)
        f_count_stmt = f_count_stmt.where(DevFeature.category == f_category)

    feature_total = (await db.execute(f_count_stmt)).scalar_one()
    features = (
        (await db.execute(f_stmt.order_by(DevFeature.category, DevFeature.sort_order, DevFeature.id))).scalars().all()
    )

    all_categories = (
        (await db.execute(select(DevFeature.category).distinct().order_by(DevFeature.category))).scalars().all()
    )

    feat_html = []
    for f in features:
        desc_line = f"<small>{h(f.description)}</small>" if f.description else ""
        feat_html.append(
            f'<div class="item-row">'
            f'<span class="item-cat">{h(f.category)}</span>'
            f'<span class="item-name">{h(f.name)}{desc_line}</span>'
            f"{_status_pill(f.status)}"
            f'<form method="post" action="/admin/dev/features/{f.id}/cycle" style="display:inline;">'
            f'<button type="submit" class="btn btn-ghost btn-sm" title="상태 순환">↻</button></form>'
            f'<form method="post" action="/admin/dev/features/{f.id}/delete" style="display:inline;"'
            f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
            f'<button type="submit" class="btn btn-danger btn-sm">×</button></form>'
            f"</div>"
        )
    if not feat_html:
        feat_html.append('<div class="empty">등록된 기능이 없습니다.</div>')

    cat_options = "\n".join(
        f'<option value="{h(c)}" {"selected" if c == f_category else ""}>{h(c)}</option>' for c in all_categories
    )

    # Todos
    t_stmt = select(DevTodo)
    t_count_stmt = select(func.count()).select_from(DevTodo)
    if t_status and t_status in _VALID_TODO_STATUS:
        t_stmt = t_stmt.where(DevTodo.status == t_status)
        t_count_stmt = t_count_stmt.where(DevTodo.status == t_status)
    if t_priority and t_priority in _VALID_TODO_PRIORITY:
        t_stmt = t_stmt.where(DevTodo.priority == t_priority)
        t_count_stmt = t_count_stmt.where(DevTodo.priority == t_priority)

    todo_total = (await db.execute(t_count_stmt)).scalar_one()
    todos = (
        (await db.execute(t_stmt.order_by(DevTodo.status, DevTodo.priority.desc(), DevTodo.created_at.desc())))
        .scalars()
        .all()
    )

    todo_html = []
    for t in todos:
        feat_label = ""
        if t.feature:
            feat_label = f'<span class="item-cat">{h(t.feature.name)}</span>'
        due = f'<small style="color:rgba(255,255,255,.35);">~{t.due_date}</small>' if t.due_date else ""
        todo_html.append(
            f'<div class="item-row">'
            f'<span class="priority-{h(t.priority)}" style="font-size:10px;width:52px;">{h(t.priority)}</span>'
            f'<span class="item-name">{h(t.title)}{due}</span>'
            f"{feat_label}"
            f"{_status_pill(t.status)}"
            f'<form method="post" action="/admin/dev/todos/{t.id}/cycle" style="display:inline;">'
            f'<button type="submit" class="btn btn-ghost btn-sm" title="상태 순환">↻</button></form>'
            f'<form method="post" action="/admin/dev/todos/{t.id}/delete" style="display:inline;"'
            f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
            f'<button type="submit" class="btn btn-danger btn-sm">×</button></form>'
            f"</div>"
        )
    if not todo_html:
        todo_html.append('<div class="empty">등록된 TODO가 없습니다.</div>')

    # Feature select for todo form
    all_features = (await db.execute(select(DevFeature).order_by(DevFeature.category, DevFeature.name))).scalars().all()
    feat_select = "\n".join(f'<option value="{f.id}">[{h(f.category)}] {h(f.name)}</option>' for f in all_features)

    # Summary stats
    total_features = (await db.execute(select(func.count()).select_from(DevFeature))).scalar_one()
    done_features = (await db.execute(select(func.count()).where(DevFeature.status == "DONE"))).scalar_one()
    ip_features = (await db.execute(select(func.count()).where(DevFeature.status == "IN_PROGRESS"))).scalar_one()
    total_todos = (await db.execute(select(func.count()).select_from(DevTodo))).scalar_one()
    blocked_todos = (await db.execute(select(func.count()).where(DevTodo.status == "BLOCKED"))).scalar_one()

    stats_html = (
        f'<div class="stat-box"><div class="stat-num">{len(ctx_rows)}</div><div class="stat-label">Context</div></div>'
        f'<div class="stat-box"><div class="stat-num">{total_features}</div><div class="stat-label">Features</div></div>'
        f'<div class="stat-box"><div class="stat-num" style="color:#ff9933;">{ip_features}</div><div class="stat-label">In Progress</div></div>'
        f'<div class="stat-box"><div class="stat-num" style="color:#68d391;">{done_features}</div><div class="stat-label">Done</div></div>'
        f'<div class="stat-box"><div class="stat-num">{total_todos}</div><div class="stat-label">Todos</div></div>'
        f'<div class="stat-box"><div class="stat-num" style="color:#fc8181;">{blocked_todos}</div><div class="stat-label">Blocked</div></div>'
    )

    def sel(key, val, cur):
        return "selected" if cur == val else ""

    return _render_page(
        "dev_context.html",
        nav="dev",
        page_title="DEV Context",
        session=session,
        summary_stats=stats_html,
        context_rows="\n".join(ctx_html),
        context_count=str(len(ctx_rows)),
        feature_rows="\n".join(feat_html),
        feature_count=str(feature_total),
        todo_rows="\n".join(todo_html),
        todo_count=str(todo_total),
        category_options=cat_options,
        feature_select_options=feat_select,
        sel_f_PLANNED=sel("f_status", "PLANNED", f_status),
        sel_f_IN_PROGRESS=sel("f_status", "IN_PROGRESS", f_status),
        sel_f_DONE=sel("f_status", "DONE", f_status),
        sel_f_DEFERRED=sel("f_status", "DEFERRED", f_status),
        sel_t_TODO=sel("t_status", "TODO", t_status),
        sel_t_IN_PROGRESS=sel("t_status", "IN_PROGRESS", t_status),
        sel_t_DONE=sel("t_status", "DONE", t_status),
        sel_t_BLOCKED=sel("t_status", "BLOCKED", t_status),
        sel_t_URGENT=sel("t_priority", "URGENT", t_priority),
        sel_t_HIGH=sel("t_priority", "HIGH", t_priority),
        sel_t_MEDIUM=sel("t_priority", "MEDIUM", t_priority),
        sel_t_LOW=sel("t_priority", "LOW", t_priority),
    )


# ── Admin form actions ──────────────────────────────────────────


@admin_router.post("/dev/context", include_in_schema=False)
async def admin_dev_context_upsert(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    key: str = Form(...),
    value: str = Form(""),
):
    row = (await db.execute(select(DevContext).where(DevContext.key == key.strip()))).scalar_one_or_none()
    if row is None:
        row = DevContext(key=key.strip(), value=value.strip() or None)
        db.add(row)
    else:
        row.value = value.strip() or None
        row.updated_at = datetime.now(UTC)
    await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)


@admin_router.post("/dev/context/{key}/delete", include_in_schema=False)
async def admin_dev_context_delete(
    key: str,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(select(DevContext).where(DevContext.key == key))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)


@admin_router.post("/dev/features", include_in_schema=False)
async def admin_dev_feature_create(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    category: str = Form(...),
    name: str = Form(...),
    status: str = Form("PLANNED"),
):
    if status not in _VALID_FEATURE_STATUS:
        status = "PLANNED"
    db.add(DevFeature(category=category.strip(), name=name.strip(), status=status))
    await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)


_FEATURE_STATUS_CYCLE = ["PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"]


@admin_router.post("/dev/features/{feature_id}/cycle", include_in_schema=False)
async def admin_dev_feature_cycle(
    feature_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(DevFeature, feature_id)
    if row:
        idx = _FEATURE_STATUS_CYCLE.index(row.status) if row.status in _FEATURE_STATUS_CYCLE else 0
        row.status = _FEATURE_STATUS_CYCLE[(idx + 1) % len(_FEATURE_STATUS_CYCLE)]
        row.updated_at = datetime.now(UTC)
        await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)


@admin_router.post("/dev/features/{feature_id}/delete", include_in_schema=False)
async def admin_dev_feature_delete(
    feature_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(DevFeature, feature_id)
    if row:
        await db.delete(row)
        await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)


@admin_router.post("/dev/todos", include_in_schema=False)
async def admin_dev_todo_create(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    title: str = Form(...),
    priority: str = Form("MEDIUM"),
    feature_id: str = Form(""),
):
    if priority not in _VALID_TODO_PRIORITY:
        priority = "MEDIUM"
    fid = int(feature_id) if feature_id else None
    db.add(DevTodo(title=title.strip(), priority=priority, feature_id=fid))
    await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)


_TODO_STATUS_CYCLE = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]


@admin_router.post("/dev/todos/{todo_id}/cycle", include_in_schema=False)
async def admin_dev_todo_cycle(
    todo_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(DevTodo, todo_id)
    if row:
        idx = _TODO_STATUS_CYCLE.index(row.status) if row.status in _TODO_STATUS_CYCLE else 0
        row.status = _TODO_STATUS_CYCLE[(idx + 1) % len(_TODO_STATUS_CYCLE)]
        row.updated_at = datetime.now(UTC)
        await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)


@admin_router.post("/dev/todos/{todo_id}/delete", include_in_schema=False)
async def admin_dev_todo_delete(
    todo_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(DevTodo, todo_id)
    if row:
        await db.delete(row)
        await db.commit()
    return RedirectResponse(url="/admin/dev", status_code=302)
