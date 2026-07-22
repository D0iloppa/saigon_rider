import logging
from datetime import UTC, datetime
from html import escape as h
from pathlib import Path

from fastapi import APIRouter, Depends, Form
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import DevFeature, DevTodo
from ..services import plane_client as plane
from .admin_legacy import AdminSession, _render_page, verify_admin_session

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "admin"

_VALID_FEATURE_STATUS = {"PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"}
_VALID_TODO_STATUS = {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}
_VALID_TODO_PRIORITY = {"LOW", "MEDIUM", "HIGH", "URGENT"}


# ── Admin HTML Pages — Plane 우선, DB 폴백 ─────────────────────

admin_router = APIRouter(prefix="/admin-legacy", tags=["관리자 (Admin)"])


def _status_pill(status: str) -> str:
    return f'<span class="pill status-{h(status)}" style="font-size:10px;">{h(status)}</span>'


async def _admin_features_from_plane(f_status: str, f_category: str):
    """Plane에서 features 조회. 실패 시 None 반환."""
    try:
        result = await plane.list_features(category=f_category, status=f_status, page=1, size=200)
        categories = await plane.get_categories()
        return result["items"], result["total"], categories
    except Exception:
        logger.warning("Plane API failed for admin features, falling back to DB", exc_info=True)
        return None


async def _admin_todos_from_plane(t_status: str, t_priority: str):
    """Plane에서 todos 조회. 실패 시 None 반환."""
    try:
        result = await plane.list_todos(status=t_status, priority=t_priority, page=1, size=200)
        return result["items"], result["total"]
    except Exception:
        logger.warning("Plane API failed for admin todos, falling back to DB", exc_info=True)
        return None


async def _admin_summary_from_plane():
    """Plane에서 summary 통계. 실패 시 None 반환."""
    try:
        return await plane.get_summary()
    except Exception:
        logger.warning("Plane API failed for admin summary, falling back to DB", exc_info=True)
        return None


@admin_router.get("/dev", include_in_schema=False)
async def admin_dev_page(
    f_status: str = "",
    f_category: str = "",
    t_status: str = "",
    t_priority: str = "",
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    # Context rows — Plane (ctx 라벨)
    try:
        ctx_list = await plane.list_context()
    except Exception:
        logger.warning("Plane API failed for admin context, using empty list", exc_info=True)
        ctx_list = []
    ctx_html = []
    for r in ctx_list:
        ctx_html.append(
            f"<tr>"
            f'<td class="kv-status">{h(r["status"] or "⏸")}</td>'
            f'<td class="kv-key">{h(r["key"])}</td>'
            f'<td class="kv-value">{h(r["value"] or "")}</td>'
            f'<td class="kv-time">{r["updated_at"][:16].replace("T", " ")}</td>'
            f'<td class="kv-actions">'
            f'<form method="post" action="/admin-legacy/dev/context/{h(r["key"])}/status-cycle" style="display:inline;">'
            f'<button type="submit" class="btn btn-ghost btn-sm" title="상태 순환">↻</button></form>'
            f'<form method="post" action="/admin-legacy/dev/context/{h(r["key"])}/delete" style="display:inline;"'
            f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
            f'<button type="submit" class="btn btn-danger btn-sm">삭제</button></form>'
            f"</td></tr>"
        )
    if not ctx_html:
        ctx_html.append('<tr><td colspan="4" class="empty">등록된 컨텍스트가 없습니다.</td></tr>')

    # Features — Plane 우선
    plane_features = await _admin_features_from_plane(f_status, f_category)
    if plane_features is not None:
        features_data, feature_total, all_categories = plane_features
        feat_html = []
        for f in features_data:
            desc_line = f"<small>{h(f['description'])}</small>" if f.get("description") else ""
            feat_html.append(
                f'<div class="item-row">'
                f'<span class="item-cat">{h(f["category"])}</span>'
                f'<span class="item-name">{h(f["name"])}{desc_line}</span>'
                f"{_status_pill(f['status'])}"
                f'<form method="post" action="/admin-legacy/dev/features/{f["id"]}/cycle" style="display:inline;">'
                f'<button type="submit" class="btn btn-ghost btn-sm" title="상태 순환">↻</button></form>'
                f'<form method="post" action="/admin-legacy/dev/features/{f["id"]}/delete" style="display:inline;"'
                f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
                f'<button type="submit" class="btn btn-danger btn-sm">×</button></form>'
                f"</div>"
            )
    else:
        # DB fallback
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
            (await db.execute(f_stmt.order_by(DevFeature.category, DevFeature.sort_order, DevFeature.id)))
            .scalars()
            .all()
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
                f'<form method="post" action="/admin-legacy/dev/features/{f.id}/cycle" style="display:inline;">'
                f'<button type="submit" class="btn btn-ghost btn-sm" title="상태 순환">↻</button></form>'
                f'<form method="post" action="/admin-legacy/dev/features/{f.id}/delete" style="display:inline;"'
                f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
                f'<button type="submit" class="btn btn-danger btn-sm">×</button></form>'
                f"</div>"
            )

    if not feat_html:
        feat_html.append('<div class="empty">등록된 기능이 없습니다.</div>')

    cat_options = "\n".join(
        f'<option value="{h(c)}" {"selected" if c == f_category else ""}>{h(c)}</option>' for c in all_categories
    )

    # Todos — Plane 우선
    plane_todos = await _admin_todos_from_plane(t_status, t_priority)
    if plane_todos is not None:
        todos_data, todo_total = plane_todos
        todo_html = []
        for t in todos_data:
            feat_label = ""
            if t.get("feature") and t["feature"].get("name"):
                feat_label = f'<span class="item-cat">{h(t["feature"]["name"])}</span>'
            due = f'<small style="color:rgba(255,255,255,.35);">~{t["due_date"]}</small>' if t.get("due_date") else ""
            todo_html.append(
                f'<div class="item-row">'
                f'<span class="priority-{h(t["priority"])}" style="font-size:10px;width:52px;">{h(t["priority"])}</span>'
                f'<span class="item-name">{h(t["title"])}{due}</span>'
                f"{feat_label}"
                f"{_status_pill(t['status'])}"
                f'<form method="post" action="/admin-legacy/dev/todos/{t["id"]}/cycle" style="display:inline;">'
                f'<button type="submit" class="btn btn-ghost btn-sm" title="상태 순환">↻</button></form>'
                f'<form method="post" action="/admin-legacy/dev/todos/{t["id"]}/delete" style="display:inline;"'
                f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
                f'<button type="submit" class="btn btn-danger btn-sm">×</button></form>'
                f"</div>"
            )
        # Feature select for todo form — from Plane categories
        feat_select = ""
    else:
        # DB fallback
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
                f'<form method="post" action="/admin-legacy/dev/todos/{t.id}/cycle" style="display:inline;">'
                f'<button type="submit" class="btn btn-ghost btn-sm" title="상태 순환">↻</button></form>'
                f'<form method="post" action="/admin-legacy/dev/todos/{t.id}/delete" style="display:inline;"'
                f" onsubmit=\"return confirm('삭제하시겠습니까?');\">"
                f'<button type="submit" class="btn btn-danger btn-sm">×</button></form>'
                f"</div>"
            )
        all_features = (
            (await db.execute(select(DevFeature).order_by(DevFeature.category, DevFeature.name))).scalars().all()
        )
        feat_select = "\n".join(f'<option value="{f.id}">[{h(f.category)}] {h(f.name)}</option>' for f in all_features)

    if not todo_html:
        todo_html.append('<div class="empty">등록된 TODO가 없습니다.</div>')

    # Summary stats — Plane 우선
    plane_summary = await _admin_summary_from_plane()
    if plane_summary is not None:
        total_features = sum(plane_summary["features"].values())
        done_features = plane_summary["features"].get("DONE", 0)
        ip_features = plane_summary["features"].get("IN_PROGRESS", 0)
        total_todos = sum(plane_summary["todos"].values())
        blocked_todos = plane_summary["todos"].get("BLOCKED", 0)
    else:
        total_features = (await db.execute(select(func.count()).select_from(DevFeature))).scalar_one()
        done_features = (await db.execute(select(func.count()).where(DevFeature.status == "DONE"))).scalar_one()
        ip_features = (await db.execute(select(func.count()).where(DevFeature.status == "IN_PROGRESS"))).scalar_one()
        total_todos = (await db.execute(select(func.count()).select_from(DevTodo))).scalar_one()
        blocked_todos = (await db.execute(select(func.count()).where(DevTodo.status == "BLOCKED"))).scalar_one()

    stats_html = (
        f'<div class="stat-box"><div class="stat-num">{len(ctx_list)}</div><div class="stat-label">Context</div></div>'
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
        context_count=str(len(ctx_list)),
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


# ── Admin form actions — Plane 우선, DB 폴백 ──────────────────


@admin_router.post("/dev/context", include_in_schema=False)
async def admin_dev_context_upsert(
    session: AdminSession = Depends(verify_admin_session),
    key: str = Form(...),
    value: str = Form(""),
    status: str = Form("⏸"),
):
    await plane.upsert_context(key.strip(), value.strip(), status.strip() or "⏸")
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


@admin_router.post("/dev/context/{key}/status-cycle", include_in_schema=False)
async def admin_dev_context_status_cycle(
    key: str,
    session: AdminSession = Depends(verify_admin_session),
):
    await plane.cycle_context_status(key)
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


@admin_router.post("/dev/context/{key}/delete", include_in_schema=False)
async def admin_dev_context_delete(
    key: str,
    session: AdminSession = Depends(verify_admin_session),
):
    await plane.delete_context(key)
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


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
    try:
        await plane.create_issue(name.strip(), state=status, label=category.strip())
        return RedirectResponse(url="/admin-legacy/dev", status_code=302)
    except Exception:
        logger.warning("Plane API failed for admin_dev_feature_create, falling back to DB", exc_info=True)

    db.add(DevFeature(category=category.strip(), name=name.strip(), status=status))
    await db.commit()
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


_FEATURE_STATUS_CYCLE = ["PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"]


@admin_router.post("/dev/features/{feature_id}/cycle", include_in_schema=False)
async def admin_dev_feature_cycle(
    feature_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    try:
        issue = await plane.get_issue_by_sequence_id(feature_id)
        if issue:
            current = plane._state_to_status(issue["state"])
            await plane.cycle_feature_status(issue["id"], current)
            return RedirectResponse(url="/admin-legacy/dev", status_code=302)
    except Exception:
        logger.warning("Plane API failed for admin_dev_feature_cycle, falling back to DB", exc_info=True)

    row = await db.get(DevFeature, feature_id)
    if row:
        idx = _FEATURE_STATUS_CYCLE.index(row.status) if row.status in _FEATURE_STATUS_CYCLE else 0
        row.status = _FEATURE_STATUS_CYCLE[(idx + 1) % len(_FEATURE_STATUS_CYCLE)]
        row.updated_at = datetime.now(UTC)
        await db.commit()
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


@admin_router.post("/dev/features/{feature_id}/delete", include_in_schema=False)
async def admin_dev_feature_delete(
    feature_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    try:
        issue = await plane.get_issue_by_sequence_id(feature_id)
        if issue:
            await plane.delete_issue(issue["id"])
            return RedirectResponse(url="/admin-legacy/dev", status_code=302)
    except Exception:
        logger.warning("Plane API failed for admin_dev_feature_delete, falling back to DB", exc_info=True)

    row = await db.get(DevFeature, feature_id)
    if row:
        await db.delete(row)
        await db.commit()
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


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
    try:
        await plane.create_issue(title.strip(), priority=priority)
        return RedirectResponse(url="/admin-legacy/dev", status_code=302)
    except Exception:
        logger.warning("Plane API failed for admin_dev_todo_create, falling back to DB", exc_info=True)

    fid = int(feature_id) if feature_id else None
    db.add(DevTodo(title=title.strip(), priority=priority, feature_id=fid))
    await db.commit()
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


_TODO_STATUS_CYCLE = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]


@admin_router.post("/dev/todos/{todo_id}/cycle", include_in_schema=False)
async def admin_dev_todo_cycle(
    todo_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    try:
        issue = await plane.get_issue_by_sequence_id(todo_id)
        if issue:
            current = plane._state_to_status(issue["state"])
            await plane.cycle_todo_status(issue["id"], current)
            return RedirectResponse(url="/admin-legacy/dev", status_code=302)
    except Exception:
        logger.warning("Plane API failed for admin_dev_todo_cycle, falling back to DB", exc_info=True)

    row = await db.get(DevTodo, todo_id)
    if row:
        idx = _TODO_STATUS_CYCLE.index(row.status) if row.status in _TODO_STATUS_CYCLE else 0
        row.status = _TODO_STATUS_CYCLE[(idx + 1) % len(_TODO_STATUS_CYCLE)]
        row.updated_at = datetime.now(UTC)
        await db.commit()
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)


@admin_router.post("/dev/todos/{todo_id}/delete", include_in_schema=False)
async def admin_dev_todo_delete(
    todo_id: int,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    try:
        issue = await plane.get_issue_by_sequence_id(todo_id)
        if issue:
            await plane.delete_issue(issue["id"])
            return RedirectResponse(url="/admin-legacy/dev", status_code=302)
    except Exception:
        logger.warning("Plane API failed for admin_dev_todo_delete, falling back to DB", exc_info=True)

    row = await db.get(DevTodo, todo_id)
    if row:
        await db.delete(row)
        await db.commit()
    return RedirectResponse(url="/admin-legacy/dev", status_code=302)
